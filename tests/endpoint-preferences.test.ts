import { describe, expect, it } from "vitest";
import {
  applyEndpointPreferences,
  EMPTY_ENDPOINT_PREFERENCES,
  isIgnored,
  isPinned,
  normalizeEndpointPreferences,
  toggleIgnored,
  togglePinned
} from "../src/lib/endpoint-preferences";
import type { EndpointGroup } from "../src/lib/types";

function group(id: string, pathTemplate = `/${id}`): EndpointGroup {
  return {
    id,
    origin: "https://api.example.com",
    method: "GET",
    pathTemplate,
    count: 1,
    lastSeen: "2026-07-13T00:00:00.000Z",
    statusCounts: { "200": 1 },
    samples: []
  };
}

describe("endpoint preferences", () => {
  it("toggles pinned endpoints and removes ignored state", () => {
    const ignored = toggleIgnored(EMPTY_ENDPOINT_PREFERENCES, "users");
    const pinned = togglePinned(ignored, "users");

    expect(isPinned(pinned, "users")).toBe(true);
    expect(isIgnored(pinned, "users")).toBe(false);
  });

  it("toggles ignored endpoints and removes pinned state", () => {
    const pinned = togglePinned(EMPTY_ENDPOINT_PREFERENCES, "users");
    const ignored = toggleIgnored(pinned, "users");

    expect(isIgnored(ignored, "users")).toBe(true);
    expect(isPinned(ignored, "users")).toBe(false);
  });

  it("filters ignored endpoints and sorts pinned endpoints first", () => {
    const preferences = normalizeEndpointPreferences({
      pinnedEndpointIds: ["orders"],
      ignoredEndpointIds: ["health"]
    });

    expect(applyEndpointPreferences([group("users"), group("orders"), group("health")], preferences, false).map((item) => item.id)).toEqual([
      "orders",
      "users"
    ]);
    expect(applyEndpointPreferences([group("users"), group("orders"), group("health")], preferences, true).map((item) => item.id)).toEqual([
      "orders",
      "health",
      "users"
    ]);
  });
});
