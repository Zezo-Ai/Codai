export function formatTimeAgo(isoTimestamp: string): string {
  try {
    // Ensure the timestamp has 'Z' to mark it as UTC if not already specified
    const utcTimestamp = isoTimestamp.endsWith('Z') ? isoTimestamp : isoTimestamp + 'Z';
    
    // Parse the UTC timestamp and calculate time difference
    const diff = Date.now() - new Date(utcTimestamp).getTime();
    
    // Convert to units
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
  } catch (error) {
    return 'unknown time';
  }
}