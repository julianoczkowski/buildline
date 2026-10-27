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

1. **One feature, one task at a time.** Pick the first task with `"passes": false`, finish it, record evidence, commit, then move on.
2. **Never weaken the checks.** Do not delete, skip, or loosen tests, acceptance scenarios or gates to make them pass. If a check is wrong, stop and say so.
3. **Never edit the `acceptance` section of a spec during build.** It belongs to the spec owner.
4. **Leave a trail.** Append to `progress.md` at the end of every work session: what changed, what was verified, what is next.
5. **Respect the autonomy level** (`autonomy` in `buildline.json`): pause for human approval where the station playbook says to Record an approval (including `sensitive`, for paths in `review.sensitive`) only after the person said yes in this conversation, never with `--force` to get around one.
6. **Small, reversible steps.** Prefer many small commits over one large one. Match the existing code style.
7. **Ask, don't guess,** when the spec is ambiguous about user-facing behaviour.
8. **Record state with the feature script.** `node .buildline/bin/feature.mjs move|task|log|block|approve …` stamps real times, keeps the history the team watches live, and refuses moves that skip a required approval. Never edit `feature.json` by hand.
9. **Mark it blocked before you ask.** When you need an answer from a person, run `node .buildline/bin/feature.mjs block <id> "<the question>"`, then ask. When they answer, run `node .buildline/bin/feature.mjs unblock <id>` and carry on.
10. **Respect model routing.** `models` in `buildline.json` says who runs each station.
    - **Another CLI** (e.g. `"review": "codex"`): hand it off with `npx buildline step <station> <id> --headless` and summarise the result instead of doing it yourself.
    - **Another Claude model** (e.g. `"spec": "fable"`): the station's slash command switches model by itself when the person types it. You can't switch models, and opening the station yourself keeps yours. So when the next station runs on a different model than you, end with "Next: type `/buildline-<station> <id>`, it runs on <model>." Don't ask the person to switch models first; if they ask you to run it on that model, tell them to type that command. For stations that don't need the person (build, verify, review, and in the autopilot loop), you may instead run `npx buildline step <station> <id> --headless`, which runs it on its model, and summarise the result.
