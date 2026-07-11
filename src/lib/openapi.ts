import type { CapturedRequest, EndpointGroup, OpenApiDocument } from "./types";

const METHODS_WITH_BODY = new Set(["POST", "PUT", "PATCH"]);

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function tryParseJson(text?: string): unknown {
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function inferSchema(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    return {
      type: "array",
      items: value.length > 0 ? inferSchema(value[0]) : {}
    };
  }

  if (value === null) {
    return { type: "null" };
  }

  if (typeof value === "object") {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      properties[key] = inferSchema(child);
      if (child !== null && child !== undefined) {
        required.push(key);
      }
    }

    return {
      type: "object",
      properties,
      ...(required.length ? { required } : {})
    };
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? { type: "integer" } : { type: "number" };
  }

  if (typeof value === "boolean") {
    return { type: "boolean" };
  }

  return { type: "string" };
}

function pathParameters(pathTemplate: string): Array<Record<string, unknown>> {
  const matches = unique(Array.from(pathTemplate.matchAll(/\{([^}]+)\}/g)).map((match) => match[1]));

  return matches.map((name) => ({
    name,
    in: "path",
    required: true,
    schema: { type: "string" }
  }));
}

function queryParameters(samples: CapturedRequest[]): Array<Record<string, unknown>> {
  const names = unique(samples.flatMap((sample) => sample.query.map((query) => query.name)));

  return names.map((name) => ({
    name,
    in: "query",
    required: false,
    schema: { type: "string" }
  }));
}

function buildJsonContent(sampleText?: string): Record<string, unknown> | undefined {
  const parsed = tryParseJson(sampleText);

  if (parsed === undefined) {
    return undefined;
  }

  return {
    "application/json": {
      schema: inferSchema(parsed)
    }
  };
}

export function buildOpenApiDocument(groups: EndpointGroup[], title = "Captured API"): OpenApiDocument {
  const servers = unique(groups.map((group) => group.origin)).map((url) => ({ url }));
  const paths: OpenApiDocument["paths"] = {};

  for (const group of groups) {
    const sample = group.samples[0];
    const method = group.method.toLowerCase();
    const requestContent = METHODS_WITH_BODY.has(group.method.toUpperCase())
      ? buildJsonContent(sample?.requestBody)
      : undefined;
    const responseContent = buildJsonContent(sample?.responseBody);
    const responses = Object.keys(group.statusCounts).reduce<Record<string, unknown>>((acc, status) => {
      acc[status] = {
        description: sample?.statusText || `HTTP ${status}`,
        ...(responseContent ? { content: responseContent } : {})
      };
      return acc;
    }, {});

    paths[group.pathTemplate] ??= {};
    paths[group.pathTemplate][method] = {
      summary: `${group.method.toUpperCase()} ${group.pathTemplate}`,
      parameters: [...pathParameters(group.pathTemplate), ...queryParameters(group.samples)],
      ...(requestContent ? { requestBody: { content: requestContent } } : {}),
      responses,
      "x-api-cartographer": {
        origin: group.origin,
        observedCount: group.count,
        lastSeen: group.lastSeen,
        averageDurationMs: group.averageDurationMs
      }
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title,
      version: "0.1.0",
      description: "Generated from browser DevTools network traffic by API Cartographer."
    },
    servers,
    paths
  };
}