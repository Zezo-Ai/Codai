"""Standardized message schema and validation for the Conversation Inspector."""

import json
import traceback
from typing import List, Dict, Any, Optional, Tuple, Union
from datetime import datetime
from debug.debug_logger import debug

class MessageValidator:
    """Validates and normalizes message structures."""
    
    @staticmethod
    def validate_role(role: str) -> Tuple[bool, str, str]:
        """
        Validate and normalize role.
        
        Args:
            role: The role to validate
            
        Returns:
            Tuple of (is_valid, normalized_role, error_message)
        """
        valid_roles = ["user", "assistant", "system"]
        normalized_role = role.lower() if isinstance(role, str) else "unknown"
        
        if normalized_role in valid_roles:
            return True, normalized_role, ""
        else:
            if not isinstance(role, str):
                return False, "unknown", f"Role must be a string, got {type(role).__name__}"
            else:
                return False, normalized_role, f"Invalid role: {role}. Must be one of: {', '.join(valid_roles)}"
    
    @staticmethod
    def validate_content_block(block: Any) -> Tuple[Dict[str, Any], List[str]]:
        """
        Validate and normalize a content block.
        
        Args:
            block: The content block to validate
            
        Returns:
            Tuple of (normalized_block, warnings)
        """
        warnings = []
        
        # Convert to dictionary if possible
        if hasattr(block, "model_dump"):  # Pydantic v2
            try:
                block = block.model_dump()
            except Exception as e:
                warnings.append(f"Error using model_dump(): {str(e)}")
        elif hasattr(block, "dict"):  # Pydantic v1
            try:
                block = block.dict()
            except Exception as e:
                warnings.append(f"Error using dict(): {str(e)}")
        
        # Handle string content
        if isinstance(block, str):
            return {"type": "text", "text": block}, warnings
            
        # Handle dictionary content
        if isinstance(block, dict):
            # Ensure the block has a type
            if "type" not in block:
                if "text" in block:
                    block["type"] = "text"
                    warnings.append("Missing 'type' field, defaulted to 'text'")
                else:
                    block = {"type": "text", "text": json.dumps(block, default=str)}
                    warnings.append("Block converted to JSON string due to missing 'type' and 'text' fields")
            
            # Ensure text blocks have text content
            if block.get("type") == "text" and "text" not in block:
                block["text"] = ""
                warnings.append("Missing 'text' field in text block, defaulted to empty string")
                
            return block, warnings
        
        # Handle special objects with text/type attributes
        if hasattr(block, 'text') and hasattr(block, 'type'):
            result = {
                "type": getattr(block, 'type', 'text'),
                "text": getattr(block, 'text', str(block))
            }
            warnings.append(f"Converted object with text/type attributes: {type(block).__name__}")
            return result, warnings
            
        # Default for other types
        warnings.append(f"Unknown content block type: {type(block).__name__}, converted to string")
        return {"type": "text", "text": str(block)}, warnings
    
    @staticmethod
    def validate_content(content: Any) -> Tuple[List[Dict[str, Any]], List[str]]:
        """
        Validate and normalize message content.
        
        Args:
            content: The content to validate
            
        Returns:
            Tuple of (normalized_content, warnings)
        """
        warnings = []
        normalized_content = []
        
        # Handle None/empty content
        if content is None:
            warnings.append("Content was None, defaulted to empty text block")
            return [{"type": "text", "text": ""}], warnings
            
        # Convert to list if not already
        if not isinstance(content, list):
            content = [content]
            if not isinstance(content[0], (dict, str)):
                warnings.append(f"Content was not a list, dict, or string: {type(content[0]).__name__}")
        
        # Process each content block
        for i, block in enumerate(content):
            try:
                normalized_block, block_warnings = MessageValidator.validate_content_block(block)
                normalized_content.append(normalized_block)
                
                # Add index to warnings
                warnings.extend([f"Block {i}: {warning}" for warning in block_warnings])
            except Exception as e:
                error_msg = f"Error processing content block {i}: {str(e)}"
                warnings.append(error_msg)
                normalized_content.append({"type": "text", "text": f"[Error: {str(e)}]"})
                
                debug.log(
                    event="content_block_validation_error",
                    category="CONVERSATION_INSPECTOR_DEBUG",
                    data={
                        "error": str(e),
                        "block_index": i,
                        "block_type": type(block).__name__,
                        "stack_trace": traceback.format_exc()
                    }
                )
        
        return normalized_content, warnings
    
    @staticmethod
    def validate_message(message: Any, session_id: Optional[str] = None) -> Tuple[Dict[str, Any], List[str]]:
        """
        Validate and normalize a complete message.
        
        Args:
            message: The message to validate
            session_id: Optional session ID for logging
            
        Returns:
            Tuple of (normalized_message, warnings)
        """
        warnings = []
        
        try:
            # Convert to dictionary if possible
            if hasattr(message, "model_dump"):  # Pydantic v2
                message = message.model_dump()
                warnings.append("Converted from Pydantic v2 model")
            elif hasattr(message, "dict"):  # Pydantic v1
                message = message.dict()
                warnings.append("Converted from Pydantic v1 model")
                
            # Ensure message is a dictionary
            if not isinstance(message, dict):
                debug.log(
                    event="message_validation_error",
                    category="CONVERSATION_INSPECTOR_DEBUG",
                    data={
                        "error": f"Message must be a dictionary, got {type(message).__name__}",
                        "message_preview": str(message)[:100]
                    },
                    session_id=session_id
                )
                return {
                    "role": "unknown",
                    "content": [{"type": "text", "text": str(message)}]
                }, ["Message is not a dictionary, converted to text content"]
            
            # Check for required fields
            normalized_message = {}
            
            # Validate role
            if "role" in message:
                is_valid, normalized_role, error = MessageValidator.validate_role(message["role"])
                normalized_message["role"] = normalized_role
                if not is_valid:
                    warnings.append(error)
            else:
                normalized_message["role"] = "unknown"
                warnings.append("Missing 'role' field, defaulted to 'unknown'")
            
            # Validate content
            if "content" in message:
                normalized_content, content_warnings = MessageValidator.validate_content(message["content"])
                normalized_message["content"] = normalized_content
                warnings.extend(content_warnings)
            else:
                normalized_message["content"] = [{"type": "text", "text": ""}]
                warnings.append("Missing 'content' field, defaulted to empty text")
            
            # Copy any additional fields
            for key, value in message.items():
                if key not in ["role", "content"]:
                    normalized_message[key] = value
            
            return normalized_message, warnings
            
        except Exception as e:
            error_msg = f"Failed to validate message: {str(e)}"
            debug.log(
                event="message_validation_exception",
                category="CONVERSATION_INSPECTOR_DEBUG",
                data={
                    "error": str(e),
                    "error_type": type(e).__name__,
                    "stack_trace": traceback.format_exc(),
                    "message_preview": str(message)[:100] if message else "None"
                },
                session_id=session_id
            )
            
            return {
                "role": "unknown",
                "content": [{"type": "text", "text": f"[Error: {str(e)}]"}]
            }, [error_msg]

def format_message_for_display(message: Dict[str, Any], session_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Format a message for display in the conversation inspector.
    
    Args:
        message: The message to format
        session_id: Optional session ID for logging
        
    Returns:
        Formatted message with display-friendly structure
    """
    try:
        # First validate and normalize the message
        normalized_message, warnings = MessageValidator.validate_message(message, session_id)
        
        # Format for display with metadata
        display_message = {
            "id": normalized_message.get("id", str(int(datetime.now().timestamp()))),
            "role": normalized_message.get("role", "unknown"),
            "content": normalized_message.get("content", [{"type": "text", "text": ""}]),
            "timestamp": normalized_message.get("timestamp", datetime.utcnow()),
            "metadata": {
                "original_type": type(message).__name__,
                "validation_warnings": warnings if warnings else None
            }
        }
        
        return display_message
        
    except Exception as e:
        debug.log(
            event="display_format_error",
            category="CONVERSATION_INSPECTOR_DEBUG",
            data={
                "error": str(e),
                "error_type": type(e).__name__,
                "stack_trace": traceback.format_exc()
            },
            session_id=session_id
        )
        
        # Return a safe fallback
        return {
            "id": str(int(datetime.now().timestamp())),
            "role": "unknown",
            "content": [{"type": "text", "text": f"[Error formatting message: {str(e)}]"}],
            "timestamp": datetime.utcnow(),
            "metadata": {
                "error": str(e),
                "error_type": type(e).__name__
            }
        }
        
def format_message_for_storage(message: Dict[str, Any], session_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Format a message for storage in the session.
    
    Args:
        message: The message to format
        session_id: Optional session ID for logging
        
    Returns:
        Message formatted for storage with minimal structure
    """
    try:
        # First validate and normalize the message
        normalized_message, warnings = MessageValidator.validate_message(message, session_id)
        
        # Format for storage with just the essentials
        storage_message = {
            "role": normalized_message.get("role", "unknown"),
            "content": normalized_message.get("content", [{"type": "text", "text": ""}])
        }
        
        # Log any warnings
        if warnings:
            debug.log(
                event="message_storage_warnings",
                category="CONVERSATION_INSPECTOR_DEBUG",
                data={"warnings": warnings},
                session_id=session_id
            )
        
        return storage_message
        
    except Exception as e:
        debug.log(
            event="storage_format_error",
            category="CONVERSATION_INSPECTOR_DEBUG",
            data={
                "error": str(e),
                "error_type": type(e).__name__,
                "stack_trace": traceback.format_exc()
            },
            session_id=session_id
        )
        
        # Return a safe fallback
        return {
            "role": "unknown",
            "content": [{"type": "text", "text": f"[Error formatting message: {str(e)}]"}]
        }

def get_content_text(content: Union[List, Dict, str]) -> str:
    """
    Extract plain text from message content for logging.
    
    Args:
        content: Message content in any format
        
    Returns:
        Plain text representation
    """
    try:
        if content is None:
            return ""
            
        if isinstance(content, str):
            return content
            
        if isinstance(content, dict):
            if "text" in content:
                return content["text"]
            return json.dumps(content, default=str)
            
        if isinstance(content, list):
            text_parts = []
            for item in content:
                if isinstance(item, dict) and "text" in item:
                    text_parts.append(item["text"])
                elif isinstance(item, str):
                    text_parts.append(item)
                else:
                    text_parts.append(str(item))
            return "\n".join(text_parts)
            
        return str(content)
        
    except Exception as e:
        return f"[Error extracting text: {str(e)}]"