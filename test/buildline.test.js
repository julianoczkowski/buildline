import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { detect } from '../src/detect.js';
import { makeConfig, plan, apply, removePlan, applyRemove } from '../src/install.js';
import { createFeature, findFeature, approve, setStatus, nextAction, slugify, listFeatures, readSessions, liveState, attention, newAttention } from '../src/features.js';
import { parseModel, parseModelList, launchArgs, stationPrompt } from '../src/models.js';

const bin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'buildline.js');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'buildline-test-'));
const write = (root, rel, content) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
};
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function install(root, answers = {}) {
  const config = makeConfig(detect(root), answers);
  apply(root, plan(root, config));
  return config;
}

test('detects an empty project', () => {
  const root = tmp();
  write(root, 'README.md', '# hi');
  const s = detect(root);
  assert.equal(s.empty, true);
});

test('detects a Next.js + pnpm project and its gates', () => {
  const root = tmp();
  write(root, 'package.json', JSON.stringify({ name: 'web', scripts: { lint: 'next lint', test: 'vitest', build: 'next build', dev: 'next dev' }, dependencies: { next: '15', react: '19' }, devDependencies: { vitest: '1', tailwindcss: '4' } }));
  write(root, 'pnpm-lock.yaml', '');
  write(root, 'tsconfig.json', '{}');
  const s = detect(root);
  assert.deepEqual(s.frameworks, ['Next.js']);
  assert.equal(s.packageManager, 'pnpm');
  assert.equal(s.commands.test, 'pnpm test');
  assert.equal(s.commands.typecheck, 'npx tsc --noEmit');
  assert.ok(s.ui.includes('Tailwind CSS'));
});

test('detects Python with uv, Go and Rust', () => {
  const py = tmp();
  write(py, 'pyproject.toml', '[project]\ndependencies=["fastapi","pytest","ruff"]');
  write(py, 'uv.lock', '');
  const s = detect(py);
  assert.ok(s.frameworks.includes('FastAPI'));
  assert.equal(s.commands.test, 'uv run pytest');
  const go = tmp();
  write(go, 'go.mod', 'module x');
  assert.equal(detect(go).commands.test, 'go test ./...');
  const rs = tmp();
  write(rs, 'Cargo.toml', '[package]');
  assert.equal(detect(rs).commands.test, 'cargo test');
});

test('install preserves user content and merges settings', () => {
  const root = tmp();
  write(root, 'package.json', JSON.stringify({ name: 'app', scripts: { test: 'node --test' } }));
  write(root, 'CLAUDE.md', '# Mine\nKeep me.\n');
  write(root, '.claude/settings.json', JSON.stringify({ model: 'opus', permissions: { allow: ['Bash(ls)'] } }));
  install(root);
  assert.match(read(root, 'CLAUDE.md'), /Keep me\./);
  assert.match(read(root, 'CLAUDE.md'), /@AGENTS\.md/);
  assert.match(read(root, 'AGENTS.md'), /npm run test/);
  const s = JSON.parse(read(root, '.claude/settings.json'));
  assert.equal(s.model, 'opus');
  assert.ok(s.permissions.allow.includes('Bash(ls)'));
  assert.ok(JSON.stringify(s.hooks).includes('hook.mjs'));
  assert.ok(fs.existsSync(path.join(root, '.claude/skills/buildline-build/SKILL.md')));
  assert.ok(fs.existsSync(path.join(root, '.buildline/features/.gitkeep')));
});

test('install is idempotent and never duplicates blocks or hooks', () => {
  const root = tmp();
  const config = install(root);
  const again = plan(root, config);
  assert.deepEqual(again.plans.filter((p) => p.action !== 'unchanged').map((p) => p.rel), []);
  apply(root, again);
  assert.equal(read(root, 'AGENTS.md').match(/buildline:start/g).length, 1);
  const s = JSON.parse(read(root, '.claude/settings.json'));
  assert.equal(s.hooks.PreToolUse.length, 1);
});

test('update keeps files the user edited', () => {
  const root = tmp();
  const config = install(root);
  fs.appendFileSync(path.join(root, '.buildline/stations/build.md'), '\nTeam rule.\n');
  const p = plan(root, config);
  assert.equal(p.plans.find((x) => x.rel === '.buildline/stations/build.md').action, 'skip-modified');
  apply(root, p);
  assert.match(read(root, '.buildline/stations/build.md'), /Team rule\./);
});

test('remove restores settings and keeps user work', () => {
  const root = tmp();
  write(root, '.claude/settings.json', JSON.stringify({ model: 'opus' }, null, 2) + '\n');
  write(root, 'CLAUDE.md', '# Mine\n');
  const config = install(root);
  createFeature(root, { title: 'Keep this' });
  applyRemove(root, removePlan(root, config));
  assert.deepEqual(JSON.parse(read(root, '.claude/settings.json')), { model: 'opus' });
  assert.equal(read(root, 'CLAUDE.md').trim(), '# Mine');
  assert.ok(!fs.existsSync(path.join(root, '.claude/skills')));
  assert.ok(fs.existsSync(path.join(root, '.buildline/features/001-keep-this/spec.md')));
  assert.ok(fs.existsSync(path.join(root, '.buildline/buildline.json')));
});

test('features: create, find, approve, move, next action', () => {
  const root = tmp();
  install(root);
  const a = createFeature(root, { title: 'Saved carts for later!', type: 'feature' });
  const b = createFeature(root, { title: 'Fix crash', type: 'fix' });
  assert.equal(a.id, '001');
  assert.equal(b.status, 'build');
  assert.equal(findFeature(root, '1').dir, '001-saved-carts-for-later');
  assert.equal(findFeature(root, 'crash').id, '002');
  assert.equal(nextAction(findFeature(root, '1'), 2).who, 'pm');
  approve(findFeature(root, '1'), 'spec', 'Ana');
  setStatus(findFeature(root, '1'), 'build');
  const f = findFeature(root, '1');
  assert.equal(f.approvals.spec.by, 'Ana');
  assert.equal(f.history.length, 3);
  assert.throws(() => setStatus(f, 'nope'));
  assert.equal(slugify('Ünïcode — Café'), 'unicode-cafe');
});

test('guard hook locks acceptance only during build/verify/review', () => {
  const root = tmp();
  install(root);
  const f = createFeature(root, { title: 'Guarded', type: 'fix' }); // status: build
  const spec = path.join(f.path, 'spec.md');
  const run = (input) => spawnSync(process.execPath, [path.join(root, '.buildline/bin/hook.mjs'), 'guard'], { input: JSON.stringify(input), env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
  // An unfilled (TODO) acceptance may be written during build: fixes start there.
  assert.equal(run({ tool_name: 'Edit', tool_input: { file_path: spec, old_string: '**Given** TODO', new_string: '**Given** a page' } }).status, 0);
  fs.writeFileSync(spec, fs.readFileSync(spec, 'utf8').replace(/(## Acceptance\s*\n)[\s\S]*?(?=\n## )/, '$1- A1 **Given** a page **When** loaded **Then** it shows 2026\n'));
  const editAcceptance = { tool_name: 'Edit', tool_input: { file_path: spec, old_string: 'shows 2026', new_string: 'shows anything' } };
  assert.equal(run(editAcceptance).status, 2);
  assert.equal(run({ tool_name: 'Edit', tool_input: { file_path: spec, old_string: '- R1 TODO', new_string: '- R1 ok' } }).status, 0);
  setStatus(findFeature(root, f.id), 'spec');
  assert.equal(run(editAcceptance).status, 0);
});

test('gates script reports pass/fail and honours optional gates', () => {
  const root = tmp();
  install(root, { gates: [{ name: 'ok', command: 'node -e "0"' }, { name: 'soft', command: 'node -e "process.exit(1)"', required: false }] });
  const res = spawnSync(process.execPath, [path.join(root, '.buildline/bin/gates.mjs'), '--json'], { encoding: 'utf8' });
  assert.equal(res.status, 0);
  assert.equal(JSON.parse(res.stdout).ok, true);
  const cfg = JSON.parse(read(root, '.buildline/buildline.json'));
  cfg.gates[1].required = true;
  write(root, '.buildline/buildline.json', JSON.stringify(cfg));
  assert.equal(spawnSync(process.execPath, [path.join(root, '.buildline/bin/gates.mjs')], { encoding: 'utf8' }).status, 1);
});

test('CLI: init -y, new, status --json', () => {
  const root = tmp();
  const cli = (...args) => spawnSync(process.execPath, [bin, ...args, '-C', root], { encoding: 'utf8' });
  assert.equal(cli('init', '-y', '--agents', 'claude,cursor').status, 0);
  assert.ok(fs.existsSync(path.join(root, '.cursor/rules/buildline.mdc')));
  assert.equal(cli('new', 'Hello world', '--type', 'feature').status, 0);
  const out = JSON.parse(cli('status', '--json').stdout);
  assert.equal(out.features[0].title, 'Hello world');
  assert.equal(cli('bogus').status, 1);
});

test('models: per-station routing reaches skills, subagents and launch commands', () => {
  const root = tmp();
  install(root, { models: { default: 'sonnet', plan: 'opus', review: 'codex:gpt-5-codex', verify: 'claude-opus-5-5' } });
  const skill = (name) => read(root, `.claude/skills/${name}/SKILL.md`);
  assert.match(skill('buildline-plan'), /^model: opus$/m);
  assert.match(skill('buildline-build'), /^model: sonnet$/m);
  assert.doesNotMatch(skill('buildline-review'), /^model:/m);
  assert.match(skill('buildline-review'), /npx buildline step review \$ARGUMENTS --headless/);
  assert.match(read(root, '.claude/agents/buildline-verifier.md'), /^model: claude-opus-5-5$/m);
  assert.match(read(root, '.claude/agents/buildline-reviewer.md'), /^model: opus$/m); // routed elsewhere: template default kept

  assert.deepEqual(parseModel('gemini'), { cli: 'gemini', model: null });
  assert.deepEqual(parseModel('inherit'), { cli: 'claude', model: null });
  assert.deepEqual(launchArgs({ cli: 'claude', model: 'opus' }, '/buildline-plan 001'), ['claude', ['--model', 'opus', '/buildline-plan 001']]);
  assert.deepEqual(launchArgs({ cli: 'codex', model: null }, 'go', { headless: true }), ['codex', ['exec', '--sandbox', 'workspace-write', 'go']]);
  assert.equal(stationPrompt('codex', 'review', '004'), 'Follow .buildline/stations/review.md step by step for feature 004. Project rules are in AGENTS.md.');
});

test('CLI: models from flags, set by phase, and step --print', () => {
  const root = tmp();
  const cli = (...args) => spawnSync(process.execPath, [bin, ...args, '-C', root], { encoding: 'utf8' });
  cli('init', '-y', '--models', 'planning=fable,building=claude-opus-5-5');
  const cfg = () => JSON.parse(read(root, '.buildline/buildline.json')).models;
  assert.deepEqual(cfg(), { spec: 'fable', design: 'fable', plan: 'fable', build: 'claude-opus-5-5' });
  assert.match(read(root, '.claude/skills/buildline-plan/SKILL.md'), /^model: fable$/m);
  assert.match(read(root, '.claude/skills/buildline-build/SKILL.md'), /^model: claude-opus-5-5$/m);
  assert.equal(cli('models', 'set', 'checking', 'some-model-from-the-future').status, 0);
  assert.equal(cfg().review, 'some-model-from-the-future'); // any name is accepted; the CLI decides
  assert.equal(cli('models', 'set', 'build', 'inherit').status, 0);
  assert.doesNotMatch(read(root, '.claude/skills/buildline-build/SKILL.md'), /^model:/m);
  cli('new', 'Thing');
  assert.equal(cli('step', 'plan', '1', '--print').stdout.trim(), 'claude --model fable "/buildline-plan 001"');
  assert.equal(cli('models', 'set', 'nope', 'x').status, 1);
});

test('models: parseModelList expands phases and rejects unknown stations', () => {
  assert.deepEqual(parseModelList('checking=codex,default=sonnet'), { verify: 'codex', review: 'codex', default: 'sonnet' });
  assert.deepEqual(parseModelList(''), {});
  assert.throws(() => parseModelList('planing=fable'), /Unknown station or phase/);
  assert.throws(() => parseModelList('plan'), /station=model/);
});

test('watch: one frame shows every feature on its track, models and events', () => {
  const root = tmp();
  install(root, { models: { plan: 'fable', build: 'claude-opus-5-5' } });
  const a = createFeature(root, { title: 'Saved carts' });
  approve(a, 'spec', 'Maya');
  setStatus(a, 'build');
  createFeature(root, { title: 'Fix rounding', type: 'fix' });
  const out = spawnSync(process.execPath, [bin, 'watch', '-C', root], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } }).stdout;
  assert.match(out, /THE LINE/);
  assert.match(out, /001\s+●━+●━+●━+◉/); // spec, design, plan behind it, build is current
  assert.match(out, /002\s+·┄+·┄+·┄+◉/); // a fix skips the planning stations
  assert.match(out, /fable .* opus-5-5/);
  assert.match(out, /spec approved by Maya/);
  assert.match(out, /❯ \/buildline-build 001/);
});

const script = (root, ...args) => spawnSync(process.execPath, [path.join(root, '.buildline/bin/feature.mjs'), ...args], { encoding: 'utf8' });
const hook = (root, mode, input) =>
  spawnSync(process.execPath, [path.join(root, '.buildline/bin/hook.mjs'), mode], { encoding: 'utf8', input: JSON.stringify(input), env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
const featureJson = (root, id) => JSON.parse(read(root, fs.readdirSync(path.join(root, '.buildline/features')).filter((d) => d.startsWith(id)).map((d) => `.buildline/features/${d}/feature.json`)[0]));

test('feature script: tasks, log, block and real timestamps', () => {
  const root = tmp();
  install(root);
  assert.equal(script(root, 'new', 'Footer year', '--type', 'fix').status, 0);
  const before = Date.now();
  assert.match(script(root, 'task', '1', 'add', 'Reproduce, then fix', '--covers', 'A1').stdout, /T1 added/);
  script(root, 'task', '1', 'add', 'Gates pass');
  assert.equal(script(root, 'task', '1', 'T1', 'pass', '--note', 'ran the page').status, 0);
  assert.equal(script(root, 'task', '1', 'T9', 'pass').status, 1);
  script(root, 'block', '1', 'Which currency?');
  let f = featureJson(root, '001');
  assert.deepEqual(f.tasks.map((t) => [t.id, t.passes]), [['T1', true], ['T2', false]]);
  assert.deepEqual(f.tasks[0].covers, ['A1']);
  assert.equal(f.blocked, 'Which currency?');
  for (const h of f.history.slice(1)) assert.ok(Math.abs(new Date(h.at) - before) < 60e3, `real time, not ${h.at}`);
  script(root, 'unblock', '1', '--note', 'GBP');
  script(root, 'move', '1', 'verify');
  script(root, 'move', '1', 'build');
  f = featureJson(root, '001');
  assert.equal(f.blocked, null);
  assert.equal(f.metrics.reworks, 1);
});

test('approvals: a feature cannot skip a required approval, from the script or the CLI', () => {
  const root = tmp();
  install(root, { autonomy: 2 });
  script(root, 'new', 'Opening hours');
  const refused = script(root, 'move', '1', 'design');
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /needs spec approval .* approve 001 spec --by/);
  assert.equal(featureJson(root, '001').status, 'spec');
  const cli = spawnSync(process.execPath, [bin, 'move', '1', 'build', '-C', root], { encoding: 'utf8' });
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /npx buildline approve 001 spec/);
  assert.equal(script(root, 'approve', '1', 'spec').status, 1); // must say who
  script(root, 'approve', '1', 'spec', '--by', 'Maya');
  assert.equal(script(root, 'move', '1', 'design').status, 0);
  assert.equal(script(root, 'move', '1', 'build').status, 1); // plan approval at L2
  assert.equal(script(root, 'move', '1', 'spec').status, 0); // going back is always fine
});

test('hooks: heartbeat tracks sessions per feature, guard blocks hand edits to feature.json', () => {
  const root = tmp();
  install(root);
  script(root, 'new', 'Nav focus', '--type', 'fix');
  const settings = JSON.parse(read(root, '.claude/settings.json'));
  for (const e of ['SessionStart', 'PreToolUse', 'UserPromptSubmit', 'Stop', 'SessionEnd']) assert.ok(settings.hooks[e], e);
  assert.equal(settings.hooks.PreToolUse.length, 1);
  hook(root, 'prompt', { session_id: 'abc', prompt: '/buildline-build 1' });
  hook(root, 'pre', { session_id: 'abc', tool_name: 'Edit', tool_input: { file_path: path.join(root, 'style.css'), old_string: 'a', new_string: 'b' } });
  let s = JSON.parse(read(root, '.buildline/sessions/abc.json'));
  assert.deepEqual([s.feature, s.station, s.state, s.tool, s.detail], ['001', 'build', 'working', 'Edit', 'style.css']);
  assert.match(read(root, '.buildline/sessions/.gitignore'), /\*/);
  hook(root, 'pre', { session_id: 'abc', tool_name: 'Read', tool_input: { file_path: path.join(root, '.buildline/features/002-other/spec.md') } });
  assert.equal(JSON.parse(read(root, '.buildline/sessions/abc.json')).feature, '001'); // reading another feature doesn't move the session
  const featureFile = path.join(root, '.buildline/features', fs.readdirSync(path.join(root, '.buildline/features')).find((d) => d.startsWith('001')), 'feature.json');
  const denied = hook(root, 'pre', { session_id: 'abc', tool_name: 'Write', tool_input: { file_path: featureFile, content: '{}' } });
  assert.equal(denied.status, 2);
  assert.match(denied.stderr, /feature\.mjs/);
  assert.equal(hook(root, 'pre', { session_id: 'abc', tool_name: 'Bash', tool_input: { command: `echo '{}' > ${featureFile}` } }).status, 2);
  assert.equal(hook(root, 'pre', { session_id: 'abc', tool_name: 'Bash', tool_input: { command: 'node .buildline/bin/feature.mjs task 1 T1 pass' } }).status, 0);
  hook(root, 'stop', { session_id: 'abc' });
  s = JSON.parse(read(root, '.buildline/sessions/abc.json'));
  assert.equal(s.state, 'waiting');
  const out = spawnSync(process.execPath, [bin, 'watch', '-C', root], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } }).stdout;
  assert.match(out, /NEEDS YOU/);
  hook(root, 'prompt', { session_id: 'abc', prompt: 'yes, GBP' });
  assert.match(spawnSync(process.execPath, [bin, 'watch', '-C', root], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } }).stdout, /WORKING/);
  hook(root, 'session-end', { session_id: 'abc' });
  assert.ok(!fs.existsSync(path.join(root, '.buildline/sessions/abc.json')));
});

test('sound: chimes when a feature starts waiting on a person or ships, and turns off', () => {
  const root = tmp();
  install(root);
  script(root, 'new', 'Nav focus', '--type', 'fix');
  script(root, 'new', 'Price label', '--type', 'fix');
  const look = () => {
    const sessions = readSessions(root);
    return new Map(listFeatures(root).map((f) => [f.id, attention(f, liveState(f, sessions))]));
  };
  const first = look();
  assert.deepEqual(newAttention(null, first), []); // nothing on the first look
  hook(root, 'prompt', { session_id: 'abc', prompt: '/buildline-build 1' });
  assert.deepEqual(newAttention(first, look()), []); // working isn't news
  const working = look();
  hook(root, 'stop', { session_id: 'abc' });
  assert.deepEqual(newAttention(working, look()), ['001']);
  const waiting = look();
  assert.deepEqual(newAttention(waiting, look()), []); // still waiting: no second chime
  script(root, 'block', '2', 'Which currency?');
  script(root, 'move', '1', 'done', '--force');
  assert.deepEqual(newAttention(waiting, look()), ['001', '002']);

  const cli = (...args) => spawnSync(process.execPath, [bin, ...args, '-C', root], { encoding: 'utf8' });
  assert.match(cli('sound').stdout, /Sound is on/);
  assert.equal(cli('sound', 'off').status, 0);
  assert.equal(JSON.parse(read(root, '.buildline/buildline.json')).sound, false);
  assert.equal(cli('sound', 'loud').status, 1);
});

test('hooks: background work, questions and permission prompts are told apart from waiting on you', () => {
  const root = tmp();
  install(root);
  script(root, 'new', 'Fix the tests', '--type', 'fix');
  const settings = JSON.parse(read(root, '.claude/settings.json'));
  assert.equal(settings.hooks.Notification[0].matcher, 'permission_prompt|elicitation_dialog');
  assert.ok(settings.hooks.PostToolUse);
  const session = () => JSON.parse(read(root, '.buildline/sessions/s1.json'));
  const live = () => liveState(findFeature(root, '1'), readSessions(root));
  const waits = () => (({ why, said }) => ({ why, said }))(live().waitingFor || {});
  const watchOut = () => spawnSync(process.execPath, [bin, 'watch', '-C', root], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } }).stdout;

  hook(root, 'prompt', { session_id: 's1', prompt: '/buildline-ship 1' });
  // The turn ends with a CI watch and a subagent still running (as Claude Code reports it).
  const running = [
    { id: 'b1', type: 'shell', status: 'running', command: 'gh run watch 40316894431 --interval 30 --exit-status' },
    { id: 'a1', type: 'subagent', status: 'running', description: 'Check the deploy logs' },
  ];
  hook(root, 'stop', { session_id: 's1', last_assistant_message: "I'll close the feature once the deploy result comes in.", background_tasks: running, session_crons: [] });
  assert.equal(session().state, 'background');
  // How long it has been in the background, and since the session started.
  const later = readSessions(root, Date.now() + 5 * 60e3)[0];
  assert.ok(later.for >= 5 * 60e3 && later.for < 6 * 60e3 && later.total >= later.for, `${later.for} ${later.total}`);
  assert.deepEqual(live().background, ['gh run watch 40316894431 --interval 30 --exit-s…', 'agent: Check the deploy logs']);
  assert.equal(live().waiting, false);
  assert.match(watchOut(), /BACKGROUND/);
  assert.doesNotMatch(watchOut(), /NEEDS YOU/);
  // The background subagent's own tool calls don't make the session look busy.
  hook(root, 'pre', { session_id: 's1', agent_id: 'a1', tool_name: 'Bash', tool_input: { command: 'gh run view 1 --log' } });
  assert.equal(session().state, 'background');
  const since = session().since;
  hook(root, 'pre', { session_id: 's1', agent_id: 'a1', tool_name: 'Read', tool_input: { file_path: 'x' } });
  assert.equal(session().since, since); // still the same stretch in the background
  // The deploy finishes: Claude Code wakes the session with a task notification.
  hook(root, 'prompt', { session_id: 's1', prompt: '<task-notification>\n<task-id>b1</task-id>\n<status>completed</status>\n<summary>Background command "Watch the deploy" completed (exit code 0)</summary>\n</task-notification>' });
  assert.deepEqual([session().state, session().detail, session().feature], ['working', 'Background command "Watch the deploy" completed (exit code 0)', '001']);
  // A question at the end of a turn wants an answer even while work runs on.
  hook(root, 'stop', { session_id: 's1', last_assistant_message: 'Deploy is green. Shall I open the PR now?', background_tasks: [running[1]] });
  assert.deepEqual(waits(), { why: 'reply', said: 'Deploy is green. Shall I open the PR now?' });
  // Mid-turn: a question tool, then a permission prompt, then work again.
  hook(root, 'prompt', { session_id: 's1', prompt: 'yes' });
  hook(root, 'pre', { session_id: 's1', tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: 'Squash the commits?' }] } });
  assert.deepEqual(waits(), { why: 'question', said: 'Squash the commits?' });
  hook(root, 'notify', { session_id: 's1', notification_type: 'permission_prompt', message: 'Claude needs your permission' });
  assert.equal(live().waitingFor.why, 'question'); // the question tool raises a permission prompt too
  hook(root, 'post', { session_id: 's1', tool_name: 'AskUserQuestion' });
  assert.equal(live().working, true);
  hook(root, 'pre', { session_id: 's1', tool_name: 'Bash', tool_input: { command: 'gh pr create --fill' } });
  hook(root, 'notify', { session_id: 's1', notification_type: 'permission_prompt', message: 'Claude needs your permission to use Bash' });
  assert.deepEqual(waits(), { why: 'permission', said: 'Claude needs your permission to use Bash' });
  hook(root, 'post', { session_id: 's1', tool_name: 'Bash' });
  assert.deepEqual([live().working, live().waiting], [true, false]);
  // Nothing left running at the end of a turn: it's your move.
  hook(root, 'stop', { session_id: 's1', last_assistant_message: 'PR opened.', background_tasks: [], session_crons: [] });
  assert.deepEqual(waits(), { why: 'reply', said: 'PR opened.' });
});

test('hooks: a session lets go of its feature once it is done, so a reopened session never flags it', () => {
  const root = tmp();
  install(root);
  script(root, 'new', 'Nav focus', '--type', 'fix');
  script(root, 'new', 'Price label', '--type', 'fix');
  const session = () => JSON.parse(read(root, '.buildline/sessions/s1.json'));
  const live = (id) => liveState(findFeature(root, id), readSessions(root));
  hook(root, 'prompt', { session_id: 's1', prompt: '/buildline-build 1' });
  hook(root, 'pre', { session_id: 's1', tool_name: 'Bash', tool_input: { command: 'node .buildline/bin/feature.mjs move 1 done --force' } });
  script(root, 'move', '1', 'done', '--force');
  hook(root, 'stop', { session_id: 's1', last_assistant_message: 'Shipped.' });
  assert.equal(session().feature, null);
  // An old session file still tied to a done feature (from before this fix) shows nothing either.
  fs.writeFileSync(path.join(root, '.buildline/sessions/old.json'), JSON.stringify({ id: 'old', feature: '001', state: 'waiting', lastAt: new Date().toISOString() }));
  assert.equal(live('1').waiting, false);
  // The same session, reopened days later for something else: nothing is flagged.
  hook(root, 'session-start', { session_id: 's1', source: 'resume' });
  hook(root, 'prompt', { session_id: 's1', prompt: 'why is the dashboard showing needs you?' });
  hook(root, 'stop', { session_id: 's1', last_assistant_message: 'Because of the session id.' });
  assert.deepEqual([live('1').waiting, live('2').waiting], [false, false]);
  // Recording progress on another feature moves the session there; reading one doesn't.
  hook(root, 'pre', { session_id: 's1', tool_name: 'Read', tool_input: { file_path: path.join(root, '.buildline/features/002-price-label/spec.md') } });
  hook(root, 'pre', { session_id: 's1', tool_name: 'Bash', tool_input: { command: 'node .buildline/bin/feature.mjs task 2 add "Reproduce"' } });
  assert.equal(session().feature, '002');
  hook(root, 'pre', { session_id: 's1', tool_name: 'Bash', tool_input: { command: 'node .buildline/bin/feature.mjs show 1' } });
  assert.equal(session().feature, '002');
  // /clear starts a fresh conversation: the session is free again.
  hook(root, 'session-start', { session_id: 's1', source: 'clear' });
  assert.equal(session().feature, null);
});
