export const NAVIGATION_PAGE_SIZE = 10;

const NAVIGATION_KEYS = ["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"] as const;

export type TableNavigationKey = (typeof NAVIGATION_KEYS)[number];

export function isTableNavigationKey(key: string): key is TableNavigationKey {
  return (NAVIGATION_KEYS as readonly string[]).includes(key);
}

function clamp(index: number, itemCount: number): number {
  return Math.min(Math.max(index, 0), itemCount - 1);
}

/**
 * Resolves the row a navigation key should move to, or null when the key is
 * not a navigation key, the list is empty, or the selection would not move.
 * Movement clamps at both ends rather than wrapping, matching DevTools lists.
 */
export function resolveNextIndex(
  key: string,
  currentIndex: number,
  itemCount: number,
  pageSize = NAVIGATION_PAGE_SIZE
): number | null {
  if (!isTableNavigationKey(key) || itemCount <= 0) {
    return null;
  }

  // An unknown current row (-1) starts navigation from the top of the list.
  const from = currentIndex < 0 ? -1 : clamp(currentIndex, itemCount);

  const target = (() => {
    switch (key) {
      case "ArrowDown":
        return from + 1;
      case "ArrowUp":
        return from < 0 ? 0 : from - 1;
      case "PageDown":
        return from + pageSize;
      case "PageUp":
        return from < 0 ? 0 : from - pageSize;
      case "Home":
        return 0;
      case "End":
        return itemCount - 1;
    }
  })();

  const nextIndex = clamp(target, itemCount);

  return nextIndex === currentIndex ? null : nextIndex;
}

/** Row-id wrapper around {@link resolveNextIndex} for list components. */
export function resolveNextRowId(
  key: string,
  rowIds: string[],
  currentRowId: string | null,
  pageSize = NAVIGATION_PAGE_SIZE
): string | null {
  const nextIndex = resolveNextIndex(key, currentRowId ? rowIds.indexOf(currentRowId) : -1, rowIds.length, pageSize);

  return nextIndex === null ? null : rowIds[nextIndex];
}
