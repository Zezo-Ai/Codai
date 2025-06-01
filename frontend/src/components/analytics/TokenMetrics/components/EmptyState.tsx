import { BarChart2 } from 'lucide-react';

export function EmptyState() {
  return (
    <div className="p-4 text-center space-y-3">
      <BarChart2 className="h-6 w-6 text-gray-400 mx-auto" />
      <div className="space-y-2">
        <div className="space-y-1">
          <p className="text-sm font-medium text-gray-900">No Data Available</p>
          <p className="text-xs text-gray-500">Start a conversation to generate metrics</p>
        </div>
      </div>
    </div>
  );
}