# Progress

This file is the durable, cross-session checkpoint for OpenTranslate. Read it
first in any new session, then reconcile it against the actual state of
[Issues](https://github.com/stenastena/opentranslate/issues) and the
[project board](https://github.com/stenastena/opentranslate/projects) —
GitHub is the source of truth if the two ever disagree.

## Current state (as of this update)

**v0.1 (MVP) is functionally done.** All real-machine bugs found in testing
are fixed and merged (#67/#68/#69/#70, plus #81/#84 found during this
session's own DoD pass). The only two loose ends, both non-blocking and
environment-specific rather than code bugs:

- **Google was hit by a real, temporary IP-level rate limit** near the end
  of this session, from this session's own heavy testing volume (curl
  fixture-gathering, repeated `check-providers` runs, live app testing).
  Confirmed via a bare `curl` also getting 429 — not a code issue. Should
  clear on its own; re-run `npm run check-providers` at the start of the
  next session to confirm before doing anything Google-related.
- **`npm run package`'s NSIS step fails on this dev machine** downloading
  `winCodeSign` ("Cannot create symbolic link: a required privilege is not
  held by the client") — a well-known Windows electron-builder limitation
  needing Developer Mode or admin rights, unrelated to this project's code.
  The actual app + native deps (`koffi`) bundle correctly into
  `release/win-unpacked`; only the installer-generation step is blocked.
  Not fixed — enabling Developer Mode is a system-settings change outside
  what Claude should do unilaterally. Project owner can enable it if a
  local installer build is ever needed; otherwise this doesn't block
  anything (CI doesn't package, only builds+tests).

**v0.2 backlog progress**: translation history (#8, and its sub-issues
#9/#10/#11) is fully shipped. Google rich dictionary output (#76, filed and
shipped in this session) is done. Remaining v0.2 backlog: TTS (#12/#13/#14),
not started. Yandex (#75) is backlog pending a product decision on a paid
API key — see below.

GitHub setup for the whole roadmap (labels, milestones v0.1–1.0, project
board) is complete. Full backlog for v0.2–1.0 is issues #8–#34 plus **#75**
(Yandex official API key, split out from #70) and **#76** (done).

## What shipped in v0.1

Scaffolding, provider adapters, hotkey/capture, popup window, and Settings
window (issues #1–#67) — see git history / closed issues for the original
implementation PRs. Real-machine testing after the initial v0.1 tag found
three bugs, all now fixed:

- **#68 (hotkey stops firing after a Windows input-language switch)** —
  root-caused to nut-js's Ctrl+C emulation (not hotkey registration, which
  worked the whole time). Fixed by replacing nut-js with a direct
  `user32.dll` `SendInput` call using hardware scan codes via `koffi`
  (`src/main/keyEmulator.ts`). `@nut-tree-fork/nut-js` removed entirely.
  Known residual limitation (accepted): the hotkey doesn't fire under a
  German keyboard layout — a pre-existing issue with the OEM backtick key
  as the default accelerator on non-US layouts, not a regression.
- **#69 (popup closed on blur, felt wrong in practice)** — redesigned per
  the project owner's explicit decision: closes only on Esc, no longer
  always-on-top, real native-frame movable/resizable window that remembers
  its last position/size (clamped to stay on-screen), Original/Translation
  editable with an explicit Translate button. Follow-up fixes this session:
  `skipTaskbar` was also hiding it from Alt+Tab (fixed, PR #81); the target
  language could silently equal the source language (see below).
- **#70 (DeepL/Google 429 on the real network)** — DeepL needed its newer
  "oneshot" endpoint (the old jsonrpc one is now hard rate-limited for
  anonymous traffic); Google's 429 was a TLS/HTTP2 fingerprint check on
  Node's `fetch` specifically, fixed by routing through curl
  (`src/main/providers/curlFetch.ts`). Yandex is blocked by a real
  interactive CAPTCHA wall (not fixable in code) — split into **#75**,
  backlog pending a decision on a paid Yandex Cloud API key.

## What shipped in v0.2 so far

- **#76 — Google rich dictionary output.** Google's unofficial endpoint
  returns parts of speech, synonyms, definitions, examples, and
  alternative translations for single-word lookups when queried with
  extra `dt=` values + `dj=1` (`src/main/providers/googleDictionary.ts`,
  reverse-engineered from captured responses — fixtures in
  `__fixtures__/google/`). Shown in a collapsible Dictionary section in
  the popup. German/French noun translations carry their definite article
  (der/die/das, le/la) inline and on a gender badge next to "Translation"
  — best-effort (a pivot lookup recovers it when the sentence translator
  and dictionary subsystem disagree on the top word; sometimes Google's
  dictionary just doesn't have the word at all, and nothing is shown
  rather than guessing). **Google's own dictionary data can be wrong**:
  confirmed "Мост" → German tags "Brücke" with article "der", but it's
  actually feminine ("die Brücke") — a real Google data-quality issue, not
  a parsing bug; documented in code. DeepL has no equivalent capability
  (confirmed via a direct request — its oneshot endpoint returns only
  `{detected_source_language, text}`).
- **#78 — perf.** The back-translation call was redundantly repeating
  Google's full dictionary+gender lookup for no UI benefit (up to 6 curl
  requests per single-word popup view). Added a `lightweight` translate
  option (threaded through `TranslationProvider` → IPC → the popup's
  back-translation call sites) so only the forward translation pays that
  cost.
- **#79 — license.** Switched MIT → Apache License 2.0 with a `NOTICE`
  file, at the project owner's request, so attribution survives a
  plain-copy fork (Apache 2.0 requires NOTICE to carry into derivative
  works; MIT doesn't). `LICENSE`/`NOTICE`/`package.json`/`README.md` all
  updated.
- **#81 — bugfixes found during DoD testing.**
  (a) `googleDictionary.ts` crashed on multi-sentence input: Google omits
  the `alternative` field entirely (not `[]`) for a whitespace-only
  segment between sentences — fixed with a defensive default + regression
  test. (b) Popup's `skipTaskbar: true` (left over from #69) also hid it
  from Alt+Tab on Windows — set to `false`.
- **#84 — auto target language.** The target-language dropdown was fixed
  once at popup-init time to Settings' `autoDetectSecond` and never
  revisited — if the detected source happened to match that fixed target
  (e.g. both Russian), the app silently "translated" Russian to Russian.
  Added a real "Auto" option for target (now the default) that resolves
  dynamically per capture using the Languages-settings pair: detected/
  selected source matches `autoDetectSecond` → target `autoDetectFirst`;
  anything else → target `autoDetectSecond`. Threaded through history
  recording, the edited-translation back-translation path, and swap.
- **#8/#9/#10/#11 — translation history**, fully shipped:
  - `src/main/history/`: JSON-file-backed `HistoryStore`
    (list/add/remove/clear, newest-first, capped at 500 entries),
    mirroring `SettingsStore`'s pattern. New `history:*` IPC channels.
    The popup records a history entry after each successful *forward*
    translation (not back-translation, not lightweight calls),
    fire-and-forget.
  - A History window (`src/main/windows/historyWindow.ts`,
    `src/renderer/history/`) listing entries with provider, languages,
    timestamp, original/translated text, plus "Clear All" and per-entry
    delete.
  - Reachable from the tray's "View History" item **and** from a new
    real application menu on the popup window (`src/main/menu.ts`) — the
    popup previously showed Electron's unconfigured default menu bar
    (File/Edit/View/Window/Help), which the project owner flagged as not
    a natural place to look for History. Now: File (Settings/History/
    Exit) + a standard Edit menu (for the popup's editable text fields).

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
npm run check-providers   # confirm Google's rate limit has cleared before relying on it
```

1. If Google is still 429ing, don't chase it — it's a real, temporary
   upstream limit from this session's testing volume, not a bug. Just
   avoid hammering it with more test requests; move on to other work and
   check back later.
2. v0.1 is done in every way that matters for shipping; the two open
   items above (Google's temporary limit, winCodeSign/Developer Mode) are
   both external/environment, not code — no v0.1 code work is expected to
   remain.
3. Next up in the v0.2 backlog: **TTS (issues #12/#13/#14)** — speak the
   captured text and/or its translation aloud. Same process as before:
   issue already exists → branch → PR → CI → merge, one sub-issue at a
   time (#13 provider abstraction likely first, then #14 the popup speak
   button).
4. Issue #75 (Yandex official API key) is backlog, not blocking — pick it
   up whenever there's a product decision to spend on a paid Yandex key.

When implementing UI-facing work, prefer the verification approach used in
past sessions over trusting typecheck+tests alone: build, run the app on
the real machine, and drive/observe it live (console logs, or watching it
with the project owner) — IPC bugs, path-resolution bugs, and OS-level
input/focus quirks specifically don't show up in typecheck or mocked unit
tests. The project owner has asked to handle routine engineering workflow
(branch → PR → CI → merge, implementation-approach choices, splitting
mixed changes into separate focused PRs) autonomously without checking
in; they're only needed for actions that require hands-on interaction
with the running app itself (reproducing input/focus bugs, confirming
real-world UI behavior) or genuine product/cost decisions the spec
doesn't answer (e.g. #69's close-behavior decision, or whether to spend
on a paid Yandex API key for #75).
