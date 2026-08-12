/* Teste puro (node, sem framework, sem DOM) do núcleo da tarefa 10 + paste de célula.
 *   node paste-style.test.mjs
 *
 * Sem este teste: paste na célula traria font-size/cor do Docs calado, e o strip
 * de cor/fonte quebraria sem regressão.
 */
import assert from 'node:assert';
import {
  cssColorToHex, marksFromStyle,
  sanitizeCellPasteHtml, cellPasteFromPlainText, serializeCellPaste, escapePasteHtml,
} from './paste-style.js';

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

// ── paste em célula: plain text ────────────────────────────────────────────
assert.equal(cellPasteFromPlainText('a\nb'), 'a<br>b');
assert.equal(cellPasteFromPlainText('a<b>'), 'a&lt;b&gt;');
assert.equal(escapePasteHtml('"x"'), '&quot;x&quot;');

// mock DOM mínimo (sem jsdom) — span com bold+cor+fontSize → só <b>
function text(t) {
  return { nodeType: 3, nodeValue: t, textContent: t };
}
function el(tag, { style = {}, href, children = [] } = {}) {
  return {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    style,
    childNodes: children,
    getAttribute: (k) => (k === 'href' ? href || null : null),
  };
}

{
  const root = el('body', {
    children: [
      el('span', {
        style: { fontWeight: '700', color: 'rgb(41,232,153)', fontSize: '24px', fontFamily: 'Arial' },
        children: [text('Hi')],
      }),
    ],
  });
  const out = sanitizeCellPasteHtml('', { root });
  assert.equal(out, '<b>Hi</b>', 'mantém bold, descarta cor/fonte/tamanho');
}

{
  const root = el('body', {
    children: [
      el('i', { children: [text('x')] }),
      text(' '),
      el('a', { href: 'https://ex.com', children: [text('link')] }),
    ],
  });
  assert.equal(sanitizeCellPasteHtml('', { root }), '<i>x</i> <a href="https://ex.com">link</a>');
}

{
  // lista → bullets
  const root = el('body', {
    children: [
      el('ul', {
        children: [
          el('li', { children: [text('um')] }),
          el('li', { children: [el('b', { children: [text('dois')] })] }),
        ],
      }),
    ],
  });
  const out = sanitizeCellPasteHtml('', { root });
  assert.ok(out.includes('• um'), out);
  assert.ok(out.includes('• <b>dois</b>'), out);
  assert.ok(!/font-size|font-family|color:/i.test(out), out);
}

{
  // serialize exportado (mesma regra)
  const root = el('body', {
    children: [el('span', { style: { color: '#f00', backgroundColor: '#ff0' }, children: [text('plain')] })],
  });
  assert.equal(serializeCellPaste(root), 'plain');
}

console.log('paste-style: all asserts passed');
