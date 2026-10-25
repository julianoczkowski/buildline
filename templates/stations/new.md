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

Preferred: run `npx buildline new "<title>" --type <type>`. It creates `.buildline/features/<id>-<slug>/` with `feature.json`, `spec.md` and `progress.md`.

If the CLI isn't available, do it by hand: next id = highest existing id + 1, zero-padded to 3 digits; slug = kebab-case title (max 5 words); copy the files from `.buildline/templates/`.

Then fill in `spec.md → ## Brief` (problem, who, outcome, open questions) and set `owner` in `feature.json` if the person told you who owns it.

## 4. Route

- `fix` → set status to `build`. In `spec.md`, also fill `## Acceptance` with a single scenario that reproduces the bug (it must fail before the fix). Next: `/buildline-build <id>`.
- `feature` → status `spec`. Next: `/buildline-spec <id>`.
- `epic` → status `spec`. Next: `/buildline-spec <id>`, which will end by proposing the split into child features.

Append a `history` entry to `feature.json`: `{ "at": "<ISO date>", "station": "new", "note": "<type and one-line reason>" }`.
