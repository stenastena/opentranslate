# Changelog

All notable changes to this project are documented here. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/), versioning follows
[SemVer](https://semver.org/).

## [Unreleased]

### Added
- The popup's position/size now survives app restarts, not just captures
  within one running session (#151).

### Security
- Stopped logging the actual captured/translated text (potentially
  sensitive clipboard content) to the console in two spots — the hotkey
  capture handler and Google's request-failure log now record only the
  text length. Found in a one-time security audit (#150); see
  PROGRESS.md for the full pass (Electron config, XSS surface, secrets,
  dependency audit, clipboard handling).

## [0.2.0] - 2026-09-01

Real-machine testing after the 0.1.0 tag found the app didn't fully work
in practice; these fix it. See [PROGRESS.md](PROGRESS.md) for the full
root-cause writeups.

### Added
- Translation history: past translations are recorded automatically and
  browsable in a new History window (provider, languages, timestamp,
  original/translated text), with "Clear All" and per-entry delete. Reachable
  from the tray and from a new File menu on the popup window (#8/#9/#10/#11).
- Google Translate now shows a dictionary breakdown for single-word
  lookups — parts of speech, synonyms, definitions, examples, and
  alternative translations — plus definite-article/gender annotations
  for German/French noun translations, both inline in the dictionary and
  as a badge on the primary translation (#76). DeepL/Yandex have no
  equivalent capability. Google's own dictionary data can occasionally be
  wrong (a confirmed real-world example is documented in code) — that's
  upstream data quality, not a parsing bug.
- A real application menu on the popup window (File: Settings/History/
  Exit, Edit: standard text-editing roles), replacing Electron's
  unconfigured default File/Edit/View/Window/Help (#10 follow-up).
- An explicit "Auto" target-language option (now the default), resolved
  per capture from the Languages-settings pair based on the detected/
  selected source (#84).
- Text-to-speech: a `TTSProvider` abstraction with a first implementation
  using Windows' built-in SAPI voices (offline, no unofficial endpoint),
  plus a speaker-icon button next to the Original and Translation sections
  in the popup (#12/#13/#14). Only one utterance plays at a time.
- Settings → Voice: pick a specific installed system voice per language,
  with a Test button, a "Refresh voice list" button, an info box pointing
  at the free/open-source NaturalVoiceSAPIAdapter project for
  higher-quality voices, and a best-effort "★ Natural" label on voices
  whose name/description suggests better quality (#89/#90).
- Popup: an editable "Detected: X" language select next to Original lets
  a wrong Auto-Detect pick be corrected without leaving Auto-Detect mode;
  an equivalent select on Translation for the resolved target language;
  Back-translation's own language select is independently editable too —
  all three now share identical styling (#98/#102).
- Google's dictionary/gender-article data is now fetched only when the
  user clicks a new "Show Dictionary" button, not automatically with
  every lookup (#99).
- Cloud-based, neural text-to-speech: `googleCloudTtsProvider` (Google
  Translate's own `translate_tts` endpoint) and `bingCloudTtsProvider`
  (Bing's `tfettts` endpoint, real Azure neural voices, e.g.
  "de-DE-KatjaNeural") alongside the existing offline SAPI voices. A new
  Voice-source setting in Settings → Voice picks which one Speak actually
  uses — defaults to Bing Neural, the direct fix for the recurring
  "voice quality isn't dramatically better" feedback (#93) — with a
  Test button, and any cloud request that fails automatically falls back
  to a system voice for that one call so Speak never goes fully silent
  (#107).
- **Microsoft Translator**, via the same unofficial `ttranslatev3`
  endpoint bing.com/translator's own UI calls — a 4th translation
  provider tab, sidestepping the official Azure API's real blocker (a
  non-prepaid card required even to stay on the free tier) entirely
  (#97).
- Google and Bing translation tabs now speak Original/Translation with
  that provider's *own* native cloud voice, regardless of the
  Voice-source setting — every other provider tab (DeepL/Yandex/
  MyMemory) still follows whatever's selected in Settings (#112).
- **MyMemory Translation**, a 5th provider — a real, documented public
  API (not reverse-engineered), free and anonymous with no signup. Ships
  off by default: its translation-memory-based answers are strong for
  common language pairs but can occasionally surface a low-quality
  stored match ahead of a better one, confirmed live during testing
  (#96).
- The definite-article/gender badge (der/die/das, le/la — see #76) now
  also computes for the *source* word, not just the translated one —
  translating a German/French/etc. word into a language with no
  articles of its own (e.g. Russian) previously showed no gender at all
  even though the source word has one (#117).
- Bing dictionary breakdown, via the unofficial `tlookupv3` endpoint
  behind Bing Translator's own dictionary panel — parts of speech,
  confidence-ranked translation candidates, and back-translations as a
  synonyms equivalent, parsed into the same shape Google's dictionary
  uses. "Show Dictionary" is now available on the Bing tab too. Unlike
  Google's data, Bing's dictionary API doesn't appear to expose
  grammatical gender at all — confirmed empty across every word tested
  live, so the Bing tab isn't expected to show a gender badge (#119).
- Settings → Appearance: font size (10-24px, via a slider) and font
  family (a curated list of Windows-bundled fonts) for the popup's
  Original/Translation/Back-translation text specifically, with a live
  preview — the surrounding UI chrome (tabs, buttons, labels) keeps its
  own fixed sizes regardless (#116).
- Settings → Appearance: a popup window opacity slider (30-100%), a real
  window-transparency effect applied via Electron's native `opacity`
  option (#17).
- Settings → Appearance: theme selection — Light, Dark (two hand-tuned
  palettes), and Custom (pick 3 colors — background, text, accent — and
  every other shade is derived automatically via CSS `color-mix()`),
  with a live preview (#16).
- Settings → Advanced (new tab): an opt-in "after translating, also copy
  to clipboard" action (Nothing / Original text / Translated text),
  independent of the existing hotkey-capture clipboard-restore behavior
  (#27).
- A small copy icon next to each of the popup's Original/Translation/
  Back-translation fields, for a one-off copy independent of the
  Advanced "auto-copy after translating" setting above (#128).
- A ↻ button next to Translate that forces a fresh, non-cached
  re-translation for the active provider tab — for when a bad cached
  result would otherwise just repeat on retry (#130).
- Show Dictionary now auto-grows the popup window's height (never its
  width) to fit the revealed content instead of clipping it, capped to
  the display's work area (#134).
- Settings → Advanced: "Start OpenTranslate when Windows starts",
  backed by Electron's `app.setLoginItemSettings` and applied
  immediately on save, no restart needed (#136).
- Settings → Services: "Default provider" — picks which provider tab the
  popup opens with, instead of always the first enabled provider in the
  fixed DeepL > Google > Bing > MyMemory order; falls back to that same
  behavior when left on Auto or when the chosen provider is disabled
  (#141).
- A small 🔄 badge on a provider's tab when its result came from a
  degraded fallback source instead of its primary one (currently only
  Google's #109 dual-endpoint fallback) — makes an otherwise-unexplained
  empty dictionary read as "temporarily on a backup source" (#143).
- The popup's source/target language dropdowns are now remembered across
  captures and app restarts instead of always resetting to Auto/Auto
  (#147).

### Performance / Resilience
- Translation latency (#135): the popup no longer waits for the
  back-translation round trip before showing the primary translation —
  it renders the moment it's ready, with back-translation filling in a
  beat later, roughly halving perceived latency on every lookup for
  every provider. Google's primary endpoint also gets a much shorter
  retry budget before falling over to its #109 fallback, instead of
  retrying the same already-failing endpoint with the full default
  policy — cut per-call latency from ~4.7s to ~1.7-2s during a live
  sustained rate-limit. `detectLanguage()` (itself a full extra
  translate-call round trip for every provider) is also now skipped
  whenever a real translate call is about to happen anyway with
  `sourceLang:'auto'` and a fixed (non-Auto) target — the detected
  language comes back for free in that same response instead. This is
  exactly why "forward" translation reliably measured slower than
  back-translation before: live-measured (Bing, "Haus" de->ru) at ~5.2s
  before, ~1.9s after.
- Proactive request pacing (not just reactive backoff): Yandex requests
  are now spaced at least 750ms apart, Google 300ms — before ever
  hitting a rate limit, complementing the existing retry-after-429
  behavior (#109).
- Google gained a second, independent unofficial endpoint
  (`clients5.google.com`) it falls back to if the primary one fails —
  a degraded (translation only, no dictionary/gender data) result
  instead of a hard error during an outage (#109).

### Fixed
- Capture reliability: the first several hotkey presses after launch
  could produce an empty capture (#67).
- The global hotkey stopped firing any capture after a Windows
  input-language switch (RU/EN or otherwise) — root-caused to nut-js's
  Ctrl+C emulation, not hotkey registration; replaced with a direct
  `SendInput` call using hardware scan codes (#68).
- DeepL and Google translation requests failed with HTTP 429 on a real
  (non-sandboxed) network — DeepL needed its newer unauthenticated
  "oneshot" endpoint, Google needed requests routed through curl instead
  of Node's `fetch` to avoid a TLS/HTTP2 fingerprint check (#70). Yandex
  remains blocked by a real CAPTCHA wall and needs a paid official API
  key to work again (#75, backlog).
- The target language could silently end up equal to the source language
  (e.g. Russian → Russian) when auto-detection happened to match a fixed
  default target — see the new Auto target-language option above (#84).
- Google's dictionary parsing crashed on multi-sentence input where a
  whitespace-only segment omitted an expected field entirely (#81).
- The popup was invisible to Alt+Tab after switching away from it —
  `skipTaskbar` also hides a window from Alt+Tab on Windows (#81).
- Voice listing under-reported installed system voices (e.g. 5 instead
  of 17 on the real dev machine) — Windows PowerShell 5.1's
  `System.Speech` can't see voices registered under the newer "OneCore"
  location. Now prefers `pwsh.exe` (PowerShell 7) when installed, which
  can see and actually speak through them (#103).
- The tray only offered Settings/History (already reachable from the
  popup's own File menu); simplified to just opening the main window,
  and the hotkey now opens it even when nothing was selected, instead of
  silently doing nothing (#101).
- Settings' Voice-source Test button awaited the cloud provider's
  response but never actually played it, staying silent for Google/Bing
  while the per-language system-voice Test buttons worked fine (#107
  follow-up, found via live testing).
- "Show Dictionary" could complete with nothing to show (e.g. Bing's
  dictionary endpoint has no data for German→Russian even though it does
  for German→English) and just make the button vanish with no
  explanation — now shows "No dictionary data available for this word or
  language pair." instead (#119 follow-up, found via live testing).
- A fresh popup opened near a screen edge got clamped in place, sliding
  it back so its edge touched the screen edge — covering the very
  selection/cursor it was opened from. Now flips to the opposite side of
  the cursor first, only clamping if even the flipped position doesn't
  fit (#18).

### Changed
- Popup window: closes only on Esc instead of on losing focus, is a real
  movable/resizable native-frame window instead of a fixed frameless one,
  remembers its last position/size, and has editable Original/Translation
  fields with an explicit Translate button for re-translating after an
  edit (#69).
- License switched from MIT to Apache License 2.0, with a NOTICE file so
  attribution is preserved in derivative works even from a plain-copy
  fork (#79).
- Settings window is now resizable (in addition to, not instead of, its
  existing scrollbar) (#127).
- Removed the popup opacity setting entirely — reverts #17 (#131).
- Removed Yandex from the app (the Services checkbox and the popup's
  provider tabs) since its endpoint has remained permanently blocked
  since #70 with no working free route (#75); the provider code itself
  is kept, unregistered, in case that ever changes (#132).
- Resizing the popup window now grows the Original/Translation/
  Back-translation fields symmetrically instead of leaving dead space
  below them; Show Dictionary and the dictionary panel are never
  clipped by the window edge as the fields grow (#133).

### Performance
- Cut Google request volume: the popup's back-translation call no longer
  redundantly repeats the dictionary/gender-article lookup the forward
  translation already did, which could add up to 6 requests per
  single-word lookup for no UI benefit (#78).
- Google was hitting 429 under light real usage — a single-word lookup
  into an article-using language could cost up to 3 requests via the
  gender-pivot fallback, with no caching so repeat views paid that cost
  again every time. `curlGet` now retries a 429/503 with jittered
  backoff; every Google request is cached by URL (5-minute TTL); 4 unused
  `dt=` request params were trimmed (#94). Making the dictionary/gender
  lookup opt-in (#99, above) cut the default per-lookup cost further,
  from up to 3 requests to at most 1.

See the [Backlog milestone](../../milestone/7) for what's next — all
not-yet-scheduled work (Reverso as a 4th provider, remaining Appearance
polish, Advanced settings, 1.0 stabilization/parity/docs) now lives there
in one place instead of spread across several version milestones.

## [0.1.0] - 2026-08-28

Initial MVP. See [PROGRESS.md](PROGRESS.md) for the full list of issues/PRs.

### Added
- Project scaffolding: TypeScript build (main/preload vs. renderer),
  Vitest, electron-builder Windows (NSIS) packaging config, GitHub Actions
  CI, issue templates, CONTRIBUTING.md.
- `TranslationProvider` interface and a registry that isolates each
  provider behind a try/catch boundary, with per-provider last-success
  timestamp tracking and raw-response logging on parse failure.
- DeepL, Yandex Translate and Google Translate adapters against their
  unofficial (no API key) endpoints, each with mocked-fetch unit tests.
- `npm run check-providers` health-check script.
- JSON-file settings persistence and contextBridge/ipcMain IPC scaffolding.
- Tray icon (Open Settings / Exit), global capture hotkey (default
  <code>Ctrl+&#96;</code>), and clipboard-based text capture that restores
  the clipboard's original contents.
- Popup translation window: Original / Translation / Back-translation
  sections, per-provider tabs with isolated error display, Auto-Detect
  (first/second language heuristic) plus manual language selection with
  swap, auto-sizing, close on blur/Esc.
- Settings window: Hotkeys, Languages, and Services tabs.
