# Architecture

## Extension Shape

API Cartographer is a Manifest V3 Chrome extension with three runtime surfaces:

- `devtools.html` and `src/devtools.ts` register the DevTools panel.
- `panel.html` and `src/panel/*` run the primary React app inside DevTools.
- `src/background.ts` owns lightweight extension lifecycle and popup status messages.

The panel listens to `chrome.devtools.network.onRequestFinished`, asks Chrome for response content through `getContent`, and stores a bounded request history in `chrome.storage.local`.

## Core Modules

- `src/lib/request-model.ts`: HAR-to-domain conversion, path normalization, endpoint grouping.
- `src/lib/openapi.ts`: OpenAPI 3.1 draft generation and JSON schema inference.
- `src/lib/storage.ts`: extension storage wrapper.
- `src/lib/format.ts`: UI formatting helpers.

## Data Flow

1. Chrome DevTools emits completed network request metadata.
2. The panel converts each entry into `CapturedRequest`.
3. Requests are grouped into `EndpointGroup` records for display.
4. The export layer converts visible groups into an OpenAPI document.

## Constraints

- Keep capture local-first; do not send traffic to remote services by default.
- Redact sensitive values before adding sharing or AI features.
- Keep each daily change shippable with build and tests passing.