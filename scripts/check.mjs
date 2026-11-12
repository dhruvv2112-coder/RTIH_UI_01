// Dependency-free CI check: every ES module parses, every import resolves,
// and every stylesheet/script referenced by index.html exists.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

let failed = 0;
const fail = (m) => { console.error('✗', m); failed++; };

const jsDir = 'src/js';
for (const f of readdirSync(jsDir).filter((x) => x.endsWith('.js'))) {
  const p = join(jsDir, f);
  try { execFileSync(process.execPath, ['--check', p], { stdio: 'pipe' }); } catch (e) { fail(`${p}: ${e.stderr}`); }
  const src = readFileSync(p, 'utf8');
  for (const m of src.matchAll(/(?:from|import\()\s*['"](\.[^'"]+)['"]/g)) {
    const target = resolve(dirname(p), m[1]);
    if (!existsSync(target)) fail(`${p}: missing import ${m[1]}`);
  }
}
const html = readFileSync('index.html', 'utf8');
for (const m of html.matchAll(/(?:href|src)="((?:src|public)\/[^"]+)"/g)) {
  if (!existsSync(m[1])) fail(`index.html references missing ${m[1]}`);
}
if (failed) { console.error(`${failed} problem(s)`); process.exit(1); }
console.log('✓ all modules parse, imports resolve, assets exist');
