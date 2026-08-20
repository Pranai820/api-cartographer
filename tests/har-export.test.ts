import { describe, expect, it } from "vitest";
import { buildHarDocument, buildHarJson } from "../src/lib/har-export";
import { groupRequests, parseHarLog } from "../src/lib/request-model";
import type { CapturedRequest } from "../src/lib/types";

function request(overrides: Partial<CapturedRequest> = {}): CapturedRequest {
  return {
    id: "request",
    url: "https://api.example.com/users",
    origin: "https://api.example.com",
    path: "/users",
    pathTemplate: "/users",
    method: "GET",
    status: 200,
    statusText: "OK",
    mimeType: "application/json",
    startedDateTime: "2026-08-20T00:00:00.000Z",
    durationMs: 120,
    requestHeaders: [{ name: "Accept", value: "application/json" }],
    responseHeaders: [{ name: "Content-Type", value: "application/json" }],
    query: [],
    responseBody: '{"ok":true}',
    ...overrides
  };
}

function byteLengthOf(text: string): number {
  return new TextEncoder().encode(text).length;
}

describe("buildHarDocument", () => {
  it("emits a HAR 1.2 log with a creator", () => {
    const har = buildHarDocument([request()]);

    expect(har.log.version).toBe("1.2");
    expect(har.log.creator.name).toBe("API Cartographer");
    expect(har.log.entries).toHaveLength(1);
  });

  it("maps request and response fields onto the HAR shape", () => {
    const [entry] = buildHarDocument([request()]).log.entries;

    expect(entry.request).toMatchObject({
      method: "GET",
      url: "https://api.example.com/users",
      headers: [{ name: "Accept", value: "application/json" }]
    });
    expect(entry.response).toMatchObject({
      status: 200,
      statusText: "OK",
      content: { mimeType: "application/json" }
    });
    expect(JSON.parse(entry.response.content.text ?? "")).toEqual({ ok: true });
    expect(entry.startedDateTime).toBe("2026-08-20T00:00:00.000Z");
  });

  it("uppercases the method", () => {
    const [entry] = buildHarDocument([request({ method: "post" })]).log.entries;

    expect(entry.request.method).toBe("POST");
  });

  it("orders entries oldest first regardless of capture order", () => {
    const har = buildHarDocument([
      request({ id: "b", startedDateTime: "2026-08-20T00:00:02.000Z", path: "/second", pathTemplate: "/second" }),
      request({ id: "a", startedDateTime: "2026-08-20T00:00:01.000Z", path: "/first", pathTemplate: "/first" })
    ]);

    expect(har.log.entries.map((entry) => entry.startedDateTime)).toEqual([
      "2026-08-20T00:00:01.000Z",
      "2026-08-20T00:00:02.000Z"
    ]);
  });

  it("keeps timings consistent with the reported total time", () => {
    const [entry] = buildHarDocument([request({ durationMs: 250 })]).log.entries;

    expect(entry.time).toBe(250);
    expect(entry.timings.wait).toBe(250);
    expect(entry.timings.send).toBe(-1);
    expect(entry.timings.receive).toBe(-1);
  });

  it("uses the HAR unknown marker when nothing was timed", () => {
    const [entry] = buildHarDocument([request({ durationMs: undefined })]).log.entries;

    expect(entry.time).toBe(-1);
    expect(entry.timings.wait).toBe(-1);
  });

  it("includes postData only when a request body was captured", () => {
    const withBody = buildHarDocument([
      request({
        method: "POST",
        requestBody: '{"name":"Ada"}',
        requestHeaders: [{ name: "Content-Type", value: "application/json" }]
      })
    ]).log.entries[0];
    const withoutBody = buildHarDocument([request()]).log.entries[0];

    expect(withBody.request.postData?.mimeType).toBe("application/json");
    expect(JSON.parse(withBody.request.postData?.text ?? "")).toEqual({ name: "Ada" });
    expect(withoutBody.request.postData).toBeUndefined();
  });

  it("re-serializes JSON bodies the way every other export path does", () => {
    // redactBodyText parses and re-stringifies JSON, so bodies come out
    // pretty-printed. The value is preserved; the exact bytes are not.
    const [entry] = buildHarDocument([
      request({ responseBody: '{"a":1,"b":[2,3]}' })
    ]).log.entries;

    expect(entry.response.content.text).not.toBe('{"a":1,"b":[2,3]}');
    expect(JSON.parse(entry.response.content.text ?? "")).toEqual({ a: 1, b: [2, 3] });
    expect(entry.response.content.size).toBe(byteLengthOf(entry.response.content.text ?? ""));
  });

  it("measures body sizes in UTF-8 bytes and marks absent bodies unknown", () => {
    const [entry] = buildHarDocument([
      request({ responseBody: "é", requestBody: undefined })
    ]).log.entries;

    expect(entry.response.content.size).toBe(2);
    expect(entry.request.bodySize).toBe(-1);
  });

  it("carries the response content encoding through", () => {
    const [entry] = buildHarDocument([
      request({ responseBody: "aGk=", responseContentEncoding: "base64" })
    ]).log.entries;

    expect(entry.response.content.encoding).toBe("base64");
  });

  it("fills redirectURL from a Location header and leaves it empty otherwise", () => {
    const redirect = buildHarDocument([
      request({
        status: 302,
        responseHeaders: [{ name: "location", value: "https://api.example.com/v2/users" }]
      })
    ]).log.entries[0];

    expect(redirect.response.redirectURL).toBe("https://api.example.com/v2/users");
    expect(buildHarDocument([request()]).log.entries[0].response.redirectURL).toBe("");
  });

  it("redacts sensitive headers on the export path", () => {
    const [entry] = buildHarDocument([
      request({ requestHeaders: [{ name: "Authorization", value: "Bearer secret-token" }] })
    ]).log.entries;

    expect(entry.request.headers[0].value).not.toContain("secret-token");
  });

  it("applies the strict profile when asked", () => {
    const [entry] = buildHarDocument(
      [request({ requestHeaders: [{ name: "X-Internal-Trace", value: "trace-42" }] })],
      { redactionProfile: "strict" }
    ).log.entries;

    expect(entry.request.headers[0].value).not.toContain("trace-42");
  });

  it("produces an empty log for an empty capture", () => {
    expect(buildHarDocument([]).log.entries).toEqual([]);
  });

  it("does not mutate the requests it was given", () => {
    const original = request({ requestHeaders: [{ name: "Authorization", value: "Bearer secret-token" }] });
    const snapshot = JSON.parse(JSON.stringify(original));

    buildHarDocument([original]);

    expect(original).toEqual(snapshot);
  });
});

describe("HAR round trip", () => {
  it("re-imports through parseHarLog into equivalent endpoints", () => {
    const captured = [
      request({
        id: "a",
        method: "POST",
        url: "https://api.example.com/users?team=core",
        path: "/users",
        pathTemplate: "/users",
        query: [{ name: "team", value: "core" }],
        requestBody: '{"name":"Ada"}',
        requestHeaders: [{ name: "Content-Type", value: "application/json" }],
        status: 201,
        statusText: "Created",
        durationMs: 90
      }),
      request({
        id: "b",
        url: "https://api.example.com/users/42",
        path: "/users/42",
        pathTemplate: "/users/{id}",
        durationMs: 30
      })
    ];

    const reimported = parseHarLog(buildHarDocument(captured));

    expect(reimported).toHaveLength(2);
    expect(reimported.map((entry) => `${entry.method} ${entry.pathTemplate}`).sort()).toEqual([
      "GET /users/{id}",
      "POST /users"
    ]);

    const created = reimported.find((entry) => entry.method === "POST");
    expect(created).toMatchObject({
      status: 201,
      statusText: "Created",
      origin: "https://api.example.com",
      durationMs: 90
    });
    expect(JSON.parse(created?.requestBody ?? "")).toEqual({ name: "Ada" });
    expect(created?.query).toEqual([{ name: "team", value: "core" }]);
  });

  it("keeps endpoint grouping stable across a round trip", () => {
    const captured = [
      request({ id: "a", url: "https://api.example.com/users/1", path: "/users/1", pathTemplate: "/users/{id}" }),
      request({ id: "b", url: "https://api.example.com/users/2", path: "/users/2", pathTemplate: "/users/{id}" })
    ];

    const before = groupRequests(captured);
    const after = groupRequests(parseHarLog(buildHarDocument(captured)));

    expect(after).toHaveLength(before.length);
    expect(after[0].id).toBe(before[0].id);
    expect(after[0].count).toBe(before[0].count);
  });

  it("survives a JSON serialize/parse cycle, the way a downloaded file would", () => {
    const captured = [request({ id: "a" })];
    const reimported = parseHarLog(JSON.parse(buildHarJson(captured)));

    expect(reimported).toHaveLength(1);
    expect(reimported[0].url).toBe("https://api.example.com/users");
  });
});

describe("buildHarJson", () => {
  it("pretty-prints the document", () => {
    const json = buildHarJson([request()]);

    expect(json).toContain('\n  "log"');
    expect(JSON.parse(json).log.entries).toHaveLength(1);
  });
});
