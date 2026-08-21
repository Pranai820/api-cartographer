import { describe, expect, it } from "vitest";
import {
  computeCaptureMetrics,
  computeEndpointMetrics,
  errorProneEndpoints,
  formatErrorRate,
  percentile,
  slowestEndpoints,
  summarizeLatency
} from "../src/lib/endpoint-metrics";
import { groupRequests } from "../src/lib/request-model";
import type { CapturedRequest } from "../src/lib/types";

function request(overrides: Partial<CapturedRequest> = {}): CapturedRequest {
  return {
    id: "request",
    url: "https://api.example.com/users",
    origin: "https://api.example.com",
    path: "/users",
    pathTemplate: "/users",
    method: "GET",
    status: 200,
    startedDateTime: "2026-08-20T00:00:00.000Z",
    requestHeaders: [],
    responseHeaders: [],
    query: [],
    ...overrides
  };
}

function timed(durations: number[], overrides: Partial<CapturedRequest> = {}): CapturedRequest[] {
  return durations.map((durationMs, index) =>
    request({ id: `request-${index}`, durationMs, ...overrides })
  );
}

describe("percentile", () => {
  it("returns undefined for an empty list", () => {
    expect(percentile([], 0.95)).toBeUndefined();
  });

  it("uses nearest rank so every result is an observed value", () => {
    const sorted = [10, 20, 30, 40];

    expect(percentile(sorted, 0.5)).toBe(20);
    expect(percentile(sorted, 0.9)).toBe(40);
    expect(percentile(sorted, 0.95)).toBe(40);
  });

  it("clamps out-of-range fractions to the ends", () => {
    const sorted = [1, 2, 3];

    expect(percentile(sorted, -1)).toBe(1);
    expect(percentile(sorted, 5)).toBe(3);
  });

  it("returns the only value for a single sample", () => {
    expect(percentile([7], 0.5)).toBe(7);
    expect(percentile([7], 0.95)).toBe(7);
  });
});

describe("summarizeLatency", () => {
  it("returns undefined when nothing was timed", () => {
    expect(summarizeLatency([])).toBeUndefined();
  });

  it("summarizes unsorted durations", () => {
    const stats = summarizeLatency([30, 10, 20]);

    expect(stats).toMatchObject({
      sampleCount: 3,
      minMs: 10,
      maxMs: 30,
      averageMs: 20,
      p50Ms: 20,
      p95Ms: 30
    });
  });
});

describe("computeEndpointMetrics", () => {
  it("groups by method, origin, and path template", () => {
    const metrics = computeEndpointMetrics([
      request({ durationMs: 10 }),
      request({ durationMs: 20 }),
      request({ method: "POST", durationMs: 30 }),
      request({ origin: "https://other.example.com", url: "https://other.example.com/users", durationMs: 40 })
    ]);

    expect(metrics).toHaveLength(3);
    expect(metrics.map((entry) => entry.id)).toContain("GET https://api.example.com/users");
    expect(metrics.find((entry) => entry.method === "GET" && entry.origin === "https://api.example.com")?.count).toBe(2);
  });

  it("collapses dynamic path segments the same way grouping does", () => {
    const metrics = computeEndpointMetrics([
      request({ url: "https://api.example.com/users/1", path: "/users/1", pathTemplate: "/users/{id}" }),
      request({ url: "https://api.example.com/users/2", path: "/users/2", pathTemplate: "/users/{id}" })
    ]);

    expect(metrics).toHaveLength(1);
    expect(metrics[0].pathTemplate).toBe("/users/{id}");
    expect(metrics[0].count).toBe(2);
  });

  it("computes percentiles from every request, not just the stored group samples", () => {
    // groupRequests keeps three samples per endpoint; metrics must not be
    // limited to that window or the p95 would be wrong for busy endpoints.
    const requests = timed([10, 10, 10, 10, 10, 10, 10, 10, 10, 900]);

    expect(groupRequests(requests)[0].samples).toHaveLength(3);

    const [metrics] = computeEndpointMetrics(requests);

    expect(metrics.count).toBe(10);
    expect(metrics.latency?.sampleCount).toBe(10);
    expect(metrics.latency?.maxMs).toBe(900);
    expect(metrics.latency?.p50Ms).toBe(10);
    expect(metrics.latency?.p95Ms).toBe(900);
  });

  it("counts requests without a duration but leaves them out of latency", () => {
    const [metrics] = computeEndpointMetrics([
      request({ id: "a", durationMs: 40 }),
      request({ id: "b" }),
      request({ id: "c", durationMs: undefined })
    ]);

    expect(metrics.count).toBe(3);
    expect(metrics.latency?.sampleCount).toBe(1);
    expect(metrics.latency?.averageMs).toBe(40);
  });

  it("ignores negative and non-finite durations", () => {
    const [metrics] = computeEndpointMetrics([
      request({ id: "a", durationMs: -5 }),
      request({ id: "b", durationMs: Number.NaN }),
      request({ id: "c", durationMs: Number.POSITIVE_INFINITY }),
      request({ id: "d", durationMs: 25 })
    ]);

    expect(metrics.count).toBe(4);
    expect(metrics.latency?.sampleCount).toBe(1);
    expect(metrics.latency?.minMs).toBe(25);
  });

  it("leaves latency undefined when nothing was timed", () => {
    const [metrics] = computeEndpointMetrics([request(), request({ id: "second" })]);

    expect(metrics.latency).toBeUndefined();
    expect(metrics.count).toBe(2);
  });

  it("splits client and server errors and derives an error rate", () => {
    const [metrics] = computeEndpointMetrics([
      request({ id: "a", status: 200 }),
      request({ id: "b", status: 404 }),
      request({ id: "c", status: 500 }),
      request({ id: "d", status: 503 })
    ]);

    expect(metrics.clientErrorCount).toBe(1);
    expect(metrics.serverErrorCount).toBe(2);
    expect(metrics.errorCount).toBe(3);
    expect(metrics.errorRate).toBeCloseTo(0.75);
  });

  it("does not treat redirects or informational responses as errors", () => {
    const [metrics] = computeEndpointMetrics([
      request({ id: "a", status: 204 }),
      request({ id: "b", status: 304 }),
      request({ id: "c", status: 101 })
    ]);

    expect(metrics.errorCount).toBe(0);
    expect(metrics.errorRate).toBe(0);
  });

  it("sorts slowest p95 first and puts untimed endpoints last", () => {
    const metrics = computeEndpointMetrics([
      ...timed([10, 12], { pathTemplate: "/fast", path: "/fast", url: "https://api.example.com/fast" }),
      ...timed([300, 400], { pathTemplate: "/slow", path: "/slow", url: "https://api.example.com/slow" }),
      request({ pathTemplate: "/untimed", path: "/untimed", url: "https://api.example.com/untimed" })
    ]);

    expect(metrics.map((entry) => entry.pathTemplate)).toEqual(["/slow", "/fast", "/untimed"]);
  });

  it("returns an empty list for an empty capture", () => {
    expect(computeEndpointMetrics([])).toEqual([]);
  });
});

describe("computeCaptureMetrics", () => {
  it("summarizes latency across every timed request rather than averaging averages", () => {
    const capture = computeCaptureMetrics([
      ...timed([10, 10, 10], { pathTemplate: "/a", path: "/a", url: "https://api.example.com/a" }),
      ...timed([1000], { pathTemplate: "/b", path: "/b", url: "https://api.example.com/b" })
    ]);

    // Averaging the two endpoint averages would give 505ms; the true mean is 257.5ms.
    expect(capture.latency?.averageMs).toBeCloseTo(257.5);
    expect(capture.timedRequests).toBe(4);
    expect(capture.totalRequests).toBe(4);
  });

  it("reports a capture-wide error rate", () => {
    const capture = computeCaptureMetrics([
      request({ id: "a", status: 200 }),
      request({ id: "b", status: 500 })
    ]);

    expect(capture.errorCount).toBe(1);
    expect(capture.errorRate).toBeCloseTo(0.5);
  });

  it("handles an empty capture without dividing by zero", () => {
    const capture = computeCaptureMetrics([]);

    expect(capture).toMatchObject({ totalRequests: 0, timedRequests: 0, errorCount: 0, errorRate: 0 });
    expect(capture.latency).toBeUndefined();
  });
});

describe("slowestEndpoints", () => {
  it("skips endpoints with too few timing samples to be meaningful", () => {
    const metrics = computeEndpointMetrics([
      ...timed([5000], { pathTemplate: "/one-off", path: "/one-off", url: "https://api.example.com/one-off" }),
      ...timed([100, 120], { pathTemplate: "/steady", path: "/steady", url: "https://api.example.com/steady" })
    ]);

    expect(slowestEndpoints(metrics).map((entry) => entry.pathTemplate)).toEqual(["/steady"]);
    expect(slowestEndpoints(metrics, 5, 1).map((entry) => entry.pathTemplate)).toEqual(["/one-off", "/steady"]);
  });

  it("respects the limit", () => {
    const metrics = computeEndpointMetrics([
      ...timed([300, 300], { pathTemplate: "/a", path: "/a", url: "https://api.example.com/a" }),
      ...timed([200, 200], { pathTemplate: "/b", path: "/b", url: "https://api.example.com/b" }),
      ...timed([100, 100], { pathTemplate: "/c", path: "/c", url: "https://api.example.com/c" })
    ]);

    expect(slowestEndpoints(metrics, 2).map((entry) => entry.pathTemplate)).toEqual(["/a", "/b"]);
    expect(slowestEndpoints(metrics, 0)).toEqual([]);
  });
});

describe("errorProneEndpoints", () => {
  it("ranks by error rate, then by absolute error count", () => {
    const metrics = computeEndpointMetrics([
      ...Array.from({ length: 10 }, (_, index) =>
        request({ id: `busy-${index}`, status: index < 5 ? 500 : 200, pathTemplate: "/busy", path: "/busy", url: "https://api.example.com/busy" })
      ),
      request({ id: "broken", status: 500, pathTemplate: "/broken", path: "/broken", url: "https://api.example.com/broken" }),
      request({ id: "healthy", status: 200, pathTemplate: "/healthy", path: "/healthy", url: "https://api.example.com/healthy" })
    ]);

    const ranked = errorProneEndpoints(metrics);

    expect(ranked.map((entry) => entry.pathTemplate)).toEqual(["/broken", "/busy"]);
    expect(ranked.every((entry) => entry.errorCount > 0)).toBe(true);
  });

  it("returns nothing for a clean capture", () => {
    expect(errorProneEndpoints(computeEndpointMetrics([request(), request({ id: "b" })]))).toEqual([]);
  });
});

describe("formatErrorRate", () => {
  it("renders whole percentages", () => {
    expect(formatErrorRate(0)).toBe("0%");
    expect(formatErrorRate(0.5)).toBe("50%");
    expect(formatErrorRate(1)).toBe("100%");
  });

  it("keeps a rare error visible instead of rounding it to zero", () => {
    expect(formatErrorRate(1 / 500)).toBe("<1%");
  });
});

describe("graphql endpoints", () => {
  function graphQlRequest(name: string, type: "query" | "mutation", overrides: Partial<CapturedRequest> = {}) {
    return request({
      url: "https://api.example.com/graphql",
      path: "/graphql",
      pathTemplate: "/graphql",
      method: "POST",
      graphqlOperation: { type, name, operationCount: 1 },
      ...overrides
    });
  }

  it("measures each GraphQL operation separately instead of pooling the path", () => {
    const metrics = computeEndpointMetrics([
      graphQlRequest("Users", "query", { durationMs: 20 }),
      graphQlRequest("Users", "query", { durationMs: 30 }),
      graphQlRequest("CreateUser", "mutation", { durationMs: 900, status: 500 })
    ]);

    expect(metrics).toHaveLength(2);

    const slow = metrics.find((endpoint) => endpoint.graphqlOperation?.name === "CreateUser");
    const fast = metrics.find((endpoint) => endpoint.graphqlOperation?.name === "Users");

    expect(slow?.latency?.p95Ms).toBe(900);
    expect(slow?.errorRate).toBe(1);
    expect(fast?.latency?.p95Ms).toBe(30);
    expect(fast?.errorRate).toBe(0);
  });

  it("carries the operation so the health list can tell identical paths apart", () => {
    const metrics = computeEndpointMetrics([graphQlRequest("Users", "query", { durationMs: 10 })]);

    expect(metrics[0].pathTemplate).toBe("/graphql");
    expect(metrics[0].graphqlOperation).toEqual({ type: "query", name: "Users", operationCount: 1 });
  });
});
