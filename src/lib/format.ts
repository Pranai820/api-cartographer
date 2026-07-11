export function formatDuration(durationMs?: number): string {
  if (durationMs === undefined) {
    return "-";
  }

  if (durationMs < 1000) {
    return `${Math.round(durationMs)} ms`;
  }

  return `${(durationMs / 1000).toFixed(2)} s`;
}

export function formatStatusCounts(statusCounts: Record<string, number>): string {
  return Object.entries(statusCounts)
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([status, count]) => `${status} x${count}`)
    .join(", ");
}

export function compactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}