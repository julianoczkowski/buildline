# Customising

Factory is meant to be bent to your team. Everything is plain markdown and JSON.

## What's yours vs managed

| Path | Ownership | On `factory update` |
|---|---|---|
| `.factory/factory.json` | yours | never touched |
| `.factory/principles.md`, `.factory/context/*` | yours | never touched |
| `.factory/features/**` | yours | never touched |
| `.factory/stations/*`, `.factory/templates/*`, `.factory/bin/*` | managed | updated **only if you haven't edited them** |
| `.claude/skills/factory-*`, `.claude/agents/factory-*`, `.cursor/rules/factory.mdc` | managed | same |
| `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` | yours, with a managed block | only the block between `factory:start` / `factory:end` |
| `.claude/settings.json` | yours | factory hooks and gate permissions merged in, nothing removed |

Managed files are tracked by content hash in `.factory/manifest.json`. If you edit one, `update` reports it as **kept**; `update --force` overwrites it.

## Common changes

**Change a station.** Edit `.factory/stations/<station>.md`. The Claude skill, Cursor rule and Gemini import all point to the same file.

**Change the spec template.** Edit `.factory/templates/spec.md`. Keep the `##` headings that tooling reads (`Acceptance`, `Requirements`, `Verification`, `Review`), and add your own sections freely.

**Add a gate.** Add to `gates` in `factory.json`, then run `npx factory-cli update` to refresh the gates list in `AGENTS.md` and the Claude permissions.

**Add project rules.** Write them in `AGENTS.md` *outside* the factory block, or in `principles.md` if specs and reviews should be checked against them. For path-specific rules in Claude Code, use `.claude/rules/*.md` with `paths:` frontmatter.

**Change review models.** Edit `model:` in `.claude/agents/factory-*.md` (`sonnet`, `opus`, `haiku`, or `inherit`).

**Add your own subagent or skill.** Put it next to the factory ones without the `factory-` prefix, so updates never touch it.

## Uninstall

```bash
npx factory-cli remove --dry-run   # preview
npx factory-cli remove
```

This removes managed files you haven't edited, strips the factory blocks, and removes factory hooks and permissions from `.claude/settings.json`. Your features, context, principles and `factory.json` stay; delete `.factory/` yourself if you want them gone.
