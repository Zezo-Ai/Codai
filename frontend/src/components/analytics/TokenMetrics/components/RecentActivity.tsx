import { BarChart2 } from 'lucide-react';
import { formatTimeAgo } from '@/lib/formatters';

interface HistoryEntry {
  timestamp: number;
  total: number;
  input: number;
  output: number;
}

interface RecentActivityProps {
  history: HistoryEntry[];
}

export function RecentActivity({ history }: RecentActivityProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600">Recent Activity</span>
        <span className="text-[10px] text-gray-400">Last 5 requests</span>
      </div>
      <div className="space-y-1">
        {[...history].reverse().slice(0, 5).map((entry) => (
          <div key={entry.timestamp} className="flex items-start gap-2 py-1.5 group hover:bg-gray-50 rounded px-1 -mx-1 transition-colors">
            <div className="mt-0.5 p-1 rounded bg-blue-50 text-blue-500">
              <BarChart2 className="h-3 w-3" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-baseline">
                <p className="text-xs text-gray-600">
                  {entry.total.toLocaleString()} tokens total
                </p>
                <p className="text-[10px] text-gray-500">
                  in:{' '}
                  <span className="text-blue-600">{entry.input}</span>
                  {' '}out:{' '}
                  <span className="text-green-600">{entry.output}</span>
                </p>
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {formatTimeAgo(entry.timestamp)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}