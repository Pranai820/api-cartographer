import { describe, expect, it } from "vitest";
import { CAPTURED_REQUEST_LIMIT, isAtCaptureLimit, resolveEmptyStateReason } from "../src/lib/capture-status";

describe("capture status", () => {
  it("flags the capture limit at and above the threshold, not below it", () => {
    expect(isAtCaptureLimit(CAPTURED_REQUEST_LIMIT - 1)).toBe(false);
    expect(isAtCaptureLimit(CAPTURED_REQUEST_LIMIT)).toBe(true);
    expect(isAtCaptureLimit(CAPTURED_REQUEST_LIMIT + 1)).toBe(true);
  });

  it("supports a custom limit", () => {
    expect(isAtCaptureLimit(10, 10)).toBe(true);
    expect(isAtCaptureLimit(9, 10)).toBe(false);
  });

  it("resolves no empty-state reason when groups are visible", () => {
    expect(resolveEmptyStateReason(50, 3)).toBeNull();
  });

  it("resolves 'no-capture' when nothing has been captured yet", () => {
    expect(resolveEmptyStateReason(0, 0)).toBe("no-capture");
  });

  it("resolves 'filtered-out' when captures exist but filters hid them all", () => {
    expect(resolveEmptyStateReason(50, 0)).toBe("filtered-out");
  });
});
