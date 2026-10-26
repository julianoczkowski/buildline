# FAQ and troubleshooting

**Does it work without Claude Code?**
Yes. Codex, Copilot and others read `AGENTS.md`; Cursor gets a rule; Gemini CLI gets `GEMINI.md`. Say "follow `.buildline/stations/buildline.md`". Claude Code adds skills, subagents, the acceptance-lock hook and `/goal`.

**Will it mess up my existing `CLAUDE.md` / `AGENTS.md` / settings?**
No. It adds one marked block to markdown files and merges into `.claude/settings.json` without removing anything. Run `init --dry-run` to see the plan first. `remove` restores your settings.

**I already use Spec Kit / BMAD / OpenSpec.**
Buildline installs alongside them and doesn't read or change their folders. It's simplest to pick one pipeline per repo; if you migrate, ask Claude to convert an existing spec into a factory feature.

**It's too much process for a typo.**
Don't open a feature for trivial edits. For small bugs use `--type fix`: no spec, design or plan, just a reproduction test, the fix, gates and verification.

**Can I run several Claude Code sessions at once?**
Yes, in the same folder, one per feature. `npx buildline watch` and the dashboard show each one live: what it's doing, when it's waiting for your reply, and when it's blocked on a question. See [Live sessions](concepts.md#live-sessions). Each git worktree is its own checkout, so open `watch` inside the worktree you want to see.

**How do I upgrade to a new release?**
Run `npx buildline@latest update` in your project. It refreshes Buildline's files, keeps any you've edited, and leaves your config, context and features alone. Details in [Getting started → Upgrading](getting-started.md#upgrading).

**Claude ignores `permissions.allow` in headless mode.**
Claude Code ignores project allow rules until the workspace is trusted. Open `claude` interactively in the project once and accept the trust dialog.

**The acceptance guard blocked an edit I wanted.**
That's on purpose during build, verify and review. Move the feature back to `spec` (`npx buildline move <id> spec` or the dashboard), change the scenario, approve, and continue.

**Gates are failing before I changed anything.**
Build stations stop on a red baseline. Fix it, or mark a flaky gate `"required": false` in `buildline.json` while you deal with it.

**The dashboard says "lost connection".**
The `npx buildline ui` process was stopped. Start it again.

**How do I see what changed for one feature?**
`git log --grep "<id>/"`. Commits are tagged `[<id>/T<n>]`.

**Is anything sent anywhere?**
The CLI and dashboard are local-only and make no network calls. Your AI agent talks to its provider as usual.
