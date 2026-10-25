// Per-station model routing. `models` in buildline.json maps a station (or
// "default") to a Claude Code model (opus, sonnet, haiku, a full model id) or to
// another CLI: "codex", "codex:<model>", "gemini", "gemini:<model>".

export const MODEL_STATIONS = ['onboard', 'new', 'spec', 'design', 'plan', 'build', 'verify', 'review', 'ship'];

export const CLIS = {
  claude: { label: 'Claude Code', install: 'https://code.claude.com' },
  codex: { label: 'Codex CLI', install: 'npm i -g @openai/codex' },
  gemini: { label: 'Gemini CLI', install: 'npm i -g @google/gemini-cli' },
};

// The subagent each station leans on, so its model follows the station's.
export const STATION_SUBAGENTS = {
  onboard: 'buildline-mapper',
  spec: 'buildline-spec-critic',
  design: 'buildline-design-reviewer',
  verify: 'buildline-verifier',
  review: 'buildline-reviewer',
};

const BALANCED = { spec: 'opus', design: 'opus', plan: 'opus', build: 'sonnet', verify: 'sonnet', review: 'opus' };

export const PRESETS = {
  session: { label: 'Same model everywhere', hint: 'every station uses the model you start the agent with', models: {} },
  balanced: { label: 'Balanced', hint: 'Opus for spec, design, plan and review; Sonnet builds and verifies', models: BALANCED },
  budget: { label: 'Budget', hint: 'Sonnet everywhere, Haiku for intake', models: { default: 'sonnet', new: 'haiku' } },
  second: { label: 'Second opinion', hint: 'Balanced, and Codex reviews every diff', models: { ...BALANCED, review: 'codex' } },
};

/** "opus" → { cli: 'claude', model: 'opus' }; "codex:gpt-5" → { cli: 'codex', model: 'gpt-5' }. */
export function parseModel(value) {
  const v = String(value ?? '').trim();
  if (!v || v === 'inherit') return { cli: 'claude', model: null };
  const [head, ...rest] = v.split(':');
  if (CLIS[head]) return { cli: head, model: rest.join(':') || null };
  return { cli: 'claude', model: v };
}

export function modelFor(config, station) {
  const models = config.models || {};
  return parseModel(models[station] ?? models.default);
}

export const describeModel = ({ cli, model }) => (cli === 'claude' ? model || 'session model' : `${cli}${model ? ':' + model : ''}`);

/** Prompt that starts a station in the given CLI. */
export function stationPrompt(cli, station, id) {
  const arg = id ? ` ${id}` : '';
  if (cli === 'claude') return station === 'buildline' ? `/buildline${arg}` : `/buildline-${station}${arg}`;
  const target = id ? ` for feature ${id}` : '';
  return `Follow .buildline/stations/${station}.md step by step${target}. Project rules are in AGENTS.md.`;
}

/** [command, args] that launches a CLI with a prompt, interactively or headless. */
export function launchArgs({ cli, model }, prompt, { headless = false } = {}) {
  // Headless runs may edit files in the workspace (like Claude's acceptEdits), nothing more.
  if (cli === 'codex') return ['codex', [...(headless ? ['exec', '--sandbox', 'workspace-write'] : []), ...(model ? ['-m', model] : []), prompt]];
  if (cli === 'gemini') return ['gemini', [...(model ? ['-m', model] : []), ...(headless ? ['--approval-mode', 'auto_edit', '-p'] : ['-i']), prompt]];
  return ['claude', [...(model ? ['--model', model] : []), ...(headless ? ['-p', prompt, '--permission-mode', 'acceptEdits'] : [prompt])]];
}

/** CLIs a config needs installed, besides Claude Code. */
export function externalClis(config) {
  return [...new Set(Object.values(config.models || {}).map((v) => parseModel(v).cli).filter((c) => c !== 'claude'))];
}
