# Roadmap

## Week 1: Extension Foundation

- Build the Manifest V3 DevTools panel shell.
- Capture DevTools network requests and persist a bounded history.
- Normalize endpoint paths and group requests.
- Export a minimal OpenAPI 3.1 document.
- Add tests for path normalization, grouping, and export.
- Improve initial DevTools panel layout and popup status.

## Week 2: API Intelligence

- Add richer schema inference for nested arrays, nullable fields, enums, and mixed samples.
- Add request body schema inference across multiple samples.
- Detect likely auth headers and redact token-like values.
- Add endpoint tags from host/path heuristics.
- Add HAR import for offline analysis.
- Add OpenAPI export validation tests.

## Week 3: Workflow Features

- Add session management with named capture sessions.
- Add endpoint notes, ignored endpoints, and pinning.
- Add diff view between two capture sessions.
- Add Markdown API report export.
- Add filter presets for status code, method, origin, and content type.
- Add keyboard-accessible table navigation.

## Week 4: Polish and Release Prep

- Add import/export of project data.
- Add extension icons and store-ready metadata.
- Add privacy documentation and redaction defaults.
- Add integration tests around build output.
- Add release packaging script.
- Tighten UI states for empty, loading, and large captures.