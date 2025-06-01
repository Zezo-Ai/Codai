'use client'

import { cn } from '@/lib/utils'
import { TokenInfo } from '@/types/token-metrics'

interface TokenCountProps {
  tokenInfo?: TokenInfo;
}

export function TokenCount({
  tokenInfo
}: TokenCountProps) {
  const {
    token_count = 0,
    max_context_tokens = 200000,
    needs_summary = false,
    current_percentage = 0,      // Renamed from threshold_percentage
    config_threshold = 80        // Added with default of 80%
  } = tokenInfo || {};

  const percentage = (token_count / max_context_tokens) * 100;

  return (
    <div 
      id="token-metrics" 
      data-token-count={token_count}
      data-needs-summary={needs_summary}
      className={cn(
        "space-y-1 mt-1 text-xs",
        needs_summary ? "text-amber-600" : "text-gray-500"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-1">
          <span>Tokens:</span>
          <span className="font-medium">{token_count.toLocaleString()}</span>
          <span>/</span>
          <span>{max_context_tokens.toLocaleString()}</span>
          <span>({percentage.toFixed(1)}%)</span>
        </div>
        {needs_summary ? (
          <div className="flex items-center space-x-1 bg-red-100 px-1 rounded text-red-700">
            <span>⚠️</span>
            <span>Summarization needed (usage: {percentage.toFixed(1)}%, threshold: {config_threshold}%)</span>
          </div>
        ) : percentage > (config_threshold * 0.9) ? (
          <div className="flex items-center space-x-1 bg-red-100 px-1 rounded text-red-700 text-xs">
            <span>⚠️</span>
            <span>Critical - approaching threshold</span>
          </div>
        ) : percentage > (config_threshold * 0.75) ? (
          <div className="flex items-center space-x-1 bg-amber-100 px-1 rounded text-amber-700 text-xs">
            <span>⚠️</span>
            <span>Approaching threshold</span>
          </div>
        ) : null}
      </div>

      <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden relative">
        {/* Threshold marker */}
        <div 
          className="absolute h-full w-0.5 bg-gray-400 z-10" 
          style={{ left: `${config_threshold}%` }}
        />
        
        {/* Progress bar */}
        <div 
          className={cn(
            "h-full transition-all duration-500",
            needs_summary 
              ? "bg-red-500"  // Over threshold - critical (red)
              : percentage > (config_threshold * 0.95)  // Very close to threshold (95%)
                ? "bg-red-500"
                : percentage > (config_threshold * 0.9)  // Approaching threshold (90%)
                  ? "bg-red-400"
                : percentage > (config_threshold * 0.8)  // High usage (80% of threshold)
                  ? "bg-orange-500"
                : percentage > (config_threshold * 0.7)  // Moderately high (70% of threshold)
                  ? "bg-orange-400"
                : percentage > (config_threshold * 0.6)  // Medium-high usage (60% of threshold)
                  ? "bg-amber-500"
                : percentage > (config_threshold * 0.5)  // Medium usage (50% of threshold)
                  ? "bg-yellow-500"
                : percentage > (config_threshold * 0.3)  // Medium-low usage (30% of threshold)
                  ? "bg-yellow-400"
                : percentage > (config_threshold * 0.2)  // Low usage (20% of threshold)
                  ? "bg-lime-500"
                : percentage > (config_threshold * 0.1)  // Very low usage (10% of threshold)
                  ? "bg-green-500"
                : "bg-green-400"  // Extremely low usage (below 10% of threshold)
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}