# Station: intake (new)

Goal: turn a raw idea, request or bug report into a feature folder with the right size and a one-paragraph brief. This should take a couple of minutes, not an hour.

## 1. Understand the request

From `$ARGUMENTS` or the conversation, get:

- **What** should change, in the user's words.
- **Why** it matters (who is affected, what it costs them today).
- For bugs: steps to reproduce, expected vs actual behaviour, and where it was seen.

Ask at most two clarifying questions. If something is still unknown, write it down as an open question in the brief instead of blocking.

## 2. Size it

Look at the code briefly (search, don't read everything) and pick a type:

- `fix`: a bug or a small, well-understood change; roughly one file or one component; no new UX decisions.
- `feature`: new behaviour or UI, touches several modules, or needs a product or design decision.
- `epic`: more than one PR's worth, or several independent user outcomes. Plan to split it.

State the type and the reason in one line. The person can override.

## 3. Create the feature

Run `node .buildline/bin/feature.mjs new "<title>" --type <type>` (add `--owner "<name>"` if the person told you who owns it). It creates `.buildline/features/<id>-<slug>/` with `feature.json`, `spec.md` and `progress.md`, and sets the starting status: `build` for a fix, `spec` otherwise.

Then fill in `spec.md → ## Brief` (problem, who, outcome, open questions).

## 4. Route

- `fix` → it starts at `build`. In `spec.md`, also fill `## Acceptance` with a single scenario that reproduces the bug (it must fail before the fix). Next: `/buildline-build <id>`.
- `feature` → it starts at `spec`. Next: `/buildline-spec <id>`.
- `epic` → it starts at `spec`. Next: `/buildline-spec <id>`, which will end by proposing the split into child features.

Record why: `node .buildline/bin/feature.mjs log <id> "<type and one-line reason>"`.
