# Changelog

## 0.1.0 · 2026-10-25

First private release.

- `npx factory-cli` interactive setup with stack detection (JS/TS, Python, Go, Rust, Ruby, PHP, Java/Kotlin, .NET, Dart/Flutter, Swift) and gate discovery.
- Stations: front door, onboard (greenfield + brownfield), intake, spec, design, plan, build, verify, review, ship, autopilot.
- Claude Code: 11 skills, 5 subagents, SessionStart briefing and acceptance-lock hooks, `/goal` autopilot via `factory run`.
- Agent-agnostic: AGENTS.md block, Cursor rule, GEMINI.md import.
- Local dashboard (`factory ui`): board, spec editing, approvals, context editor.
- Safe install/update/remove: marked blocks, hash-tracked managed files, settings merge.
- Optional GitHub Actions workflow: gates on PRs + Claude review against the spec.
