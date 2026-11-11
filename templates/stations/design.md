# Station: design

Goal: decide *how it should look and behave* (UX) and *how it should be built* (technical design) before anyone writes production code. Owners: designer for UX, engineer for technical design. Skip either half if it doesn't apply, and say so.

Resolve the feature from `$ARGUMENTS`, or use the most recent feature with status `design`.

Read `spec.md` (Brief, Requirements, Acceptance), `.buildline/context/design.md` and `.buildline/context/architecture.md`.

## Part A: UX design (`spec.md → ## Design → ### Experience`)

Work with the designer. Ask what they already have (Figma link, screenshots, sketches, a reference product) and start from that. If they share images, describe what you see and confirm your reading.

Write down, briefly:

1. **Flow**: the steps the user takes, as a numbered list or a small mermaid flowchart. Include the entry point and where they end up.
2. **Screens and states**: for every screen or component, list the states: default, loading, empty, error, success, disabled, and any permission variants. Missing states are the most common design bug.
3. **Components**: which existing components from the design system are reused (with file paths). Anything new needs a one-line justification.
4. **Content**: key labels, messages and error copy. Plain language; say what happened and what to do next.
5. **Accessibility**: keyboard path, focus order, labels for icon-only controls, contrast, motion. Meet WCAG 2.2 AA unless `principles.md` says otherwise.
6. **Responsive behaviour**: what changes at small widths.

Use design tokens from `.buildline/context/design.md` by name. Never invent raw hex values or pixel sizes if a token exists.

Optional: for visual work, build a quick throwaway prototype (a single HTML file or a story) and share a screenshot before committing to the build. Ask the `buildline-design-reviewer` subagent to check the design against the design system and the acceptance scenarios.

## Part B: Technical design (`spec.md → ## Design → ### Technical`)

1. **Approach**: the chosen approach in a few sentences, plus the strongest alternative and why it lost, in concrete terms: cost, complexity, risk, time, or a constraint in the code. "Simpler" alone isn't a reason.
2. **Changes**: modules and files to add or change, data model or schema changes, API contracts (request/response shapes), events.
3. **Risks**: migrations, performance, security, backwards compatibility, feature flags. How each is mitigated.
4. **Test strategy**: which acceptance scenarios are covered by unit, integration or end-to-end tests, and how they'll be run.
5. **Edge behaviour** (`#### Edge behaviour`): for each action that calls an API, a service or another module, what happens on success, invalid input, an auth failure, a timeout or failure, and a response in an unexpected shape. A small table, or a Mermaid sequence diagram with `alt` branches, is enough:

   ```mermaid
   sequenceDiagram
     UI->>API: POST /carts
     alt 201
       API-->>UI: cart → show "Saved"
     else 422
       API-->>UI: errors → inline field messages, keep input
     else 401
       API-->>UI: → sign-in, then retry
     else timeout / 5xx / unexpected body
       API-->>UI: → "Couldn't save. Try again", keep input, log it
     end
   ```

   Most bugs that reach verify and review live here, in the branches nobody wrote down. The verifier tests every branch listed.

Follow the conventions in `architecture.md`. If you're breaking one, say so explicitly.

6. **Simplicity check**: hand the feature folder (path only, no summary) to the `buildline-zoom-out` subagent. It reads the technical design with no other context, searches the code for things that already do what the design adds, and flags over-building, logic in the wrong place, and alternatives rejected without a concrete reason. Handle each finding as AGENTS.md rule 11 says, and update the design where you fix one. Re-run it once if you changed the approach; anything still open goes to the person at design or plan approval. Skip this for a design with no new modules, data or contracts, and say so.

## Handoff

- **Approval:** at autonomy L1, ask for explicit design approval and record it only when given: `node .buildline/bin/feature.mjs approve <id> design --by "<their name>"`.
- Then `node .buildline/bin/feature.mjs move <id> plan --note "<one line>"`. At other levels, the designer can approve UX in the dashboard; flag the feature as waiting for design approval if UX changed and nobody has approved it yet.
- Next: `/buildline-plan <id>`.
