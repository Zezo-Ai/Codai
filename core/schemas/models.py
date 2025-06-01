"""Pydantic models generated from schema definitions.

These models provide strict typing and validation against the schema.
"""

from typing import List, Dict, Any, Optional, Union, Tuple
from enum import Enum
from datetime import datetime
import json
from pydantic import BaseModel, Field, field_validator, ConfigDict

from .registry import schema_registry

# Use forward references for circular dependencies between models
BlockSpan = None  # Will be defined later

# Get state and block classes from schema
state_classes = schema_registry.get_state_classes("response")
block_classes = schema_registry.get_block_classes("response")

# Create enums for state and block classes
StateClass = Enum(
    'StateClass',
    {
        'CONTENT': 'state-CONTENT',
        'TOOL_CALL': 'state-TOOL_CALL',
        'TOOL_RESULT': 'state-TOOL_RESULT',
        'THINKING': 'state-THINKING',
        'ERROR': 'state-ERROR'
    },
    type=str
)

BlockClass = Enum(
    'BlockClass',
    {
        'TEXT': 'block-tag-text',
        'RICH_TEXT': 'block-tag-rich-text',
        'CODE': 'block-tag-code',
        'TABLE': 'block-tag-table',
        'MATH': 'block-tag-math',
        'DIAGRAM': 'block-tag-diagram',
        'IMAGE': 'block-tag-image',
        'TERMINAL': 'block-tag-terminal',
        'ERROR': 'block-tag-error',
        'WARNING': 'block-tag-warning',
        'NOTE': 'block-tag-note',
        'SUCCESS': 'block-tag-success',
        'INFO': 'block-tag-info',
        'STEPS': 'block-tag-steps',
        'STEP': 'block-tag-step'
    },
    type=str
)

# Custom datetime serializer for JSON schema validation
class DateTimeEncoder(json.JSONEncoder):
    """JSON encoder that converts datetime objects to ISO format strings."""
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)

def serialize_for_schema_validation(data: Dict[str, Any]) -> Dict[str, Any]:
    """Serialize data for schema validation, converting Python objects to JSON-compatible types."""
    return json.loads(json.dumps(data, cls=DateTimeEncoder))

class ResponseBlockMetadata(BaseModel):
    """Metadata for a response block."""
    
    # Allow additional fields in metadata
    model_config = ConfigDict(extra="allow")

class StateSpan(BaseModel):
    """A state span that wraps content blocks.
    
    This represents the outer span with state classes.
    """
    state_class: str = Field(..., description="State class for the span")
    content: 'BlockSpan' = Field(..., description="Block span contained within this state span")
    id: Optional[str] = Field(default=None, description="Optional unique identifier for the state span")
    
    @field_validator('state_class')
    @classmethod
    def validate_state_class(cls, v):
        """Validate that the state class is one of the allowed values."""
        valid_states = [s.value for s in StateClass]
        if v not in valid_states:
            raise ValueError(f"State class must be one of {valid_states}")
        return v
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        result = {
            "state_class": self.state_class,
            "content": self.content.to_dict() if hasattr(self.content, 'to_dict') else self.content.model_dump()
        }
        if self.id:
            result["id"] = self.id
        return result

class BlockSpan(BaseModel):
    """A block span that contains the actual content.
    
    This represents the inner span with block classes.
    """
    block_class: str = Field(..., description="Block class for the span")
    content: Union[str, Dict[str, Any], List[Any], List['BlockSpan']] = Field(..., description="Content of the block span")
    data_attributes: Optional[Dict[str, str]] = Field(default=None, description="Data attributes for the block span")
    id: Optional[str] = Field(default=None, description="Optional unique identifier for the block span")
    
    @field_validator('block_class')
    @classmethod
    def validate_block_class(cls, v):
        """Validate that the block class is one of the allowed values."""
        valid_blocks = [b.value for b in BlockClass]
        if v not in valid_blocks:
            raise ValueError(f"Block class must be one of {valid_blocks}")
        return v
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        result = {
            "block_class": self.block_class,
            "content": self.content
        }
        if self.data_attributes:
            result["data_attributes"] = self.data_attributes
        if self.id:
            result["id"] = self.id
        return result



class ResponseMetadata(BaseModel):
    """Global metadata for the entire response."""
    timestamp: Optional[datetime] = Field(default_factory=datetime.now, description="When the response was generated")
    model: Optional[str] = Field(default=None, description="Model used to generate the response")
    tokenCount: Optional[int] = Field(default=None, description="Number of tokens used in the response")
    sessionId: Optional[str] = Field(default=None, description="Session identifier")
    
    # Allow additional fields in metadata
    model_config = ConfigDict(extra="allow")

class AIResponse(BaseModel):
    """Complete AI response model using the span-based format.
    
    This is the top-level model that corresponds to the schema.
    """
    version: str = Field(default="4.0.0", description="Schema version for compatibility")
    spans: List[StateSpan] = Field(default_factory=list, description="State spans that make up the response")
    metadata: Optional[ResponseMetadata] = Field(default_factory=ResponseMetadata, description="Global metadata for the entire response")
    
    def validate_against_schema(self) -> tuple[bool, Optional[str]]:
        """Validate this response against the schema."""
        # Convert to dict and serialize datetime objects before validation
        data = self.model_dump(exclude_none=True)
        serialized_data = serialize_for_schema_validation(data)
        return schema_registry.validate(serialized_data, "response")
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'AIResponse':
        """Create an AIResponse from a dictionary."""
        # Serialize datetime objects before validation
        serialized_data = serialize_for_schema_validation(data)
        
        # Validate against schema first
        is_valid, error = schema_registry.validate(serialized_data, "response")
        if not is_valid:
            raise ValueError(f"Invalid response data: {error}")
            
        # Convert to model - use original data which preserves datetime objects
        return cls(**data)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "version": self.version,
            "spans": [span.to_dict() if hasattr(span, 'to_dict') else span.model_dump() for span in self.spans],
            "metadata": self.metadata.model_dump(exclude_none=True) if self.metadata else None
        }
    
    def add_span(self, span: StateSpan) -> None:
        """Add a state span to the response."""
        self.spans.append(span)
    
    def add_content(self, content: str, block_class: Union[str, BlockClass] = BlockClass.TEXT, 
                   state_class: Union[str, StateClass] = StateClass.CONTENT,
                   data_attributes: Optional[Dict[str, str]] = None, 
                   span_id: Optional[str] = None) -> None:
        """Convenience method to add content with automatic span wrapping."""
        # Handle enum values
        if isinstance(block_class, BlockClass):
            block_class_value = block_class.value
        else:
            block_class_value = block_class
            
        if isinstance(state_class, StateClass):
            state_class_value = state_class.value
        else:
            state_class_value = state_class
        
        # Create inner block span
        block_span = BlockSpan(
            block_class=block_class_value,
            content=content,
            data_attributes=data_attributes,
            id=f"block-{span_id}" if span_id else None
        )
        
        # Create outer state span
        state_span = StateSpan(
            state_class=state_class_value,
            content=block_span,
            id=span_id
        )
        
        self.spans.append(state_span)
    
    def add_code_content(self, code: str, language: Optional[str] = None, 
                        state_class: Union[str, StateClass] = StateClass.CONTENT,
                        span_id: Optional[str] = None) -> None:
        """Convenience method to add code content."""
        data_attrs = {}
        if language:
            data_attrs["data-language"] = language
            
        self.add_content(
            content=code,
            block_class=BlockClass.CODE,
            state_class=state_class,
            data_attributes=data_attrs,
            span_id=span_id
        )
    
    def get_spans_by_state(self, state_class: Union[str, StateClass]) -> List[StateSpan]:
        """Get all spans of a specific state class."""
        if isinstance(state_class, StateClass):
            state_value = state_class.value
        else:
            state_value = state_class
            
        return [span for span in self.spans if span.state_class == state_value]
        
    def get_spans_by_block(self, block_class: Union[str, BlockClass]) -> List[Tuple[StateSpan, BlockSpan]]:
        """Get all spans with a specific block class."""
        if isinstance(block_class, BlockClass):
            block_value = block_class.value
        else:
            block_value = block_class
            
        result = []
        for state_span in self.spans:
            if isinstance(state_span.content, BlockSpan) and state_span.content.block_class == block_value:
                result.append((state_span, state_span.content))
                
        return result

