# Station: review

Goal: catch what tests don't (wrong behaviour against the spec, security holes, maintainability problems) and prepare the change so a human reviewer can approve it in minutes.

Resolve the feature from `$ARGUMENTS`, or use the most recent feature with status `review`.

## 1. Get the diff

Work out the base (usually the default branch) and collect the full diff for this feature: `git diff <base>...HEAD`. If the feature isn't on its own branch, use the commits tagged with the feature id.

**Re-review.** If this feature has been reviewed before (`metrics.reviewRounds` in `feature.json`, or an earlier `## Review` in `spec.md`), review only what changed since then: `git diff <last reviewed commit>..HEAD`. Pass the earlier findings along so they aren't raised again.

## 2. Independent review

Ask the `buildline-reviewer` subagent to review the diff against `REVIEW.md` (at the repo root, written by the code owners), `spec.md` and `.buildline/principles.md`. In Claude Code you can also run `/code-review` for an extra correctness pass.

The reviewer reports only findings that matter, each with file:line, severity (`blocker` / `should-fix` / `nit` / `pre-existing`) and a concrete fix:

- **Spec fit:** every requirement implemented; nothing extra that wasn't asked for.
- **Correctness:** edge cases, error handling, concurrency, off-by-one, null handling.
- **Security:** injection, authz checks on every new endpoint, secrets, unsafe input handling, dependency risk.
- **Maintainability:** follows existing conventions, no dead code or debug leftovers, names make sense.
- **Tests:** the tests actually assert the behaviour (not just "doesn't crash"); no skipped or weakened tests.
- **UX (UI changes):** matches `## Design`; use the `buildline-design-reviewer` subagent with screenshots from `evidence/`.

## 3. Check the findings

Reviewers over-report, and every false alarm costs a round of rework. Hand the `blocker` and `should-fix` findings to the `buildline-finding-checker` subagent, which tries to confirm each one from the code (reading, and running a test or script where it's cheap). Keep only the findings it confirms. Findings it marks `pre-existing` are treated as pre-existing. If subagents aren't available, check each finding yourself the same way before acting on it.

## 4. Security review

If the diff touches authentication, authorization, input handling, secrets, payments or dependencies, run a dedicated security pass as well: `/security-review` in Claude Code if available, otherwise ask the reviewer again for security findings only. Confirmed security findings are blockers.

## 5. Act on findings

- Confirmed `blocker` and `should-fix`: add a task per finding (one per class when the same mistake repeats), go back to `build`, and fix it. Fixes go through the normal task loop, gates included.
- `nit`: fix if trivial, otherwise list in the PR description.
- `pre-existing`: don't fix it in this feature. Note it in `progress.md` under "Noticed" and suggest a fix for it (`/buildline fix …`) at the end.
- Rejected findings: drop them, with one line each in `## Review` saying why.

## 6. Human review packet

Write `## Review` in `spec.md`. Start with the count (`2 should-fix fixed, 1 nit left`, or `nothing to fix`). Then: a summary of what changed and why, risk areas to look at first (with file paths), what was verified and how (link to `## Verification`), how to revert it, and remaining nits. This becomes the PR description.

## 7. Route

Blockers and should-fix findings become tasks (`node .buildline/bin/feature.mjs task <id> add "…"`) and the feature goes back with `node .buildline/bin/feature.mjs move <id> build --note "<n> findings"`. After the third time review sends a feature back, the move marks it blocked: the person decides whether to keep fixing or rethink the approach. Don't work around that.

When there are none: `node .buildline/bin/feature.mjs move <id> ship --note "review clean"`, next `/buildline-ship <id>`. If the feature touches sensitive paths (`review.sensitive` in `buildline.json`, CI workflows by default), the move stops and asks for a person's approval: show them the files, and record the approval only if they say yes. A human still approves the merge at every autonomy level.
