# Changelog

All notable changes to this project are documented here. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/), versioning follows
[SemVer](https://semver.org/).

## [Unreleased]

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

### Changed
- Popup window: closes only on Esc instead of on losing focus, is a real
  movable/resizable native-frame window instead of a fixed frameless one,
  remembers its last position/size, and has editable Original/Translation
  fields with an explicit Translate button for re-translating after an
  edit (#69).
- License switched from MIT to Apache License 2.0, with a NOTICE file so
  attribution is preserved in derivative works even from a plain-copy
  fork (#79).

### Performance
- Cut Google request volume: the popup's back-translation call no longer
  redundantly repeats the dictionary/gender-article lookup the forward
  translation already did, which could add up to 6 requests per
  single-word lookup for no UI benefit (#78).

See the [v0.2 milestone](../../milestone/2) for what's next (TTS).

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
