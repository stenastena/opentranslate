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

- **Google is currently 429ing again** (confirmed live via `check-providers`
  during the #94 investigation below) — this specific instance is, same as
  before, a real upstream IP-level limit that needs to just clear with
  time, not a code bug. What *is* now fixed in code (#94, this session):
  the app's own request pattern was needlessly volume-hungry (see below),
  which meant even light real usage burned through the limit faster than
  it should have. Re-run `npm run check-providers` to check whether it's
  cleared before relying on Google.
- **`npm run package`'s NSIS step previously failed on this dev machine**
  downloading `winCodeSign` ("Cannot create symbolic link: a required
  privilege is not held by the client") — extracting that archive tries to
  recreate two macOS-only symlinked `.dylib` files
  (`darwin/10.12/lib/lib{crypto,ssl}.dylib`), which needs a privilege this
  machine's account doesn't have without Developer Mode. **Worked around
  2026-08-29** without touching any system setting: those two files are
  never used by a Windows-target build (only `windows-10/signtool.exe`,
  `rcedit-*.exe` etc. from the same archive are), so the archive was
  extracted manually with `7za.exe x -xr!darwin` (excluding the whole
  `darwin` subtree, skipping the problem entirely) and the result placed
  at `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0`
  — electron-builder's own downloader (`getBin("winCodeSign")` in
  `app-builder-lib`) finds this pre-populated cache entry and skips
  downloading/extracting it itself. `npm run package` now produces
  `release\OpenTranslate Setup 0.1.0.exe` successfully. This fix lives
  only in the local build-tool cache (nothing in the repo changed) — a
  fresh machine or a cleared electron-builder cache would need the same
  workaround repeated once. Not something to automate into the repo
  itself; CI doesn't package (only builds+tests), so this was purely for
  producing a local release build on request.

**v0.2 backlog progress**: translation history (#8, and its sub-issues
#9/#10/#11) is fully shipped. Google rich dictionary output (#76) is done.
Text-to-speech (#12/#13/#14) is fully shipped. The #88 voice-quality
follow-up (requested by the project owner as a high-priority feature
request after live-testing #14) shipped in two stages — #89/#90 — and was
then hands-on tested live by the project owner: it works, but voice quality
is "a bit better, not dramatically better" even with the settings in place
— tracked as a fresh follow-up, **#93** (backlog, not urgent — open
questions about whether NaturalVoiceSAPIAdapter was actually installed yet,
logged in the issue). **#94 — Google request-volume/reliability fix** (this
session, at the project owner's request after hitting 429 under light real
usage) is also fully shipped — see below. Remaining v0.2 backlog: Appearance
settings (#15–20), Advanced settings (#25–29), Yandex (#75, needs a product
decision), #93 (voice quality, backlog).

The old "dictionary provider subsystem" issues (#21/#22/#23/#24) were closed
this session as superseded: they asked for a generic multi-provider
`DictionaryProvider` interface + registry, but #76 already ships the one
dictionary source in use (Google) directly, with no second source to
justify the abstraction. Reopen/re-file if a genuine second dictionary
source (e.g. Wiktionary) is ever wanted.

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
- **#12/#13/#14 — text-to-speech**, fully shipped:
  - `src/main/tts/`: a `TTSProvider` interface (`speak`/`stop`/`isHealthy`)
    and `systemTtsProvider`, its first implementation — Windows' built-in
    SAPI voices via PowerShell's `System.Speech.Synthesis.SpeechSynthesizer`
    (offline, no unofficial endpoint, no rate-limit risk unlike the
    translation providers). Text/lang are passed through environment
    variables rather than interpolated into the PowerShell script string,
    to avoid a PowerShell-injection vector on arbitrary captured clipboard
    text. Wired through new `tts:speak`/`tts:stop` IPC channels the same
    way #9 wired history's persistence layer ahead of its UI (PR #86).
  - A speaker-icon button next to the Original and Translation section
    headings in the popup (PR #87). Only one utterance plays at a time —
    starting one stops whichever was already playing; each button's icon
    toggles speak (🔊) / stop (⏹) and resets once playback ends, whether
    naturally or via stop(). The Translation button is disabled until its
    tab has an actual "ok" result, so a loading placeholder or error
    message never gets read aloud.
  - **Confirmed working via live interactive testing on the real
    machine** (2026-08-29): selecting text, capturing via the hotkey,
    clicking Speak on both Original and Translation, and switching
    between them mid-playback. Two real, non-blocking findings from that
    session: the built-in SAPI voices are noticeably low quality, and
    German text is read with an English accent (no German SAPI voice is
    installed on this dev machine, so the language-matching in
    `systemProvider.ts` finds nothing and silently falls back to the
    default voice — working as designed, just a poor result). Filed as a
    follow-up, **#88**: explore a genuinely free, higher-quality
    alternative voice engine. The project owner turned this into a
    concrete two-stage feature request (split into #89/#90 below) rather
    than leaving it as open-ended research.
- **#89 — per-language voice selection settings**, fully shipped (PR #91,
  stage 1 of #88's follow-up):
  - `TTSProvider` gains `listVoices()` (re-queried fresh every call —
    never cached at app startup, so a voice installed mid-session shows up
    next time Settings is opened) and `speak()` gains an optional
    `voiceName` override that takes priority over locale matching,
    falling back to it when the given name isn't currently installed.
  - A new Voice tab in Settings: one row per language in
    `LANGUAGES` (all of them, not just the 2-language auto-detect pair —
    Settings has no separate "used languages" concept, and every listed
    language is already manually selectable in the popup), each with a
    dropdown (locale-matching voices, then every installed voice for
    manual override, defaulting to "Automatic" = today's behavior) and a
    Test button that speaks a short fixed phrase with no translation call
    needed. An explicit "No voice installed for this language" hint shows
    rather than hiding a language with no locale match.
  - `AppSettings.tts.voiceByLang` persists the choice; a language with no
    entry is unaffected, so anyone who never opens Voice settings sees
    exactly the same behavior as before this PR.
  - **A real ordering bug was caught and fixed before merging**: loading
    settings and loading the voice list happen concurrently, and whichever
    finished second could silently wipe out the other's effect on a
    `<select>`'s value depending on timing. Found via a stubbed-`electronAPI`
    browser test of the real bundled `settings.js` (not just mocked unit
    tests) — fixed by re-applying the saved selection once more after both
    have settled, rather than relying on either one "winning" the race.
- **#90 — voice list refresh + NaturalVoiceSAPIAdapter guidance, quality
  hints**, fully shipped (PR #92, stage 2 of #88's follow-up):
  - A "Refresh voice list" button in the Voice section re-queries installed
    voices immediately — no app restart or Settings reopen needed, which
    matters right after installing something like NaturalVoiceSAPIAdapter.
  - An info box explains [NaturalVoiceSAPIAdapter](https://github.com/gexgd0419/NaturalVoiceSAPIAdapter)
    (free, open-source, exposes Microsoft Edge's neural "Read Aloud" voices
    as ordinary SAPI voices) with a link opened externally via a new
    `tts:open-natural-voice-adapter-page` IPC channel — deliberately a
    fixed, hardcoded URL rather than accepting an arbitrary one from the
    renderer, since this app must never install third-party software
    itself, only point at it. If NaturalVoiceSAPIAdapter is actually
    installed and its voices get picked up correctly, that validates #89's
    `listVoices()` was built generally enough (full enumeration, no
    per-vendor special-casing) — no code changes needed for it specifically.
  - A best-effort "★ Natural" tag on a voice's dropdown label when its
    name/description contains "Natural"/"Neural"/"Online" — a heuristic,
    not a guarantee; non-matching voices are left unlabeled rather than
    guessing.
  - **#88 closed** once both stages shipped — see its closing comment for
    the summary.
  - **Live hands-on follow-up (2026-08-30)**: the project owner tried
    Settings → Voice for real. It works, but "немного лучше, но не
    кардинально лучше" (a bit better, not dramatically better) — tracked
    as **#93** (backlog): open whether NaturalVoiceSAPIAdapter was actually
    installed yet, and if it was, whether the ceiling is the adapter/voices
    themselves or something in how `systemProvider.ts` calls into SAPI.
- **#94 — Google request-volume/reliability fix**, fully shipped (PR #95),
  same session, prompted by the project owner hitting a real 429 under
  light usage:
  - Root cause: a single-word lookup into an article-using target language
    (de/fr/es/it/pt/nl) already cost up to 3 requests via the gender-pivot
    fallback (#76's `findTranslationGender`) — common, not an edge case,
    since the dictionary/gender feature is Google-exclusive and the
    default second language is German. Zero caching meant re-viewing the
    same word paid that cost again every time.
  - `curlGet` (`curlFetch.ts`) now retries a 429/503 up to 2 extra times
    with jittered exponential backoff — confirmed via external research
    (googletrans/deep-translator-style unofficial clients) that this is
    the standard mitigation for transient rate limiting.
  - `google.ts`: every request (including the pivot's two) goes through a
    shared in-memory cache keyed by the exact request URL — 5-minute TTL,
    200-entry cap, only caches successful (200) responses.
  - Trimmed 4 `dt=` params (`ld`/`qca`/`rw`/`rm`) sent on every full
    request but never parsed anywhere.
  - **Confirmed live that Google is genuinely 429ing right now** (a real,
    sustained upstream block, not a transient one — our own retries during
    this same investigation still got 429). This fix reduces how much
    *future* light usage burns through the limit; it does not and cannot
    clear an already-established block faster. Re-run
    `npm run check-providers` to check current status.

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

Paste this (or just "continue OpenTranslate") to pick the session back up:

> Продолжаем OpenTranslate. Прочитай PROGRESS.md в корне репозитория, затем
> сверь с реальным состоянием GitHub:
>
> ```bash
> git checkout main && git pull
> gh issue list --state open
> npm run check-providers
> ```
>
> v0.1 is fully shipped, and v0.2's translation history, Google dictionary
> output, and text-to-speech (#8–#11, #76, #12–#14) are all done and merged.
> Everything in this paragraph is backlog, not blocking anything — pick
> whichever makes sense, autonomously:
>
> 1. **#88 — higher-quality free TTS voices.** The current
>    `systemTtsProvider` (Windows SAPI) works but is low-fidelity and falls
>    back to an English accent for languages with no matching installed
>    voice (confirmed live for German on this machine). Worth exploring
>    before building more TTS-adjacent UI on top of a voice engine that
>    might get replaced. See the issue body for candidate directions (Edge's
>    unofficial neural-TTS endpoint, etc.) — no committed answer yet, this
>    needs research first.
> 2. **Appearance settings (#15–20)** — theme, opacity, auto-position/size,
>    border customization, pin-when-dragged. Next in backlog order after
>    TTS.
> 3. **Advanced settings (#25–29)** — default browser, copy action, OCR API
>    key, mouse interaction modes.
> 4. **#75 (Yandex paid API key)** — needs a product/cost decision, not a
>    coding task; raise it rather than picking a default.
>
> Same process as every prior session: issue already exists (or file one) →
> branch → PR → CI → merge, one sub-issue at a time. Handle the routine
> engineering workflow (branch/PR/merge, implementation choices, splitting
> mixed changes into separate PRs, project-board status) autonomously
> without checking in — only surface things that need hands-on interaction
> with the running app (reproducing input/focus/audio bugs, confirming
> real-world UI or audio behavior) or a genuine product/cost decision the
> spec doesn't answer (e.g. #75, or #88's eventual choice of voice engine
> if it has a cost/quality/complexity tradeoff worth flagging).

### Notes for whoever picks this up

- If `check-providers` shows Google 429ing, don't chase it — treat it the
  same way past sessions have: a real but temporary upstream limit from
  testing volume, not a bug. Move on and check back later.
- The two long-standing non-blocking environment issues (Google's
  temporary rate limit already covered above, and `npm run package`'s NSIS
  step needing Developer Mode on this machine) are unrelated to CI and
  don't need attention unless a local installer build is actually needed.
- For UI/OS-integration work (popup UI, audio, hotkey/capture), prefer the
  verification approach used throughout this project over trusting
  typecheck+tests alone: build, run the app for real, and drive/observe it
  live — IPC bugs, path-resolution bugs, and OS-level input/audio/focus
  quirks don't show up in typecheck or mocked unit tests. For anything
  needing real audio output or the actual hotkey-driven capture flow
  (not just button click-through logic), that means asking the project
  owner to test interactively rather than trusting a stubbed browser
  preview alone — as happened with #14, where live testing surfaced the
  SAPI voice-quality issue (#88) that a mocked test never would have.
