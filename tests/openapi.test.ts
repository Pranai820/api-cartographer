import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "../src/lib/openapi";
import type { CapturedRequest, EndpointGroup } from "../src/lib/types";

function sampleRequest(overrides: Partial<CapturedRequest>): CapturedRequest {
  return {
    id: "sample",
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
    ...overrides
  };
}

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
        samples: [sampleRequest({ responseBody: "{\"id\":1,\"name\":\"Ada\"}" })]
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

  it("merges response schemas across multiple samples", () => {
    const groups: EndpointGroup[] = [
      {
        id: "GET https://api.example.com/users/{id}",
        origin: "https://api.example.com",
        method: "GET",
        pathTemplate: "/users/{id}",
        count: 2,
        lastSeen: "2026-07-12T00:00:00.000Z",
        statusCounts: { "200": 2 },
        samples: [
          sampleRequest({ id: "one", responseBody: "{\"id\":1,\"name\":\"Ada\",\"tags\":[\"admin\"]}" }),
          sampleRequest({ id: "two", responseBody: "{\"id\":2,\"name\":\"Grace\",\"active\":true,\"tags\":[\"ops\",3]}" })
        ]
      }
    ];

    const operation = buildOpenApiDocument(groups).paths["/users/{id}"].get as Record<string, any>;
    const schema = operation.responses["200"].content["application/json"].schema;

    expect(schema.properties).toMatchObject({
      active: { type: "boolean" },
      id: { type: "integer" },
      name: { type: "string" },
      tags: { type: "array" }
    });
    expect(schema.required).toEqual(["id", "name", "tags"]);
    expect(schema.properties.tags.items.anyOf).toEqual([{ type: "string" }, { type: "integer" }]);
  });

  it("merges request body schemas for write operations", () => {
    const groups: EndpointGroup[] = [
      {
        id: "POST https://api.example.com/users",
        origin: "https://api.example.com",
        method: "POST",
        pathTemplate: "/users",
        count: 2,
        lastSeen: "2026-07-12T00:00:00.000Z",
        statusCounts: { "201": 2 },
        samples: [
          sampleRequest({ method: "POST", path: "/users", pathTemplate: "/users", requestBody: "{\"name\":\"Ada\"}", responseBody: "{\"id\":1}" }),
          sampleRequest({ method: "POST", path: "/users", pathTemplate: "/users", requestBody: "{\"name\":\"Grace\",\"team\":\"compiler\"}", responseBody: "{\"id\":2}" })
        ]
      }
    ];

    const operation = buildOpenApiDocument(groups).paths["/users"].post as Record<string, any>;
    const schema = operation.requestBody.content["application/json"].schema;

    expect(schema.properties).toMatchObject({
      name: { type: "string" },
      team: { type: "string" }
    });
    expect(schema.required).toEqual(["name"]);
  });
});
