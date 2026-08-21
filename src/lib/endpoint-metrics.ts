import { endpointKey } from "./request-model";
import type { CapturedRequest, GraphQlOperation, HttpMethod } from "./types";

export interface LatencyStats {
  /** Number of requests that carried a usable duration. */
  sampleCount: number;
  minMs: number;
  maxMs: number;
  averageMs: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
}

export interface EndpointMetrics {
  id: string;
  origin: string;
  method: HttpMethod;
  pathTemplate: string;
  /** Every captured request for this endpoint, including untimed ones. */
  count: number;
  clientErrorCount: number;
  serverErrorCount: number;
  errorCount: number;
  /** Share of requests answering 4xx or 5xx, between 0 and 1. */
  errorRate: number;
  /** Undefined when no request for this endpoint reported a duration. */
  latency?: LatencyStats;
  /**
   * Set when the endpoint is one GraphQL operation. Metrics key off
   * `endpointKey`, so GraphQL operations are measured separately even though
   * they share a path — the label is what tells them apart when rendered.
   */
  graphqlOperation?: GraphQlOperation;
}

export interface CaptureMetrics {
  endpoints: EndpointMetrics[];
  totalRequests: number;
  timedRequests: number;
  errorCount: number;
  errorRate: number;
  /** Latency across every timed request in the capture, not an average of averages. */
  latency?: LatencyStats;
}

/**
 * `EndpointGroup.samples` is capped (three by default), so percentiles are
 * computed from the raw request list instead — a group's stored
 * `averageDurationMs` covers every request, but its samples do not.
 */
function usableDuration(request: CapturedRequest): number | undefined {
  const { durationMs } = request;

  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) {
    return undefined;
  }

  return durationMs;
}

/**
 * Nearest-rank percentile over an ascending list: the smallest value at or
 * above the requested share of samples. Chosen over interpolation so every
 * reported number is a latency that was actually observed.
 */
export function percentile(sortedValues: number[], fraction: number): number | undefined {
  if (sortedValues.length === 0) {
    return undefined;
  }

  const clamped = Math.min(Math.max(fraction, 0), 1);
  const rank = Math.ceil(clamped * sortedValues.length);
  const index = Math.min(Math.max(rank - 1, 0), sortedValues.length - 1);

  return sortedValues[index];
}

export function summarizeLatency(durations: number[]): LatencyStats | undefined {
  if (durations.length === 0) {
    return undefined;
  }

  const sorted = [...durations].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);

  return {
    sampleCount: sorted.length,
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
    averageMs: total / sorted.length,
    p50Ms: percentile(sorted, 0.5) as number,
    p90Ms: percentile(sorted, 0.9) as number,
    p95Ms: percentile(sorted, 0.95) as number
  };
}

function isClientError(status: number): boolean {
  return status >= 400 && status < 500;
}

function isServerError(status: number): boolean {
  return status >= 500 && status < 600;
}

interface MetricsAccumulator {
  metrics: EndpointMetrics;
  durations: number[];
}

/**
 * Groups requests by endpoint and derives latency percentiles and error rates.
 * Ordering is slowest-first by p95, so the head of the list is what a reader
 * most likely wants to look at; endpoints with no timing data sort last.
 */
export function computeEndpointMetrics(requests: CapturedRequest[]): EndpointMetrics[] {
  const accumulators = new Map<string, MetricsAccumulator>();

  for (const request of requests) {
    const key = endpointKey(request);
    let entry = accumulators.get(key);

    if (!entry) {
      entry = {
        metrics: {
          id: key,
          origin: request.origin,
          method: request.method,
          pathTemplate: request.pathTemplate,
          count: 0,
          clientErrorCount: 0,
          serverErrorCount: 0,
          errorCount: 0,
          errorRate: 0,
          graphqlOperation: request.graphqlOperation
        },
        durations: []
      };
      accumulators.set(key, entry);
    }

    entry.metrics.count += 1;

    if (isClientError(request.status)) {
      entry.metrics.clientErrorCount += 1;
    } else if (isServerError(request.status)) {
      entry.metrics.serverErrorCount += 1;
    }

    const duration = usableDuration(request);

    if (duration !== undefined) {
      entry.durations.push(duration);
    }
  }

  return Array.from(accumulators.values())
    .map(({ metrics, durations }) => {
      metrics.errorCount = metrics.clientErrorCount + metrics.serverErrorCount;
      metrics.errorRate = metrics.count === 0 ? 0 : metrics.errorCount / metrics.count;
      metrics.latency = summarizeLatency(durations);
      return metrics;
    })
    .sort(compareBySlowest);
}

function compareBySlowest(left: EndpointMetrics, right: EndpointMetrics): number {
  const leftP95 = left.latency?.p95Ms;
  const rightP95 = right.latency?.p95Ms;

  if (leftP95 === undefined && rightP95 === undefined) {
    return right.count - left.count || left.id.localeCompare(right.id);
  }

  if (leftP95 === undefined) {
    return 1;
  }

  if (rightP95 === undefined) {
    return -1;
  }

  return rightP95 - leftP95 || left.id.localeCompare(right.id);
}

export function computeCaptureMetrics(requests: CapturedRequest[]): CaptureMetrics {
  const endpoints = computeEndpointMetrics(requests);
  const durations = requests
    .map(usableDuration)
    .filter((duration): duration is number => duration !== undefined);
  const errorCount = endpoints.reduce((sum, endpoint) => sum + endpoint.errorCount, 0);

  return {
    endpoints,
    totalRequests: requests.length,
    timedRequests: durations.length,
    errorCount,
    errorRate: requests.length === 0 ? 0 : errorCount / requests.length,
    latency: summarizeLatency(durations)
  };
}

/**
 * Slowest endpoints by p95, limited to those with enough samples for the
 * number to mean anything — a single 3s request is noise, not a slow endpoint.
 */
export function slowestEndpoints(
  metrics: EndpointMetrics[],
  limit = 5,
  minimumSamples = 2
): EndpointMetrics[] {
  return metrics
    .filter((endpoint) => (endpoint.latency?.sampleCount ?? 0) >= minimumSamples)
    .slice(0, Math.max(0, limit));
}

/** Endpoints returning errors, worst rate first, then by absolute error count. */
export function errorProneEndpoints(metrics: EndpointMetrics[], limit = 5): EndpointMetrics[] {
  return metrics
    .filter((endpoint) => endpoint.errorCount > 0)
    .sort(
      (left, right) =>
        right.errorRate - left.errorRate ||
        right.errorCount - left.errorCount ||
        left.id.localeCompare(right.id)
    )
    .slice(0, Math.max(0, limit));
}

export function formatErrorRate(errorRate: number): string {
  const percent = errorRate * 100;

  if (percent > 0 && percent < 1) {
    return "<1%";
  }

  return `${Math.round(percent)}%`;
}
