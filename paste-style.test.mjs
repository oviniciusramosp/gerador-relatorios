/* Teste puro (node, sem framework, sem DOM) do núcleo da tarefa 10.
 *   node paste-style.test.mjs
 */
import assert from 'node:assert';
import { cssColorToHex, marksFromStyle } from './paste-style.js';

// ── cssColorToHex ──────────────────────────────────────────────────────────
assert.equal(cssColorToHex('rgb(41,232,153)'), '#29E899');   // Figma verde Paradigma
assert.equal(cssColorToHex('rgb(41, 232, 153)'), '#29E899'); // com espaços
assert.equal(cssColorToHex('#29e899'), '#29E899');
assert.equal(cssColorToHex('#abc'), '#AABBCC');              // shorthand
assert.equal(cssColorToHex('transparent'), null);
assert.equal(cssColorToHex('rgba(0,0,0,0)'), null);          // alpha 0 = sem cor
assert.equal(cssColorToHex(''), null);
assert.equal(cssColorToHex('red'), null);                   // nome: ignora
assert.equal(cssColorToHex(undefined), null);

// ── caso de aceite da spec: <span style="font-weight:700;color:rgb(41,232,153)"> ──
const m = marksFromStyle({ fontWeight: '700', color: 'rgb(41,232,153)' }, 'span');
assert.equal(m.bold, true);
assert.equal(m.color, '#29E899');

// ── regressões: casos que já funcionam não podem quebrar ──
assert.equal(marksFromStyle({ color: 'rgb(0,0,0)' }, 'span').color, null);  // preto Docs descartado
assert.equal(marksFromStyle({ fontWeight: 'normal' }, 'b').bold, false);    // <b style=normal> do Google
assert.equal(marksFromStyle({}, 'b').bold, true);                           // <b> puro é negrito
assert.equal(marksFromStyle({}, 'span').bold, false);
assert.equal(marksFromStyle({ fontStyle: 'italic' }, 'span').italic, true);
assert.equal(marksFromStyle({ textDecorationLine: 'underline' }, 'span').underline, true);
assert.equal(marksFromStyle({ textDecoration: 'line-through' }, 'span').strike, true);
assert.equal(marksFromStyle({ backgroundColor: 'rgb(255,255,255)' }, 'span').bg, null); // branco = sem highlight
assert.equal(marksFromStyle({ backgroundColor: 'rgb(41,232,153)' }, 'span').bg, '#29E899');

console.log('paste-style: all asserts passed');
