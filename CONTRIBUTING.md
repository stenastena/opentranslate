# Contributing to OpenTranslate

## The adapter architecture, and why it matters here

Every translation service — and every cloud text-to-speech voice — is
called through an **unofficial, reverse-engineered endpoint** — there is no
API key, and no contract with the provider (MyMemory is the sole exception:
a real, documented public API, still adapter-isolated the same way). The
provider can change its response format, rate-limit, or block the request
entirely, at any time, with no notice. When that happens, **only that one
adapter should break** — the rest of the app, and every other provider,
must keep working.

That constraint drives the design:

- All translation providers implement one interface, [`TranslationProvider`](src/main/providers/types.ts):
  `translate()`, `detectLanguage()`, `isHealthy()`. All TTS voice sources
  implement [`TTSProvider`](src/main/tts/types.ts): `speak()`, `stop()`,
  `isHealthy()`, `listVoices()`.
- Each adapter lives in its own file under `src/main/providers/` (or
  `src/main/tts/` for a voice source) and owns all the request-building/
  response-parsing logic for that one service. Nothing outside the adapter
  should know how a given provider's endpoint works.
- The provider registry (`src/main/providers/registry.ts`) calls each
  translation adapter through a try/catch boundary. An adapter that throws
  produces a per-tab error in the popup UI — it never crashes the app or
  blocks the other tabs. TTS isolation works the same way but one level up:
  the IPC handler (`src/main/ipc/handlers.ts`) falls back to the offline
  system voice for that one request if the selected cloud voice source
  throws, so a network hiccup never leaves Speak silent.
- When an adapter fails to parse a response, it logs the **raw response
  body** before throwing, so a broken provider can be diagnosed from the
  logs alone, without attaching a debugger.
- Each translation adapter tracks the timestamp of its last successful
  call, surfaced in Settings → Services, so you can see at a glance which
  provider has gone stale.
- A provider *can* also populate `TranslationResult.dictionary`
  (`genderArticle`/`sourceGenderArticle` too) if its service has an
  equivalent — see `src/main/providers/googleDictionary.ts` and
  `bingDictionary.ts` for two different raw shapes parsed into the same
  provider-agnostic `GoogleDictionary` type (named after its first source;
  the shape isn't Google-specific). This is optional — DeepL/Yandex/
  MyMemory have no dictionary data and simply never set the field.

## Fixing a broken provider

This is the most common contribution to this repo. When a provider adapter
breaks (the service changed its endpoint or response shape):

1. Reproduce it: `npm run check-providers` runs every adapter against a
   fixed test phrase and prints a pass/fail table — this is the fastest way
   to confirm which provider is broken without launching the full app.
2. Capture a raw response: temporarily log or breakpoint the adapter's HTTP
   call and inspect what the service actually returned. The adapter already
   logs the raw body on a parse failure — check the console output first.
3. Fix the request/response handling in that provider's file only. Avoid
   touching `types.ts` or the registry unless the shared interface itself
   is no longer sufficient.
4. Update or add unit tests in the adapter's `*.test.ts` file with mocked
   HTTP responses — one for the current success shape, and ideally one
   fixture capturing the old/broken shape you just fixed.
5. Open a PR using the "Add/Fix translation provider" issue template,
   referencing the issue it closes.

## Adding a new translation provider

1. Create `src/main/providers/<id>.ts` implementing `TranslationProvider`.
2. Register it in `src/main/providers/registry.ts`.
3. Add a settings toggle entry and a popup tab — see how the existing five
   providers (DeepL, Yandex, Google, Bing, MyMemory) are wired in
   `src/renderer/popup` and `src/main/settings/schema.ts`.
4. Add unit tests with mocked HTTP responses.

## Adding a new TTS voice source

1. Create `src/main/tts/<id>Provider.ts` implementing `TTSProvider`. A
   cloud provider's `speak()` returns `{ kind: 'audio', data, mimeType }`
   (the caller — the popup's `<audio>` element — plays the bytes); an
   offline provider that plays sound itself (like `systemProvider.ts`, via
   PowerShell/SAPI) returns `{ kind: 'played' }` once done.
2. Register it in the `ttsProviders` map built in `src/main/index.ts`, and
   as an option in `TTSProviderId` (`src/main/settings/schema.ts`).
3. Add it to the Voice-source `<select>` in
   `src/renderer/settings/index.html`.
4. Add unit tests with mocked HTTP/`execFile` calls, matching the pattern
   in `googleCloudProvider.test.ts` / `bingCloudProvider.test.ts`.

## General workflow

- One branch and one PR per issue; reference it with `Closes #N`.
- Keep commits small and scoped to one logical change.
- CI (typecheck + unit tests + build) must pass before merging.
- Run `npm run typecheck && npm test` locally before opening a PR.
