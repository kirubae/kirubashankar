"""
Apollo API Service - Company enrichment
"""

import re
import logging
import httpx
from typing import Any, Optional

logger = logging.getLogger(__name__)

APOLLO_API_URL = "https://api.apollo.io/api/v1/organizations/bulk_enrich"


def is_valid_domain(domain: str) -> bool:
    """Validate domain format for Apollo (no www., @, http://, etc.)"""
    if not domain:
        return False

    domain = domain.strip()

    # Check for invalid patterns
    if "www." in domain or "@" in domain:
        return False
    if domain.startswith("http://") or domain.startswith("https://"):
        return False

    # Basic domain validation
    domain_regex = r"^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}$"
    return re.match(domain_regex, domain) is not None


async def call_apollo_bulk_enrich(
    api_key: str,
    domains: list[str],
    timeout: float = 30.0
) -> list[dict[str, Any]]:
    """
    Call Apollo bulk enrich API

    Args:
        api_key: Apollo API key
        domains: List of domains to enrich
        timeout: Request timeout in seconds

    Returns:
        List of organization data
    """
    if not domains:
        return []

    try:
        # Build query params
        params = [(f"domains[]", domain) for domain in domains]

        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                APOLLO_API_URL,
                params=params,
                headers={
                    "x-api-key": api_key,
                    "Content-Type": "application/json",
                    "Cache-Control": "no-cache"
                },
                json={}
            )

            response.raise_for_status()
            data = response.json()

            organizations = data.get("organizations", [])
            logger.info(f"Apollo returned {len(organizations)} organizations")
            return organizations

    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error calling Apollo: {e}")
        return []
    except Exception as e:
        logger.error(f"Error calling Apollo: {e}")
        return []


def extract_apollo_result(org: dict[str, Any], domain: str) -> dict[str, Any]:
    """Extract standardized result from Apollo organization data"""
    return {
        "name": domain,
        "organization_name": org.get("name", ""),
        "domain": org.get("primary_domain", ""),
        "website": org.get("website_url", ""),
        "industry": org.get("industry", ""),
        "employees": org.get("estimated_num_employees", ""),
        "founded_year": org.get("founded_year", ""),
        "description": org.get("short_description", ""),
        "city": org.get("city", ""),
        "state": org.get("state", ""),
        "country": org.get("country", ""),
        "phone": org.get("phone", ""),
        "linkedin_url": org.get("linkedin_url", ""),
    }


async def process_domains_apollo(
    api_key: str,
    domains: list[str],
    cache_service=None
) -> list[dict[str, Any]]:
    """
    Process domains with Apollo bulk enrich

    Args:
        api_key: Apollo API key
        domains: List of domains to enrich
        cache_service: Optional cache service for caching results

    Returns:
        List of enrichment results
    """
    # Filter valid domains
    valid_domains = [d for d in domains if d and is_valid_domain(d)]
    if not valid_domains:
        return []

    # Check cache for each domain
    cached_results = {}
    uncached_domains = []

    if cache_service:
        for domain in valid_domains:
            cached_data = await cache_service.get("apollo_cache", domain)
            if cached_data:
                cached_results[domain] = cached_data
            else:
                uncached_domains.append(domain)
    else:
        uncached_domains = valid_domains

    logger.info(f"Apollo: {len(cached_results)} from cache, {len(uncached_domains)} need API call")

    # Call API for uncached domains
    api_results = []
    if uncached_domains:
        organizations = await call_apollo_bulk_enrich(api_key, uncached_domains)

        for org in organizations:
            domain = org.get("primary_domain", "")
            if domain and cache_service:
                await cache_service.set("apollo_cache", domain, org)
            api_results.append(org)

    # Combine results
    results = []

    # Add cached results
    for domain, org_data in cached_results.items():
        results.append(extract_apollo_result(org_data, domain))

    # Add API results
    for org in api_results:
        domain = org.get("primary_domain", "")
        results.append(extract_apollo_result(org, domain))

    return results
