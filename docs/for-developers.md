# Factory for developers

You own the technical design, the plan, the gates and the merge.

## Daily loop

```text
/factory                       # what's in flight, what's next
/factory-plan 012              # turn an approved spec into tasks
/factory-build 012             # one task at a time: test first, gates, commit
/factory-verify 012            # independent check in a clean context
/factory-review 012            # findings + PR body
/factory-ship 012              # PR, changelog, update context
```

Or unattended, at autonomy L3+:

```bash
npx factory-cli run 012              # opens Claude Code with a /goal condition
npx factory-cli run 012 --headless   # claude -p, for CI or a background terminal
npx factory-cli run 012 --print      # just print the /goal line
```

## Gates are the contract

Agents believe whatever the gates say, so make them honest:

- Keep them fast enough to run after every task (put slow suites in an optional gate).
- Make sure `test` actually fails when behaviour breaks.
- Add an `e2e` gate (Playwright, Cypress) as soon as you have UI acceptance scenarios.

`npx factory-cli doctor` warns when no gates are configured.

## How build sessions stay on track

Every build session starts the same way: `git status` and `git log`, `progress.md`, tasks, spec, then gates on the untouched baseline. It ends with a `progress.md` entry. That's what lets a fresh session (or a teammate's agent) resume mid-feature without re-explaining anything.

Commits are tagged `[012/T3]`, so `git log --grep 012/` shows a feature's history.

## Parallel work

Tasks marked `"parallel": true` can go to separate sessions. In Claude Code, use worktrees (`claude --worktree`) or background agents, one task each, and merge in order.

## CI

`--ci` adds `.github/workflows/factory.yml`:

- **gates** on every PR,
- **review**: Claude reviews the PR against its factory spec (needs `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` secret; skipped otherwise),
- **@claude** mentions in PR comments.

## Other agents

Codex and Copilot read `AGENTS.md`; Cursor gets `.cursor/rules/factory.mdc`; Gemini CLI gets a `GEMINI.md` import. They follow the same playbooks in `.factory/stations/`. Claude-only extras: skills, subagents, the acceptance-lock hook, `/goal`.
