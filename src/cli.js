import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { detect, describeStack } from './detect.js';
import { AGENTS, AUTONOMY, VERSION, makeConfig, plan, apply, removePlan, applyRemove, defaultGates } from './install.js';
import { loadManifest } from './files.js';
import { PRESETS, MODEL_STATIONS, CLIS, modelFor, parseModel, describeModel, stationPrompt, launchArgs, externalClis } from './models.js';
import { listFeatures, findFeature, createFeature, approve, setStatus, nextAction, STATIONS, TYPES } from './features.js';

const LOGO = [
  pc.yellow('  ┌┐ ┬ ┬┬┬  ┌┬┐┬  ┬┌┐┌┌─┐'),
  pc.yellow('  ├┴┐│ │││   ││││  ││││├┤ '),
  pc.yellow('  └─┘└─┘┴┴─┘─┴┘┴─┘┴┘└┘└─┘') + pc.dim(` v${VERSION}`),
].join('\n');

const configPath = (root) => path.join(root, '.buildline', 'buildline.json');
export const isInstalled = (root) => fs.existsSync(configPath(root));

function loadConfig(root) {
  try {
    return JSON.parse(fs.readFileSync(configPath(root), 'utf8'));
  } catch (err) {
    throw new Error(`Buildline not installed here (or .buildline/buildline.json is invalid). Run ${pc.cyan('npx buildline init')}. ${err.code === 'ENOENT' ? '' : err.message}`);
  }
}

const hasCommand = (cmd) => spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' }).status === 0;

function bail(value) {
  if (p.isCancel(value)) {
    p.cancel('Cancelled. Nothing was written.');
    process.exit(0);
  }
  return value;
}

function bar(done, total, width = 10) {
  if (!total) return pc.dim('·'.repeat(width));
  const n = Math.round((done / total) * width);
  return pc.green('█'.repeat(n)) + pc.dim('░'.repeat(width - n));
}

const ACTION_LABEL = {
  create: pc.green('create'),
  update: pc.cyan('update'),
  merge: pc.cyan('merge '),
  'skip-modified': pc.yellow('kept  '),
  unchanged: pc.dim('same  '),
};

function summarisePlan(plans) {
  const counts = {};
  for (const x of plans) counts[x.action] = (counts[x.action] || 0) + 1;
  const lines = plans
    .filter((x) => x.action !== 'unchanged')
    .map((x) => `${ACTION_LABEL[x.action] || x.action}  ${x.rel}${x.action === 'skip-modified' ? pc.dim('  (you edited it; use --force to overwrite)') : ''}`);
  return { lines, counts };
}

// ---- init --------------------------------------------------------------------

export async function init(root, opts) {
  const interactive = !opts.yes && process.stdin.isTTY;
  console.log('\n' + LOGO + '\n');
  p.intro(pc.bgYellow(pc.black(' buildline init ')));

  const stack = detect(root);
  const existingConfig = isInstalled(root) ? loadConfig(root) : null;
  const facts = [
    `${pc.dim('project ')} ${stack.name}`,
    `${pc.dim('stack   ')} ${describeStack(stack)}`,
    stack.ui.length ? `${pc.dim('ui      ')} ${stack.ui.join(', ')}` : null,
    stack.testing.length ? `${pc.dim('testing ')} ${stack.testing.join(', ')}` : null,
    `${pc.dim('gates   ')} ${defaultGates(stack).map((g) => g.name).join(', ') || pc.yellow('none detected yet')}`,
    stack.existingAgentConfig.length ? `${pc.dim('found   ')} ${stack.existingAgentConfig.join(', ')} ${pc.dim('(kept, factory adds alongside)')}` : null,
  ].filter(Boolean);
  p.note(facts.join('\n'), stack.empty ? 'New project detected' : 'Existing project detected');

  if (existingConfig && interactive) {
    const go = bail(await p.confirm({ message: 'A factory is already installed here. Update it to v' + VERSION + ' with your current settings?' }));
    if (!go) return p.outro('Nothing changed.');
    return update(root, { ...opts, quietIntro: true });
  }

  const detectedAgents = ['claude', 'codex', 'cursor'];
  if (stack.existingAgentConfig.includes('Gemini CLI')) detectedAgents.push('gemini');
  if (stack.existingAgentConfig.includes('GitHub Copilot')) detectedAgents.push('copilot');

  const parseList = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : null);
  let answers = {
    agents: parseList(opts.agents) || detectedAgents,
    autonomy: opts.autonomy ? Number(opts.autonomy) : 2,
    team: parseList(opts.team) || ['developer', 'designer', 'pm'],
    ci: opts.ci ?? (stack.git && fs.existsSync(path.join(root, '.github'))),
    gates: defaultGates(stack),
    models: PRESETS[opts.models]?.models || {},
  };

  if (interactive) {
    answers.agents = bail(
      await p.multiselect({
        message: 'Which AI tools does your team use?',
        options: Object.entries(AGENTS).map(([value, a]) => ({ value, label: a.label, hint: a.hint })),
        initialValues: answers.agents,
        required: true,
      }),
    );
    answers.team = bail(
      await p.multiselect({
        message: 'Who will use the factory?',
        options: [
          { value: 'developer', label: 'Developers' },
          { value: 'designer', label: 'Designers' },
          { value: 'pm', label: 'Product managers' },
        ],
        initialValues: answers.team,
        required: true,
      }),
    );
    answers.autonomy = bail(
      await p.select({
        message: 'How much should agents do on their own?',
        options: Object.entries(AUTONOMY).map(([value, a]) => ({ value: Number(value), label: a.label, hint: a.hint })),
        initialValue: 2,
      }),
    );

    const preset = bail(
      await p.select({
        message: 'Which models should each station use?',
        options: Object.entries(PRESETS).map(([value, x]) => ({ value, label: x.label, hint: x.hint + (externalClis({ models: x.models }).some((c) => !hasCommand(c)) ? ' (needs ' + externalClis({ models: x.models }).join(', ') + ')' : '') })),
        initialValue: 'session',
      }),
    );
    answers.models = PRESETS[preset].models;

    const gateChoice = bail(
      await p.select({
        message: answers.gates.length ? `Quality gates: ${answers.gates.map((g) => g.command).join(' · ')}` : 'No test/lint/build commands found yet.',
        options: answers.gates.length
          ? [
              { value: 'keep', label: 'Use these' },
              { value: 'edit', label: 'Edit them' },
              { value: 'later', label: 'Decide later', hint: 'onboarding will set them up' },
            ]
          : [
              { value: 'later', label: 'Set up during onboarding', hint: 'recommended for new projects' },
              { value: 'edit', label: 'Enter commands now' },
            ],
      }),
    );
    if (gateChoice === 'later') answers.gates = stack.empty ? [] : answers.gates;
    if (gateChoice === 'edit') {
      const gates = [];
      for (const name of ['lint', 'typecheck', 'test', 'build']) {
        const current = answers.gates.find((g) => g.name === name)?.command || '';
        const cmd = bail(await p.text({ message: `${name} command ${pc.dim('(empty to skip)')}`, initialValue: current, placeholder: current || 'e.g. npm test' }));
        if (cmd?.trim()) gates.push({ name, command: cmd.trim(), required: true });
      }
      answers.gates = gates;
    }

    if (stack.git || fs.existsSync(path.join(root, '.github'))) {
      answers.ci = bail(
        await p.confirm({
          message: 'Add a GitHub Actions workflow? (gates on every PR + Claude review against the spec)',
          initialValue: answers.ci,
        }),
      );
    }
  }

  const config = makeConfig(stack, answers);
  const result = plan(root, config, { force: opts.force });
  const { lines } = summarisePlan(result.plans);
  if (result.settings?.error) p.log.warn(result.settings.error);
  p.note(lines.join('\n') || 'Nothing to change.', 'Files');

  if (opts.dryRun) return p.outro('Dry run: nothing was written.');
  if (interactive) {
    const ok = bail(await p.confirm({ message: 'Install the factory?' }));
    if (!ok) return p.outro('Nothing was written.');
  }
  apply(root, result);
  p.log.success(`Buildline installed: ${result.plans.filter((x) => x.content).length} files written.`);

  const steps = [];
  if (config.agents.includes('claude')) {
    steps.push(`${pc.cyan('claude')} then type ${pc.cyan('/buildline-onboard')}   ${pc.dim(stack.empty ? 'interview + scaffold your project' : 'map this codebase into context')}`);
    steps.push(`${pc.cyan('/buildline-new <idea>')}   ${pc.dim('start your first feature')}`);
  } else {
    steps.push(`Ask your agent: ${pc.cyan('"run the Buildline onboard station"')}`);
  }
  steps.push(`${pc.cyan('npx buildline ui')}      ${pc.dim('dashboard for PMs and designers')}`);
  steps.push(`${pc.cyan('npx buildline')}         ${pc.dim('status and menu any time')}`);
  p.note(steps.join('\n'), 'Next steps');

  if (interactive && config.agents.includes('claude') && hasCommand('claude')) {
    const launch = bail(await p.confirm({ message: 'Start onboarding in Claude Code now?', initialValue: true }));
    if (launch) {
      p.outro('Opening Claude Code…');
      return launchClaude(root, ['/buildline-onboard']);
    }
  }
  p.outro(`Read ${pc.cyan('.buildline/README.md')} for the role-by-role guide.`);
}

// ---- update / remove ---------------------------------------------------------

export async function update(root, opts) {
  if (!opts.quietIntro) p.intro(pc.bgYellow(pc.black(' buildline update ')));
  const config = loadConfig(root);
  const manifest = loadManifest(root);
  const result = plan(root, config, { force: opts.force });
  const { lines } = summarisePlan(result.plans);
  if (result.settings?.error) p.log.warn(result.settings.error);
  p.note(lines.join('\n') || 'Everything is up to date.', `v${manifest.version || '?'} → v${VERSION}`);
  if (opts.dryRun) return p.outro('Dry run: nothing was written.');
  apply(root, result);
  p.outro('Buildline updated.');
}

export async function remove(root, opts) {
  p.intro(pc.bgRed(pc.white(' buildline remove ')));
  const config = loadConfig(root);
  const result = removePlan(root, config);
  const label = { delete: pc.red('delete'), 'strip-block': pc.cyan('strip '), 'keep-modified': pc.yellow('keep  '), 'keep-user': pc.dim('keep  ') };
  p.note(result.plans.map((x) => `${label[x.action]}  ${x.rel}`).join('\n'), 'Removal plan');
  p.log.info('Your features, specs, context files, principles and buildline.json are kept. Delete .buildline/ yourself if you want them gone.');
  if (opts.dryRun) return p.outro('Dry run: nothing was removed.');
  if (!opts.yes) {
    const ok = bail(await p.confirm({ message: 'Remove the factory from this project?', initialValue: false }));
    if (!ok) return p.outro('Nothing removed.');
  }
  applyRemove(root, result);
  p.outro('Buildline removed.');
}

// ---- status ------------------------------------------------------------------

export function status(root, opts = {}) {
  const config = loadConfig(root);
  const features = listFeatures(root);
  if (opts.json) {
    console.log(JSON.stringify({ config, features: features.map(({ path: _p, ...f }) => ({ ...f, next: nextAction(f, config.autonomy) })) }, null, 2));
    return;
  }
  const active = features.filter((f) => f.status !== 'done');
  const done = features.length - active.length;
  console.log(`\n${pc.bold(config.project)} ${pc.dim('·')} ${AUTONOMY[config.autonomy]?.label || 'L' + config.autonomy} ${pc.dim('·')} ${active.length} active, ${done} shipped\n`);
  if (!active.length) {
    console.log(pc.dim('  No active features. Start one with ') + pc.cyan('npx buildline new "<title>"') + pc.dim(' or /buildline-new in Claude Code.\n'));
    return;
  }
  const who = { pm: pc.magenta('PM    '), designer: pc.blue('design'), eng: pc.cyan('eng   '), agent: pc.green('agent '), human: pc.red('human ') };
  for (const f of active) {
    const tasks = f.tasks || [];
    const passing = tasks.filter((t) => t.passes).length;
    const next = nextAction(f, config.autonomy);
    const station = f.status.padEnd(7);
    console.log(
      `  ${pc.dim(f.id)}  ${(f.title || '').slice(0, 34).padEnd(34)}  ${pc.yellow(station)} ${bar(passing, tasks.length)}  ${who[next.who] || '      '} ${next.text}`,
    );
    if (next.cmd) console.log(`  ${' '.repeat(45)}${pc.dim('▸ ' + next.cmd)}`);
  }
  console.log();
}

// ---- new / approve / move ----------------------------------------------------

export async function newFeature(root, title, opts) {
  loadConfig(root);
  let type = opts.type;
  if (!title && process.stdin.isTTY) {
    title = bail(await p.text({ message: 'What do you want to build or fix?', placeholder: 'e.g. Let users save carts for later' }));
  }
  if (!type && process.stdin.isTTY) {
    type = bail(
      await p.select({
        message: 'How big is it?',
        options: [
          { value: 'fix', label: 'Fix', hint: 'bug or small change: skips spec/design/plan' },
          { value: 'feature', label: 'Feature', hint: 'new behaviour or UI: full pipeline' },
          { value: 'epic', label: 'Epic', hint: 'several PRs: will be split into features' },
        ],
        initialValue: 'feature',
      }),
    );
  }
  const f = createFeature(root, { title, type: type || 'feature', owner: opts.owner || null, parent: opts.parent || null });
  const next = f.type === 'fix' ? `/buildline-build ${f.id}` : `/buildline-spec ${f.id}`;
  console.log(`${pc.green('✔')} Created ${pc.bold(f.id)} ${f.title} ${pc.dim(`(${f.type}) → .buildline/features/${f.dir}/`)}`);
  console.log(`  Next: ${pc.cyan(next)} in Claude Code, or edit ${pc.dim(`.buildline/features/${f.dir}/spec.md`)}`);
  return f;
}

export function approveFeature(root, ref, stage, opts) {
  const f = findFeature(root, ref);
  if (!f) throw new Error(`No feature matching "${ref}".`);
  const by = opts.by || process.env.GIT_AUTHOR_NAME || spawnSync('git', ['config', 'user.name'], { cwd: root, encoding: 'utf8' }).stdout?.trim() || process.env.USER;
  approve(f, stage, by);
  console.log(`${pc.green('✔')} ${f.id} ${stage} approved by ${by}`);
}

export function moveFeature(root, ref, station, opts) {
  const f = findFeature(root, ref);
  if (!f) throw new Error(`No feature matching "${ref}".`);
  if (!STATIONS.includes(station)) throw new Error(`Station must be one of: ${STATIONS.join(', ')}`);
  setStatus(f, station, opts.note);
  console.log(`${pc.green('✔')} ${f.id} → ${station}`);
}

// ---- gates / run / doctor ------------------------------------------------------

export function gates(root, names) {
  const script = path.join(root, '.buildline', 'bin', 'gates.mjs');
  if (!fs.existsSync(script)) throw new Error('Gates script missing. Run npx buildline update.');
  const res = spawnSync(process.execPath, [script, ...names], { cwd: root, stdio: 'inherit' });
  process.exitCode = res.status ?? 1;
}

export function goalFor(f) {
  return (
    `/goal Feature ${f.id} (${f.title}) reaches status "ship": following .buildline/stations/autopilot.md, ` +
    `every task in .buildline/features/${f.dir}/feature.json has "passes": true, the last \`node .buildline/bin/gates.mjs\` run printed "ALL GATES PASSED", ` +
    `and the buildline-verifier subagent reported every acceptance scenario as PASS. Stop early if blocked as defined in the playbook, or after 60 turns.`
  );
}

function launch(root, cmd, args) {
  if (!hasCommand(cmd)) {
    const cli = CLIS[cmd] || { label: cmd, install: '' };
    throw new Error(`${cli.label} is not installed${cli.install ? ` (${cli.install})` : ''}. Install it, then run this again.`);
  }
  // npm installs CLIs as .cmd shims on Windows, which need a shell (and quoted args).
  const win = process.platform === 'win32';
  const child = spawn(cmd, win ? args.map((x) => `"${x.replace(/"/g, '\\"')}"`) : args, { cwd: root, stdio: 'inherit', shell: win });
  return new Promise((resolve) => child.on('exit', (code) => resolve((process.exitCode = code ?? 0))));
}
const launchClaude = (root, args) => launch(root, 'claude', args);

/** Open a station for a feature in whichever CLI and model buildline.json routes it to. */
export async function step(root, station, ref, opts = {}) {
  const config = loadConfig(root);
  if (station !== 'buildline' && !MODEL_STATIONS.includes(station) && station !== 'autopilot') throw new Error(`Unknown station "${station}". Use one of: ${MODEL_STATIONS.join(', ')}.`);
  const f = ref ? findFeature(root, ref) : null;
  if (ref && !f) throw new Error(`No feature matching "${ref}".`);
  const m = opts.model ? parseModel(opts.model) : modelFor(config, station);
  const [cmd, args] = launchArgs(m, stationPrompt(m.cli, station, f?.id || ''), { headless: opts.headless });
  if (opts.print) return console.log([cmd, ...args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a))].join(' '));
  console.log(`${pc.yellow('▶')} ${station}${f ? ` ${pc.bold(f.id)} ${f.title}` : ''} ${pc.dim('on ' + describeModel(m))}`);
  return launch(root, cmd, args);
}

/** Show or change per-station models. */
export async function models(root, args, opts) {
  const config = loadConfig(root);
  const [action, station, value] = args;
  if (action === 'set' || action === 'preset') {
    if (action === 'preset') {
      if (!PRESETS[station]) throw new Error(`Unknown preset "${station}". Use one of: ${Object.keys(PRESETS).join(', ')}.`);
      config.models = { ...PRESETS[station].models };
    } else {
      if (!station || !['default', ...MODEL_STATIONS].includes(station)) throw new Error(`Usage: buildline models set <default|${MODEL_STATIONS.join('|')}> <model|inherit>`);
      if (!value) throw new Error('Give a model: opus, sonnet, haiku, a model id, codex[:model], gemini[:model], or inherit.');
      config.models = { ...(config.models || {}) };
      if (value === 'inherit') delete config.models[station];
      else config.models[station] = value;
    }
    fs.writeFileSync(configPath(root), JSON.stringify(config, null, 2) + '\n');
    apply(root, plan(root, config));
    console.log(`${pc.green('✔')} models updated; skills and subagents refreshed.`);
  } else if (action) {
    throw new Error('Usage: buildline models [set <station> <model> | preset <name>]');
  }
  if (opts.json) return console.log(JSON.stringify(Object.fromEntries(MODEL_STATIONS.map((s) => [s, modelFor(config, s)])), null, 2));
  console.log(`\n${pc.bold('Models per station')} ${pc.dim('(.buildline/buildline.json › models)')}\n`);
  for (const s of MODEL_STATIONS) {
    const m = modelFor(config, s);
    const missing = m.cli !== 'claude' && !hasCommand(m.cli) ? pc.red(` ${m.cli} not installed`) : '';
    console.log(`  ${s.padEnd(9)} ${m.model || m.cli !== 'claude' ? pc.cyan(describeModel(m)) : pc.dim(describeModel(m))}${missing}`);
  }
  console.log(`\n  ${pc.dim('Change one:')} buildline models set review codex   ${pc.dim('Presets:')} ${Object.keys(PRESETS).join(', ')}\n`);
}

export async function run(root, ref, opts) {
  const config = loadConfig(root);
  const f = ref ? findFeature(root, ref) : listFeatures(root).find((x) => ['plan', 'build', 'verify', 'review'].includes(x.status));
  if (!f) throw new Error(ref ? `No feature matching "${ref}".` : 'No feature ready to run. Pass an id: buildline run 004');
  if (config.autonomy < 3 && !opts.force) {
    throw new Error(`Autopilot needs autonomy L3+ (this project is L${config.autonomy}). Use /buildline-build ${f.id}, raise "autonomy" in .buildline/buildline.json, or pass --force.`);
  }
  const goal = goalFor(f);
  if (opts.print) return console.log(goal);
  const build = modelFor(config, 'build');
  if (build.cli !== 'claude') console.log(pc.yellow(`! Autopilot runs in Claude Code (/goal); build is set to ${build.cli}, so the session model is used for building.`));
  const [, args] = launchArgs(build.cli === 'claude' ? build : { cli: 'claude', model: null }, goal, { headless: opts.headless });
  console.log(`${pc.yellow('▶')} Autopilot for ${pc.bold(f.id)} ${f.title}${opts.headless ? pc.dim(' (headless)') : ''}`);
  return launchClaude(root, args);
}

export function doctor(root) {
  const checks = [];
  const ok = (label, detail) => checks.push([pc.green('✔'), label, detail]);
  const warn = (label, detail) => checks.push([pc.yellow('!'), label, detail]);
  const fail = (label, detail) => checks.push([pc.red('✘'), label, detail]);

  const [major] = process.versions.node.split('.').map(Number);
  major >= 20 ? ok('Node.js', process.versions.node) : fail('Node.js', `${process.versions.node}: need 20.12+`);
  hasCommand('git') ? ok('git', 'installed') : warn('git', 'not found: progress tracking and review rely on git');
  if (hasCommand('claude')) {
    const v = spawnSync('claude', ['--version'], { encoding: 'utf8' }).stdout?.trim();
    ok('Claude Code', v || 'installed');
  } else warn('Claude Code', 'not found: install from https://code.claude.com (other agents still work via AGENTS.md)');

  if (!isInstalled(root)) {
    fail('Buildline', 'not installed here: run npx buildline init');
  } else {
    let config;
    try {
      config = loadConfig(root);
      ok('buildline.json', `autonomy L${config.autonomy}, agents: ${config.agents.join(', ')}`);
    } catch (err) {
      fail('buildline.json', err.message);
    }
    const manifest = loadManifest(root);
    manifest.version === VERSION ? ok('Version', VERSION) : warn('Version', `installed ${manifest.version || '?'}, CLI is ${VERSION}: run npx buildline update`);
    if (config) {
      const routed = MODEL_STATIONS.map((s) => [s, modelFor(config, s)]).filter(([, m]) => m.model || m.cli !== 'claude');
      ok('Models', routed.length ? routed.map(([s, m]) => `${s}: ${describeModel(m)}`).join(', ') : 'session model everywhere');
      for (const cli of externalClis(config)) hasCommand(cli) ? ok(CLIS[cli].label, 'installed') : fail(CLIS[cli].label, `routed to in models but not installed: ${CLIS[cli].install}`);
      config.gates?.length ? ok('Gates', config.gates.map((g) => g.name).join(', ')) : warn('Gates', 'none configured: agents cannot verify their work. Run /buildline-onboard or edit buildline.json');
      const r = plan(root, config);
      const modified = r.plans.filter((x) => x.action === 'skip-modified').map((x) => x.rel);
      const missing = r.plans.filter((x) => x.action === 'create').map((x) => x.rel);
      missing.length ? warn('Managed files', `${missing.length} missing: run npx buildline update`) : ok('Managed files', 'present');
      if (modified.length) warn('Customised', modified.join(', '));
      if (config.agents.includes('claude')) {
        try {
          const s = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8'));
          JSON.stringify(s.hooks || {}).includes('.buildline/bin/hook.mjs') ? ok('Claude hooks', 'session briefing + acceptance guard') : warn('Claude hooks', 'missing: run npx buildline update');
        } catch {
          warn('Claude hooks', '.claude/settings.json missing or invalid');
        }
      }
    }
    const todo = ['product.md', 'architecture.md', 'design.md'].filter((f) => {
      try {
        return fs.readFileSync(path.join(root, '.buildline', 'context', f), 'utf8').includes('TODO');
      } catch {
        return true;
      }
    });
    todo.length ? warn('Context', `${todo.join(', ')} still have TODOs: run /buildline-onboard`) : ok('Context', 'filled in');
    const bad = listFeatures(root).filter((f) => f.error);
    bad.length ? fail('Features', `invalid feature.json in ${bad.map((f) => f.dir).join(', ')}`) : ok('Features', `${listFeatures(root).length} found`);
  }
  console.log();
  for (const [mark, label, detail] of checks) console.log(`  ${mark} ${label.padEnd(15)} ${pc.dim(detail)}`);
  console.log();
  if (checks.some((c) => c[0] === pc.red('✘'))) process.exitCode = 1;
}

// ---- interactive home ----------------------------------------------------------

export async function home(root) {
  console.log('\n' + LOGO + '\n');
  if (!isInstalled(root)) {
    p.intro(pc.bgYellow(pc.black(' buildline ')));
    const go = bail(await p.confirm({ message: `No factory in ${pc.cyan(path.basename(root))} yet. Set one up?`, initialValue: true }));
    if (!go) return p.outro('See you later.');
    return init(root, {});
  }
  // eslint-disable-next-line no-constant-condition
  while (true) {
    status(root);
    const features = listFeatures(root).filter((f) => f.status !== 'done');
    const action = bail(
      await p.select({
        message: 'What would you like to do?',
        options: [
          { value: 'new', label: 'Start a new feature or fix' },
          features.length && { value: 'open', label: 'Work on a feature', hint: 'approve, move, autopilot, open in Claude' },
          { value: 'ui', label: 'Open the dashboard', hint: 'browser UI for PMs and designers' },
          hasCommand('claude') && { value: 'claude', label: 'Open Claude Code at the front door', hint: '/buildline' },
          { value: 'gates', label: 'Run quality gates' },
          { value: 'doctor', label: 'Check setup (doctor)' },
          { value: 'update', label: 'Update Buildline files' },
          { value: 'exit', label: 'Exit' },
        ].filter(Boolean),
      }),
    );
    if (action === 'exit') return p.outro('Happy building.');
    if (action === 'new') await newFeature(root, null, {});
    if (action === 'ui') return (await import('./server.js')).serve(root, {});
    if (action === 'claude') return launchClaude(root, ['/buildline']);
    if (action === 'gates') gates(root, []);
    if (action === 'doctor') doctor(root);
    if (action === 'update') await update(root, {});
    if (action === 'open') {
      const config = loadConfig(root);
      const id = bail(
        await p.select({
          message: 'Which feature?',
          options: features.map((f) => ({ value: f.id, label: `${f.id} ${f.title}`, hint: `${f.status} · ${nextAction(f, config.autonomy).text}` })),
        }),
      );
      const f = findFeature(root, id);
      const what = bail(
        await p.select({
          message: `${f.id} ${f.title}`,
          options: [
            { value: 'station', label: 'Continue at this station', hint: `${f.status} · ${describeModel(modelFor(config, f.status))}` },
            config.autonomy >= 3 && ['plan', 'build', 'verify', 'review'].includes(f.status) && { value: 'run', label: 'Run autopilot (/goal)' },
            { value: 'approve', label: 'Record an approval' },
            { value: 'move', label: 'Move to another station' },
            { value: 'back', label: 'Back' },
          ].filter(Boolean),
        }),
      );
      if (what === 'station') return step(root, MODEL_STATIONS.includes(f.status) && f.status !== 'new' ? f.status : 'buildline', f.id);
      if (what === 'run') return run(root, f.id, {});
      if (what === 'approve') {
        const stage = bail(await p.select({ message: 'Approve which stage?', options: ['spec', 'design', 'plan'].map((s) => ({ value: s, label: s, hint: f.approvals?.[s] ? `already approved by ${f.approvals[s].by}` : '' })) }));
        approveFeature(root, f.id, stage, {});
      }
      if (what === 'move') {
        const station = bail(await p.select({ message: 'Move to', options: STATIONS.map((s) => ({ value: s, label: s })), initialValue: f.status }));
        moveFeature(root, f.id, station, {});
      }
    }
  }
}

export { TYPES };
