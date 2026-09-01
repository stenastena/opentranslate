# OpenTranslate

[![Release](https://img.shields.io/github/v/release/stenastena/opentranslate?label=release)](https://github.com/stenastena/opentranslate/releases/latest)
[![CI](https://github.com/stenastena/opentranslate/actions/workflows/ci.yml/badge.svg)](https://github.com/stenastena/opentranslate/actions/workflows/ci.yml)
[![Security audit](https://img.shields.io/badge/security%20audit-passed-brightgreen)](https://github.com/stenastena/opentranslate/issues/150)
[![Platform](https://img.shields.io/badge/platform-Windows-0078D6)](https://github.com/stenastena/opentranslate/releases/latest)
[![License](https://img.shields.io/github/license/stenastena/opentranslate)](LICENSE)

**Status: v0.2.1 released — [download the installer](../../releases/latest).**

OpenTranslate is a Windows desktop application that brings back the core
workflow of the abandoned [QTranslate](https://quest-app.appspot.com/) project:
it sits in the system tray, and on a global hotkey it captures the currently
selected text in *any* Windows application and shows a popup with a
translation, a back-translation, and quick access to multiple translation
services.

## Install

Download the latest installer from the [Releases page](../../releases/latest)
and run it (Windows only). See [Development](#development) below to build
from source instead.

## What works today

- Tray icon; the global hotkey (default <code>Ctrl+&#96;</code>, rebindable
  in Settings) opens the main popup even with nothing selected.
- Global hotkey capture of the selected text in whichever window has focus,
  via an emulated Ctrl+C and the clipboard — the clipboard's prior contents
  are always restored afterward.
- A popup showing Original / Translation / Back-translation, with one tab
  per translation service — **DeepL, Google Translate,
  Microsoft Translator (Bing), MyMemory** — so a broken or rate-limited
  service only shows an error in its own tab. Auto-Detect (using a
  configurable first/second language pair) or manual source/target language
  selection, with a swap button, and an editable "Detected: X" correction
  when Auto-Detect gets it wrong.
- **Dictionary breakdown** (Google and Bing tabs, single words, opt-in via a
  "Show Dictionary" button): parts of speech, synonyms, definitions/
  back-translations, and — for Google specifically — definite-article/
  gender annotations (der/die/das, le/la) for *both* the source and the
  translated word, independently of which one is which language.
- **Text-to-speech**, on both Original and Translation: a choice of voice
  source in Settings — cloud (Bing neural voices, the default; or Google) or
  offline system SAPI voices, with automatic fallback to a system voice if
  a cloud request fails. Google/Bing translation tabs speak with that same
  provider's own native voice regardless of the Settings choice; every other
  provider's tab uses whichever source is selected in Settings.
- Translation history, browsable in its own window, reachable from the tray
  and the popup's File menu.
- A Settings window (Hotkeys / Languages / Services / Voice tabs).

See [PROGRESS.md](PROGRESS.md) for exactly which issues/PRs implemented
each piece, [CHANGELOG.md](CHANGELOG.md) for a chronological summary, and
the GitHub [milestones](../../milestones) / [project board](../../projects)
for the full roadmap.

## ⚠️ Unofficial endpoints — use at your own risk

Every translation provider (DeepL, Google Translate, Bing/Microsoft
Translator, MyMemory) and every cloud text-to-speech voice
(Google, Bing) is called through an **unofficial, reverse-engineered web
endpoint** — no API keys are required for any of them (MyMemory is the one
exception that's also a real *documented* public API), but none of this is
a supported public contract. The provider that owns the service can change
its format or block this traffic at any time without notice, which can
break an adapter with no warning. This is precisely why the adapter
architecture (see [CONTRIBUTING.md](CONTRIBUTING.md)) isolates every
provider so a breakage in one never affects the others or crashes the app.

## Development

Requirements: Node.js LTS, npm, Windows (target platform for the packaged
app; core development also works cross-platform except for the
tray/hotkey/clipboard-capture pieces which are Windows-specific).

```bash
npm install
npm run dev
```

Run the unit tests:

```bash
npm test
```

Check whether the translation provider adapters are currently working
against the live services (useful when a provider breaks):

```bash
npm run check-providers
```

Build a distributable Windows installer:

```bash
npm run package
```

## Author

Created and maintained by [Sergey Osherov](https://github.com/stenastena).

## License

Apache License 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
