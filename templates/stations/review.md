# Station: review

Goal: catch what tests don't (wrong behaviour against the spec, security holes, maintainability problems) and prepare the change so a human reviewer can approve it in minutes.

Resolve the feature from `$ARGUMENTS`, or use the most recent feature with status `review`.

## 1. Get the diff

Work out the base (usually the default branch) and collect the full diff for this feature: `git diff <base>...HEAD`. If the feature isn't on its own branch, use the commits tagged with the feature id.

## 2. Independent review

Ask the `factory-reviewer` subagent to review the diff against `spec.md` and `.factory/principles.md`. In Claude Code you can also run `/code-review` for an extra correctness pass.

The reviewer reports only findings that matter, each with file:line, severity (`blocker` / `should-fix` / `nit`) and a concrete fix:

- **Spec fit:** every requirement implemented; nothing extra that wasn't asked for.
- **Correctness:** edge cases, error handling, concurrency, off-by-one, null handling.
- **Security:** injection, authz checks on every new endpoint, secrets, unsafe input handling, dependency risk.
- **Maintainability:** follows existing conventions, no dead code or debug leftovers, names make sense.
- **Tests:** the tests actually assert the behaviour (not just "doesn't crash"); no skipped or weakened tests.
- **UX (UI changes):** matches `## Design`; use the `factory-design-reviewer` subagent with screenshots from `evidence/`.

Reviewers tend to over-report. Discard style opinions that the linter doesn't enforce, and anything speculative without a concrete failure scenario.

## 3. Act on findings

- `blocker` and `should-fix`: add a task per finding, go back to `build` (increment `metrics.reworks`), and fix it. Fixes go through the normal task loop, gates included.
- `nit`: fix if trivial, otherwise list in the PR description.

## 4. Human review packet

Write `## Review` in `spec.md`: a summary of what changed and why, risk areas to look at first (with file paths), what was verified and how (link to `## Verification`), and remaining nits. This becomes the PR description.

## 5. Route

When there are no open blockers or should-fix findings: status `ship`, history entry, next `/factory-ship <id>`. A human still approves the merge at every autonomy level.
