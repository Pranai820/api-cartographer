import { describe, expect, it, vi } from "vitest";
import { createCaptureSession, deleteCaptureSession, normalizeCaptureSessions, upsertCaptureSession } from "../src/lib/sessions";
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
  startedDateTime: "2026-07-13T00:00:00.000Z",
  requestHeaders: [],
  responseHeaders: [],
  query: []
};

describe("capture sessions", () => {
  it("creates named request snapshots", () => {
    const session = createCaptureSession("Checkout flow", [request], new Date("2026-07-13T10:00:00.000Z"));

    expect(session).toMatchObject({
      id: "session-id",
      name: "Checkout flow",
      createdAt: "2026-07-13T10:00:00.000Z",
      updatedAt: "2026-07-13T10:00:00.000Z",
      requests: [request]
    });
  });

  it("normalizes, sorts, upserts, and deletes sessions", () => {
    const older = { ...createCaptureSession("Older", [request], new Date("2026-07-13T09:00:00.000Z")), id: "older" };
    const newer = { ...createCaptureSession("Newer", [request], new Date("2026-07-13T11:00:00.000Z")), id: "newer" };

    expect(normalizeCaptureSessions([older, newer]).map((session) => session.id)).toEqual(["newer", "older"]);
    expect(upsertCaptureSession([older], newer).map((session) => session.id)).toEqual(["newer", "older"]);
    expect(deleteCaptureSession([older, newer], "older").map((session) => session.id)).toEqual(["newer"]);
  });
});
