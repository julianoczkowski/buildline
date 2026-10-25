{{agentsImport}}
### Factory skills (Claude Code)

Type `/factory` to start anything. It looks at where things are and sends you to the right station.

| Skill | Who | What it does |
|---|---|---|
| `/factory` | anyone | Front door: status, what's next, routes to the right station |
| `/factory-onboard` | lead | Set up or refresh the factory's context (new or existing project) |
| `/factory-new <idea>` | anyone | Intake: size the change and open a feature |
| `/factory-spec <id>` | PM | Write requirements and acceptance scenarios |
| `/factory-design <id>` | designer / eng | UX flows, states and technical design |
| `/factory-plan <id>` | eng | Break the spec into verifiable tasks |
| `/factory-build <id>` | agent | Implement tasks one at a time behind the gates |
| `/factory-verify <id>` | agent | Independent check against acceptance scenarios |
| `/factory-review <id>` | agent + human | Review the diff against the spec |
| `/factory-ship <id>` | eng | PR, changelog, fold learnings into context |
| `/factory-autopilot <id>` | agent | Build → verify → review loop until done (uses `/goal`) |

Subagents in `.claude/agents/` (`factory-spec-critic`, `factory-verifier`, `factory-reviewer`, `factory-design-reviewer`, `factory-mapper`) run checks in a clean context so the builder never grades its own work.
