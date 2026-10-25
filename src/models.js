// Per-station model routing. `models` in buildline.json maps a station (or
// "default") to whatever the user picked: a Claude Code alias (opus, fable, …)
// or full model id, or another CLI: "codex", "codex:<model>", "gemini", "gemini:<model>".
// Buildline never validates names against a list of its own: new models work the
// day the underlying CLI accepts them. Picker choices are discovered at runtime.
import { spawnSync } from 'node:child_process';

export const MODEL_STATIONS = ['onboard', 'new', 'spec', 'design', 'plan', 'build', 'verify', 'review', 'ship'];

// How the wizard groups stations when choosing by phase.
export const PHASES = {
  planning: { label: 'Planning', hint: 'spec, design, plan', stations: ['spec', 'design', 'plan'] },
  building: { label: 'Building', hint: 'build: writing the code', stations: ['build'] },
  checking: { label: 'Checking', hint: 'verify, review', stations: ['verify', 'review'] },
  default: { label: 'Everything else', hint: 'onboard, intake, ship, and anything unset', stations: [] },
};

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

/** "planning=fable,build=claude-opus-5-5" → { spec, design, plan: 'fable', build: '…' }. Phases expand to their stations. */
export function parseModelList(text) {
  const models = {};
  for (const pair of String(text || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const [key, ...rest] = pair.split('=');
    const value = rest.join('=').trim();
    if (!value) throw new Error(`"${pair}": use station=model, e.g. plan=fable`);
    const targets = PHASES[key] && key !== 'default' ? PHASES[key].stations : [key];
    for (const t of targets) {
      if (t !== 'default' && !MODEL_STATIONS.includes(t)) throw new Error(`Unknown station or phase "${key}". Use ${[...Object.keys(PHASES), ...MODEL_STATIONS].join(', ')}.`);
      if (value !== 'inherit') models[t] = value;
    }
  }
  return models;
}

const has = (cmd) => spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' }).status === 0;

/** Model aliases the installed Claude Code advertises in `claude --help` (each tracks the newest model in its family). */
export function claudeAliases() {
  const res = spawnSync('claude', ['--help'], { encoding: 'utf8', timeout: 10000, shell: process.platform === 'win32' });
  const help = (res.stdout || '').replace(/\s+/g, ' ');
  const desc = help.match(/--model <model>(.*?)(?= --[a-z])/)?.[1] || '';
  return [...new Set([...desc.matchAll(/'([a-z][\w.-]*)'/g)].map((m) => m[1]))];
}

/** Current Claude models from the Anthropic API, when an API key is available. */
export async function anthropicModels() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch('https://api.anthropic.com/v1/models?limit=100', {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    return ((await res.json()).data || []).map((m) => ({ id: m.id, name: m.display_name || m.id }));
  } catch {
    return [];
  }
}

/**
 * Everything the picker can offer right now: aliases from the installed Claude
 * Code, models from the API, other installed CLIs, and values already in the
 * config. Each option is { value, label, hint }; "__other" means type one in.
 */
export async function discoverModelOptions(config = {}) {
  const options = [{ value: 'inherit', label: 'Session model', hint: 'whatever model the agent was started with' }];
  const seen = new Set(['inherit']);
  const push = (o) => {
    if (!seen.has(o.value)) seen.add(o.value), options.push(o);
  };
  const aliases = has('claude') ? claudeAliases() : [];
  // If this Claude Code doesn't list aliases in --help, fall back to the long-standing ones.
  for (const a of aliases.length ? aliases : ['opus', 'sonnet', 'haiku']) push({ value: a, label: a, hint: 'newest model in this family, follows Claude Code updates' });
  for (const m of await anthropicModels()) push({ value: m.id, label: m.id, hint: m.name });
  for (const v of Object.values(config.models || {})) push({ value: v, label: v, hint: 'already in your config' });
  for (const cli of ['codex', 'gemini']) if (has(cli)) push({ value: cli, label: cli, hint: `${CLIS[cli].label}, its default model (or type ${cli}:<model>)` });
  options.push({ value: '__other', label: 'Other…', hint: 'type any model name or id, e.g. claude-opus-5-5 or codex:gpt-5-codex' });
  return options;
}

/**
 * Ask the CLI which model a name resolves to today. Claude: one tiny headless
 * request, reporting the model that actually answered. Others: installed or not.
 */
export function checkModel(value, { cwd } = {}) {
  const m = parseModel(value);
  if (m.cli !== 'claude') return has(m.cli) ? { ok: true, resolved: describeModel(m), note: 'installed, not called' } : { ok: false, error: `${CLIS[m.cli].label} not installed: ${CLIS[m.cli].install}` };
  if (!has('claude')) return { ok: false, error: 'Claude Code not installed' };
  const args = ['-p', 'Reply with OK.', '--output-format', 'json', '--max-turns', '1', ...(m.model ? ['--model', m.model] : [])];
  const res = spawnSync('claude', args, { cwd, encoding: 'utf8', timeout: 120000, shell: process.platform === 'win32' });
  try {
    const out = JSON.parse(res.stdout);
    const used = Object.keys(out.modelUsage || {});
    if (out.is_error || !used.length) return { ok: false, error: String(out.result || 'no response').slice(0, 160) };
    return { ok: true, resolved: used.join(', ') };
  } catch {
    return { ok: false, error: (res.stderr || res.stdout || 'no output').trim().split('\n').pop().slice(0, 160) };
  }
}

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
