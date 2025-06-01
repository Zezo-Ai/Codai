"""Conversation history management."""
from typing import Any, List, Dict, Optional, Union

from debug.debug_logger import debug
from ..metrics import TokenMetricsStore

class ConversationHistory:
    """Manages conversation history with summarization support.
    
    DEPRECATED: This class is being phased out in favor of using SessionState directly.
    It is provided for backward compatibility and will be removed in a future version.
    """
    
    def __init__(self, session_id: str):
        if not session_id:
            raise ValueError("session_id is required for ConversationHistory")
        self.session_id = session_id
        self.turns: List[dict] = []  # Original full conversation
        self._short_messages: Optional[List[dict]] = None  # Short version when created
        self.is_summarized: bool = False
        self.metrics_store = TokenMetricsStore()
        self._session = None  # Will be set by SessionState to maintain sync
        
    @property
    def short_messages(self) -> Optional[List[dict]]:
        debug.log(
            event="conversation_short_messages_access",
            session_id=self.session_id,
            data={
                "has_short_version": self._short_messages is not None,
                "message_count": len(self._short_messages) if self._short_messages else 0,
                "turns_count": len(self.turns)
            },
            category="CONVERSATION_PREPARATION"
        )
        return self._short_messages
        
    @short_messages.setter
    def short_messages(self, value: Optional[List[dict]]) -> None:
        self._short_messages = value
        debug.log(
            event="conversation_short_messages_updated",
            session_id=self.session_id,
            data={
                "has_short_version": value is not None,
                "message_count": len(value) if value else 0,
                "turns_count": len(self.turns),
                "has_unpaired": value[-1]["role"] == "user" if value else False
            },
            category="CONVERSATION_PREPARATION"
        )
        
    def add_turn(self, role: str, content: List[Any]) -> None:
        """
        Add turn to conversation history with specified role.
        
        Args:
            role: The role (user or assistant)
            content: Message content
        """
        turn = {
            "role": role,
            "content": content
        }
        self.turns.append(turn)

    def add_turn_assistant(self, content: List[Any]) -> None:
        """Add assistant turn to conversation history."""
        turn = {
            "role": "assistant",
            "content": content
        }
        self.turns.append(turn)
        
    def add_turn_user(
        self,
        content: Union[List[Any], str, Dict],
        is_tool_result: bool = False
    ) -> None:
        """
        Add user turn to conversation history.
        
        Args:
            content: Message content in various formats
            is_tool_result: Whether content is from tool execution
        """
        if is_tool_result:
            if isinstance(content, list):
                turn = {"role": "user", "content": content}
            elif isinstance(content, dict):
                turn = {"role": "user", "content": [content]}
            else:
                turn = {
                    "role": "user",
                    "content": [{
                        "type": "tool_result",
                        "content": [{
                            "type": "text",
                            "text": str(content)
                        }],
                        "tool_use_id": "unknown",
                        "is_error": True
                    }]
                }
        else:
            turn = {
                "role": "user",
                "content": (
                    [{"type": "text", "text": content}]
                    if isinstance(content, str)
                    else content
                )
            }
            
        if turn:
            self.turns.append(turn)

            
    def get_turns(self, use_short: bool = False) -> List[dict]:
        """
        Get conversation turns.
        
        Args:
            use_short: If True and short version exists, return that instead
            
        Returns:
            List of message turns (either full or short version)
        """
        if use_short and self.short_messages is not None:
            # Return copy of short version if it exists
            return [
                {
                    "role": msg["role"],
                    "content": [
                        block.copy() if hasattr(block, "copy")
                        else block.model_copy() if hasattr(block, "model_copy")
                        else block
                        for block in msg["content"]
                    ]
                }
                for msg in self.short_messages
            ]
            
        # Otherwise return full version
        return [
            {
                "role": turn["role"],
                "content": [
                    block.model_copy() if hasattr(block, "model_copy")
                    else block.copy() if hasattr(block, "copy")
                    else block
                    for block in turn["content"]
                ]
            }
            for turn in self.turns
        ]
        
    def has_short_version(self) -> bool:
        """Check if short version exists."""
        return self.short_messages is not None
        
    async def maybe_summarize(
        self,
        client: Any,  # Type as Any to avoid circular import
        token_count: int,
        current_messages: List[Dict],
        system_prompt: Optional[str] = None,
        tools: Optional[List[Dict]] = None
    ) -> bool:
        """
        Check and perform summarization if needed.
        Uses complete token count including all components.
        
        Returns:
            bool: True if summarization was performed successfully
        """
        from debug.debug_logger import debug
        
        # Override checks for testing - force summarization if threshold exceeded
        # We'll check token count ourselves first
        from core.config_manager import get_config
        config = get_config()
        percentage = (token_count / 200000)  # Hardcode max tokens for now
        threshold_value = config.get('ai.token_management.summary_triggers.threshold_percentage')
        threshold = float(threshold_value if threshold_value is not None else 0.8)
        token_threshold_exceeded = percentage > threshold
        
        # If we have no turns but have current_messages, use them as turns
        if len(self.turns) == 0 and current_messages and len(current_messages) > 0:
            debug.log(
                event="populating_empty_turns",
                session_id=self.session_id,
                data={"message_count": len(current_messages)},
                category="SUMMARIZATION"
            )
            
            # Add current messages to turns
            for msg in current_messages:
                if msg["role"] == "user":
                    self.add_turn_user(msg["content"])
                else:
                    self.add_turn_assistant(msg["content"])

        # Check minimum message count
        has_enough_messages = len(self.turns) >= 4  # Minimum 4 messages needed

        # FORCE should_summarize to true if we have enough messages and we're over the threshold
        # This ensures auto-summarization works reliably
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
                "turns_count": len(self.turns),
                "is_already_summarized": self.is_summarized,
                "has_current_messages": bool(current_messages) and len(current_messages) > 0
            },
            category="SUMMARIZATION"
        )
            
        if should_summarize:
            try:
                from ..api.conversation import ConversationSummarizer
                summarizer = ConversationSummarizer(client)
                
                debug.log(
                    event="summarization_started",
                    session_id=self.session_id,
                    data={"turns_to_summarize": len(self.turns)},
                    category="SUMMARIZATION"
                )
                
                # Execute the summarization
                result = await summarizer.create_summary(
                    messages=self.turns,
                    session_id=self.session_id
                )
                
                # Check if summarization was successful
                if not result.was_successful:
                    debug.log(
                        event="summarization_failed",
                        session_id=self.session_id,
                        data={"error": result.error},
                        category="SUMMARIZATION_ERROR"
                    )
                    return False
                
                # Save copy of original turns before they're replaced
                original_turns = self.turns.copy()
                
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
                
                # Update conversation with summary
                # Clear existing turns and replace with summary
                self.turns = []
                self.turns = result.messages.copy()
                self.is_summarized = True
                
                # Make sure short_messages is updated too
                self.short_messages = result.messages.copy()
                
                # Extract summary content for readability
                summary_text = ""
                if result.messages and len(result.messages) > 0:
                    # Get the first message (user message with the summary)
                    user_message = result.messages[0]
                    if "content" in user_message and len(user_message["content"]) > 0:
                        for content_block in user_message["content"]:
                            if isinstance(content_block, dict) and "text" in content_block:
                                summary_text += content_block["text"] + "\n"
                
                # Log explicit message replacement information with content and original messages
                debug.log(
                    event="session_messages_replaced",
                    session_id=self.session_id,
                    data={
                        "messages_count": len(self.turns),
                        "summary_pairs": len(result.messages) // 2,
                        "original_tokens": result.original_tokens,
                        "summary_tokens": result.summary_tokens,
                        "compression_ratio": result.compression_ratio,
                        "summary_content": summary_text,
                        "original_messages": original_turns
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
                        "original_tokens": result.original_tokens,
                        "summary_tokens": result.summary_tokens,
                        "compression_ratio": result.compression_ratio,
                        "new_turns_count": len(self.turns)
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

    def __len__(self) -> int:
        return len(self.turns)