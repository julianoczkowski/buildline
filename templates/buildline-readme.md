# {{project}} software factory

This folder holds the factory: how ideas become shipped, verified changes in this project. It works with Claude Code, Codex, Cursor, Gemini CLI and any agent that reads `AGENTS.md`.

## 60-second tour

```
.buildline/
  buildline.json      config: autonomy level, quality gates, team, agents
  principles.md     the non-negotiables every change is checked against   (yours to edit)
  context/          product, architecture and design knowledge            (yours to edit)
  stations/         playbooks agents follow at each step                  (managed)
  features/         one folder per change: feature.json, spec.md, progress.md
  bin/gates.mjs     runs the quality gates
```

Every change is a **feature** that moves through stations:
`intake → spec → design → plan → build → verify → review → ship`. Fixes skip spec, design and plan.

## Start here, by role

### Product managers
- See everything: `npx buildline ui` opens a dashboard in your browser. Create features, edit specs, approve.
- In Claude Code: `/buildline-new <idea>`, then `/buildline-spec <id>`. Claude interviews you and writes the requirements and acceptance scenarios.
- You own `## Acceptance` in each spec. Agents can't change it during build (a hook enforces this).
- Approve specs in the dashboard or with `npx buildline approve <id> spec`.

### Designers
- Fill in `context/design.md` once: tokens, components, patterns, links to Figma or Storybook.
- `/buildline-design <id>`: share a Figma link or screenshots; Claude writes flows, states and copy into the spec, and the design reviewer checks it against the system.
- After build, screenshots land in `features/<id>/evidence/` for your review.

### Developers
- `/buildline` shows status and what's next. `/buildline-build <id>` works tasks one by one behind the gates.
- `npx buildline run <id>` starts an unattended build → verify → review loop with `/goal` (autonomy L3+).
- `node .buildline/bin/gates.mjs` runs lint, types, tests and build exactly as agents do.

## Autonomy levels

Set `autonomy` in `buildline.json`:

| Level | Humans approve | Agents do alone |
|---|---|---|
| 1 Assist | every station | nothing without a yes |
| 2 Guided | spec, plan, merge | build, verify, review |
| 3 Autopilot | spec, merge | plan, build, verify, review |
| 4 Dark factory | merge | everything up to a ready PR |

Start at 2. Move up once the gates and acceptance scenarios have earned your trust.

## Customising

- Edit `principles.md` and `context/*`; the factory never overwrites them.
- Edit station playbooks freely. `buildline update` won't overwrite files you've changed (it tells you instead).
- Change gates in `buildline.json`, then run `npx buildline update` to refresh AGENTS.md.
