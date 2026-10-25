#!/usr/bin/env node
// npm run release -- patch|minor|major|<x.y.z>
// Bumps package.json, turns "## Unreleased" in CHANGELOG.md into the new version,
// commits, tags and pushes. The tag triggers .github/workflows/release.yml.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: opts.inherit ? 'inherit' : 'pipe', shell: process.platform === 'win32' });
const die = (msg) => {
  console.error(`✘ ${msg}`);
  process.exit(1);
};

const bump = process.argv[2];
if (!bump) die('Usage: npm run release -- patch|minor|major|<x.y.z>');
if (sh('git', ['status', '--porcelain']).trim()) die('Working tree is not clean. Commit or stash first.');
if (sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']).trim() !== 'main') die('Release from main.');

const changelogPath = path.join(root, 'CHANGELOG.md');
const changelog = fs.readFileSync(changelogPath, 'utf8');
if (!/^## Unreleased\s*$/m.test(changelog)) die('Add a "## Unreleased" section to CHANGELOG.md describing this release.');

sh('npm', ['test'], { inherit: true });
const version = sh('npm', ['version', bump, '--no-git-tag-version']).trim().replace(/^v/, '');
const date = new Date().toISOString().slice(0, 10);
fs.writeFileSync(changelogPath, changelog.replace(/^## Unreleased\s*$/m, `## ${version} · ${date}`));

sh('git', ['add', 'package.json', 'package-lock.json', 'CHANGELOG.md']);
sh('git', ['commit', '-m', `Release ${version}`]);
sh('git', ['tag', '-a', `v${version}`, '-m', `Buildline ${version}`]);
sh('git', ['push', 'origin', 'main', `v${version}`], { inherit: true });
console.log(`✔ v${version} pushed. GitHub Actions publishes it to npm: https://github.com/julianoczkowski/buildline/actions`);
