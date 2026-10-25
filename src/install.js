// Builds the list of files the factory installs for a given config, and applies
// it safely (see files.js). Also merges hooks/permissions into .claude/settings.json.
import fs from 'node:fs';
import path from 'node:path';
import { render, templatesDir } from './render.js';
import { loadManifest, saveManifest, planWrite, applyPlan, planRemove, hash } from './files.js';

export const VERSION = JSON.parse(fs.readFileSync(path.join(templatesDir, '..', 'package.json'), 'utf8')).version;

export const AGENTS = {
  claude: { label: 'Claude Code', hint: 'skills, subagents, hooks' },
  codex: { label: 'Codex CLI', hint: 'reads AGENTS.md' },
  cursor: { label: 'Cursor', hint: '.cursor/rules' },
  gemini: { label: 'Gemini CLI', hint: 'GEMINI.md' },
  copilot: { label: 'GitHub Copilot', hint: 'reads AGENTS.md' },
};

export const AUTONOMY = {
  1: { label: 'L1 · Assist', hint: 'human approves every station; agent never moves on alone' },
  2: { label: 'L2 · Guided', hint: 'human approves spec + plan; agent builds, verifies, reviews' },
  3: { label: 'L3 · Autopilot', hint: 'human approves spec; agent plans and runs build→review unattended' },
  4: { label: 'L4 · Dark factory', hint: 'spec → ready-to-merge PR with no checkpoints; human merges' },
};

const STATION_SKILLS = [
  ['factory', 'factory', 'Software factory front door: shows feature status, what is next, and routes to the right station (onboard, new, spec, design, plan, build, verify, review, ship). Use when the user says "factory", asks what to do next, or wants to start any piece of work.', '[what you want to do]'],
  ['factory-onboard', 'onboard', 'Onboard the software factory: interview for a new project and scaffold it, or map an existing codebase into .factory/context files and real quality gates. Use when setting up the factory or when context files are stale.', ''],
  ['factory-new', 'new', 'Factory intake: turn an idea, request or bug report into a sized feature (fix / feature / epic) with a brief. Use when someone proposes a feature, reports a bug, or says "new feature".', '<idea or bug description>'],
  ['factory-spec', 'spec', 'Factory spec station: interview the PM and write testable requirements and Given/When/Then acceptance scenarios for a feature. Use when writing or refining a feature spec.', '<feature id>'],
  ['factory-design', 'design', 'Factory design station: UX flows, screen states, components, copy and accessibility, plus technical design, for a feature. Use for design or technical approach work on a factory feature.', '<feature id>'],
  ['factory-plan', 'plan', 'Factory plan station: break a feature spec into small, verifiable, ordered tasks in feature.json. Use when a spec is ready for planning.', '<feature id>'],
  ['factory-build', 'build', 'Factory build station: implement a feature task by task behind the quality gates, test-first, with evidence and a commit per task. Use to implement or continue implementing a factory feature.', '<feature id>'],
  ['factory-verify', 'verify', 'Factory verify station: independently check a feature against its acceptance scenarios with gates, the running app and browser checks. Use when all build tasks pass.', '<feature id>'],
  ['factory-review', 'review', 'Factory review station: review a feature diff against its spec and principles, then prepare the PR description. Use when verification passes.', '<feature id>'],
  ['factory-ship', 'ship', 'Factory ship station: open the PR, update the changelog and fold learnings back into the context files.', '<feature id>', true],
  ['factory-autopilot', 'autopilot', 'Factory autopilot: run build, verify and review in a loop until the feature is ready to ship or blocked. Pairs with /goal for unattended runs.', '<feature id>', true],
];

const read = (rel) => fs.readFileSync(path.join(templatesDir, rel), 'utf8');
const bullets = (items, fallback = 'TODO') => (items?.length ? items.map((i) => `- ${i}`).join('\n') : `- ${fallback}`);

export function defaultGates(stack) {
  const order = ['lint', 'typecheck', 'test', 'build'];
  return order.filter((k) => stack.commands?.[k]).map((name) => ({ name, command: stack.commands[name], required: true }));
}

export function makeConfig(stack, answers) {
  return {
    version: 1,
    project: answers.project || stack.name,
    autonomy: answers.autonomy ?? 2,
    team: answers.team || ['developer', 'designer', 'pm'],
    agents: answers.agents || ['claude', 'codex', 'cursor'],
    ci: answers.ci ?? false,
    stack: {
      greenfield: stack.empty,
      languages: stack.languages,
      frameworks: stack.frameworks,
      ui: stack.ui,
      testing: stack.testing,
      packageManager: stack.packageManager,
      monorepo: stack.monorepo,
    },
    commands: { dev: stack.commands?.dev || null },
    gates: answers.gates || defaultGates(stack),
  };
}

function ciSetup(config) {
  const pm = config.stack.packageManager;
  const steps = [];
  if (pm === 'pnpm') steps.push('      - uses: pnpm/action-setup@v4', '      - run: pnpm install --frozen-lockfile');
  else if (pm === 'yarn') steps.push('      - run: yarn install --frozen-lockfile');
  else if (pm === 'bun') steps.push('      - uses: oven-sh/setup-bun@v2', '      - run: bun install');
  else if (pm === 'npm') steps.push('      - run: npm ci');
  else if (pm === 'uv') steps.push('      - uses: astral-sh/setup-uv@v5', '      - run: uv sync');
  else if (pm === 'poetry' || pm === 'pip') steps.push('      - uses: actions/setup-python@v5', "        with: { python-version: '3.12' }", pm === 'poetry' ? '      - run: pipx install poetry && poetry install' : '      - run: pip install -r requirements.txt');
  return steps.join('\n');
}

/** Every file the factory manages, for this config. */
export function buildEntries(root, config) {
  const has = (a) => config.agents.includes(a);
  const gatesList = config.gates.length
    ? config.gates.map((g) => `- **${g.name}**: \`${g.command}\`${g.required === false ? ' (optional)' : ''}`).join('\n')
    : '- _None configured yet. Run `/factory-onboard` or add commands to `gates` in `.factory/factory.json`._';
  const vars = {
    gatesList,
    stackBullets: bullets([...config.stack.frameworks, ...config.stack.languages, config.stack.packageManager && `Package manager: ${config.stack.packageManager}`].filter(Boolean)),
    uiBullets: config.stack.ui.length ? `Detected: ${config.stack.ui.join(', ')}.` : '',
    ciSetup: ciSetup(config),
  };

  const entries = [];
  const add = (p, content, extra = {}) => entries.push({ path: p, content, mode: 'file', ...extra });

  entries.push({ path: 'AGENTS.md', mode: 'block', header: '# AGENTS.md', content: render(read('AGENTS.block.md'), vars) });

  if (has('claude')) {
    const claudePath = path.join(root, 'CLAUDE.md');
    const existing = fs.existsSync(claudePath) ? fs.readFileSync(claudePath, 'utf8').replace(/<!-- factory:start[\s\S]*?factory:end -->/, '') : '';
    const agentsImport = /@\.?\/?AGENTS\.md/.test(existing) ? '' : '@AGENTS.md\n';
    entries.push({ path: 'CLAUDE.md', mode: 'block', header: '# CLAUDE.md', position: 'top', content: render(read('CLAUDE.block.md'), { agentsImport }) });

    for (const [name, station, description, hint, manualOnly] of STATION_SKILLS) {
      const front = [
        '---',
        `name: ${name}`,
        `description: ${JSON.stringify(description)}`,
        hint ? `argument-hint: ${JSON.stringify(hint)}` : null,
        manualOnly ? 'disable-model-invocation: true' : null,
        '---',
      ].filter(Boolean);
      const body = `\nRead \`.factory/stations/${station}.md\` now and follow it step by step. It is the single source of truth for this station, shared with every other agent in the project.\n\nArguments: $ARGUMENTS\n`;
      add(`.claude/skills/${name}/SKILL.md`, front.join('\n') + '\n' + body);
    }
    for (const f of fs.readdirSync(path.join(templatesDir, 'agents'))) add(`.claude/agents/${f}`, read(`agents/${f}`));
  }
  if (has('cursor')) add('.cursor/rules/factory.mdc', read('cursor.mdc'));
  if (has('gemini')) entries.push({ path: 'GEMINI.md', mode: 'block', header: '# GEMINI.md', position: 'top', content: read('GEMINI.block.md') });

  add('.factory/factory.json', JSON.stringify(config, null, 2) + '\n', { userOwned: true });
  add('.factory/README.md', render(read('factory-readme.md'), { project: config.project }));
  add('.factory/principles.md', read('principles.md'), { userOwned: true });
  for (const f of ['product.md', 'architecture.md', 'design.md']) add(`.factory/context/${f}`, render(read(`context/${f}`), vars), { userOwned: true });
  for (const f of fs.readdirSync(path.join(templatesDir, 'stations'))) add(`.factory/stations/${f}`, read(`stations/${f}`));
  for (const f of ['spec.md', 'progress.md']) add(`.factory/templates/${f}`, read(`feature/${f}`));
  add('.factory/bin/gates.mjs', read('bin/gates.mjs'), { executable: true });
  add('.factory/bin/hook.mjs', read('bin/hook.mjs'), { executable: true });
  add('.factory/features/.gitkeep', '');
  if (config.ci) add('.github/workflows/factory.yml', render(read('ci/factory.yml'), vars));
  return entries;
}

// ---- .claude/settings.json ---------------------------------------------------

const HOOK_MARK = '.factory/bin/hook.mjs';
const hookCmd = (mode) => `node "$CLAUDE_PROJECT_DIR/.factory/bin/hook.mjs" ${mode}`;

export function settingsAllow(config) {
  const allow = ['Bash(node .factory/bin/gates.mjs)', 'Bash(node .factory/bin/gates.mjs *)', 'Bash(npx factory-cli *)'];
  for (const g of config.gates) allow.push(`Bash(${g.command})`, `Bash(${g.command} *)`);
  return [...new Set(allow)];
}

/** Returns { content, changed, added } or { error }. Never drops user settings. */
export function mergeSettings(root, config) {
  const file = path.join(root, '.claude', 'settings.json');
  let settings = {};
  if (fs.existsSync(file)) {
    try {
      settings = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      return { error: `.claude/settings.json is not valid JSON (${err.message}); left untouched.` };
    }
  }
  const before = JSON.stringify(settings);
  settings.hooks ??= {};
  const ensureHook = (event, matcher, mode) => {
    const groups = (settings.hooks[event] ??= []);
    const present = groups.some((g) => (g.hooks || []).some((h) => h.command?.includes(HOOK_MARK)));
    if (!present) groups.push({ ...(matcher ? { matcher } : {}), hooks: [{ type: 'command', command: hookCmd(mode) }] });
  };
  ensureHook('SessionStart', null, 'session-start');
  ensureHook('PreToolUse', 'Edit|Write|MultiEdit', 'guard');

  settings.permissions ??= {};
  settings.permissions.allow ??= [];
  const added = settingsAllow(config).filter((r) => !settings.permissions.allow.includes(r));
  settings.permissions.allow.push(...added);

  const content = JSON.stringify(settings, null, 2) + '\n';
  return { content, changed: JSON.stringify(settings) !== before, added };
}

export function unmergeSettings(root, manifest) {
  const file = path.join(root, '.claude', 'settings.json');
  if (!fs.existsSync(file)) return null;
  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
  for (const event of Object.keys(settings.hooks || {})) {
    settings.hooks[event] = settings.hooks[event]
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !h.command?.includes(HOOK_MARK)) }))
      .filter((g) => g.hooks.length);
    if (!settings.hooks[event].length) delete settings.hooks[event];
  }
  if (settings.hooks && !Object.keys(settings.hooks).length) delete settings.hooks;
  const ours = new Set(manifest.settingsAllow || []);
  if (settings.permissions?.allow) {
    settings.permissions.allow = settings.permissions.allow.filter((r) => !ours.has(r));
    if (!settings.permissions.allow.length) delete settings.permissions.allow;
    if (!Object.keys(settings.permissions).length) delete settings.permissions;
  }
  return Object.keys(settings).length ? JSON.stringify(settings, null, 2) + '\n' : '';
}

// ---- top level ---------------------------------------------------------------

/** Plan an install/update. Nothing is written. */
export function plan(root, config, { force = false } = {}) {
  const manifest = loadManifest(root);
  const entries = buildEntries(root, config);
  const plans = entries.map((e) => ({ ...planWrite(root, manifest, e, { force }), mode: e.mode, executable: e.executable }));
  let settings = null;
  if (config.agents.includes('claude')) {
    settings = mergeSettings(root, config);
    if (!settings.error && settings.changed) {
      plans.push({ rel: '.claude/settings.json', action: fs.existsSync(path.join(root, '.claude/settings.json')) ? 'merge' : 'create', content: settings.content, mode: 'settings' });
    }
  }
  return { manifest, plans, settings };
}

export function apply(root, { manifest, plans, settings }) {
  applyPlan(root, manifest, plans.filter((p) => p.mode !== 'settings'));
  const s = plans.find((p) => p.mode === 'settings');
  if (s) {
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(root, s.rel), s.content);
    manifest.settingsAllow = [...new Set([...(manifest.settingsAllow || []), ...(settings?.added || [])])];
  }
  manifest.version = VERSION;
  manifest.installedAt ??= new Date().toISOString();
  manifest.updatedAt = new Date().toISOString();
  saveManifest(root, manifest);
}

export function removePlan(root, config) {
  const manifest = loadManifest(root);
  const entries = buildEntries(root, config);
  const plans = planRemove(root, manifest, entries);
  const settings = unmergeSettings(root, manifest);
  return { manifest, plans, settings };
}

export function applyRemove(root, { plans, settings }) {
  for (const p of plans) {
    const abs = path.join(root, p.rel);
    if (p.action === 'delete') fs.rmSync(abs, { force: true });
    else if (p.action === 'strip-block') fs.writeFileSync(abs, p.content);
  }
  if (settings !== null && settings !== undefined) {
    const file = path.join(root, '.claude', 'settings.json');
    if (settings === '') fs.rmSync(file, { force: true });
    else fs.writeFileSync(file, settings);
  }
  fs.rmSync(path.join(root, '.factory', 'manifest.json'), { force: true });
  // Remove now-empty directories we created, deepest first. Feature data is never deleted.
  for (const d of ['.factory/bin', '.factory/stations', '.factory/templates', '.cursor/rules', '.cursor', '.claude/agents', '.claude/skills', '.claude', '.github/workflows', '.github']) {
    const abs = path.join(root, d);
    try {
      if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
        for (const sub of fs.readdirSync(abs)) {
          const s = path.join(abs, sub);
          if (fs.statSync(s).isDirectory() && !fs.readdirSync(s).length) fs.rmdirSync(s);
        }
        if (!fs.readdirSync(abs).length) fs.rmdirSync(abs);
      }
    } catch {}
  }
}

export { hash };
