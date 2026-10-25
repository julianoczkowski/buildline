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
4. Run `node .factory/bin/gates.mjs`. If gates fail **before** you change anything, record it in `progress.md` and fix or report it first. Don't stack new work on a red baseline.

For `fix` features with no tasks: create a single task `T1` ("Reproduce with a failing test, then fix") plus `T2` ("Gates pass and A1 verified").

## 2. Work the next task

Pick the first task with `"passes": false`.

1. If the task adds behaviour, **write the failing test first** and run it to see it fail for the right reason.
2. Implement the smallest change that makes it pass. Follow the conventions in `.factory/context/architecture.md` and reuse existing components and utilities before making new ones.
3. Run the task's `verify` step **and** the gates. Read the output; don't assume.
4. For UI work, run the app and look at it (a screenshot via the browser tools if available). Check the states listed in the design.
5. Only when everything above is green, set `"passes": true` and write in `notes` what you ran and what you observed (one or two lines).
6. Commit with a clear message, e.g. `feat(saved-carts): add model and migration [004/T1]`.

If you get stuck on the same task after two genuinely different attempts, stop: write what you tried in `progress.md`, set `notes` on the task, and ask for help. Don't thrash.

## 3. Hard rules

- Never edit `## Acceptance` in `spec.md`, never delete or weaken a test to make it pass, never disable a gate. If you believe the spec or a test is wrong, stop and explain.
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

When every task passes: set status to `verify`, append a `history` entry, and continue with `/factory-verify <id>` (or tell the person to).
