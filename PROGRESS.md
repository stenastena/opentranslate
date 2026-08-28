# Progress

This file is the durable, cross-session checkpoint for OpenTranslate. Read it
first in any new session, then reconcile it against the actual state of
[Issues](https://github.com/stenastena/opentranslate/issues) and the
[project board](https://github.com/stenastena/opentranslate/projects) —
GitHub is the source of truth if the two ever disagree.

## Current milestone

**v0.1 (MVP)** — in progress.

GitHub setup for the whole roadmap (labels, milestones v0.1–1.0, project
board with Backlog/Todo/In Progress/In Review/Done columns, issue templates)
is complete. All v0.1 work is tracked as issues #1, #35–#56 (several are
parent issues with GitHub sub-issues). Backlog for v0.2–1.0 is tracked as
issues #8–#34.

## Last completed

- Issue #1 (+ sub-issues #2–#6): project scaffolding — package.json,
  TypeScript config, Vitest, electron-builder NSIS config, CI workflow,
  issue templates, CONTRIBUTING.md. Merged via PR #7, CI green.

## Next planned step

Issue #35 — `TranslationProvider` interface, registry and error-isolation
infra (`src/main/providers/types.ts`, `src/main/providers/registry.ts`).
This is the shared foundation the three adapter issues (#36 DeepL, #37
Yandex, #38 Google) build on.

## Known blockers / needs-decision

None currently open.

## How to resume

```bash
git checkout main && git pull
gh issue list --milestone v0.1 --state open
```

Pick the next open v0.1 issue (roughly in the order they're numbered —
providers → settings persistence/IPC → tray/hotkey/capture → popup UI →
settings UI → docs finalization), branch from `main`, implement, verify
locally (`npm run typecheck && npm test && npm run build`), open a PR that
closes the issue, wait for CI, merge, update this file.
