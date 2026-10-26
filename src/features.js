// Reading and writing factory features (.buildline/features/<id>-<slug>/).
// The CLI, the web dashboard and agents all share this on-disk format.
import fs from 'node:fs';
import path from 'node:path';
import { render, templatesDir } from './render.js';
import { moveBlocker } from '../templates/bin/feature.mjs';

export { moveBlocker };

export const STATIONS = ['new', 'spec', 'design', 'plan', 'build', 'verify', 'review', 'ship', 'done'];
export const TYPES = ['fix', 'feature', 'epic'];
export const APPROVAL_STAGES = ['spec', 'design', 'plan'];

export const featuresDir = (root) => path.join(root, '.buildline', 'features');
const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();

export function slugify(title) {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .slice(0, 5)
      .join('-') || 'feature'
  );
}

export function listFeatures(root) {
  const dir = featuresDir(root);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((d) => /^\d{3,}-/.test(d) && fs.existsSync(path.join(dir, d, 'feature.json')))
    .sort()
    .map((d) => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, d, 'feature.json'), 'utf8'));
        return { ...data, dir: d, path: path.join(dir, d) };
      } catch (err) {
        return { id: d.split('-')[0], dir: d, title: d, status: 'unknown', error: err.message, path: path.join(dir, d) };
      }
    });
}

export function findFeature(root, ref) {
  const all = listFeatures(root);
  if (!ref) return null;
  const r = String(ref).toLowerCase();
  return (
    all.find((f) => f.id === r || f.id === r.padStart(3, '0')) ||
    all.find((f) => f.dir === r) ||
    all.find((f) => f.slug === r) ||
    all.find((f) => f.dir.includes(r)) ||
    null
  );
}

export function saveFeature(feature) {
  const { dir, path: p, error, ...data } = feature;
  data.updated = now();
  fs.writeFileSync(path.join(p, 'feature.json'), JSON.stringify(data, null, 2) + '\n');
  return feature;
}

export function createFeature(root, { title, type = 'feature', owner = null, parent = null }) {
  if (!title?.trim()) throw new Error('A feature needs a title.');
  if (!TYPES.includes(type)) throw new Error(`Type must be one of: ${TYPES.join(', ')}`);
  const existing = listFeatures(root);
  const next = existing.reduce((m, f) => Math.max(m, parseInt(f.id, 10) || 0), 0) + 1;
  const id = String(next).padStart(3, '0');
  const slug = slugify(title);
  const dir = path.join(featuresDir(root), `${id}-${slug}`);
  fs.mkdirSync(dir, { recursive: true });

  const vars = { id, title: title.trim(), type, date: today() };
  const feature = {
    id,
    slug,
    title: title.trim(),
    type,
    status: type === 'fix' ? 'build' : 'spec',
    owner,
    parent,
    blocked: null,
    approvals: {},
    tasks: [],
    metrics: { reworks: 0, createdAt: now(), shippedAt: null },
    history: [{ at: now(), station: 'new', note: `Opened as ${type}` }],
    created: now(),
    updated: now(),
  };
  fs.writeFileSync(path.join(dir, 'feature.json'), JSON.stringify(feature, null, 2) + '\n');
  // Prefer the project's own (possibly customised) templates over the bundled ones.
  for (const name of ['spec.md', 'progress.md']) {
    const local = path.join(root, '.buildline', 'templates', name);
    const source = fs.existsSync(local) ? local : path.join(templatesDir, 'feature', name);
    fs.writeFileSync(path.join(dir, name), render(fs.readFileSync(source, 'utf8'), vars));
  }
  return { ...feature, dir: `${id}-${slug}`, path: dir };
}

export function setStatus(feature, status, note) {
  if (!STATIONS.includes(status)) throw new Error(`Status must be one of: ${STATIONS.join(', ')}`);
  feature.status = status;
  if (status === 'done') feature.metrics = { ...feature.metrics, shippedAt: now() };
  feature.history = [...(feature.history || []), { at: now(), station: status, note: note || `Moved to ${status}` }];
  return saveFeature(feature);
}

export function approve(feature, stage, by) {
  if (!APPROVAL_STAGES.includes(stage)) throw new Error(`Approval stage must be one of: ${APPROVAL_STAGES.join(', ')}`);
  feature.approvals = { ...feature.approvals, [stage]: { by: by || 'unknown', at: now() } };
  feature.history = [...(feature.history || []), { at: now(), station: stage, note: `${stage} approved by ${by || 'unknown'}` }];
  return saveFeature(feature);
}

/** What a feature is waiting on, in plain words, for status displays. */
export function nextAction(feature, autonomy = 2) {
  const a = feature.approvals || {};
  const tasks = feature.tasks || [];
  const passing = tasks.filter((t) => t.passes).length;
  if (feature.blocked) return { who: 'human', text: `blocked: ${feature.blocked}` };
  switch (feature.status) {
    case 'spec':
      if (/TODO/.test(readSpecSection(feature, 'Acceptance') || 'TODO')) return { who: 'pm', text: 'needs requirements & acceptance', cmd: `/buildline-spec ${feature.id}` };
      return autonomy <= 3 && !a.spec ? { who: 'pm', text: 'waiting on spec approval', cmd: `buildline approve ${feature.id} spec` } : { who: 'agent', text: 'ready for design', cmd: `/buildline-design ${feature.id}` };
    case 'design':
      if (autonomy <= 1 && a.design) return { who: 'agent', text: 'ready for a plan', cmd: `/buildline-plan ${feature.id}` };
      return { who: 'designer', text: 'needs UX / technical design', cmd: `/buildline-design ${feature.id}` };
    case 'plan':
      if (!tasks.length) return { who: 'eng', text: 'needs a task plan', cmd: `/buildline-plan ${feature.id}` };
      if (feature.type !== 'fix' && autonomy <= 2 && !a.plan) return { who: 'eng', text: 'waiting on plan approval', cmd: `buildline approve ${feature.id} plan` };
      return { who: 'agent', text: 'ready to build', cmd: `/buildline-build ${feature.id}` };
    case 'build':
      if (feature.type !== 'fix' && autonomy <= 3 && !a.spec) return { who: 'pm', text: 'waiting on spec approval', cmd: `buildline approve ${feature.id} spec` };
      if (feature.type !== 'fix' && autonomy <= 2 && !a.plan && tasks.length) return { who: 'eng', text: 'waiting on plan approval', cmd: `buildline approve ${feature.id} plan` };
      return { who: 'agent', text: tasks.length ? `${passing}/${tasks.length} tasks passing` : 'ready to build', cmd: autonomy >= 3 ? `buildline run ${feature.id}` : `/buildline-build ${feature.id}` };
    case 'verify':
      return { who: 'agent', text: 'ready for verification', cmd: `/buildline-verify ${feature.id}` };
    case 'review':
      return { who: 'agent', text: 'ready for review', cmd: `/buildline-review ${feature.id}` };
    case 'ship':
      return { who: 'eng', text: 'ready to ship: open PR', cmd: `/buildline-ship ${feature.id}` };
    case 'done':
      return { who: null, text: 'shipped' };
    default:
      return { who: null, text: feature.status };
  }
}

export function readSpecSection(feature, heading) {
  try {
    const text = fs.readFileSync(path.join(feature.path, 'spec.md'), 'utf8');
    const m = new RegExp(`^## ${heading}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(text);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

// ---- live sessions -------------------------------------------------------------
// Claude Code hooks write one file per session to .buildline/sessions/ (see
// templates/bin/hook.mjs). A session that hasn't been heard from in a while has
// most likely crashed or been closed without a SessionEnd.

const WORKING_FOR = 10 * 60e3;
const WAITING_FOR = 2 * 3600e3;

export function readSessions(root, at = Date.now()) {
  const dir = path.join(root, '.buildline', 'sessions');
  const out = [];
  // `tracked` says hooks are reporting here, so "no session" really means nobody is working.
  out.tracked = fs.existsSync(dir);
  if (!out.tracked) return out;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    try {
      const s = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      const age = at - new Date(s.lastAt);
      // How long it has been in this state, and since the session started.
      const timing = { for: at - new Date(s.since || s.lastAt), total: at - new Date(s.startedAt || s.lastAt) };
      // A long command (tests, a deploy watch) keeps a session working with no new events.
      if (s.state === 'working' && age < (s.inTool ? WAITING_FOR : WORKING_FOR)) out.push({ ...s, age, ...timing });
      else if ((s.state === 'waiting' || s.state === 'background') && age < WAITING_FOR) out.push({ ...s, age, ...timing });
    } catch {}
  }
  return Object.assign(out.sort((a, b) => a.age - b.age), { tracked: true });
}

/** Recent tool calls from live sessions, oldest first. */
export function readActivity(root, limit = 200) {
  try {
    const text = fs.readFileSync(path.join(root, '.buildline', 'sessions', 'activity.jsonl'), 'utf8');
    return text.split('\n').filter(Boolean).slice(-limit).flatMap((l) => {
      try {
        return [JSON.parse(l)];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

/**
 * What's happening on a feature right now: live sessions on it, and whether one
 * waits on a person (that wins), one is working, or one finished its turn with
 * work still running in the background (a CI watch, a background agent). Where no hooks report (agents other than
 * Claude Code), a feature whose files changed in the last two minutes counts as worked on.
 */
export function liveState(feature, sessions, at = Date.now()) {
  const mine = sessions.filter((s) => s.feature === feature.id);
  const working = mine.filter((s) => s.state === 'working');
  const recent = at - new Date(feature.updated || 0) < 2 * 60e3;
  const waiting = mine.find((s) => s.state === 'waiting');
  return {
    sessions: mine,
    working: working.length > 0 || (!sessions.tracked && recent && !feature.blocked && feature.status !== 'done'),
    waiting: Boolean(waiting),
    // why: 'reply' | 'question' | 'permission', and what the agent said or asked
    waitingFor: waiting ? { why: waiting.waitingFor || 'reply', said: waiting.said || null, for: waiting.for } : null,
    background: !working.length && !waiting ? mine.filter((s) => s.state === 'background').flatMap((s) => s.background || []) : [],
    backgroundFor: Math.max(0, ...mine.filter((s) => s.state === 'background').map((s) => s.for || 0)),
  };
}

/** What the chime is for: 'waiting' when a feature needs a person, 'done' once it ships, else null. */
export function attention(feature, live) {
  if (feature.status === 'done') return 'done';
  return feature.blocked || live?.waiting ? 'waiting' : null;
}

/** Ids whose attention changed to waiting or done since `before` (a Map from the last look). */
export function newAttention(before, now) {
  if (!before) return [];
  return [...now].filter(([id, a]) => a && before.get(id) !== a).map(([id]) => id);
}
