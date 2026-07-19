import { buildOpenApiDocument } from "./openapi";
import type { EndpointGroup } from "./types";

export interface StatusSchema {
  status: string;
  schema: unknown;
}

type OpenApiOperation = Record<string, unknown>;

export function buildEndpointOperation(
  group: EndpointGroup,
  title = "Captured API",
  version = "0.1.0"
): OpenApiOperation | undefined {
  const document = buildOpenApiDocument([group], title, version);
  const method = group.method.toLowerCase();
  return document.paths[group.pathTemplate]?.[method] as OpenApiOperation | undefined;
}

export function extractRequestSchema(operation: OpenApiOperation | undefined): unknown {
  const requestBody = operation?.requestBody as Record<string, unknown> | undefined;
  const content = requestBody?.content as Record<string, unknown> | undefined;
  const jsonContent = content?.["application/json"] as Record<string, unknown> | undefined;
  return jsonContent?.schema;
}

export function extractResponseSchemas(operation: OpenApiOperation | undefined): StatusSchema[] {
  const responses = (operation?.responses as Record<string, Record<string, unknown>> | undefined) ?? {};

  return Object.entries(responses)
    .map(([status, response]) => {
      const content = response?.content as Record<string, unknown> | undefined;
      const jsonContent = content?.["application/json"] as Record<string, unknown> | undefined;
      return { status, schema: jsonContent?.schema };
    })
    .filter((entry): entry is StatusSchema => entry.schema !== undefined)
    .sort((left, right) => Number(left.status) - Number(right.status));
}
