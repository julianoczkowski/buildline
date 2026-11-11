// Where shipped specs and the context files may no longer describe the code.
// A cheap first pass from git alone: which files each shipped feature changed, and
// which of them other commits have changed since it shipped. Whether that is drift
// (the spec now says something untrue) is for an agent to check and a person to
// decide: see .buildline/stations/drift.md. Nothing here writes.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const git = (root, args) => {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
};

const tagOf = (subject) => /\[(\d{3,})[\]/]/.exec(subject || '')?.[1] || null;

/** Commits as { sha, at, subject, files } from `git log` args. */
function commits(root, args) {
  const out = git(root, ['log', '--no-merges', '--format=@@%H%x09%cI%x09%s', '--name-only', ...args]);
  if (!out) return [];
  return out
    .split('@@')
    .filter(Boolean)
    .map((chunk) => {
      const [head, ...files] = chunk.split('\n');
      const [sha, at, ...subject] = head.split('\t');
      return { sha, at, subject: subject.join('\t'), files: files.map((f) => f.trim()).filter(Boolean) };
    });
}

/**
 * For each shipped feature: the files its own commits (tagged `[004/T1]`) changed, and
 * the commits since it shipped that changed those files again.
 * { id, title, dir, shippedAt, files, changed: [file], gone: [file], commits, by: { '007': 3 }, untagged }
 * Features without tagged commits can't be traced and come back in `untraced`.
 */
export function featureDrift(root, features) {
  const rows = [];
  const untraced = [];
  for (const f of features.filter((x) => x.status === 'done' && x.metrics?.shippedAt)) {
    const own = commits(root, ['-E', `--grep=\\[${f.id}[]/]`]);
    const files = [...new Set(own.flatMap((c) => c.files))].filter((p) => !p.startsWith('.buildline/'));
    if (!files.length) {
      untraced.push({ id: f.id, title: f.title });
      continue;
    }
    const later = commits(root, [`--since=${f.metrics.shippedAt}`, '--', ...files]).filter((c) => tagOf(c.subject) !== f.id);
    const changed = [...new Set(later.flatMap((c) => c.files).filter((p) => files.includes(p)))];
    const gone = files.filter((p) => !fs.existsSync(path.join(root, p)));
    const by = {};
    let untagged = 0;
    for (const c of later) {
      const t = tagOf(c.subject);
      if (t) by[t] = (by[t] || 0) + 1;
      else untagged++;
    }
    rows.push({ id: f.id, title: f.title, dir: f.dir, shippedAt: f.metrics.shippedAt, files, changed, gone, commits: later.length, by, untagged });
  }
  rows.sort((a, b) => b.changed.length - a.changed.length || b.commits - a.commits);
  return { features: rows, untraced };
}

/** Each .buildline/context file: when it last changed, and how many commits (outside .buildline/) landed since. */
export function contextDrift(root) {
  const dir = path.join(root, '.buildline', 'context');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const rel = `.buildline/context/${f}`;
      const at = (git(root, ['log', '-1', '--format=%cI', '--', rel]) || '').trim() || null;
      const since = at ? commits(root, [`--since=${at}`]).filter((c) => c.files.some((p) => !p.startsWith('.buildline/'))) : [];
      return { file: rel, updatedAt: at, commits: since.length, files: new Set(since.flatMap((c) => c.files.filter((p) => !p.startsWith('.buildline/')))).size };
    });
}

/** Shipped features whose code moved since, and stale context files: what an agent should check first. */
export function drift(root, features) {
  return { ...featureDrift(root, features), context: contextDrift(root) };
}
