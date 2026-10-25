# Models per station

Different work suits different models. Planning and review benefit from the strongest reasoning; building is many small, well-specified steps that a faster model handles well; a second vendor reviewing the diff catches mistakes the first one is blind to. Buildline lets you route each station on its own.

## Set it up

During `npx buildline init` pick a preset, or change it any time:

```bash
npx buildline models                         # show what each station uses
npx buildline models preset balanced         # apply a preset
npx buildline models set review codex        # one station
npx buildline models set build inherit       # back to the session model
```

Every change refreshes the skills and subagents straight away.

| Preset | What it does |
|---|---|
| `session` *(default)* | Every station uses whatever model you start the agent with. |
| `balanced` | Opus for spec, design, plan and review; Sonnet for build and verify. |
| `budget` | Sonnet everywhere, Haiku for intake. |
| `second` | Balanced, and Codex reviews every diff. |

## The config

It's one map in `.buildline/buildline.json`:

```json
"models": {
  "default": "sonnet",
  "plan": "opus",
  "review": "codex:gpt-5-codex",
  "verify": "gemini"
}
```

Stations: `onboard`, `new`, `spec`, `design`, `plan`, `build`, `verify`, `review`, `ship`. `default` covers any station you don't list; leave it out to use the session model.

| Value | Runs on |
|---|---|
| `opus`, `sonnet`, `haiku` | Claude Code, that model alias |
| a full id such as `claude-opus-5-5` | Claude Code, that exact model |
| `inherit` (or leave it out) | whatever model the session is using |
| `codex` or `codex:<model>` | [Codex CLI](https://github.com/openai/codex) |
| `gemini` or `gemini:<model>` | [Gemini CLI](https://github.com/google-gemini/gemini-cli) |

If you edit the file by hand, run `npx buildline update` to apply it.

## How it's applied

- **Claude Code skills** get a `model:` line, so `/buildline-plan` switches to Opus for that skill and back afterwards.
- **Subagents follow their station**: verify → `buildline-verifier`, review → `buildline-reviewer`, spec → `buildline-spec-critic`, design → `buildline-design-reviewer`, onboard → `buildline-mapper`.
- **Stations routed to another CLI** hand off. Type `/buildline-review 004` in Claude Code and, if review is set to `codex`, Claude runs `npx buildline step review 004 --headless`, waits, and summarises what Codex did. Codex and Gemini follow the same rule through `AGENTS.md`.
- **Autopilot** (`buildline run`) starts Claude Code with the build model; verify and review inside the loop use their own models or hand off the same way.

## Opening a station directly

`buildline step <station> [id]` opens a station in whatever it is routed to:

```bash
npx buildline step plan 004                       # claude --model opus "/buildline-plan 004"
npx buildline step review 004 --headless          # codex exec … (no chat, edits allowed in the repo)
npx buildline step spec 004 --model gemini        # one-off override
npx buildline step build 004 --print              # show the command without running it
```

Headless runs may edit files in the project but nothing beyond it: Claude uses `--permission-mode acceptEdits`, Codex `--sandbox workspace-write`, Gemini `--approval-mode auto_edit`.

`npx buildline doctor` warns if a CLI you routed to isn't installed.
