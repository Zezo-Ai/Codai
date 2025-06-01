export function LoadingState() {
  return (
    <div className="p-4 text-center">
      <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto" />
      <p className="mt-2 text-xs text-gray-500">Loading metrics...</p>
    </div>
  );
}