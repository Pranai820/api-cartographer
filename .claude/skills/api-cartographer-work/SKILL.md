---
name: api-cartographer-work
description: Use when the user asks to do "today's work", "today's commits", "daily commits", or otherwise advance the API Cartographer Chrome DevTools extension project in this repo (C:\Users\dpran\Desktop\api-cartographer). Reads the roadmap/backlog, implements a small batch of real features with tests, verifies, logs progress, and pushes.
---

# API Cartographer Work

Advances `C:\Users\dpran\Desktop\api-cartographer`, a Manifest V3 DevTools extension (React + TypeScript, Vite, Vitest, `chrome.storage.local`).

## Standing authorization

On 2026-07-13 the repo owner asked for this skill to be created and said: "from today I will ask you to do commits every day" — i.e., recurring requests to run this skill imply push authorization for **this repo only**, so the push step below does not need a fresh confirmation each time. This does not extend to any other repo or to force-pushes. If the instruction is ever revoked or this stops feeling current, ask before pushing again.

## Workflow

1. **Orient**: run `git status --short`, and read `ROADMAP.md`, `BACKLOG.md`, `DAILY_LOG.md`, `ARCHITECTURE.md`.
2. **Handle existing work first**: if there are uncommitted changes or untracked files already in the tree, figure out what feature/fix they belong to and finish + commit that before starting anything new. Don't discard user or prior-session work.
3. **Pick real tasks**: choose 1-3 items from `BACKLOG.md`'s `Ready` section (fall back to the current `ROADMAP.md` week if backlog is empty). Don't invent busywork — every commit should correspond to a real backlog/roadmap line or a genuine bugfix found while working.
4. **Implement in small, reviewable commits** — typically 2-4 for a session, each one coherent: one feature slice, one test slice, or one docs/log slice. Follow existing patterns (e.g. `src/lib/endpoint-preferences.ts` and `src/lib/sessions.ts` are good templates for a new `src/lib/*.ts` domain module: pure functions, a normalizer, unit tests in `tests/*.test.ts`).
5. **Update tracking docs** in the same or a final commit:
   - Move finished items from `BACKLOG.md`'s `Ready` to `Done` (rewrite as past tense, e.g. "Add X" -> "Added X").
   - Append a dated entry to `DAILY_LOG.md` (today's date, bullet list of what shipped, checks run).
6. **Verify before the final commit**:
   ```
   npm run build
   npm test
   npm audit --audit-level=moderate
   ```
   If a check fails or can't run, stop and report why rather than committing broken work or silently skipping it.
7. **Commit messages**: `feat: ...`, `test: ...`, `fix: ...`, `docs: log <date> progress`, `chore: ...` — matching the existing history's style.
8. **Push**: `git push` once the working tree is clean and checks pass (see Standing authorization above). If push fails (auth, diverged history), stop and report the exact error — never force-push.

## Engineering rules

- Preserve unrelated user changes — never `git reset`/`checkout -- .`/`clean -f` to "clean up" without checking what would be lost first.
- Don't commit secrets, `.env` files, `node_modules/`, or `dist/` (already gitignored — verify with `git status` if anything looks off).
- Keep the extension buildable from source; commit `package-lock.json` when it changes.
- Prefer TypeScript domain modules with unit tests for request modeling, redaction, schema inference, exports, and session logic — mirror the existing `src/lib/` structure.
- Don't fabricate a commit count or claim a push succeeded without seeing it happen.
