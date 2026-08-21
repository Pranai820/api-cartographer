import { formatGraphQlOperation, parseGraphQlOperation } from "./graphql-operations";
import type { CapturedRequest, EndpointGroup, HeaderEntry } from "./types";

interface HarHeader {
  name: string;
  value: string;
}

interface HarQuery {
  name: string;
  value: string;
}

export interface HarEntryLike {
  request: {
    method: string;
    url: string;
    headers?: HarHeader[];
    queryString?: HarQuery[];
    postData?: {
      text?: string;
    };
  };
  response: {
    status: number;
    statusText?: string;
    headers?: HarHeader[];
    content?: {
      mimeType?: string;
      text?: string;
      encoding?: string;
    };
  };
  startedDateTime?: string;
  time?: number;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LONG_HEX_PATTERN = /^[0-9a-f]{16,}$/i;
const NUMBER_PATTERN = /^\d+$/;
const SLUG_ID_PATTERN = /^[a-z0-9]+-[0-9a-f]{8,}$/i;

export function normalizePath(pathname: string): string {
  const cleanPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const segments = cleanPath.split("/").map((segment) => {
    if (!segment) {
      return segment;
    }

    if (NUMBER_PATTERN.test(segment)) {
      return "{id}";
    }

    if (UUID_PATTERN.test(segment)) {
      return "{uuid}";
    }

    if (LONG_HEX_PATTERN.test(segment) || SLUG_ID_PATTERN.test(segment)) {
      return "{hash}";
    }

    return segment;
  });

  return segments.join("/") || "/";
}

/**
 * Identity of an endpoint for grouping, metrics, and session diffing. GraphQL
 * requests carry their operation in the key: they all share one method and path,
 * so without it every operation on a schema collapses into a single row.
 */
export function endpointKey(
  request: Pick<CapturedRequest, "method" | "origin" | "pathTemplate"> &
    Partial<Pick<CapturedRequest, "graphqlOperation">>
): string {
  const base = `${request.method.toUpperCase()} ${request.origin}${request.pathTemplate}`;

  return request.graphqlOperation ? `${base} [${formatGraphQlOperation(request.graphqlOperation)}]` : base;
}

export function toHeaderEntries(headers?: HarHeader[]): HeaderEntry[] {
  return (headers ?? []).map((header) => ({
    name: header.name,
    value: header.value
  }));
}

export function createCapturedRequestFromHarEntry(
  entry: HarEntryLike,
  responseBody?: string,
  responseContentEncoding?: string
): CapturedRequest {
  const parsedUrl = new URL(entry.request.url);
  const path = parsedUrl.pathname || "/";
  const queryFromUrl = Array.from(parsedUrl.searchParams.entries()).map(([name, value]) => ({ name, value }));
  const query = entry.request.queryString?.length ? entry.request.queryString : queryFromUrl;
  const method = entry.request.method.toUpperCase();
  const requestBody = entry.request.postData?.text;

  return {
    id: crypto.randomUUID(),
    url: entry.request.url,
    origin: parsedUrl.origin,
    path,
    pathTemplate: normalizePath(path),
    method,
    status: entry.response.status,
    statusText: entry.response.statusText,
    mimeType: entry.response.content?.mimeType,
    startedDateTime: entry.startedDateTime ?? new Date().toISOString(),
    durationMs: typeof entry.time === "number" && Number.isFinite(entry.time) ? Math.max(0, entry.time) : undefined,
    requestHeaders: toHeaderEntries(entry.request.headers),
    responseHeaders: toHeaderEntries(entry.response.headers),
    query,
    requestBody,
    responseBody,
    responseContentEncoding,
    graphqlOperation: parseGraphQlOperation({ method, query, requestBody })
  };
}

function isHarEntryLike(value: unknown): value is HarEntryLike {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as Record<string, unknown>;
  const request = entry.request as Record<string, unknown> | undefined;
  const response = entry.response as Record<string, unknown> | undefined;

  return Boolean(
    request &&
      typeof request.method === "string" &&
      typeof request.url === "string" &&
      response &&
      typeof response.status === "number"
  );
}

export function parseHarLog(value: unknown): CapturedRequest[] {
  const entries = (value as { log?: { entries?: unknown } } | undefined)?.log?.entries;

  if (!Array.isArray(entries)) {
    return [];
  }

  const requests: CapturedRequest[] = [];

  for (const entry of entries) {
    if (!isHarEntryLike(entry)) {
      continue;
    }

    try {
      requests.push(createCapturedRequestFromHarEntry(entry, entry.response.content?.text, entry.response.content?.encoding));
    } catch {
      continue;
    }
  }

  return requests;
}

export function groupRequests(requests: CapturedRequest[], maxSamplesPerGroup = 3): EndpointGroup[] {
  const groups = new Map<string, EndpointGroup & { totalDurationMs: number; durationCount: number }>();

  for (const request of requests) {
    const key = endpointKey(request);
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        id: key,
        origin: request.origin,
        method: request.method,
        pathTemplate: request.pathTemplate,
        count: 1,
        lastSeen: request.startedDateTime,
        averageDurationMs: request.durationMs,
        statusCounts: { [String(request.status)]: 1 },
        samples: [request],
        // Shared by every member: the operation label is part of the group key.
        graphqlOperation: request.graphqlOperation,
        totalDurationMs: request.durationMs ?? 0,
        durationCount: request.durationMs === undefined ? 0 : 1
      });
      continue;
    }

    existing.count += 1;
    existing.lastSeen = request.startedDateTime > existing.lastSeen ? request.startedDateTime : existing.lastSeen;
    existing.statusCounts[String(request.status)] = (existing.statusCounts[String(request.status)] ?? 0) + 1;

    if (request.durationMs !== undefined) {
      existing.totalDurationMs += request.durationMs;
      existing.durationCount += 1;
      existing.averageDurationMs = existing.totalDurationMs / existing.durationCount;
    }

    if (existing.samples.length < maxSamplesPerGroup) {
      existing.samples.push(request);
    }
  }

  return Array.from(groups.values())
    .map(({ totalDurationMs: _totalDurationMs, durationCount: _durationCount, ...group }) => group)
    .sort((a, b) => b.count - a.count || a.pathTemplate.localeCompare(b.pathTemplate));
}