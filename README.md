# OpenTranslate

**Status: in development (pre-v0.1, not yet usable).**

OpenTranslate is a Windows desktop application that brings back the core
workflow of the abandoned [QTranslate](https://quest-app.appspot.com/) project:
it sits in the system tray, and on a global hotkey it captures the currently
selected text in *any* Windows application and shows a popup with a
translation, a back-translation, and quick access to multiple translation
services.

Project setup, GitHub workflow, and full documentation are being built out
incrementally — see [PROGRESS.md](PROGRESS.md) for the current state and the
GitHub [milestones](../../milestones) / [project board](../../projects) for
detailed task tracking.

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

## License

MIT — see [LICENSE](LICENSE).
