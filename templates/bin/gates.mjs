#!/usr/bin/env node
// Buildline quality gates. Runs every gate in .buildline/buildline.json in order and
// prints a summary. Exit code 0 only if all required gates pass.
//
//   node .buildline/bin/gates.mjs            run all gates
//   node .buildline/bin/gates.mjs lint test  run only the named gates
//   node .buildline/bin/gates.mjs --json     machine-readable summary
//
// Managed by buildline. Configure gates in .buildline/buildline.json, not here.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const json = args.includes('--json');
const only = args.filter((a) => !a.startsWith('--'));

let config;
try {
  config = JSON.parse(fs.readFileSync(path.join(root, '.buildline', 'buildline.json'), 'utf8'));
} catch (err) {
  console.error(`Cannot read .buildline/buildline.json: ${err.message}`);
  process.exit(1);
}

const gates = (config.gates || []).filter((g) => g.command && (!only.length || only.includes(g.name)));
if (!gates.length) {
  const msg = 'No gates configured. Add commands to "gates" in .buildline/buildline.json.';
  if (json) console.log(JSON.stringify({ ok: false, results: [], message: msg }));
  else console.log(msg);
  process.exit(1);
}

const results = [];
for (const gate of gates) {
  if (!json) console.log(`\n▶ ${gate.name}: ${gate.command}`);
  const started = Date.now();
  const res = spawnSync(gate.command, {
    cwd: root,
    shell: true,
    stdio: json ? 'pipe' : 'inherit',
    encoding: 'utf8',
    timeout: (gate.timeoutSeconds || 900) * 1000,
  });
  const ok = res.status === 0;
  const required = gate.required !== false;
  const result = { name: gate.name, command: gate.command, ok, required, seconds: Math.round((Date.now() - started) / 100) / 10 };
  if (json && !ok) result.output = `${res.stdout || ''}${res.stderr || ''}`.slice(-4000);
  results.push(result);
}

const failedRequired = results.filter((r) => !r.ok && r.required);
if (json) {
  console.log(JSON.stringify({ ok: failedRequired.length === 0, results }, null, 2));
} else {
  console.log('\n──── gates ────');
  for (const r of results) {
    const mark = r.ok ? '✔' : r.required ? '✘' : '⚠';
    console.log(`${mark} ${r.name.padEnd(12)} ${String(r.seconds).padStart(6)}s${r.ok || r.required ? '' : '  (optional)'}`);
  }
  console.log(failedRequired.length ? `\nGATES FAILED: ${failedRequired.map((r) => r.name).join(', ')}` : '\nALL GATES PASSED');
}
process.exit(failedRequired.length ? 1 : 0);
