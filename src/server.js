// Local dashboard for the factory. Binds to 127.0.0.1 only; write requests need
// a per-session token embedded in the page, and only factory markdown files can
// be read or edited.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pc from 'picocolors';
import { listFeatures, findFeature, createFeature, approve, setStatus, nextAction } from './features.js';
import { AUTONOMY, VERSION } from './install.js';
import { goalFor } from './cli.js';

const uiFile = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ui', 'index.html');

const READABLE = [/^\.factory\/features\/[^/]+\/(spec|progress)\.md$/, /^\.factory\/context\/[\w-]+\.md$/, /^\.factory\/principles\.md$/, /^\.factory\/stations\/[\w-]+\.md$/, /^\.factory\/README\.md$/];
const WRITABLE = [/^\.factory\/features\/[^/]+\/spec\.md$/, /^\.factory\/context\/[\w-]+\.md$/, /^\.factory\/principles\.md$/];

function safeRel(root, rel, rules) {
  if (typeof rel !== 'string' || rel.includes('..') || rel.includes('\0')) return null;
  const norm = rel.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rules.some((r) => r.test(norm))) return null;
  const abs = path.resolve(root, norm);
  return abs.startsWith(path.resolve(root) + path.sep) ? abs : null;
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
  } catch {}
}

function state(root) {
  const config = JSON.parse(fs.readFileSync(path.join(root, '.factory', 'factory.json'), 'utf8'));
  const features = listFeatures(root).map(({ path: _p, ...f }) => ({
    ...f,
    next: nextAction({ ...f, path: _p }, config.autonomy),
    goal: goalFor(f),
  }));
  const contextDir = path.join(root, '.factory', 'context');
  const context = fs.existsSync(contextDir)
    ? fs.readdirSync(contextDir).filter((f) => f.endsWith('.md')).map((f) => {
        const rel = `.factory/context/${f}`;
        return { name: f.replace('.md', ''), path: rel, todo: fs.readFileSync(path.join(root, rel), 'utf8').includes('TODO') };
      })
    : [];
  context.push({ name: 'principles', path: '.factory/principles.md', todo: false });
  return { version: VERSION, config, autonomyLabel: AUTONOMY[config.autonomy]?.label, features, context };
}

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 2_000_000) reject(new Error('Body too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });

export function serve(root, opts = {}) {
  if (!fs.existsSync(path.join(root, '.factory', 'factory.json'))) {
    throw new Error('No factory here. Run npx factory-cli init first.');
  }
  const token = crypto.randomBytes(16).toString('hex');
  const port = Number(opts.port) || 4545;

  const server = http.createServer(async (req, res) => {
    const send = (code, body, type = 'application/json') => {
      res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(type === 'application/json' ? JSON.stringify(body) : body);
    };
    try {
      // Guard against DNS rebinding: only answer requests addressed to localhost.
      const host = (req.headers.host || '').split(':')[0];
      if (!['localhost', '127.0.0.1'].includes(host)) return send(403, { error: 'Forbidden host' });

      const url = new URL(req.url, `http://${req.headers.host}`);
      if (req.method === 'GET' && url.pathname === '/') {
        const html = fs.readFileSync(uiFile, 'utf8').replace('__FACTORY_TOKEN__', token);
        return send(200, html, 'text/html; charset=utf-8');
      }
      if (!url.pathname.startsWith('/api/')) return send(404, { error: 'Not found' });
      if (req.method !== 'GET' && req.headers['x-factory-token'] !== token) return send(403, { error: 'Bad token' });

      if (req.method === 'GET' && url.pathname === '/api/state') return send(200, state(root));

      if (url.pathname === '/api/file') {
        if (req.method === 'GET') {
          const abs = safeRel(root, url.searchParams.get('path'), READABLE);
          if (!abs || !fs.existsSync(abs)) return send(404, { error: 'Not readable' });
          return send(200, { content: fs.readFileSync(abs, 'utf8') });
        }
        if (req.method === 'PUT') {
          const { path: rel, content } = JSON.parse(await readBody(req));
          const abs = safeRel(root, rel, WRITABLE);
          if (!abs || typeof content !== 'string') return send(400, { error: 'Not writable' });
          fs.writeFileSync(abs, content);
          return send(200, { ok: true });
        }
      }

      if (req.method === 'POST' && url.pathname === '/api/features') {
        const { title, type, owner } = JSON.parse(await readBody(req));
        const f = createFeature(root, { title, type, owner: owner || null });
        return send(200, { id: f.id, dir: f.dir });
      }

      const m = /^\/api\/features\/([^/]+)\/(approve|move)$/.exec(url.pathname);
      if (req.method === 'POST' && m) {
        const f = findFeature(root, decodeURIComponent(m[1]));
        if (!f) return send(404, { error: 'No such feature' });
        const body = JSON.parse(await readBody(req));
        if (m[2] === 'approve') approve(f, body.stage, body.by);
        else setStatus(f, body.status, body.note);
        return send(200, { ok: true });
      }
      send(404, { error: 'Not found' });
    } catch (err) {
      send(400, { error: err.message });
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && !opts.port) {
      opts.port = port + 1;
      return serve(root, opts);
    }
    console.error(`${pc.red('✘')} ${err.message}`);
    process.exitCode = 1;
  });

  server.listen(port, '127.0.0.1', () => {
    const url = `http://localhost:${port}`;
    console.log(`\n  ${pc.yellow('▲ factory dashboard')}  ${pc.cyan(url)}\n  ${pc.dim('Ctrl+C to stop. Only reachable from this machine.')}\n`);
    if (opts.open !== false) openBrowser(url);
  });
  return server;
}
