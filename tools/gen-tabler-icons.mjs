/* Gera tabler-icons-names.js com TODOS os Tabler Icons oficiais.
 *
 *   node tools/gen-tabler-icons.mjs
 *
 * Fonte: icons.json do pacote @tabler/icons (jsDelivr). Requer rede.
 * Offline: passe o path do JSON:
 *   node tools/gen-tabler-icons.mjs /caminho/icons.json
 */
import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tabler-icons-names.js');
const URL = 'https://cdn.jsdelivr.net/npm/@tabler/icons@3.46.0/icons.json';

const srcArg = process.argv[2];
let text;
if (srcArg) {
  text = await readFile(srcArg, 'utf8');
} else {
  const res = await fetch(URL);
  if (!res.ok) {
    console.error('fetch falhou:', res.status, URL);
    process.exit(1);
  }
  text = await res.text();
}

const data = JSON.parse(text);
const names = Object.keys(data).filter((n) => /^[a-z0-9-]+$/.test(n)).sort();
const filled = names.filter((n) => data[n]?.styles?.filled);

const body = names.map((n) => `  ${JSON.stringify(n)}`).join(',\n');
const filledBody = filled.map((n) => `  ${JSON.stringify(n)}`).join(',\n');

const out = `/* Tabler Icons — lista COMPLETA de nomes (kebab-case).
 * GERADO por tools/gen-tabler-icons.mjs a partir de @tabler/icons/icons.json
 * ${names.length} ícones (${filled.length} com variante filled). Não edite à mão.
 *
 *   node tools/gen-tabler-icons.mjs
 * Uso: <i class="ti ti-{name}"></i>  |  filled: <i class="ti ti-{name}-filled"></i>
 */
export const TABLER_ICONS = [
${body}
];

/** Nomes que têm variante filled no set. */
export const TABLER_ICONS_FILLED = new Set([
${filledBody}
]);
`;

await writeFile(OUT, out);
console.log('ok:', OUT, `(${names.length} ícones, ${filled.length} filled)`);
