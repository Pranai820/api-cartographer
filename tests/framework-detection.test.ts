import { describe, expect, it } from "vitest";
import { detectFrameworks, summarizeFrameworks } from "../src/lib/framework-detection";
import type { CapturedRequest, HeaderEntry } from "../src/lib/types";

function request(overrides: Partial<CapturedRequest> = {}): CapturedRequest {
  return {
    id: "request",
    url: "https://api.example.com/users",
    origin: "https://api.example.com",
    path: "/users",
    pathTemplate: "/users",
    method: "GET",
    status: 200,
    startedDateTime: "2026-08-16T00:00:00.000Z",
    requestHeaders: [],
    responseHeaders: [],
    query: [],
    ...overrides
  };
}

function withResponseHeaders(headers: HeaderEntry[], overrides: Partial<CapturedRequest> = {}): CapturedRequest {
  return request({ responseHeaders: headers, ...overrides });
}

describe("framework detection", () => {
  it("detects frameworks from x-powered-by regardless of header case", () => {
    const detections = detectFrameworks([withResponseHeaders([{ name: "X-Powered-By", value: "Express" }])]);

    expect(detections).toHaveLength(1);
    expect(detections[0]).toMatchObject({
      id: "express",
      label: "Express",
      category: "framework",
      confidence: "high",
      evidence: ["X-Powered-By: Express"],
      requestCount: 1
    });
  });

  it("detects frameworks from server headers", () => {
    const detections = detectFrameworks([
      withResponseHeaders([{ name: "server", value: "Werkzeug/2.0.1 Python/3.9.7" }]),
      withResponseHeaders([{ name: "server", value: "uvicorn" }]),
      withResponseHeaders([{ name: "server", value: "Kestrel" }])
    ]);

    expect(detections.map((detection) => detection.id).sort()).toEqual(["aspnet", "fastapi", "flask"]);
  });

  it("detects frameworks from cookie names without exposing cookie values", () => {
    const detections = detectFrameworks([
      withResponseHeaders([{ name: "set-cookie", value: "laravel_session=abc123secret; Path=/; HttpOnly" }]),
      request({ requestHeaders: [{ name: "Cookie", value: "csrftoken=tok3n; sessionid=s3cret" }] })
    ]);

    expect(detections.map((detection) => detection.id).sort()).toEqual(["django", "laravel"]);
    expect(JSON.stringify(detections)).not.toMatch(/abc123secret|tok3n|s3cret/);
    expect(detections.find((detection) => detection.id === "laravel")?.evidence).toEqual(["cookie: laravel_session"]);
  });

  it("matches Rails session cookies without claiming other frameworks' session cookies", () => {
    const railsIds = (cookie: string) =>
      detectFrameworks([withResponseHeaders([{ name: "set-cookie", value: `${cookie}=abc; Path=/` }])]).map(
        (detection) => detection.id
      );

    expect(railsIds("_myapp_session")).toContain("rails");
    expect(railsIds("_session_id")).toContain("rails");
    expect(railsIds("laravel_session")).not.toContain("rails");
  });

  it("detects API styles and hosting platforms", () => {
    const detections = detectFrameworks([
      request({ pathTemplate: "/graphql" }),
      withResponseHeaders([{ name: "content-type", value: "application/vnd.api+json" }]),
      withResponseHeaders([{ name: "x-vercel-id", value: "iad1::abc" }]),
      withResponseHeaders([{ name: "x-amzn-RequestId", value: "req-1" }])
    ]);

    expect(detections.map((detection) => [detection.id, detection.category])).toEqual([
      ["graphql", "api-style"],
      ["jsonapi", "api-style"],
      ["aws-api-gateway", "platform"],
      ["vercel", "platform"]
    ]);
  });

  it("detects prefix-matched header families", () => {
    const detections = detectFrameworks([
      withResponseHeaders([{ name: "X-Hasura-Role", value: "admin" }]),
      withResponseHeaders([{ name: "x-shopify-stage", value: "production" }])
    ]);

    expect(detections.map((detection) => detection.id).sort()).toEqual(["hasura", "shopify"]);
    expect(detections.find((detection) => detection.id === "hasura")?.evidence).toEqual(["header: X-Hasura-Role"]);
  });

  it("counts every matching request but keeps evidence deduped and bounded", () => {
    const detections = detectFrameworks([
      withResponseHeaders([{ name: "x-powered-by", value: "Express" }]),
      withResponseHeaders([{ name: "x-powered-by", value: "Express" }]),
      withResponseHeaders([{ name: "x-powered-by", value: "Express/4.18" }]),
      withResponseHeaders([{ name: "x-powered-by", value: "Express/4.19" }]),
      withResponseHeaders([{ name: "x-powered-by", value: "Express/4.20" }])
    ]);

    expect(detections[0].requestCount).toBe(5);
    expect(detections[0].evidence).toEqual(["x-powered-by: Express", "x-powered-by: Express/4.18", "x-powered-by: Express/4.19"]);
  });

  it("truncates long evidence values", () => {
    const detections = detectFrameworks([
      withResponseHeaders([{ name: "server", value: `uvicorn ${"x".repeat(200)}` }])
    ]);

    expect(detections[0].evidence[0].length).toBeLessThanOrEqual("server: ".length + 61);
    expect(detections[0].evidence[0].endsWith("…")).toBe(true);
  });

  it("orders frameworks before API styles before platforms", () => {
    const detections = detectFrameworks([
      withResponseHeaders([{ name: "cf-ray", value: "abc" }]),
      request({ pathTemplate: "/graphql" }),
      withResponseHeaders([{ name: "x-powered-by", value: "Express" }])
    ]);

    expect(detections.map((detection) => detection.id)).toEqual(["express", "graphql", "cloudflare"]);
  });

  it("returns nothing for traffic with no known signals", () => {
    const detections = detectFrameworks([
      withResponseHeaders([{ name: "content-type", value: "application/json" }])
    ]);

    expect(detections).toEqual([]);
    expect(detectFrameworks([])).toEqual([]);
    expect(summarizeFrameworks([])).toBe("No known frameworks detected");
  });

  it("summarizes detections as a label list", () => {
    const detections = detectFrameworks([
      withResponseHeaders([{ name: "x-powered-by", value: "Express" }, { name: "x-vercel-id", value: "iad1" }])
    ]);

    expect(summarizeFrameworks(detections)).toBe("Express, Vercel");
  });
});
