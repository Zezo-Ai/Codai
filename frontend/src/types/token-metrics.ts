export interface TokenInfo {
    token_count: number;
    max_context_tokens: number;
    needs_summary: boolean;
    current_percentage: number;  // Renamed from threshold_percentage
    config_threshold: number;    // Added new field
}