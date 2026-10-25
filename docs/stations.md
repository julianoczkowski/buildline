# Stations

Each station is a markdown playbook in `.buildline/stations/`. In Claude Code each one is also a skill (`/buildline-<station>`). Other agents read the playbook directly.

| Station | Skill | Owner | Produces | Moves to |
|---|---|---|---|---|
| front door | `/buildline` | anyone | status + routing | n/a |
| onboard | `/buildline-onboard` | lead | `context/*`, gates, scaffold | n/a |
| intake | `/buildline-new` | anyone | feature folder, brief, type | `spec` (fix → `build`) |
| spec | `/buildline-spec` | PM | requirements, acceptance, critique | `design` / `plan` |
| design | `/buildline-design` | designer + eng | UX (flows, states, copy, a11y) + technical design | `plan` |
| plan | `/buildline-plan` | eng | tasks in `feature.json`, plan summary | `build` |
| build | `/buildline-build` | agent | code + tests, one commit per task | `verify` |
| verify | `/buildline-verify` | agent (clean context) | `## Verification` + evidence | `review` or back to `build` |
| review | `/buildline-review` | agent + human | findings, `## Review` (PR body) | `ship` or back to `build` |
| ship | `/buildline-ship` | eng | PR, changelog, updated context | `done` |
| autopilot | `/buildline-autopilot` | agent | build → verify → review loop | `ship` |

## Highlights

**Spec** interviews one question at a time and offers a best guess with each, so PMs can mostly say "yes". It covers unhappy paths and "must not change" behaviour, then hands the spec to the `buildline-spec-critic` subagent.

**Design** asks designers for what they already have (Figma, screenshots, a reference product) and records flows, every screen state, reused components, copy, accessibility and responsive behaviour, using design tokens by name. The `buildline-design-reviewer` subagent checks it against your design system.

**Plan** produces small, vertical-first, test-first tasks, each with an explicit `verify` step and traceability to requirements and acceptance ids.

**Build** starts every session the same way (git log, progress, tasks, spec, gates on the baseline), works one task at a time, and ends every session with a progress entry. It stops after two genuinely different failed attempts instead of thrashing.

**Verify** delegates to the `buildline-verifier` subagent with *only* the spec, so the check is independent. It runs gates and exercises every acceptance scenario the way a user or client would (browser automation for UI, real HTTP for APIs). Failures become new tasks and increment `metrics.reworks`.

**Review** uses the `buildline-reviewer` subagent (and `/code-review` in Claude Code) for spec fit, correctness, security, tests and maintainability, filtering out style noise. It writes a human review packet that becomes the PR description.

**Ship** opens the PR (a human merges, always) and folds learnings back into `context/` and `principles.md`, which keeps the factory improving instead of rotting.
