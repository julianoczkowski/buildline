# Concepts

## Feature

Every change, from a one-line fix to a new product area, is a **feature**: a folder in `.buildline/features/<id>-<slug>/`.

| File | What | Who writes it |
|---|---|---|
| `feature.json` | status, type, owner, approvals, tasks, metrics, history | agents through `.buildline/bin/feature.mjs`, the CLI, the dashboard |
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

### How agents record progress

You never need to type these. The station playbooks tell the agent to run them, the same way it runs your tests:

```bash
node .buildline/bin/feature.mjs task 004 T2 pass --note "npm test -- carts: 12 passed"
node .buildline/bin/feature.mjs move 004 verify
node .buildline/bin/feature.mjs block 004 "Which currency should prices use?"
```

The script stamps the real time, keeps the history the board shows, counts reworks, and refuses a move that skips an approval your autonomy level requires. A Claude Code hook stops agents from editing `feature.json` by hand. When an agent needs a decision from you, it marks the feature **blocked** with the question before asking, so the board shows who is waiting on whom.

## Live sessions

Buildline's Claude Code hooks note which session is working on which feature and what it's doing right now, in `.buildline/sessions/` (git-ignored). `npx buildline watch` and the dashboard use them:

| You see | Meaning |
|---|---|
| **Working** (moving comet in `watch`) | a session is on it now, with its latest step, e.g. `Edit index.html · 3s ago`; `×2` when two sessions share it |
| **Needs you** | a session is waiting on you: it finished its turn with nothing left running, it asked you a question, or it needs your permission for a tool. The card shows what it said or asked |
| **Background** (turning clock in `watch`) | the session finished its turn but left work running, such as a CI watch, a background shell or a background agent. It wakes up by itself when that finishes, so it isn't waiting on you. If its last message ends with a question, it shows as **Needs you** instead |
| **Blocked** | an agent stopped with a question; it's shown on the card |
| **Agent** (dim, no comet) | the next step is an agent's, but no session is running |

Each session also shows how long it has been in that state and how long it has been running, e.g. `working 4m · up 1h12m` in `watch` and *Waiting for your reply · 12m* on the dashboard.

Background detection uses what Claude Code reports when a turn ends (its running background tasks and scheduled checks), so keep Claude Code up to date. A long command that runs in the foreground, like a test suite, shows as **Working** for as long as it runs.

Run as many sessions as you like in the same folder, one per feature; each shows on its own row. Agents that don't run Claude Code hooks show as working for two minutes after they last changed the feature's files.

### Sound

While `watch` or the dashboard is open, Buildline plays one short chime when a feature starts waiting on a person (**Needs you** or **Blocked**) or ships, so you can work elsewhere and come back when it's your turn. Several at once make one chime.

- In the terminal it plays your system's notification sound (Glass on macOS, the freedesktop sound on Linux), or the terminal bell elsewhere.
- The dashboard chimes once you've clicked anywhere on it (browsers don't play sound before that), also from a background tab.
- Mute: `m` in `watch`, or the **Sound** button in the dashboard (remembered by that browser). `--quiet` starts either one silent.
- Off for the project: `npx buildline sound off` (`sound on` to bring it back).

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
