from enum import StrEnum
from typing import List, Optional
from pydantic import BaseModel

class APIProvider(StrEnum):
    ANTHROPIC = "anthropic"
    BEDROCK = "bedrock"
    VERTEX = "vertex"

PROVIDER_TO_DEFAULT_MODEL_NAME: dict[APIProvider, str] = {
    APIProvider.ANTHROPIC: "claude-4-sonnet-20250514",
    APIProvider.BEDROCK: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    APIProvider.VERTEX: "claude-3-5-sonnet-v2@20241022",
}

from typing import Any, Dict
from pydantic import Field, validator

class ChatMessage(BaseModel):
    """Chat message model for API requests."""
    role: str
    content: str
    
    class Config:
        from_attributes = True
        extra = 'allow'

class ChatMetadata(BaseModel):
    """Metadata for chat requests."""
    session_id: str = Field(default='default_session', description="Session identifier")
    category: str = Field(default='system', description="Session category")
    
    class Config:
        from_attributes = True
        extra = 'allow'
        
    @validator('session_id')
    def validate_session_id(cls, v):
        if not v:
            return 'default_session'
        return v
        
    @validator('category')
    def validate_category(cls, v):
        if not v:
            return 'system'
        return v

class ChatCompletionRequest(BaseModel):
    """Chat completion request model for API."""
    messages: List[ChatMessage]
    stream: bool = Field(default=False, description="Whether to stream the response")
    metadata: ChatMetadata = Field(default_factory=ChatMetadata)
    
    class Config:
        from_attributes = True
        extra = 'allow'
        
    @validator('metadata', pre=True)
    def ensure_metadata(cls, v):
        if v is None:
            return ChatMetadata()
        if isinstance(v, dict):
            return ChatMetadata(**v)
        return v

    class Config:
        json_schema_extra = {
            "example": {
                "messages": [{"role": "user", "content": "Hello"}],
                "stream": True,
                "metadata": {
                    "session_id": "123e4567-e89b-12d3-a456-426614174000",
                    "category": "system"
                }
            }
        }