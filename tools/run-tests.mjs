#!/usr/bin/env node
/* Roda a suite de self-checks do repo (sem framework).
 *
 *   node tools/run-tests.mjs
 *
 * Descobre na raiz: test-*.mjs e *.test.mjs. Sai com código ≠ 0 no primeiro
 * (ou no total de) falha(s). Usado localmente e no CI (.github/workflows/test.yml).
 */
import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, basename } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function isTestFile(name) {
  if (!name.endsWith('.mjs')) return false;
  if (name.startsWith('test-')) return true;
  if (name.endsWith('.test.mjs')) return true;
  return false;
}

function runOne(file) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [file], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { err += c; });
    child.on('error', (e) => {
      resolve({ file, code: 1, ms: Date.now() - t0, out, err: String(e) });
    });
    child.on('close', (code) => {
      resolve({ file, code: code ?? 1, ms: Date.now() - t0, out, err });
    });
  });
}

const names = (await readdir(ROOT)).filter(isTestFile).sort();
if (!names.length) {
  console.error('run-tests: nenhum test-*.mjs / *.test.mjs na raiz');
  process.exit(1);
}

console.log(`run-tests: ${names.length} arquivo(s)\n`);

let failed = 0;
const rows = [];

for (const name of names) {
  process.stdout.write(`  · ${name} … `);
  const r = await runOne(join(ROOT, name));
  const ok = r.code === 0;
  if (!ok) failed++;
  const sec = (r.ms / 1000).toFixed(1);
  console.log(ok ? `ok (${sec}s)` : `FALHOU (${sec}s, exit ${r.code})`);
  if (!ok) {
    const tail = [r.out, r.err].filter(Boolean).join('\n').trim();
    if (tail) {
      for (const line of tail.split('\n').slice(-40)) {
        console.log(`      ${line}`);
      }
    }
  }
  rows.push({ name: basename(name), ok, ms: r.ms });
}

console.log('');
const totalMs = rows.reduce((s, r) => s + r.ms, 0);
if (failed) {
  console.error(`run-tests: ${failed}/${rows.length} falharam (${(totalMs / 1000).toFixed(1)}s)`);
  process.exit(1);
}
console.log(`run-tests: ${rows.length}/${rows.length} ok (${(totalMs / 1000).toFixed(1)}s)`);
