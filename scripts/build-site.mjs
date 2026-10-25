#!/usr/bin/env node
// Builds the GitHub Pages site into _site/: the landing page (site/index.html)
// plus one page per docs/*.md, all sharing site/style.css.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '_site');
const REPO = 'https://github.com/julianoczkowski/buildline';
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

// Sidebar order. Every docs/*.md must appear here so nothing ships unlinked.
const NAV = [
  ['Start', [['getting-started', 'Getting started'], ['concepts', 'Concepts'], ['stations', 'Stations']]],
  ['By role', [['for-product-managers', 'Product managers'], ['for-designers', 'Designers'], ['for-developers', 'Developers']]],
  ['Configure', [['models', 'Models per station'], ['autonomy', 'Autonomy & /goal'], ['customising', 'Customising']]],
  ['Reference', [['cli', 'CLI'], ['faq', 'FAQ'], ['research', 'Research notes']]],
];
const pages = NAV.flatMap(([, items]) => items);

const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const marked = new Marked({
  gfm: true,
  renderer: {
    heading({ tokens, depth }) {
      const html = this.parser.parseInline(tokens);
      const id = slug(html);
      return depth === 1 ? `<h1>${html}</h1>\n` : `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${html}</h${depth}>\n`;
    },
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      let url = href;
      if (/^[\w-]+\.md(#.*)?$/.test(url)) url = url.replace(/\.md/, '.html');
      else if (url.startsWith('../')) url = `${REPO}/blob/main/${url.slice(3)}`;
      const external = /^https?:/.test(url) && !url.startsWith(REPO + '/blob');
      return `<a href="${esc(url)}"${title ? ` title="${esc(title)}"` : ''}${external ? ' rel="noopener"' : ''}>${text}</a>`;
    },
  },
});

const icon = `<svg class="mark" viewBox="0 0 180 80" aria-hidden="true"><line x1="10" y1="40" x2="140" y2="40" stroke="currentColor" stroke-opacity=".35" stroke-width="7" stroke-linecap="round"/><circle cx="12" cy="40" r="10" fill="currentColor"/><circle cx="50" cy="40" r="10" fill="currentColor"/><circle cx="88" cy="40" r="10" fill="currentColor"/><path d="M144 12 L174 64 L114 64 Z" fill="var(--accent)" stroke="var(--accent)" stroke-width="6" stroke-linejoin="round"/></svg>`;

const head = (title, description) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="assets/dashboard-light.png">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 12 L92 86 L8 86 Z" fill="#e5a400"/></svg>')}">
<link rel="stylesheet" href="style.css">
</head>`;

const topbar = (active) => `<header class="topbar">
  <a class="brand" href="./">${icon}<span>buildline</span></a>
  <nav>
    <a href="getting-started.html"${active === 'docs' ? ' aria-current="page"' : ''}>Docs</a>
    <a href="cli.html">CLI</a>
    <a href="${REPO}" rel="noopener">GitHub</a>
    <a class="npm" href="https://www.npmjs.com/package/buildline" rel="noopener">v${version}</a>
  </nav>
</header>`;

const footer = `<footer class="footer"><div>${icon}<span>Buildline v${version} · MIT</span></div><div><a href="${REPO}">GitHub</a><a href="https://www.npmjs.com/package/buildline">npm</a><a href="${REPO}/blob/main/CHANGELOG.md">Changelog</a><a href="${REPO}/issues">Issues</a></div></footer>`;

const copyScript = `<script>
if (matchMedia('(max-width: 900px)').matches) document.querySelector('.sidebar')?.removeAttribute('open');
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy]'); if (!b) return;
  try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied'; setTimeout(() => (b.textContent = 'Copy'), 1400); } catch {}
});
</script>`;

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
for (const f of fs.readdirSync(path.join(root, 'docs', 'assets'))) fs.copyFileSync(path.join(root, 'docs', 'assets', f), path.join(out, 'assets', f));
fs.copyFileSync(path.join(root, 'site', 'style.css'), path.join(out, 'style.css'));
fs.writeFileSync(path.join(out, '.nojekyll'), '');

// Landing page.
const landing = fs.readFileSync(path.join(root, 'site', 'index.html'), 'utf8');
fs.writeFileSync(
  path.join(out, 'index.html'),
  head('Buildline: an AI software factory for any project', 'Install a spec-driven pipeline that coding agents follow from idea to merged PR, with quality gates, independent verification and a place for developers, designers and PMs.') +
    `\n<body class="landing">\n${topbar()}\n${landing.replace(/\{\{version\}\}/g, version).replace(/\{\{repo\}\}/g, REPO)}\n${footer}\n${copyScript}\n</body>\n</html>\n`,
);

// Docs pages.
const listed = new Set(pages.map(([p]) => p));
const unlisted = fs.readdirSync(path.join(root, 'docs')).filter((f) => f.endsWith('.md') && !listed.has(f.replace(/\.md$/, '')));
if (unlisted.length) throw new Error(`Add these docs to NAV in scripts/build-site.mjs: ${unlisted.join(', ')}`);

pages.forEach(([page, label], i) => {
  const md = fs.readFileSync(path.join(root, 'docs', `${page}.md`), 'utf8');
  const body = marked.parse(md);
  const title = md.match(/^# (.+)$/m)?.[1] || label;
  const firstPara = md.split('\n').find((l) => l && !l.startsWith('#') && !l.startsWith('>') && !l.startsWith('|')) || '';
  const sidebar = NAV.map(([group, items]) => `<div class="group"><h4>${group}</h4>${items.map(([p, l]) => `<a href="${p}.html"${p === page ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</div>`).join('');
  const prev = pages[i - 1], next = pages[i + 1];
  const pager = `<nav class="pager">${prev ? `<a href="${prev[0]}.html"><small>Previous</small>${prev[1]}</a>` : '<span></span>'}${next ? `<a class="next" href="${next[0]}.html"><small>Next</small>${next[1]}</a>` : ''}</nav>`;
  const html =
    head(`${title.replace(/[*`]/g, '')} · Buildline docs`, firstPara.replace(/[*`[\]]/g, '').replace(/\(.*?\)/g, '').slice(0, 160)) +
    `\n<body class="docs">\n${topbar('docs')}\n<div class="docs-layout">\n<details class="sidebar" open><summary>Docs menu</summary>${sidebar}</details>\n<main class="prose">\n${body}\n<p class="edit"><a href="${REPO}/edit/main/docs/${page}.md">Edit this page on GitHub</a></p>\n${pager}\n</main>\n</div>\n${footer}\n${copyScript}\n</body>\n</html>\n`;
  fs.writeFileSync(path.join(out, `${page}.html`), html);
});

console.log(`Built ${pages.length + 1} pages into ${path.relative(process.cwd(), out) || out}`);
