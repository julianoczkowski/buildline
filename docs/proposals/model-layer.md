# A model layer for Buildline

Research notes and a proposed plan, November 2026. Based on the *Building Software in the AI Era* series and the community-session posts on software-leader.com, read in full with every diagram viewed in Chrome. Kept out of the docs site on purpose: this folder isn't in the site's `NAV`.

## TL;DR

- The series is a direct critique of tools shaped like Buildline. Its diagram of *spec-driven development today* shows `spec.md`, `plan.md` and `tasks.md` handed to one agent with `/specify`, `/plan`, `/tasks`, `/implement`, captioned "Next feature, next spec. Nothing in between accumulates into a model of the system." That is our pipeline.
- The central idea: **keep one model of the system current, and build from it.** Requirements change the model, not the code. Specs pile up; a model doesn't. People read *views* (process, interaction, call chain, state machine). The AI walks the *graph* underneath.
- Buildline already has more of this than most tools: traceable `R*`/`A*` ids, `covers` on tasks, `.buildline/context/` folded forward at ship, an independent verifier, a finding checker, rework counts and a guard hook. What it lacks is a **typed, ID'd, queryable model** that specs point at instead of re-describing.
- Proposed: add the model in small, optional steps, starting with things that need no new artefact at all: a **try run** before building, **root cause when work goes back**, a **flow view of rework**, and **behaviour at the edge** in design. Then a text-first model in `.buildline/model/`, then graph queries and scoped context, then dependency-aware autopilot.
- Keep Buildline's rule that the ceremony is sized to the change. A typo never touches the model. An epic should.

## Sources

The four parts of the series and five community posts, all by Koen Mannaerts / Software Leader (a training company; the posts promote its *Master Builder Clinic*, which matters when weighing the evidence).

| # | Article | What it argues |
|---|---|---|
| 1 | [The Model Keeps the Fighter Flying](https://www.software-leader.com/blogs/the-model-keeps-the-fighter-flying) (Part 1, 23 Oct 2026) | Machining, aviation, construction and manufacturing all keep a model current and build from it. Quality is a property of the line, not the inspection. |
| 2 | [The Code Is a Side Effect](https://www.software-leader.com/blogs/the-code-is-a-side-effect) (Part 2) | A backlog isn't a plan. Spec-driven development is real progress but specs accumulate without forming a model. The LLM is not a compiler. Swarms multiply private models. "Intelligence before the model, determinism after it." |
| 3 | [The Architect's IDE](https://www.software-leader.com/blogs/the-architects-ide) (Part 3) | What the model is made of (BPMN process, system interaction, state machine, contracts, flowchart, call chain), one requirement in four representations, one graph underneath, star-view queries, Semantic / System / Runtime model layers, the "try run". |
| 4 | [Review the Blueprint and the Behaviour](https://www.software-leader.com/blogs/review-the-blueprint-and-the-behaviour) (Session 05) | Reading every line stopped scaling. An agent's ticked checklist is a claim, not evidence. Competing reviewer models, read-only tests, simulators. Behaviour at the front-end/API edge is modelled nowhere. |
| 5 | [Halve the Coding, Keep the Deadline](https://www.software-leader.com/blogs/halve-the-coding-keep-the-deadline) (Session 04) | 50% faster coding moved a real schedule by ~20%: the critical path is decisions, integration and waiting. "Harden what works into scripts." |
| 6 | [The Master Builder Approach](https://www.software-leader.com/blogs/the-master-builder-approach-turning-complexity-into-structure) | Specs describe, models organise. Prose at scale becomes "a legal system for your software". |
| 7 | [Community Session 02](https://www.software-leader.com/blogs/community-session-02) | The harness beats the prompt. Agents have jobs, not permissions. Guardrails by construction. E2E tests hidden from implementers. Observability as infrastructure. |
| 8 | [Community Session 03](https://www.software-leader.com/blogs/community-session-03) | Productivity metric is uptime (a spec and harness that keep an agent productive for a week). Domain experts beat language fluency. |
| 9 | [Community Session 01](https://www.software-leader.com/blogs/community-session-01) | Context is king; process beats prompts. |

Also cited by Part 2: Cemri et al., *Why Do Multi-Agent LLM Systems Fail?* ([arXiv 2503.13657](https://arxiv.org/abs/2503.13657)), 1,600+ traces across seven frameworks; inter-agent misalignment is one of three failure families.

### Diagrams reviewed

| Diagram | Takeaway for Buildline |
|---|---|
| P1-03 *Construction: one blueprint kept current* | Fragments and conversations go in, the drawing (rev A → B → C) is updated, the house is built from rev C. "Nobody goes back to the requirements." Our specs are the brief; we have no drawing. |
| P1-04 *Lean Six Sigma* | Spot checks along the line, one final test; when a defect gets through, trace it to **the spec, the process or the system**, never "fix just this one part". |
| P2-02 *Spec-driven development today* | One spec, one agent, one feature. It works. Nothing accumulates. (This is Buildline.) |
| P2-06 *Swarm dependency graph* | 13 units of work, 11 on the critical path: five agents buy 2 units. "The graph is nowhere written down." |
| P2-07 *An agent run, stage by stage* | Their own factory's stages (Decision, Subsystem, Component, Operation, DTO, Use case, Sequence step, Spec, Code, Conformance review, Craft review, Walkthrough) with forward arcs (blue) and returns (red). Spec: 1,946 items, 1,444 returns; Code: 1,353, 657 returns. Returns dominate. |
| P2-08 *Swarm without a model* | Five agents each invent `Order.status` vs `Order.state`, at-least-once vs exactly-once, "who owns shipped?". Ten hops at 95% → 59% right. |
| P2-09 *Requirement → model → compiler → product* | The LLM helps maintain the model; a deterministic machine builds; no hand edits to the output; the next requirement goes back to the model. |
| P2-10 *Swarm with a model* | One semantic model underneath; each agent gets a **scoped slice**; a Project Design network (t1, t2, t3) orders the work; integration is **checked against the model** (one name, exactly-once stated once, one owner). |
| P3-02 *SI01.01 Create Login* | A system interaction as a small activity diagram plus a page: steps with input/output, links back to the process, and a **Q&A table of open questions with status**. |
| P3-04 *One requirement, four representations* | Process → system interaction → call chain → semantic-model traceability view, linked by IDs (`BP01` → `SI01.01` → `CC01.01` → `CustomerManager.CreateLogin`). |
| P3-05 *Views vs model* | Humans draw and review views; the AI walks the model: "change SI02, what does it touch?" → six hops, exact and cheap, instead of reading 400 pages of prose. |
| P3-06 *Star view* | One element and everything two hops out: owner, what it realises, what implements it, rules, open questions. |
| P3-07 *Semantic / System / Runtime model* | Schema (types) → this system's design → runtime metrics that reference the design and never change it. Business, architecture, infrastructure layers. |
| Master Builder infographic | One process broken into four layers: process flow, system interactions (with step tables), domain entities, and workflow context (state flowing between steps). |

## Concepts and how they map to Buildline

| Concept | Buildline today | Gap |
|---|---|---|
| **A model kept current, built from** | Per-feature `spec.md`; `.buildline/context/{product,architecture,design}.md` updated at ship | Context is prose with no ids. Specs re-describe the system each time. Nothing says how twenty features relate. |
| **Every change lands in the model (rev C)** | Ship folds decisions back into context | Folding happens after the build, by an agent, in prose. Nobody reviews a *delta to the model*. |
| **Typed elements with stable ids** | `R*`, `A*`, `T*` per feature | Ids are local to one feature. No ids for processes, interactions, components, contracts, entities. |
| **Traceability chain** | Task `covers: [R1, A2]`; commits tagged `[004/T1]` | Stops at the feature boundary. Code ↔ design links aren't recorded. |
| **Views for people, graph for the AI** | Specs and context are Markdown | No diagrams, no graph, no queries. |
| **Open questions live in the model** | `**Open questions:**` line in each spec's brief | Per feature, free text, never resolved centrally. |
| **Try run before building** | `buildline-spec-critic` critiques the spec | It critiques; it doesn't explain back what it would build, which is what exposes gaps. |
| **LLM is not a compiler; determinism after the model** | Gates are deterministic; skills are prompts | Nothing is generated deterministically from a design. |
| **Critical path / Project Design** | Tasks are ordered; `--parallel` flag | No dependency graph, no critical path, autopilot runs tasks in sequence. |
| **Scoped slice per agent** | Each station reads the whole spec plus context | Context grows with the system. |
| **Quality on the line, root cause on defects** | Gates per task; verifier; review rounds; `reworks` and `reviewRounds` metrics; blocked after 3 rounds | A move back records a note, not a cause. Nothing turns a recurring defect into a new gate, principle or `REVIEW.md` line. |
| **Returns dominate (P2-07)** | `history` has every move | Never visualised; `watch` and the dashboard show where features are, not how often work went back. |
| **Checklists are claims** | Verifier never saw the code being written; findings checked; "evidence over claims" principle | Already strong. |
| **Read-only / hidden tests** | Guard hook locks `## Acceptance` during build/verify/review | Test files that encode acceptance can still be edited by the builder. |
| **Competing reviewers** | Models per station; one reviewer + finding checker | No second independent reviewer on a different model. |
| **Behaviour at the edge** | Design has *Experience* and *Technical* | No place for "which API is called when, and what happens on an unexpected response". |
| **Human in vs over the loop** | Autonomy levels L1–L4 | Already explicit; worth naming in these terms in `autonomy.md`. |
| **Decisions are the bottleneck** | `watch` counts *waiting on people* | No measure of how long features wait on people vs agents. |
| **Harden into scripts** | `feature.mjs`, `gates.mjs`, hooks | Already the house style. |

## What to adopt, what not to

**Adopt**

1. One shared model, ID'd, in the repo, as text. Diagrams are views rendered from it.
2. Designs are reviewed as a *delta to the model*, not as prose in a spec.
3. Queries over the model (impact, star view, open questions) for people and agents.
4. Scoped context: an agent gets the slice of the model its task touches.
5. Lean quality: classify every return by root cause and design it out of the line.
6. A try run before code, as the cheapest gap finder there is.

**Don't adopt (yet)**

- **BPMN tooling and an "Architect's IDE".** Out of scope for a zero-dependency CLI. Mermaid in Markdown renders on GitHub, in most editors, and can render in the dashboard. That's enough to start.
- **A deterministic compiler from model to code.** The series itself calls this "the work ahead". Use determinism where it's cheap today: generate types, stubs and transition tables from contracts and state machines.
- **Full upfront modelling.** It's what killed MDA and UML in business software, as Part 2 admits. Model one process at a time, when a feature touches it.

**Weigh the evidence.** The strongest claims ("three and a half days, twice, nobody wrote code"; 1,401 nodes for one product) come from a vendor's own clinic and aren't independently verifiable. The schedule result (50% faster coding → ~20% earlier delivery) and the p^n arithmetic stand on their own. Buildline should measure its own outcome (see *How we'll know*) rather than assume theirs.

## Proposed plan

Each phase ships on its own, keeps zero runtime dependencies, and is off or invisible for projects that don't use it. Fixes never touch the model.

### Phase 0: no new artefact (one release)

> **Status (2026-11-06):** built on branch `phase0-model-layer`, unreleased. Waiting time ships in `status`, `insights`, the `watch` inspector and the dashboard; it is estimated from history (approval gaps, blocked spans, the wait to merge), not from session files.

Quick wins that apply the ideas with what already exists.

1. **Try run** (Part 3, *What to Do on Monday*). Before a feature leaves `plan`, a fresh-context agent reads only the spec, design and plan and writes back "here's what I'd build": entities and their states, endpoints, the order of calls, the error paths. Mismatches with the spec are gaps. Implement as a mode of `buildline-spec-critic` (or a new `buildline-try-run` agent) writing `## Try run` into `spec.md`; at L1–L2 the person reads it when approving the plan.
2. **Root cause on every return** (P1-04). `feature.mjs move <id> build` from verify/review takes `--cause spec|design|plan|process|code` (required from verify/review) and the history records it. The ship station, and a new `buildline insights` command, list the top causes. Recurring `process` causes suggest a new gate; recurring `spec` causes suggest a line in `principles.md` or the spec template. The person decides; Buildline only proposes.
3. **Flow of work, forward and back** (P2-07). From existing `history`, show per station: entries, returns and where returns went. A `watch` panel (`f`, like `c` for changes) and a dashboard chart. It answers "where does our line leak?" with data we already have.
4. **Behaviour at the edge** (Session 05). Add `#### Edge behaviour` to the design template: for each screen action, which call is made, and what the UI does on success, validation error, auth failure, timeout and an unexpected shape, as a small Mermaid sequence diagram. The verifier tests the unhappy branches it lists.
5. **Read-only acceptance tests** (Session 05, Session 02). A `review.lockedTests` glob (e.g. `tests/acceptance/**`) that the guard hook protects during build like `## Acceptance`. Changes need a person, like sensitive paths.
6. **Waiting time** (Session 04). From history and session files, show per feature how long it waited on people vs agents. Put it in `buildline status` and the inspector. It makes "the date is a design problem" visible.

### Phase 1: the model, text first (one or two releases)

A small, typed, ID'd model in `.buildline/model/`, readable in any editor and reviewable in a PR.

```text
.buildline/model/
  README.md                  the types below, one paragraph each
  processes/BP01-onboard-customer.md
  interactions/SI01.01-create-login.md
  components/CustomerManager.md
  contracts/POST-accounts.md       (or a pointer to openapi.yaml)
  entities/Account.md              fields + Mermaid stateDiagram
  questions.md                     open questions across the system, with status
```

- **Types** (a cut-down Semantic Model): `process`, `interaction`, `component`, `contract`, `entity` (with states), `rule`. One file per element: YAML frontmatter for id, type and links (`realises`, `calls`, `owns`, `implements: [src/…]`), a Mermaid view, and a short page. Steps tables and Q&A tables as in P3-02.
- **Script**: `feature.mjs model add|link|show|check`. `check` validates ids, dangling links and duplicate names (`Order.status` vs `Order.state`), and fails as a gate when asked to.
- **Onboarding seeds it** (the F-16 scan). `buildline-mapper` already traces one request end to end; extend it to propose the first components, entities and one interaction with ids, for a person to accept.
- **Design writes a model delta.** For features and epics, the design station writes `## Model changes` in the spec: elements added, changed or removed, with the Mermaid views. The design approval (and the try run) is a review of that delta. Specs reference model ids in requirements (`R2 realises SI01.01`).
- **Ship applies the delta** to `.buildline/model/` instead of (or as well as) prose in `context/architecture.md`. Every PR shows the model diff next to the code diff: "revision C".
- **Sized to the change.** `fix` skips it entirely. A `feature` may say "no model change" with a reason. An `epic` must have one.

### Phase 2: the AI walks the graph (one or two releases)

- **Graph index.** `feature.mjs model graph` builds `.buildline/model/graph.json` (nodes, edges) from the files plus tagged commits (`[004/T1]` → files → `implements`). Deterministic, rebuilt by a hook, never hand-edited.
- **Queries for agents and people.** `model impact <id>` (what a change touches, n hops), `model star <id>` (P3-06), `model questions`. Stations use them instead of reading all of context: the plan station asks for the impact of the delta; review asks "does the diff touch anything the delta didn't declare?"
- **Scoped slices.** Tasks get `--touches SI01.01,Account`; the build station loads only those elements and their neighbours. This keeps context flat as the system grows.
- **Conformance review** (P2-07 has a *Conformance review* stage). The reviewer compares what was built (call order, states reached, names) with the delta, and flags drift either way: code that does something the model doesn't say, or a model change nobody built.
- **Views in the dashboard.** Render the Mermaid views and a star view per element. A feature's inspector lists the elements it touches.

### Phase 3: the line follows the network (later)

- **Dependencies, not just order** (P2-06, P2-10). Tasks get `--after T1,T3`; the plan station writes the network; `status` shows the critical path. Autopilot runs off-path tasks in parallel worktrees, each with its scoped slice, and integrates by checking against the model.
- **Determinism after the model.** Generators for the cheap cases: types and request validators from contracts, transition tables and exhaustive tests from entity state machines. Generated files are locked like acceptance.
- **Competing reviewers** (Session 05). `review.secondOpinion: "<model>"` runs an independent reviewer on a different model; agreement filters, disagreement goes to the person.
- **Runtime reads the design** (P3-07). Optional: tag traces or metrics with interaction ids so production data points back at the model. It reads the model, never changes it.

## How we'll know it works

Measure on Buildline's own repo and one or two real projects, before and after each phase:

- **Returns per feature**, split by station and root cause. The model should cut `spec` and `design` returns from verify and review.
- **Review rounds** and features hitting the 3-round block.
- **Try-run gaps found** vs defects found later in verify for the same features.
- **Time waiting on people** vs agent time per feature.
- **Context size** loaded by the build station per task (should stay flat as the model grows, with scoped slices).
- **Naming drift** caught by `model check` (duplicate names, dangling links) that would otherwise reach review.

## Open questions for us

1. Should the model replace `context/architecture.md` over time, or live alongside it? (Proposal: alongside in Phase 1; `architecture.md` keeps stack, conventions and hazards, the model takes modules, flows and data.)
2. Mermaid only, or also accept PlantUML / BPMN XML from teams that already have them? (Proposal: Mermaid as the canonical view; other formats as attachments the model links to.)
3. Who owns the model at each autonomy level? (Proposal: like acceptance, a person approves model deltas at L1–L3; at L4 the agent may apply them, and they still appear in the PR.)
4. How much of Phase 0 belongs in the next release? (Proposal: try run, root cause and the flow view first; they need no new files and test the core claim cheaply.)
