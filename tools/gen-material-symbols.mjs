/* Gera material-symbols-names.js com TODOS os Material Symbols oficiais.
 *
 *   node tools/gen-material-symbols.mjs
 *
 * Fonte: codepoints do repo google/material-design-icons (variablefont Outlined).
 * Requer rede (fetch). Offline: passe um arquivo local:
 *   node tools/gen-material-symbols.mjs /caminho/para/*.codepoints
 */
import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'material-symbols-names.js');
const URL =
  'https://raw.githubusercontent.com/google/material-design-icons/master/variablefont/MaterialSymbolsOutlined%5BFILL%2CGRAD%2Copsz%2Cwght%5D.codepoints';

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

const names = text
  .trim()
  .split(/\n/)
  .map((l) => l.trim().split(/\s+/)[0])
  .filter((n) => n && /^[a-z0-9_]+$/.test(n));
const uniq = [...new Set(names)].sort();

const body = uniq.map((n) => `  ${JSON.stringify(n)}`).join(',\n');
const out = `/* Google Material Symbols — lista COMPLETA de nomes (ligatures).
 * GERADO por tools/gen-material-symbols.mjs a partir do codepoints oficial.
 * ${uniq.length} símbolos. Não edite à mão — rode o gen de novo.
 *
 *   node tools/gen-material-symbols.mjs
 */
export const MATERIAL_SYMBOLS = [
${body}
];
`;
await writeFile(OUT, out);
console.log('ok:', OUT, `(${uniq.length} símbolos)`);
