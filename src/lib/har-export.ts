import { redactCapturedRequest } from "./redaction";
import type { RedactionProfile } from "./redaction";
import type { CapturedRequest, HeaderEntry } from "./types";

export interface HarNameValue {
  name: string;
  value: string;
}

export interface HarExportEntry {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    headers: HarNameValue[];
    queryString: HarNameValue[];
    cookies: HarNameValue[];
    headersSize: number;
    bodySize: number;
    postData?: {
      mimeType: string;
      text: string;
    };
  };
  response: {
    status: number;
    statusText: string;
    httpVersion: string;
    headers: HarNameValue[];
    cookies: HarNameValue[];
    content: {
      size: number;
      mimeType: string;
      text?: string;
      encoding?: string;
    };
    redirectURL: string;
    headersSize: number;
    bodySize: number;
  };
  cache: Record<string, never>;
  timings: {
    send: number;
    wait: number;
    receive: number;
  };
}

export interface HarDocument {
  log: {
    version: "1.2";
    creator: {
      name: string;
      version: string;
    };
    entries: HarExportEntry[];
  };
}

export interface HarExportOptions {
  redactionProfile?: RedactionProfile;
  creatorName?: string;
  creatorVersion?: string;
}

const DEFAULT_MIME_TYPE = "application/octet-stream";
const UNKNOWN_HTTP_VERSION = "HTTP/1.1";

function toHarNameValues(headers: HeaderEntry[]): HarNameValue[] {
  return headers.map((header) => ({ name: header.name, value: header.value }));
}

function headerValue(headers: HeaderEntry[], name: string): string | undefined {
  const match = headers.find((header) => header.name.toLowerCase() === name.toLowerCase());
  return match?.value;
}

/**
 * HAR sizes are byte counts, and `-1` is the spec's "not known". The capture
 * only ever holds a decoded string, so measure it in UTF-8 bytes when one is
 * present and fall back to -1 rather than guessing from string length.
 */
function byteLength(text: string | undefined): number {
  if (text === undefined) {
    return -1;
  }

  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(text).length;
  }

  return text.length;
}

function requestMimeType(request: CapturedRequest): string {
  return headerValue(request.requestHeaders, "content-type") ?? DEFAULT_MIME_TYPE;
}

function locationOf(request: CapturedRequest): string {
  return headerValue(request.responseHeaders, "location") ?? "";
}

function toHarEntry(request: CapturedRequest): HarExportEntry {
  const requestBody = request.requestBody;
  const responseBody = request.responseBody;
  // HAR requires the phase timings to sum to `time`; only a total is captured,
  // so it is attributed to `wait` and the unmeasured phases are marked -1.
  const time = typeof request.durationMs === "number" && Number.isFinite(request.durationMs)
    ? Math.max(0, request.durationMs)
    : -1;

  return {
    startedDateTime: request.startedDateTime,
    time,
    request: {
      method: request.method.toUpperCase(),
      url: request.url,
      httpVersion: UNKNOWN_HTTP_VERSION,
      headers: toHarNameValues(request.requestHeaders),
      queryString: toHarNameValues(request.query),
      cookies: [],
      headersSize: -1,
      bodySize: byteLength(requestBody),
      ...(requestBody === undefined
        ? {}
        : {
            postData: {
              mimeType: requestMimeType(request),
              text: requestBody
            }
          })
    },
    response: {
      status: request.status,
      statusText: request.statusText ?? "",
      httpVersion: UNKNOWN_HTTP_VERSION,
      headers: toHarNameValues(request.responseHeaders),
      cookies: [],
      content: {
        size: byteLength(responseBody),
        mimeType: request.mimeType ?? DEFAULT_MIME_TYPE,
        ...(responseBody === undefined ? {} : { text: responseBody }),
        ...(request.responseContentEncoding === undefined
          ? {}
          : { encoding: request.responseContentEncoding })
      },
      redirectURL: locationOf(request),
      headersSize: -1,
      bodySize: byteLength(responseBody)
    },
    cache: {},
    timings: {
      send: -1,
      wait: time,
      receive: -1
    }
  };
}

/**
 * Builds a HAR 1.2 log from captured requests, the inverse of `parseHarLog`.
 * Entries are ordered oldest-first, the order a HAR viewer expects, and are
 * redacted on the way out like every other export path.
 */
export function buildHarDocument(
  requests: CapturedRequest[],
  options: HarExportOptions = {}
): HarDocument {
  const { redactionProfile = "standard", creatorName = "API Cartographer", creatorVersion = "0.1.0" } = options;

  const entries = [...requests]
    .sort((left, right) => left.startedDateTime.localeCompare(right.startedDateTime))
    .map((request) => toHarEntry(redactCapturedRequest(request, redactionProfile)));

  return {
    log: {
      version: "1.2",
      creator: {
        name: creatorName,
        version: creatorVersion
      },
      entries
    }
  };
}

export function buildHarJson(requests: CapturedRequest[], options: HarExportOptions = {}): string {
  return JSON.stringify(buildHarDocument(requests, options), null, 2);
}
