import type { CapturedRequest, GraphQlOperation, GraphQlOperationType, HeaderEntry } from "./types";

const OPERATION_KEYWORDS = new Set<string>(["query", "mutation", "subscription"]);
const DOCUMENT_LEADING_KEYWORDS = new Set<string>([...OPERATION_KEYWORDS, "fragment"]);
const LEADING_NAME_PATTERN = /^([_A-Za-z][_0-9A-Za-z]*)/;
const OPERATION_HEADER_PATTERN = /(?:^|[}\s])(query|mutation|subscription)\b\s*([_A-Za-z][_0-9A-Za-z]*)?/;
const ROOT_FIELD_PATTERN = /^\s*(?:\.\.\.\s*)?([_A-Za-z][_0-9A-Za-z]*)\s*(:)?\s*([_A-Za-z][_0-9A-Za-z]*)?/;
const METHODS_WITH_PAYLOAD = new Set(["POST", "PUT", "PATCH"]);

/**
 * GraphQL comments run from `#` to end of line. Stripping them with a regex can
 * also blank a `#` inside a string literal, which is acceptable here: this module
 * only ever reads the operation header and the first root field, both of which
 * sit ahead of any string literal in a well-formed document.
 */
function stripComments(document: string): string {
  return document.replace(/#[^\n\r]*/g, " ");
}

/**
 * Recognizes a GraphQL document well enough to name it, without pulling in a
 * parser. A document must contain a selection set and must start either with one
 * (`{ ... }`) or with an operation/fragment keyword. That deliberately rejects
 * REST payloads that merely happen to carry a `query` string, such as a search
 * endpoint posting `{"query": "running shoes"}`.
 */
export function looksLikeGraphQlDocument(document: string): boolean {
  const source = stripComments(document).trim();

  if (!source || !source.includes("{")) {
    return false;
  }

  if (source.startsWith("{")) {
    return true;
  }

  const leading = source.match(LEADING_NAME_PATTERN);

  return Boolean(leading && DOCUMENT_LEADING_KEYWORDS.has(leading[1]));
}

/**
 * First field of a selection set, used to name anonymous operations. An aliased
 * field (`latest: orders`) reports the field rather than the alias, since the
 * field is what the server actually resolves.
 */
function firstRootField(text: string): string | undefined {
  const braceIndex = text.indexOf("{");

  if (braceIndex === -1) {
    return undefined;
  }

  const match = text.slice(braceIndex + 1).match(ROOT_FIELD_PATTERN);

  if (!match) {
    return undefined;
  }

  return match[2] && match[3] ? match[3] : match[1];
}

interface DocumentInfo {
  type: GraphQlOperationType;
  name?: string;
}

function readDocument(document: string): DocumentInfo | undefined {
  const source = stripComments(document).trim();

  if (!source) {
    return undefined;
  }

  // A bare selection set is an anonymous query in GraphQL's shorthand form.
  if (source.startsWith("{")) {
    return { type: "query", name: firstRootField(source) };
  }

  const header = source.match(OPERATION_HEADER_PATTERN);

  if (!header) {
    return undefined;
  }

  const type = header[1] as GraphQlOperationType;
  const declaredName = header[2];
  const afterHeader = source.slice((header.index ?? 0) + header[0].length);

  return { type, name: declaredName ?? firstRootField(afterHeader) };
}

function trimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : undefined;
}

/**
 * Reads one GraphQL-over-HTTP payload: `{ query, operationName?, variables? }`.
 * Variables are never read — an operation label is rendered in the panel and
 * written into exports, and variables routinely carry credentials and personal
 * data.
 */
function readPayload(value: unknown): GraphQlOperation | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const payload = value as Record<string, unknown>;
  const document = typeof payload.query === "string" ? payload.query : undefined;

  if (!document || !looksLikeGraphQlDocument(document)) {
    return undefined;
  }

  const info = readDocument(document);

  if (!info) {
    return undefined;
  }

  return {
    type: info.type,
    name: trimmedString(payload.operationName) ?? info.name,
    operationCount: 1
  };
}

/**
 * A batched payload is an array of operations sent as one HTTP request. It stays
 * a single captured request, so it is labelled by size rather than by name: the
 * members can differ per batch, and naming it after the first would misreport
 * the rest.
 */
function readBatch(entries: unknown[]): GraphQlOperation | undefined {
  const operations = entries
    .map(readPayload)
    .filter((operation): operation is GraphQlOperation => operation !== undefined);

  if (operations.length === 0) {
    return undefined;
  }

  if (operations.length === 1) {
    return operations[0];
  }

  return { type: "batch", operationCount: operations.length };
}

function parseJson(text?: string): unknown {
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function findQueryParam(query: HeaderEntry[], name: string): string | undefined {
  return query.find((entry) => entry.name.toLowerCase() === name.toLowerCase())?.value;
}

export type GraphQlRequestLike = Pick<CapturedRequest, "method" | "query"> &
  Partial<Pick<CapturedRequest, "requestBody">>;

/**
 * Detects a GraphQL operation from a captured request. Detection is driven by the
 * payload shape rather than by the path, because GraphQL is not always served
 * from `/graphql`; the document check in `looksLikeGraphQlDocument` is what keeps
 * that from over-matching.
 */
export function parseGraphQlOperation(request: GraphQlRequestLike): GraphQlOperation | undefined {
  const method = request.method.toUpperCase();

  if (METHODS_WITH_PAYLOAD.has(method)) {
    const payload = parseJson(request.requestBody);

    return Array.isArray(payload) ? readBatch(payload) : readPayload(payload);
  }

  if (method === "GET") {
    const document = findQueryParam(request.query ?? [], "query");

    if (!document) {
      return undefined;
    }

    return readPayload({
      query: document,
      operationName: findQueryParam(request.query ?? [], "operationName")
    });
  }

  return undefined;
}

/** Human-readable label, also used as the grouping suffix in `endpointKey`. */
export function formatGraphQlOperation(operation: GraphQlOperation): string {
  if (operation.type === "batch") {
    return `batch of ${operation.operationCount}`;
  }

  return operation.name ? `${operation.type} ${operation.name}` : `${operation.type} (anonymous)`;
}
