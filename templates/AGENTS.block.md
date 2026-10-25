## Software factory

This project runs a **software factory**: every change moves through a short, spec-driven pipeline with real quality gates. Humans own the *what* and the *why*; agents do most of the *how*, and nothing is called done without evidence.

**Start here:** read `.factory/factory.json` (config), `.factory/principles.md` (non-negotiables) and the `.factory/context/` files before planning any change.

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

Each station has a playbook in `.factory/stations/<station>.md`. Read the playbook before doing that station's work.

### Where things live

- `.factory/features/<id>-<slug>/feature.json` — state: status, approvals, tasks (each with `passes`), history
- `.factory/features/<id>-<slug>/spec.md` — the single source of truth for that change
- `.factory/features/<id>-<slug>/progress.md` — append-only work log so any session can resume
- `.factory/context/` — living product, architecture and design knowledge (update it when you ship)

### Quality gates

Run `node .factory/bin/gates.mjs` (or `npx factory-cli gates`). Configured gates:

{{gatesList}}

A task only gets `"passes": true` after the gates pass **and** its own verification step has been run and observed.

### Rules for agents

1. **One feature, one task at a time.** Pick the first task with `"passes": false`, finish it, record evidence, commit, then move on.
2. **Never weaken the checks.** Do not delete, skip, or loosen tests, acceptance scenarios or gates to make them pass. If a check is wrong, stop and say so.
3. **Never edit the `acceptance` section of a spec during build.** It belongs to the spec owner.
4. **Leave a trail.** Append to `progress.md` at the end of every work session: what changed, what was verified, what is next.
5. **Respect the autonomy level** (`autonomy` in `factory.json`): pause for human approval where the station playbook says to.
6. **Small, reversible steps.** Prefer many small commits over one large one. Match the existing code style.
7. **Ask, don't guess,** when the spec is ambiguous about user-facing behaviour.
