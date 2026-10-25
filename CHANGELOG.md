# Changelog

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
