#!/usr/bin/env node
// Feature state for the factory. Managed by buildline. Zero dependencies.
//
// Agents record progress through this script instead of editing feature.json by
// hand: it stamps real times, keeps history, and refuses moves that skip a human
// approval the autonomy level requires.
//
//   node .buildline/bin/feature.mjs new "<title>" [--type fix|feature|epic] [--parent <id>]
//   node .buildline/bin/feature.mjs show <id>
//   node .buildline/bin/feature.mjs move <id> <station> [--note "…"] [--cause spec|design|plan|process|code]
//                                   (--cause is required when verify or review sends work back)
//   node .buildline/bin/feature.mjs task <id> add "<title>" [--verify "…"] [--covers R1,A2] [--files "src/a.ts,src/a.test.ts"] [--parallel]
//   node .buildline/bin/feature.mjs task <id> <T1> files "src/a.ts,src/a.test.ts"   (before build; then use scope add)
//   node .buildline/bin/feature.mjs task <id> <T1> pass|fail [--note "what you ran and saw"]
//   node .buildline/bin/feature.mjs scope <id> [add <path>... --why "<reason>"]
//                                   (the files the plan lets build change; add one during build with a reason)
//   node .buildline/bin/feature.mjs log <id> "<note>"
//   node .buildline/bin/feature.mjs block <id> "<question or reason>"
//   node .buildline/bin/feature.mjs unblock <id> [--note "…"]
//   node .buildline/bin/feature.mjs approve <id> <spec|design|plan|sensitive> --by "<name>"   (only when that person said yes)
//   node .buildline/bin/feature.mjs drop <id> "<why>" [--by "<name>"] [--branch <name>]         (only when a person said so)
//   node .buildline/bin/feature.mjs reopen <id> <station> [--note "…"]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const STATIONS = ['new', 'spec', 'design', 'plan', 'build', 'verify', 'review', 'ship', 'done'];
const TYPES = ['fix', 'feature', 'epic'];
const STAGES = ['spec', 'design', 'plan', 'sensitive'];
const now = () => new Date().toISOString();

// ---- root cause of a return ---------------------------------------------------------
// When verify or review sends work back, say where the problem started. Over time this
// shows where the line leaks (`buildline insights`), so the fix goes where it belongs.
export const CAUSES = {
  spec: 'the spec was wrong, vague or missing a case',
  design: 'the design missed a state, an edge or a contract',
  plan: 'the plan left something out or ordered it badly',
  process: 'a gate, tool or check should have caught it earlier',
  code: 'the spec and design were right; the code was wrong',
};
/** A move backwards out of verify or review: work sent back, which needs a cause. */
export const isReturn = (from, to) => ['verify', 'review'].includes(from) && STATIONS.indexOf(to) >= 0 && STATIONS.indexOf(to) < STATIONS.indexOf(from);
/** Why `cause` isn't acceptable for a move from → to, or null. */
export function causeProblem(from, to, cause) {
  if (cause != null && cause !== true && !CAUSES[cause]) return `Unknown cause "${cause}". Use one of: ${Object.keys(CAUSES).join(', ')}.`;
  if (isReturn(from, to) && (cause == null || cause === true)) {
    return `Say where the problem started when ${from} sends work back: --cause ${Object.keys(CAUSES).join('|')}. ` + Object.entries(CAUSES).map(([k, v]) => `${k}: ${v}`).join('; ') + '.';
  }
  return null;
}

/** Approvals a feature needs before it may leave a station, by autonomy level. Fixes need none. */
export function requiredApproval(station, autonomy, type) {
  if (type === 'fix') return null;
  if (station === 'spec' && autonomy <= 3) return 'spec';
  if (station === 'design' && autonomy <= 1) return 'design';
  if (station === 'plan' && autonomy <= 2) return 'plan';
  return null;
}

// ---- dropped: decided not to do it ------------------------------------------------
// A terminal status beside done. It isn't a station: nothing moves into or out of it
// except through drop and reopen, so it is always a deliberate decision by a person.

export const DROPPED = 'dropped';
/** Done or dropped: nothing left in flight. */
export const isResolved = (f) => f?.status === 'done' || f?.status === DROPPED;
const pad = (id) => String(id ?? '').padStart(3, '0');
/** The features whose parent is `epic`, from a list of feature data. */
export const childrenOf = (epic, all) => all.filter((f) => f.parent != null && f.id !== epic.id && pad(f.parent) === pad(epic.id));

/** What an epic's children came to: { shipped, dropped, open } lists of features. */
export function epicSummary(epic, all) {
  const kids = childrenOf(epic, all);
  return { shipped: kids.filter((f) => f.status === 'done'), dropped: kids.filter((f) => f.status === DROPPED), open: kids.filter((f) => !isResolved(f)) };
}
const ids = (list) => list.map((f) => f.id).join(', ');
export const epicNote = ({ shipped, dropped }) => [shipped.length && `shipped ${ids(shipped)}`, dropped.length && `dropped ${ids(dropped)}`].filter(Boolean).join('; ') || 'no child features';

/** Mark feature data dropped. Shared by the script, the CLI and the dashboard. */
export function dropData(data, { reason, by = null, branch = null } = {}) {
  if (!String(reason ?? '').trim()) throw new Error('Say why it is dropped: drop <id> "<why>". Only drop a feature when a person decided so.');
  if (data.status === DROPPED) throw new Error(`${data.id} is already dropped (${data.dropped?.reason || 'no reason recorded'}).`);
  if (data.status === 'done') throw new Error(`${data.id} has shipped. It can't be dropped.`);
  const from = data.status;
  data.status = DROPPED;
  data.dropped = { reason: String(reason).trim(), by: by || null, at: now(), branch: branch || null };
  data.blocked = null;
  data.awaiting = null;
  record(data, DROPPED, `Dropped at ${from}${by ? ` by ${by}` : ''}: ${data.dropped.reason}${branch ? ` (work on ${branch})` : ''}`);
  return data;
}

/** Put dropped feature data back on the line at `station`. Approvals and tasks stay as they were. */
export function reopenData(data, station, note) {
  if (data.status !== DROPPED) throw new Error(`${data.id} isn't dropped (it's at ${data.status}). Use move to change station.`);
  const usable = STATIONS.filter((s) => !['new', 'done'].includes(s));
  if (!usable.includes(station)) throw new Error(`Reopen at one of: ${usable.join(', ')}.`);
  const was = data.dropped?.reason;
  data.status = station;
  data.dropped = null;
  record(data, station, note ? `Reopened at ${station}: ${note}` : `Reopened at ${station}${was ? ` (was dropped: ${was})` : ''}`);
  return data;
}

/**
 * Why moving `feature` to `to` isn't allowed yet, or null. Moving back is always allowed.
 * `all` (every feature's data) lets an epic close once its children are done or dropped.
 */
export function moveBlocker(feature, to, autonomy, all = null) {
  if (feature.status === DROPPED) return `${feature.id} is dropped (${feature.dropped?.reason || 'no reason recorded'}). To work on it again, run node .buildline/bin/feature.mjs reopen ${feature.id} <station>.`;
  if (to === DROPPED) return `To drop ${feature.id}, run node .buildline/bin/feature.mjs drop ${feature.id} "<why>", and only when a person decided so.`;
  const from = STATIONS.indexOf(feature.status);
  const target = STATIONS.indexOf(to);
  if (target < 0) return `Unknown station "${to}". Use one of: ${STATIONS.join(', ')}.`;
  // An epic is an index: it closes when nothing under it is left in flight. Its children carry the approvals.
  if (feature.type === 'epic' && to === 'done' && all) {
    const { open } = epicSummary(feature, all);
    return open.length ? `${feature.id} still has child features in flight: ${open.map((f) => `${f.id} (${f.status})`).join(', ')}. An epic closes once each child is done or dropped.` : null;
  }
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

// ---- review guardrails ------------------------------------------------------------
// Paths that always need a person, whatever the autonomy level, and how many times
// review may send a feature back to build before a person decides how to go on.

export const DEFAULT_SENSITIVE = ['.github/workflows/**', '.gitlab-ci.yml'];
export const DEFAULT_MAX_ROUNDS = 3;

export function reviewConfig(config) {
  const r = config?.review || {};
  return {
    sensitive: Array.isArray(r.sensitive) ? r.sensitive : DEFAULT_SENSITIVE,
    maxRounds: r.maxRounds ?? DEFAULT_MAX_ROUNDS,
    // Tests a person owns (acceptance tests, contract tests): agents can add files here but not change existing ones mid-build.
    lockedTests: Array.isArray(r.lockedTests) ? r.lockedTests : [],
    // While a feature is in build, agents may only edit the files its tasks list (plus scope additions).
    planScope: r.planScope !== false,
  };
}

// ---- plan scope -------------------------------------------------------------------
// The plan names every file each task creates, changes or deletes. During build those
// files, plus any added with a reason (`scope add`), are the only ones an agent may edit.

const list = (v) => (Array.isArray(v) ? v : String(v ?? '').split(',')).map((s) => String(s).trim().replace(/^\.\//, '')).filter(Boolean);

/** Every path or glob the feature's plan lets build touch. Empty when the plan lists no files. */
export function planScope(data) {
  const fromTasks = (data?.tasks || []).flatMap((t) => list(t.files));
  const added = (data?.scope || []).map((s) => s.path);
  return [...new Set([...fromTasks, ...added])];
}

/** Is repo-relative `rel` inside `scope`? Plain entries match exactly (or a folder ending in /); globs match as globs. */
export function inScope(scope, rel) {
  return scope.some((p) => p === rel || (/[*?]/.test(p) || p.endsWith('/') ? scopeRegex(p).test(rel) : false));
}

// Unlike globToRegex, a bare pattern ("*.md", "docs/") matches at the repo root only: plans name exact places.
// Write "**/*.md" to match at any depth.
const scopeRegex = (p) => (p.startsWith('**') ? globToRegex(p) : new RegExp(globToRegex(p).source.replace(/^\^\(\?:\.\*\\?\/\)\?/, '^')));

export function addScope(root, ref, paths, why) {
  const add = list(paths);
  if (!add.length) throw new Error('Name the file(s) to add, e.g. scope 004 add src/lib/money.ts --why "rounding lives here"');
  if (!why || why === true) throw new Error('Say why the plan missed it: --why "<reason>". The reviewer reads every addition.');
  const f = load(root, ref);
  const have = planScope(f.data);
  const fresh = add.filter((p) => !have.includes(p));
  const at = now();
  f.data.scope = [...(f.data.scope || []), ...fresh.map((p) => ({ path: p, why, at, station: f.data.status }))];
  if (fresh.length) record(f.data, f.data.status, `Scope: added ${fresh.join(', ')}: ${why}`);
  save(f);
  return fresh;
}

/** `src/**`, `*.yml`, `billing/` style globs to a RegExp over repo-relative paths. */
export function globToRegex(glob) {
  let g = String(glob).trim().replace(/^\.\//, '');
  if (!g.replace(/\/$/, '').includes('/')) g = '**/' + g; // like .gitignore: a bare name matches at any depth
  if (g.endsWith('/')) g += '**';
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*' && g[i + 1] === '*') {
      i++;
      if (g[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export const matchSensitive = (files, globs) => {
  const res = globs.map(globToRegex);
  return files.filter((f) => res.some((re) => re.test(f)));
};

const git = (root, args) => {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
};
export const headCommit = (root) => git(root, ['rev-parse', 'HEAD']);

/** Files a feature changed: its tagged commits (`[004/T1]`), or else its branch against the default branch. */
export function changedFiles(root, id) {
  if (!headCommit(root)) return [];
  let out = git(root, ['log', '--name-only', '--format=', '-E', `--grep=\\[${id}[]/]`]);
  if (!out) {
    const base = ['origin/HEAD', 'main', 'master'].map((b) => git(root, ['merge-base', 'HEAD', b])).find(Boolean);
    out = (base && base !== headCommit(root) && git(root, ['diff', '--name-only', `${base}...HEAD`])) || '';
  }
  return [...new Set(out.split('\n').map((l) => l.trim()).filter(Boolean))];
}

/**
 * Why `feature` can't move on to ship yet because it touches sensitive paths, or null.
 * The approval covers one commit: new commits after it need a fresh one.
 */
export function sensitiveBlocker(root, feature, to, config) {
  const from = STATIONS.indexOf(feature.status);
  if (STATIONS.indexOf(to) < STATIONS.indexOf('ship') || from >= STATIONS.indexOf('ship')) return null;
  const hits = matchSensitive(changedFiles(root, feature.id), reviewConfig(config).sensitive);
  if (!hits.length) return null;
  const head = headCommit(root);
  if (feature.approvals?.sensitive?.commit === head) return null;
  const files = hits.slice(0, 5).join(', ') + (hits.length > 5 ? ` and ${hits.length - 5} more` : '');
  const again = feature.approvals?.sensitive ? ' There are new commits since the last approval.' : '';
  return `Touches sensitive paths (${files}), so a person approves it before ship.${again}`;
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

/** Every feature's data, for epic checks. */
export function loadAll(root) {
  const dir = featuresDir(root);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap((d) => {
    try {
      return /^\d{3,}-/.test(d) ? [JSON.parse(fs.readFileSync(path.join(dir, d, 'feature.json'), 'utf8'))] : [];
    } catch {
      return [];
    }
  });
}

export function save({ dir, data }) {
  data.updated = now();
  fs.writeFileSync(path.join(dir, 'feature.json'), JSON.stringify(data, null, 2) + '\n');
}

const configOf = (root) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, '.buildline', 'buildline.json'), 'utf8'));
  } catch {
    return {};
  }
};
const autonomyOf = (root) => configOf(root).autonomy ?? 2;
const record = (data, station, note, extra = {}) => (data.history = [...(data.history || []), { at: now(), station, note, ...extra }]);

/** Count a cause on the feature. Shared with the CLI and the dashboard. */
export function countCause(data, cause) {
  if (!cause || cause === true) return;
  const causes = { ...data.metrics?.causes, [cause]: (data.metrics?.causes?.[cause] || 0) + 1 };
  data.metrics = { ...data.metrics, causes };
}

export function move(root, ref, to, { note, force = false, cause = null } = {}) {
  const f = load(root, ref);
  // An unknown cause is always refused; a missing one only without --force.
  const missing = cause == null || cause === true;
  const bad = causeProblem(f.data.status, to, cause);
  if (bad && !(force && missing)) throw new Error(bad);
  // Even --force can't move a dropped feature: reopening it is a decision of its own.
  const blocker = f.data.status === DROPPED || to === DROPPED || !force ? moveBlocker(f.data, to, autonomyOf(root), f.data.type === 'epic' ? loadAll(root) : null) : null;
  if (blocker) throw new Error(blocker);
  const config = configOf(root);
  const sensitive = force ? null : sensitiveBlocker(root, f.data, to, config);
  if (sensitive) {
    f.data.blocked = sensitive;
    f.data.awaiting = 'sensitive';
    record(f.data, f.data.status, `Blocked: ${sensitive}`);
    save(f);
    throw new Error(
      `${sensitive} Ask the person to look at those files and approve. If they say yes in this conversation, record it with ` +
        `node .buildline/bin/feature.mjs approve ${f.data.id} sensitive --by "<their name>". They can also approve in npx buildline ui or watch.`,
    );
  }
  const from = f.data.status;
  if (['verify', 'review'].includes(from) && to === 'build') f.data.metrics = { ...f.data.metrics, reworks: (f.data.metrics?.reworks || 0) + 1 };
  if (from === 'review' && to === 'build') f.data.metrics = { ...f.data.metrics, reviewRounds: (f.data.metrics?.reviewRounds || 0) + 1 };
  if (to === 'done') f.data.metrics = { ...f.data.metrics, shippedAt: now() };
  const why = cause && cause !== true ? cause : null;
  countCause(f.data, why);
  f.data.status = to;
  f.data.blocked = null;
  f.data.awaiting = null;
  const closing = f.data.type === 'epic' && to === 'done' ? `Closed: ${epicNote(epicSummary(f.data, loadAll(root)))}` : null;
  record(f.data, to, [note || `Moved from ${from} to ${to}`, why && `Cause: ${why}`, closing].filter(Boolean).join('. '), { from, ...(why ? { cause: why } : {}) });
  const rounds = f.data.metrics?.reviewRounds || 0;
  const { maxRounds } = reviewConfig(config);
  if (from === 'review' && to === 'build' && maxRounds && rounds >= maxRounds) {
    f.data.blocked = `Review has sent this back ${rounds} times. Keep fixing, or step back and rethink the approach?`;
    record(f.data, to, `Blocked: ${f.data.blocked}`);
  }
  save(f);
  return f.data;
}

/** An approval record. A sensitive-path approval is tied to the commit the person saw. */
export const approval = (root, stage, by) => ({ by, at: now(), ...(stage === 'sensitive' ? { commit: headCommit(root) } : {}) });

export function approve(root, ref, stage, by) {
  if (!STAGES.includes(stage)) throw new Error(`Approval stage must be one of: ${STAGES.join(', ')}`);
  if (!by) throw new Error('Say who approved: --by "<name>". Only record an approval the person gave you.');
  const f = load(root, ref);
  f.data.approvals = { ...f.data.approvals, [stage]: approval(root, stage, by) };
  if (stage === 'sensitive' && f.data.awaiting === 'sensitive') Object.assign(f.data, { blocked: null, awaiting: null });
  record(f.data, stage, `${stage} approved by ${by}`);
  save(f);
  return f.data;
}

export function addTask(root, ref, title, { verify, covers, parallel, files } = {}) {
  if (!title) throw new Error('A task needs a title.');
  const f = load(root, ref);
  const tasks = f.data.tasks || [];
  const n = tasks.reduce((m, t) => Math.max(m, parseInt(String(t.id).replace(/\D/g, ''), 10) || 0), 0) + 1;
  const task = { id: `T${n}`, title, ...(covers ? { covers: String(covers).split(',').map((s) => s.trim()).filter(Boolean) } : {}), ...(verify ? { verify } : {}), ...(files && files !== true ? { files: list(files) } : {}), ...(parallel ? { parallel: true } : {}), passes: false, notes: '' };
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

/** Set a task's files while planning. Once build starts, additions go through addScope so they carry a reason. */
export function setTaskFiles(root, ref, id, files) {
  const f = load(root, ref);
  if (['build', 'verify', 'review', 'ship', 'done'].includes(f.data.status)) {
    throw new Error(`${f.data.id} is in "${f.data.status}": add files with scope ${f.data.id} add <path> --why "<reason>" so the reviewer sees why.`);
  }
  const task = (f.data.tasks || []).find((t) => String(t.id).toLowerCase() === String(id).toLowerCase());
  if (!task) throw new Error(`${f.data.id} has no task ${id}. Tasks: ${(f.data.tasks || []).map((t) => t.id).join(', ') || 'none yet'}.`);
  task.files = list(files);
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
  if (f.data.status === DROPPED) throw new Error(`${f.data.id} is dropped, so nobody owes it an answer. Reopen it first if work is starting again.`);
  f.data.blocked = reason;
  record(f.data, f.data.status, `Blocked: ${reason}`);
  save(f);
}

export function unblock(root, ref, note) {
  const f = load(root, ref);
  f.data.blocked = null;
  f.data.awaiting = null;
  record(f.data, f.data.status, note ? `Unblocked: ${note}` : 'Unblocked');
  save(f);
}

export function drop(root, ref, reason, { by, branch } = {}) {
  const f = load(root, ref);
  dropData(f.data, { reason, by: by || git(root, ['config', 'user.name']) || null, branch });
  save(f);
  return f.data;
}

export function reopen(root, ref, station, note) {
  const f = load(root, ref);
  reopenData(f.data, station, note);
  save(f);
  return f.data;
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
  if (d.status === DROPPED) return `${d.id} ${d.title} · dropped: ${d.dropped?.reason || ''}`;
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
      return console.log('✔ ' + summary(move(root, ref, rest[0], { note: opts.note, force: !!opts.force, cause: opts.cause ?? null })));
    case 'approve':
      return console.log('✔ ' + summary(approve(root, ref, rest[0], opts.by)));
    case 'task': {
      if (rest[0] === 'add') {
        const t = addTask(root, ref, rest.slice(1).join(' '), opts);
        return console.log(`✔ ${t.id} added: ${t.title}`);
      }
      const [id, verdict] = rest;
      if (verdict === 'files') {
        const t = setTaskFiles(root, ref, id, rest.slice(2).join(','));
        return console.log(`✔ ${t.id} files: ${t.files.join(', ') || 'none'}`);
      }
      if (!['pass', 'fail'].includes(verdict)) throw new Error('Usage: task <id> <T1> pass|fail [--note "…"]');
      const t = setTask(root, ref, id, verdict === 'pass', opts.note);
      return console.log(`✔ ${t.id} ${t.passes ? 'passes' : 'fails'} · ${summary(load(root, ref).data)}`);
    }
    case 'scope': {
      if (rest[0] === 'add') {
        const added = addScope(root, ref, rest.slice(1), opts.why);
        return console.log(added.length ? `✔ added to ${ref}'s scope: ${added.join(', ')}` : '✔ already in scope');
      }
      const scope = planScope(load(root, ref).data);
      return console.log(scope.length ? scope.join('\n') : `${ref}'s plan lists no files, so build may edit any file.`);
    }
    case 'log':
      log(root, ref, rest.join(' '));
      return console.log('✔ logged');
    case 'block':
      block(root, ref, rest.join(' '));
      return console.log(`✔ ${ref} marked blocked. Tell the person what you need; run unblock when they answer.`);
    case 'drop': {
      const by = opts.by === true ? null : opts.by;
      const branch = opts.branch === true ? null : opts.branch;
      return console.log('✔ ' + summary(drop(root, ref, rest.join(' '), { by, branch })));
    }
    case 'reopen':
      return console.log('✔ ' + summary(reopen(root, ref, rest[0], opts.note === true ? null : opts.note)));
    case 'unblock':
      unblock(root, ref, opts.note);
      return console.log(`✔ ${ref} unblocked`);
    default:
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1).filter((l, i, a) => a.slice(0, i + 1).every((x) => x.startsWith('//'))).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
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
