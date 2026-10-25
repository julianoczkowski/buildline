#!/usr/bin/env node
// Claude Code hooks for the factory. Managed by buildline.
//
//   session-start  prints a short factory briefing into the new session's context
//   guard          blocks edits to a spec's "## Acceptance" section while the
//                  feature is in build/verify/review, so agents can't move the goalposts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.CLAUDE_PROJECT_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const featuresDir = path.join(root, '.buildline', 'features');
const mode = process.argv[2];

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function features() {
  if (!fs.existsSync(featuresDir)) return [];
  return fs
    .readdirSync(featuresDir)
    .map((dir) => ({ dir, data: readJson(path.join(featuresDir, dir, 'feature.json')) }))
    .filter((f) => f.data);
}

function sessionStart() {
  const config = readJson(path.join(root, '.buildline', 'buildline.json')) || {};
  const active = features().filter((f) => f.data.status !== 'done');
  const lines = [`[buildline] autonomy L${config.autonomy ?? 2}. Rules: AGENTS.md › Software factory. Type /buildline for status and next steps.`];
  for (const { dir, data } of active.slice(0, 8)) {
    const tasks = data.tasks || [];
    const done = tasks.filter((t) => t.passes).length;
    const progress = tasks.length ? ` · ${done}/${tasks.length} tasks` : '';
    const blocked = data.blocked ? ` · BLOCKED: ${data.blocked}` : '';
    lines.push(`  ${dir} · ${data.status}${progress}${blocked}`);
  }
  if (active.length > 8) lines.push(`  …and ${active.length - 8} more`);
  process.stdout.write(lines.join('\n') + '\n');
}

const acceptance = (text) => {
  const m = /^## Acceptance\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text || '');
  return m ? m[1].trim() : null;
};

function guard(input) {
  const tool = input.tool_name;
  const ti = input.tool_input || {};
  const file = ti.file_path ? path.resolve(root, ti.file_path) : null;
  if (!file || !file.startsWith(featuresDir + path.sep) || path.basename(file) !== 'spec.md') return;

  const feature = readJson(path.join(path.dirname(file), 'feature.json'));
  if (!feature || !['build', 'verify', 'review'].includes(feature.status)) return;

  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  let after = before;
  if (tool === 'Write') after = ti.content ?? '';
  else if (tool === 'Edit') after = before.replace(ti.old_string ?? '', ti.new_string ?? '');
  else if (Array.isArray(ti.edits)) for (const e of ti.edits) after = after.replace(e.old_string ?? '', e.new_string ?? '');

  if (acceptance(before) !== acceptance(after)) {
    process.stderr.write(
      `buildline guard: "## Acceptance" in ${path.relative(root, file)} is locked while the feature is in "${feature.status}". ` +
        'If a scenario is wrong, stop and ask the spec owner; they can change it at the spec station.\n',
    );
    process.exit(2);
  }
}

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let input = {};
  try {
    input = raw ? JSON.parse(raw) : {};
  } catch {}
  try {
    if (mode === 'session-start') sessionStart();
    else if (mode === 'guard') guard(input);
  } catch (err) {
    // A broken hook must never break the session.
    process.stderr.write(`buildline hook error: ${err.message}\n`);
  }
});
if (process.stdin.isTTY) process.stdin.emit('end');
