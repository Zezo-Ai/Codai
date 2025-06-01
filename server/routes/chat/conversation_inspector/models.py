"""Models for the Conversation Inspector module."""

from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field

class SummarizeRequest(BaseModel):
    """Request model for summarization."""
    session_id: str
    message_ids: List[str]


class SummarizeResponse(BaseModel):
    """Response model for summarization."""
    success: bool
    summary_pair: Optional[List[Dict[str, Any]]] = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class MessageResponse(BaseModel):
    """Response model for message data."""
    id: str
    role: str
    content: List[dict]
    timestamp: datetime
    metadata: dict = Field(default_factory=dict)


class DeleteRequest(BaseModel):
    """Request model for message deletion."""
    session_id: str
    message_ids: List[str]


class DeleteResponse(BaseModel):
    """Response model for deletion result."""
    success: bool
    deleted_count: int
    errors: Optional[List[str]] = None


class MessageContent(BaseModel):
    """Message content structure."""
    type: str
    text: Optional[str] = None
    language: Optional[str] = None
    source: Optional[Dict[str, Any]] = None


class MessageFormat(BaseModel):
    """Standard message format."""
    role: str
    content: List[Dict[str, Any]]


class ExportData(BaseModel):
    """Export data structure."""
    version: str
    exported_at: str
    messages: List[Dict[str, Any]]


class ExportRequest(BaseModel):
    """Request to export messages."""
    session_id: str


class ExportResponse(BaseModel):
    """Response containing exported messages."""
    success: bool
    data: Optional[ExportData] = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ImportRequest(BaseModel):
    """Request to import messages."""
    session_id: str
    data: Dict[str, Any]


class ImportResponse(BaseModel):
    """Response after importing messages."""
    success: bool
    session_id: str
    error: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)