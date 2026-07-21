# Privacy

API Cartographer is local-first: it does not make any network requests
of its own, and it does not send captured traffic anywhere. Everything
described below happens inside your browser.

## What is captured

While the DevTools panel is open and capture is not paused, the
extension reads network request/response metadata and bodies via
`chrome.devtools.network.onRequestFinished` for the inspected page.
Nothing is captured when the panel is closed.

## Where it is stored

Captured requests, saved sessions, and endpoint pin/ignore preferences
are stored only in `chrome.storage.local`, scoped to your local Chrome
profile. None of it is synced, uploaded, or shared with any server —
including ours, since there isn't one.

Storage is bounded: at most the most recent 500 requests are kept
(across live capture, HAR import, and project data import), and at
most 20 saved sessions.

## Redaction defaults

Before request/response samples are shown in the panel, or exported as
OpenAPI/Markdown, `src/lib/redaction.ts` redacts:

- Header values whose name matches a sensitive pattern (`authorization`,
  `cookie`, `proxy-authorization`, `set-cookie`, `x-api-key`, `api-key`,
  `x-auth-token`, `x-csrf-token`, `x-xsrf-token`, or any name containing
  `auth`, `token`, `secret`, `password`, `session`, `csrf`/`xsrf`, or
  `api key/key`).
- `Bearer`/`Basic` credential values found anywhere in header or body
  text.
- `token`/`api-key`/`key`/`secret`/`session`/`password` query string
  values.
- The same field-name and value patterns applied recursively through
  JSON request/response bodies.

Redaction is heuristic (name and pattern matching), not a guarantee —
review exports before sharing them outside your own machine, especially
for APIs using non-standard auth header or field names.

## What is *not* redacted

Two things intentionally keep the raw, unredacted data, because they
exist for your own backup/restore rather than for sharing:

- **Data at rest in `chrome.storage.local`** (the live capture buffer
  and saved sessions) — redaction is applied at render/export time, not
  at capture time.
- **Project Data export** (`api-cartographer-project.json`, see
  `src/lib/project-data.ts`) — a full backup of requests, sessions, and
  preferences, meant to be re-imported into your own browser. Treat
  exported project data files as sensitive, the same way you would a
  HAR file.

## Importing files

HAR files and Project Data files are parsed entirely client-side
(`file.text()` + `JSON.parse`) when you choose them in the panel —
they are never uploaded anywhere by the extension.
