# OpenTranslate

**Status: v0.1 (MVP) implemented, not yet released/packaged for end users.**

OpenTranslate is a Windows desktop application that brings back the core
workflow of the abandoned [QTranslate](https://quest-app.appspot.com/) project:
it sits in the system tray, and on a global hotkey it captures the currently
selected text in *any* Windows application and shows a popup with a
translation, a back-translation, and quick access to multiple translation
services.

## What works today (v0.1)

- Tray icon with an Open Settings / Exit menu.
- Global hotkey (default <code>Ctrl+&#96;</code>, rebindable in Settings)
  that captures the selected text in whichever window has focus, via an
  emulated Ctrl+C and the clipboard — the clipboard's prior contents are
  always restored afterward.
- A popup at the cursor showing Original / Translation / Back-translation,
  with one tab per translation service — DeepL, Yandex Translate, Google
  Translate — so a broken or rate-limited service only shows an error in
  its own tab.
- Auto-Detect (using a configurable first/second language pair) or manual
  source/target language selection, with a swap button.
- A Settings window (Hotkeys / Languages / Services tabs).

See [PROGRESS.md](PROGRESS.md) for exactly which issues/PRs implemented
each piece, and the GitHub [milestones](../../milestones) /
[project board](../../projects) for the full roadmap (v0.2 onward).

## ⚠️ Unofficial endpoints — use at your own risk

Translation providers (DeepL, Yandex Translate, Google Translate) are called
through their **unofficial, reverse-engineered web endpoints** — no API keys
are required, but these endpoints are not a supported public API. The
provider that owns the service can change its format or block this traffic
at any time without notice, which can break an adapter with no warning. This
is precisely why the adapter architecture (see
[CONTRIBUTING.md](CONTRIBUTING.md)) isolates every provider so a breakage in
one never affects the others or crashes the app.

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
