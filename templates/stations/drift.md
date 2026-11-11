# Station: drift

Goal: find where shipped specs and the context files no longer describe the code, and let a person decide, item by item, whether the document or the code changes. Run it weekly, or before planning work in an area that has changed a lot. It changes no code.

If `$ARGUMENTS` names a feature, check only that one. Otherwise check everything the first pass flags.

## 1. First pass: what moved

Run `npx buildline drift --json`. It lists, from git alone:

- each shipped feature whose files were changed by later commits (`changed`, `gone`, and which features or untagged commits did it),
- each `.buildline/context/` file, when it was last updated and how much code changed since.

These are candidates, not findings: a later commit may have only renamed a variable. Shipped features with nothing changed since need no check.

## 2. Check each candidate with fresh eyes

For each flagged feature, most changed first, hand the `buildline-drift-checker` subagent the feature folder path, its `changed` and `gone` files and the later commits. Do the same for each context file with 20 or more commits since its last update. One call per feature or file, so each check starts clean. Check at most 10 per run; say how many are left.

If a checker fails or returns nothing, try once more; if it fails again, list that feature as **not checked**, never as "no drift". If subagents aren't available, check each one yourself the same way, one at a time.

## 3. Report

Write `.buildline/drift/<YYYY-MM-DD>.md`:

```
# Drift · 2026-11-11
## 004 Saved carts
- A3 · empty cart shows "No saved carts" → now "Nothing here yet" (src/carts/List.tsx:41; changed by 007)
## context/architecture.md
- says API handlers live in src/routes → moved to src/api in 009
## Not checked
- 012 (checker timed out twice)
```

Then tell the person how many differences you found, in which features, and the file path.

## 4. A person decides, item by item

Ask about each difference (group the obvious ones). For each, one of:

- **The code is right** (it changed on purpose): add a dated line under `## Since shipping` at the end of that feature's `spec.md` saying what changed and which feature or commit changed it. Don't rewrite the original requirements: they record what was decided then. For a context file, update the file itself: it's meant to stay current.
- **The doc is right** (the change was a mistake): open a fix, `npx buildline new "<what to restore>" --type fix`, and link the drift report in its brief.
- **Doesn't matter**: leave it, and note "accepted" next to it in the report.

Never decide for them, and never change code at this station.

## 5. Finish

Record the run on each feature you checked: `node .buildline/bin/feature.mjs log <id> "drift: <n> differences, <decisions>"` (this is allowed on shipped features). Suggest the next command: the fixes you opened, or nothing.
