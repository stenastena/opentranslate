# Progress

This file is the durable, cross-session checkpoint for OpenTranslate. Read it
first in any new session, then reconcile it against the actual state of
[Issues](https://github.com/stenastena/opentranslate/issues) and the
[project board](https://github.com/stenastena/opentranslate/projects) —
GitHub is the source of truth if the two ever disagree.

## Current milestone

**v0.1 (MVP)** — all planned issues implemented and merged; only the
documentation-finalization issue (#56, this update) remains before the
milestone is closed.

GitHub setup for the whole roadmap (labels, milestones v0.1–1.0, project
board with Backlog/Todo/In Progress/In Review/Done columns, issue templates)
is complete. Backlog for v0.2–1.0 is tracked as issues #8–#34.

## What shipped in v0.1

- Issue #1 (+ #2–#6): project scaffolding, CI, issue templates,
  CONTRIBUTING.md. PR #7.
- Issue #35: `TranslationProvider` interface + registry with per-provider
  try/catch isolation and last-success timestamp tracking. PR #57.
- Issues #36/#37/#38: DeepL, Yandex, Google adapters against their
  unofficial endpoints, each unit-tested with mocked fetch. PRs #60/#59/#58.
  DeepL's request-id/timestamp/JSON-spacing anti-bot workaround and
  Yandex's synthetic session id are documented in the adapters' own top
  comments — re-derive from a fresh network capture if either provider
  starts rejecting requests.
- Issue #39: `npm run check-providers` health-check script. PR #61.
- Issue #40 (+ #41, #42): JSON-file settings store (not electron-store —
  needed to be constructible/testable outside Electron) and IPC scaffolding
  (contextBridge preload, injectable ipcMain handlers). PR #62.
- Issue #43 (+ #44–#46): tray icon, global hotkey (default `` Ctrl+` ``),
  clipboard text capture with guaranteed restore (try/finally). PR #63.
- Issue #47 (+ #48–#51): popup window — Original/Translation/
  Back-translation, per-provider tabs, Auto-Detect (first/second-language
  heuristic) + manual selection with swap, auto-size, close on blur/Esc.
  PR #64.
- Issue #52 (+ #53–#55): Settings window — Hotkeys/Languages/Services
  tabs; saving re-registers the hotkey live. PR #65.

Two notes on the merged history:
- PR #64 (popup window) left one harmless empty extra commit on `main`
  from a transient GitHub API error during the merge — identical file
  tree, no action needed.
- A commit message containing unescaped backticks (`` `like this` ``)
  passed to `git commit -m` in bash triggers command substitution and can
  execute arbitrary text as a shell command — it once ran `npm run dev`
  mid-commit and hung. Always write multi-line or backtick-containing
  commit/PR messages to a file and use `git commit -F file` /
  `gh pr create --body-file file` instead of inline `-m`/`--body`.

## Real-app verification done so far — and what's still unverified

Typecheck + unit tests pass in CI for every merged PR, but per this
project's own standards that verifies code correctness, not feature
correctness. For the popup and settings windows, the packaged app was
actually built and run, then driven via `webContents.executeJavaScript`
DOM dumps/field checks (not just unit tests) — this caught two real bugs
in the popup PR (wrong relative path depth to preload/renderer, and a
sandboxed-preload `require()` failure) that typecheck and unit tests both
missed. Settings window verification found no bugs.

**Still not verified, and should be checked by hand on the real Windows
dev machine before calling v0.1 "done" for real use** (this dev sandbox
has no interactive desktop session and its egress IP is rate-limited by
Google/DeepL, so neither of these could be exercised here):
- The actual hotkey → Ctrl+C emulation → clipboard capture flow with a
  real text selection in Notepad and in a browser (DoD explicitly calls
  out both). nut-js loaded without error and the app didn't crash, but
  that's not the same as confirming a real capture works.
- A real, successful translation rendering in the popup for all three
  services from an unthrottled network. Every provider adapter has only
  been observed either via mocked unit tests or against this sandbox's
  rate-limited/blocked IP (429/403 responses) — the error-isolation path
  is confirmed working, the happy path with real translated text is not.

## Known blockers / needs-decision

None currently open.

## How to resume

```bash
git checkout main && git pull
gh issue list --state open
```

v0.1 has no open issues left after #56 merges. Next: pick from the v0.2
backlog (issues #8–#14: translation history, TTS), or first do the two
manual checks above on the real dev machine and record the result here.

When implementing UI-facing work, prefer the verification approach used
for the popup/settings windows over trusting typecheck+tests alone: build,
run the packaged app, and drive it via Electron (executeJavaScript /
DOM dump, or an interactive check) — IPC and path-resolution bugs
specifically don't show up in either typecheck or mocked unit tests.
