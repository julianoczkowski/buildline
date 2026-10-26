#!/usr/bin/env node
// Claude Code hooks for the factory. Managed by buildline.
//
//   session-start  prints a short factory briefing into the new session's context
//   pre            before each tool call: the guards below, plus a session heartbeat
//   guard          blocks edits to a spec's "## Acceptance" section while the
//                  feature is in build/verify/review, so agents can't move the goalposts,
//                  and hand edits to feature.json (agents use .buildline/bin/feature.mjs)
//   prompt / stop / session-end
//                  heartbeat: which session works on which feature, so
//                  `buildline watch` and the dashboard can show live work.
//                  Written to .buildline/sessions/ (git-ignored).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.CLAUDE_PROJECT_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const featuresDir = path.join(root, '.buildline', 'features');
const mode = process.argv[2];
const sessionsDir = path.join(root, '.buildline', 'sessions');

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

const deny = (msg) => {
  process.stderr.write(msg + '\n');
  process.exit(2);
};

function guard(input) {
  const tool = input.tool_name;
  const ti = input.tool_input || {};
  const file = ti.file_path ? path.resolve(root, ti.file_path) : null;
  const viaScript = 'Use node .buildline/bin/feature.mjs instead (move, task, log, block, approve); run it with no arguments for usage. It records real times and checks approvals.';
  if (file && file.startsWith(featuresDir + path.sep) && path.basename(file) === 'feature.json' && fs.existsSync(file)) {
    deny(`buildline guard: don't edit ${path.relative(root, file)} by hand. ${viaScript}`);
  }
  if (tool === 'Bash' && /feature\.json/.test(ti.command || '') && !/feature\.mjs/.test(ti.command || '') && /(>|sed\s+-i|writeFile|json\.dump|\btee\b|perl\s+-[a-z]*i)/.test(ti.command || '')) {
    deny(`buildline guard: don't write feature.json from the shell. ${viaScript}`);
  }
  if (!file || !file.startsWith(featuresDir + path.sep) || path.basename(file) !== 'spec.md') return;

  const feature = readJson(path.join(path.dirname(file), 'feature.json'));
  if (!feature || !['build', 'verify', 'review'].includes(feature.status)) return;

  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  let after = before;
  if (tool === 'Write') after = ti.content ?? '';
  else if (tool === 'Edit') after = before.replace(ti.old_string ?? '', ti.new_string ?? '');
  else if (Array.isArray(ti.edits)) for (const e of ti.edits) after = after.replace(e.old_string ?? '', e.new_string ?? '');

  // An acceptance section still holding the template's TODO may be filled in (fixes start at build).
  const unfilled = /\bTODO\b/.test(acceptance(before) ?? 'TODO');
  if (!unfilled && acceptance(before) !== acceptance(after)) {
    process.stderr.write(
      `buildline guard: "## Acceptance" in ${path.relative(root, file)} is locked while the feature is in "${feature.status}". ` +
        'If a scenario is wrong, stop and ask the spec owner; they can change it at the spec station.\n',
    );
    process.exit(2);
  }
}

// ---- heartbeat -------------------------------------------------------------------

/** The feature a prompt or tool call is about, e.g. "/buildline-build 3" or a path under features/003-…. */
function featureRef(text) {
  const s = String(text || '');
  const m =
    /\.buildline\/features\/(\d{3,})-/.exec(s) ||
    /feature\.mjs\s+(?:move|task|log|block|unblock|approve|show)\s+(\d{1,4})\b/.exec(s) ||
    /\/buildline(?:-[a-z]+)?\s+(\d{1,4})\b/.exec(s) ||
    /buildline\s+(?:step\s+[a-z]+|run|approve|move)\s+(\d{1,4})\b/.exec(s);
  return m ? m[1].padStart(3, '0') : null;
}

function detail(input) {
  const ti = input.tool_input || {};
  if (ti.file_path) return path.basename(ti.file_path);
  if (ti.command) {
    // Short and readable: drop heredoc bodies and the long feature folder paths.
    const cmd = String(ti.command).split(/<<|\n/)[0].replace(/\.buildline\/features\/[^/\s]+\//g, '').replace(/\s+/g, ' ').trim();
    return cmd.length > 48 ? cmd.slice(0, 47) + '…' : cmd;
  }
  if (ti.pattern) return String(ti.pattern).slice(0, 40);
  if (ti.description) return String(ti.description).slice(0, 60);
  return '';
}

function heartbeat(input, event) {
  const id = String(input.session_id || '').replace(/[^\w-]/g, '');
  if (!id) return;
  fs.mkdirSync(sessionsDir, { recursive: true });
  const ignore = path.join(sessionsDir, '.gitignore');
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, '*\n');
  const file = path.join(sessionsDir, `${id}.json`);
  if (event === 'end') return fs.rmSync(file, { force: true });
  const at = new Date().toISOString();
  const prev = readJson(file) || { id, startedAt: at };
  const prompt = input.prompt || '';
  const station = /\/buildline-([a-z]+)/.exec(prompt)?.[1];
  const ti = input.tool_input || {};
  // A session stays on the feature it was started for; reading another feature's files doesn't move it.
  const feature = featureRef(prompt) || prev.feature || featureRef(ti.file_path) || featureRef(ti.command) || featureRef(ti.prompt) || null;
  const next = {
    ...prev,
    feature,
    station: station || prev.station || null,
    model: input.model?.id || input.model || prev.model || null,
    state: event === 'stop' ? 'waiting' : 'working',
    lastAt: at,
    ...(event === 'tool' ? { tool: input.tool_name, detail: detail(input) } : {}),
    ...(event === 'prompt' ? { tool: null, detail: prompt.replace(/\s+/g, ' ').slice(0, 60) } : {}),
  };
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
  if (event === 'tool' && feature) {
    // A short live activity feed for the views; trimmed so it never grows large.
    const feed = path.join(sessionsDir, 'activity.jsonl');
    fs.appendFileSync(feed, JSON.stringify({ at, session: id.slice(0, 8), feature, tool: input.tool_name, detail: next.detail }) + '\n');
    if (fs.statSync(feed).size > 200_000) fs.writeFileSync(feed, fs.readFileSync(feed, 'utf8').split('\n').slice(-500).join('\n'));
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
    if (mode === 'session-start') sessionStart(), heartbeat(input, 'start');
    else if (mode === 'guard') guard(input);
    else if (mode === 'pre') heartbeat(input, 'tool'), guard(input);
    else if (mode === 'prompt') heartbeat(input, 'prompt');
    else if (mode === 'stop') heartbeat(input, 'stop');
    else if (mode === 'session-end') heartbeat(input, 'end');
  } catch (err) {
    // A broken hook must never break the session.
    process.stderr.write(`buildline hook error: ${err.message}\n`);
  }
});
if (process.stdin.isTTY) process.stdin.emit('end');
