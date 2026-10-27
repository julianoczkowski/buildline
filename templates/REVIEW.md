# REVIEW.md

What code review should care about in this repo. Buildline's reviewer reads this on every review, and so does Claude Code's own Code Review if you use it. Code owners write it; keep it short. Buildline never overwrites this file.

## What failure looks like here

<!-- One line per area, in its own terms. Examples: -->
- **API:** a request that used to succeed now fails, or returns data the caller isn't allowed to see.
- **UI:** a state (loading, empty, error) is missing, or the copy says something that isn't true.
- **Data:** a migration that can't roll back, or loses or rewrites existing rows.
- **Docs:** they lie: a command, flag or default that doesn't match the code.
- **Config:** it misroutes: a value that sends traffic, jobs or money somewhere unintended.

## Always flag

- Missing authorization on a new endpoint or action.
- Secrets, tokens or personal data in code, logs or fixtures.
- A test deleted, skipped or weakened.

## Don't flag

- Style the linter or formatter already enforces.
- Naming and structure preferences without a concrete failure.

## Skip

<!-- Paths the reviewer shouldn't read, e.g. generated code. -->
- Lockfiles, generated files, vendored code, snapshots.

## How to report

- Every finding gives a file and line as evidence, and a concrete failure scenario, not a guess from a name.
- At most 3 nits. Bugs that were there before this change are marked `pre-existing`.
- Start the summary with a count (`2 should-fix, 1 nit`), and say plainly when there's nothing to fix.
