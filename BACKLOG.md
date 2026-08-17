# Backlog

## Ready

## Later

- Add optional AI endpoint summaries. Needs a decision first: this is the only
  backlog item that would make the extension talk to a remote service, which
  cuts against the local-first constraint in `ARCHITECTURE.md` and the "no
  network requests" promise in `PRIVACY.md`.

## Done

- Added Postman Collection v2.1 export from captured endpoint groups.
- Added a GitHub Pages demo site under `docs/`.
- Added framework, API style, and hosting platform detection from captured traffic.
- Added a session diff view comparing the current capture with a saved session.
- Added keyboard-accessible endpoint table navigation.
- Added per-endpoint notes that persist and round-trip through project data.
- Added SDK hint generation (cURL, JavaScript fetch, Python requests) from captured endpoints.
- Added sharing-safe (strict) redaction profiles alongside the existing standard profile.
- Added integration tests around build output.
- Tightened empty, loading, and capture-limit UI states.
- Added capture status helpers and unified the 500-request cap.
- Added privacy documentation and store-ready manifest metadata.
- Added project data export/import (requests, sessions, preferences).
- Added a Playwright extension smoke test.
- Added extension icon assets.
- Added endpoint detail tabs for samples, schema, and export preview.
- Added release packaging script.
- Added HAR file import.
- Added OpenAPI title and version controls.
- Added named capture sessions with save, restore, and delete.
- Added sensitive header redaction before rendering and exporting.
- Added endpoint ignore and pin controls.
- Added multi-sample schema merging for OpenAPI request and response bodies.
- Added Markdown report export.
- Added status/method/content-type filter presets.
- Initialized Manifest V3 DevTools extension skeleton.
- Added request grouping and OpenAPI export baseline.
- Added first unit tests for request modeling and export.
