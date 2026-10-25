# Customising

Buildline is meant to be bent to your team. Everything is plain markdown and JSON.

## What's yours vs managed

| Path | Ownership | On `buildline update` |
|---|---|---|
| `.buildline/buildline.json` | yours | never touched |
| `.buildline/principles.md`, `.buildline/context/*` | yours | never touched |
| `.buildline/features/**` | yours | never touched |
| `.buildline/stations/*`, `.buildline/templates/*`, `.buildline/bin/*` | managed | updated **only if you haven't edited them** |
| `.claude/skills/buildline-*`, `.claude/agents/buildline-*`, `.cursor/rules/buildline.mdc` | managed | same |
| `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` | yours, with a managed block | only the block between `buildline:start` / `buildline:end` |
| `.claude/settings.json` | yours | Buildline hooks and gate permissions merged in, nothing removed |

Managed files are tracked by content hash in `.buildline/manifest.json`. If you edit one, `update` reports it as **kept**; `update --force` overwrites it.

## Common changes

**Change a station.** Edit `.buildline/stations/<station>.md`. The Claude skill, Cursor rule and Gemini import all point to the same file.

**Change the spec template.** Edit `.buildline/templates/spec.md`. Keep the `##` headings that tooling reads (`Acceptance`, `Requirements`, `Verification`, `Review`), and add your own sections freely.

**Add a gate.** Add to `gates` in `buildline.json`, then run `npx buildline update` to refresh the gates list in `AGENTS.md` and the Claude permissions.

**Add project rules.** Write them in `AGENTS.md` *outside* the Buildline block, or in `principles.md` if specs and reviews should be checked against them. For path-specific rules in Claude Code, use `.claude/rules/*.md` with `paths:` frontmatter.

**Change models.** Use `npx buildline models set <station> <model>`, or a preset. Stations can run on Claude models, Codex or Gemini. See [Models per station](models.md).

**Add your own subagent or skill.** Put it next to the Buildline ones without the `buildline-` prefix, so updates never touch it.

## Uninstall

```bash
npx buildline remove --dry-run   # preview
npx buildline remove
```

This removes managed files you haven't edited, strips the Buildline blocks, and removes Buildline hooks and permissions from `.claude/settings.json`. Your features, context, principles and `buildline.json` stay; delete `.buildline/` yourself if you want them gone.
