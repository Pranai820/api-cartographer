# Daily Log

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
