"""Pydantic models for Deep Search API"""

from pydantic import BaseModel, Field
from typing import Optional, Any
from enum import Enum


class ResearchType(str, Enum):
    """Supported research types"""
    PERPLEXITY = "perplexity"


class FieldType(str, Enum):
    """Available field types for Perplexity research"""
    TEXT = "text"
    NUMERIC = "numeric"
    YES_NO = "yes_no"
    URL = "url"
    BOOLEAN = "boolean"
    CUSTOM_ENUM = "custom_enum"


# Field type descriptions
FIELD_TYPES = {
    "text": "Text (any string)",
    "numeric": "Number (integer or decimal)",
    "yes_no": "Yes/No/Unknown",
    "url": "Website URL",
    "boolean": "True/False",
    "custom_enum": "Custom dropdown (define options)",
}


class ResearchField(BaseModel):
    """Configuration for a research field"""
    name: str
    type: FieldType = FieldType.TEXT
    description: Optional[str] = None
    optional: bool = False
    enum_values: Optional[list[str]] = None


class CSVUploadRequest(BaseModel):
    """Request for CSV upload"""
    has_header: bool = False
    research_type: ResearchType = ResearchType.PERPLEXITY


class CSVUploadResponse(BaseModel):
    """Response from CSV upload endpoint"""
    total_rows: int
    sample_data: list[list[str]]
    has_header: bool
    validation: Optional[dict[str, int]] = None


class SetResearchTypeRequest(BaseModel):
    """Request to set research type"""
    research_type: ResearchType


class SetResearchTypeResponse(BaseModel):
    """Response from set research type"""
    success: bool
    research_type: str


class RunResearchRequest(BaseModel):
    """Request to run research"""
    fields: Optional[list[ResearchField]] = None
    csv_data: list[list[str]]
    research_type: ResearchType = ResearchType.PERPLEXITY


class ResearchProgress(BaseModel):
    """Current research progress"""
    total: int
    completed: int
    batches_total: int
    batches_completed: int


class ResultsStreamResponse(BaseModel):
    """Response for results streaming"""
    results: list[dict[str, Any]]
    total: int


class ResearchResult(BaseModel):
    """Final research result"""
    success: bool
    total_processed: int
    file_path: str
    results: list[dict[str, Any]]


class RunHistoryEntry(BaseModel):
    """A single run in history"""
    id: str
    timestamp: str
    research_type: str
    total_records: int
    results_count: int
    status: str
    filename: Optional[str] = None


class CacheStats(BaseModel):
    """Cache statistics"""
    gcs_enabled: bool
    bucket: Optional[str] = None


class HistoryResponse(BaseModel):
    """Response from history endpoint"""
    runs: list[RunHistoryEntry]
    cache_stats: CacheStats


class DeleteRunsRequest(BaseModel):
    """Request to delete runs"""
    ids: list[str]


class DeleteRunsResponse(BaseModel):
    """Response from delete runs"""
    success: bool
    deleted_count: int


class StopResearchResponse(BaseModel):
    """Response from stop research"""
    success: bool
    message: str
