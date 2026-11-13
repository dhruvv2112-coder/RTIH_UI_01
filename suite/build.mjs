#!/usr/bin/env node
// Assembles the ready-to-run Pushkaralu-Suite folder from the three app repos.
//
//   node suite/build.mjs [--field <path to RTIH_UI_02>] [--pilgrim <path to RTIH_UI_03>] [--out <dir>]
//
// By default the sibling folders RTIH_UI_02 and RTIH_UI_03 next to this repo are used.
// The pilgrim app is built with its own `node scripts/build.mjs` if dist/ is missing.
import { cpSync, rmSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
const sibling = (...names) => names.map((n) => resolve(repo, '..', n)).find((p) => existsSync(join(p, 'index.html')));

const fieldDir = resolve(arg('field') || sibling('RTIH_UI_02', 'rtih_ui_02') || '');
const pilgrimDir = resolve(arg('pilgrim') || sibling('RTIH_UI_03', 'rtih_ui_03') || '');
const out = resolve(arg('out') || join(repo, 'dist', 'Pushkaralu-Suite'));

for (const [name, dir] of [['field (RTIH_UI_02)', fieldDir], ['pilgrim (RTIH_UI_03)', pilgrimDir]]) {
  if (!existsSync(join(dir, 'index.html'))) { console.error(`Cannot find the ${name} repo. Pass --${name.split(' ')[0]} <path>.`); process.exit(1); }
}

if (process.argv.includes('--rebuild') || !existsSync(join(pilgrimDir, 'dist', 'index.html'))) {
  console.log('Building pilgrim app…');
  execSync('node scripts/build.mjs', { cwd: pilgrimDir, stdio: 'inherit' });
}

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'apps'), { recursive: true });
const copy = (from, to, filter) => cpSync(from, to, { recursive: true, filter: filter || (() => true) });

// suite server + home page
for (const f of ['server.mjs', 'start.bat', 'start.sh']) copy(join(here, f), join(out, f));
copy(join(here, 'home'), join(out, 'home'));
copy(join(here, 'README.txt'), join(out, 'README.txt'));

// dashboard (this repo)
const dash = join(out, 'apps', 'dashboard');
mkdirSync(dash, { recursive: true });
copy(join(repo, 'index.html'), join(dash, 'index.html'));
copy(join(repo, 'src'), join(dash, 'src'));
copy(join(repo, 'public'), join(dash, 'public'));

// field app
const field = join(out, 'apps', 'field');
mkdirSync(field, { recursive: true });
for (const f of ['index.html', 'manifest.webmanifest', 'sw.js', 'assets', 'src']) copy(join(fieldDir, f), join(field, f));

// pilgrim app (built output)
copy(join(pilgrimDir, 'dist'), join(out, 'apps', 'pilgrim'), (src) => !src.endsWith('.map'));

const version = (dir) => { try { return execSync('git rev-parse --short HEAD', { cwd: dir }).toString().trim(); } catch { return 'local'; } };
writeFileSync(join(out, 'VERSION.txt'), [
  `Pushkaralu 2027 Suite — built ${new Date().toISOString()}`,
  `dashboard  RTIH_UI_01 @ ${version(repo)}`,
  `field      RTIH_UI_02 @ ${version(fieldDir)}`,
  `pilgrim    RTIH_UI_03 @ ${version(pilgrimDir)}`,
  '',
].join('\n'));
console.log(`Suite assembled → ${out}`);
