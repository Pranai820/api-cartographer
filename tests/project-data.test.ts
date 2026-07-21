import { describe, expect, it, vi } from "vitest";
import { buildProjectDataExport, parseProjectDataImport } from "../src/lib/project-data";
import type { CapturedRequest } from "../src/lib/types";

vi.stubGlobal("crypto", {
  randomUUID: () => "session-id"
});

const request: CapturedRequest = {
  id: "request",
  url: "https://api.example.com/users",
  origin: "https://api.example.com",
  path: "/users",
  pathTemplate: "/users",
  method: "GET",
  status: 200,
  startedDateTime: "2026-07-21T00:00:00.000Z",
  requestHeaders: [],
  responseHeaders: [],
  query: []
};

const session = {
  id: "s1",
  name: "Checkout flow",
  createdAt: "2026-07-21T00:00:00.000Z",
  updatedAt: "2026-07-21T00:00:00.000Z",
  requests: [request]
};

const preferences = {
  pinnedEndpointIds: ["GET https://api.example.com/users"],
  ignoredEndpointIds: []
};

describe("project data export/import", () => {
  it("builds a versioned export bundling requests, sessions, and preferences", () => {
    const exported = buildProjectDataExport(
      { requests: [request], sessions: [session], endpointPreferences: preferences },
      new Date("2026-07-21T12:00:00.000Z")
    );

    expect(exported).toMatchObject({
      formatVersion: 1,
      exportedAt: "2026-07-21T12:00:00.000Z",
      requests: [request],
      sessions: [session],
      endpointPreferences: preferences
    });
  });

  it("round-trips an export back into a snapshot", () => {
    const exported = buildProjectDataExport({ requests: [request], sessions: [session], endpointPreferences: preferences });
    const roundTripped = JSON.parse(JSON.stringify(exported));

    const snapshot = parseProjectDataImport(roundTripped);

    expect(snapshot.requests).toEqual([request]);
    expect(snapshot.sessions).toEqual([session]);
    expect(snapshot.endpointPreferences).toEqual(preferences);
  });

  it("rejects a file with no format version", () => {
    expect(() => parseProjectDataImport({ requests: [] })).toThrow(/format version/);
  });

  it("rejects non-object input", () => {
    expect(() => parseProjectDataImport(null)).toThrow(/Invalid project data file/);
    expect(() => parseProjectDataImport("nope")).toThrow(/Invalid project data file/);
  });

  it("drops malformed requests and sessions instead of throwing", () => {
    const snapshot = parseProjectDataImport({
      formatVersion: 1,
      requests: [request, { id: "broken" }, "nope"],
      sessions: [session, { id: "broken" }],
      endpointPreferences: { pinnedEndpointIds: "not-an-array" }
    });

    expect(snapshot.requests).toEqual([request]);
    expect(snapshot.sessions).toEqual([session]);
    expect(snapshot.endpointPreferences).toEqual({ pinnedEndpointIds: [], ignoredEndpointIds: [] });
  });

  it("caps imported requests at the last 500", () => {
    const many = Array.from({ length: 510 }, (_, index) => ({ ...request, id: `req-${index}` }));
    const snapshot = parseProjectDataImport({ formatVersion: 1, requests: many, sessions: [], endpointPreferences: undefined });

    expect(snapshot.requests).toHaveLength(500);
    expect(snapshot.requests[0].id).toBe("req-10");
  });
});
