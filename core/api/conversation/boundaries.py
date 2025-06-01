"""
Boundary management for conversation sections.

This module handles the adjustment of section boundaries to ensure that logical message pairs
(user/assistant pairs and tool call/result pairs) are preserved during summarization.
"""

from typing import List, Dict, Tuple, Optional, Any
from debug.debug_logger import debug


class BoundaryAdjuster:
    """
    Handles the adjustment of conversation section boundaries.
    
    This class identifies important message pairs that should be preserved together
    and adjusts section boundaries to ensure these pairs aren't broken during summarization.
    """

    @staticmethod
    def check_for_tool_content(content: List[Dict], content_type: str) -> bool:
        """
        Check if a message content contains a specific tool block type.
        
        Args:
            content: List of content blocks to check
            content_type: Tool content type to look for (e.g., "tool_use", "tool_result")
            
        Returns:
            True if the content contains the specified tool type, False otherwise
        """
        if not content:
            return False
            
        return any(
            (isinstance(block, dict) and block.get("type") == content_type) or
            (hasattr(block, "type") and block.type == content_type) or
            (isinstance(block, str) and content_type in block)
            for block in content
        )
        
    @staticmethod
    def is_tool_call(message: Dict) -> bool:
        """
        Check if a message is a tool call (assistant message with tool_use content).
        
        Args:
            message: Message to check
            
        Returns:
            True if the message is a tool call, False otherwise
        """
        if not message or message.get("role") != "assistant":
            return False
        return BoundaryAdjuster.check_for_tool_content(message.get("content", []), "tool_use")
        
    @staticmethod
    def is_tool_result(message: Dict) -> bool:
        """
        Check if a message is a tool result (user message with tool_result content).
        
        Args:
            message: Message to check
            
        Returns:
            True if the message is a tool result, False otherwise
        """
        if not message or message.get("role") != "user":
            return False
        return BoundaryAdjuster.check_for_tool_content(message.get("content", []), "tool_result")
        
    @staticmethod
    def identify_message_pairs(messages: List[Dict]) -> List[Tuple[int, int, str]]:
        """
        Identify pairs of messages that should be preserved together.
        
        Finds two types of pairs:
        1. User/Assistant turn pairs
        2. Tool call/Tool result pairs
        
        Args:
            messages: List of conversation messages
            
        Returns:
            List of tuples (start_idx, end_idx, pair_type) where:
            - start_idx is the index of the first message in the pair
            - end_idx is the index of the second message in the pair
            - pair_type is either "user_assistant" or "tool_pair"
        """
        pairs = []
        
        # We need at least 2 messages to form a pair
        if len(messages) < 2:
            return pairs
            
        for i in range(len(messages) - 1):
            current_msg = messages[i]
            next_msg = messages[i + 1]
            
            # Check for user/assistant pair
            if current_msg.get("role") == "user" and next_msg.get("role") == "assistant":
                pairs.append((i, i + 1, "user_assistant"))
                
            # Check for tool call/result pair
            elif BoundaryAdjuster.is_tool_call(current_msg) and BoundaryAdjuster.is_tool_result(next_msg):
                pairs.append((i, i + 1, "tool_pair"))
                
        return pairs

    @staticmethod
    def validate_section_viability(
        first_boundary: int,
        last_boundary: int,
        msg_count: int,
        min_middle_pairs: int
    ) -> Tuple[bool, Optional[str]]:
        """
        Validate if the proposed section boundaries create viable sections.
        
        Args:
            first_boundary: Boundary index between first and middle sections
            last_boundary: Boundary index between middle and last sections
            msg_count: Total count of paired messages (excluding unpaired at end)
            min_middle_pairs: Minimum number of pairs required in middle section
            
        Returns:
            Tuple of (is_viable, reason) where:
            - is_viable is True if sections are viable, False otherwise
            - reason is None if viable, or a string explaining why not viable
        """
        # First section must not be empty
        if first_boundary <= 0:
            return False, "First section would be empty"
            
        # Last section must not be empty
        if last_boundary >= msg_count:
            return False, "Last section would be empty"
            
        # Boundaries must not cross
        if first_boundary >= last_boundary:
            return False, "Boundaries would cross"
            
        # Calculate middle section size and verify it meets minimum requirement
        middle_msg_count = last_boundary - first_boundary
        middle_pair_count = middle_msg_count // 2
        
        if middle_pair_count < min_middle_pairs:
            return False, f"Middle section too small (has {middle_pair_count} pairs, needs {min_middle_pairs})"
            
        return True, None

    @staticmethod
    def adjust_boundaries(
        messages: List[Dict],
        first_boundary: int,
        last_boundary: int,
        has_unpaired: bool,
        min_middle_pairs: int = 1,
        session_id: Optional[str] = None
    ) -> Tuple[Optional[int], Optional[int]]:
        """
        Adjust section boundaries to preserve message pairs.
        
        This algorithm focuses on preserving two types of pairs:
        1. User/Assistant turn pairs
        2. Tool call/Tool result pairs
        
        Args:
            messages: List of conversation messages
            first_boundary: Initial first section boundary
            last_boundary: Initial last section boundary
            has_unpaired: Whether the conversation has an unpaired message at the end
            min_middle_pairs: Minimum number of pairs required in middle section
            session_id: Optional session ID for logging
            
        Returns:
            Tuple of (adjusted_first_boundary, adjusted_last_boundary)
        """
        # ========== INITIALIZATION ==========
        
        # Handle empty conversations
        if not messages:
            debug.log(
                event="boundary_adjustment_empty_messages",
                session_id=session_id,
                data={"action": "returning_original_boundaries"},
                category="SUMMARIZATION"
            )
            return first_boundary, last_boundary

        # Calculate paired message count
        msg_count = len(messages) - (1 if has_unpaired else 0)
        if msg_count < 2:
            debug.log(
                event="boundary_adjustment_insufficient_messages",
                session_id=session_id,
                data={"msg_count": msg_count, "has_unpaired": has_unpaired},
                category="SUMMARIZATION"
            )
            return first_boundary, last_boundary

        # Start with original boundaries
        adjusted_first = first_boundary
        adjusted_last = last_boundary
        
        # Combined log for boundary adjustment
        debug.log(
            event="boundary_adjustment_start",
            session_id=session_id,
            data={
                "message": f"Starting boundary adjustment: first={first_boundary}, last={last_boundary}, msgs={msg_count}",
                "boundaries": [first_boundary, last_boundary],
                "msg_count": msg_count
            },
            category="SUMMARIZATION"
        )
        
        # ========== PAIR IDENTIFICATION ==========
        
        # Identify all preservable pairs in the conversation
        pairs = BoundaryAdjuster.identify_message_pairs(messages)
        
        user_assistant_pairs = sum(1 for _, _, p_type in pairs if p_type == "user_assistant")
        tool_pairs = sum(1 for _, _, p_type in pairs if p_type == "tool_pair")
        
        # Single log for pair identification
        debug.log(
            event="boundary_pairs_identified",
            session_id=session_id,
            data={
                "message": f"Found {len(pairs)} total pairs: {user_assistant_pairs} user/assistant pairs and {tool_pairs} tool pairs",
                "pairs": {
                    "total": len(pairs),
                    "user_assistant": user_assistant_pairs,
                    "tool": tool_pairs
                }
            },
            category="SUMMARIZATION"
        )
        
        # ========== BOUNDARY ADJUSTMENTS ==========
        
        # STEP 1: Adjust first boundary to not break any pairs
        for start_idx, end_idx, pair_type in pairs:
            # If a pair crosses the first boundary, move the boundary to before this pair
            if start_idx < first_boundary <= end_idx:
                adjusted_first = start_idx
                
                debug.log(
                    event="boundary_first_adjustment_details",
                    session_id=session_id,
                    data={
                        "message": f"First boundary adjusted from {first_boundary} to {adjusted_first} to preserve {pair_type} pair at indices {start_idx}-{end_idx}",
                        "original": first_boundary,
                        "adjusted": adjusted_first,
                        "pair_type": pair_type,
                        "pair_indices": [start_idx, end_idx]
                    },
                    category="SECTION_BOUNDARIES"
                )
                
                debug.log(
                    event="boundary_first_adjustment",
                    session_id=session_id,
                    data={
                        "reason": f"Pair of type {pair_type} would be broken",
                        "pair_indices": [start_idx, end_idx],
                        "adjusted_first": adjusted_first
                    },
                    category="SECTION_BOUNDARIES"
                )
                break
        
        # STEP 2: Adjust last boundary to not break any pairs
        for start_idx, end_idx, pair_type in pairs:
            # If a pair crosses the last boundary, move the boundary to after this pair
            if start_idx < last_boundary <= end_idx:
                adjusted_last = end_idx + 1  # Move to after the pair
                
                debug.log(
                    event="boundary_last_adjustment_details",
                    session_id=session_id,
                    data={
                        "message": f"Last boundary adjusted from {last_boundary} to {adjusted_last} to preserve {pair_type} pair at indices {start_idx}-{end_idx}",
                        "original": last_boundary,
                        "adjusted": adjusted_last,
                        "pair_type": pair_type,
                        "pair_indices": [start_idx, end_idx]
                    },
                    category="SECTION_BOUNDARIES"
                )
                
                debug.log(
                    event="boundary_last_adjustment",
                    session_id=session_id,
                    data={
                        "reason": f"Pair of type {pair_type} would be broken",
                        "pair_indices": [start_idx, end_idx],
                        "adjusted_last": adjusted_last
                    },
                    category="SECTION_BOUNDARIES"
                )
                break
        
        # STEP 3: Handle edge case for first boundary - preserve pairs at boundary
        if adjusted_first > 1:  # Need at least 2 messages to form a pair
            idx = adjusted_first - 1
            
            # Check if the message just before boundary is part of a pair
            for start_idx, end_idx, pair_type in pairs:
                if start_idx == idx - 1 and end_idx == idx:
                    # This is a pair at the boundary, move boundary to before this pair
                    adjusted_first = start_idx
                    
                    debug.log(
                        event="boundary_first_edge_adjustment",
                        session_id=session_id,
                        data={
                            "reason": f"Preserving {pair_type} pair at first boundary",
                            "pair_indices": [start_idx, end_idx],
                            "adjusted_first": adjusted_first
                        },
                        category="SECTION_BOUNDARIES"
                    )
                    break
                    
        # STEP 4: Handle edge case for last boundary - preserve pairs at boundary
        if adjusted_last < msg_count - 1:
            idx = adjusted_last
            
            # Check if the message at the boundary starts a pair
            for start_idx, end_idx, pair_type in pairs:
                if start_idx == idx and end_idx == idx + 1:
                    # This is a pair starting at the boundary, move boundary to after pair
                    adjusted_last = end_idx + 1
                    
                    debug.log(
                        event="boundary_last_edge_adjustment",
                        session_id=session_id,
                        data={
                            "reason": f"Preserving {pair_type} pair at last boundary",
                            "pair_indices": [start_idx, end_idx],
                            "adjusted_last": adjusted_last
                        },
                        category="SECTION_BOUNDARIES"
                    )
                    break

        # ========== VALIDATION ==========
        
        # Calculate pairs in each section for validation and logging
        pairs_in_first = adjusted_first // 2
        pairs_in_middle = (adjusted_last - adjusted_first) // 2
        pairs_in_last = (msg_count - adjusted_last) // 2
        
        # Perform final validation
        is_viable, reason = BoundaryAdjuster.validate_section_viability(
            adjusted_first, adjusted_last, msg_count, min_middle_pairs
        )
        
        # Combined log for section distribution and validation
        debug.log(
            event="boundary_validation_result",
            session_id=session_id,
            data={
                "message": f"Sections: First={pairs_in_first} pairs, Middle={pairs_in_middle} pairs, Last={pairs_in_last} pairs - {'VALID' if is_viable else 'INVALID: ' + str(reason)}",
                "pairs": {
                    "first": pairs_in_first,
                    "middle": pairs_in_middle,
                    "last": pairs_in_last
                },
                "is_valid": is_viable,
                "reason": reason if not is_viable else None
            },
            category="SUMMARIZATION"
        )
        
        # If not viable, revert to original boundaries
        if not is_viable:
            debug.log(
                event="boundary_adjustment_reverting",
                session_id=session_id,
                data={
                    "message": f"Reverting to original boundaries due to: {reason}",
                    "reason": reason
                },
                category="SUMMARIZATION"
            )
            return first_boundary, last_boundary
        
        # ========== SUCCESS SUMMARY ==========
        # For successful adjustments, we only need one final log
        was_adjusted = adjusted_first != first_boundary or adjusted_last != last_boundary
        
        if was_adjusted:
            debug.log(
                event="boundary_adjustment_complete",
                session_id=session_id,
                data={
                    "message": f"Boundaries adjusted: first: {first_boundary}->{adjusted_first}, last: {last_boundary}->{adjusted_last}",
                    "original": [first_boundary, last_boundary],
                    "final": [adjusted_first, adjusted_last],
                    "pairs": {
                        "first": pairs_in_first,
                        "middle": pairs_in_middle,
                        "last": pairs_in_last
                    }
                },
                category="SUMMARIZATION"
            )

        return adjusted_first, adjusted_last