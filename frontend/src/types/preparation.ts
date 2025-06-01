export interface PreparedConversation {
  token_count: number;
  needs_summary: boolean;
}

// Constants from config.py
export const MAX_CONTEXT_TOKENS = 200_000;
export const DEFAULT_THRESHOLD_PERCENTAGE = 0.005; // 0.5%