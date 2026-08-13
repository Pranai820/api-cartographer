import { describe, expect, it } from "vitest";
import { redactBodyText, redactCapturedRequest, redactHeaders, redactQuery } from "../src/lib/redaction";
import type { CapturedRequest } from "../src/lib/types";

describe("redaction", () => {
  it("redacts sensitive headers", () => {
    expect(
      redactHeaders([
        { name: "Authorization", value: "Bearer abc.123" },
        { name: "accept", value: "application/json" }
      ])
    ).toEqual([
      { name: "Authorization", value: "[REDACTED]" },
      { name: "accept", value: "application/json" }
    ]);
  });

  it("redacts sensitive query values", () => {
    expect(
      redactQuery([
        { name: "api_key", value: "secret" },
        { name: "include", value: "teams" }
      ])
    ).toEqual([
      { name: "api_key", value: "[REDACTED]" },
      { name: "include", value: "teams" }
    ]);
  });

  it("redacts sensitive JSON fields in bodies", () => {
    const body = redactBodyText('{"user":"ada","password":"pass","profile":{"token":"abc","age":37}}');

    expect(JSON.parse(body ?? "{}")).toEqual({
      user: "ada",
      password: "[REDACTED]",
      profile: {
        token: "[REDACTED]",
        age: 37
      }
    });
  });

  it("redacts full captured requests before rendering or export", () => {
    const request: CapturedRequest = {
      id: "one",
      url: "https://api.example.com/users?token=secret",
      origin: "https://api.example.com",
      path: "/users",
      pathTemplate: "/users",
      method: "POST",
      status: 200,
      startedDateTime: "2026-07-13T00:00:00.000Z",
      requestHeaders: [{ name: "x-api-key", value: "secret" }],
      responseHeaders: [{ name: "content-type", value: "application/json" }],
      query: [{ name: "token", value: "secret" }],
      requestBody: '{"password":"pass"}',
      responseBody: '{"accessToken":"abc"}'
    };

    const redacted = redactCapturedRequest(request);

    expect(redacted.requestHeaders[0].value).toBe("[REDACTED]");
    expect(redacted.query[0].value).toBe("[REDACTED]");
    expect(redacted.requestBody).toContain("[REDACTED]");
    expect(redacted.responseBody).toContain("[REDACTED]");
  });

  it("standard profile leaves non-sensitive headers and query values alone", () => {
    expect(redactHeaders([{ name: "x-request-id", value: "abc-123" }], "standard")).toEqual([
      { name: "x-request-id", value: "abc-123" }
    ]);
    expect(redactQuery([{ name: "include", value: "teams" }], "standard")).toEqual([
      { name: "include", value: "teams" }
    ]);
  });

  it("strict profile redacts headers outside the safe allowlist", () => {
    expect(
      redactHeaders(
        [
          { name: "content-type", value: "application/json" },
          { name: "x-request-id", value: "abc-123" }
        ],
        "strict"
      )
    ).toEqual([
      { name: "content-type", value: "application/json" },
      { name: "x-request-id", value: "[REDACTED]" }
    ]);
  });

  it("strict profile redacts every query value regardless of name", () => {
    expect(redactQuery([{ name: "include", value: "teams" }], "strict")).toEqual([
      { name: "include", value: "[REDACTED]" }
    ]);
  });

  it("strict profile scrubs emails and IPv4 addresses embedded in body text", () => {
    const body = redactBodyText('{"contact":"ada@example.com","host":"10.0.0.5","age":37}', "strict");

    expect(JSON.parse(body ?? "{}")).toEqual({
      contact: "[REDACTED]",
      host: "[REDACTED]",
      age: 37
    });
  });

  it("redacts a full captured request with the strict profile", () => {
    const request: CapturedRequest = {
      id: "two",
      url: "https://api.example.com/users?include=teams",
      origin: "https://api.example.com",
      path: "/users",
      pathTemplate: "/users",
      method: "GET",
      status: 200,
      startedDateTime: "2026-08-13T00:00:00.000Z",
      requestHeaders: [
        { name: "content-type", value: "application/json" },
        { name: "x-request-id", value: "abc-123" }
      ],
      responseHeaders: [{ name: "content-type", value: "application/json" }],
      query: [{ name: "include", value: "teams" }],
      requestBody: undefined,
      responseBody: '{"owner":"ada@example.com"}'
    };

    const redacted = redactCapturedRequest(request, "strict");

    expect(redacted.requestHeaders).toEqual([
      { name: "content-type", value: "application/json" },
      { name: "x-request-id", value: "[REDACTED]" }
    ]);
    expect(redacted.query[0].value).toBe("[REDACTED]");
    expect(redacted.responseBody).toContain("[REDACTED]");
  });
});
