import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "../src/lib/openapi";
import type { EndpointGroup } from "../src/lib/types";

describe("OpenAPI export", () => {
  it("builds a minimal OpenAPI document from endpoint groups", () => {
    const groups: EndpointGroup[] = [
      {
        id: "GET https://api.example.com/users/{id}",
        origin: "https://api.example.com",
        method: "GET",
        pathTemplate: "/users/{id}",
        count: 2,
        lastSeen: "2026-07-11T00:00:00.000Z",
        averageDurationMs: 44,
        statusCounts: { "200": 2 },
        samples: [
          {
            id: "one",
            url: "https://api.example.com/users/1?include=teams",
            origin: "https://api.example.com",
            path: "/users/1",
            pathTemplate: "/users/{id}",
            method: "GET",
            status: 200,
            statusText: "OK",
            startedDateTime: "2026-07-11T00:00:00.000Z",
            requestHeaders: [],
            responseHeaders: [],
            query: [{ name: "include", value: "teams" }],
            responseBody: "{\"id\":1,\"name\":\"Ada\"}"
          }
        ]
      }
    ];

    const doc = buildOpenApiDocument(groups, "Example API");

    expect(doc.openapi).toBe("3.1.0");
    expect(doc.servers).toEqual([{ url: "https://api.example.com" }]);
    expect(doc.paths["/users/{id}"].get).toMatchObject({
      summary: "GET /users/{id}",
      "x-api-cartographer": {
        observedCount: 2
      }
    });
  });
});