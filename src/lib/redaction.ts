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
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const IPV4_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

/**
 * "standard" mirrors the historical behavior: only headers/params/values that look
 * sensitive by name or shape are redacted, so the result stays useful for personal
 * storage and everyday OpenAPI/Markdown export.
 *
 * "strict" is meant for output you intend to share outside your own machine: every
 * header not on a small safe allowlist is redacted, every query value is redacted
 * (not just ones with sensitive-looking names), and embedded emails/IPv4 addresses
 * are scrubbed from remaining text.
 */
export type RedactionProfile = "standard" | "strict";

const STRICT_SAFE_HEADER_NAMES = new Set([
  "accept",
  "accept-encoding",
  "accept-language",
  "cache-control",
  "connection",
  "content-encoding",
  "content-length",
  "content-type",
  "host",
  "user-agent"
]);

export function isSensitiveName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return SENSITIVE_HEADER_NAMES.has(normalized) || SENSITIVE_NAME_PATTERN.test(normalized);
}

function isStrictSafeHeaderName(name: string): boolean {
  return STRICT_SAFE_HEADER_NAMES.has(name.trim().toLowerCase());
}

function scrubIdentifiers(value: string): string {
  return value.replace(EMAIL_PATTERN, REDACTED).replace(IPV4_PATTERN, REDACTED);
}

function redactPrimitive(value: unknown, key: string | undefined, profile: RedactionProfile): unknown {
  if (key && isSensitiveName(key)) {
    return REDACTED;
  }

  if (typeof value !== "string") {
    return value;
  }

  let result = value
    .replace(TOKEN_VALUE_PATTERN, (_match, scheme: string) => `${scheme} ${REDACTED}`)
    .replace(QUERY_SECRET_PATTERN, `$1${REDACTED}`);

  if (profile === "strict") {
    result = scrubIdentifiers(result);
  }

  return result;
}

function redactJsonValue(value: unknown, profile: RedactionProfile, key?: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactJsonValue(item, profile));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
        childKey,
        redactJsonValue(childValue, profile, childKey)
      ])
    );
  }

  return redactPrimitive(value, key, profile);
}

export function redactHeaders(headers: HeaderEntry[], profile: RedactionProfile = "standard"): HeaderEntry[] {
  return headers.map((header) => {
    if (isSensitiveName(header.name) || (profile === "strict" && !isStrictSafeHeaderName(header.name))) {
      return { name: header.name, value: REDACTED };
    }

    return { name: header.name, value: String(redactPrimitive(header.value, undefined, profile)) };
  });
}

export function redactQuery(query: HeaderEntry[], profile: RedactionProfile = "standard"): HeaderEntry[] {
  return query.map((entry) => {
    if (isSensitiveName(entry.name) || profile === "strict") {
      return { name: entry.name, value: REDACTED };
    }

    return { name: entry.name, value: String(redactPrimitive(entry.value, undefined, profile)) };
  });
}

export function redactBodyText(text?: string, profile: RedactionProfile = "standard"): string | undefined {
  if (!text) {
    return text;
  }

  try {
    return JSON.stringify(redactJsonValue(JSON.parse(text), profile), null, 2);
  } catch {
    return String(redactPrimitive(text, undefined, profile));
  }
}

export function redactCapturedRequest(request: CapturedRequest, profile: RedactionProfile = "standard"): CapturedRequest {
  return {
    ...request,
    requestHeaders: redactHeaders(request.requestHeaders, profile),
    responseHeaders: redactHeaders(request.responseHeaders, profile),
    query: redactQuery(request.query, profile),
    requestBody: redactBodyText(request.requestBody, profile),
    responseBody: redactBodyText(request.responseBody, profile)
  };
}

export function redactEndpointGroup(group: EndpointGroup, profile: RedactionProfile = "standard"): EndpointGroup {
  return {
    ...group,
    samples: group.samples.map((sample) => redactCapturedRequest(sample, profile))
  };
}

export function redactEndpointGroups(groups: EndpointGroup[], profile: RedactionProfile = "standard"): EndpointGroup[] {
  return groups.map((group) => redactEndpointGroup(group, profile));
}
