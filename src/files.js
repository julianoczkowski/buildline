// Safe file writing for installs into projects that may already be running.
//
// Two write modes:
//   - "file":  the factory owns the whole file. On update we only overwrite it
//              if the user has not edited it since we wrote it (hash check).
//   - "block": the file belongs to the user (AGENTS.md, CLAUDE.md, .gitignore).
//              We only ever touch the region between our markers.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const MANIFEST = '.buildline/manifest.json';
const START = (c) => `${c[0]} buildline:start — managed by buildline, edit outside this block ${c[1]}`.trim();
const END = (c) => `${c[0]} buildline:end ${c[1]}`.trim();
const COMMENT = { md: ['<!--', '-->'], hash: ['#', ''] };

export const hash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

export function loadManifest(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, MANIFEST), 'utf8'));
  } catch {
    return { version: null, files: {} };
  }
}

export function saveManifest(root, manifest) {
  const file = path.join(root, MANIFEST);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
}

function blockRegex(style) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const c = COMMENT[style];
  return new RegExp(`${esc(c[0])} buildline:start[^\\n]*\\n[\\s\\S]*?${esc(END(c))}\\n?`);
}

/**
 * Plan a single write without touching disk. Returns
 * { rel, action: 'create'|'update'|'skip-modified'|'unchanged'|'merge', content }.
 */
export function planWrite(root, manifest, entry, { force = false } = {}) {
  const abs = path.join(root, entry.path);
  const exists = fs.existsSync(abs);
  const current = exists ? fs.readFileSync(abs, 'utf8') : null;

  if (entry.mode === 'block') {
    const style = entry.comment || 'md';
    const c = COMMENT[style];
    const block = `${START(c)}\n${entry.content.trimEnd()}\n${END(c)}\n`;
    if (!exists) {
      const content = (entry.header ? entry.header + '\n\n' : '') + block;
      return { rel: entry.path, action: 'create', content, record: block };
    }
    const re = blockRegex(style);
    const next = re.test(current)
      ? current.replace(re, block)
      : entry.position === 'top'
        ? block + '\n' + current
        : current.trimEnd() + '\n\n' + block;
    if (next === current) return { rel: entry.path, action: 'unchanged' };
    return { rel: entry.path, action: re.test(current) ? 'update' : 'merge', content: next, record: block };
  }

  // Whole-file mode.
  if (!exists) return { rel: entry.path, action: 'create', content: entry.content, record: entry.content };
  // User-owned files (config, context, principles) are seeded once and then belong to the user.
  if (entry.userOwned || current === entry.content) return { rel: entry.path, action: 'unchanged' };
  const known = manifest.files[entry.path];
  const untouched = known && known === hash(current);
  if (!untouched && !force) return { rel: entry.path, action: 'skip-modified' };
  return { rel: entry.path, action: 'update', content: entry.content, record: entry.content };
}

export function applyPlan(root, manifest, plans) {
  for (const p of plans) {
    if (p.content === undefined) continue;
    const abs = path.join(root, p.rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, p.content);
    if (p.executable) fs.chmodSync(abs, 0o755);
    // For block files we record the block hash; whole files record the file hash.
    manifest.files[p.rel] = hash(p.mode === 'block' ? p.record : p.content);
  }
}

/** Remove our blocks and owned files. User-modified files are left alone. */
export function planRemove(root, manifest, entries) {
  const out = [];
  for (const e of entries) {
    const abs = path.join(root, e.path);
    if (!fs.existsSync(abs)) continue;
    const current = fs.readFileSync(abs, 'utf8');
    if (e.mode === 'block') {
      const next = current.replace(blockRegex(e.comment || 'md'), '').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');
      out.push({ rel: e.path, action: next.trim() ? 'strip-block' : 'delete', content: next });
    } else if (e.userOwned) {
      out.push({ rel: e.path, action: 'keep-user' });
    } else if (manifest.files[e.path] === hash(current)) {
      out.push({ rel: e.path, action: 'delete' });
    } else {
      out.push({ rel: e.path, action: 'keep-modified' });
    }
  }
  return out;
}
