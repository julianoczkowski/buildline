# Autonomy and `/goal`

Teams don't jump straight from pair-programming with an agent to a "dark factory". Buildline lets you raise autonomy one level at a time, as your gates and acceptance scenarios earn trust. Set `autonomy` in `.buildline/buildline.json`.

| Level | Humans approve | Agents do alone | Good for |
|---|---|---|---|
| **1 · Assist** | every station | nothing without a yes | trying the factory, sensitive codebases |
| **2 · Guided** | spec, plan, merge | build, verify, review | most teams (default) |
| **3 · Autopilot** | spec, merge | plan, build, verify, review | strong gates and e2e tests |
| **4 · Dark factory** | merge | spec through ready PR | prototypes, internal tools, sandboxes |

At every level, **a human merges**. Approvals are recorded in `feature.json`, and agents are instructed never to record one on someone's behalf.

## Autopilot with `/goal`

Claude Code's `/goal` keeps a session working across turns until a condition holds. After each turn a small evaluator model checks the condition against the conversation. It can't run commands itself, so the condition must be provable from printed output.

`npx buildline run <id>` opens Claude Code with a condition like:

```
/goal Feature 012 (Saved carts) reaches status "ship": following .buildline/stations/autopilot.md,
every task in .buildline/features/012-saved-carts/feature.json has "passes": true, the last
`node .buildline/bin/gates.mjs` run printed "ALL GATES PASSED", and the buildline-verifier subagent
reported every acceptance scenario as PASS. Stop early if blocked as defined in the playbook,
or after 60 turns.
```

The autopilot playbook loops build → verify → review, printing a status line after each step. It stops and writes the blocker to `progress.md` when:

- a task fails after two genuinely different approaches,
- the spec looks wrong or contradictory,
- it needs secrets, paid services, production or destructive actions,
- `metrics.reworks` reaches 5.

### Running unattended safely

- Use auto-accept or auto permission mode, ideally in a container, VM or git worktree.
- Accept the workspace trust dialog once interactively. Until you do, Claude Code ignores the project's `permissions.allow` entries.
- Headless: `npx buildline run 012 --headless` (`claude -p … --permission-mode acceptEdits`).
- Review the branch like any other PR; the `## Review` section is written for you.
