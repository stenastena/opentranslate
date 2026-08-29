# Progress

This file is the durable, cross-session checkpoint for OpenTranslate. Read it
first in any new session, then reconcile it against the actual state of
[Issues](https://github.com/stenastena/opentranslate/issues) and the
[project board](https://github.com/stenastena/opentranslate/projects) —
GitHub is the source of truth if the two ever disagree.

## Current state (as of this update)

**v0.1 (MVP) is done.** All three real-machine bugs found in the previous
testing session are now fixed and merged: **#68** (hotkey), **#69** (popup
behavior), **#70** (providers). The v0.1 milestone has 0 open issues.

**Not yet done before calling v0.1 *actually* closed**: a final Definition
of Done pass against the original v0.1 spec, on the real machine, covering
the app end-to-end now that all three bugs are fixed (this was deferred —
see "How to resume" below).

GitHub setup for the whole roadmap (labels, milestones v0.1–1.0, project
board with Backlog/Todo/In Progress/In Review/Done columns, issue templates)
is complete and not expected to need further changes. Backlog for v0.2–1.0
is tracked as issues #8–#34 (untouched, not started) plus **#75** (new,
split out from #70 — Yandex needs an official paid API key).

## What shipped in v0.1

- Issue #1 (+ #2–#6): project scaffolding, CI, issue templates,
  CONTRIBUTING.md. PR #7.
- Issue #35: `TranslationProvider` interface + registry with per-provider
  try/catch isolation and last-success timestamp tracking. PR #57.
- Issues #36/#37/#38: DeepL, Yandex, Google adapters. PRs #60/#59/#58,
  later substantially reworked — see #70 below.
- Issue #39: `npm run check-providers` health-check script. PR #61.
- Issue #40 (+ #41, #42): JSON-file settings store, IPC scaffolding. PR #62.
- Issue #43 (+ #44–#46): tray icon, global hotkey (default `` Ctrl+` ``),
  clipboard text capture. PR #63, later fixed twice more — see #67/#68.
- Issue #47 (+ #48–#51): popup window. PR #64, later substantially
  reworked — see #69 below.
- Issue #52 (+ #53–#55): Settings window. PR #65. Verified working on the
  real machine, no issues found.
- Issue #67: Ctrl+C emulation reliability fix. PR #71, merged.
- **Issue #68 (FIXED, PR #72)**: root-caused live on the real machine with
  visible `[hotkey]`/`[keyEmulator]` console logs. The global hotkey
  registration was never the problem — `capture triggered` fired reliably
  every time. The bug was nut-js's synthetic Ctrl+C emulation, which
  reliably stopped producing any clipboard change after a Windows
  input-language switch (RU<->EN, either via keyboard shortcut or the
  taskbar language indicator — confirmed both break it), and stayed broken
  even across a full app restart. No stuck OS-level modifier
  (`GetAsyncKeyState`) and no Sticky Keys involvement. Fix: replaced
  nut-js with a direct `user32.dll` `SendInput` call using hardware scan
  codes (`KEYEVENTF_SCANCODE`) via `koffi`, bypassing nut-js's native
  Windows module entirely (`src/main/keyEmulator.ts`). `@nut-tree-fork/nut-js`
  removed from dependencies. **Known residual limitation, accepted by the
  project owner**: the hotkey doesn't fire at all under a German keyboard
  layout — a separate, pre-existing issue with using the OEM `` ` ``
  (backtick) key as the default accelerator on non-US layouts, not a
  regression from this fix.
- **Issue #69 (FIXED, PR #74)**: popup redesigned per the project owner's
  explicit decision (this was a needs-decision issue, not a guess) —
  closes only on Esc (no more close-on-blur, no longer always-on-top, so
  it doesn't float over other apps when you switch away), is a real
  native-frame movable/resizable window, remembers its last
  position/size and reuses it (clamped to the current display's work
  area so it's always fully visible — anchoring at the cursor could push
  it off-screen near edges), and Original/Translation are now editable
  with an explicit **Translate** button for re-translating after an edit
  (auto-retranslate-on-blur was tried and found surprising in practice;
  the first translation on capture still fires automatically). All three
  sections (Original/Translation/Back-translation) are independently
  resizable.
- **Issue #70 (CLOSED, PR #73 + follow-up issue #75)**: root-caused all
  three providers live against the real network, each for a different
  reason:
  - **DeepL — fixed.** The legacy `www2.deepl.com/jsonrpc` endpoint now
    hard rate-limits anonymous traffic regardless of headers or the old
    anti-bot id/timestamp/spacing trick. Rewrote the adapter to use
    DeepL's newer unauthenticated "oneshot" endpoint
    (`oneshot-free.www.deepl.com/v1/translate`), impersonating the iOS
    app's request shape. Verified working via plain Node `fetch`.
  - **Google — fixed.** The 429 was a TLS/HTTP2-handshake fingerprint
    check on Node's built-in `fetch` (undici) — confirmed side by side
    that the *identical* request (URL, params, headers) gets 429 from
    `fetch` but 200 from curl. Added `src/main/providers/curlFetch.ts`,
    which shells out to curl (bundled with Windows) for just this
    provider to sidestep that fingerprint.
  - **Yandex — not fixed, and not fixable by a code change.**
    `translate.yandex.net` returns HTTP 403 with an `x-yandex-captcha`
    header — a real interactive bot-wall (SmartCaptcha), confirmed via
    curl too. There is no legitimate way to script around an active
    CAPTCHA. Split into **issue #75**: needs an official paid Yandex
    Cloud Translate API key and an adapter rewrite, which is a
    product/cost decision, not a bug fix.

Two notes on the merged history (informational, no action needed):
- PR #64 (popup window) left one harmless empty extra commit on `main`
  from a transient GitHub API error during the merge — identical file
  tree.
- A commit message containing unescaped backticks (`` `like this` ``)
  passed to `git commit -m` in bash triggers command substitution and can
  execute arbitrary text as a shell command — it once ran `npm run dev`
  mid-commit and hung. Always write multi-line or backtick-containing
  commit/PR messages to a file and use `git commit -F file` /
  `gh pr create --body-file file` instead of inline `-m`/`--body`.

## How to resume

```bash
git checkout main && git pull
gh issue list --milestone v0.1 --state open   # should be empty
```

1. Do a full Definition of Done pass against the original v0.1 spec on
   the real machine (capture → translate across all working providers →
   popup interactions → settings), now that #68/#69/#70 are all fixed,
   then close the v0.1 milestone for real.
2. Then move to the v0.2 backlog (issues #8–#14: translation history,
   TTS), same process as before: issue → branch → PR → CI → merge.
3. Issue #75 (Yandex official API key) is backlog, not blocking — pick it
   up whenever there's a product decision to spend on a paid Yandex key.

When implementing UI-facing work, prefer the verification approach used in
past sessions over trusting typecheck+tests alone: build, run the app on
the real machine, and drive/observe it live (console logs, or watching it
with the project owner) — IPC bugs, path-resolution bugs, and OS-level
input/focus quirks specifically don't show up in typecheck or mocked unit
tests. The project owner has asked to handle routine engineering workflow
(branch → PR → CI → merge, implementation-approach choices) autonomously
without checking in; they're only needed for actions that require
hands-on interaction with the running app itself (reproducing input/focus
bugs, confirming real-world UI behavior) or genuine product decisions the
spec doesn't answer.
