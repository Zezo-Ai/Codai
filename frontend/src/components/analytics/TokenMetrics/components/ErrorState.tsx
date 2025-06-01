import { AlertCircle, RefreshCcw } from 'lucide-react';

interface ErrorStateProps {
  error: string;
  onRetry: () => void;
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  return (
    <div className="p-4 text-center space-y-3">
      <AlertCircle className="h-6 w-6 text-red-500 mx-auto" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-gray-900">Failed to Load Metrics</p>
        <p className="text-xs text-gray-500">{error}</p>
      </div>
      <button 
        onClick={onRetry}
        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-500"
      >
        <RefreshCcw className="h-3 w-3" />
        Try Again
      </button>
    </div>
  );
}