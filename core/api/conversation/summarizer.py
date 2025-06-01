"""Conversation summarization with content preservation."""

from typing import List, Dict, Optional, Union, Any
import time
from dataclasses import dataclass
from anthropic import Anthropic
from core.config_manager import get_config
from debug.debug_logger import debug
from .types import ConversationTurn, SummarizationResult
from core.configuration import (
    ModelConfig, ConversationConfig, APIConfig
)
from .tokens import TokenCounter

@dataclass
class ContentReference:
    """Structured reference to conversation content."""
    type: str
    description: str
    metadata: Dict[str, str]

class ConversationSummarizer:
    """Handles conversation summarization with content preservation."""
    
    def __init__(self, client: Anthropic):
        self.client = client
        self.config = get_config()
        self.token_counter = TokenCounter(client)
        
    def _process_text_content(self, block: Dict) -> ContentReference:
        """Process text content."""
        return ContentReference(
            type="text",
            description=block["text"],
            metadata={"length": str(len(block["text"]))}
        )
        
    def _process_image_content(self, block: Dict) -> ContentReference:
        """Process image content."""
        source = block.get('source', {}).get('data', '')[:20] + '...'  # Truncate for logging
        return ContentReference(
            type="image",
            description=f"[Shared image{': ' + source if source else ''}]",
            metadata={"type": "image"}
        )
        
    def _process_code_content(self, block: Dict) -> ContentReference:
        """Process code content."""
        language = block.get('language', 'unknown')
        code = block.get('code', '')
        return ContentReference(
            type="code",
            description=f"[Code block in {language}:\n{code}\n]",
            metadata={
                "language": language,
                "length": str(len(code))
            }
        )
        
    def _process_content_block(self, block: Union[Dict, Any]) -> ContentReference:
        """Process any content block type."""
        try:
            # Handle both dict and BetaTextBlock objects
            if hasattr(block, 'type'):
                block_type = block.type
                if block_type == "text":
                    return ContentReference(
                        type="text",
                        description=block.text if hasattr(block, 'text') else str(block),
                        metadata={"length": str(len(block.text)) if hasattr(block, 'text') else "0"}
                    )
            else:
                block_type = block.get("type", "unknown")
                if block_type == "text":
                    return self._process_text_content(block)
                elif block_type == "image":
                    return self._process_image_content(block)
                elif block_type == "code":
                    return self._process_code_content(block)
            
            return ContentReference(
                type="unknown",
                description=f"[Content of type: {block_type}]",
                metadata={"original_type": block_type}
            )
            
        except Exception as e:

            return ContentReference(
                type="error",
                description="[Content processing error]",
                metadata={"error": str(e)}
            )
            
    def _build_conversation_context(
        self,
        messages: List[ConversationTurn]
    ) -> str:
        """Build full conversation context preserving content types."""
        context_parts = []
        
        for msg in messages:
            try:
                role = msg["role"].capitalize()
                content = msg["content"]
                
                processed_blocks = [
                    self._process_content_block(block)
                    for block in content
                ]
                
                # Group similar consecutive content types
                grouped_content = []
                current_group = []
                current_type = None
                
                for block in processed_blocks:
                    if block.type != current_type and current_group:
                        if current_type == "text":
                            grouped_content.append(
                                " ".join(b.description for b in current_group)
                            )
                        else:
                            grouped_content.extend(b.description for b in current_group)
                        current_group = []
                    current_type = block.type
                    current_group.append(block)
                
                # Handle last group
                if current_group:
                    if current_type == "text":
                        grouped_content.append(
                            " ".join(b.description for b in current_group)
                        )
                    else:
                        grouped_content.extend(b.description for b in current_group)
                
                full_content = " ".join(grouped_content)
                context_parts.append(f"{role}: {full_content}")
                
            except Exception as e:

                context_parts.append(f"{role}: [Message processing error]")
        
        return "\n\n".join(context_parts)
        
    async def create_summary(
        self,
        messages: List[ConversationTurn],
        session_id: Optional[str] = None
    ) -> SummarizationResult:
        """
        Create a summary pair from given messages while preserving content types.
        
        Args:
            messages: List of conversation turns to summarize
            session_id: Optional session ID for logging
            
        Returns:
            SummarizationResult with summary pair and metrics
            
        Note:
            Returns exactly 2 messages:
            1. Summary message (user)
            2. Summary acknowledgment (assistant)
        """
        # Get initial token count
        try:
            original_tokens = self.token_counter.count_tokens(
                messages=messages,
                session_id=session_id
            )
        except Exception as e:

            return SummarizationResult.create_failed_result(
                messages=messages,
                original_tokens=0,
                error=f"Token counting failed: {str(e)}"
            )
            
        debug.log(
            event="summarizer_minimum_messages_check",
            session_id=session_id,
            data={
                "messages_length": len(messages),
                "minimum_required": 4,
                "will_summarize": len(messages) >= 4,
                "original_tokens": original_tokens
            },
            category="PROCESS_BOUNDARY",
            module="core.api.conversation.summarizer"
        )

        # We need at least 4 messages to summarize (to get down to 2 pairs)
        if len(messages) < 4:
            return SummarizationResult(
                messages=messages,
                original_tokens=original_tokens,
                summary_tokens=original_tokens,  # Same since no summarization
                compression_ratio=1.0
            )

        try:
            # Build context preserving all content types
            conversation_context = self._build_conversation_context(messages)

            # Get configuration
            model_config = get_model_config()
            summarization_config = get_summarization_config()
            model = model_config["model"]
            max_tokens = model_config["max_tokens_per_message"]
            
            # Prepare summarization request
            summary_request = {
                "role": "user",
                "content": [{
                    "type": "text",
                    "text": (
                        "Summarize this conversation while preserving references to "
                        "all content types and their relationships:\n\n"
                        f"{conversation_context}\n\n"
                        "Important: Maintain references to all shared content (images, "
                        "code, etc) and preserve the context of how they were used. "
                        "Make the summary self-contained so future messages can "
                        "reference any shared content."
                    )
                }]
            }

            # Clear system prompt
            system_prompt = [{
                "type": "text",
                "text": (
                    "You are a precise conversation summarizer. Create a detailed "
                    "summary that preserves references to all content types (images, "
                    "code, etc) and maintains the context of how they were used. "
                    "Keep the summary focused and factual."
                )
            }]



            # Get summary from API with detailed error handling
            try:
                debug.log(
                    event="attempting_summary_api_call",
                    session_id=session_id,
                    data={
                        "model": model,
                        "max_tokens": max_tokens,
                        "messages_count": len(messages),
                        "context_length": len(conversation_context)
                    },
                    category="SUMMARIZATION_API"
                )
                
                response = self.client.messages.create(
                    model=model,
                    max_tokens=max_tokens,
                    messages=[summary_request],
                    system=system_prompt,
                    temperature=0,
                    stream=False
                )
                
                debug.log(
                    event="summary_api_response_received",
                    session_id=session_id,
                    data={
                        "response_success": True,
                        "has_content": bool(response.content),
                        "content_blocks": len(response.content) if response.content else 0
                    },
                    category="SUMMARIZATION_API"
                )
            except Exception as e:
                # Log the specific error that occurred
                debug.log(
                    event="summary_api_call_failed",
                    session_id=session_id,
                    data={
                        "error": str(e),
                        "error_type": type(e).__name__,
                        "request_details": {
                            "model": model,
                            "system_prompt_length": len(str(system_prompt)),
                            "context_length": len(conversation_context)
                        }
                    },
                    category="SUMMARIZATION_ERROR"
                )
                return SummarizationResult.create_failed_result(
                    messages=messages,
                    original_tokens=original_tokens,
                    error=f"API call failed: {str(e)}"
                )
            
            if not response.content:
                return SummarizationResult.create_failed_result(
                    messages=messages,
                    original_tokens=original_tokens,
                    error="Empty response from API"
                )

            # Extract summary text
            summary_text = "".join(
                block.text for block in response.content
                if hasattr(block, 'text')
            )
            
            if not summary_text:
                return SummarizationResult.create_failed_result(
                    messages=messages,
                    original_tokens=original_tokens,
                    error="No text content in summary"
                )



            # Calculate number of pairs being summarized
            summarized_pairs = len(messages) // 2

            # Create summary pair structure
            summary_marker = self.config.get(
                'ai.token_management.summarization.structure.summary_marker',
                "Previous conversation summary:"
            )
            
            acknowledgment = self.config.get(
                'ai.token_management.summarization.structure.assistant_acknowledgment',
                "Understood. Continuing with this context."
            )

            # Add timestamp to the summary message
            from datetime import datetime
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            # Construct a clear summary message with timestamp and count information
            summary_message = (
                f"{summary_marker} [Generated at {timestamp}]\n"
                f"Summary of {summarized_pairs} conversation pairs ({original_tokens} tokens):\n\n"
                f"{summary_text}"
            )
            
            # Use the debug module imported at the top of the file
            debug.log(
                event="creating_summary_pair",
                session_id=session_id,
                data={
                    "original_pairs": summarized_pairs,
                    "original_tokens": original_tokens,
                    "summary_length": len(summary_text),
                    "has_summary": bool(summary_text),
                    "timestamp": timestamp
                },
                category="SUMMARIZATION"
            )
            
            summarized_messages = [
                # Summary pair
                {
                    "role": "user",
                    "content": [{
                        "type": "text",
                        "text": summary_message
                    }]
                },
                {
                    "role": "assistant",
                    "content": [{
                        "type": "text",
                        "text": acknowledgment
                    }]
                }
            ]
            
            # Log detailed summary information
            preview_length = min(200, len(summary_text))
            summary_preview = summary_text[:preview_length] + "..." if len(summary_text) > preview_length else summary_text
            
            debug.log(
                event="summary_content",
                session_id=session_id,
                data={
                    "message": f"SUMMARY CREATED: {summary_preview}",
                    "summary_length": len(summary_text),
                    "original_messages": len(messages)
                },
                category="SUMMARIZATION"
            )
            
            # Log full summary as a message
            debug.log(
                event="summary_full_content",
                session_id=session_id,
                category="MESSAGE_CONTENT",
                data={
                    "message_type": "SUMMARY",
                    "content": summary_text,
                    "original_message_count": len(messages)
                }
            )
            
            debug.log(
                event="summary_pair_created",
                session_id=session_id,
                data={
                    "message_count": len(summarized_messages),
                    "summary_message_length": len(summary_message),
                    "original_messages_count": len(messages),
                    "summary_content": summary_text
                },
                category="SUMMARIZATION"
            )



            # Get token count of summarized messages
            try:
                summary_tokens = self.token_counter.count_tokens(
                    messages=summarized_messages,
                    session_id=session_id
                )
            except Exception as e:

                return SummarizationResult.create_failed_result(
                    messages=messages,
                    original_tokens=original_tokens,
                    error=f"Summary token counting failed: {str(e)}"
                )
            
            # Ensure summary is actually smaller
            if summary_tokens >= original_tokens:

                return SummarizationResult.create_failed_result(
                    messages=messages,
                    original_tokens=original_tokens,
                    error="Summary would be larger than original"
                )

            # Calculate compression ratio
            compression_ratio = summary_tokens / original_tokens
            
            # Create successful result
            result = SummarizationResult(
                messages=summarized_messages,
                original_tokens=original_tokens,
                summary_tokens=summary_tokens,
                compression_ratio=compression_ratio
            )
            


            return result

        except Exception as e:

            return SummarizationResult.create_failed_result(
                messages=messages,
                original_tokens=original_tokens,
                error=str(e)
            )