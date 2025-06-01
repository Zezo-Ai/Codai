"""Utility functions for Conversation Inspector."""

from typing import Any, Dict, List
from debug.debug_logger import debug

def convert_content_block(block: Any, session_id: str = None) -> Dict:
    """Convert content block to standard format."""
    try:
        if hasattr(block, "model_dump"):  # Pydantic v2
            block_dict = block.model_dump()
        elif hasattr(block, "dict"):      # Pydantic v1
            block_dict = block.dict()
        elif hasattr(block, "__dict__"):  # Regular objects
            block_dict = {
                "type": block.__class__.__name__.lower().replace("beta", "").replace("block", ""),
                **{k: v for k, v in block.__dict__.items() if not k.startswith("_")}
            }
        else:  # Fallback
            block_dict = {"type": "text", "text": str(block)}

        debug.log(
            event="block_conversion",
            category="CONVERSATION_INSPECTOR_DEBUG",
            data={"converted_data": block_dict},
            session_id=session_id
        )
        return block_dict

    except Exception as e:
        debug.log(
            event="block_conversion_error",
            category="CONVERSATION_INSPECTOR_DEBUG",
            data={
                "error": str(e),
                "block_type": type(block).__name__,
                "block_str": str(block)
            },
            session_id=session_id
        )
        return {"type": "text", "text": f"Error converting block: {str(e)}"}


def format_message_content(content: Any, session_id: str = None) -> List[Dict]:
    """Format message content to standard structure."""
    try:
        if not isinstance(content, list):
            content = [content]

        formatted_content = []
        for item in content:
            if hasattr(item, "model_dump") or hasattr(item, "dict"):
                formatted_content.append(convert_content_block(item, session_id))
            elif isinstance(item, dict):
                formatted_content.append(item)
            else:
                formatted_content.append({"type": "text", "text": str(item)})

        return formatted_content

    except Exception as e:
        debug.log(
            event="content_format_error",
            category="CONVERSATION_INSPECTOR_DEBUG",
            data={
                "error": str(e),
                "content_type": type(content).__name__
            },
            session_id=session_id
        )
        return [{"type": "text", "text": "Error formatting content"}]


def validate_message_structure(msg: Dict) -> tuple[bool, str]:
    """Validate message structure."""
    if not isinstance(msg, dict):
        return False, "Message must be an object"
        
    if "role" not in msg or "content" not in msg:
        return False, "Message missing required fields: role and content"

    if not isinstance(msg["content"], (list, dict, str)):
        return False, "Content must be a list, object or string"

    return True, ""