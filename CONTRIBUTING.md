# Contributing to OpenTranslate

## The adapter architecture, and why it matters here

Every translation service is called through **unofficial, reverse-engineered
endpoints** — there is no API key, and no contract with the provider. The
provider can change its response format, rate-limit, or block the request
entirely, at any time, with no notice. When that happens, **only that one
adapter should break** — the rest of the app, and every other provider,
must keep working.

That constraint drives the design:

- All providers implement one interface, [`TranslationProvider`](src/main/providers/types.ts):
  `translate()`, `detectLanguage()`, `isHealthy()`.
- Each adapter lives in its own file under `src/main/providers/` and owns
  all the request-building/response-parsing logic for that one service.
  Nothing outside the adapter should know how a given provider's endpoint
  works.
- The provider registry (`src/main/providers/registry.ts`) calls each
  adapter through a try/catch boundary. An adapter that throws produces a
  per-tab error in the popup UI — it never crashes the app or blocks the
  other tabs.
- When an adapter fails to parse a response, it logs the **raw response
  body** before throwing, so a broken provider can be diagnosed from the
  logs alone, without attaching a debugger.
- Each adapter tracks the timestamp of its last successful call, surfaced
  in Settings → Services, so you can see at a glance which provider has
  gone stale.

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

## Adding a new provider

1. Create `src/main/providers/<id>.ts` implementing `TranslationProvider`.
2. Register it in `src/main/providers/registry.ts`.
3. Add a settings toggle entry and a popup tab — see how the existing three
   providers are wired in `src/renderer/popup` and
   `src/main/settings/schema.ts`.
4. Add unit tests with mocked HTTP responses.

## General workflow

- One branch and one PR per issue; reference it with `Closes #N`.
- Keep commits small and scoped to one logical change.
- CI (typecheck + unit tests + build) must pass before merging.
- Run `npm run typecheck && npm test` locally before opening a PR.
