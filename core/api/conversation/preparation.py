"""Conversation preparation for API submission."""

from typing import List, Dict, Optional, Any, Tuple
import time
from anthropic import Anthropic
from core.config_manager import get_config
from debug.debug_logger import debug
from core.configuration import DebugConfig
from .types import ConversationTurn, PreparedConversation
from .summarizer import ConversationSummarizer
from .tokens import TokenCounter
from .boundaries import BoundaryAdjuster
from ..utils import _maybe_filter_to_n_most_recent_images

class ConversationPreparator:
    """Prepares conversations for API submission."""
    
    def __init__(self, client: Anthropic):
        self.client = client
        self.config = get_config()
        self.token_counter = TokenCounter(client)

    def _analyze_messages(
        self,
        messages: List[ConversationTurn]
    ) -> Tuple[Dict[str, int], Dict[str, int], Dict[str, int]]:
        """Analyze messages to get counts and calculate boundaries."""
        # Get message counts
        msg_counts = {
            'total_messages': len(messages),
            'has_unpaired': len(messages) > 0 and messages[-1]["role"] == "user"
        }
        msg_counts['paired_count'] = msg_counts['total_messages'] - (1 if msg_counts['has_unpaired'] else 0)
        msg_counts['total_pairs'] = msg_counts['paired_count'] // 2

        # Get minimum pairs configuration with protection against null values
        min_first_pairs = self.config.get('ai.conversation.section.first.min_pairs') or 2
        min_middle_pairs = self.config.get('ai.conversation.section.middle.min_pairs') or 1
        min_last_pairs = self.config.get('ai.conversation.section.last.min_pairs') or 2

        # Calculate boundaries
        first_boundary = min_first_pairs * 2
        raw_last = msg_counts['paired_count'] - (min_last_pairs * 2)
        last_boundary = max(first_boundary, raw_last)
        
        section_sizes = {
            'first_boundary': first_boundary,
            'last_boundary': last_boundary,
            'min_middle_pairs': min_middle_pairs
        }

        min_pairs = {
            'first': min_first_pairs,
            'middle': min_middle_pairs,
            'last': min_last_pairs
        }

        return msg_counts, section_sizes, min_pairs
        
    def _store_short_version(self, result: List[Dict], session: Any = None, session_id: Optional[str] = None) -> None:
        """
        Store shortened version of messages in session's short_messages attribute.
        This ONLY updates the short_messages property, not the main messages.
        Regular message updates should go through set_session_messages().
        
        Args:
            result: The shortened message list
            session: Session object that should have short_messages attribute
            session_id: Optional session ID for logging
        """
        if session is None or not hasattr(session, 'short_messages'):
            return  # Only store if session has short_messages attribute
            
        # Store only in short_messages, never modify main messages
        session.short_messages = result.copy()

    def _validate_messages(self, messages: List[ConversationTurn]) -> None:
        """Validate message structure and content."""
        if not messages:
            raise ValueError("Empty message list")
            
        for msg in messages:
            if "role" not in msg or "content" not in msg:
                raise ValueError(f"Invalid message structure: {msg}")
            if msg["role"] not in ["user", "assistant"]:
                raise ValueError(f"Invalid role: {msg['role']}")
            if not isinstance(msg["content"], list):
                raise ValueError(f"Content must be a list: {msg}")
                
    async def prepare_for_api(
        self,
        messages: List[ConversationTurn],
        system: Optional[str] = None,
        tools: Optional[List[Dict]] = None,
        only_n_most_recent_images: Optional[int] = None,
        session_id: Optional[str] = None,
        session: Optional[Any] = None
    ) -> PreparedConversation:
        """Prepare conversation messages for API submission."""
        start_time = time.perf_counter()
        
        try:
            # Analyze messages and get boundaries
            msg_counts, section_sizes, min_pairs = self._analyze_messages(messages)

            debug.log(
                event="preparation_analyze_boundaries",
                session_id=session_id,
                data={
                    "msg_counts": msg_counts,
                    "section_sizes": section_sizes,
                    "min_pairs": min_pairs
                },
                category="PROCESS_BOUNDARY",
                module="core.api.conversation.preparation"
            )

            # Get current token count
            current_token_count = self.token_counter.count_tokens(
                messages=messages,
                system=system,
                tools=tools,
                session_id=session_id
            )
            
            # Check if we need to adjust message count
            max_context = self.config.get('ai.models.claude3.max_context_tokens') or 200000
            threshold_value = self.config.get('ai.token_management.summary_triggers.threshold_percentage')
            threshold = float(threshold_value if threshold_value is not None else 0.8)
            
            threshold_exceeded = (current_token_count / max_context) > threshold
            min_total_pairs = min_pairs['first'] + min_pairs['middle'] + min_pairs['last']

            if threshold_exceeded:
                if msg_counts['total_pairs'] > min_total_pairs:
                    adjusted_first, adjusted_last = BoundaryAdjuster.adjust_boundaries(
                        messages=messages,
                        first_boundary=section_sizes['first_boundary'],
                        last_boundary=section_sizes['last_boundary'],
                        has_unpaired=msg_counts['has_unpaired'],
                        min_middle_pairs=section_sizes['min_middle_pairs'],
                        session_id=session_id
                    )
                    


                    will_proceed = adjusted_first is not None and adjusted_last is not None
                    debug.log(
                        event="preparation_threshold_boundary",
                        session_id=session_id,
                        data={
                            "original_first": section_sizes['first_boundary'],
                            "original_last": section_sizes['last_boundary'],
                            "adjusted_first": adjusted_first,
                            "adjusted_last": adjusted_last,
                            "will_proceed": will_proceed
                        },
                        category="PROCESS_BOUNDARY"
                    )

                    if adjusted_first is not None and adjusted_last is not None:
                        # Get sections
                        first_messages = messages[:adjusted_first]
                        middle_messages = messages[adjusted_first:adjusted_last]
                        last_messages = messages[adjusted_last:msg_counts['paired_count']]
                        
                        if msg_counts['has_unpaired']:
                            last_messages.append(messages[-1])
                        
                        # Log message content being summarized
                        for i, msg in enumerate(middle_messages):
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
                                event="message_in_middle_section",
                                session_id=session_id,
                                category="MESSAGE_CONTENT",
                                data={
                                    "message_index": adjusted_first + i,
                                    "section_index": i,
                                    "role": msg.get("role", "unknown"),
                                    "content": content_text,
                                    "section": "middle_to_be_summarized"
                                }
                            )
                            
                        debug.log(
                            event="conversation_sections_created",
                            session_id=session_id,
                            data={
                                "message": f"CONVERSATION DIVIDED: First section: {len(first_messages)//2} pairs, Middle section: {len(middle_messages)//2} pairs (will be summarized), Last section: {len(last_messages)//2} pairs",
                                "first_section_pairs": len(first_messages)//2,
                                "middle_section_pairs": len(middle_messages)//2,
                                "last_section_pairs": len(last_messages)//2,
                                "total_message_count": len(messages)
                            },
                            category="SUMMARIZATION"
                        )
                            
                        # Log detailed section information to verify pair preservation
                        debug.log(
                            event="section_division_details",
                            session_id=session_id,
                            data={
                                "first_section": {
                                    "message_count": len(first_messages),
                                    "pair_count": len(first_messages) // 2,
                                    "min_required_pairs": min_pairs['first'],
                                    "boundary_index": adjusted_first,
                                    "roles": [msg.get("role", "unknown") for msg in first_messages[:5]] + (["..."] if len(first_messages) > 5 else [])
                                },
                                "middle_section": {
                                    "message_count": len(middle_messages),
                                    "pair_count": len(middle_messages) // 2,
                                    "min_required_pairs": min_pairs['middle'],
                                    "start_index": adjusted_first,
                                    "end_index": adjusted_last,
                                    "roles": [msg.get("role", "unknown") for msg in middle_messages[:5]] + (["..."] if len(middle_messages) > 5 else [])
                                },
                                "last_section": {
                                    "message_count": len(last_messages),
                                    "pair_count": len(last_messages) // 2 if not msg_counts['has_unpaired'] else (len(last_messages) - 1) // 2,
                                    "min_required_pairs": min_pairs['last'],
                                    "has_unpaired": msg_counts['has_unpaired'],
                                    "boundary_index": adjusted_last,
                                    "roles": [msg.get("role", "unknown") for msg in last_messages[:5]] + (["..."] if len(last_messages) > 5 else [])
                                },
                                "config": {
                                    "first_min_pairs": self.config.get('ai.conversation.section.first.min_pairs'),
                                    "middle_min_pairs": self.config.get('ai.conversation.section.middle.min_pairs'),
                                    "last_min_pairs": self.config.get('ai.conversation.section.last.min_pairs')
                                }
                            },
                            category="SECTION_BOUNDARIES"
                        )

                        # Initialize summary result
                        middle_summary = None

                        # Check if middle section has enough pairs for summary
                        middle_pairs = len(middle_messages) // 2
                        min_pairs_for_summary = self.config.get('ai.conversation.summary.min_pairs', 2)

                        debug.log(
                            event="preparation_threshold_boundary",
                            session_id=session_id,
                            data={
                                "middle_pairs": middle_pairs,
                                "min_pairs_for_summary": min_pairs_for_summary,
                                "will_summarize": middle_pairs >= min_pairs_for_summary,
                                "middle_messages_length": len(middle_messages)
                            },
                            category="PROCESS_BOUNDARY"
                        )

                        if middle_pairs >= min_pairs_for_summary:
                            summarizer = ConversationSummarizer(self.client)
                            middle_summary = await summarizer.create_summary(
                                messages=middle_messages,
                                session_id=session_id
                            )

                        if middle_summary and middle_summary.was_successful:

                            result = (
                                first_messages +
                                middle_summary.messages +
                                last_messages
                            )



                            messages = result
                            self._store_short_version(result, session, session_id)

            # Validate final message structure
            self._validate_messages(messages)
            
            # Create copy to avoid mutations
            prepared = [
                {
                    "role": msg["role"],
                    "content": [
                        block.model_copy() if hasattr(block, "model_copy")
                        else block.copy() if hasattr(block, "copy")
                        else block
                        for block in msg["content"]
                    ]
                }
                for msg in messages
            ]
            
            # Filter images if requested
            if only_n_most_recent_images:
                _maybe_filter_to_n_most_recent_images(
                    prepared, 
                    only_n_most_recent_images
                )

            # Get accurate final token count
            token_count = self.token_counter.count_tokens(
                messages=prepared,
                system=system,
                tools=tools,
                session_id=session_id
            )
            
            # Check if token count exceeds threshold
            max_context = self.config.get('ai.models.claude3.max_context_tokens') or 200000
            threshold_value = self.config.get('ai.token_management.summary_triggers.threshold_percentage')
            threshold = float(threshold_value if threshold_value is not None else 0.8)
            needs_summary = (token_count / max_context) > threshold
            
            # Log token threshold check
            debug.log(
                event="preparation_token_threshold",
                session_id=session_id,
                data={
                    "token_count": token_count,
                    "max_context": max_context,
                    "threshold": threshold,
                    "threshold_percentage": (token_count / max_context),
                    "needs_summary": needs_summary
                },
                category="TOKEN_THRESHOLDS",
                module="core.api.conversation.preparation"
            )
            
            result = PreparedConversation(
                messages=prepared,
                token_count=token_count,
                needs_summary=needs_summary,
                has_summary=False,
                preparation_time=time.perf_counter() - start_time
            )
            
            return result
            
        except Exception as e:
            raise