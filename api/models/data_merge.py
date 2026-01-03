"""Pydantic models for Data Merge API"""

from pydantic import BaseModel, Field
from typing import Optional, Any
from enum import Enum


class JoinType(str, Enum):
    """Supported join types for merge operations"""
    LEFT = "left"
    RIGHT = "right"
    INNER = "inner"
    OUTER = "outer"


class FileUploadResponse(BaseModel):
    """Response from file upload endpoint"""
    success: bool
    file_id: str = Field(..., alias="fileId")
    file_name: str = Field(..., alias="fileName")
    file_type: str = Field(..., alias="fileType")
    columns: list[str]
    dtypes: dict[str, str]
    row_count: int = Field(..., alias="rowCount")
    preview: list[dict[str, Any]]
    unique_counts: dict[str, int] = Field(..., alias="uniqueCounts")

    class Config:
        populate_by_name = True


class PreviewMatchRequest(BaseModel):
    """Request for preview match endpoint"""
    file_a_id: str = Field(..., alias="fileAId")
    file_b_id: str = Field(..., alias="fileBId")
    key_a: str = Field(..., alias="keyA")
    key_b: str = Field(..., alias="keyB")

    class Config:
        populate_by_name = True


class PreviewMatchResponse(BaseModel):
    """Response from preview match endpoint"""
    success: bool
    unique_a: int = Field(..., alias="uniqueA")
    unique_b: int = Field(..., alias="uniqueB")
    match_count: int = Field(..., alias="matchCount")
    match_percent: float = Field(..., alias="matchPercent")

    class Config:
        populate_by_name = True


class MergeRequest(BaseModel):
    """Request for merge endpoint"""
    file_a_id: str = Field(..., alias="fileAId")
    file_b_id: str = Field(..., alias="fileBId")
    join_type: JoinType = Field(JoinType.LEFT, alias="joinType")
    left_key: str = Field(..., alias="leftKey")
    right_key: str = Field(..., alias="rightKey")
    selected_columns: Optional[list[str]] = Field(None, alias="selectedColumns")

    class Config:
        populate_by_name = True


class MergeJobResponse(BaseModel):
    """Response from merge job creation"""
    job_id: str = Field(..., alias="jobId")

    class Config:
        populate_by_name = True


class MergeStats(BaseModel):
    """Statistics from a completed merge operation"""
    left_rows: int = Field(..., alias="leftRows")
    right_rows: int = Field(..., alias="rightRows")
    output_rows: int = Field(..., alias="outputRows")
    matched: int
    left_only: int = Field(..., alias="leftOnly")
    right_only: int = Field(..., alias="rightOnly")
    join_type: str = Field(..., alias="joinType")

    class Config:
        populate_by_name = True


class JobStatusResponse(BaseModel):
    """Response from job status endpoint"""
    status: str  # "processing", "complete", "error"
    progress: int = 0
    message: str
    created: str
    result_id: Optional[str] = Field(None, alias="resultId")
    stats: Optional[MergeStats] = None
    columns: Optional[list[str]] = None
    preview: Optional[list[dict[str, Any]]] = None

    class Config:
        populate_by_name = True


class ErrorResponse(BaseModel):
    """Standard error response"""
    error: str
