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
    expect(doc.info).toMatchObject({ title: "Example API", version: "0.1.0" });
    expect(doc.paths["/users/{id}"].get).toMatchObject({
      summary: "GET /users/{id}",
      "x-api-cartographer": {
        observedCount: 2
      }
    });
  });

  it("accepts a custom title and version", () => {
    const groups: EndpointGroup[] = [
      {
        id: "GET https://api.example.com/users/{id}",
        origin: "https://api.example.com",
        method: "GET",
        pathTemplate: "/users/{id}",
        count: 1,
        lastSeen: "2026-07-14T00:00:00.000Z",
        statusCounts: { "200": 1 },
        samples: [sampleRequest({})]
      }
    ];

    const doc = buildOpenApiDocument(groups, "Internal Billing API", "2.3.1");

    expect(doc.info).toEqual({
      title: "Internal Billing API",
      version: "2.3.1",
      description: "Generated from browser DevTools network traffic by API Cartographer."
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

describe("colliding path and method groups", () => {
  function group(overrides: Partial<EndpointGroup>): EndpointGroup {
    return {
      id: "POST https://api.example.com/graphql",
      origin: "https://api.example.com",
      method: "POST",
      pathTemplate: "/graphql",
      count: 1,
      lastSeen: "2026-08-21T00:00:00.000Z",
      statusCounts: { "200": 1 },
      samples: [],
      ...overrides
    };
  }

  it("keeps every GraphQL operation instead of letting the last one win", () => {
    const doc = buildOpenApiDocument([
      group({
        id: "POST https://api.example.com/graphql [query Users]",
        count: 4,
        graphqlOperation: { type: "query", name: "Users", operationCount: 1 },
        samples: [sampleRequest({ pathTemplate: "/graphql", method: "POST", responseBody: '{"data":{"users":[]}}' })]
      }),
      group({
        id: "POST https://api.example.com/graphql [mutation CreateUser]",
        count: 2,
        statusCounts: { "200": 1, "400": 1 },
        graphqlOperation: { type: "mutation", name: "CreateUser", operationCount: 1 },
        samples: [sampleRequest({ pathTemplate: "/graphql", method: "POST", status: 400, responseBody: '{"errors":[]}' })]
      })
    ]);

    const operation = doc.paths["/graphql"].post as Record<string, any>;

    expect(operation["x-api-cartographer"].graphqlOperations).toEqual(["query Users", "mutation CreateUser"]);
    expect(operation["x-api-cartographer"].observedCount).toBe(6);
    expect(Object.keys(operation.responses).sort()).toEqual(["200", "400"]);
  });

  it("merges the same path served by two origins", () => {
    const doc = buildOpenApiDocument([
      group({ pathTemplate: "/users", method: "GET", origin: "https://api.example.com", count: 3, averageDurationMs: 100 }),
      group({ pathTemplate: "/users", method: "GET", origin: "https://eu.example.com", count: 1, averageDurationMs: 300 })
    ]);

    const extension = (doc.paths["/users"].get as Record<string, any>)["x-api-cartographer"];

    expect(extension.observedCount).toBe(4);
    expect(extension.origins).toEqual(["https://api.example.com", "https://eu.example.com"]);
    expect(extension.averageDurationMs).toBe(150);
  });

  it("omits the multi-origin and GraphQL fields for ordinary endpoints", () => {
    const doc = buildOpenApiDocument([group({ pathTemplate: "/users", method: "GET" })]);
    const extension = (doc.paths["/users"].get as Record<string, any>)["x-api-cartographer"];

    expect(extension).not.toHaveProperty("origins");
    expect(extension).not.toHaveProperty("graphqlOperations");
    expect(extension.origin).toBe("https://api.example.com");
  });
});
