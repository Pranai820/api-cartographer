import type { CapturedRequest, EndpointGroup, OpenApiDocument } from "./types";

const METHODS_WITH_BODY = new Set(["POST", "PUT", "PATCH"]);

type JsonSchema = Record<string, unknown>;

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function uniqueSchemas(schemas: JsonSchema[]): JsonSchema[] {
  const seen = new Set<string>();
  const result: JsonSchema[] = [];

  for (const schema of schemas) {
    const key = JSON.stringify(schema);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(schema);
    }
  }

  return result;
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

function schemaType(schema: JsonSchema): string | undefined {
  return typeof schema.type === "string" ? schema.type : undefined;
}

function expandAnyOf(schema: JsonSchema): JsonSchema[] {
  return Array.isArray(schema.anyOf)
    ? schema.anyOf.filter((child): child is JsonSchema => Boolean(child) && typeof child === "object" && !Array.isArray(child))
    : [schema];
}

function requiredFields(schema: JsonSchema): string[] {
  return Array.isArray(schema.required) ? schema.required.filter((field): field is string => typeof field === "string") : [];
}

function mergeSchemas(schemas: JsonSchema[]): JsonSchema | undefined {
  const compactSchemas = uniqueSchemas(schemas);

  if (!compactSchemas.length) {
    return undefined;
  }

  if (compactSchemas.length === 1) {
    return compactSchemas[0];
  }

  const expandedSchemas = uniqueSchemas(compactSchemas.flatMap(expandAnyOf));
  const types = unique(expandedSchemas.map(schemaType).filter((type): type is string => Boolean(type)));

  if (expandedSchemas.some((schema) => !schemaType(schema))) {
    return { anyOf: expandedSchemas };
  }

  if (types.includes("number") && types.includes("integer") && types.length === 2) {
    return { type: "number" };
  }

  if (types.length !== 1) {
    return { anyOf: expandedSchemas };
  }

  const [type] = types;

  if (type === "array") {
    const itemSchemas = compactSchemas
      .map((schema) => schema.items)
      .filter((item): item is JsonSchema => Boolean(item) && typeof item === "object" && !Array.isArray(item));

    return {
      type: "array",
      ...(itemSchemas.length ? { items: mergeSchemas(itemSchemas) ?? {} } : {})
    };
  }

  if (type === "object") {
    const propertyNames = unique(
      compactSchemas.flatMap((schema) => Object.keys((schema.properties as Record<string, JsonSchema> | undefined) ?? {}))
    ).sort();
    const properties: Record<string, JsonSchema> = {};

    for (const name of propertyNames) {
      const propertySchemas = compactSchemas
        .map((schema) => (schema.properties as Record<string, JsonSchema> | undefined)?.[name])
        .filter((schema): schema is JsonSchema => Boolean(schema));
      const merged = mergeSchemas(propertySchemas);

      if (merged) {
        properties[name] = merged;
      }
    }

    const commonRequired = requiredFields(compactSchemas[0]).filter((field) =>
      compactSchemas.every((schema) => requiredFields(schema).includes(field))
    );

    return {
      type: "object",
      properties,
      ...(commonRequired.length ? { required: commonRequired.sort() } : {})
    };
  }

  return compactSchemas[0];
}

function inferSchema(value: unknown): JsonSchema {
  if (Array.isArray(value)) {
    return {
      type: "array",
      items: mergeSchemas(value.map(inferSchema)) ?? {}
    };
  }

  if (value === null) {
    return { type: "null" };
  }

  if (typeof value === "object") {
    const properties: Record<string, JsonSchema> = {};
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
      ...(required.length ? { required: required.sort() } : {})
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

function buildJsonContent(samples: CapturedRequest[], selectBody: (sample: CapturedRequest) => string | undefined): Record<string, unknown> | undefined {
  const schemas = samples
    .map((sample) => tryParseJson(selectBody(sample)))
    .filter((value) => value !== undefined)
    .map(inferSchema);
  const schema = mergeSchemas(schemas);

  if (!schema) {
    return undefined;
  }

  return {
    "application/json": {
      schema
    }
  };
}

export function buildOpenApiDocument(
  groups: EndpointGroup[],
  title = "Captured API",
  version = "0.1.0"
): OpenApiDocument {
  const servers = unique(groups.map((group) => group.origin)).map((url) => ({ url }));
  const paths: OpenApiDocument["paths"] = {};

  for (const group of groups) {
    const sample = group.samples[0];
    const method = group.method.toLowerCase();
    const requestContent = METHODS_WITH_BODY.has(group.method.toUpperCase())
      ? buildJsonContent(group.samples, (sample) => sample.requestBody)
      : undefined;
    const responses = Object.keys(group.statusCounts).reduce<Record<string, unknown>>((acc, status) => {
      const statusSamples = group.samples.filter((sample) => String(sample.status) === status);
      const responseContent = buildJsonContent(statusSamples, (sample) => sample.responseBody);

      acc[status] = {
        description: statusSamples[0]?.statusText || sample?.statusText || `HTTP ${status}`,
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
      version,
      description: "Generated from browser DevTools network traffic by API Cartographer."
    },
    servers,
    paths
  };
}
