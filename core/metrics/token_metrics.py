"""Token metrics and usage tracking."""
from typing import Dict

from debug.debug_logger import debug


class TokenMetricsStore:
    """Manages token metrics and summarization thresholds."""
    
    def __init__(self):
        self.token_limit = 200000  # Claude's context limit
        self.token_warning = int(self.token_limit * 0.9)  # 90% warning threshold
        self.summarization_trigger = int(self.token_limit * 0.8)  # 80% summarization trigger
        
    def check_token_limit(self, token_count: int) -> bool:
        """Check if token count exceeds summarization threshold."""
        return token_count >= self.summarization_trigger
        
    def record_summarization(
        self,
        pre_summary_tokens: int,
        post_summary_tokens: int,
        session_id: str
    ) -> None:
        """Record summarization metrics."""
        debug.log(
            event="summarization_metrics",
            session_id=session_id,
            category="TOKEN_MANAGEMENT",
            data={
                "pre_tokens": pre_summary_tokens,
                "post_tokens": post_summary_tokens,
                "reduction": pre_summary_tokens - post_summary_tokens,
                "reduction_percent": round(
                    (pre_summary_tokens - post_summary_tokens) / pre_summary_tokens * 100, 1
                )
            }
        )