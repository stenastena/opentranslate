# Progress

This file is the durable, cross-session checkpoint for OpenTranslate. Read it
first in any new session, then reconcile it against the actual state of
[Issues](https://github.com/stenastena/opentranslate/issues) and the
[project board](https://github.com/stenastena/opentranslate/projects) —
GitHub is the source of truth if the two ever disagree.

## Current milestone

**v0.1 (MVP)** — in progress.

GitHub setup for the whole roadmap (labels, milestones v0.1–1.0, project
board with Backlog/Todo/In Progress/In Review/Done columns, issue templates)
is complete. All v0.1 work is tracked as issues #1, #35–#56 (several are
parent issues with GitHub sub-issues). Backlog for v0.2–1.0 is tracked as
issues #8–#34.

## Last completed

- Issue #1 (+ sub-issues #2–#6): project scaffolding — package.json,
  TypeScript config, Vitest, electron-builder NSIS config, CI workflow,
  issue templates, CONTRIBUTING.md. Merged via PR #7, CI green.
- Issue #35: `TranslationProvider` interface + registry with per-provider
  try/catch isolation and last-success timestamp tracking. Merged via PR #57.
- Issues #36 (DeepL), #37 (Yandex), #38 (Google): the three MVP adapters
  against their unofficial endpoints, each with mocked-fetch unit tests.
  Merged via PRs #60, #59, #58 respectively. DeepL's request-id/timestamp/
  JSON-spacing anti-bot workaround and Yandex's synthetic session id are
  documented in the adapters' own top comments — re-derive from a fresh
  network capture if either provider starts rejecting requests.
  **Not yet verified against the live services** (the dev sandbox's egress IP
  is rate-limited/blocked by Google and DeepL) — first real check should be
  `npm run check-providers` once issue #39 lands, run from the actual
  Windows dev machine.

## Next planned step

Issue #39 — provider health-check script (`npm run check-providers`), then
issue #40 (settings persistence + IPC scaffolding).

## Known blockers / needs-decision

None currently open.

## How to resume

```bash
git checkout main && git pull
gh issue list --milestone v0.1 --state open
```

Pick the next open v0.1 issue (roughly in the order they're numbered —
providers → settings persistence/IPC → tray/hotkey/capture → popup UI →
settings UI → docs finalization), branch from `main`, implement, verify
locally (`npm run typecheck && npm test && npm run build`), open a PR that
closes the issue, wait for CI, merge, update this file.
