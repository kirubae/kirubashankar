"""
SalesQL API Service - Contact enrichment from LinkedIn URLs
"""

import re
import logging
import asyncio
import httpx
from typing import Any, Optional

logger = logging.getLogger(__name__)

SALESQL_API_URL = "https://api-public.salesql.com/v1/persons/enrich/"


def is_valid_linkedin_url(url: str) -> bool:
    """Validate LinkedIn URL format"""
    if not url:
        return False

    url = url.strip().lower()
    linkedin_regex = r"^(https?://)?(www\.)?linkedin\.com/in/[a-zA-Z0-9_-]+/?$"
    return re.match(linkedin_regex, url, re.IGNORECASE) is not None


def normalize_linkedin_url(url: str) -> str:
    """Normalize LinkedIn URL to standard format"""
    if not url:
        return ""

    url = url.strip()

    # Remove trailing slash
    if url.endswith("/"):
        url = url[:-1]

    # Ensure it starts with http://
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "http://" + url

    # Ensure www. is present
    if "www." not in url:
        url = url.replace("linkedin.com", "www.linkedin.com")

    return url


async def call_salesql_enrich(
    api_key: str,
    linkedin_url: str,
    max_retries: int = 3
) -> Optional[dict[str, Any]]:
    """
    Call SalesQL API to enrich a contact by LinkedIn URL

    Args:
        api_key: SalesQL API key
        linkedin_url: LinkedIn profile URL
        max_retries: Maximum retry attempts

    Returns:
        Contact data or None if not found
    """
    for attempt in range(max_retries):
        try:
            logger.info(f"Calling SalesQL for {linkedin_url} (attempt {attempt + 1}/{max_retries})")

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    SALESQL_API_URL,
                    params={
                        "linkedin_url": linkedin_url,
                        "api_key": api_key
                    }
                )

                if response.status_code == 404:
                    logger.info(f"No results found for {linkedin_url}")
                    return None

                # Handle rate limiting and server errors
                if response.status_code == 429 or response.status_code >= 500:
                    if response.status_code == 429:
                        wait_time = (attempt + 1) * 10  # 10, 20, 30 seconds
                    else:
                        wait_time = (2 ** attempt) * 2  # 2, 4, 8 seconds

                    logger.warning(f"Error {response.status_code}, retrying in {wait_time}s...")
                    if attempt < max_retries - 1:
                        await asyncio.sleep(wait_time)
                        continue

                response.raise_for_status()

                result = response.json()
                logger.info(
                    f"Received data for {result.get('full_name', 'Unknown')}: "
                    f"{len(result.get('emails', []))} emails"
                )
                return result

        except httpx.TimeoutException:
            wait_time = (2 ** attempt) * 2
            logger.warning(f"Timeout, retrying in {wait_time}s...")
            if attempt < max_retries - 1:
                await asyncio.sleep(wait_time)
                continue

        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error calling SalesQL: {e}")
            return None

        except Exception as e:
            logger.error(f"Error calling SalesQL: {e}")
            if attempt < max_retries - 1:
                await asyncio.sleep(2)
                continue

    return None


def extract_salesql_result(
    person_data: Optional[dict[str, Any]],
    original_url: str
) -> list[dict[str, Any]]:
    """
    Extract standardized results from SalesQL data
    Creates one row per email address
    """
    results = []

    if person_data and person_data.get("emails"):
        for email_data in person_data["emails"]:
            org = person_data.get("organization", {}) or {}
            results.append({
                "linkedin_url": original_url,
                "full_name": person_data.get("full_name", ""),
                "first_name": person_data.get("first_name", ""),
                "last_name": person_data.get("last_name", ""),
                "title": person_data.get("title", ""),
                "headline": person_data.get("headline", ""),
                "email": email_data.get("email", ""),
                "email_type": email_data.get("type", ""),
                "email_status": email_data.get("status", ""),
                "organization_name": org.get("name", ""),
                "organization_domain": org.get("website_domain", ""),
                "location": person_data.get("location", ""),
            })
    else:
        # No emails found - still create a result row
        org = (person_data.get("organization", {}) or {}) if person_data else {}
        results.append({
            "linkedin_url": original_url,
            "full_name": person_data.get("full_name", "") if person_data else "",
            "first_name": person_data.get("first_name", "") if person_data else "",
            "last_name": person_data.get("last_name", "") if person_data else "",
            "title": person_data.get("title", "") if person_data else "",
            "headline": person_data.get("headline", "") if person_data else "",
            "email": "",
            "email_type": "",
            "email_status": "Not Found",
            "organization_name": org.get("name", ""),
            "organization_domain": org.get("website_domain", ""),
            "location": person_data.get("location", "") if person_data else "",
        })

    return results


async def process_linkedin_url_salesql(
    api_key: str,
    linkedin_url: str,
    cache_service=None
) -> list[dict[str, Any]]:
    """
    Process a single LinkedIn URL with SalesQL

    Args:
        api_key: SalesQL API key
        linkedin_url: Original LinkedIn URL
        cache_service: Optional cache service

    Returns:
        List of results (one per email)
    """
    if not linkedin_url or not is_valid_linkedin_url(linkedin_url):
        return []

    normalized_url = normalize_linkedin_url(linkedin_url)

    # Check cache
    if cache_service:
        cached_data = await cache_service.get("salesql_cache", normalized_url)
        if cached_data and cached_data.get("emails"):
            return extract_salesql_result(cached_data, linkedin_url)

    # Call API
    person_data = await call_salesql_enrich(api_key, normalized_url)

    # Cache if has emails
    if cache_service and person_data and person_data.get("emails"):
        await cache_service.set("salesql_cache", normalized_url, person_data)

    return extract_salesql_result(person_data, linkedin_url)
