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

`Brief` → `Requirements` (R1…) → `Acceptance` (A1…, Given/When/Then) → `Out of scope` → `Design` (`Experience`, `Technical`, `Edge behaviour`) → `Plan` → `Try run` → `Verification` → `Review`.

**Edge behaviour** says what happens on each call's unhappy branches: invalid input, an auth failure, a timeout, a response in an unexpected shape. The verifier tests every branch listed there. **Try run** is a fresh agent's reading of the spec, design and plan before anything is built: what it would build, and where it had to guess. The plan station resolves those gaps, and the person sees any still open when approving the plan.

One file, not six. Aim for one screen; two screens means it's probably an epic.

### `feature.json` tasks

```json
{ "id": "T2", "title": "Save cart API", "covers": ["R1", "A2"],
  "files": ["src/api/carts.ts", "src/api/carts.test.ts"],
  "verify": "POST /api/carts returns 201 with id", "passes": false, "notes": "" }
```

`files` is every file the task creates, changes or deletes. See [Plan scope](#plan-scope).

This follows the pattern Anthropic describes for long-running agents: a structured list where agents may only flip `passes`, plus a progress log, so any fresh session can resume from files and git rather than memory.

### How agents record progress

You never need to type these. The station playbooks tell the agent to run them, the same way it runs your tests:

```bash
node .buildline/bin/feature.mjs task 004 T2 pass --note "npm test -- carts: 12 passed"
node .buildline/bin/feature.mjs move 004 verify
node .buildline/bin/feature.mjs block 004 "Which currency should prices use?"
```

The script stamps the real time, keeps the history the board shows, counts reworks, and refuses a move that skips an approval your autonomy level requires. A Claude Code hook stops agents from editing `feature.json` by hand. When an agent needs a decision from you, it marks the feature **blocked** with the question before asking, so the board shows who is waiting on whom.

### Dropped: decided not to do it

`blocked` means someone owes the feature an answer. When the answer is "we're not doing this", drop it instead:

```bash
node .buildline/bin/feature.mjs drop 038 "Measured: little worth fixing" --by "Maya" --branch feat/038-api-times
```

`feature.json` gets `"status": "dropped"` and `"dropped": { "reason", "by", "at", "branch" }`, and any blocker is cleared. A dropped feature leaves the line: status, `watch` and the dashboard list it in a collapsed **Dropped** group with the reason, never as waiting on a person or in progress, and it's never counted as shipped (status shows "2 dropped (1 this month)" separately). `move` refuses to start from `dropped`, even with `--force`; `reopen 038 build` puts it back, with approvals and tasks as they were. Agents drop a feature only when a person says so.

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
- **epic**: specced, then split into child features (`--parent`). A child counts as resolved once it's done or dropped. When none is left in flight, status says so and `move <epic> done` closes it without its own approvals (its children had theirs), recording what shipped and what was dropped. While a child is still open, the epic can't be closed.

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

Humans approve `spec`, `design` and `plan`, depending on the [autonomy level](autonomy.md), and changes to [sensitive paths](#review) at every level. Approvals are recorded in `feature.json` with name and time, from Claude (only after an explicit "yes"), the dashboard, or `npx buildline approve <id> <stage>`. Agents are told never to record an approval on someone's behalf.

## Review

The review station is built on how Anthropic reviews code that agents write ([research](research.md#how-anthropic-reviews-code-that-agents-write)):

- **`REVIEW.md`** at the repo root says what review should care about in this codebase: what failure looks like, what to always flag, what not to flag, paths to skip, and how to report. Code owners write it; Buildline seeds a starter once and never overwrites it. Claude Code's own Code Review reads the same file.
- **Findings are checked before they cost a round.** The `buildline-reviewer` subagent reports findings with file:line evidence, and the `buildline-finding-checker` subagent confirms each one from the code. Rejected findings are dropped.
- **Pre-existing bugs** are labelled `pre-existing`, noted, and suggested as a separate fix, instead of holding up the feature.
- **Three rounds, then a person decides.** The third time review sends a feature back to build, it is marked blocked: keep fixing, or rethink the approach? Re-reviews only look at what changed since the last one. Change the limit with `review.maxRounds` (`0` turns it off).
- **Sensitive paths always need a person**, whatever the autonomy level:

  ```json
  "review": { "maxRounds": 3, "sensitive": [".github/workflows/**", ".gitlab-ci.yml", "billing/", "db/migrations/**"] }
  ```

  A feature whose commits touch one of these can't move to ship until someone runs `npx buildline approve <id> sensitive` (or presses Approve in the dashboard or `a` in `watch`). The approval covers the commit they saw; new commits need a fresh one. A bare name like `billing/` matches at any depth, as in `.gitignore`.
- **The PR says how to undo it**: the ship station writes *Testing*, *Risk* and *How to revert* into every PR description.

## Returns and root causes

When verify or review sends work back, the move records where the problem started:

| Cause | Means |
|---|---|
| `spec` | the spec was wrong, vague or missing a case |
| `design` | the design missed a state, an edge or a contract |
| `plan` | the plan left something out or ordered it badly |
| `process` | a gate, tool or check should have caught it earlier |
| `code` | the spec and design were right; the code was wrong |

`npx buildline insights`, `f` in `watch` and the dashboard's **Flow** tab add these up with the flow of work (how often each station passes work on or sends it back, and where to) and how long features waited on people: the gap before each approval, blocked questions, and the wait to merge. When one cause keeps coming up, the ship station proposes a fix where it belongs (the spec template, the design template, a gate) and a person decides. The waiting time is an estimate from history.

## Locked tests

Tests a person owns, such as acceptance or contract tests, can be locked so agents make the code pass them rather than change them:

```json
"review": { "lockedTests": ["tests/acceptance/**"] }
```

While any feature is in build, verify or review, the Claude Code guard hook refuses edits to existing files there (new files are fine), and review treats any change to them as a blocker. Off by default; onboarding proposes it when the project has such a folder.

## Plan scope

The plan names every file each task touches (`--files` on `task add`). While a feature is in build, the Claude Code guard hook refuses edits to any other file, so a task can't quietly grow into a refactor of the module next door. Factory files under `.buildline/` are always fine.

When a file really has to change, the agent adds it with the reason the plan missed it:

```bash
node .buildline/bin/feature.mjs scope 004 add src/lib/money.ts --why "rounding lives here"
```

That lands in `feature.json → scope` and the history, and review checks each reason against the diff. `scope 004` prints the whole list. A plan whose tasks list no files isn't enforced, and `"review": { "planScope": false }` turns the check off. The guard covers the editor tools; shell commands also write logs, caches and lockfiles, so they aren't checked.

## Fresh-eyes reviews

Each planning station hands its document to a subagent that wasn't in the conversation that wrote it, so it can't share the author's blind spots (the elephant and goldfish split from [EGM](https://github.com/google/elephant-goldfish-model)):

| Station | Subagent | What it does |
|---|---|---|
| spec | `buildline-spec-critic` | Paraphrases the spec first (what it asks for, what it assumes exists), then checks testability, coverage, unhappy paths. The person approving compares the paraphrase with what they meant. |
| design | `buildline-zoom-out` | Searches the code for things the design rebuilds, and flags over-building, logic in the wrong layer and alternatives rejected without a concrete reason. |
| plan | `buildline-try-run` | Says what it would build from the spec, design and plan alone; every guess is a gap, and so is a task with no files or a decision left to the builder. |

Agents weigh each finding rather than obey it: **fix** it, **contest** it with evidence the reviewer could have read, **ask** a person when the evidence is only in someone's head, or **decline** a minor one. They re-run a reviewer once after fixing; what's still open goes to the person instead of another round. A reviewer that crashed or timed out is recorded as *not run*, which never counts as a pass.

## Drift

Shipped specs say what was decided; later features change the code. `npx buildline drift` lists, from git, which shipped features had their files changed since (and by which features), and how stale each context file is. `/buildline-drift` hands each candidate to the `buildline-drift-checker` subagent, which reports only where the spec no longer matches the code, into `.buildline/drift/<date>.md`. A person decides each item: the code is right (a dated note goes under `## Since shipping` in that spec, or the context file is updated), the doc is right (a fix is opened), or it doesn't matter. No code changes at that station.

## Context

`.buildline/context/` is the factory's long-term memory: `product.md`, `architecture.md`, `design.md`. Specs describe one change; context describes the system. The ship station folds decisions from each spec back into context, which keeps the specs anchored to the code over time.

## Principles

`.buildline/principles.md` holds the short list of non-negotiables (product, design, engineering) that specs are critiqued against and diffs are reviewed against. It's yours; Buildline never overwrites it.
