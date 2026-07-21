# API Cartographer

API Cartographer is a Chrome DevTools extension that watches live network traffic and turns it into an API map with endpoint grouping, request samples, status patterns, and OpenAPI draft export.

## Current Scope

- Capture requests from the DevTools Network API while the custom panel is open.
- Group traffic by origin, method, and normalized path template.
- Inspect sample request headers and response bodies.
- Export visible endpoint groups as OpenAPI 3.1 JSON.
- Store the latest captured requests in `chrome.storage.local`.

## Development

```powershell
npm install
npm run build
npm test
```

Load the extension from `dist`:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose Load unpacked.
4. Select this repo's `dist` folder.
5. Open DevTools on any page and select the API Cartographer panel.

## Smoke Test

`npm run smoke` builds the extension, loads it into a real headless
Chromium via Playwright, and checks that the popup and DevTools panel
render without console errors. It downloads a browser binary the first
time:

```powershell
npx playwright install chromium
npm run smoke
```

## Privacy

API Cartographer is local-first and makes no network requests of its
own. See [PRIVACY.md](PRIVACY.md) for what's captured, where it's
stored, and the default redaction rules.

## Project Automation

Daily project work is driven by the `api-cartographer-work` Codex skill. Each run should pick 2-4 roadmap tasks, make meaningful commits, verify the touched surface, and push to GitHub.