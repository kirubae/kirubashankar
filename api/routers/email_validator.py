"""
Email Validation Router - MX record lookup using dnspython
"""

import logging
import asyncio
from typing import Dict, List
from fastapi import APIRouter
from pydantic import BaseModel
import dns.resolver
from cachetools import TTLCache

logger = logging.getLogger(__name__)

router = APIRouter()

# Cache MX results for 1 hour (3600 seconds)
mx_cache: TTLCache = TTLCache(maxsize=10000, ttl=3600)


class ValidateRequest(BaseModel):
    domains: List[str]


class ValidateResponse(BaseModel):
    results: Dict[str, bool]


def check_mx_record(domain: str) -> bool:
    """Check if domain has MX records using dnspython"""
    domain_lower = domain.lower().strip()

    # Check cache first
    if domain_lower in mx_cache:
        return mx_cache[domain_lower]

    try:
        # Query MX records with timeout
        resolver = dns.resolver.Resolver()
        resolver.timeout = 5
        resolver.lifetime = 10

        answers = resolver.resolve(domain_lower, 'MX')
        has_mx = len(answers) > 0

        # Cache the result
        mx_cache[domain_lower] = has_mx
        return has_mx

    except dns.resolver.NXDOMAIN:
        # Domain doesn't exist
        logger.debug(f"Domain {domain_lower} does not exist (NXDOMAIN)")
        mx_cache[domain_lower] = False
        return False

    except dns.resolver.NoAnswer:
        # Domain exists but no MX records
        logger.debug(f"Domain {domain_lower} has no MX records")
        mx_cache[domain_lower] = False
        return False

    except dns.resolver.NoNameservers:
        # No nameservers available
        logger.warning(f"No nameservers for {domain_lower}")
        # Don't cache - might be temporary
        return True  # Benefit of the doubt

    except dns.exception.Timeout:
        logger.warning(f"DNS timeout for {domain_lower}")
        # Don't cache - might be temporary
        return True  # Benefit of the doubt

    except Exception as e:
        logger.error(f"DNS error for {domain_lower}: {e}")
        # Don't cache unknown errors
        return True  # Benefit of the doubt


async def check_mx_record_async(domain: str) -> tuple[str, bool]:
    """Async wrapper for MX check"""
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, check_mx_record, domain)
    return (domain.lower().strip(), result)


@router.post("/validate", response_model=ValidateResponse)
async def validate_domains(request: ValidateRequest):
    """
    Validate MX records for a list of domains.
    Returns a dict mapping domain -> has_mx_record
    """
    # Deduplicate and lowercase
    unique_domains = list(set(d.lower().strip() for d in request.domains if d))

    logger.info(f"Validating MX records for {len(unique_domains)} domains")

    # Process in batches of 50 concurrently
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
