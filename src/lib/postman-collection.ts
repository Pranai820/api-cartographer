import { formatDuration, formatStatusCounts } from "./format";
import type { CapturedRequest, EndpointGroup, HeaderEntry } from "./types";

export const POSTMAN_SCHEMA_URL = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";

export interface PostmanVariable {
  key: string;
  value: string;
  type: "string";
}

export interface PostmanQueryParam {
  key: string;
  value: string;
}

export interface PostmanUrl {
  raw: string;
  host: string[];
  path: string[];
  query?: PostmanQueryParam[];
  variable?: PostmanVariable[];
}

export interface PostmanBody {
  mode: "raw";
  raw: string;
  options: { raw: { language: "json" | "text" } };
}

export interface PostmanRequest {
  method: string;
  header: HeaderEntry[];
  url: PostmanUrl;
  description?: string;
  body?: PostmanBody;
}

export interface PostmanResponseExample {
  name: string;
  originalRequest: PostmanRequest;
  status: string;
  code: number;
  header: HeaderEntry[];
  body: string;
  _postman_previewlanguage: "json" | "text";
}

export interface PostmanRequestItem {
  name: string;
  request: PostmanRequest;
  response: PostmanResponseExample[];
}

export interface PostmanFolder {
  name: string;
  item: PostmanRequestItem[];
}

export type PostmanItem = PostmanFolder | PostmanRequestItem;

export interface PostmanCollection {
  info: {
    name: string;
    description: string;
    schema: typeof POSTMAN_SCHEMA_URL;
  };
  variable: PostmanVariable[];
  item: PostmanItem[];
}

/**
 * Headers Postman sets itself, or that describe the captured transport rather than the
 * request the user wants to replay. Sending these verbatim from a collection is at best
 * noise and at worst wrong (a stale Content-Length breaks the request).
 */
const SKIPPED_HEADER_NAMES = new Set(["host", "content-length", "connection", "accept-encoding"]);

const METHODS_WITH_BODY = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function sanitizeVariableName(origin: string): string {
  try {
    const parsed = new URL(origin);
    return parsed.host.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
  } catch {
    return origin.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
  }
}

/**
 * A single-origin capture gets the conventional `{{baseUrl}}`. Multi-origin captures need
 * one variable per origin, named after the host so the collection stays readable; a numeric
 * suffix breaks ties when two origins share a host (for example http:// and https://).
 */
function buildBaseUrlVariables(origins: string[]): Map<string, PostmanVariable> {
  const variables = new Map<string, PostmanVariable>();

  if (origins.length === 1) {
    variables.set(origins[0], { key: "baseUrl", value: origins[0], type: "string" });
    return variables;
  }

  const usedKeys = new Set<string>();

  for (const origin of origins) {
    const base = `baseUrl_${sanitizeVariableName(origin) || "origin"}`;
    let key = base;
    let suffix = 2;

    while (usedKeys.has(key)) {
      key = `${base}_${suffix}`;
      suffix += 1;
    }

    usedKeys.add(key);
    variables.set(origin, { key, value: origin, type: "string" });
  }

  return variables;
}

function notableHeaders(sample: CapturedRequest | undefined): HeaderEntry[] {
  if (!sample) {
    return [];
  }

  return sample.requestHeaders.filter((header) => !SKIPPED_HEADER_NAMES.has(header.name.trim().toLowerCase()));
}

function isJsonText(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Converts `/users/{id}/posts/{id}` into Postman's `:id` style, pairing each placeholder
 * with the value observed in a sample so the request is runnable as-is. Repeated names are
 * suffixed because Postman keys path variables by name.
 */
function buildPathSegments(
  pathTemplate: string,
  sample: CapturedRequest | undefined
): { segments: string[]; variables: PostmanVariable[] } {
  const templateSegments = pathTemplate.split("/").filter((segment) => segment.length > 0);
  const sampleSegments = (sample?.path ?? "").split("/").filter((segment) => segment.length > 0);
  const variables: PostmanVariable[] = [];
  const usedNames = new Set<string>();

  const segments = templateSegments.map((segment, index) => {
    const match = /^\{([^}]+)\}$/.exec(segment);

    if (!match) {
      return segment;
    }

    let name = match[1];
    let suffix = 2;

    while (usedNames.has(name)) {
      name = `${match[1]}${suffix}`;
      suffix += 1;
    }

    usedNames.add(name);
    variables.push({
      key: name,
      value: templateSegments.length === sampleSegments.length ? sampleSegments[index] ?? "" : "",
      type: "string"
    });

    return `:${name}`;
  });

  return { segments, variables };
}

function buildQueryParams(samples: CapturedRequest[]): PostmanQueryParam[] {
  const params = new Map<string, string>();

  for (const sample of samples) {
    for (const entry of sample.query) {
      if (!params.has(entry.name)) {
        params.set(entry.name, entry.value);
      }
    }
  }

  return Array.from(params.entries()).map(([key, value]) => ({ key, value }));
}

function buildBody(group: EndpointGroup): PostmanBody | undefined {
  if (!METHODS_WITH_BODY.has(group.method.toUpperCase())) {
    return undefined;
  }

  const raw = group.samples.find((sample) => sample.requestBody)?.requestBody;

  if (!raw) {
    return undefined;
  }

  const json = isJsonText(raw);

  return {
    mode: "raw",
    raw: json ? JSON.stringify(JSON.parse(raw), null, 2) : raw,
    options: { raw: { language: json ? "json" : "text" } }
  };
}

function describeGroup(group: EndpointGroup): string {
  return [
    `Observed ${group.count} request${group.count === 1 ? "" : "s"} from ${group.origin}.`,
    `Status pattern: ${formatStatusCounts(group.statusCounts) || "none recorded"}.`,
    `Average duration: ${formatDuration(group.averageDurationMs)}.`,
    `Last seen: ${group.lastSeen}.`,
    "Captured by API Cartographer."
  ].join(" ");
}

function buildUrl(group: EndpointGroup, baseUrlKey: string): PostmanUrl {
  const sample = group.samples[0];
  const { segments, variables } = buildPathSegments(group.pathTemplate, sample);
  const query = buildQueryParams(group.samples);
  const variablePlaceholder = `{{${baseUrlKey}}}`;
  const search = query.length ? `?${query.map((param) => `${param.key}=${param.value}`).join("&")}` : "";

  return {
    raw: `${variablePlaceholder}${segments.length ? `/${segments.join("/")}` : "/"}${search}`,
    host: [variablePlaceholder],
    path: segments,
    ...(query.length ? { query } : {}),
    ...(variables.length ? { variable: variables } : {})
  };
}

function buildResponseExamples(group: EndpointGroup, request: PostmanRequest): PostmanResponseExample[] {
  const sample = group.samples.find((item) => item.responseBody);

  if (!sample?.responseBody) {
    return [];
  }

  const json = isJsonText(sample.responseBody);

  return [
    {
      name: `${sample.status}${sample.statusText ? ` ${sample.statusText}` : ""}`,
      originalRequest: request,
      status: sample.statusText ?? "",
      code: sample.status,
      header: sample.responseHeaders,
      body: sample.responseBody,
      _postman_previewlanguage: json ? "json" : "text"
    }
  ];
}

function buildRequestItem(group: EndpointGroup, baseUrlKey: string): PostmanRequestItem {
  const body = buildBody(group);
  const request: PostmanRequest = {
    method: group.method.toUpperCase(),
    header: notableHeaders(group.samples[0]),
    url: buildUrl(group, baseUrlKey),
    description: describeGroup(group),
    ...(body ? { body } : {})
  };

  return {
    name: `${group.method.toUpperCase()} ${group.pathTemplate}`,
    request,
    response: buildResponseExamples(group, request)
  };
}

/**
 * Builds a Postman Collection v2.1 document from grouped captures. Like the OpenAPI and
 * Markdown exports, this expects groups that have already been through `redactEndpointGroups`
 * — it copies sample headers and bodies through verbatim.
 */
export function buildPostmanCollection(
  groups: EndpointGroup[],
  name = "Captured API",
  description = "Generated from browser DevTools network traffic by API Cartographer."
): PostmanCollection {
  const sortedGroups = [...groups].sort(
    (left, right) =>
      left.origin.localeCompare(right.origin) ||
      left.pathTemplate.localeCompare(right.pathTemplate) ||
      left.method.localeCompare(right.method)
  );
  const origins = unique(sortedGroups.map((group) => group.origin));
  const baseUrlVariables = buildBaseUrlVariables(origins);
  const singleOrigin = origins.length <= 1;

  const item: PostmanItem[] = singleOrigin
    ? sortedGroups.map((group) => buildRequestItem(group, baseUrlVariables.get(group.origin)?.key ?? "baseUrl"))
    : origins.map((origin) => ({
        name: origin,
        item: sortedGroups
          .filter((group) => group.origin === origin)
          .map((group) => buildRequestItem(group, baseUrlVariables.get(origin)?.key ?? "baseUrl"))
      }));

  return {
    info: {
      name,
      description,
      schema: POSTMAN_SCHEMA_URL
    },
    variable: Array.from(baseUrlVariables.values()),
    item
  };
}
