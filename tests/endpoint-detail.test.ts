import { describe, expect, it } from "vitest";
import { buildEndpointOperation, extractRequestSchema, extractResponseSchemas } from "../src/lib/endpoint-detail";
import type { CapturedRequest, EndpointGroup } from "../src/lib/types";

function sampleRequest(overrides: Partial<CapturedRequest>): CapturedRequest {
  return {
    id: "sample",
    url: "https://api.example.com/users/1",
    origin: "https://api.example.com",
    path: "/users/1",
    pathTemplate: "/users/{id}",
    method: "GET",
    status: 200,
    statusText: "OK",
    startedDateTime: "2026-07-19T00:00:00.000Z",
    requestHeaders: [],
    responseHeaders: [],
    query: [],
    ...overrides
  };
}

describe("endpoint detail helpers", () => {
  it("builds the OpenAPI operation for a single endpoint group", () => {
    const group: EndpointGroup = {
      id: "GET https://api.example.com/users/{id}",
      origin: "https://api.example.com",
      method: "GET",
      pathTemplate: "/users/{id}",
      count: 1,
      lastSeen: "2026-07-19T00:00:00.000Z",
      statusCounts: { "200": 1 },
      samples: [sampleRequest({ responseBody: "{\"id\":1,\"name\":\"Ada\"}" })]
    };

    const operation = buildEndpointOperation(group, "Example API", "1.0.0");

    expect(operation).toMatchObject({
      summary: "GET /users/{id}",
      "x-api-cartographer": { observedCount: 1 }
    });
  });

  it("returns undefined schema extractions for an undefined operation", () => {
    expect(extractRequestSchema(undefined)).toBeUndefined();
    expect(extractResponseSchemas(undefined)).toEqual([]);
  });

  it("extracts the request body schema for write operations", () => {
    const group: EndpointGroup = {
      id: "POST https://api.example.com/users",
      origin: "https://api.example.com",
      method: "POST",
      pathTemplate: "/users",
      count: 1,
      lastSeen: "2026-07-19T00:00:00.000Z",
      statusCounts: { "201": 1 },
      samples: [
        sampleRequest({
          method: "POST",
          path: "/users",
          pathTemplate: "/users",
          status: 201,
          requestBody: "{\"name\":\"Ada\"}",
          responseBody: "{\"id\":1}"
        })
      ]
    };

    const operation = buildEndpointOperation(group);
    const schema = extractRequestSchema(operation) as Record<string, unknown>;

    expect(schema).toMatchObject({
      type: "object",
      properties: { name: { type: "string" } }
    });
  });

  it("returns undefined request schema for methods without a body", () => {
    const group: EndpointGroup = {
      id: "GET https://api.example.com/users/{id}",
      origin: "https://api.example.com",
      method: "GET",
      pathTemplate: "/users/{id}",
      count: 1,
      lastSeen: "2026-07-19T00:00:00.000Z",
      statusCounts: { "200": 1 },
      samples: [sampleRequest({ responseBody: "{\"id\":1}" })]
    };

    const operation = buildEndpointOperation(group);

    expect(extractRequestSchema(operation)).toBeUndefined();
  });

  it("extracts response schemas sorted by status code", () => {
    const group: EndpointGroup = {
      id: "GET https://api.example.com/users/{id}",
      origin: "https://api.example.com",
      method: "GET",
      pathTemplate: "/users/{id}",
      count: 2,
      lastSeen: "2026-07-19T00:00:00.000Z",
      statusCounts: { "404": 1, "200": 1 },
      samples: [
        sampleRequest({ id: "ok", status: 200, responseBody: "{\"id\":1}" }),
        sampleRequest({ id: "missing", status: 404, responseBody: "{\"error\":\"not found\"}" })
      ]
    };

    const operation = buildEndpointOperation(group);
    const schemas = extractResponseSchemas(operation);

    expect(schemas.map((entry) => entry.status)).toEqual(["200", "404"]);
    expect(schemas[1].schema).toMatchObject({ properties: { error: { type: "string" } } });
  });

  it("omits statuses with no inferable JSON schema", () => {
    const group: EndpointGroup = {
      id: "GET https://api.example.com/ping",
      origin: "https://api.example.com",
      method: "GET",
      pathTemplate: "/ping",
      count: 1,
      lastSeen: "2026-07-19T00:00:00.000Z",
      statusCounts: { "204": 1 },
      samples: [sampleRequest({ path: "/ping", pathTemplate: "/ping", status: 204, responseBody: undefined })]
    };

    const operation = buildEndpointOperation(group);

    expect(extractResponseSchemas(operation)).toEqual([]);
  });
});
