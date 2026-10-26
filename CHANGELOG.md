# Changelog

## Unreleased
- A Claude Code session lets go of its feature once that feature is done, or after `/clear`, so reopening an old session no longer marks a finished feature as *Needs you*. Done features never show live sessions.
- Recording progress on another feature (`feature.mjs task 2 …`) moves the session to that feature; reading one still doesn't.

## 0.8.0 · 2026-10-26
- **Waiting on you, or on something else?** A session that ends its turn while a CI watch, a background shell or a background agent is still running now shows as *Background* (a turning clock in `watch`), not *Needs you*. It needs you again only when that work is done, or if the agent asked a question.
- *Needs you* also covers questions and permission prompts in the middle of a turn, and the card shows what the agent said or asked.
- Every session shows how long it has been in its current state and how long it has run, e.g. `working 4m · up 1h12m` in `watch` and *In the background · 6m* on the dashboard.
- `watch`: press `e` to hide the events panel and give the inspector the full width; `e` again shows it.
- Long foreground commands, such as a 20-minute test run, stay *Working* instead of dropping off after 10 minutes.
- Run `npx buildline@latest update` to get the new hooks (`PostToolUse`, `Notification`), then restart any Claude Code sessions.

## 0.7.0 · 2026-10-26
- **Sound.** `watch` and the dashboard chime when a feature starts waiting on you (needs your reply, or blocked) or ships. Mute with `m` in `watch` or the dashboard's Sound button, start silent with `--quiet`, or turn it off with `buildline sound off`.

## 0.6.0 · 2026-10-26
- **Live sessions.** Claude Code hooks now note which session works on which feature and what it's doing. `watch` and the dashboard show it: *Working* (with the latest step, ×2 for two sessions), *Needs you* when a session waits for your reply, and the comet only runs while a session is really working.
- **Blocked means blocked.** When an agent needs a decision it marks the feature blocked with its question, and the board shows the question.
- **`.buildline/bin/feature.mjs`**: agents record tasks, moves, notes and blocks through it, with real timestamps. A hook stops hand edits to `feature.json`, which caused made-up times and missing history.
- **Approvals are enforced.** A feature can't move past spec, design or plan without the approval its autonomy level requires, from agents or `buildline move` (use `--force` to override).
- Fixes fill in their own brief and reproduction scenario instead of building against an empty spec.
- Dashboard cards keep long session details on one line; the Done column no longer shows a model.

## 0.5.1 · 2026-10-25
- Docs: how to upgrade an existing project to a new release (`npx buildline@latest update`), in the README, Getting started, FAQ and CLI reference.

## 0.5.0 · 2026-10-25
- `buildline watch` (also `top`): a live view of the line in your terminal. Every feature runs along its own track through the stations, with the model each station uses, who it's waiting on, its tasks and history, and a live event log. Approve and open stations from the keyboard. `--once` prints a single frame.

## 0.4.0 · 2026-10-25
- Models are now yours to pick. The picker (`buildline models`, and during `init`) lists the aliases your installed Claude Code advertises, every Claude model from the Anthropic API when `ANTHROPIC_API_KEY` is set, Codex and Gemini when installed, and accepts any typed model name or id. Choose by phase (planning, building, checking) or per station.
- `buildline models check` reports what each choice resolves to today, e.g. `fable → claude-fable-5-1`.
- `buildline models set` accepts phases: `models set planning fable`. `init --models` takes `planning=fable,building=opus`.
- Removed the built-in model presets (`models preset`, `init --models balanced`): they hard-coded model choices.

## 0.3.1 · 2026-10-25
- Docs site at https://julianoczkowski.github.io/buildline/, built from `docs/` by `npm run site`.
- Releases publish from GitHub Actions on a version tag (`npm run release -- patch`), with npm provenance.
- Tests now run on Windows with Node 20.

## 0.3.0 · 2026-10-25

First release.

- `npx buildline` interactive setup with stack detection (JS/TS, Python, Go, Rust, Ruby, PHP, Java/Kotlin, .NET, Dart/Flutter, Swift) and gate discovery.
- Stations: front door, onboard (greenfield + brownfield), intake, spec, design, plan, build, verify, review, ship, autopilot.
- Models per station: Claude model aliases or ids, or hand a station to Codex CLI or Gemini CLI. `buildline models`, `buildline step`, and presets (`session`, `balanced`, `budget`, `second`).
- Claude Code: 11 skills, 5 subagents, SessionStart briefing and acceptance-lock hooks, `/goal` autopilot via `buildline run`.
- Agent-agnostic: AGENTS.md block, Cursor rule, GEMINI.md import.
- Local dashboard (`buildline ui`): board, spec editing, approvals, context editor.
- Safe install/update/remove: marked blocks, hash-tracked managed files, settings merge.
- Optional GitHub Actions workflow: gates on PRs + Claude review against the spec.

Versions 0.1.0–0.2.3 of the `buildline` name were used by an unrelated package in 2014 and can't be reused on npm, so Buildline starts at 0.3.0.
