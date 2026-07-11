export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | string;

export interface HeaderEntry {
  name: string;
  value: string;
}

export interface CapturedRequest {
  id: string;
  url: string;
  origin: string;
  path: string;
  pathTemplate: string;
  method: HttpMethod;
  status: number;
  statusText?: string;
  mimeType?: string;
  startedDateTime: string;
  durationMs?: number;
  requestHeaders: HeaderEntry[];
  responseHeaders: HeaderEntry[];
  query: HeaderEntry[];
  requestBody?: string;
  responseBody?: string;
  responseContentEncoding?: string;
}

export interface EndpointGroup {
  id: string;
  origin: string;
  method: HttpMethod;
  pathTemplate: string;
  count: number;
  lastSeen: string;
  averageDurationMs?: number;
  statusCounts: Record<string, number>;
  samples: CapturedRequest[];
}

export interface OpenApiDocument {
  openapi: "3.1.0";
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{ url: string }>;
  paths: Record<string, Record<string, unknown>>;
}