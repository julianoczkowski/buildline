import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { detect } from '../src/detect.js';
import { makeConfig, plan, apply, removePlan, applyRemove } from '../src/install.js';
import { createFeature, findFeature, approve, setStatus, nextAction, slugify } from '../src/features.js';

const bin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'factory.js');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'factory-test-'));
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
  assert.ok(fs.existsSync(path.join(root, '.claude/skills/factory-build/SKILL.md')));
  assert.ok(fs.existsSync(path.join(root, '.factory/features/.gitkeep')));
});

test('install is idempotent and never duplicates blocks or hooks', () => {
  const root = tmp();
  const config = install(root);
  const again = plan(root, config);
  assert.deepEqual(again.plans.filter((p) => p.action !== 'unchanged').map((p) => p.rel), []);
  apply(root, again);
  assert.equal(read(root, 'AGENTS.md').match(/factory:start/g).length, 1);
  const s = JSON.parse(read(root, '.claude/settings.json'));
  assert.equal(s.hooks.PreToolUse.length, 1);
});

test('update keeps files the user edited', () => {
  const root = tmp();
  const config = install(root);
  fs.appendFileSync(path.join(root, '.factory/stations/build.md'), '\nTeam rule.\n');
  const p = plan(root, config);
  assert.equal(p.plans.find((x) => x.rel === '.factory/stations/build.md').action, 'skip-modified');
  apply(root, p);
  assert.match(read(root, '.factory/stations/build.md'), /Team rule\./);
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
  assert.ok(fs.existsSync(path.join(root, '.factory/features/001-keep-this/spec.md')));
  assert.ok(fs.existsSync(path.join(root, '.factory/factory.json')));
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
  const run = (input) => spawnSync(process.execPath, [path.join(root, '.factory/bin/hook.mjs'), 'guard'], { input: JSON.stringify(input), env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
  const editAcceptance = { tool_name: 'Edit', tool_input: { file_path: spec, old_string: '**Given** TODO', new_string: '**Given** weaker' } };
  assert.equal(run(editAcceptance).status, 2);
  assert.equal(run({ tool_name: 'Edit', tool_input: { file_path: spec, old_string: '- R1 TODO', new_string: '- R1 ok' } }).status, 0);
  setStatus(findFeature(root, f.id), 'spec');
  assert.equal(run(editAcceptance).status, 0);
});

test('gates script reports pass/fail and honours optional gates', () => {
  const root = tmp();
  install(root, { gates: [{ name: 'ok', command: 'node -e "0"' }, { name: 'soft', command: 'node -e "process.exit(1)"', required: false }] });
  const res = spawnSync(process.execPath, [path.join(root, '.factory/bin/gates.mjs'), '--json'], { encoding: 'utf8' });
  assert.equal(res.status, 0);
  assert.equal(JSON.parse(res.stdout).ok, true);
  const cfg = JSON.parse(read(root, '.factory/factory.json'));
  cfg.gates[1].required = true;
  write(root, '.factory/factory.json', JSON.stringify(cfg));
  assert.equal(spawnSync(process.execPath, [path.join(root, '.factory/bin/gates.mjs')], { encoding: 'utf8' }).status, 1);
});

test('CLI: init -y, new, status --json', () => {
  const root = tmp();
  const cli = (...args) => spawnSync(process.execPath, [bin, ...args, '-C', root], { encoding: 'utf8' });
  assert.equal(cli('init', '-y', '--agents', 'claude,cursor').status, 0);
  assert.ok(fs.existsSync(path.join(root, '.cursor/rules/factory.mdc')));
  assert.equal(cli('new', 'Hello world', '--type', 'feature').status, 0);
  const out = JSON.parse(cli('status', '--json').stdout);
  assert.equal(out.features[0].title, 'Hello world');
  assert.equal(cli('bogus').status, 1);
});
