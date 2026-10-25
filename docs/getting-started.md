# Getting started

Buildline works the same way on an empty folder and on a ten-year-old monorepo. The only difference is what the first onboarding session does.

## 1. Install

```bash
cd your-project
npx buildline
```

The wizard:

1. **Detects your stack**: languages, frameworks, UI libraries, test tools, package manager, and the commands to lint, type-check, test and build.
2. **Asks five questions**: which AI tools your team uses, who will use the factory, how much agents may do alone (autonomy), which [models plan, build and check](models.md) (picked from what your tools offer), and whether the detected gate commands are right.
3. **Shows every file it will create or merge** before writing anything.
4. Offers to **open Claude Code on the onboarding station** straight away.

Non-interactive (CI, scripts, dotfiles):

```bash
npx buildline init --yes --agents claude,cursor --autonomy 2 --ci
npx buildline init --dry-run     # preview only
```

## 2. Onboard

Open Claude Code and run `/buildline-onboard`. Other agents: *"follow .buildline/stations/onboard.md"*.

### Empty project (greenfield)

Claude interviews you, one question at a time: what you're building, for whom, what success looks like, what's in and out of scope, platform constraints, look and feel. Then it:

- recommends a stack (with one alternative) and waits for your OK,
- scaffolds with the framework's official generator,
- adds a test runner, a linter and one passing smoke test,
- writes the real gate commands into `buildline.json` and runs them until green,
- fills `.buildline/context/` and suggests the first features as a thin vertical slice.

### Existing project (brownfield)

Claude reads first and asks later. The `buildline-mapper` subagent maps the codebase in a separate context: product purpose, module map, request flow, conventions (with example file paths), design system, commands (it runs them) and hazards. Claude turns that into the context files, then asks you only what code can't answer: goals, users, what's next, what "good" looks like.

Existing agent setups are respected. If you already have `CLAUDE.md`, `AGENTS.md`, Cursor rules, Spec Kit or BMAD, Buildline adds its block next to them and doesn't replace them.

## 3. Ship your first change

```text
/buildline-new Users can't reset their password from the mobile app
```

Buildline sizes it (`fix`, `feature` or `epic`), opens `.buildline/features/001-…/`, and tells you the next command. From there, `/buildline` always tells you where things stand.

## 4. Bring in the rest of the team

- PMs and designers: `npx buildline ui` opens the dashboard: board, specs, approvals.
- Commit `.buildline/`, `AGENTS.md`, `CLAUDE.md` and `.claude/` so everyone shares the same factory.
- Add `CLAUDE.local.md` and `.claude/settings.local.json` to `.gitignore` for personal tweaks.

## Check your setup

```bash
npx buildline doctor
```

It checks Node, git, Claude Code, the config, gates, hooks, missing or customised managed files, unfilled context, and broken feature files.

## Upgrading

When a new Buildline release comes out, run this in your project:

```bash
npx buildline@latest update
```

Keep the `@latest`: without it, `npx` may reuse an older cached copy.

`update` shows the version change (for example `v0.4.0 → v0.5.0`) and lists every file before it writes anything. Then it:

- refreshes Buildline's own files: station playbooks, skills, subagents, hooks, and the marked blocks in `AGENTS.md` and `CLAUDE.md`
- **keeps any managed file you've edited**, and reports it as kept
- never touches `buildline.json` (including your models), `principles.md`, `context/` or your features

```bash
npx buildline@latest update --dry-run   # preview, write nothing
npx buildline@latest update --force     # also replace files you edited with the new versions
npx buildline@latest doctor             # check the setup afterwards
```

Commit the result so the whole team gets the same version. New CLI commands, such as `watch`, work as soon as you run them with `@latest`; `update` is what brings your project's playbooks and skills up to the release. See the [changelog](../CHANGELOG.md) for what changed.
