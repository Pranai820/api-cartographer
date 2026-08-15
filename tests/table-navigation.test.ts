import { describe, expect, it } from "vitest";
import { isTableNavigationKey, resolveNextIndex, resolveNextRowId } from "../src/lib/table-navigation";

describe("table navigation", () => {
  it("recognizes only navigation keys", () => {
    expect(isTableNavigationKey("ArrowDown")).toBe(true);
    expect(isTableNavigationKey("End")).toBe(true);
    expect(isTableNavigationKey("a")).toBe(false);
    expect(resolveNextIndex("Enter", 0, 5)).toBeNull();
  });

  it("moves one row at a time", () => {
    expect(resolveNextIndex("ArrowDown", 0, 5)).toBe(1);
    expect(resolveNextIndex("ArrowUp", 3, 5)).toBe(2);
  });

  it("clamps at both ends instead of wrapping", () => {
    expect(resolveNextIndex("ArrowUp", 0, 5)).toBeNull();
    expect(resolveNextIndex("ArrowDown", 4, 5)).toBeNull();
    expect(resolveNextIndex("PageDown", 3, 5)).toBe(4);
    expect(resolveNextIndex("PageUp", 1, 5)).toBe(0);
  });

  it("jumps a page and to list ends", () => {
    expect(resolveNextIndex("PageDown", 0, 40)).toBe(10);
    expect(resolveNextIndex("PageUp", 25, 40)).toBe(15);
    expect(resolveNextIndex("PageDown", 0, 40, 4)).toBe(4);
    expect(resolveNextIndex("Home", 7, 40)).toBe(0);
    expect(resolveNextIndex("End", 7, 40)).toBe(39);
    expect(resolveNextIndex("Home", 0, 40)).toBeNull();
  });

  it("starts from the top when nothing is selected", () => {
    expect(resolveNextIndex("ArrowDown", -1, 5)).toBe(0);
    expect(resolveNextIndex("ArrowUp", -1, 5)).toBe(0);
    expect(resolveNextIndex("PageUp", -1, 5)).toBe(0);
    expect(resolveNextIndex("End", -1, 5)).toBe(4);
  });

  it("returns null for empty lists and snaps out-of-range selections back in", () => {
    expect(resolveNextIndex("ArrowDown", 0, 0)).toBeNull();
    expect(resolveNextIndex("ArrowDown", 99, 5)).toBe(4);
    expect(resolveNextIndex("ArrowUp", 99, 5)).toBe(3);
  });

  it("maps row ids through the same rules", () => {
    const rowIds = ["GET /users", "POST /users", "GET /orders"];

    expect(resolveNextRowId("ArrowDown", rowIds, "GET /users")).toBe("POST /users");
    expect(resolveNextRowId("End", rowIds, "GET /users")).toBe("GET /orders");
    expect(resolveNextRowId("ArrowDown", rowIds, null)).toBe("GET /users");
    expect(resolveNextRowId("ArrowDown", rowIds, "GET /orders")).toBeNull();
    expect(resolveNextRowId("ArrowDown", rowIds, "unknown-endpoint")).toBe("GET /users");
    expect(resolveNextRowId("ArrowDown", [], "GET /users")).toBeNull();
  });
});
