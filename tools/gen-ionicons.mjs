/* Gera ionicons-lib.js a partir do pacote ionicons instalado.
 *
 *   node tools/gen-ionicons.mjs /caminho/para/node_modules/ionicons/dist/svg
 *
 * Variantes oficiais (https://ionic.io/ionicons):
 *   - filled  (sem sufixo)  → IONICONS_LIB_SOLID  — callout default
 *   - outline (-outline)    → IONICONS_LIB        — charts/timelines + toggle
 *   - logo-*  (só filled)   → entra nas duas
 *
 * NÃO gera sharp. Paths verbatim do pacote ionicons (MIT).
 *
 * Regras de limpeza (críticas pra render correto):
 *   - outline: tira fill="none"/stroke=currentColor/linecap/linejoin do INNER
 *     (o iconSvg() reaplica no <svg> raiz). PRESERVA fill="currentColor" em
 *     pontos/cheios internos (ex.: bolinha do information-circle).
 *   - solid: NÃO tira fill="none" — em filled isso é furo/recorte; remover
 *     fazia o ícone sair “cheio” errado. Só tira class="ionicon".
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SRC = process.argv[2];
if (!SRC) { console.error('uso: node tools/gen-ionicons.mjs <dir dos svg>'); process.exit(1); }

const all = await readdir(SRC);
const label = (key) => key.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** @param {'outline'|'solid'} kind */
function parseInner(raw, kind) {
  const m = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(raw);
  if (!m) return null;
  let inner = m[1].replace(/\s*class="ionicon"/g, '').trim();
  // normaliza stroke-width="32px" → "32" (unidade irrelevante no viewBox)
  inner = inner.replace(/stroke-width="(\d+(?:\.\d+)?)px"/g, 'stroke-width="$1"');

  if (kind === 'outline') {
    // redundante com o que iconSvg escreve no raiz; NÃO remover fill="currentColor"
    inner = inner
      .replace(/\s+fill="none"/g, '')
      .replace(/\s+stroke="currentColor"/g, '')
      .replace(/\s+stroke-linecap="round"/g, '')
      .replace(/\s+stroke-linejoin="round"/g, '')
      .replace(/\s+stroke-width="32"/g, '');
  }
  // solid: mantém fill="none", fill-rule, etc. intactos
  return inner;
}

function entryLine(key, attrs, inner) {
  return `  '${key}': { label: '${label(key).replace(/'/g, "\\'")}', ${attrs}, inner: ${JSON.stringify(inner)} },`;
}

// ── outline (-outline.svg) + logos (só filled, entram como solid:true) ──────
const outlineOut = [];
for (const f of [
  ...all.filter((f) => f.endsWith('-outline.svg')),
  ...all.filter((f) => /^logo-[^.]+\.svg$/.test(f)),
].sort()) {
  const isLogo = !f.endsWith('-outline.svg');
  const key = f.replace(/-outline\.svg$/, '').replace(/\.svg$/, '');
  const raw = await readFile(join(SRC, f), 'utf8');
  const inner = parseInner(raw, isLogo ? 'solid' : 'outline');
  if (!inner) { console.warn('sem <svg>:', f); continue; }
  const attrs = isLogo ? 'vb: 512, solid: true' : 'vb: 512, sw: 32';
  outlineOut.push(entryLine(key, attrs, inner));
}

// ── solid / filled (sem -outline / -sharp) — a variante default do site ─────
const solidOut = [];
for (const f of all.filter((f) =>
  f.endsWith('.svg') && !f.endsWith('-outline.svg') && !f.endsWith('-sharp.svg')
).sort()) {
  const key = f.replace(/\.svg$/, '');
  const raw = await readFile(join(SRC, f), 'utf8');
  const inner = parseInner(raw, 'solid');
  if (!inner) { console.warn('sem <svg>:', f); continue; }
  solidOut.push(entryLine(key, 'vb: 512, solid: true', inner));
}

const ver = JSON.parse(await readFile(join(SRC, '../../package.json'), 'utf8')).version;
const body = `/* Ionicons ${ver} — filled + outline (MIT). https://ionic.io/ionicons
 * GERADO por tools/gen-ionicons.mjs. Não edite à mão.
 * Formato: { label, vb, sw?, solid?, inner } — igual timeline-icons.js.
 *
 *   IONICONS_LIB       — outline (-outline) + logos
 *   IONICONS_LIB_SOLID — filled (nome sem sufixo, variante default do site)
 */
export const IONICONS_LIB = {
${outlineOut.join('\n')}
};

export const IONICONS_LIB_SOLID = {
${solidOut.join('\n')}
};
`;
await writeFile(new URL('../ionicons-lib.js', import.meta.url), body);
console.log(`ionicons-lib.js: outline ${outlineOut.length} + solid ${solidOut.length}, ${(body.length / 1024).toFixed(0)} KB`);
