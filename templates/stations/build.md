# Station: build

Goal: implement the plan **one task at a time**, each behind the gates, each with evidence. This playbook is written so that any fresh session can resume exactly where the last one stopped.

Resolve the feature from `$ARGUMENTS`, or use the most recent feature with status `build`.

## 0. Check approvals

- Autonomy ≤ 3 and `approvals.spec` missing → stop and ask for spec approval first (fixes are exempt).
- Autonomy ≤ 2 and `approvals.plan` missing → stop and ask for plan approval first.

## 1. Get your bearings (every session)

1. `git status` and `git log --oneline -10`: know what's already there; don't build on uncommitted mystery changes without asking.
2. Read `progress.md` (the last entry tells you where things stand) and `feature.json → tasks`.
3. Read `spec.md`: Requirements, Acceptance, Design, Plan.
4. Run `node .buildline/bin/gates.mjs`. If gates fail **before** you change anything, record it in `progress.md` and fix or report it first. Don't stack new work on a red baseline.

For `fix` features:

- If `## Brief` or `## Acceptance` in `spec.md` still say TODO, fill them in yourself from the title and the code: a one-line brief and one scenario that reproduces the bug. Fixes don't wait for a PM. Only if you can't tell what correct looks like (for example, which currency to show), block with the question (see "Asking for help").
- With no tasks yet, add two: `node .buildline/bin/feature.mjs task <id> add "Reproduce with a failing test, then fix"` and `node .buildline/bin/feature.mjs task <id> add "Gates pass and A1 verified"`.

## 2. Work the next task

Pick the first task with `"passes": false`.

1. If the task adds behaviour, **write the failing test first** and run it to see it fail for the right reason.
2. Implement the smallest change that makes it pass. Follow the conventions in `.buildline/context/architecture.md` and reuse existing components and utilities before making new ones.
3. Run the task's `verify` step **and** the gates. Read the output; don't assume.
4. For UI work, run the app and look at it: Claude in Chrome if it's connected, otherwise a Playwright browser tool or `npx playwright`. Take a screenshot and check the states listed in the design.
5. Only when everything above is green, record it: `node .buildline/bin/feature.mjs task <id> T2 pass --note "<what you ran and what you saw>"`.
6. Commit with a clear message, e.g. `feat(saved-carts): add model and migration [004/T1]`.

## Asking for help

If you get stuck on the same task after two genuinely different attempts, or you need a decision only a person can make, stop. Don't thrash or guess:

1. Write what you tried in `progress.md`.
2. `node .buildline/bin/feature.mjs block <id> "<the question, in one line>"` so the board shows the feature waiting on a person.
3. Ask the question. When it's answered, `node .buildline/bin/feature.mjs unblock <id> --note "<the answer>"` and carry on.

## 3. Hard rules

- Never change a filled-in `## Acceptance` in `spec.md` (a fix may fill in an empty one), never delete or weaken a test to make it pass, never disable a gate. If you believe the spec or a test is wrong, stop and explain.
- Never mark a task as passing without running its verification in this session.
- Stay inside the feature's scope. Note unrelated problems you find in `progress.md` under "Noticed" instead of fixing them.
- Don't commit secrets, generated artefacts or debugging leftovers.

## 4. End of session (always)

Append to `progress.md`:

```
## <ISO date> · build
- Done: T2 (saved cart API), verified with `npm test -- carts` + manual POST
- State: gates green, 2/5 tasks passing
- Next: T3 (UI list); watch out for the cart total rounding in utils/money.ts
```

When every task passes: `node .buildline/bin/feature.mjs move <id> verify --note "<n>/<n> tasks pass"` and continue with `/buildline-verify <id>` (or tell the person to).
