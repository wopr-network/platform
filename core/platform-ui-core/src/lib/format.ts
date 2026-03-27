/**
 * Format a timestamp as relative time (e.g., "just now", "2m ago", "1h ago").
 * Accepts a Date object or ISO string.
 */
export function formatRelativeTime(timestamp: Date | string): string {
  const now = Date.now();
  const then = typeof timestamp === "string" ? new Date(timestamp).getTime() : timestamp.getTime();
  const diffSeconds = Math.floor((now - then) / 1000);

  if (diffSeconds < 60) return "just now";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
