# Research notes

The reasoning behind Factory's design, from research done in October 2026. Sources are linked; claims we couldn't verify are marked.

## What "software factory" means now

- **Five levels** (Dan Shapiro, Jan 2026): from L0 manual coding, through L3 reviewing several agents' output and L4 "spec writer" (write specs, let agents run for hours, check tests), to **L5 "dark factory"**, where specs go in and software comes out with no human review. [danshapiro.com](https://www.danshapiro.com/blog/2026/01/the-five-levels-from-spicy-autocomplete-to-the-software-factory/)
- **StrongDM's Software Factory** (written up by Simon Willison, Feb 2026): "non-interactive development where specs + scenarios drive agents that write code, run harnesses, and converge without human review." Key ideas:
  - **scenarios** kept outside the repo as a holdout set,
  - a probabilistic **satisfaction** score instead of "tests are green",
  - **digital twins** of third-party services.

  Willison questioned the no-review rule, and the credible examples are all tiny teams. [simonwillison.net](https://simonwillison.net/2026/feb/7/software-factory/) · [factory.strongdm.ai](https://factory.strongdm.ai)
- **Spec-driven development** has three levels: spec-first, spec-anchored and spec-as-source. Most tools are spec-first in practice. [martinfowler.com](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html)
- **Factory.ai "Droids"** is the commercial, closed take: agents across CLI, desktop and web that plan, edit, test and open PRs. *(Naming: Factory.ai is an established company that also uses a `.factory/` project folder, which is why this project is called Buildline and installs into `.buildline/`.)*

## Existing tools we learned from

| Tool | Shape | Take-away |
|---|---|---|
| GitHub Spec Kit | `specify init`; constitution → specify → plan → tasks → implement; `specs/NNN-feature/` with ~7 files | The phases are right. The markdown volume and Python/uv install are the top complaints. |
| BMAD Method v6 | `npx bmad-method install`; skills-based; Clarify → Plan → Build/verify → Learn; `bmad-project-context` for brownfield | Routing small changes past planning matters. Many agents use many tokens. |
| Agent OS v3 | markdown in `agent-os/`; **discovers standards from existing code** | Brownfield onboarding should read the code first. |
| Kiro | `requirements.md` / `design.md` / `tasks.md` per spec; steering files | One spec per change with design inside it. Criticised as overkill for small bugs. |
| OpenSpec | change proposals merged back into living specs (`archive`) | Spec-anchored: fold learnings back into lasting context. |
| Superpowers | auto-triggered skills: brainstorm → worktree → plan → subagent per task → TDD → review | "Evidence over claims" and fresh subagent contexts. |
| Taskmaster | PRD → parse → expand → next; MCP with ~36 tools (~21k tokens) | Context bloat from big tool surfaces is real. |
| GSD Core | `/gsd-onboard` for brownfield; discuss → plan → execute → verify → ship | Separate greenfield and brownfield entry points. |

Shared standards: **AGENTS.md** (Linux Foundation's Agentic AI Foundation; read by Codex, Cursor, Gemini CLI, Copilot and others) and **Agent Skills** (`SKILL.md`). Claude Code reads `CLAUDE.md`, which can import `@AGENTS.md`.

## Anthropic's guidance we built on

- **Give the agent a way to verify its work** (tests, builds, screenshots); escalate to a `/goal` condition, a Stop hook or a verification subagent. [Claude Code best practices](https://code.claude.com/docs/en/best-practices)
- **Explore → plan → code → commit**; use subagents for investigation to keep the main context clean; use a writer/reviewer split; tell reviewers to report only real gaps, because they over-report.
- **Long-running harnesses:**
  - an initializer session sets up the environment,
  - a **JSON feature list with `passes` flags** that agents may only flip ("removing or editing tests is unacceptable"),
  - a **progress file** and git history so each fresh session can resume,
  - a fixed startup routine,
  - end-to-end verification over unit tests alone.

  [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- **Keep context small and load it just in time**; take structured notes outside the context window. [Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- **Simple, composable patterns** (prompt chaining, routing, orchestrator-workers, evaluator-optimizer) beat complex frameworks. [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- **Rules that must always hold belong in hooks, not prose.** Hooks can block a tool call with exit code 2. [Hooks](https://code.claude.com/docs/en/hooks)
- **`/goal <condition>`** keeps working across turns until a fast evaluator judges the condition met. The condition must be provable from the conversation, and should name a measurable end state, a check and a turn bound. [Goal](https://code.claude.com/docs/en/goal)

## Gaps in existing tools, and what Factory does about them

| Gap | Factory's answer |
|---|---|
| Same ceremony for a typo and an epic | Intake sizes every change: `fix` skips spec, design and plan; `epic` splits. |
| Markdown sprawl and review fatigue | One `spec.md` per change (aim for one screen), one `feature.json`, one `progress.md`. |
| Locked to one agent, installed per tool | One canonical playbook per station, wired into Claude skills, AGENTS.md, Cursor rules and GEMINI.md. |
| Verification stops at "tests pass"; agents weaken checks | Gates plus an independent verifier subagent that exercises acceptance scenarios; a hook locks acceptance during build. |
| PMs and designers left out | Role-specific stations, a local dashboard to edit, approve and track, and design states and tokens treated as part of the spec. |
| Hard installs and updates that clobber edits | `npx`, two small dependencies, hash-tracked managed files, marked blocks, and a clean `remove`. |
| Context and token bloat | No MCP server; skills are 5-line pointers; playbooks load only when used. |
| One model for every kind of work | Models per station: Opus plans, Sonnet builds, and Codex or Gemini can review as a second opinion. |
| No path between autonomy levels | Autonomy dial L1–L4 with approvals recorded per feature; `/goal` autopilot from L3. |
| No evidence of value | `metrics.reworks`, history and timestamps per feature as groundwork for cycle-time and rework reporting. |

## Ideas for later

- Holdout scenarios stored outside the repo, scored by a judge (StrongDM's "satisfaction").
- A metrics view: cycle time per station, rework rate, cost per feature.
- Figma MCP integration for the design station.
- Distribution as a Claude Code plugin marketplace alongside the npx installer.
- A GitHub Pages site generated from these docs.
