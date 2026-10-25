# Station: onboard

Goal: give every future agent session the context a new senior teammate would need on day one, in as few words as possible. Output lives in `.factory/context/` and `.factory/factory.json`.

First decide which path applies: if the repo has little or no source code it is **greenfield**; otherwise it is **brownfield**.

---

## Greenfield (empty or near-empty project)

Run a short interview. Ask **one question at a time**, offer sensible defaults, and stop once you have enough. Skip anything the person has already told you.

1. What are we building, in one sentence? Who is it for?
2. What problem does it solve for them, and how do they solve it today?
3. What does success look like in 3 months? (one or two measurable signals)
4. What is in scope for the first release, and what is explicitly out?
5. Platform and constraints: web, mobile, CLI, API? Any required stack, hosting, compliance, or budget limits?
6. Look and feel: any brand, design system, or reference products?

Then:

- **Recommend a stack** that fits the answers. Give a one-line reason and one alternative. Prefer boring, well-documented choices that agents know well. Wait for confirmation (unless autonomy is L4).
- **Scaffold** with the framework's official generator (e.g. `npm create vite@latest`, `npx create-next-app@latest`, `uv init`, `cargo new`). Don't hand-write what a generator produces.
- Add a test runner and a linter if the generator didn't, plus one passing smoke test.
- Fill in `factory.json → gates` with the real commands and run `node .factory/bin/gates.mjs` until it passes.
- Write the context files (below) and commit: `chore: scaffold project and onboard factory`.
- Suggest the first features as `/factory-new …` commands, ordered as a thin vertical slice first.

## Brownfield (existing code)

Don't interview first; read first. Delegate the reading to the `factory-mapper` subagent if available (it keeps the main context clean), and ask it for a summary you can turn into the context files.

What to find out:

- **Product:** README, docs, landing copy, route names. What does it do, and for whom?
- **Architecture:** entry points, main modules and their responsibilities, data stores, external services, how a request flows through the system.
- **Conventions:** folder layout, naming, state management, error handling, testing patterns. Quote one real file path as the example for each convention.
- **Design system:** tokens/CSS variables, theme files, component library, Storybook, icon set, spacing and type scales.
- **Commands:** how to install, run, test, lint, type-check, build. Run them. A gate that doesn't run is worse than no gate.
- **Hazards:** generated code, vendored folders, fragile areas, secrets, anything that must not be touched.

Then ask the person only what code can't tell you: the product's goals, who the users are, what's planned next, and what "good" looks like to them.

Update `factory.json → gates` with commands you have **seen pass** (or note the ones currently failing in `progress` so nobody is surprised).

---

## Context files to write

Keep each file under ~120 lines. Prefer bullet points and file paths over prose. Replace every `TODO`.

- `.factory/context/product.md`: vision, users, problems, success metrics, scope, non-goals, glossary.
- `.factory/context/architecture.md`: stack, module map, data flow, key decisions (with the reason), hazards.
- `.factory/context/design.md`: design principles, tokens, components, patterns, accessibility baseline, where the source of truth lives (Figma link, Storybook, token files).
- `.factory/principles.md`: review the defaults with the person and adjust. These are the rules every change is checked against.

Finish with a short summary of what you learned, what's still unknown, and the recommended next step.
