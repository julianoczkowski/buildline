#!/usr/bin/env node
// Claude Code hooks for the factory. Managed by buildline.
//
//   session-start  prints a short factory briefing into the new session's context
//   pre            before each tool call: the guards below, plus a session heartbeat
//   guard          blocks edits to a spec's "## Acceptance" section while the
//                  feature is in build/verify/review, so agents can't move the goalposts,
//                  and hand edits to feature.json (agents use .buildline/bin/feature.mjs)
//   prompt / post / notify / stop / session-end
//                  heartbeat: which session works on which feature and whether
//                  it is working, running something in the background, or
//                  waiting for a person, so `buildline watch` and the dashboard
//                  can show live work. Written to .buildline/sessions/ (git-ignored).
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
  // Done and dropped features need nothing from a session.
  const active = features().filter((f) => !['done', 'dropped'].includes(f.data.status));
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

/** A prompt in a line. Background tasks finishing arrive as <task-notification> prompts: show their summary. */
function promptDetail(prompt) {
  const done = /^\s*<task-notification>[\s\S]*?<summary>([\s\S]*?)<\/summary>/.exec(prompt);
  return done ? oneLine(done[1], 90) : oneLine(prompt, 60);
}

/** A feature.mjs command that changes a feature's state, e.g. "feature.mjs task 3 T1 pass". */
function actedOn(command) {
  const m = /feature\.mjs\s+(?:move|task|log|block|unblock|approve|drop|reopen)\s+(\d{1,4})\b/.exec(String(command || ''));
  return m ? m[1].padStart(3, '0') : null;
}

function isDone(id) {
  const dir = fs.existsSync(featuresDir) ? fs.readdirSync(featuresDir).find((d) => d.startsWith(`${id}-`)) : null;
  return dir ? ['done', 'dropped'].includes(readJson(path.join(featuresDir, dir, 'feature.json'))?.status) : false;
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

// Tools that stop the turn to ask the person something.
const ASKS = ['AskUserQuestion', 'ExitPlanMode'];

const oneLine = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

/** What a session left running when its turn ended: background shells, subagents, scheduled checks. */
function stillRunning(input) {
  const tasks = (Array.isArray(input.background_tasks) ? input.background_tasks : [])
    .filter((t) => !t.status || t.status === 'running')
    .map((t) => (t.type === 'shell' ? detail({ tool_input: { command: t.command || t.description } }) : `agent: ${oneLine(t.description, 40)}`));
  const crons = (Array.isArray(input.session_crons) ? input.session_crons : []).map((c) => `scheduled: ${oneLine(c.prompt || c.cron || c.schedule || 'check', 36)}`);
  return [...tasks, ...crons];
}

/** The end of the agent's last message (its last paragraph, or last sentence when that's long): what it's waiting for. */
function lastWords(message) {
  const para = oneLine(String(message || '').trim().split(/\n\s*\n/).pop(), 1000);
  if (para.length <= 90) return para || null;
  return oneLine(/[^.!?]+[.!?]*\s*$/.exec(para)?.[0] || para, 140);
}

/** The last thing the agent said ends with a question: it wants an answer even if work runs on. */
const asks = (message) => /\?\s*$/.test(String(message || '').replace(/[`*_)\]\s]+$/, ''));

const quietParent = (prev) => prev.state === 'background' || prev.state === 'waiting';

/** What a session is doing after this event: working, background (turn over, tasks still running) or waiting on a person. */
function nextState(prev, input, event) {
  const tool = input.tool_name;
  const fromSubagent = Boolean(input.agent_id);
  if (event === 'stop') {
    const running = stillRunning(input);
    const said = lastWords(input.last_assistant_message);
    if (running.length && !asks(input.last_assistant_message)) return { state: 'background', waitingFor: null, background: running, said };
    return { state: 'waiting', waitingFor: 'reply', background: running, said };
  }
  // A background subagent working on its own doesn't make the session busy again,
  // nor does it answer a question the session is waiting on.
  if (fromSubagent && quietParent(prev)) return {};
  if (event === 'notify') return { state: 'waiting', waitingFor: prev.waitingFor === 'question' ? 'question' : 'permission', said: prev.waitingFor === 'question' ? prev.said : oneLine(input.message, 140) };
  if (event === 'tool' && ASKS.includes(tool)) {
    const q = input.tool_input?.questions?.[0]?.question || (tool === 'ExitPlanMode' ? 'Approve the plan?' : 'A question');
    return { state: 'waiting', waitingFor: 'question', said: oneLine(q, 140), inTool: true };
  }
  return { state: 'working', waitingFor: null, background: [], said: null, inTool: event === 'tool' };
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
  // A session stays on the feature it was started for; reading another feature's files doesn't move it,
  // recording progress on one does. It lets go once its feature is done or the conversation is cleared,
  // so a reopened session doesn't keep flagging a finished feature.
  const bound = prev.feature && !isDone(prev.feature) && !(event === 'start' && input.source === 'clear') ? prev.feature : null;
  const feature = featureRef(prompt) || actedOn(ti.command) || bound || featureRef(ti.file_path) || featureRef(ti.command) || featureRef(ti.prompt) || null;
  const next = {
    ...prev,
    feature,
    station: station || (feature === prev.feature ? prev.station : null) || null,
    model: input.model?.id || input.model || prev.model || null,
    ...nextState(prev, input, event),
    lastAt: at,
    ...(event === 'tool' && !(input.agent_id && quietParent(prev)) ? { tool: input.tool_name, detail: detail(input) } : {}),
    ...(event === 'prompt' ? { tool: null, detail: promptDetail(prompt) } : {}),
  };
  // When the session entered its current state, so the views can say "working 4m", "waiting 12m".
  next.since = next.state === prev.state && prev.since ? prev.since : at;
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
    else if (mode === 'post') heartbeat(input, 'post');
    else if (mode === 'notify') heartbeat(input, 'notify');
    else if (mode === 'stop') heartbeat(input, 'stop');
    else if (mode === 'session-end') heartbeat(input, 'end');
  } catch (err) {
    // A broken hook must never break the session.
    process.stderr.write(`buildline hook error: ${err.message}\n`);
  }
});
if (process.stdin.isTTY) process.stdin.emit('end');
