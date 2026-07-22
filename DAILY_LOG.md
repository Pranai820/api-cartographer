# Daily Log

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
