{{agentsImport}}
### Buildline skills (Claude Code)

Type `/buildline` to start anything. It looks at where things are and sends you to the right station.

| Skill | Who | What it does |
|---|---|---|
| `/buildline` | anyone | Front door: status, what's next, routes to the right station |
| `/buildline-onboard` | lead | Set up or refresh the factory's context (new or existing project) |
| `/buildline-new <idea>` | anyone | Intake: size the change and open a feature |
| `/buildline-spec <id>` | PM | Write requirements and acceptance scenarios |
| `/buildline-design <id>` | designer / eng | UX flows, states and technical design |
| `/buildline-plan <id>` | eng | Break the spec into verifiable tasks |
| `/buildline-build <id>` | agent | Implement tasks one at a time behind the gates |
| `/buildline-verify <id>` | agent | Independent check against acceptance scenarios |
| `/buildline-review <id>` | agent + human | Review the diff against the spec |
| `/buildline-ship <id>` | eng | PR, changelog, fold learnings into context |
| `/buildline-autopilot <id>` | agent | Build → verify → review loop until done (uses `/goal`) |

Subagents in `.claude/agents/` (`buildline-spec-critic`, `buildline-verifier`, `buildline-reviewer`, `buildline-design-reviewer`, `buildline-mapper`) run checks in a clean context so the builder never grades its own work.
