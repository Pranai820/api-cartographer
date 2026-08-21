export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | string;

export interface HeaderEntry {
  name: string;
  value: string;
}

/** "batch" covers a single HTTP request carrying several GraphQL operations. */
export type GraphQlOperationType = "query" | "mutation" | "subscription" | "batch";

export interface GraphQlOperation {
  type: GraphQlOperationType;
  /** Operation name when the payload or document names one; absent for anonymous operations. */
  name?: string;
  /** Operations carried by the HTTP request: 1 normally, more for batched payloads. */
  operationCount: number;
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
  /** Present only when the request body parses as a GraphQL payload. */
  graphqlOperation?: GraphQlOperation;
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
  /** Set when every request in the group shares one GraphQL operation. */
  graphqlOperation?: GraphQlOperation;
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