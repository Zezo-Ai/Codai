from typing import List, Optional, Dict, Any, Union
from anthropic.types.beta import BetaMessageParam
from debug.debug_logger import debug
import time
from datetime import datetime
from core.metrics import TokenMetricsStore
from core.config_manager import get_config

# Avoid circular import while still getting type hints
# from core.conversation.history import ConversationHistory

# Session state types
class SessionState:
    """Session state for managing conversation and temporary data."""
    
    def __init__(self, session_id: str):
        """Initialize session state."""
        if not session_id:
            raise ValueError("session_id is required")
            
        self.session_id = session_id
        self.messages: List[BetaMessageParam] = []
        self._short_messages: List[BetaMessageParam] = []
        self.latest_screenshot: Optional[str] = None
        self.latest_file_content: Optional[Dict] = None
        self.pdf_base64: Optional[str] = None
        self.pdf_info: Optional[Dict] = None
        self.metrics_store = TokenMetricsStore()
        self.is_summarized: bool = False

        debug.log(
            event="session_created",
            session_id=session_id,
            category="CONVERSATION_PERSISTENCE_DEBUG",
            data={"session_id": session_id}
        )
        
    # Legacy conversation object removed to eliminate confusion
        
    @property
    def short_messages(self) -> List[BetaMessageParam]:
        """Get short version of messages."""
        return self._short_messages
        
    @short_messages.setter
    def short_messages(self, value: List[BetaMessageParam]) -> None:
        """Set short version of messages."""
        self._short_messages = value if value is not None else []  # Ensure we never set None
        
    def add_message(self, role: str, content: Any, is_tool_result: bool = False) -> None:
        """Add a message to both messages and short_messages.
        
        Args:
            role: Message role (user or assistant)
            content: Message content (can be string, list, or dict)
            is_tool_result: Whether this is a tool result
        """
        # Log full session messages before adding new message
        debug.log(
            event="session_messages_before_add",
            session_id=self.session_id,
            data={
                "full_messages": self.messages.copy(),
                "message_count": len(self.messages),
                "adding_role": role
            },
            category="MESSAGE_CONTENT"
        )
        
        # Format the content properly for the message
        formatted_content = self._format_message_content(content, is_tool_result)
        
        # Create the message
        message = {
            "role": role,
            "content": formatted_content
        }
        
        # Add to both message lists
        self.messages.append(message)
        self.short_messages.append(message)
            
        # Extract content preview for logging
        content_preview = ""
        if isinstance(formatted_content, list) and formatted_content:
            if isinstance(formatted_content[0], dict) and "text" in formatted_content[0]:
                content_preview = formatted_content[0]["text"][:100] + "..." if len(formatted_content[0]["text"]) > 100 else formatted_content[0]["text"]
            elif isinstance(formatted_content[0], dict) and "type" in formatted_content[0]:
                content_preview = f"{formatted_content[0]['type']} content"
        
        debug.log(
            event="message_added",
            session_id=self.session_id,
            data={
                "message": f"NEW MESSAGE: {role.upper()}: {content_preview}",
                "role": role,
                "content_preview": content_preview,
                "message_count": len(self.messages)
            },
            category="CONVERSATION_FLOW"
        )
        
        # Extract full message content for logging - better handling of all content types
        full_content = ""
        if isinstance(formatted_content, list):
            for block in formatted_content:
                if isinstance(block, dict):
                    # Direct text content
                    if "text" in block:
                        full_content += block["text"] + "\n"
                    # Nested content inside a type block
                    elif "type" in block and "content" in block and isinstance(block["content"], list):
                        for nested_block in block["content"]:
                            if isinstance(nested_block, dict) and "text" in nested_block:
                                full_content += nested_block["text"] + "\n"
                    # Any other specialized content
                    elif "type" in block:
                        full_content += f"[Content of type: {block['type']}]\n"
                elif isinstance(block, str):
                    full_content += block + "\n"
        
        # Only log essential message information
        debug.log(
            event="message_details",
            session_id=self.session_id,
            category="CONVERSATION_FLOW",
            data={
                "role": role,
                "is_tool_result": is_tool_result,
                "message_count": len(self.messages),
                "content_preview": content_preview
            }
        )
        
        # Log the full message content to a dedicated category
        debug.log(
            event="message_content",
            session_id=self.session_id,
            category="MESSAGE_CONTENT",
            data={
                "message_number": len(self.messages),
                "role": role,
                "is_tool_result": is_tool_result,
                "content": full_content
            }
        )
        
        # Log full session messages after adding new message
        debug.log(
            event="session_messages_after_add",
            session_id=self.session_id,
            data={
                "full_messages": self.messages.copy(),
                "message_count": len(self.messages),
                "added_role": role,
                "added_message_index": len(self.messages) - 1
            },
            category="MESSAGE_CONTENT"
        )
        
    def _format_message_content(self, content: Any, is_tool_result: bool) -> List[Dict]:
        """Format the content into the proper structure for messages.
        
        Args:
            content: Raw content (string, list, or dict)
            is_tool_result: Whether this is a tool result
            
        Returns:
            Properly formatted content list
        """
        if is_tool_result:
            if isinstance(content, list):
                return content
            elif isinstance(content, dict):
                return [content]
            else:
                return [{
                    "type": "tool_result",
                    "content": [{
                        "type": "text",
                        "text": str(content)
                    }],
                    "tool_use_id": "unknown",
                    "is_error": True
                }]
        else:
            if isinstance(content, str):
                return [{"type": "text", "text": content}]
            elif isinstance(content, list):
                # Special handling for content that may contain thinking blocks
                # When using extended thinking, we need to preserve all blocks including thinking blocks
                for i, block in enumerate(content):
                    if isinstance(block, dict) and block.get("type") in ["thinking", "redacted_thinking"]:
                        # For thinking blocks, ensure signature is properly preserved
                        if block.get("type") == "thinking":
                            # First check if signature is already in dict
                            if not "signature" in block:
                                # If not in dict but exists as attribute, add it
                                if hasattr(block, "signature"):
                                    block["signature"] = getattr(block, "signature")
                                # If signature is in neither place but thinking exists, log warning
                                elif "thinking" in block or hasattr(block, "thinking"):
                                    debug.log(
                                        event="thinking_block_missing_signature",
                                        session_id=self.session_id if hasattr(self, "session_id") else "unknown",
                                        data={
                                            "thinking_length": len(block.get("thinking", "")) if "thinking" in block else 
                                                             (len(getattr(block, "thinking", "")) if hasattr(block, "thinking") else 0)
                                        },
                                        category="EXTENDED_THINKING"
                                    )
                        
                        # For redacted_thinking blocks, ensure data is preserved
                        elif block.get("type") == "redacted_thinking":
                            if not "data" in block and hasattr(block, "data"):
                                block["data"] = getattr(block, "data")
                        
                        # Log that we're preserving a thinking block
                        debug.log(
                            event="preserving_thinking_block",
                            session_id=self.session_id if hasattr(self, "session_id") else "unknown",
                            data={
                                "block_type": block.get("type"),
                                "has_signature": "signature" in block,
                                "signature_length": len(block.get("signature", "")) if "signature" in block else 0,
                                "has_thinking": "thinking" in block or hasattr(block, "thinking"),
                                "has_data": "data" in block or hasattr(block, "data")
                            },
                            category="EXTENDED_THINKING"
                        )
                return content
            elif isinstance(content, dict):
                return [content]
            else:
                return [{"type": "text", "text": str(content)}]

    def _get_state_info(self) -> dict:
        """Get current state information safely with attribute checking."""
        info = {
            'has_messages': False,
            'has_screenshot': False,
            'has_file_content': False,
            'message_count': 0,
            'short_message_count': 0,
            'is_summarized': False
        }
        
        # Safely check attributes to avoid AttributeError
        if hasattr(self, 'messages'):
            info['has_messages'] = bool(self.messages)
            info['message_count'] = len(self.messages) if self.messages else 0
            
        if hasattr(self, '_short_messages'):
            info['short_message_count'] = len(self._short_messages) if self._short_messages else 0
            
        if hasattr(self, 'latest_screenshot'):
            info['has_screenshot'] = bool(self.latest_screenshot)
            
        if hasattr(self, 'latest_file_content'):
            info['has_file_content'] = bool(self.latest_file_content)
            
        if hasattr(self, 'is_summarized'):
            info['is_summarized'] = bool(self.is_summarized)
            
        return info

    def __bool__(self) -> bool:
        """Return True if any state exists."""
        state_info = self._get_state_info()
        has_state = any(state_info.values())
        
        debug.log(
            event="session_state_check",
            session_id=self.session_id,
            category="CONVERSATION_PERSISTENCE_DEBUG",
            data={
                'has_state': has_state,
                'state': state_info
            })
        return has_state
        
    def is_clean(self) -> bool:
        """Check if session state is clean."""
        return not bool(self)
        
    def rebuild_context(self) -> None:
        """Rebuild conversation context after message changes."""
        try:
            # No longer need to rebuild legacy conversation
            debug.log(
                event="context_rebuild",
                session_id=self.session_id,
                category="CONVERSATION_PERSISTENCE_DEBUG",
                data={
                    "message_count": len(self.messages)
                }
            )
        except Exception as e:
            debug.log(
                event="context_rebuild_error",
                session_id=self.session_id,
                category="CONVERSATION_PERSISTENCE_DEBUG",
                data={"error": str(e)}
            )
            raise

# Global session storage
chat_sessions: Dict[str, SessionState] = {}

# Initialize sessions with summarization capabilities
async def initialize_session(session_id: str) -> SessionState:
    """Create or get a session and initialize it with all necessary capabilities."""
    session = get_or_create_session(session_id)
    await add_summarization_methods_to_session(session)
    return session

def get_or_create_session(session_id: str) -> SessionState:
    """Get or create a session state object."""
    try:
        if not session_id:
            debug.log(
                event="session_error",
                category="CONVERSATION_PERSISTENCE_DEBUG",
                data={"error": "Empty session_id"}
            )
            raise ValueError("session_id is required")

        if session_id not in chat_sessions:
            try:
                chat_sessions[session_id] = SessionState(session_id)
                debug.log(
                    event="session_created",
                    session_id=session_id,
                    category="CONVERSATION_PERSISTENCE_DEBUG",
                    data={"action": "create_new"}
                )
            except Exception as e:
                debug.log(
                    event="session_creation_failed",
                    category="CONVERSATION_PERSISTENCE_DEBUG",
                    data={
                        "session_id": session_id,
                        "error": str(e)
                    }
                )
                raise Exception(f"Failed to create new session: {str(e)}")
        else:
            debug.log(
                event="session_retrieved",
                session_id=session_id,
                category="CONVERSATION_PERSISTENCE_DEBUG",
                data={"action": "get_existing"}
            )
        
        return chat_sessions[session_id]
    except ValueError as ve:
        debug.log(
            event="session_error",
            category="CONVERSATION_PERSISTENCE_DEBUG",
            data={"error": str(ve)}
        )
        raise
    except Exception as e:
        debug.log(
            event="session_error",
            category="CONVERSATION_PERSISTENCE_DEBUG",
            data={"error": str(e)}
        )
        raise Exception(f"Failed to get or create session: {str(e)}")

def get_session_messages(session: SessionState, use_short: bool = True) -> List[BetaMessageParam]:
    """Get messages for a specific session.
    
    Args:
        session: The session to get messages from
        use_short: Whether to use short version (default True)
        
    Returns:
        List of messages (short version if use_short=True, otherwise full version)
    """
    messages = session.short_messages if use_short else session.messages
    
    # Get message roles
    roles = [m["role"] for m in messages]
    
    # Log retrieval state
    debug.log(
        event="message_retrieval",
        session_id=session.session_id,
        category="CONVERSATION_PERSISTENCE_DEBUG",
        data={
            "operation": "get_" + ("short" if use_short else "full") + "_messages",
            "message_count": len(messages),
            "roles": roles
        }
    )
    return messages

def set_session_messages(session: SessionState, new_messages: List[BetaMessageParam]) -> None:
    """Set messages for both versions.
    
    Args:
        session: The session to update
        new_messages: Messages to append to both versions
    """
    # Get original counts before changes
    original_count = len(session.messages)
    
    # Add new messages to both versions
    for message in new_messages:
        role = message.get("role", "unknown")
        content = message.get("content", [])
        session.add_message(role, content)
    
    # Get new count after changes
    new_count = len(session.messages)
    
    # Log message addition
    debug.log(
        event="messages_added",
        session_id=session.session_id,
        category="CONVERSATION_PERSISTENCE_DEBUG",
        data={
            "messages_added": len(new_messages),
            "total_messages": len(session.messages),
            "message_type": new_messages[0]["role"] if new_messages else "unknown"
        }
    )
    
    # Add special log for session messages replacement when summarization happens
    # This is triggered when the message count decreases (indicating summarization)
    if session.is_summarized:
        # Extract content from messages for verification
        summary_content = ""
        if session.short_messages and len(session.short_messages) > 0:
            # Get the first message (user message with the summary)
            for msg in session.short_messages:
                if msg.get("role") == "user" and "content" in msg and len(msg["content"]) > 0:
                    for content_block in msg["content"]:
                        if isinstance(content_block, dict) and "text" in content_block:
                            summary_content += content_block["text"] + "\n"
                    break  # Just get the first user message
        
        # Make a simplified copy of the original messages for logging
        original_messages_copy = []
        for msg in session.messages:
            if isinstance(msg, dict):
                msg_copy = {
                    "role": msg.get("role", "unknown"),
                    "content": msg.get("content", [])
                }
                original_messages_copy.append(msg_copy)
        
        debug.log(
            event="session_messages_replaced",
            session_id=session.session_id,
            category="SESSION_MESSAGES_REPLACED",
            data={
                "messages_count": len(session.messages),
                "session_message_count": len(session.short_messages),
                "original_count": original_count,
                "new_count": new_count,
                "is_summarized": session.is_summarized,
                "summary_content": summary_content,
                "original_messages": original_messages_copy
            }
        )

def get_session_screenshot(session: SessionState) -> Optional[str]:
    """Get screenshot for a specific session."""
    debug.log(
        event="screenshot_retrieval",
        session_id=session.session_id,
        category="CONVERSATION_PERSISTENCE_DEBUG",
        data={'has_screenshot': bool(session.latest_screenshot)}
    )
    return session.latest_screenshot

def set_session_screenshot(session: SessionState, screenshot: Optional[str]) -> None:
    """Set screenshot for a specific session."""
    session.latest_screenshot = screenshot
    debug.log(
        event="screenshot_update",
        session_id=session.session_id,
        category="CONVERSATION_PERSISTENCE_DEBUG",
        data={'has_screenshot': bool(screenshot)}
    )

def get_session_file_content(session: SessionState) -> Optional[Dict]:
    """Get file content for a specific session."""
    debug.log(
        event="file_content_retrieval",
        session_id=session.session_id,
        category="CONVERSATION_PERSISTENCE_DEBUG",
        data={'has_file_content': bool(session.latest_file_content)}
    )
    return session.latest_file_content

def set_session_file_content(session: SessionState, content: Optional[Dict]) -> None:
    """Set file content for a specific session."""
    session.latest_file_content = content
    debug.log(
        event="file_content_update",
        session_id=session.session_id,
        category="CONVERSATION_PERSISTENCE_DEBUG",
        data={'has_file_content': bool(content)}
    )

def delete_session(session_id: str) -> None:
    """Delete a session completely."""
    if not session_id:
        raise ValueError("Session ID cannot be empty")
        
    debug.log(
        event="session_deletion",
        session_id=session_id,
        category="CONVERSATION_PERSISTENCE_DEBUG",
        data={"action": "deleting_session"}
    )
    
    # Simply remove from global storage
    if session_id in chat_sessions:
        del chat_sessions[session_id]
        debug.log(
            event="session_deleted",
            session_id=session_id,
            category="CONVERSATION_PERSISTENCE_DEBUG",
            data={"status": "success"}
        )

async def add_summarization_methods_to_session(session):
    """Add summarization methods to the session."""
    
    async def maybe_summarize(self, client, token_count, current_messages=None, system_prompt=None, tools=None):
        """
        Check if summarization is needed and perform it if necessary.
        
        Args:
            client: The Anthropic client to use for summarization
            token_count: Current token count
            current_messages: Messages to use for summarization
            system_prompt: System prompt
            tools: Any tools to include
            
        Returns:
            bool: True if summarization occurred, False otherwise
        """
        from debug.debug_logger import debug
        
        # Get configuration for token thresholds
        from core.config_manager import get_config
        config = get_config()
        percentage = (token_count / 200000)  # Hardcode max tokens for now
        threshold_value = config.get('ai.token_management.summary_triggers.threshold_percentage')
        threshold = float(threshold_value if threshold_value is not None else 0.8)
        token_threshold_exceeded = percentage > threshold
        
        # Calculate total message count
        message_count = len(self.messages)
        turn_count = message_count // 2  # Approximate pairs
        
        # We need at least 4 messages to summarize
        has_enough_messages = message_count >= 4
        
        # Check if we should summarize
        should_summarize = token_threshold_exceeded and has_enough_messages
        
        debug.log(
            event="maybe_summarize_check",
            session_id=self.session_id,
            data={
                "token_count": token_count,
                "should_summarize": should_summarize,
                "token_threshold_exceeded": token_threshold_exceeded,
                "threshold": threshold,
                "percentage": percentage,
                "has_enough_messages": has_enough_messages,
                "turns_count": turn_count,
                "is_already_summarized": self.is_summarized,
                "has_current_messages": bool(current_messages) and len(current_messages) > 0
            },
            category="SUMMARIZATION"
        )
        
        if should_summarize:
            try:
                from core.api.conversation import ConversationSummarizer
                summarizer = ConversationSummarizer(client)
                
                debug.log(
                    event="summarization_started",
                    session_id=self.session_id,
                    data={"turns_to_summarize": turn_count},
                    category="SUMMARIZATION"
                )
                
                # Convert messages to the format expected by the summarizer
                # This is a temporary compatibility layer - in the future, we should adapt the summarizer
                turns = []
                for msg in self.messages:
                    turns.append({
                        "role": msg.get("role", "unknown"),
                        "content": msg.get("content", [])
                    })
                
                # We need to divide the conversation into sections and only summarize the middle
                from core.api.conversation.boundaries import BoundaryAdjuster
                from core.config_manager import get_config
                
                # Get section size configuration
                config = get_config()
                min_pairs = {
                    'first': config.get('ai.conversation.section.first.min_pairs', 1),
                    'middle': config.get('ai.conversation.section.middle.min_pairs', 1),
                    'last': config.get('ai.conversation.section.last.min_pairs', 1)
                }
                
                # Count messages and check if we have any unpaired messages
                msg_count = len(turns)
                has_unpaired = msg_count % 2 != 0
                paired_count = msg_count - (1 if has_unpaired else 0)
                total_pairs = paired_count // 2
                
                # Safety check - make sure we have enough pairs
                if total_pairs < min_pairs['first'] + min_pairs['middle'] + min_pairs['last']:
                    debug.log(
                        event="boundary_calculation_not_enough_pairs",
                        session_id=self.session_id,
                        data={
                            "total_pairs": total_pairs,
                            "required_pairs": min_pairs['first'] + min_pairs['middle'] + min_pairs['last'],
                            "action": "using_minimal_viable_division"
                        },
                        category="SUMMARIZATION"
                    )
                    # Fall back to a minimal viable division with at least one pair in each section
                    if total_pairs >= 3:
                        # We can have one pair in each section
                        min_pairs['first'] = min_pairs['middle'] = min_pairs['last'] = 1
                    elif total_pairs == 2:
                        # Can only have first and last sections
                        min_pairs['first'] = min_pairs['last'] = 1
                        min_pairs['middle'] = 0
                    else:
                        # Not enough pairs to divide, use everything for summarization
                        min_pairs['first'] = min_pairs['last'] = 0
                        min_pairs['middle'] = total_pairs
                
                # Calculate default boundaries based on pair counts - ensure we have a middle section if possible
                first_boundary = min(min_pairs['first'] * 2, paired_count // 3)  # Convert pairs to message count
                if first_boundary < 2 and paired_count >= 4:
                    first_boundary = 2  # Ensure at least one pair in first section if we have enough messages
                    
                last_boundary = max(paired_count - (min_pairs['last'] * 2), first_boundary + 2)  # Ensure middle section exists
                
                # Adjust boundaries to preserve conversation pairs
                adjusted_first, adjusted_last = BoundaryAdjuster.adjust_boundaries(
                    messages=turns,
                    first_boundary=first_boundary,
                    last_boundary=last_boundary,
                    has_unpaired=has_unpaired,
                    min_middle_pairs=min_pairs['middle'],
                    session_id=self.session_id
                )
                
                # Split messages into sections, with special handling for edge cases
                if total_pairs < 3:
                    # Not enough pairs for three sections, prioritize middle section for summarization
                    first_messages = []
                    last_messages = []
                    if total_pairs == 2:
                        # If we have exactly 2 pairs, keep the last pair intact and summarize the first
                        middle_messages = turns[:2]
                        last_messages = turns[2:paired_count]
                    else:
                        # Just summarize everything
                        middle_messages = turns[:paired_count]
                else:
                    # Normal case - three sections
                    first_messages = turns[:adjusted_first]
                    middle_messages = turns[adjusted_first:adjusted_last]
                    last_messages = turns[adjusted_last:paired_count]
                
                # Handle unpaired message at the end
                if has_unpaired:
                    last_messages.append(turns[-1])
                
                # Only summarize the middle section
                debug.log(
                    event="section_for_summarization",
                    session_id=self.session_id,
                    data={
                        "first_section_messages": len(first_messages),
                        "middle_section_messages": len(middle_messages),
                        "last_section_messages": len(last_messages),
                        "will_summarize_middle": True
                    },
                    category="SUMMARIZATION"
                )
                
                # Only execute summarization if we have a non-empty middle section
                if middle_messages:
                    debug.log(
                        event="summarizing_middle_section",
                        session_id=self.session_id,
                        data={
                            "middle_section_msg_count": len(middle_messages),
                            "middle_section_pairs": len(middle_messages) // 2
                        },
                        category="SUMMARIZATION"
                    )
                    
                    middle_summary = await summarizer.create_summary(
                        messages=middle_messages,
                        session_id=self.session_id
                    )
                    
                    # Combine the sections - first and last are preserved
                    if middle_summary and middle_summary.was_successful:
                        result = middle_summary  # Store the middle summary for token metrics
                        # Prepare combined message set with first + summary + last
                        combined_messages = first_messages + middle_summary.messages + last_messages
                        
                        # Log the division of sections
                        debug.log(
                            event="successful_section_division",
                            session_id=self.session_id,
                            data={
                                "message": f"Combined {len(first_messages)} first msgs + {len(middle_summary.messages)} summary msgs + {len(last_messages)} last msgs = {len(combined_messages)} total",
                                "first_section_count": len(first_messages),
                                "summary_section_count": len(middle_summary.messages), 
                                "last_section_count": len(last_messages)
                            },
                            category="SUMMARIZATION"
                        )
                    else:
                        # If summary fails, use the original messages
                        combined_messages = turns.copy()
                        result = None
                else:
                    # No middle section to summarize
                    debug.log(
                        event="no_middle_section_to_summarize",
                        session_id=self.session_id,
                        data={"message": "No middle section available to summarize"},
                        category="SUMMARIZATION"
                    )
                    combined_messages = turns.copy()
                    result = None
                
                # Check if summarization was successful
                if not result or not hasattr(result, 'was_successful') or not result.was_successful:
                    debug.log(
                        event="summarization_failed",
                        session_id=self.session_id,
                        data={"error": result.error if result and hasattr(result, 'error') else "No valid summary result"},
                        category="SUMMARIZATION_ERROR"
                    )
                    return False
                    
                # Log the combined messages with preserved sections
                debug.log(
                    event="combined_messages_with_summary",
                    session_id=self.session_id,
                    data={
                        "first_section_count": len(first_messages),
                        "summary_section_count": len(result.messages), 
                        "last_section_count": len(last_messages),
                        "total_combined_count": len(combined_messages)
                    },
                    category="SUMMARIZATION"
                )
                
                # Save original messages for logging
                original_turns = self.messages.copy()
                
                # Log the entire messages object before summarization
                debug.log(
                    event="session_messages_before_summarization",
                    session_id=self.session_id,
                    data={
                        "full_messages": original_turns,
                        "message_count": len(original_turns)
                    },
                    category="MESSAGE_CONTENT"
                )
                
                # Log full content of messages being replaced
                for i, msg in enumerate(original_turns):
                    content_text = ""
                    if "content" in msg:
                        # Extract content using improved method
                        for block in msg["content"]:
                            if isinstance(block, dict):
                                # Direct text content
                                if "text" in block:
                                    content_text += block["text"] + "\n"
                                # Nested content inside a type block
                                elif "type" in block and "content" in block and isinstance(block["content"], list):
                                    for nested_block in block["content"]:
                                        if isinstance(nested_block, dict) and "text" in nested_block:
                                            content_text += nested_block["text"] + "\n"
                                # Any other specialized content
                                elif "type" in block:
                                    content_text += f"[Content of type: {block['type']}]\n"
                            elif isinstance(block, str):
                                content_text += block + "\n"
                    
                    debug.log(
                        event="message_being_replaced",
                        session_id=self.session_id,
                        category="MESSAGE_CONTENT",
                        data={
                            "message_index": i,
                            "role": msg.get("role", "unknown"),
                            "content": content_text,
                            "being_replaced": True
                        }
                    )
                
                # Extract summary content for readability
                summary_text = ""
                if result.messages and len(result.messages) > 0:
                    # Get the first message (user message with the summary)
                    user_message = result.messages[0]
                    if "content" in user_message and len(user_message["content"]) > 0:
                        for content_block in user_message["content"]:
                            if isinstance(content_block, dict) and "text" in content_block:
                                summary_text += content_block["text"] + "\n"
                
                # Log the structure of combined messages for clarity
                debug.log(
                    event="combined_messages_detail",
                    session_id=self.session_id,
                    data={
                        "first_section": [{"role": msg.get("role"), "content_preview": str(msg.get("content"))[:100] + "..."} for msg in first_messages],
                        "summary_section": [{"role": msg.get("role"), "content_preview": str(msg.get("content"))[:100] + "..."} for msg in result.messages],
                        "last_section": [{"role": msg.get("role"), "content_preview": str(msg.get("content"))[:100] + "..."} for msg in last_messages]
                    },
                    category="SUMMARIZATION_DETAIL"
                )
                
                # Update session with combined messages (first + summary + last)
                # Log before replacement for comparison
                debug.log(
                    event="session_state_before_replacement",
                    session_id=self.session_id,
                    data={
                        "original_message_count": len(original_turns),
                        "will_be_replaced_with": len(combined_messages),
                        "combined_structure": f"first({len(first_messages)}) + summary({len(result.messages)}) + last({len(last_messages)})"
                    },
                    category="SUMMARIZATION_REPLACEMENT"
                )
                
                # Completely clear existing messages
                # This is a critical step - we must fully replace, not append
                self.messages = []
                self.short_messages = []
                
                # Create new formatted messages
                new_messages = []
                for i, msg in enumerate(combined_messages):
                    role = msg.get("role", "unknown")
                    content = msg.get("content", [])
                    
                    # Format content properly
                    formatted_content = self._format_message_content(content, False)
                    
                    # Create the message with proper format
                    message = {
                        "role": role,
                        "content": formatted_content
                    }
                    
                    # Add to our new list
                    new_messages.append(message)
                    
                    # Mark where the message came from for debugging
                    section = "first" if i < len(first_messages) else (
                              "summary" if i < len(first_messages) + len(result.messages) else 
                              "last")
                    
                    debug.log(
                        event="adding_message_from_section",
                        session_id=self.session_id,
                        data={
                            "message_index": i,
                            "from_section": section,
                            "role": role,
                            "content_preview": str(content)[:50] + "..."
                        },
                        category="MESSAGE_REPLACEMENT"
                    )
                
                # Now directly set the messages lists - don't use add_message which appends
                self.messages = new_messages.copy()
                self.short_messages = new_messages.copy()
                
                # Log the direct replacement
                debug.log(
                    event="messages_directly_replaced",
                    session_id=self.session_id,
                    data={
                        "action": "direct_replacement",
                        "new_message_count": len(new_messages),
                        "messages_message_count": len(self.messages),
                        "short_messages_count": len(self.short_messages)
                    },
                    category="SUMMARIZATION"
                )
                
                # Mark session as summarized
                self.is_summarized = True
                
                # Legacy conversation object has been removed
                
                # Log the final conversation state to verify messages were properly replaced
                debug.log(
                    event="session_messages_after_replacement",
                    session_id=self.session_id,
                    data={
                        "message_count": len(self.messages),
                        "expected_message_count": len(combined_messages),
                        "message_structure": [
                            {
                                "index": i,
                                "role": msg.get("role", "unknown"),
                                "content_preview": str(msg.get("content", []))[:50] + "..."
                            } 
                            for i, msg in enumerate(self.messages)
                        ]
                    },
                    category="SUMMARIZATION_VERIFICATION"
                )
                
                # Force a token recount to get the accurate token count for combined messages
                from anthropic import Anthropic
                from core.api.conversation import TokenCounter
                
                # Create a token counter with the client and get the new token count
                token_counter = TokenCounter(client)  # Pass the client parameter
                new_token_count = token_counter.count_tokens(
                    messages=self.messages,  # Use actual session messages, not combined_messages
                    session_id=self.session_id
                )
                
                # Also count tokens from original messages before summarization
                original_full_token_count = token_counter.count_tokens(
                    messages=original_turns,
                    session_id=self.session_id
                )
                
                debug.log(
                    event="token_count_after_summarization",
                    session_id=self.session_id,
                    data={
                        "original_middle_token_count": result.original_tokens,  # Just the middle section tokens
                        "original_full_token_count": original_full_token_count,  # All messages before summarization
                        "summary_token_count": result.summary_tokens,  # The summary token count
                        "final_session_token_count": new_token_count,  # Full combined messages token count
                        "token_savings": original_full_token_count - new_token_count,
                        "actual_reduction_percentage": ((original_full_token_count - new_token_count) / original_full_token_count) * 100 if original_full_token_count > 0 else 0,
                        "sections": {
                            "first": len(first_messages),
                            "summary": len(result.messages),
                            "last": len(last_messages)
                        }
                    },
                    category="SUMMARIZATION"
                )
                
                # Log message replacement with detailed before/after message structures
                debug.log(
                    event="session_messages_replaced",
                    session_id=self.session_id,
                    data={
                        "messages_count_before": len(original_turns),
                        "messages_count_after": len(self.messages),
                        "first_section_count": len(first_messages),
                        "summary_pairs": len(result.messages) // 2,
                        "last_section_count": len(last_messages),
                        "original_token_count": result.original_tokens,
                        "new_token_count": new_token_count,
                        "tokens_saved": result.original_tokens - new_token_count,
                        "compression_ratio": result.compression_ratio,
                        "summary_content": summary_text,
                        "preserved_messages": len(first_messages) + len(last_messages),
                        "replaced_with_summary": len(result.messages),
                        "has_summary_in_results": any(
                            "Conversation Summary" in str(msg.get("content", ""))
                            for msg in self.messages
                        ),
                        "original_message_count": len(original_turns),
                        "summary_message_found": any(
                            "Previous conversation summary:" in str(msg.get("content", "")) 
                            for msg in self.messages
                        ),
                        "summary_content_check": [
                            {"index": i, "has_summary": "Conversation Summary" in str(msg.get("content", ""))}
                            for i, msg in enumerate(self.messages)
                        ],
                        "message_roles_after": [msg.get("role", "unknown") for msg in self.messages],
                        "session_structure": f"Replaced {len(original_turns)} messages with {len(first_messages)} first + {len(result.messages)} summary + {len(last_messages)} last = {len(self.messages)} total messages"
                    },
                    category="SESSION_MESSAGES_REPLACED"
                )
                
                # Record metrics
                self.metrics_store.record_summarization(
                    pre_summary_tokens=result.original_tokens,
                    post_summary_tokens=result.summary_tokens,
                    session_id=self.session_id
                )
                
                debug.log(
                    event="summarization_success",
                    session_id=self.session_id,
                    data={
                        "original_tokens": original_full_token_count,  # All original tokens  
                        "summary_tokens": new_token_count,  # All new tokens after replacement
                        "compression_ratio": new_token_count / original_full_token_count if original_full_token_count > 0 else 1.0,
                        "new_turns_count": len(self.messages),
                        "original_message_count": len(original_turns),
                        "middle_section_message_count": len(middle_messages),
                        "replaced_with_summary_message_count": len(result.messages),
                        "messages_preserved": len(first_messages) + len(last_messages)
                    },
                    category="SUMMARIZATION"
                )
                
                return True
                
            except Exception as e:
                import traceback
                error_trace = traceback.format_exc()
                
                debug.log(
                    event="summarization_exception",
                    session_id=self.session_id,
                    data={
                        "error": str(e),
                        "error_type": type(e).__name__,
                        "traceback": error_trace
                    },
                    category="SUMMARIZATION_ERROR"
                )
                return False
        
        return False
    
    # Add the method to the session instance
    import types
    session.maybe_summarize = types.MethodType(maybe_summarize, session)