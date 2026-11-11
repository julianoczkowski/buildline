## Software factory

This project runs a **software factory**: every change moves through a short, spec-driven pipeline with real quality gates. Humans own the *what* and the *why*; agents do most of the *how*, and nothing is called done without evidence.

**Start here:** read `.buildline/buildline.json` (config), `.buildline/principles.md` (non-negotiables) and the `.buildline/context/` files before planning any change.

### Pipeline

```
intake ─▶ spec ─▶ design ─▶ plan ─▶ build ─▶ verify ─▶ review ─▶ ship
          (PM)    (design)  (eng)   (agent)  (agent)   (agent+human)
```

Route by size, never by habit:

| Type | When | Stations |
|---|---|---|
| `fix` | Bug or small, well-understood change (≤ ~1 file, no new UX) | intake → build → verify → ship |
| `feature` | New behaviour, new UI, or touches several modules | all stations |
| `epic` | Too big for one PR | intake → spec → split into features |

Each station has a playbook in `.buildline/stations/<station>.md`. Read the playbook before doing that station's work.

### Where things live

- `.buildline/features/<id>-<slug>/feature.json` — state: status, approvals, tasks (each with `passes`), history. Change it only with `node .buildline/bin/feature.mjs` (run it with no arguments for usage), never by hand.
- `.buildline/features/<id>-<slug>/spec.md` — the single source of truth for that change
- `.buildline/features/<id>-<slug>/progress.md` — append-only work log so any session can resume
- `.buildline/context/` — living product, architecture and design knowledge (update it when you ship)

### Quality gates

Run `node .buildline/bin/gates.mjs` (or `npx buildline gates`). Configured gates:

{{gatesList}}

A task only gets `"passes": true` after the gates pass **and** its own verification step has been run and observed.

### Rules for agents

1. **One feature, one task at a time.** Pick the first task with `"passes": false`, finish it, record evidence, commit, then move on. During build, edit only the files the plan lists (`node .buildline/bin/feature.mjs scope <id>`); if another file really has to change, add it with a reason (`scope <id> add <path> --why "…"`) so the reviewer sees it.
2. **Never weaken the checks.** Do not delete, skip, or loosen tests, acceptance scenarios or gates to make them pass; tests under `review.lockedTests` can't be changed at all during build. If a check is wrong, stop and say so. When verify or review sends work back, record where the problem started with `--cause`.
3. **Never edit the `acceptance` section of a spec during build.** It belongs to the spec owner.
4. **Leave a trail.** Append to `progress.md` at the end of every work session: what changed, what was verified, what is next.
5. **Respect the autonomy level** (`autonomy` in `buildline.json`): pause for human approval where the station playbook says to Record an approval (including `sensitive`, for paths in `review.sensitive`) only after the person said yes in this conversation, never with `--force` to get around one.
6. **Small, reversible steps.** Prefer many small commits over one large one. Match the existing code style.
7. **Ask, don't guess,** when the spec is ambiguous about user-facing behaviour.
8. **Record state with the feature script.** `node .buildline/bin/feature.mjs move|task|log|block|approve …` stamps real times, keeps the history the team watches live, and refuses moves that skip a required approval. Never edit `feature.json` by hand.
9. **Mark it blocked before you ask.** When you need an answer from a person, run `node .buildline/bin/feature.mjs block <id> "<the question>"`, then ask. When they answer, run `node .buildline/bin/feature.mjs unblock <id>` and carry on.
   **Drop a feature only when a person says so in this conversation**, never on your own initiative: `node .buildline/bin/feature.mjs drop <id> "<their reason>" --by "<their name>"` (add `--branch <name>` if unshipped work lives on a branch). Don't use `block` or `move … done` for work that won't ship.
10. **Respect model routing.** `models` in `buildline.json` says who runs each station.
    - **Another CLI** (e.g. `"review": "codex"`): hand it off with `npx buildline step <station> <id> --headless` and summarise the result instead of doing it yourself.
    - **Another Claude model** (e.g. `"spec": "fable"`): the station's slash command switches model by itself when the person types it. You can't switch models, and opening the station yourself keeps yours. So when the next station runs on a different model than you, end with "Next: type `/buildline-<station> <id>`, it runs on <model>." Don't ask the person to switch models first; if they ask you to run it on that model, tell them to type that command. For stations that don't need the person (build, verify, review, and in the autopilot loop), you may instead run `npx buildline step <station> <id> --headless`, which runs it on its model, and summarise the result.
11. **Weigh what a reviewer says; don't just obey it.** For each finding from a subagent (spec critic, simplicity check, try run, reviewer), decide one of:
    - **fix** it: the finding is right;
    - **contest** it: it's wrong, and you can point at evidence the reviewer could have read (a file and symbol, or a line of the spec). "That was intentional" isn't evidence;
    - **ask** the person: it's wrong, but the evidence is only in someone's head (a team convention, a decision made in a meeting). Don't fix it, and don't add text only to satisfy a reviewer that had no context;
    - **decline** it: it's minor. Note it and move on.
    Say which, in one line per finding, where the station's playbook records results. After fixing, re-run the same reviewer **once** to check the fixes; whatever is still open after that goes to the person as an open item, not into another round.
    **A reviewer that failed didn't review.** If a subagent errors, times out or returns nothing, try once more. If it fails again, record it as *not run* (`feature.mjs log <id> "<reviewer>: not run (<why>)"`) and treat the check as not done: a verification or review without its report never counts as a pass.
