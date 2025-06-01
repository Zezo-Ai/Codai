from typing import Any, List, Dict
import uuid
from anthropic.types.beta import BetaMessage

def _create_response(content: List[Any], model: str) -> BetaMessage:
    """Create a BetaMessage response object.
    
    Args:
        content (List[Any]): The content for the message
        model (str): The model identifier used
        
    Returns:
        BetaMessage: A formatted message response
    """
    return BetaMessage(
        id=str(uuid.uuid4()),
        content=content,
        role="assistant",
        model=model,
        stop_reason=None,
        stop_sequence=None,
        type="message",
        usage={"input_tokens": 0, "output_tokens": 0},
    )

def _create_message(content: List[Any]) -> Dict[str, Any]:
    """Create a message dictionary for the conversation history.
    
    Args:
        content (List[Any]): The content for the message
        
    Returns:
        Dict[str, Any]: A formatted message dictionary
    """
    return {"role": "assistant", "content": content}