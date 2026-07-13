import type { CapturedRequest, EndpointGroup, HeaderEntry } from "./types";

const REDACTED = "[REDACTED]";
const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
  "set-cookie",
  "x-api-key",
  "api-key",
  "x-auth-token",
  "x-csrf-token",
  "x-xsrf-token"
]);
const SENSITIVE_NAME_PATTERN = /(auth|authorization|cookie|csrf|xsrf|password|passwd|secret|session|token|api[-_]?key)/i;
const TOKEN_VALUE_PATTERN = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const QUERY_SECRET_PATTERN = /([?&](?:token|api[-_]?key|key|secret|session|password)=)[^&#\s]+/gi;

export function isSensitiveName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return SENSITIVE_HEADER_NAMES.has(normalized) || SENSITIVE_NAME_PATTERN.test(normalized);
}

function redactPrimitive(value: unknown, key?: string): unknown {
  if (key && isSensitiveName(key)) {
    return REDACTED;
  }

  if (typeof value !== "string") {
    return value;
  }

  return value
    .replace(TOKEN_VALUE_PATTERN, (_match, scheme: string) => `${scheme} ${REDACTED}`)
    .replace(QUERY_SECRET_PATTERN, `$1${REDACTED}`);
}

function redactJsonValue(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactJsonValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
        childKey,
        redactJsonValue(childValue, childKey)
      ])
    );
  }

  return redactPrimitive(value, key);
}

export function redactHeaders(headers: HeaderEntry[]): HeaderEntry[] {
  return headers.map((header) => ({
    name: header.name,
    value: isSensitiveName(header.name) ? REDACTED : String(redactPrimitive(header.value))
  }));
}

export function redactQuery(query: HeaderEntry[]): HeaderEntry[] {
  return query.map((entry) => ({
    name: entry.name,
    value: isSensitiveName(entry.name) ? REDACTED : String(redactPrimitive(entry.value))
  }));
}

export function redactBodyText(text?: string): string | undefined {
  if (!text) {
    return text;
  }

  try {
    return JSON.stringify(redactJsonValue(JSON.parse(text)), null, 2);
  } catch {
    return String(redactPrimitive(text));
  }
}

export function redactCapturedRequest(request: CapturedRequest): CapturedRequest {
  return {
    ...request,
    requestHeaders: redactHeaders(request.requestHeaders),
    responseHeaders: redactHeaders(request.responseHeaders),
    query: redactQuery(request.query),
    requestBody: redactBodyText(request.requestBody),
    responseBody: redactBodyText(request.responseBody)
  };
}

export function redactEndpointGroup(group: EndpointGroup): EndpointGroup {
  return {
    ...group,
    samples: group.samples.map(redactCapturedRequest)
  };
}

export function redactEndpointGroups(groups: EndpointGroup[]): EndpointGroup[] {
  return groups.map(redactEndpointGroup);
}
