import { describe, expect, it } from "vitest";
import {
  formatGraphQlOperation,
  looksLikeGraphQlDocument,
  parseGraphQlOperation
} from "../src/lib/graphql-operations";
import type { CapturedRequest } from "../src/lib/types";

function post(body: unknown, overrides: Partial<CapturedRequest> = {}): CapturedRequest {
  return {
    id: "request",
    url: "https://api.example.com/graphql",
    origin: "https://api.example.com",
    path: "/graphql",
    pathTemplate: "/graphql",
    method: "POST",
    status: 200,
    startedDateTime: "2026-08-21T00:00:00.000Z",
    requestHeaders: [],
    responseHeaders: [],
    query: [],
    requestBody: typeof body === "string" ? body : JSON.stringify(body),
    ...overrides
  };
}

describe("graphql document recognition", () => {
  it("accepts operations, shorthand selection sets, and fragment-first documents", () => {
    expect(looksLikeGraphQlDocument("query Users { users { id } }")).toBe(true);
    expect(looksLikeGraphQlDocument("{ users { id } }")).toBe(true);
    expect(looksLikeGraphQlDocument("fragment F on User { id } query Users { ...F }")).toBe(true);
  });

  it("rejects a REST payload that happens to carry a query string", () => {
    expect(looksLikeGraphQlDocument("running shoes")).toBe(false);
    expect(parseGraphQlOperation(post({ query: "running shoes" }))).toBeUndefined();
  });

  it("rejects a search payload even when the term contains a brace", () => {
    expect(looksLikeGraphQlDocument("shoes {sale}")).toBe(false);
  });
});

describe("parseGraphQlOperation", () => {
  it("reads the operation type and declared name", () => {
    expect(parseGraphQlOperation(post({ query: "mutation CreateUser($input: UserInput!) { createUser(input: $input) { id } }" }))).toEqual({
      type: "mutation",
      name: "CreateUser",
      operationCount: 1
    });
  });

  it("prefers an explicit operationName over the name in the document", () => {
    const operation = parseGraphQlOperation(
      post({ query: "query A { a } query B { b }", operationName: "B" })
    );

    expect(operation).toEqual({ type: "query", name: "B", operationCount: 1 });
  });

  it("names an anonymous operation after its first root field", () => {
    expect(parseGraphQlOperation(post({ query: "{ viewer { id } }" }))).toEqual({
      type: "query",
      name: "viewer",
      operationCount: 1
    });
    expect(parseGraphQlOperation(post({ query: "query { orders { id } }" }))).toEqual({
      type: "query",
      name: "orders",
      operationCount: 1
    });
  });

  it("reports the resolved field rather than its alias", () => {
    expect(parseGraphQlOperation(post({ query: "query { latest: orders { id } }" }))?.name).toBe("orders");
  });

  it("ignores comments when reading the operation header", () => {
    expect(parseGraphQlOperation(post({ query: "# mutation DropEverything\nquery Users { users { id } }" }))).toEqual({
      type: "query",
      name: "Users",
      operationCount: 1
    });
  });

  it("labels a batched payload by size rather than by its first member", () => {
    const operation = parseGraphQlOperation(
      post([{ query: "query A { a }" }, { query: "query B { b }" }, { query: "mutation C { c }" }])
    );

    expect(operation).toEqual({ type: "batch", operationCount: 3 });
  });

  it("treats a single-entry batch as a plain operation", () => {
    expect(parseGraphQlOperation(post([{ query: "query A { a }" }]))).toEqual({
      type: "query",
      name: "A",
      operationCount: 1
    });
  });

  it("reads GraphQL sent over GET", () => {
    const operation = parseGraphQlOperation(
      post(undefined, {
        method: "GET",
        requestBody: undefined,
        query: [
          { name: "query", value: "query Users { users { id } }" },
          { name: "operationName", value: "Users" }
        ]
      })
    );

    expect(operation).toEqual({ type: "query", name: "Users", operationCount: 1 });
  });

  it("returns undefined for non-GraphQL traffic and unparseable bodies", () => {
    expect(parseGraphQlOperation(post({ name: "Ada" }))).toBeUndefined();
    expect(parseGraphQlOperation(post("not json"))).toBeUndefined();
    expect(parseGraphQlOperation(post(undefined, { requestBody: undefined }))).toBeUndefined();
    expect(parseGraphQlOperation(post({ query: "query Users { users { id } }" }, { method: "DELETE" }))).toBeUndefined();
  });

  it("never carries variables into the parsed operation", () => {
    const operation = parseGraphQlOperation(
      post({
        query: "mutation SignIn($password: String!) { signIn(password: $password) { token } }",
        variables: { password: "hunter2", email: "ada@example.com" }
      })
    );

    expect(JSON.stringify(operation)).not.toContain("hunter2");
    expect(JSON.stringify(operation)).not.toContain("ada@example.com");
    expect(operation).toEqual({ type: "mutation", name: "SignIn", operationCount: 1 });
  });
});

describe("formatGraphQlOperation", () => {
  it("formats named, anonymous, and batched operations", () => {
    expect(formatGraphQlOperation({ type: "mutation", name: "CreateUser", operationCount: 1 })).toBe("mutation CreateUser");
    expect(formatGraphQlOperation({ type: "query", operationCount: 1 })).toBe("query (anonymous)");
    expect(formatGraphQlOperation({ type: "batch", operationCount: 3 })).toBe("batch of 3");
  });
});
