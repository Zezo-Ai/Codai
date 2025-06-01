"""Thinking token tracking for extended thinking.

This module provides metrics tracking specifically for thinking tokens used by extended thinking,
allowing better cost analysis and optimization of thinking budgets.
"""

from dataclasses import dataclass
from typing import Dict, List, Optional
import time
from threading import Lock

@dataclass
class ThinkingTokenUsage:
    """Track thinking token usage."""
    timestamp: float
    session_id: str
    thinking_tokens: int
    thinking_budget: int
    thinking_percentage: float  # How much of the budget was used
    task_type: str  # Detected task type (code, analysis, etc.)
    prompt_length: int  # Length of the prompt that triggered thinking

class ThinkingTokenTracker:
    """Track and analyze thinking token usage."""
    
    def __init__(self):
        self._records: List[ThinkingTokenUsage] = []
        self._lock = Lock()
        
    def record_usage(self, usage: ThinkingTokenUsage) -> None:
        """Add a thinking token usage record."""
        with self._lock:
            self._records.append(usage)
    
    def get_summary_stats(self) -> Dict:
        """Get summary statistics about thinking token usage."""
        with self._lock:
            if not self._records:
                return {
                    "total_records": 0,
                    "avg_thinking_tokens": 0,
                    "avg_thinking_percentage": 0,
                    "task_type_breakdown": {},
                }
                
            total_records = len(self._records)
            total_thinking_tokens = sum(r.thinking_tokens for r in self._records)
            avg_thinking_tokens = total_thinking_tokens / total_records
            avg_thinking_percentage = sum(r.thinking_percentage for r in self._records) / total_records
            
            # Get breakdown by task type
            task_types = {}
            for record in self._records:
                task_type = record.task_type
                if task_type not in task_types:
                    task_types[task_type] = {
                        "count": 0,
                        "total_tokens": 0,
                        "avg_tokens": 0,
                        "avg_percentage": 0
                    }
                task_types[task_type]["count"] += 1
                task_types[task_type]["total_tokens"] += record.thinking_tokens
            
            # Calculate averages for each task type
            for task_type, stats in task_types.items():
                stats["avg_tokens"] = stats["total_tokens"] / stats["count"]
                stats["avg_percentage"] = (
                    sum(r.thinking_percentage for r in self._records if r.task_type == task_type) / 
                    stats["count"]
                )
            
            return {
                "total_records": total_records,
                "total_thinking_tokens": total_thinking_tokens,
                "avg_thinking_tokens": avg_thinking_tokens,
                "avg_thinking_percentage": avg_thinking_percentage,
                "task_type_breakdown": task_types,
            }
    
    def get_task_type_efficiency(self) -> Dict:
        """
        Analyze efficiency by task type to suggest optimal thinking budgets.
        
        Returns a dictionary with task types and recommended budgets.
        """
        with self._lock:
            if not self._records:
                return {}
                
            task_budgets = {}
            
            # Group records by task type
            for task_type in set(r.task_type for r in self._records):
                records = [r for r in self._records if r.task_type == task_type]
                if not records:
                    continue
                    
                # Calculate metrics for this task type
                avg_tokens = sum(r.thinking_tokens for r in records) / len(records)
                max_tokens = max(r.thinking_tokens for r in records)
                p95_tokens = sorted(r.thinking_tokens for r in records)[int(len(records) * 0.95)]
                
                # Suggest budget based on 95th percentile + 20% buffer
                suggested_budget = min(int(p95_tokens * 1.2), 64000)
                
                # Make sure it's at least the minimum
                suggested_budget = max(suggested_budget, 1024)
                
                # Round to nearest thousand for clean numbers
                suggested_budget = ((suggested_budget + 500) // 1000) * 1000
                
                task_budgets[task_type] = {
                    "avg_tokens": avg_tokens,
                    "max_tokens": max_tokens,
                    "p95_tokens": p95_tokens,
                    "suggested_budget": suggested_budget
                }
            
            return task_budgets

# Global singleton instance
thinking_token_metrics = ThinkingTokenTracker()