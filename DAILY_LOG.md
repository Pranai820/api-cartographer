# Daily Log

## 2026-08-21

- Backlog `Ready` was empty, Roadmap Weeks 1-4 are complete, and the only `Later` item (AI endpoint summaries) is still blocked on the local-first product decision. Last session's follow-up note about a sample-count threshold for p95 turned out to be already covered (`slowestEndpoints` takes `minimumSamples = 2`), so picked a real gap instead: `framework-detection.ts` has detected GraphQL since 2026-08-16, but every GraphQL request grouped into one row. `endpointKey` was method + origin + path template, and GraphQL puts an entire schema behind a single `POST /graphql` — so the panel showed one endpoint with every request in it, one pooled latency figure, and one merged schema. The extension was effectively blind to GraphQL APIs.
- Added `src/lib/graphql-operations.ts`: reads `{ query, operationName }` payloads from POST/PUT/PATCH bodies and GET `?query=`, and resolves an operation type and name. Detection keys off payload shape rather than path, since GraphQL is not always served from `/graphql`. To stop that over-matching, a document must contain a selection set and start either with one or with an operation/fragment keyword — which rejects a REST search endpoint posting `{"query": "running shoes"}` (there is a test for exactly that).
- Anonymous operations are named after their first root field, reporting the resolved field rather than its alias (`{ latest: orders { id } }` reads as `orders`). Batched payloads stay one captured request and are labelled by size rather than by name: batch members differ between requests, so naming a batch after its first member would misreport the rest. The tradeoff is that `batch of 2` and `batch of 3` group separately; worth revisiting if batching turns out to be common in practice.
- Variables are never read. Operation labels are rendered in the panel and written into exports, and variables routinely carry credentials, so the parser takes only type and name from the document. A test pins that a password and an email in `variables` reach neither. `PRIVACY.md` now documents this.
- Wired the operation into `endpointKey`, which is the single identity function behind grouping, endpoint metrics, and session diffing — so all three became operation-aware at once: latency and error rates are per-operation, and a session diff now reports which operations appeared or disappeared. Operations are parsed once at capture time and stored on the request, the same way `pathTemplate` already is; captures stored before today simply have no operation and group exactly as before, and `normalizeCapturedRequests` filters whole objects rather than field lists, so the new field survives the project-data round trip without a format bump.
- Found a real bug this would have made routine: `buildOpenApiDocument` assigned `paths[pathTemplate][method]` once per group, so any two groups sharing a path and method silently overwrote each other. Not GraphQL-specific and not new — the same path served by two origins already collided. Confirmed by stashing the fix and watching the new test report `observedCount: 1` for `/users` across two origins holding 3 and 1 requests, then 4 with the fix in. Colliding groups are now combined first (counts and status counts sum, samples concatenate so schema inference sees all of them, duration average weighted by count and documented as approximate, since a group does not retain how many of its requests were timed). The extension block gained `origins` for multi-origin paths and `graphqlOperations` listing what was observed there — OpenAPI cannot model GraphQL operations, so they are recorded rather than invented as separate paths.
- Panel: operation renders under the path inside the existing path cell, so the four-column row grid and every REST row are untouched. A screenshot of the seeded capture caught something the tests did not — Endpoint Health rendered `pathTemplate` alone, so per-operation metrics all read as an identical `POST /graphql`; `EndpointMetrics` now carries the operation and the list names it. Endpoint search matches the operation label too, since a GraphQL operation has no distinguishing path to search for.
- Postman request names and Markdown report rows are qualified by operation as well; without that, every GraphQL entry rendered as an identical `/graphql` line in both.
- Verified in real headless Chromium against a seeded six-request capture: four `/graphql` rows where one rendered before, two calls of `query Users` collapsed into one row with count 2, a batched request reading "batch of 2", a request stored without an operation still rendering as a plain `/graphql` row, the REST endpoint unchanged, Endpoint Health listing "query Users" and "mutation CreateUser", searching "createuser" leaving exactly one row, and no console errors. Note what that check does and does not cover: it seeds fully-formed captured requests, so it exercises grouping, metrics, and rendering, but not the parse step, which is covered by unit tests instead.
- Updated `README.md`, `ARCHITECTURE.md`, `PRIVACY.md`, the `docs/` demo site, and `BACKLOG.md`.
- Checks run: `npm run build`, `npm test`, `npm audit --audit-level=moderate`, `npm run smoke`.

## 2026-08-20

- Backlog `Ready` was empty, Roadmap Weeks 1-4 are complete, and the only `Later` item (AI endpoint summaries) is still blocked on the local-first product decision, so picked two real gaps: the panel could import a HAR but never produce one, and `durationMs` was captured on every request but only ever reduced to a per-group mean.
- Added `src/lib/endpoint-metrics.ts`: per-endpoint p50/p90/p95 latency and 4xx/5xx error rates, plus a capture-wide summary. Both are computed from the raw `CapturedRequest[]`, not from `EndpointGroup.samples`, which is capped at three per endpoint — deriving percentiles from groups would silently report the p95 of a three-request window. The capture summary pools every timed request rather than averaging the per-endpoint averages, so one rarely-hit slow endpoint cannot dominate it (test asserts the difference: 257.5ms actual vs 505ms for an average of averages).
- Percentiles use nearest rank, so every number shown is a latency that was actually observed rather than an interpolated one. `slowestEndpoints` requires two timing samples by default — a single slow request is noise, not a slow endpoint.
- Added `src/lib/har-export.ts`, the inverse of `parseHarLog`. Emits HAR 1.2: entries oldest-first, `postData` only when a request body exists, sizes as UTF-8 byte counts with `-1` for unknown, `redirectURL` from the Location header, and the captured total attributed to `timings.wait` with the unmeasured phases at `-1` so the phases stay consistent with `time`. Requests are redacted on the way out like every other export path.
- Round-trip tests re-import the generated HAR through `parseHarLog` and assert endpoints and grouping survive. Bodies are compared as JSON values rather than bytes: `redactBodyText` parses and re-stringifies JSON pretty-printed on every export path, so the value round-trips but the exact bytes do not. Added a test pinning that behavior so it reads as intentional.
- Wired both into the panel: Copy/Download HAR in the export block, and an "Endpoint Health" sidebar block with capture p95 and error rate plus the top three endpoints by p95 and by error rate. Both are fed by a new `filteredRequests` memo (the raw requests behind the visible endpoints) rather than by the groups — exporting from groups would have written only three samples per endpoint into the HAR.
- Verified in real headless Chromium against a seeded 18-request capture rather than trusting the unit tests: an 1800ms outlier sitting outside the 3-sample window does reach p95, `/orders` reports 67% errors (2 of 3), the downloaded file is named `api-cartographer.har` and contains all 18 requests with `authorization` redacted, `timings.wait` matches `time` on every entry, and the panel logs no console errors.
- Worth knowing about the p95 ranking: with few samples nearest-rank p95 equals the max, so a single outlier can put an otherwise-fast endpoint at the top of "Slowest by p95" (it did for `/users` in the seeded capture). That is the honest number, and the tooltip shows p50/p95/max plus the sample count, but a future session may want a sample-count threshold before an endpoint is called slow.
- Updated `README.md`, `PRIVACY.md` (HAR export is redacted, unlike a HAR saved straight from Chrome's Network panel), `ARCHITECTURE.md` core modules, the `docs/` demo site, and `BACKLOG.md`.
- Checks run: `npm run build`, `npm test` (145 passing), `npm audit --audit-level=moderate` (0 vulnerabilities), `npm run smoke`.

## 2026-08-17

- Backlog `Ready` was empty, Roadmap Weeks 1-4 are all complete, and the only `Later` item (AI endpoint summaries) is still blocked on the local-first product decision, so picked a real gap instead: the panel could export OpenAPI and Markdown, but nothing that gets captured traffic into a request client.
- Added `src/lib/postman-collection.ts`: builds a Postman Collection v2.1 document from grouped captures. Origins become `{{baseUrl}}` variables (single origin keeps the conventional `baseUrl`; multi-origin captures get one host-named variable and one folder per origin, with a numeric suffix when two origins share a host). `{id}`/`{uuid}`/`{hash}` placeholders become Postman `:id` path variables seeded with the value actually observed in a sample, so a request is runnable straight after import; repeated placeholder names get unique keys (`id`, `id2`) because Postman keys path variables by name. Query params are unioned across samples keeping the first observed value, JSON request bodies are pretty-printed (non-JSON bodies pass through as `text`), and the first sample with a response body is saved as a Postman example.
- Wired Copy/Download Postman actions into the panel's export block, fed by the same redacted, filtered groups as the OpenAPI and Markdown exports and named from the API title field. Also extracted the blob-download dance the panel had repeated four times into one `downloadTextFile` helper.
- Found a real bug by inspecting an actual downloaded collection rather than trusting the unit tests: headers were emitted as `{name, value}`, copied straight from `HeaderEntry`, but Postman's v2.1 schema keys headers by `key` — every header would have imported empty. Fixed with a `PostmanHeader` type and a regression test covering both request and response headers.
- Verified end-to-end in real headless Chromium: seeded `chrome.storage.local` with a multi-origin capture, loaded the built extension, clicked Download Postman, and parsed the downloaded file — correct filename (`api-cartographer.postman_collection.json`), two base URL variables, two origin folders, `authorization` arriving as `[REDACTED]` (redaction is applied on the export path), and no console errors.
- Updated `README.md`, `PRIVACY.md` (the redaction section now names the Postman export path), and the `docs/` demo site feature card.
- Checks run: `npm run build`, `npm test` (101 passing), `npm audit --audit-level=moderate`, `npm run smoke`.

## 2026-08-16

- Roadmap Weeks 1-4 are all complete and backlog `Ready` was empty, so pulled two of the three `Later` items.
- Added `src/lib/framework-detection.ts`: a rule table matching response headers, cookie names, and path shapes to backend frameworks (Express, Next.js, ASP.NET, PHP/Laravel, Django, Flask, FastAPI, Gunicorn, Rails, Java/Spring, WordPress), API styles (GraphQL, JSON:API, OData), and platforms (Vercel, Cloudflare, AWS API Gateway, Netlify, Supabase, Hasura, Shopify). Each detection carries deduped, truncated evidence, so a chip can be traced to the header that produced it.
- Two bugs caught by the tests while writing them: evidence reported the lowercase lookup name instead of the header name as sent (now reads the matched header entry), and the Rails cookie pattern `/_session$/` also matched `laravel_session` (now requires Rails' leading-underscore convention, with a regression test).
- Cookie rules deliberately use cookie *names* only, never values — detections are rendered in the panel, and cookie values are session material. Added a test asserting no cookie value reaches the output.
- Wired a "Detected Stack" sidebar block: chips shaded by confidence, evidence in the tooltip. Detection runs on unredacted captures so header/cookie signals survive, so results are display-only and deliberately not folded into OpenAPI or Markdown exports (under the strict redaction profile most of the evidence headers are masked anyway).
- Added `docs/`, a self-contained GitHub Pages site (plain HTML + inline CSS, no build step) with features, install-from-source steps, and a privacy summary. The panel visual is a CSS reconstruction, captioned as an illustration rather than a screenshot. README documents pointing Pages at `/docs`; Pages still has to be enabled in repo settings by hand.
- Verified the docs page in headless Chromium: no console errors, no failed requests, no horizontal overflow at 380px or desktop width.
- Left "Add optional AI endpoint summaries" in `Later` with a note: it is the only item that would make the extension talk to a remote service, which contradicts the local-first constraint in `ARCHITECTURE.md` and the no-network-requests promise in `PRIVACY.md`. That needs a product decision (and a privacy doc update) before it gets built.
- Checks run: `npm run build`, `npm test` (85 passing), `npm audit --audit-level=moderate`, `npm run smoke`.

## 2026-08-15

- Backlog `Ready` was empty, so pulled the three `ROADMAP.md` Week 3 lines that had never shipped: session diff, keyboard table navigation, and endpoint notes. Week 3 is now complete, which means Weeks 1-4 are all done.
- Added `src/lib/session-diff.ts`: compares two grouped captures endpoint-by-endpoint and classifies each as added/removed/changed/unchanged, with request-count and status-code deltas for endpoints present in both. Wired it into the panel as a "Compare current capture with" session picker; choosing a baseline swaps the endpoint list for a diff view (unchanged endpoints are summarized rather than listed).
- Added `src/lib/table-navigation.ts`: resolves the next row for Arrow/Page/Home/End keys, clamping at both ends rather than wrapping, and starting from the top when nothing is selected. Wired into the endpoint list with a roving tab index (only the selected row is tabbable), so the list is entered once with Tab and traversed with the keyboard; added a `:focus-visible` outline for the rows.
- Added per-endpoint notes to `EndpointPreferences` (trimmed, capped at 2000 chars, empty notes dropped). Because storage and project-data both route through `normalizeEndpointPreferences`, notes persist and round-trip through export/import for free. Fixed a bug this exposed: `togglePinned`/`toggleIgnored` rebuilt the preferences object from scratch, so any new field — notes included — would have been wiped on every pin/ignore toggle; they now spread existing state forward.
- Skipped `role="listbox"`/`role="option"` for the endpoint list: rows also contain pin/ignore buttons, which are not valid inside a listbox. Used a labeled `role="group"` with `aria-current` on the selected row instead.
- Updated `BACKLOG.md`: added the three shipped items to `Done`.
- Checks run: `npm run build`, `npm test` (74 passing), `npm audit --audit-level=moderate`, `npm run smoke`.

## 2026-08-13

- Added sharing-safe redaction: `src/lib/redaction.ts` now takes an optional `RedactionProfile` (`"standard"` | `"strict"`, defaulting to `"standard"` so existing call sites and behavior are unchanged). `strict` redacts every header outside a small safe allowlist (content-type, accept, host, user-agent, etc.), redacts every query value regardless of name, and scrubs embedded emails/IPv4 addresses from remaining body text. Wired a "Redaction" dropdown into the DevTools panel's OpenAPI export block so OpenAPI/Markdown export output can be switched to the sharing-safe profile before copying or downloading.
- Added `src/lib/sdk-hints.ts`: generates ready-to-paste cURL, JavaScript (`fetch`), and Python (`requests`) snippets for a captured endpoint, built from its method, path template, origin, first sample's query string, notable request headers (transport noise like `Host`/`Content-Length` dropped), and JSON body (translated to `True`/`False`/`None` for the Python snippet). Added a new "SDK Hints" tab in the endpoint detail view, alongside Samples/Schema/Export Preview.
- `npm audit --audit-level=moderate` initially flagged 2 high-severity transitive dev-dependency advisories (`nanoid`, `postcss`) unrelated to today's changes (package.json/lock were untouched by this session); ran `npm audit fix`, which resolved both cleanly to 0 vulnerabilities without touching build/test output.
- Updated `BACKLOG.md`: moved "Add SDK hint generation from OpenAPI paths" and "Add sharing-safe redaction profiles" from `Later` to `Done`.
- Checks run: `npm run build`, `npm test` (58 passing), `npm audit --audit-level=moderate` (0 vulnerabilities after fix), `npm run smoke`.

## 2026-07-22

- Added `src/lib/capture-status.ts` (`isAtCaptureLimit`, `resolveEmptyStateReason`) and replaced the hardcoded `500` request-cap literal across `storage.ts`, `sessions.ts`, `project-data.ts`, and `App.tsx` with one shared `CAPTURED_REQUEST_LIMIT` constant.
- Tightened UI states: a loading state while `chrome.storage.local` hydrates instead of flashing empty; the empty state now distinguishes "nothing captured yet" from "filters hid every endpoint" (with a working Clear Filters action, verified visually via Playwright screenshots and a scripted click-through); and a capture-limit banner once storage hits 500 requests.
- Added `tests/build-output.test.ts`: runs a real `npm run build` and checks `dist/` has the required entry points and that `manifest.json`/HTML only reference files that exist. Caught and fixed a real bug in the process — running the build from inside vitest inherited `NODE_ENV=test`, silently producing a bloated dev-mode bundle (`jsx-dev-runtime`, ~2.3x larger) in `dist/`; fixed by forcing `NODE_ENV=production` for the nested build.
- `ROADMAP.md` Week 4 (Polish and Release Prep) is now fully complete. Backlog `Ready` is empty again; there's no Week 5 yet, so next session should either pull from `BACKLOG.md`'s `Later` section or get new roadmap direction.
- Checks run: `npm run build`, `npm test`, `npm audit --audit-level=moderate`, `npm run smoke`.

## 2026-07-21

- Added project data export/import: a new `src/lib/project-data.ts` bundles captured requests, saved sessions, and endpoint preferences into one versioned JSON snapshot, with a matching Export/Import Project Data control in the panel sidebar (import replaces current state; malformed entries are dropped rather than throwing).
- Added `PRIVACY.md` documenting local-only storage (no network requests anywhere in `src/`), the exact redaction defaults from `src/lib/redaction.ts`, and which paths (storage at rest, Project Data export) intentionally keep unredacted data for personal backup. Linked it from `README.md`.
- Added `short_name` and `homepage_url` to `manifest.json` for store listing readiness.
- Backlog `Ready` was empty, so pulled from `ROADMAP.md` Week 4; the two items not yet covered by this session (build-output integration tests, empty/loading/large-capture UI states) are now in `Ready` for next time.
- Checks run: `npm run build`, `npm test`, `npm audit --audit-level=moderate`, `npm run smoke`.

## 2026-07-20

- Added extension icon assets: a 16/32/48/128px network-graph mark in brand teal, rendered by a new dependency-free PNG encoder (`scripts/png.mjs`, `scripts/generate-icons.mjs`) and wired into `manifest.json` icons/action.default_icon.
- Added a Playwright extension smoke test (`npm run smoke`): builds `dist/`, loads it into headless Chromium via `--load-extension`, and asserts the popup and DevTools panel render expected content with no console errors. Confirmed it catches real regressions by temporarily breaking the panel heading and watching the test fail, then pass again after reverting.
- Cleared the `Ready` backlog section; both remaining items are done.
- Checks run: `npm run build`, `npm test`, `npm audit --audit-level=moderate`, `npm run smoke`.

## 2026-07-19

- Added endpoint detail tabs (Samples, Schema, Export Preview) to the DevTools panel, backed by a new `src/lib/endpoint-detail.ts` module that derives per-endpoint request/response JSON schemas and the OpenAPI operation from `buildOpenApiDocument`.
- Added a release packaging script (`npm run package`): builds the extension and zips `dist/` into `release/api-cartographer-v<version>.zip` using a small dependency-free ZIP writer (`scripts/zip.mjs`), verified against a real `unzip` tool and covered by round-trip tests.
- Updated backlog status for completed work.
- Checks run: `npm run build`, `npm test`, `npm audit --audit-level=moderate`.

## 2026-07-14

- Added OpenAPI title and version controls to the export panel.
- Added HAR file import (parses a HAR log's entries into captured requests, merged with live capture).
- Updated backlog status for completed work.
- Checks run: `npm run build`, `npm test`, `npm audit --audit-level=moderate`.

## 2026-07-13

- Added sensitive header redaction before rendering and exporting captured requests.
- Added endpoint pin and ignore controls to the DevTools panel.
- Added named capture sessions (save, restore, delete) with `chrome.storage.local` persistence.
- Updated backlog status for completed work.
- Checks run: `npm run build`, `npm test`, `npm audit --audit-level=moderate`.

## 2026-07-12

- Used `api-cartographer-work` selector: 4 commits for the day.
- Added multi-sample OpenAPI schema merging for response samples and request bodies.
- Added Markdown API report generation with copy/download actions in the DevTools panel.
- Added method, status, origin, text, and content-type endpoint filter presets.
- Updated backlog status for completed work.
- Checks run: `npm test`, `npm run build`, `npm audit --audit-level=moderate`.

## 2026-07-11

- Created the initial API Cartographer project plan.
- Built the baseline Manifest V3 DevTools extension skeleton.
- Added request capture, endpoint grouping, OpenAPI export, and initial tests.
