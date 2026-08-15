import { describe, expect, it } from "vitest";
import {
  describeSessionDiff,
  diffCapturedRequests,
  diffEndpointGroups,
  formatCountDelta,
  onlyChangedEntries
} from "../src/lib/session-diff";
import type { CapturedRequest, EndpointGroup } from "../src/lib/types";

function request(overrides: Partial<CapturedRequest> = {}): CapturedRequest {
  return {
    id: "request",
    url: "https://api.example.com/users",
    origin: "https://api.example.com",
    path: "/users",
    pathTemplate: "/users",
    method: "GET",
    status: 200,
    startedDateTime: "2026-08-15T00:00:00.000Z",
    requestHeaders: [],
    responseHeaders: [],
    query: [],
    ...overrides
  };
}

function group(overrides: Partial<EndpointGroup> = {}): EndpointGroup {
  const method = overrides.method ?? "GET";
  const origin = overrides.origin ?? "https://api.example.com";
  const pathTemplate = overrides.pathTemplate ?? "/users";

  return {
    id: `${method} ${origin}${pathTemplate}`,
    origin,
    method,
    pathTemplate,
    count: 1,
    lastSeen: "2026-08-15T00:00:00.000Z",
    statusCounts: { "200": 1 },
    samples: [],
    ...overrides
  };
}

describe("session diff", () => {
  it("classifies added, removed, changed, and unchanged endpoints", () => {
    const base = [
      group({ pathTemplate: "/users" }),
      group({ pathTemplate: "/orders" }),
      group({ pathTemplate: "/legacy" })
    ];
    const compare = [
      group({ pathTemplate: "/users", count: 4, statusCounts: { "200": 3, "500": 1 } }),
      group({ pathTemplate: "/orders" }),
      group({ pathTemplate: "/reports" })
    ];

    const diff = diffEndpointGroups(base, compare);

    expect(diff.summary).toEqual({ added: 1, removed: 1, changed: 1, unchanged: 1 });
    expect(diff.entries.map((entry) => [entry.pathTemplate, entry.status])).toEqual([
      ["/reports", "added"],
      ["/legacy", "removed"],
      ["/users", "changed"],
      ["/orders", "unchanged"]
    ]);
  });

  it("reports request count and status code deltas for changed endpoints", () => {
    const diff = diffEndpointGroups(
      [group({ count: 5, statusCounts: { "200": 4, "404": 1 } })],
      [group({ count: 2, statusCounts: { "200": 1, "500": 1 } })]
    );

    expect(diff.entries[0]).toMatchObject({
      status: "changed",
      baseCount: 5,
      compareCount: 2,
      countDelta: -3,
      addedStatusCodes: ["500"],
      removedStatusCodes: ["404"]
    });
  });

  it("treats an endpoint seen the same number of times with the same statuses as unchanged", () => {
    const diff = diffEndpointGroups(
      [group({ count: 3, statusCounts: { "200": 2, "201": 1 }, lastSeen: "2026-08-14T00:00:00.000Z" })],
      [group({ count: 3, statusCounts: { "201": 1, "200": 2 }, lastSeen: "2026-08-15T09:00:00.000Z" })]
    );

    expect(diff.entries[0].status).toBe("unchanged");
    expect(onlyChangedEntries(diff)).toEqual([]);
  });

  it("diffs raw captures by grouping them first", () => {
    const diff = diffCapturedRequests(
      [request()],
      [request(), request({ pathTemplate: "/orders", path: "/orders", method: "POST", status: 201 })]
    );

    expect(diff.summary).toMatchObject({ added: 1, removed: 0, unchanged: 1 });
    expect(diff.entries[0]).toMatchObject({ method: "POST", pathTemplate: "/orders", status: "added", baseCount: 0, compareCount: 1 });
  });

  it("handles empty captures on either side", () => {
    expect(diffEndpointGroups([], []).entries).toEqual([]);
    expect(diffEndpointGroups([], [group()]).summary.added).toBe(1);
    expect(diffEndpointGroups([group()], []).summary.removed).toBe(1);
  });

  it("formats deltas and summaries for display", () => {
    expect(formatCountDelta(3)).toBe("+3");
    expect(formatCountDelta(-2)).toBe("-2");
    expect(formatCountDelta(0)).toBe("0");
    expect(describeSessionDiff({ added: 1, removed: 2, changed: 3, unchanged: 4 })).toBe(
      "1 added, 2 removed, 3 changed, 4 unchanged"
    );
  });
});
