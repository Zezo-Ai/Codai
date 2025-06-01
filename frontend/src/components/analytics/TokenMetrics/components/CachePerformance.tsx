interface CachePerformanceProps {
  hitRate: number;
  readTokens: number;
}

export function CachePerformance({ hitRate, readTokens }: CachePerformanceProps) {
  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-gray-600">Cache Performance</span>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-50 p-2 rounded">
          <div className="text-xs text-gray-500">Cache Hit Rate</div>
          <div className="text-sm font-semibold mt-0.5">
            {hitRate.toFixed(1)}%
          </div>
        </div>
        <div className="bg-gray-50 p-2 rounded">
          <div className="text-xs text-gray-500">Tokens Saved</div>
          <div className="text-sm font-semibold mt-0.5">
            {(readTokens / 1000).toFixed(1)}k
          </div>
        </div>
      </div>
    </div>
  );
}