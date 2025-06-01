"""Tool handling for chat interactions."""

import uuid
from typing import Dict, Any, Optional
from tools.base import ToolResult, CLIResult, WebResult
from .state import (
    SessionState,
    set_session_messages,
    get_session_screenshot,
    set_session_screenshot,
    get_session_file_content,
    set_session_file_content,
)
from .message_handler import format_sse_data, format_message_with_type, format_file_data
from debug.debug_logger import debug

def create_tool_callback(session: SessionState):
    """Create a tool output callback with session support."""
    def tool_output_callback(result: ToolResult, tool_id: str) -> Optional[Dict[str, Any]]:
        try:
            # 1. Handle error result
            if result.error:
                error_result = {
                    "role": "user",
                    "content": [{
                        "type": "tool_result",
                        "content": [{
                            "type": "text",
                            "text": str(result.error)
                        }],
                        "tool_use_id": tool_id,
                        "is_error": True
                    }]
                }
                # Store as user turn
                set_session_messages(session, [error_result])
                session.conversation.add_turn_user(error_result["content"], is_tool_result=True)
                return {
                    "type": "error",
                    "content": str(result.error),
                    "continue": True
                }

            # 2. Handle successful result
            tool_content = []

            # Add main output if present
            if result.output:
                tool_content.append({
                    "type": "tool_result",
                    "content": [{  # Content array with one text block
                        "type": "text",
                        "text": result.output
                    }],
                    "tool_use_id": session.current_tool_id,  # Use ID from session
                    "is_error": False
                })

            # Create complete result message
            if tool_content:
                tool_result = {
                    "role": "user",
                    "content": tool_content
                }

                debug.log(
                    event="tool_result_stored",
                    session_id=session.session_id,
                    category="CONVERSATION_TOOL_USE",
                    data={
                        "tool_id": tool_id,
                        "result_type": type(result).__name__,
                        "conversation_turns": len(session.conversation.turns)
                    }
                )

                # Store as user turn 
                set_session_messages(session, [tool_result])
                session.conversation.add_turn_user(tool_result["content"], is_tool_result=True)

            # 3. Handle UI-specific content separately
            if result.base64_image:
                set_session_screenshot(session, result.base64_image)
            
            if isinstance(result, (CLIResult, WebResult)) and result.output:
                set_session_file_content(session, {
                    'content': result.output,
                    'metadata': result.metadata
                })

            return None

        except Exception as e:
            debug.log(
                event="tool_result_error",
                session_id=session.session_id,
                category="CONVERSATION_TOOL_USE",
                data={
                    "error": str(e),
                    "tool_id": tool_id
                }
            )
            raise
    return tool_output_callback

def handle_tool_request(session: SessionState, chunk: Dict[str, Any]) -> str:
    """Handle tool request chunk and return SSE data."""
    tool_id = f"toolu_{uuid.uuid4().hex[:24]}"
    session.current_tool_id = tool_id  # Store for tool result to use

    # Get role from chunk or default to assistant (tools are run by the assistant)
    role = chunk.get("role", "assistant")
    
    return format_sse_data(format_message_with_type(
        chunk["chunk"],
        "action",
        chunk.get("metadata"),
        role=role
    ))