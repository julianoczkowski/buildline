# Station: ship

Goal: get the change merged cleanly and leave the factory smarter than it was. The second part is what makes the factory improve over time instead of rotting.

Resolve the feature from `$ARGUMENTS`, or use the most recent feature with status `ship`.

## 1. Final check

- `node .buildline/bin/gates.mjs` is green on the latest commit.
- All tasks have `"passes": true`; `## Verification` shows every scenario passing; `## Review` has no open blockers.

## 2. Pull request

- Make sure the work is on a feature branch named like `feat/<id>-<slug>` (or `fix/…`). Ask before pushing.
- Open a PR (with `gh pr create` if available). Use the `## Review` section as the body, link the spec file, and list the acceptance scenarios with their results.
- If the project keeps a CHANGELOG, add an entry written for users, not developers.
- Merging is a human decision. Never merge on your own, whatever the autonomy level.

## 3. Fold learnings back (living context)

Specs are written for one change; the context files carry what lasts. Update them in the same PR:

- `.buildline/context/architecture.md`: new modules, data model changes, decisions made in `### Technical` that future work must respect.
- `.buildline/context/design.md`: new components, patterns or tokens introduced.
- `.buildline/context/product.md`: new capabilities and glossary terms.
- `AGENTS.md` (outside the Buildline block) or `.buildline/principles.md`: any **recurring** mistake an agent made during this feature that a one-line rule would have prevented. Keep these lean; delete rules that no longer earn their place.

## 4. Close

- Set status to `done`, fill `metrics.shippedAt`, append a `history` entry with the PR link.
- Append a final `progress.md` entry.
- Suggest the next feature in the queue (`/buildline`).
