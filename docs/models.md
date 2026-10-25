# Models per station

Different work suits different models. You might want Fable to write specs and plans, Opus to build, and a second vendor to review the diff. Buildline lets you choose a model for each station. It doesn't ship a model list of its own, so new models work the day your tools support them.

## Choose your models

```bash
npx buildline models
```

The picker shows what's available right now:

- **Claude Code aliases**, read from the `claude` you have installed (today: `fable`, `opus`, `sonnet`). An alias always means the newest model in that family, so `fable` moves to the next Fable when Claude Code does.
- **Every Claude model id** from Anthropic's models API, when `ANTHROPIC_API_KEY` is set.
- **Codex CLI and Gemini CLI**, when they're installed.
- **Other…**: type any model name or id. Buildline saves exactly what you type and passes it to the tool.

You choose either **by phase** (planning, building, checking, everything else) or **for every station**. The same picker runs during `npx buildline init`, and from the interactive menu.

Without prompts:

```bash
npx buildline models set planning fable              # spec, design, plan
npx buildline models set building claude-opus-5-5    # build
npx buildline models set checking codex              # verify, review
npx buildline models set review gemini:gemini-2.5-pro
npx buildline models set build inherit               # back to the session model
npx buildline init -y --models planning=fable,building=opus
```

## Check what your choices resolve to

```bash
npx buildline models check
```

```text
  ✔ fable                    → claude-fable-5-1
  ✔ claude-opus-5-5          → claude-opus-5-5
  ✘ claude-opus-9            There's an issue with the selected model …
```

For each Claude model this sends one tiny request and reports the model that actually answered. That catches typos, models your account can't use, and aliases that have moved on. For Codex and Gemini it checks the CLI is installed.

## The config

It's one map in `.buildline/buildline.json`:

```json
"models": {
  "spec": "fable",
  "design": "fable",
  "plan": "fable",
  "build": "claude-opus-5-5",
  "review": "codex:gpt-5-codex",
  "default": "sonnet"
}
```

Stations: `onboard`, `new`, `spec`, `design`, `plan`, `build`, `verify`, `review`, `ship`. `default` covers any station you don't list; leave it out to use the session model.

| Value | Runs on |
|---|---|
| an alias such as `fable`, `opus`, `sonnet` | Claude Code, the newest model in that family |
| a full id such as `claude-opus-5-5` | Claude Code, that exact model |
| `inherit`, or leave it out | whatever model the session is using |
| `codex` or `codex:<model>` | [Codex CLI](https://github.com/openai/codex) |
| `gemini` or `gemini:<model>` | [Gemini CLI](https://github.com/google-gemini/gemini-cli) |

Aliases keep up automatically. Full ids pin a model, so nothing changes under you until you update it. If you edit the file by hand, run `npx buildline update` to apply it.

## How it's applied

- **Claude Code skills** get a `model:` line, so `/buildline-plan` runs on Fable even if the session started on Sonnet, and the session goes back to its own model afterwards.
- **Subagents follow their station**: verify uses `buildline-verifier`, review `buildline-reviewer`, spec `buildline-spec-critic`, design `buildline-design-reviewer`, and onboard `buildline-mapper`.
- **Stations set to another CLI** are handed off. Type `/buildline-review 004` in Claude Code with review set to `codex`, and Claude runs `npx buildline step review 004 --headless`, waits, and summarises what Codex did. Codex and Gemini follow the same rule through `AGENTS.md`.
- **Autopilot** (`buildline run`) starts Claude Code on the build model. Verify and review inside the loop use their own models, or hand off the same way.

## Opening a station directly

`buildline step <station> [id]` opens a station in whatever it's set to:

```bash
npx buildline step plan 004                  # claude --model fable "/buildline-plan 004"
npx buildline step review 004 --headless     # codex exec … (no chat, edits allowed in the repo)
npx buildline step spec 004 --model opus     # one-off override
npx buildline step build 004 --print         # show the command without running it
```

Headless runs may edit files in the project but nothing beyond it: Claude uses `--permission-mode acceptEdits`, Codex `--sandbox workspace-write`, and Gemini `--approval-mode auto_edit`.

`npx buildline doctor` warns if a CLI you chose isn't installed.
