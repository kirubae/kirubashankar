"""
Perplexity API Service - AI-powered research
"""

import json
import logging
import asyncio
import httpx
from typing import Any, Optional

logger = logging.getLogger(__name__)

PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions"


async def call_perplexity(
    api_key: str,
    query: str,
    fields_config: list[dict],
    max_retries: int = 3
) -> dict[str, Any]:
    """
    Call Perplexity API to research an entity

    Args:
        api_key: Perplexity API key
        query: The research query
        fields_config: List of field configurations with name, type, description
        max_retries: Maximum retry attempts

    Returns:
        Dictionary with field values
    """
    # Build JSON schema for structured output
    properties = {}
    required = []

    for field in fields_config:
        field_name = field.get("name", "")
        field_type = field.get("type", "text")
        is_optional = field.get("optional", False)

        # Map field types to JSON schema types
        if field_type == "numeric":
            properties[field_name] = {"type": "number"}
        elif field_type == "boolean":
            properties[field_name] = {"type": "boolean"}
        elif field_type == "yes_no":
            properties[field_name] = {"type": "string", "enum": ["Yes", "No", "Unknown"]}
        elif field_type == "custom_enum":
            enum_values = field.get("enum_values", [])
            if enum_values:
                properties[field_name] = {"type": "string", "enum": enum_values}
            else:
                properties[field_name] = {"type": "string"}
        else:
            properties[field_name] = {"type": "string"}

        if not is_optional:
            required.append(field_name)

    schema = {
        "type": "object",
        "properties": properties,
        "required": required
    }

    # Retry logic
    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                response = await client.post(
                    PERPLEXITY_API_URL,
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": "sonar-pro",
                        "messages": [{"role": "user", "content": query}],
                        "response_format": {
                            "type": "json_schema",
                            "json_schema": {"schema": schema}
                        }
                    }
                )

                # Handle rate limiting
                if response.status_code == 429:
                    retry_after = int(response.headers.get("Retry-After", 5 * (attempt + 1)))
                    logger.warning(f"Rate limited, retrying in {retry_after}s...")
                    await asyncio.sleep(retry_after)
                    continue

                response.raise_for_status()

                data = response.json()
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "{}")

                try:
                    result = json.loads(content)
                    return result
                except json.JSONDecodeError:
                    logger.error(f"Failed to parse Perplexity response: {content}")
                    return {field.get("name", ""): "" for field in fields_config}

        except httpx.TimeoutException:
            wait_time = (2 ** attempt) * 5
            logger.warning(f"Timeout, retrying in {wait_time}s...")
            if attempt < max_retries - 1:
                await asyncio.sleep(wait_time)
                continue

        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error calling Perplexity: {e}")
            if attempt < max_retries - 1:
                await asyncio.sleep(5)
                continue

        except Exception as e:
            logger.error(f"Error calling Perplexity: {e}")
            if attempt < max_retries - 1:
                await asyncio.sleep(5)
                continue

    # Return empty values on failure
    return {field.get("name", ""): "" for field in fields_config}


async def process_entity_perplexity(
    api_key: str,
    entity_name: str,
    fields_config: list[dict]
) -> dict[str, Any]:
    """
    Process a single entity with Perplexity

    Args:
        api_key: Perplexity API key
        entity_name: Name of entity to research
        fields_config: Field configurations

    Returns:
        Research result dictionary
    """
    if not entity_name:
        return {"name": "", **{f.get("name", ""): "" for f in fields_config}}

    # Build query from field descriptions
    query_parts = []
    for idx, field in enumerate(fields_config, 1):
        desc = field.get("description", field.get("name"))
        query_parts.append(f"{idx}. {desc}")

    query = f"Research {entity_name} and provide:\n" + "\n".join(query_parts)

    result = await call_perplexity(api_key, query, fields_config)
    result["name"] = entity_name

    return result
