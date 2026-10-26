# Station: spec

Goal: a spec short enough to actually read, precise enough that "done" can be checked by someone who didn't write the code. Owner: product (PM), with anyone's input.

Resolve the feature from `$ARGUMENTS` (id like `004` or a slug). If none is given, use the most recently updated feature whose status is `spec`, or ask.

## 1. Load context

Read `spec.md → ## Brief`, `.buildline/context/product.md`, and `.buildline/principles.md`. Skim the code areas involved so the requirements fit what already exists.

## 2. Grill, briefly

Interview the person **one question at a time** until these are clear. Offer your best guess with each question so they can just say "yes".

- Who exactly is the user, and what are they trying to get done?
- What is the smallest version that delivers the outcome?
- What happens on the unhappy paths: empty, error, slow, offline, no permission, huge data?
- What must **not** change (existing behaviour, APIs, data)?
- How will we know it worked after release (a metric, an event, a support ticket that stops)?

Stop as soon as you could write the acceptance scenarios with confidence. Five to eight questions is typical; for small features, two or three.

## 3. Write the spec

Fill these sections of `spec.md` (keep the headings exactly; tooling reads them):

- `## Requirements`: numbered, testable statements (`R1`, `R2`, …). Use "must" for required and "should" for nice-to-have. No implementation details.
- `## Acceptance`: scenarios in Given / When / Then form, numbered `A1`, `A2`, … Cover the main path, the important unhappy paths, and the "must not change" items. Each scenario must be observable from the outside: UI, API response, CLI output, or a database state.
- `## Out of scope`: what we are deliberately not doing.
- `## Open questions`: anything unresolved, with an owner.

Aim for one screen of text. If it's getting longer than two, the feature is probably an epic.

## 4. Critique

Ask the `buildline-spec-critic` subagent to review `spec.md` (it checks for untestable requirements, missing unhappy paths, contradictions and hidden scope). Fix what's valid; mention anything you chose to leave and why.

## 5. Epics: split

If `type` is `epic`, end by proposing 2–6 child features, each a thin, shippable vertical slice. With the person's agreement, create them (`npx buildline new "<title>" --type feature --parent <epic-id>`) and copy the relevant requirements and acceptance into each child. The epic stays at `spec` as an index.

## 6. Approval and handoff

- **Approval:** the spec needs human approval when autonomy ≤ 3. Ask: "Approve this spec?" Only when the person explicitly approves, record it: `node .buildline/bin/feature.mjs approve <id> spec --by "<their name>"`. Never record an approval on someone's behalf. They can also approve in `npx buildline ui` or `npx buildline watch`. Until then the feature stays at `spec` and the board shows it waiting on them.
- Once approved (or at L4), move on: `node .buildline/bin/feature.mjs move <id> design --note "<one line>"`, or `plan` if the change has no UX or architecture decisions (say why). The script refuses the move while a required approval is missing.
- Record what happened: `node .buildline/bin/feature.mjs log <id> "spec drafted, waiting for approval"` (or what changed).
- Suggest the next command.
