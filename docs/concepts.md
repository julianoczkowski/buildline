# Concepts

## Feature

Every change, from a one-line fix to a new product area, is a **feature**: a folder in `.buildline/features/<id>-<slug>/`.

| File | What | Who writes it |
|---|---|---|
| `feature.json` | status, type, owner, approvals, tasks, metrics, history | stations, CLI, dashboard |
| `spec.md` | the single source of truth for the change | PM, designer, engineer, agents |
| `progress.md` | append-only work log: what was done, verified, what's next | agents, every session |
| `evidence/` | screenshots and logs from verification | verifier |

### `spec.md` sections

`Brief` → `Requirements` (R1…) → `Acceptance` (A1…, Given/When/Then) → `Out of scope` → `Design` (`Experience`, `Technical`) → `Plan` → `Verification` → `Review`.

One file, not six. Aim for one screen; two screens means it's probably an epic.

### `feature.json` tasks

```json
{ "id": "T2", "title": "Save cart API", "covers": ["R1", "A2"],
  "verify": "POST /api/carts returns 201 with id", "passes": false, "notes": "" }
```

This follows the pattern Anthropic describes for long-running agents: a structured list where agents may only flip `passes`, plus a progress log, so any fresh session can resume from files and git rather than memory.

## Type

- **fix**: bug or small, well-understood change. Skips spec, design and plan; still needs a failing reproduction first and still gets verified.
- **feature**: the full pipeline.
- **epic**: specced, then split into child features (`--parent`).

## Stations

`spec → design → plan → build → verify → review → ship → done`. Each has a playbook in `.buildline/stations/`. See [stations.md](stations.md).

## Gates

Commands that must pass for any task to count as done, configured in `buildline.json`:

```json
"gates": [
  { "name": "lint", "command": "pnpm lint" },
  { "name": "typecheck", "command": "pnpm tsc --noEmit" },
  { "name": "test", "command": "pnpm test" },
  { "name": "e2e", "command": "pnpm playwright test", "required": false, "timeoutSeconds": 1200 }
]
```

`node .buildline/bin/gates.mjs` runs them, prints `ALL GATES PASSED` or `GATES FAILED: …`, and exits non-zero on failure. Agents, CI and humans run exactly the same thing.

## Approvals

Humans approve `spec`, `design` and `plan`, depending on the [autonomy level](autonomy.md). Approvals are recorded in `feature.json` with name and time, from Claude (only after an explicit "yes"), the dashboard, or `npx buildline approve <id> <stage>`. Agents are told never to record an approval on someone's behalf.

## Context

`.buildline/context/` is the factory's long-term memory: `product.md`, `architecture.md`, `design.md`. Specs describe one change; context describes the system. The ship station folds decisions from each spec back into context, which keeps the specs anchored to the code over time.

## Principles

`.buildline/principles.md` holds the short list of non-negotiables (product, design, engineering) that specs are critiqued against and diffs are reviewed against. It's yours; Buildline never overwrites it.
