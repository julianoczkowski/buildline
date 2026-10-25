# ▲ factory

**Install an AI software factory into any project, in one command.**

Factory gives your repo a spec-driven pipeline that AI coding agents (Claude Code first, plus Codex, Cursor, Gemini CLI, Copilot and anything that reads `AGENTS.md`) follow from idea to merged PR, with real quality gates and independent verification. Developers, designers and product managers each get a clear place in it.

```bash
npx factory-cli
```

Works on empty folders and on large, running codebases, with any language or framework. Nothing is overwritten: Factory adds marked blocks to files you own and keeps your edits on update.

> **Status:** early (v0.1). Private while we shape it, and not on npm yet. Until it is, run it straight from GitHub (you need access to this repo):
>
> ```bash
> npx github:julianoczkowski/factory          # instead of npx factory-cli
> ```

---

## Why

Coding agents are now good enough to build most of a feature, but only when they have three things most repos don't give them:

1. **A clear definition of done**: requirements and acceptance scenarios a human owns.
2. **A way to check their work**: real gates (lint, types, tests, build) and an independent verifier, not "it works on my end".
3. **Memory between sessions**: progress files and task state on disk, so any session can resume.

Factory installs exactly that, sized to the change. A bug fix doesn't go through a six-document ceremony; an epic does get split up. The design draws on Anthropic's published guidance on long-running agents and on lessons from Spec Kit, BMAD, Kiro, OpenSpec and StrongDM's "software factory". See [docs/research.md](docs/research.md).

## The pipeline

```
intake ─▶ spec ─▶ design ─▶ plan ─▶ build ─▶ verify ─▶ review ─▶ ship
          (PM)    (design)  (eng)   (agent)  (agent)   (agent+human)
```

| Type | Stations |
|---|---|
| **fix** | intake → build → verify → ship |
| **feature** | every station |
| **epic** | intake → spec → split into features |

Every change is a folder in `.factory/features/<id>-<slug>/` with one short `spec.md`, a `feature.json` (status, approvals, tasks with `passes` flags) and an append-only `progress.md`.

## Quick start

```bash
cd your-project
npx factory-cli            # guided setup (detects your stack and test/lint/build commands)
claude                     # open Claude Code
> /factory-onboard         # new project: interview + scaffold · existing: map the codebase
> /factory-new Let users save carts for later
> /factory                 # status and what's next, any time
```

Not on Claude Code? Ask your agent to "follow `.factory/stations/factory.md`". Every station is a plain markdown playbook.

## What gets installed

```
AGENTS.md                     + factory block (rules, pipeline, gates): read by every agent
CLAUDE.md                     + factory block: imports AGENTS.md, lists skills
.claude/skills/factory-*/     11 skills: /factory, /factory-new, /factory-spec, … /factory-autopilot
.claude/agents/factory-*.md   5 subagents: spec-critic, verifier, reviewer, design-reviewer, mapper
.claude/settings.json         + hooks (session briefing, acceptance-lock guard) + gate permissions
.cursor/rules/factory.mdc     (if Cursor)       GEMINI.md block (if Gemini)
.github/workflows/factory.yml (optional) gates on every PR + Claude review against the spec
.factory/
  factory.json                config: autonomy, gates, team, agents         (yours)
  principles.md               non-negotiables every change is checked against (yours)
  context/                    product · architecture · design system          (yours)
  stations/                   playbooks for each station                      (managed)
  features/                   your work
  bin/gates.mjs, hook.mjs     zero-dependency scripts
```

## For each role

| | Start with | You own |
|---|---|---|
| **Product managers** | `npx factory-cli ui` (dashboard), `/factory-new`, `/factory-spec` | requirements, acceptance scenarios, spec approval |
| **Designers** | `context/design.md`, `/factory-design` with a Figma link or screenshots | flows, states, components, design approval |
| **Developers** | `/factory`, `/factory-build`, `npx factory-cli run <id>` | technical design, plan, merge |

Role guides: [PMs](docs/for-product-managers.md) · [Designers](docs/for-designers.md) · [Developers](docs/for-developers.md)

## The dashboard

`npx factory-cli ui` opens a local board in your browser. You can see every feature by station, read and edit specs, approve, move work along, and copy the next command for Claude Code. It runs on `localhost` only and needs no account.

## Autonomy levels

| Level | Humans approve | Agents do alone |
|---|---|---|
| 1 · Assist | every station | nothing without a yes |
| 2 · Guided *(default)* | spec, plan, merge | build, verify, review |
| 3 · Autopilot | spec, merge | plan, build, verify, review: `factory run <id>` uses `/goal` |
| 4 · Dark factory | merge | everything up to a ready PR |

Merging is always a human decision. More in [docs/autonomy.md](docs/autonomy.md).

## Guardrails that hold

Prose instructions are advice; these are enforced:

- **Acceptance lock.** A Claude Code hook blocks any edit to a spec's `## Acceptance` while the feature is in build, verify or review. Agents can't move the goalposts.
- **Independent verification.** The verifier subagent runs in a clean context with only the spec, so the builder never grades its own work.
- **Tasks pass on evidence.** A task flips to `"passes": true` only after its verification step and the gates have been run and observed.
- **Your files stay yours.** Managed files are tracked by hash; `factory update` won't overwrite anything you changed, and `factory remove` restores your settings.

## CLI

```
npx factory-cli                    interactive menu
npx factory-cli init [-y]          install (--agents, --autonomy, --ci, --dry-run)
npx factory-cli status             board in the terminal (--json)
npx factory-cli new "<title>"      open a feature (--type fix|feature|epic)
npx factory-cli approve <id> spec  record an approval (spec | design | plan)
npx factory-cli ui                 dashboard
npx factory-cli run <id>           autopilot with Claude Code /goal (--headless)
npx factory-cli gates              run quality gates
npx factory-cli doctor             check the setup
npx factory-cli update             refresh managed files, keep your edits
npx factory-cli remove             uninstall (keeps features and context)
```

Full reference: [docs/cli.md](docs/cli.md).

## Docs

- [Getting started](docs/getting-started.md): new and existing projects
- [Concepts](docs/concepts.md): features, stations, gates, approvals, context
- [Stations](docs/stations.md): what each one does and produces
- [Autonomy & /goal](docs/autonomy.md)
- [Customising](docs/customising.md)
- [CLI reference](docs/cli.md)
- [FAQ & troubleshooting](docs/faq.md)
- [Research notes](docs/research.md): the thinking behind the design

## Requirements

Node.js 20.12+. Claude Code is recommended (skills, subagents, hooks, `/goal`); every other agent works through `AGENTS.md` and the station playbooks.

## License

MIT
