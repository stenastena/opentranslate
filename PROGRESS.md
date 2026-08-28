# Progress

This file is the durable, cross-session checkpoint for OpenTranslate. Read it
first in any new session, then reconcile it against the actual state of
[Issues](https://github.com/stenastena/opentranslate/issues) and the
[project board](https://github.com/stenastena/opentranslate/projects) —
GitHub is the source of truth if the two ever disagree.

## Current state (as of this update)

**v0.1 (MVP)**: all originally-planned issues were implemented, merged, and
the milestone was closed — but real-machine testing on the actual Windows
dev box the same day found the app doesn't fully work yet in practice. The
milestone is open again with 3 bug/decision issues tracking what's left:
**#68** (open bug), **#69** (open needs-decision), **#70** (open bug,
deferred by the project owner). **#67** (a 4th bug found the same session)
is already fixed and merged.

**Do not consider v0.1 actually done until #68 and #69 are resolved.** #70
is explicitly deferred until #68 is fixed (translations don't matter if the
popup barely opens).

GitHub setup for the whole roadmap (labels, milestones v0.1–1.0, project
board with Backlog/Todo/In Progress/In Review/Done columns, issue templates)
is complete and not expected to need further changes. Backlog for v0.2–1.0
is tracked as issues #8–#34 (untouched, not started).

## What shipped in v0.1 (implementation-complete, see below for real-world bugs)

- Issue #1 (+ #2–#6): project scaffolding, CI, issue templates,
  CONTRIBUTING.md. PR #7.
- Issue #35: `TranslationProvider` interface + registry with per-provider
  try/catch isolation and last-success timestamp tracking. PR #57.
- Issues #36/#37/#38: DeepL, Yandex, Google adapters against their
  unofficial endpoints, each unit-tested with mocked fetch. PRs #60/#59/#58.
  DeepL's request-id/timestamp/JSON-spacing anti-bot workaround and
  Yandex's synthetic session id are documented in the adapters' own top
  comments — re-derive from a fresh network capture if either provider
  starts rejecting requests. **DeepL is confirmed broken for real — see
  issue #70.**
- Issue #39: `npm run check-providers` health-check script. PR #61.
- Issue #40 (+ #41, #42): JSON-file settings store (not electron-store —
  needed to be constructible/testable outside Electron) and IPC scaffolding
  (contextBridge preload, injectable ipcMain handlers). PR #62.
- Issue #43 (+ #44–#46): tray icon, global hotkey (default `` Ctrl+` ``),
  clipboard text capture with guaranteed restore (try/finally). PR #63.
  **Capture reliability was buggy — see #67 (fixed) and #68 (still open)
  below.**
- Issue #47 (+ #48–#51): popup window — Original/Translation/
  Back-translation, per-provider tabs, Auto-Detect (first/second-language
  heuristic) + manual selection with swap, auto-size, close on blur/Esc.
  PR #64. **The close-on-blur behavior is now under dispute — see #69.**
- Issue #52 (+ #53–#55): Settings window — Hotkeys/Languages/Services
  tabs; saving re-registers the hotkey live. PR #65. Verified working on
  the real machine, no issues found.
- Issue #67: fixed a real capture-reliability bug found this session (see
  below). PR #71, merged.

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

## Real-machine testing session — what was found

This was the first time the app ran on the actual Windows dev machine with
a real interactive desktop and an unthrottled network (everything before
this was either mocked unit tests or a sandboxed CI/dev environment with a
rate-limited egress IP and no display). Ran `npm run dev` in the background
and iterated with the project owner watching the tray icon / popup on their
own screen while I read the console log.

**#67 — Ctrl+C emulation occasionally failed on first hotkey uses (FIXED,
merged).** The first several hotkey presses after launch produced an empty
capture (`[hotkey] captured text: ""`); it started working after 1-2 more
tries. Root cause hypothesis: the synthetic Ctrl-down (nut-js) collided
with the real physical Ctrl key from the hotkey itself, which may not have
been released yet. Fix: ~150ms delay before emulating Ctrl+C, plus
polling the clipboard for up to 500ms instead of a single fixed wait
(both are in `src/main/keyEmulator.ts` / `src/main/textCapture.ts`). After
the fix, the owner confirmed the hotkey worked on the first press across
several repeats.

**#68 — Global hotkey stops firing entirely after some event (OPEN, not
root-caused).** After a successful capture + popup, once the popup closed
(by losing focus when switching to another app window) and/or after
switching the Windows keyboard input language (RU ↔ EN), the hotkey
stopped triggering *any* new capture — not even an empty one; no
`[hotkey] capture triggered` log line at all, implying the OS-level
registration itself may be the problem, not the capture logic. This is
more serious than #67 and needs a fresh reproduction with the console
visible to narrow down. See the issue body for concrete hypotheses
(RegisterHotKey virtual-key codes should be layout-independent on Windows,
so if that's really what's breaking it would be surprising — verify rather
than assume).

**#69 — needs-decision: close-on-blur vs. only-Esc.** The popup closing
when you switch to another window (implemented per the original spec's
"click outside closes it") felt wrong to the project owner in practice —
they expected it to stay open until Esc. See the issue for 4 concrete
options (keep as-is / Esc-only / smarter blur exceptions / pull the v0.3
"pin" feature forward). No code changed yet — this needs an explicit
decision, not a guess, since it contradicts the written spec.

**#70 — DeepL returns HTTP 429 on the real network too (OPEN, deferred by
the project owner until #68 is fixed).** Screenshot showed `ORIGINAL:
cursor` (capture worked) but `TRANSLATION: DeepL request failed with
status 429` on a normal home/office connection — a single first request
being rate-limited is implausible, so the adapter's anti-bot request
signing (timestamp/id/JSON-spacing trick, see `src/main/providers/deepl.ts`
top comment) is probably stale and needs re-deriving from a fresh capture
of deepl.com's own network traffic. Yandex and Google have *still* not
been observed producing a real successful translation either — check
those too once DeepL is fixed.

## Known blockers / needs-decision

- **#69 is an open needs-decision issue** — popup close-on-blur vs.
  Esc-only vs. alternatives. Get the project owner's answer before
  touching `src/main/windows/popupWindow.ts`'s blur handling.

## How to resume

```bash
git checkout main && git pull
gh issue list --milestone v0.1 --state open
```

Should show #68, #69, #70. Suggested order:
1. **#68 first** — it's the most severe (hotkey stops responding at all).
   Reproduce with `npm run dev` run directly in a terminal you can watch
   (not backgrounded), so you see `[hotkey] ...` / `[keyEmulator] ...`
   console lines live. Try to isolate whether it's the popup-closing or
   the layout-switch that triggers it (test each independently). Once
   root-caused, it likely needs a new regression test in
   `src/main/hotkeys.ts` / `textCapture.test.ts` or a manual verification
   note if it's not unit-testable (e.g. a real OS registration quirk).
2. **#69** — ask the project owner which option they want (or propose one
   and get a quick confirmation) before implementing.
3. **#70** — re-derive DeepL's request signing from a fresh browser capture
   of deepl.com; also run `npm run check-providers` on the real machine to
   check Yandex/Google's happy path while at it.
4. Once #68/#69/#70 are closed, v0.1 is *actually* done — do one more full
   pass of the Definition of Done checklist (see the original v0.1 spec)
   on the real machine before moving to v0.2.
5. Then v0.2 backlog (issues #8–#14: translation history, TTS).

When implementing UI-facing work, prefer the verification approach used
this session over trusting typecheck+tests alone: build, run the packaged
app on the real machine, and drive/observe it live (console logs,
`executeJavaScript` DOM dumps, or just watching it with the project owner)
— IPC bugs, path-resolution bugs, and OS-level input/focus quirks
specifically don't show up in typecheck or mocked unit tests.
