# Changelog

All notable changes to this project are documented here. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/), versioning follows
[SemVer](https://semver.org/).

## [Unreleased]

Nothing yet — see the [v0.2 milestone](../../milestone/2) for what's next
(translation history, TTS).

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
