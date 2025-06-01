"""API-related type definitions."""

from enum import StrEnum
from typing import List, Optional
from pydantic import BaseModel

class APIProvider(StrEnum):
    ANTHROPIC = "anthropic"
    BEDROCK = "bedrock"
    VERTEX = "vertex"

PROVIDER_TO_DEFAULT_MODEL_NAME: dict[APIProvider, str] = {
    APIProvider.ANTHROPIC: "claude-3-7-sonnet-20250219",
    APIProvider.BEDROCK: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    APIProvider.VERTEX: "claude-3-5-sonnet-v2@20241022",
}

class ChatMessage(BaseModel):
    """Chat message model for API requests."""
    role: str
    content: str

class ChatCompletionRequest(BaseModel):
    """Chat completion request model for API."""
    messages: List[ChatMessage]
    stream: Optional[bool] = False