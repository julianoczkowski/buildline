# Station: autopilot

Goal: run **build → verify → review** in a loop, unattended, until the feature is ready to ship or genuinely blocked. This is the long-running harness: progress lives in files and git, not in the conversation, so it survives context compaction and restarts.

Resolve the feature from `$ARGUMENTS`.

## Preconditions (check, don't assume)

- `buildline.json → autonomy` is 3 or 4. At L1–L2, explain that autopilot needs a higher autonomy level and offer `/buildline-build` instead.
- `approvals.spec` is recorded (unless autonomy is 4 or the type is `fix`).
- `feature.json → tasks` exists. If not, run the `plan` station first.
- The working tree is clean, and you're on a feature branch (create `feat/<id>-<slug>` if not).

## The loop

Repeat until done or blocked:

1. **Build**: follow `.buildline/stations/build.md` for the next failing task. One task, gates, evidence, commit, `progress.md`.
2. When all tasks pass → **verify**: follow `.buildline/stations/verify.md` using the `buildline-verifier` subagent. Failures become new tasks; loop back to 1.
3. When verification passes → **review**: follow `.buildline/stations/review.md` using the `buildline-reviewer` subagent. Blockers become new tasks; loop back to 1.
4. When review is clean → set status `ship`, write the `## Review` packet, and stop. Do **not** push or open a PR unless autonomy is 4 *and* the person asked for it.

If `buildline.json → models` routes verify or review to another CLI (`codex…`, `gemini…`), run that step with `npx buildline step <station> <id> --headless` instead of the subagent, then read its output and the updated `feature.json` to decide the next loop.

After each step, print a one-line status so progress is visible, e.g. `[autopilot 004] T3 passing · 4/6 tasks · gates green`.

## Stop conditions (blocked)

Stop and summarise instead of continuing if:

- the same task fails after two genuinely different approaches,
- a requirement or acceptance scenario looks wrong or contradictory,
- the change needs a secret, a paid service, a production system or a destructive action,
- `metrics.reworks` reaches 5 (the spec or plan probably needs a human).

Write the blocker to `progress.md` and set `feature.json → blocked` to a one-line reason.

## Running it with `/goal` (Claude Code)

`/goal` keeps Claude working across turns until a condition is met. Its evaluator only sees the conversation, so the condition must be provable from printed output. From the terminal:

```bash
npx buildline run 004          # opens Claude Code with the goal below
```

or type it yourself:

```
/goal Feature 004 reaches status "ship": following .buildline/stations/autopilot.md, every task in its feature.json has "passes": true, the last `node .buildline/bin/gates.mjs` run printed "ALL GATES PASSED", and the verifier reported every acceptance scenario as PASS. Stop early if blocked as defined in the playbook, or after 60 turns.
```

Use auto-accept or auto permission mode for unattended runs, inside a sandbox, container or worktree if you can. Headless: `claude -p "/goal …" --permission-mode acceptEdits --output-format stream-json --verbose`.
