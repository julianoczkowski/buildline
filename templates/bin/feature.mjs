#!/usr/bin/env node
// Feature state for the factory. Managed by buildline. Zero dependencies.
//
// Agents record progress through this script instead of editing feature.json by
// hand: it stamps real times, keeps history, and refuses moves that skip a human
// approval the autonomy level requires.
//
//   node .buildline/bin/feature.mjs new "<title>" [--type fix|feature|epic] [--parent <id>]
//   node .buildline/bin/feature.mjs show <id>
//   node .buildline/bin/feature.mjs move <id> <station> [--note "…"]
//   node .buildline/bin/feature.mjs task <id> add "<title>" [--verify "…"] [--covers R1,A2] [--parallel]
//   node .buildline/bin/feature.mjs task <id> <T1> pass|fail [--note "what you ran and saw"]
//   node .buildline/bin/feature.mjs log <id> "<note>"
//   node .buildline/bin/feature.mjs block <id> "<question or reason>"
//   node .buildline/bin/feature.mjs unblock <id> [--note "…"]
//   node .buildline/bin/feature.mjs approve <id> <spec|design|plan> --by "<name>"   (only when that person said yes)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const STATIONS = ['new', 'spec', 'design', 'plan', 'build', 'verify', 'review', 'ship', 'done'];
const TYPES = ['fix', 'feature', 'epic'];
const STAGES = ['spec', 'design', 'plan'];
const now = () => new Date().toISOString();

/** Approvals a feature needs before it may leave a station, by autonomy level. Fixes need none. */
export function requiredApproval(station, autonomy, type) {
  if (type === 'fix') return null;
  if (station === 'spec' && autonomy <= 3) return 'spec';
  if (station === 'design' && autonomy <= 1) return 'design';
  if (station === 'plan' && autonomy <= 2) return 'plan';
  return null;
}

/** Why moving `feature` to `to` isn't allowed yet, or null. Moving back is always allowed. */
export function moveBlocker(feature, to, autonomy) {
  const from = STATIONS.indexOf(feature.status);
  const target = STATIONS.indexOf(to);
  if (target < 0) return `Unknown station "${to}". Use one of: ${STATIONS.join(', ')}.`;
  for (let i = Math.max(from, 0); i < target; i++) {
    const stage = requiredApproval(STATIONS[i], autonomy, feature.type);
    if (stage && !feature.approvals?.[stage]) {
      return (
        `${feature.id} needs ${stage} approval before it can leave "${STATIONS[i]}" (autonomy L${autonomy}). ` +
        `Ask the person: "Approve the ${stage}?". If they say yes in this conversation, record it with ` +
        `node .buildline/bin/feature.mjs approve ${feature.id} ${stage} --by "<their name>". ` +
        `They can also approve in npx buildline ui or npx buildline watch. Leave the status where it is until then.`
      );
    }
  }
  return null;
}

export function featuresDir(root) {
  return path.join(root, '.buildline', 'features');
}

export function findFeatureDir(root, ref) {
  const dir = featuresDir(root);
  if (!fs.existsSync(dir)) return null;
  const r = String(ref ?? '').toLowerCase();
  const dirs = fs.readdirSync(dir).filter((d) => /^\d{3,}-/.test(d) && fs.existsSync(path.join(dir, d, 'feature.json')));
  const hit = dirs.find((d) => d.split('-')[0] === r.padStart(3, '0')) || dirs.find((d) => d === r) || dirs.find((d) => d.includes(r));
  return hit ? path.join(dir, hit) : null;
}

export function load(root, ref) {
  const dir = findFeatureDir(root, ref);
  if (!dir) throw new Error(`No feature "${ref}" in .buildline/features.`);
  return { dir, data: JSON.parse(fs.readFileSync(path.join(dir, 'feature.json'), 'utf8')) };
}

export function save({ dir, data }) {
  data.updated = now();
  fs.writeFileSync(path.join(dir, 'feature.json'), JSON.stringify(data, null, 2) + '\n');
}

const autonomyOf = (root) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, '.buildline', 'buildline.json'), 'utf8')).autonomy ?? 2;
  } catch {
    return 2;
  }
};
const record = (data, station, note) => (data.history = [...(data.history || []), { at: now(), station, note }]);

export function move(root, ref, to, { note, force = false } = {}) {
  const f = load(root, ref);
  const blocker = force ? null : moveBlocker(f.data, to, autonomyOf(root));
  if (blocker) throw new Error(blocker);
  const from = f.data.status;
  if (['verify', 'review'].includes(from) && to === 'build') f.data.metrics = { ...f.data.metrics, reworks: (f.data.metrics?.reworks || 0) + 1 };
  if (to === 'done') f.data.metrics = { ...f.data.metrics, shippedAt: now() };
  f.data.status = to;
  f.data.blocked = null;
  record(f.data, to, note || `Moved from ${from} to ${to}`);
  save(f);
  return f.data;
}

export function approve(root, ref, stage, by) {
  if (!STAGES.includes(stage)) throw new Error(`Approval stage must be one of: ${STAGES.join(', ')}`);
  if (!by) throw new Error('Say who approved: --by "<name>". Only record an approval the person gave you.');
  const f = load(root, ref);
  f.data.approvals = { ...f.data.approvals, [stage]: { by, at: now() } };
  record(f.data, stage, `${stage} approved by ${by}`);
  save(f);
  return f.data;
}

export function addTask(root, ref, title, { verify, covers, parallel } = {}) {
  if (!title) throw new Error('A task needs a title.');
  const f = load(root, ref);
  const tasks = f.data.tasks || [];
  const n = tasks.reduce((m, t) => Math.max(m, parseInt(String(t.id).replace(/\D/g, ''), 10) || 0), 0) + 1;
  const task = { id: `T${n}`, title, ...(covers ? { covers: String(covers).split(',').map((s) => s.trim()).filter(Boolean) } : {}), ...(verify ? { verify } : {}), ...(parallel ? { parallel: true } : {}), passes: false, notes: '' };
  f.data.tasks = [...tasks, task];
  save(f);
  return task;
}

export function setTask(root, ref, id, passes, note) {
  const f = load(root, ref);
  const task = (f.data.tasks || []).find((t) => String(t.id).toLowerCase() === String(id).toLowerCase());
  if (!task) throw new Error(`${f.data.id} has no task ${id}. Tasks: ${(f.data.tasks || []).map((t) => t.id).join(', ') || 'none yet'}.`);
  task.passes = passes;
  if (note) task.notes = note;
  record(f.data, f.data.status, `${task.id} ${passes ? 'passes' : 'fails'}${note ? `: ${note}` : ''}`);
  save(f);
  return task;
}

export function log(root, ref, note) {
  if (!note) throw new Error('Nothing to log.');
  const f = load(root, ref);
  record(f.data, f.data.status, note);
  save(f);
}

export function block(root, ref, reason) {
  if (!reason) throw new Error('Say what you need: block <id> "<question or reason>".');
  const f = load(root, ref);
  f.data.blocked = reason;
  record(f.data, f.data.status, `Blocked: ${reason}`);
  save(f);
}

export function unblock(root, ref, note) {
  const f = load(root, ref);
  f.data.blocked = null;
  record(f.data, f.data.status, note ? `Unblocked: ${note}` : 'Unblocked');
  save(f);
}

const slugify = (title) =>
  title.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).slice(0, 5).join('-') || 'feature';

export function create(root, title, { type = 'feature', parent = null, owner = null, templates } = {}) {
  if (!title?.trim()) throw new Error('A feature needs a title.');
  if (!TYPES.includes(type)) throw new Error(`Type must be one of: ${TYPES.join(', ')}`);
  const base = featuresDir(root);
  fs.mkdirSync(base, { recursive: true });
  const next = fs.readdirSync(base).reduce((m, d) => Math.max(m, /^\d{3,}-/.test(d) ? parseInt(d, 10) : 0), 0) + 1;
  const id = String(next).padStart(3, '0');
  const slug = slugify(title);
  const dir = path.join(base, `${id}-${slug}`);
  fs.mkdirSync(dir, { recursive: true });
  const at = now();
  const data = {
    id, slug, title: title.trim(), type, status: type === 'fix' ? 'build' : 'spec', owner, parent, blocked: null,
    approvals: {}, tasks: [], metrics: { reworks: 0, createdAt: at, shippedAt: null },
    history: [{ at, station: 'new', note: `Opened as ${type}` }], created: at, updated: at,
  };
  fs.writeFileSync(path.join(dir, 'feature.json'), JSON.stringify(data, null, 2) + '\n');
  const vars = { id, title: data.title, type, date: at.slice(0, 10) };
  for (const name of ['spec.md', 'progress.md']) {
    const local = path.join(root, '.buildline', 'templates', name);
    const source = fs.existsSync(local) ? local : templates && path.join(templates, name);
    const text = source && fs.existsSync(source) ? fs.readFileSync(source, 'utf8') : `# ${data.title}\n`;
    fs.writeFileSync(path.join(dir, name), text.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m)));
  }
  return { ...data, dir };
}

// ---- command line --------------------------------------------------------------

function parse(argv) {
  const pos = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      opts[key] = val;
    } else pos.push(a);
  }
  return { pos, opts };
}

function summary(d) {
  const tasks = d.tasks || [];
  return `${d.id} ${d.title} · ${d.status}${d.blocked ? ` · BLOCKED: ${d.blocked}` : ''} · ${tasks.filter((t) => t.passes).length}/${tasks.length} tasks`;
}

function main(argv) {
  const root = process.env.BUILDLINE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const { pos, opts } = parse(argv);
  const [cmd, ref, ...rest] = pos;
  switch (cmd) {
    case 'new': {
      const f = create(root, [ref, ...rest].join(' '), { type: opts.type, parent: opts.parent, owner: opts.owner });
      return console.log(`✔ created ${path.relative(root, f.dir)} · status ${f.status}`);
    }
    case 'show':
      return console.log(JSON.stringify(load(root, ref).data, null, 2));
    case 'move':
      return console.log('✔ ' + summary(move(root, ref, rest[0], { note: opts.note, force: !!opts.force })));
    case 'approve':
      return console.log('✔ ' + summary(approve(root, ref, rest[0], opts.by)));
    case 'task': {
      if (rest[0] === 'add') {
        const t = addTask(root, ref, rest.slice(1).join(' '), opts);
        return console.log(`✔ ${t.id} added: ${t.title}`);
      }
      const [id, verdict] = rest;
      if (!['pass', 'fail'].includes(verdict)) throw new Error('Usage: task <id> <T1> pass|fail [--note "…"]');
      const t = setTask(root, ref, id, verdict === 'pass', opts.note);
      return console.log(`✔ ${t.id} ${t.passes ? 'passes' : 'fails'} · ${summary(load(root, ref).data)}`);
    }
    case 'log':
      log(root, ref, rest.join(' '));
      return console.log('✔ logged');
    case 'block':
      block(root, ref, rest.join(' '));
      return console.log(`✔ ${ref} marked blocked. Tell the person what you need; run unblock when they answer.`);
    case 'unblock':
      unblock(root, ref, opts.note);
      return console.log(`✔ ${ref} unblocked`);
    default:
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 17).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
      if (cmd) process.exitCode = 1;
  }
}

const invoked = () => {
  try {
    return import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
};
if (process.argv[1] && invoked()) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(`✘ ${err.message}`);
    process.exitCode = 1;
  }
}
