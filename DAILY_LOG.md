# Daily Log

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
