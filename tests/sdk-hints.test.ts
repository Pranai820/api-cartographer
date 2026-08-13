import { describe, expect, it } from "vitest";
import { buildSdkHints } from "../src/lib/sdk-hints";
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
    startedDateTime: "2026-08-13T00:00:00.000Z",
    requestHeaders: [],
    responseHeaders: [],
    query: [],
    ...overrides
  };
}

function baseGroup(overrides: Partial<EndpointGroup>): EndpointGroup {
  return {
    id: "GET https://api.example.com/users/{id}",
    origin: "https://api.example.com",
    method: "GET",
    pathTemplate: "/users/{id}",
    count: 1,
    lastSeen: "2026-08-13T00:00:00.000Z",
    statusCounts: { "200": 1 },
    samples: [],
    ...overrides
  };
}

describe("sdk hints", () => {
  it("generates curl, fetch, and python hints for a simple GET endpoint", () => {
    const group = baseGroup({
      samples: [sampleRequest({ requestHeaders: [{ name: "accept", value: "application/json" }] })]
    });

    const hints = buildSdkHints(group);

    expect(hints.map((hint) => hint.id)).toEqual(["curl", "javascript", "python"]);

    const curl = hints.find((hint) => hint.id === "curl")!;
    expect(curl.code).toContain('curl -X GET "https://api.example.com/users/{id}"');
    expect(curl.code).toContain('-H "accept: application/json"');

    const fetchHint = hints.find((hint) => hint.id === "javascript")!;
    expect(fetchHint.code).toContain('fetch("https://api.example.com/users/{id}"');
    expect(fetchHint.code).toContain('method: "GET"');

    const python = hints.find((hint) => hint.id === "python")!;
    expect(python.code).toContain("import requests");
    expect(python.code).toContain("requests.get(");
  });

  it("includes query parameters in the generated URL", () => {
    const group = baseGroup({
      pathTemplate: "/search",
      samples: [
        sampleRequest({
          pathTemplate: "/search",
          query: [{ name: "q", value: "cats" }]
        })
      ]
    });

    const hints = buildSdkHints(group);

    for (const hint of hints) {
      expect(hint.code).toContain("https://api.example.com/search?q=cats");
    }
  });

  it("includes a JSON body and content headers for write methods", () => {
    const group = baseGroup({
      method: "POST",
      pathTemplate: "/users",
      samples: [
        sampleRequest({
          method: "POST",
          pathTemplate: "/users",
          requestBody: '{"name":"Ada","active":true}'
        })
      ]
    });

    const hints = buildSdkHints(group);

    const curl = hints.find((hint) => hint.id === "curl")!;
    expect(curl.code).toContain("-d '");
    expect(curl.code).toContain('"name": "Ada"');

    const fetchHint = hints.find((hint) => hint.id === "javascript")!;
    expect(fetchHint.code).toContain("body: JSON.stringify(");

    const python = hints.find((hint) => hint.id === "python")!;
    expect(python.code).toContain("json_body = ");
    expect(python.code).toContain("True");
    expect(python.code).toContain("json=json_body");
    expect(python.code).toContain("requests.post(");
  });

  it("omits headers and body sections when there is no sample", () => {
    const group = baseGroup({ samples: [] });

    const hints = buildSdkHints(group);

    const curl = hints.find((hint) => hint.id === "curl")!;
    expect(curl.code).toBe('curl -X GET "https://api.example.com/users/{id}"');

    const fetchHint = hints.find((hint) => hint.id === "javascript")!;
    expect(fetchHint.code).not.toContain("headers:");
    expect(fetchHint.code).not.toContain("body:");
  });

  it("drops noisy transport headers like host and content-length", () => {
    const group = baseGroup({
      samples: [
        sampleRequest({
          requestHeaders: [
            { name: "Host", value: "api.example.com" },
            { name: "Content-Length", value: "42" },
            { name: "x-request-id", value: "abc-123" }
          ]
        })
      ]
    });

    const curl = buildSdkHints(group).find((hint) => hint.id === "curl")!;
    expect(curl.code).not.toContain("Host:");
    expect(curl.code).not.toContain("Content-Length:");
    expect(curl.code).toContain("x-request-id: abc-123");
  });
});
