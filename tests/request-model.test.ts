import { describe, expect, it, vi } from "vitest";
import { createCapturedRequestFromHarEntry, groupRequests, normalizePath, parseHarLog } from "../src/lib/request-model";

vi.stubGlobal("crypto", {
  randomUUID: () => "request-id"
});

describe("request model", () => {
  it("normalizes unstable path segments", () => {
    expect(normalizePath("/users/123/orders/987")).toBe("/users/{id}/orders/{id}");
    expect(normalizePath("/sessions/4b6f2b14-9f08-48df-9d01-0b8a76f824da")).toBe("/sessions/{uuid}");
    expect(normalizePath("/assets/abcdef1234567890abcdef")).toBe("/assets/{hash}");
  });

  it("creates captured requests from HAR entries", () => {
    const request = createCapturedRequestFromHarEntry({
      request: {
        method: "get",
        url: "https://api.example.com/users/42?active=true",
        headers: [{ name: "accept", value: "application/json" }]
      },
      response: {
        status: 200,
        statusText: "OK",
        headers: [{ name: "content-type", value: "application/json" }],
        content: { mimeType: "application/json" }
      },
      startedDateTime: "2026-07-11T00:00:00.000Z",
      time: 24
    });

    expect(request.origin).toBe("https://api.example.com");
    expect(request.pathTemplate).toBe("/users/{id}");
    expect(request.query).toEqual([{ name: "active", value: "true" }]);
  });

  it("groups requests by origin, method, and path template", () => {
    const first = createCapturedRequestFromHarEntry({
      request: { method: "GET", url: "https://api.example.com/users/1" },
      response: { status: 200 },
      startedDateTime: "2026-07-11T00:00:00.000Z",
      time: 10
    });
    const second = createCapturedRequestFromHarEntry({
      request: { method: "GET", url: "https://api.example.com/users/2" },
      response: { status: 404 },
      startedDateTime: "2026-07-11T00:01:00.000Z",
      time: 30
    });

    const groups = groupRequests([first, second]);

    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(2);
    expect(groups[0].statusCounts).toEqual({ "200": 1, "404": 1 });
    expect(groups[0].averageDurationMs).toBe(20);
  });

  it("parses a HAR file's log entries into captured requests", () => {
    const har = {
      log: {
        entries: [
          {
            request: { method: "GET", url: "https://api.example.com/users/9" },
            response: { status: 200, content: { text: "{\"id\":9}", mimeType: "application/json" } },
            startedDateTime: "2026-07-14T00:00:00.000Z",
            time: 12
          },
          { request: { method: "GET" } },
          "not-an-entry"
        ]
      }
    };

    const requests = parseHarLog(har);

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      pathTemplate: "/users/{id}",
      responseBody: "{\"id\":9}"
    });
  });

  it("returns no requests for non-HAR input", () => {
    expect(parseHarLog({})).toEqual([]);
    expect(parseHarLog(null)).toEqual([]);
    expect(parseHarLog({ log: { entries: "nope" } })).toEqual([]);
  });
});