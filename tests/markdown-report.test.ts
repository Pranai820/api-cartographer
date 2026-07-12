import { describe, expect, it } from "vitest";
import { buildMarkdownReport } from "../src/lib/markdown-report";
import type { EndpointGroup } from "../src/lib/types";

describe("Markdown report", () => {
  it("summarizes captured endpoint groups", () => {
    const groups: EndpointGroup[] = [
      {
        id: "GET https://api.example.com/users/{id}",
        origin: "https://api.example.com",
        method: "GET",
        pathTemplate: "/users/{id}",
        count: 3,
        lastSeen: "2026-07-12T00:00:00.000Z",
        averageDurationMs: 42,
        statusCounts: { "200": 2, "404": 1 },
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
            mimeType: "application/json",
            startedDateTime: "2026-07-12T00:00:00.000Z",
            durationMs: 42,
            requestHeaders: [],
            responseHeaders: [],
            query: [{ name: "include", value: "teams" }]
          }
        ]
      }
    ];

    const report = buildMarkdownReport(groups, "Example API");

    expect(report).toContain("# Example API");
    expect(report).toContain("- Endpoints: 1");
    expect(report).toContain("`GET` | `/users/{id}` | `https://api.example.com` | 3");
    expect(report).toContain("- Query parameters: `include`");
    expect(report).toContain("- Sample MIME type: `application/json`");
  });
});
