interface CurrentSessionProps {
  inputTokens: number;
  outputTokens: number;
}

export function CurrentSession({ inputTokens, outputTokens }: CurrentSessionProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">Current Session</span>
        <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700">
          Active
        </span>
      </div>
      
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-50 p-2 rounded">
          <div className="text-xs text-gray-500">Input Tokens</div>
          <div className="text-sm font-semibold mt-0.5">
            {inputTokens.toLocaleString()}
          </div>
        </div>
        <div className="bg-gray-50 p-2 rounded">
          <div className="text-xs text-gray-500">Output Tokens</div>
          <div className="text-sm font-semibold mt-0.5">
            {outputTokens.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}