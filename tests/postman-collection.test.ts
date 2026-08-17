import { describe, expect, it } from "vitest";
import {
  buildPostmanCollection,
  POSTMAN_SCHEMA_URL,
  type PostmanFolder,
  type PostmanRequestItem
} from "../src/lib/postman-collection";
import type { CapturedRequest, EndpointGroup } from "../src/lib/types";

function sampleRequest(overrides: Partial<CapturedRequest> = {}): CapturedRequest {
  return {
    id: "sample",
    url: "https://api.example.com/users/42",
    origin: "https://api.example.com",
    path: "/users/42",
    pathTemplate: "/users/{id}",
    method: "GET",
    status: 200,
    startedDateTime: "2026-08-17T00:00:00.000Z",
    requestHeaders: [],
    responseHeaders: [],
    query: [],
    ...overrides
  };
}

function baseGroup(overrides: Partial<EndpointGroup> = {}): EndpointGroup {
  return {
    id: "GET https://api.example.com/users/{id}",
    origin: "https://api.example.com",
    method: "GET",
    pathTemplate: "/users/{id}",
    count: 1,
    lastSeen: "2026-08-17T00:00:00.000Z",
    statusCounts: { "200": 1 },
    samples: [sampleRequest()],
    ...overrides
  };
}

function requestItems(item: unknown): PostmanRequestItem[] {
  return item as PostmanRequestItem[];
}

describe("postman collection export", () => {
  it("builds a v2.1 collection with one item per endpoint group", () => {
    const collection = buildPostmanCollection([baseGroup()], "Demo API");

    expect(collection.info.schema).toBe(POSTMAN_SCHEMA_URL);
    expect(collection.info.name).toBe("Demo API");
    expect(collection.variable).toEqual([
      { key: "baseUrl", value: "https://api.example.com", type: "string" }
    ]);

    const [item] = requestItems(collection.item);
    expect(item.name).toBe("GET /users/{id}");
    expect(item.request.method).toBe("GET");
    expect(item.request.url.raw).toBe("{{baseUrl}}/users/:id");
    expect(item.request.url.host).toEqual(["{{baseUrl}}"]);
    expect(item.request.url.path).toEqual(["users", ":id"]);
  });

  it("converts path placeholders into path variables seeded from the sample path", () => {
    const collection = buildPostmanCollection([baseGroup()]);
    const [item] = requestItems(collection.item);

    expect(item.request.url.variable).toEqual([{ key: "id", value: "42", type: "string" }]);
  });

  it("gives repeated placeholder names unique path variable keys", () => {
    const group = baseGroup({
      pathTemplate: "/users/{id}/posts/{id}",
      samples: [sampleRequest({ path: "/users/42/posts/7", pathTemplate: "/users/{id}/posts/{id}" })]
    });

    const [item] = requestItems(buildPostmanCollection([group]).item);

    expect(item.request.url.path).toEqual(["users", ":id", "posts", ":id2"]);
    expect(item.request.url.variable).toEqual([
      { key: "id", value: "42", type: "string" },
      { key: "id2", value: "7", type: "string" }
    ]);
  });

  it("leaves path variable values empty when the sample path does not line up with the template", () => {
    const group = baseGroup({ samples: [sampleRequest({ path: "/v2/users/42" })] });

    const [item] = requestItems(buildPostmanCollection([group]).item);

    expect(item.request.url.variable).toEqual([{ key: "id", value: "", type: "string" }]);
  });

  it("collects query parameters across samples, keeping the first observed value", () => {
    const group = baseGroup({
      pathTemplate: "/search",
      samples: [
        sampleRequest({ pathTemplate: "/search", path: "/search", query: [{ name: "q", value: "cats" }] }),
        sampleRequest({
          pathTemplate: "/search",
          path: "/search",
          query: [
            { name: "q", value: "dogs" },
            { name: "page", value: "2" }
          ]
        })
      ]
    });

    const [item] = requestItems(buildPostmanCollection([group]).item);

    expect(item.request.url.query).toEqual([
      { key: "q", value: "cats" },
      { key: "page", value: "2" }
    ]);
    expect(item.request.url.raw).toBe("{{baseUrl}}/search?q=cats&page=2");
  });

  it("includes a pretty-printed JSON body for write methods", () => {
    const group = baseGroup({
      method: "POST",
      pathTemplate: "/users",
      samples: [
        sampleRequest({
          method: "POST",
          pathTemplate: "/users",
          path: "/users",
          requestBody: '{"name":"Ada","active":true}'
        })
      ]
    });

    const [item] = requestItems(buildPostmanCollection([group]).item);

    expect(item.request.body).toEqual({
      mode: "raw",
      raw: '{\n  "name": "Ada",\n  "active": true\n}',
      options: { raw: { language: "json" } }
    });
  });

  it("keeps a non-JSON request body verbatim and marks it as text", () => {
    const group = baseGroup({
      method: "POST",
      pathTemplate: "/form",
      samples: [
        sampleRequest({ method: "POST", pathTemplate: "/form", path: "/form", requestBody: "name=Ada&active=1" })
      ]
    });

    const [item] = requestItems(buildPostmanCollection([group]).item);

    expect(item.request.body).toEqual({
      mode: "raw",
      raw: "name=Ada&active=1",
      options: { raw: { language: "text" } }
    });
  });

  it("omits a body for methods that do not carry one", () => {
    const group = baseGroup({ samples: [sampleRequest({ requestBody: '{"ignored":true}' })] });

    const [item] = requestItems(buildPostmanCollection([group]).item);

    expect(item.request.body).toBeUndefined();
  });

  it("drops transport headers Postman sets itself", () => {
    const group = baseGroup({
      samples: [
        sampleRequest({
          requestHeaders: [
            { name: "Host", value: "api.example.com" },
            { name: "Content-Length", value: "42" },
            { name: "accept", value: "application/json" }
          ]
        })
      ]
    });

    const [item] = requestItems(buildPostmanCollection([group]).item);

    expect(item.request.header).toEqual([{ name: "accept", value: "application/json" }]);
  });

  it("saves the first sample with a response body as a Postman example", () => {
    const group = baseGroup({
      statusCounts: { "200": 2 },
      count: 2,
      samples: [
        sampleRequest(),
        sampleRequest({
          statusText: "OK",
          responseBody: '{"id":42}',
          responseHeaders: [{ name: "content-type", value: "application/json" }]
        })
      ]
    });

    const [item] = requestItems(buildPostmanCollection([group]).item);

    expect(item.response).toHaveLength(1);
    expect(item.response[0]).toMatchObject({
      name: "200 OK",
      code: 200,
      status: "OK",
      body: '{"id":42}',
      header: [{ name: "content-type", value: "application/json" }],
      _postman_previewlanguage: "json"
    });
    expect(item.response[0].originalRequest).toEqual(item.request);
  });

  it("emits no examples when no sample captured a response body", () => {
    const [item] = requestItems(buildPostmanCollection([baseGroup()]).item);

    expect(item.response).toEqual([]);
  });

  it("groups multiple origins into folders with one base URL variable each", () => {
    const groups = [
      baseGroup(),
      baseGroup({
        id: "GET https://cdn.example.org/assets/{hash}",
        origin: "https://cdn.example.org",
        pathTemplate: "/assets/{hash}",
        samples: [
          sampleRequest({
            origin: "https://cdn.example.org",
            path: "/assets/deadbeefdeadbeef",
            pathTemplate: "/assets/{hash}"
          })
        ]
      })
    ];

    const collection = buildPostmanCollection(groups);

    expect(collection.variable).toEqual([
      { key: "baseUrl_api_example_com", value: "https://api.example.com", type: "string" },
      { key: "baseUrl_cdn_example_org", value: "https://cdn.example.org", type: "string" }
    ]);

    const folders = collection.item as PostmanFolder[];
    expect(folders.map((folder) => folder.name)).toEqual(["https://api.example.com", "https://cdn.example.org"]);
    expect(folders[0].item[0].request.url.raw).toBe("{{baseUrl_api_example_com}}/users/:id");
    expect(folders[1].item[0].request.url.raw).toBe("{{baseUrl_cdn_example_org}}/assets/:hash");
  });

  it("disambiguates base URL variables for origins that share a host", () => {
    const collection = buildPostmanCollection([
      baseGroup({ id: "GET http://api.example.com/users/{id}", origin: "http://api.example.com" }),
      baseGroup()
    ]);

    expect(collection.variable.map((variable) => variable.key)).toEqual([
      "baseUrl_api_example_com",
      "baseUrl_api_example_com_2"
    ]);
  });

  it("returns an empty but valid collection when there are no groups", () => {
    const collection = buildPostmanCollection([]);

    expect(collection.variable).toEqual([]);
    expect(collection.item).toEqual([]);
    expect(collection.info.schema).toBe(POSTMAN_SCHEMA_URL);
  });

  it("describes each endpoint with its observed capture stats", () => {
    const group = baseGroup({ count: 3, statusCounts: { "200": 2, "404": 1 }, averageDurationMs: 120 });

    const [item] = requestItems(buildPostmanCollection([group]).item);

    expect(item.request.description).toContain("Observed 3 requests from https://api.example.com.");
    expect(item.request.description).toContain("200 x2, 404 x1");
    expect(item.request.description).toContain("120 ms");
  });
});
