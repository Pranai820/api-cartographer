export const CAPTURED_REQUEST_LIMIT = 500;

export function isAtCaptureLimit(requestCount: number, limit = CAPTURED_REQUEST_LIMIT): boolean {
  return requestCount >= limit;
}

export type EmptyStateReason = "no-capture" | "filtered-out";

/**
 * Returns why the endpoint list is empty, or null when it isn't.
 * Distinguishes "nothing captured yet" from "filters hid everything",
 * since those need different messaging and actions in the UI.
 */
export function resolveEmptyStateReason(totalRequestCount: number, visibleGroupCount: number): EmptyStateReason | null {
  if (visibleGroupCount > 0) {
    return null;
  }

  return totalRequestCount === 0 ? "no-capture" : "filtered-out";
}
