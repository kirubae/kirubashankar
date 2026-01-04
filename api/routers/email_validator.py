"""
Email Validation Router - Background job processing for bulk email validation
Uses dnspython for reliable MX lookups
"""

import uuid
import logging
import asyncio
from typing import Dict, List
from io import BytesIO
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import pandas as pd
import dns.resolver
from cachetools import TTLCache

from config import settings
from services.r2_service import get_r2_service
from jobs.job_manager import job_manager

logger = logging.getLogger(__name__)

router = APIRouter()

# Cache MX results for 1 hour (3600 seconds)
mx_cache: TTLCache = TTLCache(maxsize=50000, ttl=3600)


# ============================================
# Models
# ============================================

class ValidateRequest(BaseModel):
    domains: List[str]


class ValidateResponse(BaseModel):
    results: Dict[str, bool]


class JobRequest(BaseModel):
    r2_key: str
    email_column: str


class JobResponse(BaseModel):
    jobId: str


class JobStatusResponse(BaseModel):
    status: str
    progress: int
    message: str
    result_key: str | None = None
    stats: dict | None = None


# ============================================
# MX Validation Logic
# ============================================

def check_mx_record(domain: str) -> bool:
    """Check if domain has MX records using dnspython"""
    domain_lower = domain.lower().strip()

    # Check cache first
    if domain_lower in mx_cache:
        return mx_cache[domain_lower]

    try:
        resolver = dns.resolver.Resolver()
        resolver.timeout = 5
        resolver.lifetime = 10

        answers = resolver.resolve(domain_lower, 'MX')
        has_mx = len(answers) > 0

        mx_cache[domain_lower] = has_mx
        return has_mx

    except dns.resolver.NXDOMAIN:
        mx_cache[domain_lower] = False
        return False

    except dns.resolver.NoAnswer:
        mx_cache[domain_lower] = False
        return False

    except (dns.resolver.NoNameservers, dns.exception.Timeout):
        # Don't cache - might be temporary
        return True  # Benefit of the doubt

    except Exception as e:
        logger.error(f"DNS error for {domain_lower}: {e}")
        return True  # Benefit of the doubt


async def check_mx_record_async(domain: str) -> tuple[str, bool]:
    """Async wrapper for MX check"""
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, check_mx_record, domain)
    return (domain.lower().strip(), result)


# ============================================
# Synchronous endpoint for small batches
# ============================================

@router.post("/validate", response_model=ValidateResponse)
async def validate_domains(request: ValidateRequest):
    """Validate MX records for a list of domains (for small batches)"""
    unique_domains = list(set(d.lower().strip() for d in request.domains if d))

    logger.info(f"Validating MX records for {len(unique_domains)} domains")

    results: Dict[str, bool] = {}
    batch_size = 50

    for i in range(0, len(unique_domains), batch_size):
        batch = unique_domains[i:i + batch_size]
        tasks = [check_mx_record_async(domain) for domain in batch]
        batch_results = await asyncio.gather(*tasks)

        for domain, has_mx in batch_results:
            results[domain] = has_mx

    valid_count = sum(1 for v in results.values() if v)
    logger.info(f"MX validation complete: {valid_count}/{len(results)} valid")

    return ValidateResponse(results=results)


# ============================================
# Background job endpoints for large files
# ============================================

@router.post("/jobs", response_model=JobResponse)
async def create_validation_job(
    request: JobRequest,
    background_tasks: BackgroundTasks
):
    """Start a background email validation job"""
    r2 = get_r2_service()

    if not r2.is_available:
        raise HTTPException(status_code=503, detail="R2 storage not available")

    # Verify file exists
    if not r2.download_file(request.r2_key):
        raise HTTPException(status_code=404, detail="File not found in R2")

    # Create job
    job_id = str(uuid.uuid4())
    job_manager.create_job(job_id, job_type="email_validation")

    # Run validation in background
    background_tasks.add_task(
        run_validation_job,
        job_id,
        request.r2_key,
        request.email_column
    )

    return JobResponse(jobId=job_id)


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    """Get validation job status"""
    job = job_manager.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return JobStatusResponse(
        status=job.get("status", "unknown"),
        progress=job.get("progress", 0),
        message=job.get("message", ""),
        result_key=job.get("result_key"),
        stats=job.get("stats")
    )


@router.get("/results/{result_key:path}")
async def get_result_url(result_key: str):
    """Get presigned URL for downloading validation results"""
    r2 = get_r2_service()

    if not r2.is_available:
        raise HTTPException(status_code=503, detail="R2 storage not available")

    url = r2.generate_presigned_url(result_key, expires_in=3600)

    if not url:
        raise HTTPException(status_code=404, detail="Result not found")

    return {"downloadUrl": url}


# ============================================
# Background job processor
# ============================================

async def run_validation_job(job_id: str, r2_key: str, email_column: str):
    """Background task to validate emails in a file"""
    r2 = get_r2_service()

    try:
        job_manager.update_job(job_id, message="Downloading file...", progress=5)

        # Download file from R2
        data = r2.download_file(r2_key)
        if not data:
            raise Exception("Failed to download file from R2")

        # Read file
        job_manager.update_job(job_id, message="Reading file...", progress=10)

        if r2_key.endswith('.xlsx') or r2_key.endswith('.xls'):
            df = pd.read_excel(data)
        else:
            df = pd.read_csv(data)

        if email_column not in df.columns:
            raise Exception(f"Column '{email_column}' not found in file")

        total_rows = len(df)
        job_manager.update_job(
            job_id,
            message=f"Processing {total_rows:,} emails...",
            progress=15
        )

        # Extract emails and validate format
        email_regex = r'^[^\s@]+@[^\s@]+\.[^\s@]+$'
        df['_format_valid'] = df[email_column].astype(str).str.match(email_regex, na=False)

        # Get unique domains from valid emails
        valid_emails = df[df['_format_valid']][email_column].astype(str)
        domains = list(set(
            email.split('@')[1].lower()
            for email in valid_emails
            if '@' in email
        ))

        job_manager.update_job(
            job_id,
            message=f"Validating {len(domains):,} unique domains...",
            progress=20
        )

        # Validate MX records in batches
        mx_results: Dict[str, bool] = {}
        batch_size = 100
        total_batches = max(1, len(domains) // batch_size + (1 if len(domains) % batch_size else 0))

        for i in range(0, len(domains), batch_size):
            batch = domains[i:i + batch_size]
            batch_num = i // batch_size + 1

            # Check MX for batch
            tasks = [check_mx_record_async(domain) for domain in batch]
            batch_results = await asyncio.gather(*tasks)

            for domain, has_mx in batch_results:
                mx_results[domain] = has_mx

            # Update progress (20-80% for MX validation)
            progress = 20 + int((batch_num / total_batches) * 60)
            job_manager.update_job(
                job_id,
                message=f"Validating domains... ({batch_num}/{total_batches})",
                progress=progress
            )

        # Apply MX results to dataframe
        job_manager.update_job(job_id, message="Generating results...", progress=85)

        def get_mx_status(row):
            if not row['_format_valid']:
                return False
            email = str(row[email_column])
            if '@' not in email:
                return False
            domain = email.split('@')[1].lower()
            return mx_results.get(domain, True)

        df['_mx_valid'] = df.apply(get_mx_status, axis=1)
        df['_status'] = df.apply(
            lambda r: 'Valid' if r['_format_valid'] and r['_mx_valid']
            else ('Invalid Format' if not r['_format_valid'] else 'No MX Record'),
            axis=1
        )

        # Rename columns for output
        df = df.rename(columns={
            '_format_valid': 'Format Valid',
            '_mx_valid': 'MX Valid',
            '_status': 'Status'
        })

        # Calculate stats
        stats = {
            'total': total_rows,
            'valid': int((df['Status'] == 'Valid').sum()),
            'invalid_format': int((df['Status'] == 'Invalid Format').sum()),
            'no_mx': int((df['Status'] == 'No MX Record').sum()),
            'domains_checked': len(domains)
        }

        # Save result to R2
        job_manager.update_job(job_id, message="Uploading results...", progress=90)

        # Convert to CSV
        csv_buffer = BytesIO()
        df.to_csv(csv_buffer, index=False)
        csv_buffer.seek(0)

        # Upload to R2
        result_key = f"results/email-validation-{job_id}.csv"
        success = r2.upload_file(result_key, csv_buffer.getvalue(), "text/csv")

        if not success:
            raise Exception("Failed to upload results to R2")

        # Mark job complete
        job_manager.update_job(
            job_id,
            status="completed",
            progress=100,
            message="Validation complete",
            result_key=result_key,
            stats=stats
        )

        logger.info(f"Email validation job {job_id} completed: {stats}")

    except Exception as e:
        logger.error(f"Email validation job {job_id} failed: {e}")
        job_manager.update_job(
            job_id,
            status="failed",
            message=str(e),
            progress=0
        )
