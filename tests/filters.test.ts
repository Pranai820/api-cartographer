import { describe, expect, it } from "vitest";
import { filterEndpointGroups, listContentTypes, listMethods, listStatusCodes } from "../src/lib/filters";
import type { EndpointGroup } from "../src/lib/types";

function group(overrides: Partial<EndpointGroup>): EndpointGroup {
  return {
    id: "GET https://api.example.com/users",
    origin: "https://api.example.com",
    method: "GET",
    pathTemplate: "/users",
    count: 1,
    lastSeen: "2026-07-12T00:00:00.000Z",
    statusCounts: { "200": 1 },
    samples: [
      {
        id: "sample",
        url: "https://api.example.com/users",
        origin: "https://api.example.com",
        path: "/users",
        pathTemplate: "/users",
        method: "GET",
        status: 200,
        startedDateTime: "2026-07-12T00:00:00.000Z",
        requestHeaders: [],
        responseHeaders: [],
        query: [],
        mimeType: "application/json"
      }
    ],
    ...overrides
  };
}

describe("endpoint filters", () => {
  const groups = [
    group({ id: "users", method: "GET", pathTemplate: "/users", statusCounts: { "200": 1 } }),
    group({
      id: "orders",
      method: "POST",
      pathTemplate: "/orders",
      statusCounts: { "201": 1, "500": 1 },
      samples: [
        {
          ...group({}).samples[0],
          method: "POST",
          path: "/orders",
          pathTemplate: "/orders",
          status: 201,
          mimeType: "application/problem+json"
        }
      ]
    })
  ];

  it("lists available preset values", () => {
    expect(listMethods(groups)).toEqual(["GET", "POST"]);
    expect(listStatusCodes(groups)).toEqual(["200", "201", "500"]);
    expect(listContentTypes(groups)).toEqual(["application/json", "application/problem+json"]);
  });

  it("filters endpoint groups by method, status, content type, origin, and search", () => {
    const filtered = filterEndpointGroups(groups, {
      search: "orders",
      origin: "https://api.example.com",
      method: "POST",
      status: "500",
      contentType: "application/problem+json"
    });

    expect(filtered.map((item) => item.id)).toEqual(["orders"]);
  });
});
