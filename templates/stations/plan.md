# Station: plan

Goal: turn the spec into an ordered list of small, verifiable tasks in `feature.json`. A good plan lets a fresh agent session, with no memory of today, pick up the next task and finish it.

Resolve the feature from `$ARGUMENTS`, or use the most recent feature with status `plan`. Read the whole `spec.md` and the code areas named in the technical design.

## Write the tasks

Add them in order, one command per task (ids T1, T2, … are assigned for you):

```bash
node .buildline/bin/feature.mjs task <id> add "Add saved_carts table and model" --covers R1,A2 \
  --files "db/migrations/20261111_saved_carts.sql,src/carts/saved-cart.ts,src/carts/saved-cart.test.ts" \
  --verify "npm test -- saved-cart.model passes; migration runs up and down"
```

Fix a task's files later, before build, with `task <id> T1 files "a,b"`.

Add `--parallel` to tasks that could run alongside the previous one.

Rules:

- **Small**: each task fits in one focused session and one commit, usually under ~200 changed lines.
- **Vertical first**: the first task should produce a thin end-to-end path (even if ugly) that later tasks fill out. Avoid "all the backend, then all the frontend".
- **Verifiable**: `verify` says exactly what to run or observe. "Works" is not a verification.
- **Files**: `files` lists every file the task creates, changes or deletes, as repo paths, tests and fixtures included. Use a glob only for generated output whose names you can't know (`src/gen/**`). During build, these are the only files an agent may edit (`review.planScope`); anything else needs `scope <id> add <path> --why "…"`, which the reviewer reads.
- **No decisions left**: a task leaves no design choice to the builder: no schema, endpoint path, dependency or edge case to decide on the spot. If one is open, decide it now (in `## Design`) or ask.
- **Traceable**: `covers` lists the requirement and acceptance ids it moves forward. Every `A*` scenario must be covered by at least one task.
- **Test-first where it's cheap**: when a task introduces logic, its first step is a failing test for the acceptance scenario.
- **Ordered**: dependencies come first. Mark tasks that could run in parallel with `--parallel`.
- Include the boring tasks: migrations, feature flags, docs, analytics events, cleanup of temporary code.

Then write a one-paragraph `## Plan` summary in `spec.md` (approach, order, risks) so humans don't have to read JSON.

## Check

- Every acceptance scenario is covered by at least one task.
- No task changes the acceptance criteria.
- Every task lists its files, and every file in `## Design → Changes` appears in some task.
- The final task is "All gates pass and acceptance scenarios verified end to end."

## Try run

Before asking anyone to approve the plan, find out whether it can be built without guessing. Skip this for a `fix`.

1. Hand the feature folder to the `buildline-try-run` subagent. Give it only the folder path: no summary, no opinion. If subagents aren't available, start a fresh session and ask it to follow `.claude/agents/buildline-try-run.md` (or paste that file's instructions).
2. Write what it reports into `spec.md → ## Try run`: the date, its `verdict`, the gaps (`G1`, …), mismatches and file problems, and next to each one what you did with it (AGENTS.md rule 11): **fixed** (and where), **contested** (with the file or spec line that answers it), **asked** (and the answer), or **declined**.
3. Resolve each gap where it belongs: a missing case goes into the spec (ask the spec owner; acceptance is theirs), a missing state or edge into `## Design`, a missing step into the tasks. If a gap needs a person's decision, ask it now and note the answer.
4. If you changed the plan a lot, run the try run once more on the new version. Anything still unresolved after that stays in `## Try run` as **open**, and the person sees it when approving the plan. Don't go round a third time.

A try run that finds nothing is fine; say so in one line.

## Handoff

- **Approval:** at autonomy ≤ 2, show the person the `## Try run` result (any gaps still open, first), ask them to approve the plan and record it only on an explicit yes: `node .buildline/bin/feature.mjs approve <id> plan --by "<their name>"`. Until then the feature stays at `plan`. At L3+, continue without waiting.
- Then `node .buildline/bin/feature.mjs move <id> build --note "<n> tasks"`.
- Next: `/buildline-build <id>`, or `/buildline-autopilot <id>` to run build → verify → review unattended.
