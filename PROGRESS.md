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
— tracked as a fresh follow-up, **#93**, since resolved (see #107 below).
**#94 — Google request-volume/reliability fix** is fully shipped.
**#98/#99 — editable detected/back-translation language + on-demand
dictionary** are also fully shipped, and so are three more fixes from
further live feedback: **#101** (tray simplified to just opening the main
window; hotkey opens it even with nothing selected), **#102** (all three
per-section language selects — Original/Translation/Back-translation —
now share identical styling, and Translation got its own resolved-target
override), and **#103** (the real root cause of "new voices don't show
up": `systemProvider.ts` was always shelling out to Windows PowerShell
5.1, which can't see modern "OneCore"-registered voices at all — fixed by
preferring `pwsh.exe` when installed).

**#107 — cloud-based neural TTS, #97 — Microsoft Translator (Bing),
#112 — native cloud voice per translation tab, #96 — MyMemory, #117 —
source-word gender article, and #119 — Bing dictionary breakdown** are
all now shipped too (a later session — see the dedicated writeups below).
**#93 is closed**: #107's Bing-neural default is the actual fix, not
another SAPI-quality workaround. **#97's Azure-account blocker is moot**:
the unofficial Bing web endpoint QTranslate itself uses sidesteps it
entirely, no Azure account or decision needed.

**Comparison against ahatem/QTranslate** (an actively-maintained modern
Kotlin rewrite, not the original abandoned Questsoft app) was requested by
the project owner this session and produced four new/updated backlog
items, none started yet:
- **#107 — cloud-based neural TTS** via the same *category* of unofficial
  endpoint this app already trusts for translation (Google's
  `translate_tts`, Bing's `tfettts` with real Azure neural voices) —
  explicitly requested as the priority follow-up to #93/#88's voice-
  quality complaints, since it removes the whole local-SAPI quality
  ceiling rather than working around it. **Not started.**
- **#108 — Reverso** as a niche 4th provider — confirmed via their actual
  plugin source: only 6 languages (en/fr/de/es/it/ru), and does **not**
  support Auto-Detect at all, so it can't be a drop-in general-purpose
  tab the way DeepL/Google/Yandex are.
- **#109 — resilience patterns** (proactive rate-limiting via a
  request-pacing mutex, a second fallback endpoint per provider,
  official-API-key-first-with-free-fallback on the *same* provider) —
  hardening ideas, not urgent, opportunistic.
- **#75 and #97 got new comments**, not new issues: #75 — Yandex's CAPTCHA
  wall might be avoidable for free via a Mozhi fallback (their Yandex
  Web plugin does this), worth trying before paying for a Yandex Cloud
  key; #97 — "Microsoft Translator" doesn't need to mean official paid
  Azure at all, since QTranslate reaches Microsoft's engine through an
  unofficial Bing endpoint instead, sidestepping the card-requirement
  blocker entirely — could ship as its own simpler adapter without
  waiting on any Azure decision.

**#116 — font size and font family selection is now shipped too** (see
below). Remaining backlog: the rest of Appearance settings (#17–20,
theme/opacity/auto-position/border, all backlog),
Advanced settings (#25–29), Yandex (#75, needs a product decision, or try
the free Mozhi-fallback route first), **#109** (resilience patterns —
rate-limiting, dual-endpoint fallback, official-key-first, backlog), and
**#108 — Reverso**, explicitly deprioritized by the project owner
(2026-09-01: "выносим из текущего 0.2 milestone... Переносим куда-то
позже") and moved from the v0.2 to the **v0.4** milestone.

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
  the popup — **as of #99 (see below), only when the user clicks "Show
  Dictionary"**, not automatically with every lookup. German/French noun
  translations carry their definite article
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
- **#98/#99 — editable detected/back-translation language + on-demand
  dictionary**, fully shipped (PR #100, same session). Started as a bug
  report ("back-translation looks broken") that turned out not to be a
  bug at all: typing "dinamic" gets Auto-Detect'd as Romanian (a real
  word in that language, not a typo'd English word), and the whole
  detect→translate→back-translate pipeline was working correctly — the
  real gap was that **nothing in the UI showed which language got
  detected**, so a correct-but-unexpected detection looked identical to a
  broken round-trip. Investigated live against both DeepL and Google
  directly (`detectLanguage`/`translate` calls from a throwaway script) to
  confirm before touching any code.
  - A "Detected: X" `<select>` next to the source dropdown (previously a
    read-only badge) lets the user correct a wrong Auto-Detect pick for
    the *current* captured text — re-translates every provider tab using
    the corrected language, without touching the Source dropdown itself
    (stays on "Auto-Detect" so the next capture still detects fresh).
  - A second, independent `<select>` next to "Back-translation" lets the
    user pick which language back-translation targets, decoupled from the
    source correction.
  - Both forced corrections pass a new `skipCache` option through
    `google.ts`'s request cache (#94) so a correction is guaranteed live,
    never a stale cached answer — explicitly requested by the project
    owner mid-implementation. Normal (non-forced) flows keep the caching
    benefit.
  - Folded in **#99** once it became clear it touched the same function:
    the initial translate call is now always `lightweight` — Google's
    dictionary/gender data (previously fetched automatically, with the
    gender-pivot fallback alone costing up to 2 *extra* requests) is now
    opt-in via a new "Show Dictionary" button (Google tab only). Plain
    translation dropped from up to 3 Google requests to at most 1.
  - Verified via a stubbed-`electronAPI` browser preview of the real
    bundled `popup.js`/`css`, not just unit tests — confirmed the
    `skipCache` flag actually gets set on forced corrections and not on
    routine loads, and that "Show Dictionary" issues exactly one
    additional (non-lightweight, non-`skipCache`) request.
- **#97 — Microsoft Translator (Azure), filed but explicitly not
  started.** Of QTranslate's provider list (Papago/Microsoft/Baidu/
  Babylon/Youdao/PROMT — screenshot from the project owner), Microsoft's
  is the only one with a genuinely strong permanent free tier (2M
  characters/month via the official API). The blocker: it needs a real
  Azure account. Researched directly (2026-08-31): **confirmed there is
  no card-free path** for a standard adult signup — a non-prepaid card
  plus phone verification is required regardless of intent to stay on
  the free tier; only Azure-for-Students (academic email) or an
  event/sponsorship promo code avoid it, neither generally applicable.
  Logged on the issue. Waiting on a project-owner decision on whether
  that onboarding friction is worth it before writing any adapter code.
- **#93 (voice quality still not "dramatically" better after #88/#89/#90)
  and #96 (add MyMemory Translation as a simple 4th provider — genuinely
  free, no API key, no reverse-engineering needed) remain backlog** — no
  code work done on either this session.
- **#101 — tray/hotkey simplification**, fully shipped (PR #104), from
  live feedback: "the tray should only offer opening the main window" and
  "the hotkey should open it even with nothing selected".
  - `tray.ts`: context menu is now just "Open OpenTranslate" + Exit —
    Settings/History are already reachable from the popup's own File menu
    (added when the popup got a real application menu), so the tray's own
    copies were redundant. Left-click on the tray icon opens the main
    window directly too, not just the context menu.
  - `showPopupWindow(capturedText?)`: omitting the argument (the tray's
    "just open" case) brings an already-open popup to front without
    discarding its state; an explicit string (including `''`, the
    hotkey-with-nothing-selected case) keeps the replace-with-fresh-
    capture behavior. `index.ts`'s hotkey handler now always calls it.
  - Small accompanying fix: the popup no longer shows a misleading
    "Translating…" placeholder when there's no text and nothing will ever
    load.
  - **Real hands-on check still open**: while testing this, `Ctrl+\``
    failed to register on this machine ("likely already bound by another
    application") even after fully killing and relaunching the app
    several times — a pre-existing conflict with something else on this
    system, unrelated to this change (`hotkeys.ts` wasn't touched).
    Couldn't finish confirming the tray-click/hotkey-with-nothing-selected
    behavior live because of it; worth the project owner checking both,
    and what else has that binding, when convenient.
- **#102 — unified language-selector styling + Translation's own
  override**, fully shipped (PR #105), from a screenshot showing the
  detected-language select (added in #98) looking visually inconsistent
  and confusing.
  - Original's language-correction select moved out of the top lang-bar
    into its own section's heading (matching Back-translation's existing
    pattern); all three selects (Original/Translation/Back-translation)
    now share one CSS class with identical plain styling.
  - Translation section gained its own select for the *resolved* target
    language — editable as a per-capture override
    (`state.targetLangOverride`, parallel to `sourceLangOverride`: Auto-
    target-mode only, invalidates/re-runs all tabs, forces a live
    re-check via `skipCache`, cleared on a new capture or a manual
    language-selector change).
  - Layout fix that made this reliable regardless of a select's
    hidden/shown state: each heading's title text is wrapped in a
    `flex:1` span, rather than relying on `margin-left:auto` on multiple
    trailing siblings (which splits the free space *between* them instead
    of keeping them adjacent at the edge — a real pitfall, not just a
    style preference).
- **#103 — system voice listing misses modern/OneCore voices**, fully
  shipped (PR #106) — the actual root cause behind "new voices I install
  don't show up, even after Refresh/reinstalling the app" (also raised
  alongside #101/#102 in the same live-feedback round).
  - Confirmed live: `systemProvider.ts` always shelled out to Windows
    PowerShell 5.1 (`powershell.exe`), whose `System.Speech` only sees
    voices in the classic SAPI5 registry location — it silently misses
    anything registered under the newer "OneCore" location
    (`HKLM\SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens`), which is
    where modern Windows voices (and NaturalVoiceSAPIAdapter-bridged ones)
    can end up. The exact same script via `pwsh.exe` (PowerShell 7,
    already installed on this machine) went from 5 voices to 17, and
    could actually select/speak through a previously-invisible one, not
    just list it.
  - Fix: detect `pwsh.exe` availability once (cached for the process's
    lifetime), prefer it for every PowerShell call this file makes
    (`speak`/`isHealthy`/`listVoices`, not just listing — a user-picked
    OneCore voice needs `SelectVoice()` to find it too), falling back to
    `powershell.exe` unchanged when `pwsh.exe` isn't installed.
  - Verified live end-to-end through the app's own compiled code (not
    just manual PowerShell probing): `listVoices()` went 5 → 17, and
    `speak()` produced real audio through "Microsoft Katja", a voice that
    was completely invisible before this fix.
  - Caught and fixed a genuine (if narrow) timing regression this
    introduced along the way: `current` (used by `stop()`) is no longer
    assigned perfectly synchronously with `speak()` on the very first-ever
    call, since resolving the shell is now an extra `await` before it.
    Only matters for a Stop click with zero time gap after the first-ever
    Speak click — real UI clicks always have some gap — but it did break
    an existing unit test, which is how it was caught.
  - **Still open**: whether NaturalVoiceSAPIAdapter specifically was ever
    installed on this machine wasn't confirmed either way (the voices
    found via the OS's own bundled OneCore voices were enough to
    reproduce and fix the general gap) — re-verify with the project owner
    actually installing it, now that the underlying enumeration bug is
    fixed, to close the loop on #93 too.
- **#107 — cloud-based neural TTS**, fully shipped (PR #110), the priority
  follow-up to #93 explicitly requested by the project owner ("голос как у
  них надо точно включить в наши задачи").
  - `googleCloudTtsProvider` (`translate_tts`, gtx primary / tw-ob
    fallback, 200-char chunking) and `bingCloudTtsProvider` (`tfettts`,
    real Azure neural voices like "de-DE-KatjaNeural", auth scraped from
    bing.com/translator) — both ported from ahatem/QTranslate's
    `GoogleTTSService.kt`/`BingTTSService.kt`+`BingAuthManager.kt`, and
    **every request shape verified live via curl** (including Bing's full
    auth-token-scrape → SSML POST round trip) before writing any
    TypeScript, not just inferred from the Kotlin source.
  - `TTSProvider.speak()` now returns a `TTSSpeakResult`
    (`{kind:'played'}` for `systemProvider.ts`, unchanged; `{kind:'audio',
    data, mimeType}` for the two cloud providers, which can only fetch
    bytes — nothing in the main process can play them). The popup plays
    those via an `<audio>` element and awaits playback finishing, the same
    way it already awaited PowerShell's blocking `Speak()` call for the
    stop-button/icon logic.
  - Settings gained a Voice-source dropdown (System / Google Cloud / Bing
    Neural — **defaults to Bing Neural**, the actual fix for #93's
    complaint) with its own Test button. Any cloud request that throws
    falls back to the system voice for that one call
    (`ipc/handlers.ts`), so a network hiccup never leaves Speak silent.
  - **Live-tested bug found and fixed same session**: the per-language
    SAPI Test button and the new Voice-source Test button both called
    `tts.speak()` and discarded the response — fine for 'system' (already
    played server-side) but silent for cloud (bytes returned, never
    played). Fixed by giving Settings its own `playAudioAndWait` (no stop
    button needed there, unlike the popup's).
  - **#93 closed**: this is the real fix, not another SAPI workaround.
- **#97 — Microsoft Translator, via the unofficial Bing web endpoint**,
  fully shipped (PR #111) — the blocker on the *official* Azure route
  (non-prepaid card required) turned out to be moot: QTranslate's own
  `BingTranslatorService.kt` reaches Bing's engine through
  `www.bing.com/ttranslatev3`, the same unofficial-endpoint pattern
  already trusted elsewhere in this app, needing no Azure account at all.
  - `providers/bingAuth.ts`: a shared IG/IID/key/token/MUID auth set
    scraped from `bing.com/translator`'s HTML, cached ~55 minutes, reused
    by translation *and* TTS (#107) — one page load, many API calls,
    matching how a real browser session works. One forced-refresh retry
    on any failure.
  - Bing's own language codes match this app's bare codes directly except
    Chinese (`zh` vs Bing's `zh-Hans`/`zh-Hant`) — confirmed live (bare
    `zh` returns an in-body `{"statusCode":400}` error, not an HTTP
    failure, so response-body inspection was needed, not just status
    codes).
- **#112 — Google/Bing translations speak with their own native cloud
  voice**, fully shipped in two stages (PRs #113/#114), requested live
  after #107 landed: "надо для Google и Bing озвучку делать родными cloud
  сервисами. Остальные провайдеры пусть озвучиваются выбранным сервисом в
  настройках."
  - The popup now resolves which `providerOverride` to pass `tts.speak()`
    based on the *active translation-provider tab* — Google tab → always
    `google-cloud`, Bing tab → always `bing-cloud`, every other tab (DeepL/
    Yandex/MyMemory) → whatever's chosen in Settings. Confirmed live: "Ok.
    Хорошо" + follow-up confirmation that both Original and Translation
    (stage 2, PR #114 — stage 1 only covered Translation) now behave this
    way correctly.
- **#96 — MyMemory Translation**, fully shipped (PR #115), a 5th provider
  and the simplest integration yet: `api.mymemory.translated.net` is a
  real, documented public API (not reverse-engineered) — plain `fetch`,
  no curl/TLS workaround needed, no signup.
  - Every language code this app uses (including `zh`, unlike Bing)
    matches MyMemory's own directly. `auto` maps to MyMemory's
    `autodetect` sentinel. The free tier's 500-char limit is checked
    client-side (confirmed live: MyMemory returns a clean error message
    for an over-limit request, not silent truncation). Error responses
    are HTTP 200 with the failure embedded in the body, and
    `responseStatus` is a *string* on error but a *number* on success —
    confirmed live, handled explicitly.
  - **Ships off by default**: its translation-memory-based answers are
    "generally strong for common EU pairs, more inconsistent for others"
    per the issue — and this session's own `check-providers` run
    demonstrated that caveat directly and unprompted: the top match for
    "Hello, world!" → German was the English text itself. Confirmed
    working live by the project owner, with the expected limitations
    noted and accepted ("Есть ограничения на автоматическое использование
    языков. В целом устраивает").
- **#117 — source-word gender article**, fully shipped (PR #118), reported
  live via screenshot: German "Einschränkungen" → Russian showed no
  gender/article at all. Not a regression — #76's `genderArticle` only
  ever computed an article for the *translated* word, gated on the target
  using articles (de/fr/es/it/pt/nl); Russian isn't one, so nothing fired,
  but the *source* word being German (regardless of target) was never
  accounted for.
  - `google.ts` now also computes `sourceGenderArticle`, reusing
    `findTranslationGender(word, lang, skipCache)` unchanged — that
    function only ever cared about a (word, lang) pair, not which "side"
    it came from. Verified live end-to-end with the exact reported word
    (`Einschränkung` → gloss "Limitation" → dict entry `previous_word:
    "die"`) before writing any test fixtures.
  - New badge next to "Original", mirroring the existing one next to
    "Translation" (`renderGenderBadge` now takes the target element as a
    parameter). Confirmed working live by the project owner ("Отлично").
- **#119 — Bing dictionary breakdown**, fully shipped (PR #120), requested
  live: "надо проверить возможность создания dictionary через Bing. Если
  это возможно, тогда надо завести задачу и итоже начать исполнение."
  - No prior art to port — unlike Google/Reverso/AI/CSV, ahatem/QTranslate
    has no `BingDictionaryService.kt`. Found instead by opening
    bing.com/translator in a real browser and watching its own network
    traffic while looking up a single word: it fires `tlookupv3` (the
    dictionary panel) alongside `ttranslatev3`, on the same shared auth.
  - `providers/bingDictionary.ts` parses `tlookupv3`'s response
    (POS-tagged, confidence-ranked candidates with back-translations) into
    the existing `GoogleDictionary` shape, so the popup's rendering code
    needed zero changes. `bingTranslate.ts` fetches it best-effort after a
    successful single-word, non-lightweight translate — a lookup failure
    never fails the translation itself.
  - **One confirmed real gap**: `prefixWord` (Bing's equivalent of
    Google's `previous_word`, the field #76/#117's gender display is
    built on) came back empty for every word tested live (house,
    restriction, bridge, run) — Bing's dictionary API just doesn't appear
    to carry grammatical gender. Read defensively in case it's ever
    populated, but the Bing tab isn't expected to show a gender badge.
  - **Live-tested bug found and fixed same session**: German → Russian's
    "Show Dictionary" made the button silently vanish with nothing shown
    (confirmed live via curl: Bing's `tlookupv3` genuinely has no data
    for that pair — `{"statusCode":400}` — a real Bing limitation, not a
    parsing bug). The UI bug was separate: `dictionaryStatus` went
    straight to 'loaded' regardless of whether anything came back.
    `renderDictionary()` now takes an `attempted` flag and shows "No
    dictionary data available for this word or language pair." instead of
    silently hiding. Confirmed fixed live by the project owner.
- **#108 — Reverso deprioritized**, at the project owner's explicit
  request (2026-09-01) — moved from the v0.2 to the **v0.4** milestone,
  no code changes.
- **#116 — font size and font family selection**, fully shipped (PR
  #121) — filed and implemented the same session, the project owner's
  explicit next priority ahead of the rest of Appearance ("Меня больше
  интересует настройка размеров шрифтов и возможно выбор шрифтов").
  - New Appearance tab in Settings: a font-size slider (10-24px) and a
    font-family dropdown (a curated list of Windows-bundled fonts —
    System Default, Arial, Calibri, Verdana, Tahoma, Georgia, Times New
    Roman, Consolas), with a live preview.
  - Deliberately scoped to only the popup's Original/Translation/Back-
    translation text (`.text-block`), via two CSS custom properties set
    once at popup init — the surrounding UI chrome (tabs, buttons,
    labels) keeps its own fixed sizes, avoiding any risk of accidentally
    restyling controls that should stay put.
  - **This is the first feature shipped during the 2026-09-01 autonomous
    stretch** (project owner away, no hands-on testing available — see
    "How to resume" below). Verified instead via a stubbed-`electronAPI`
    browser preview of the *real built* `settings.js`/`popup.js`/CSS,
    served from the actual `dist` output over a local static server
    (not hand-copied markup) — confirmed the Appearance tab renders and
    switches correctly, the live preview updates on slider/dropdown
    change, Save sends the right payload, and — the important check —
    the popup's Original text area's *computed* style actually matches
    a non-default setting (18px Georgia) end to end, not just that a
    CSS variable got set. Still flagged as not hands-on-tested in the
    real Electron app.

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
> v0.1 is fully shipped. v0.2's translation history, dictionary/gender
> data (Google #76 + source-side #117, Bing #119), text-to-speech —
> offline SAPI *and* cloud-neural (#12–#14, #89/#90/#93/#103/#107),
> five translation providers (DeepL/Yandex/Google/Bing #97/MyMemory #96),
> per-tab native cloud voice (#112), font size/family (#116), and the
> request-volume/reliability fixes (#94) are all done and merged.
>
> **2026-09-01: the project owner stepped away for an unknown period and
> explicitly asked for autonomous work to continue in their absence**
> ("Я сейчас уйду на какое-то время. Интерактива не будет. Работай
> автономно над всеми задачами... Обновляй документацию по мере
> выполнения каждой задачи."). This session's own mandatory
> interactive-verification workflow (see the Notes below) **cannot run
> hands-on checks during this stretch** — there's no one to click Test or
> confirm audio output. Substitute, proven out on #116 already: build +
> typecheck + unit tests + (for renderer-only changes) a stubbed-
> `electronAPI` browser preview of the *real built* JS/CSS served over a
> local static HTTP server (not `file://` — static snapshots there don't
> execute JS — and not hand-copied markup), checking *computed* styles/
> values end to end rather than just that a variable got set. Merge once
> CI is green per the usual autonomous PR workflow, and note plainly in
> both the PR and here whenever something genuinely needs a real
> hands-on check (audio, hotkey capture, OS-level focus/input) that
> hasn't happened yet — don't claim it's confirmed when it isn't.
>
> **Immediate next step:** work through the rest of the backlog
> autonomously, in this rough order:
>
> 1. **Rest of Appearance (#17–20)** — window opacity, auto-position/
>    auto-size refinement, border thickness/color, pin-when-dragged.
> 2. **Advanced settings (#25–29)** — mouse interaction modes, OCR API
>    key, configurable copy action, default browser.
> 3. **#109 (resilience patterns)** — proactive rate-limiting,
>    dual-endpoint fallback, official-key-first-with-free-fallback —
>    hardening, not urgent, no current complaint driving it.
> 4. **#75 (Yandex)** — try the free Mozhi-fallback route (see the
>    issue's newest comment) before defaulting to "needs a paid API key".
> 5. **#108 (Reverso)** — explicitly deprioritized by the project owner
>    this session and moved to the **v0.4** milestone; leave it there
>    unless re-prioritized.
>
> Same process as every prior session: issue already exists (or file one) →
> branch → PR → CI → merge, one sub-issue at a time. Handle the routine
> engineering workflow (branch/PR/merge, implementation choices, splitting
> mixed changes into separate PRs, project-board status) autonomously
> without checking in — only surface things that need hands-on interaction
> with the running app, or a genuine product/cost decision the spec
> doesn't answer (e.g. #75's eventual choice, if a real tradeoff comes up)
> — and while the project owner is away, note those rather than blocking.

### Notes for whoever picks this up

- **Mandatory interactive-verification workflow (standing instruction,
  not optional whenever the project owner IS available)**: after any UI/
  OS-facing change, don't just describe what was done in text — either
  (a) build a fresh installer and send it, or (b) launch the app for the
  user to test themselves. And do (b) *first*: launch in a separate,
  visible terminal window (e.g. via PowerShell's `Start-Process cmd.exe
  -ArgumentList '/k','cd /d <path> && npm run dev'` — not a hidden Bash
  background job) for a quick interactive check, wait for approval,
  *then* run the (slower) `npm run package` build. See
  [[feedback-autonomous-workflow]] in memory for the exact wording and
  reasoning — this is a durable preference, don't re-ask about it. **The
  one exception**: the 2026-09-01 autonomous stretch above, where no one
  is available to run it — substitute build+typecheck+tests and say so
  explicitly rather than silently skipping the step or claiming it ran.
- If `check-providers` shows Google 429ing, don't chase it — treat it the
  same way past sessions have: a real but temporary upstream limit from
  testing volume, not a bug. Move on and check back later.
- The two long-standing non-blocking environment issues (Google's
  temporary rate limit already covered above, and `npm run package`'s NSIS
  step needing Developer Mode on this machine, worked around via the
  winCodeSign cache trick documented above) are unrelated to CI and don't
  need attention unless a local installer build is actually needed.
- For UI/OS-integration work (popup UI, audio, hotkey/capture), prefer
  building+running the app for real over trusting typecheck+tests alone —
  IPC bugs, path-resolution bugs, and OS-level input/audio/focus quirks
  don't show up in typecheck or mocked unit tests. A stubbed-`electronAPI`
  browser preview of the real bundled JS/CSS is good for verifying UI
  logic and layout, but real audio output and the actual hotkey-driven
  capture flow need the real app, per the mandatory-verification note
  above (or the project owner's own testing, if they're away).
  - **How to actually do the stubbed preview** (used successfully for
    #116): write a throwaway `preview.html` into `dist/renderer/<window>/`
    (gitignored, safe to leave) with an inline `<script>` that sets
    `window.electronAPI` to a stub object *before* the real
    `<script type="module" src="....js">` tag, copying the target
    window's real `index.html` body verbatim underneath. Then serve
    `dist/renderer/` (not the window's own subfolder — sibling imports
    like `../shared/fonts.js` need the parent directory as web root) over
    a plain local HTTP server and navigate the Browser tool there.
    **`file://` doesn't work** — a file outside the project root renders
    as a static snapshot with no JS execution, so nothing (tabs, live
    previews, event listeners) will actually respond; the error only
    shows up as "nothing happens when I click", not an explicit warning.
    Verify with `getComputedStyle(...)`/DOM state via `javascript_tool`,
    not just a screenshot — a screenshot can look right by coincidence
    (or miss something off-screen) where reading the actual computed
    value can't.
- When comparing against or citing another project (e.g. the ahatem/
  QTranslate research behind #107/#97/#119), read its actual source
  before asserting what it does — READMEs oversell; the real answer was
  in `plugins/*/src/main/kotlin/**/*.kt` each time, and for #119
  specifically (no Kotlin source existed at all) live network-traffic
  inspection of the real site found the actual endpoint.
- Several endpoint/auth shapes this session (#107's Bing TTS auth scrape,
  #97's translate auth, #119's `tlookupv3`) were discovered or confirmed
  by opening the real site in the Browser tool and reading its own
  network requests/response bodies live, not just by reading QTranslate's
  Kotlin source or guessing — worth doing again for any new unofficial
  endpoint rather than assuming the Kotlin source alone is enough (it
  wasn't, for Bing's TTS auth flow — the source needed the exact request
  shape confirmed live before it actually worked).
