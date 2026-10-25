# Station: plan

Goal: turn the spec into an ordered list of small, verifiable tasks in `feature.json`. A good plan lets a fresh agent session, with no memory of today, pick up the next task and finish it.

Resolve the feature from `$ARGUMENTS`, or use the most recent feature with status `plan`. Read the whole `spec.md` and the code areas named in the technical design.

## Write the tasks

Write them into `feature.json → tasks` (replace the placeholder):

```json
{
  "id": "T1",
  "title": "Add `saved_carts` table and model",
  "covers": ["R1", "A2"],
  "verify": "`npm test -- saved-cart.model` passes; migration runs up and down",
  "passes": false,
  "notes": ""
}
```

Rules:

- **Small**: each task fits in one focused session and one commit, usually under ~200 changed lines.
- **Vertical first**: the first task should produce a thin end-to-end path (even if ugly) that later tasks fill out. Avoid "all the backend, then all the frontend".
- **Verifiable**: `verify` says exactly what to run or observe. "Works" is not a verification.
- **Traceable**: `covers` lists the requirement and acceptance ids it moves forward. Every `A*` scenario must be covered by at least one task.
- **Test-first where it's cheap**: when a task introduces logic, its first step is a failing test for the acceptance scenario.
- **Ordered**: dependencies come first. Mark tasks that could run in parallel with `"parallel": true`.
- Include the boring tasks: migrations, feature flags, docs, analytics events, cleanup of temporary code.

Then write a one-paragraph `## Plan` summary in `spec.md` (approach, order, risks) so humans don't have to read JSON.

## Check

- Every acceptance scenario is covered by at least one task.
- No task changes the acceptance criteria.
- The final task is "All gates pass and acceptance scenarios verified end to end."

## Handoff

- Set status to `build`. Append a `history` entry.
- **Approval:** at autonomy ≤ 2, ask the person to approve the plan and record `approvals.plan` only on an explicit yes. At L3+, continue without waiting.
- Next: `/factory-build <id>`, or `/factory-autopilot <id>` to run build → verify → review unattended.
