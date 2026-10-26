# CLI reference

```
npx buildline [command] [options]
```

Global: `-C, --cwd <dir>` runs in another directory · `-h, --help` · `-v, --version`.

| Command | What it does | Options |
|---|---|---|
| *(none)* | Interactive menu: status, new feature, work on a feature, dashboard, gates, doctor, update. Offers setup if the factory isn't installed. | |
| `init` | Detect stack, ask setup questions, preview files, install. | `-y/--yes`, `--agents claude,codex,cursor,gemini,copilot`, `--autonomy 1-4`, `--team developer,designer,pm`, `--models planning=fable,building=opus,…`, `--ci` / `--no-ci`, `--dry-run`, `--force` |
| `status` (`st`) | Terminal board: station, task progress, who it's waiting on, next command. | `--json` |
| `new "<title>"` | Open a feature. Prompts for anything missing. | `-t/--type fix\|feature\|epic`, `--owner <name>`, `--parent <id>` |
| `approve <id> <stage>` | Record a human approval for `spec`, `design` or `plan`. | `--by <name>` (defaults to `git config user.name`) |
| `move <id> <station>` | Move a feature to a station (`spec … done`). | `--note "<why>"` |
| `watch` (`top`) | Live view of the line in the terminal: tracks, models, tasks, events. Keys: `↑↓` select, `⏎` open the station, `a` approve, `u` dashboard, `s` shipped, `e` hide/show events, `m` mute, `q` quit. | `--shipped`, `--once`, `--no-intro`, `-q/--quiet` |
| `ui` (`dashboard`) | Local web dashboard on `127.0.0.1:4545`. | `--port <n>`, `--no-open`, `-q/--quiet` |
| `step <station> [id]` | Open a station in the CLI and model it's routed to ([models](models.md)). | `-m/--model <m>`, `--headless`, `--print` |
| `models` | Pick models per station or phase (interactive). `models set <station\|phase> <model>`, `models check` to see what each resolves to. | `--json` |
| `run [id]` | Autopilot via Claude Code `/goal`, using the build model. Requires autonomy ≥ 3. | `--headless`, `--print`, `--force` |
| `sound [on\|off]` | Show or set the chime ([live sessions](concepts.md#sound)). Saved as `"sound": false` in `buildline.json`. | |
| `gates [names…]` | Run quality gates (all, or the named ones). | |
| `doctor` | Check Node, git, Claude Code, config, models (and the CLIs they need), gates, hooks, managed files, context, features. | |
| `update` | Refresh managed files to this version; keep edited files. Run it as `npx buildline@latest update` to upgrade ([how](getting-started.md#upgrading)). | `--dry-run`, `--force` |
| `remove` (`uninstall`) | Remove managed files and blocks; keep your work. | `-y`, `--dry-run` |

Feature ids accept `7`, `007`, `007-saved-carts` or a slug fragment.

## Inside the project

These run without the CLI, so agents and CI can use them:

```bash
node .buildline/bin/gates.mjs            # all gates; exit 1 on failure
node .buildline/bin/gates.mjs test lint  # named gates
node .buildline/bin/gates.mjs --json     # machine-readable
```

Agents record feature state with the feature script (you don't need to; run it with no arguments for the full usage):

```bash
node .buildline/bin/feature.mjs new "<title>" --type fix
node .buildline/bin/feature.mjs move <id> <station> --note "…"     # refuses to skip a required approval
node .buildline/bin/feature.mjs task <id> add "<title>" --covers A1 --verify "…"
node .buildline/bin/feature.mjs task <id> T1 pass --note "what ran, what was seen"
node .buildline/bin/feature.mjs block <id> "<question>"    /   unblock <id> --note "<answer>"
node .buildline/bin/feature.mjs approve <id> spec --by "<name>"   # only on an explicit yes
```

`npx buildline move` follows the same approval rules; add `--force` to override.
