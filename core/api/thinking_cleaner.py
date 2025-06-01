"""Direct fix for thinking blocks in Anthropic API requests."""

from typing import Dict, List, Any, Optional, Union
from debug.debug_logger import debug

def contains_thinking_blocks(messages: List[Dict[str, Any]]) -> bool:
    """
    Clear detection of thinking blocks in any message.
    
    Args:
        messages: List of messages to check
        
    Returns:
        True if thinking blocks are found
    """
    if not messages:
        return False
        
    # Simple version - check for thinking in any message
    for msg in messages:
        if not isinstance(msg, dict) or "content" not in msg or not isinstance(msg["content"], list):
            continue
            
        for block in msg["content"]:
            if isinstance(block, dict) and block.get("type") in ["thinking", "redacted_thinking"]:
                debug.log(
                    event="thinking_block_detected",
                    data={
                        "message_role": msg.get("role"),
                        "block_type": block.get("type"),
                        "is_assistant": msg.get("role") == "assistant"
                    },
                    category="THINKING_DETECTION"
                )
                return True
                
    return False
    
def get_last_assistant_message(messages: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """
    Get the last assistant message in the conversation.
    
    Args:
        messages: List of messages
        
    Returns:
        The last assistant message or None
    """
    for msg in reversed(messages):
        if msg.get("role") == "assistant":
            return msg
    return None

def last_assistant_has_thinking(messages: List[Dict[str, Any]]) -> bool:
    """
    Check if the last assistant message contains thinking blocks.
    
    Args:
        messages: List of messages
        
    Returns:
        True if last assistant message has thinking blocks
    """
    last_assistant = get_last_assistant_message(messages)
    if not last_assistant:
        return False
        
    if not isinstance(last_assistant.get("content"), list):
        return False
        
    for block in last_assistant["content"]:
        if isinstance(block, dict) and block.get("type") in ["thinking", "redacted_thinking"]:
            debug.log(
                event="last_assistant_has_thinking",
                data={"block_type": block.get("type")},
                category="THINKING_DETECTION"
            )
            return True
            
    return False

def force_enable_thinking(api_params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Ensure thinking is enabled in API parameters.
    
    Args:
        api_params: Current API parameters
        
    Returns:
        Updated API parameters with thinking enabled
    """
    # Enable thinking with minimal budget if not already enabled
    if "thinking" not in api_params:
        api_params["thinking"] = {
            "type": "enabled",
            "budget_tokens": 1024  # Minimal budget
        }
        
        debug.log(
            event="thinking_enabled_for_compatibility",
            data={"budget_tokens": 1024},
            category="THINKING_FIX"
        )
        
    return api_params