# Station: verify

Goal: an **independent** check that the feature does what the acceptance scenarios say, run by someone who didn't build it. The builder's own "it works" doesn't count here.

Resolve the feature from `$ARGUMENTS`, or use the most recent feature with status `verify`.

## 1. Delegate to a clean context

Hand the job to the `factory-verifier` subagent. Give it only:

- the feature folder path,
- the dev/start command from `factory.json → commands.dev`,
- the instruction to verify every `A*` scenario in `spec.md → ## Acceptance` and report evidence.

Don't pass it your build notes or your opinion of the code: the point is a fresh pair of eyes. If subagents aren't available in your tool, start a new session and run the steps below yourself, reading only the spec.

## 2. What the verifier does

1. Runs `node .factory/bin/gates.mjs`. Any red gate is a fail.
2. For each acceptance scenario, sets up the *Given*, performs the *When*, and observes the *Then* the way a user or client would:
   - **UI:** run the app; use browser automation (Playwright or browser tools) to click through; take screenshots of key states.
   - **API:** real HTTP requests against the running service; check status codes and bodies.
   - **CLI / library:** run the command or a small script and check output.
   - Prefer an existing automated end-to-end test that encodes the scenario; run it and confirm it actually asserts the *Then*.
3. Checks the design states listed in `## Design` (loading, empty, error…) and basic accessibility (keyboard path, labels) for UI changes.
4. Reports each scenario as `PASS` / `FAIL` / `BLOCKED` with evidence (command + output excerpt, or screenshot path).

## 3. Record the result

Write `## Verification` in `spec.md`:

```
<ISO date> · verifier
- A1 PASS: `npx playwright test saved-carts.spec.ts` (3 passed)
- A2 PASS: POST /api/carts → 201, body has id; screenshot .factory/features/004-saved-carts/evidence/a2.png
- A3 FAIL: empty state shows "undefined items" instead of the empty message
```

Save screenshots and logs to `.factory/features/<id>-<slug>/evidence/`.

## 4. Route

- All pass → status `review`, history entry, next `/factory-review <id>`.
- Any fail → status back to `build`. For each failure, add a new task to `feature.json` (`"title": "Fix A3: empty state copy"`, `"covers": ["A3"]`, `"passes": false`) and increment `metrics.reworks` in `feature.json`. Next: `/factory-build <id>`.
