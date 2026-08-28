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
  is rate-limited/blocked by Google and DeepL) — confirmed via `npm run
  check-providers` that the harness itself works (clean per-provider table,
  correct non-zero exit), but a real pass/fail read needs the actual Windows
  dev machine's IP.
- Issue #39: `npm run check-providers` health-check script. Merged via PR #61.
- Issue #40 (+ #41, #42): JSON-file settings store (not electron-store —
  needed to be constructible/testable outside Electron) and IPC scaffolding
  (contextBridge preload, ipcMain handlers, injectable IpcMain-like interface
  for testing). Merged via PR #62.
- Issue #43 (+ #44–#46): tray icon (placeholder generated PNG), global
  hotkey (default Ctrl+`), and clipboard text capture with guaranteed
  restore (try/finally). Merged via PR #63. Manually verified the packaged
  app launches with no crash; the full hotkey→capture flow itself wasn't
  exercised interactively.
- Issue #47 (+ #48–#51): popup translation window — Original/Translation/
  Back-translation, per-provider tabs, Auto-Detect with the classic
  QTranslate first/second-language heuristic, swap, auto-size, close on
  blur/Esc. Merged via PR #64 (note: main has one harmless empty extra
  commit from a transient GitHub API error during that merge — identical
  file tree, no action needed).
  **Manually verified against the real app**, not just unit tests: built
  and ran the packaged app, triggered the popup, dumped its live DOM. This
  caught two real runtime bugs unit tests/typecheck missed — both fixed
  before merging:
  - wrong relative path depth in `src/main/windows/popupWindow.ts` (it's
    nested one level deeper than sibling `main/` files) to the preload
    script and renderer HTML
  - sandboxed preload scripts can't `require()` arbitrary local files, so
    importing the shared IPC channel map from `main/ipc/channels.ts` failed
    at runtime despite type-checking fine — fixed by duplicating that small
    map directly in `preload/index.ts` (documented in both files, keep them
    in sync by hand)

## Next planned step

Issue #52 (+ #53–#55) — Settings window (Hotkeys / Languages / Services
tabs), the last piece of UI for v0.1. Then issue #56 (docs finalization).

Given the two real bugs the popup window's manual verification caught,
repeat the same approach for the settings window: build, run the packaged
app, and drive it through Electron (executeJavaScript / DOM dump or an
interactive check) rather than trusting typecheck+unit tests alone —
IPC/path wiring bugs specifically don't show up in either.

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
