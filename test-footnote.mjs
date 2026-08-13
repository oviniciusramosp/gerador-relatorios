/* O que quebraria calado: nota de rodapé cair no fluxo (roubar CONTENT_H)
 * ou ir pra página errada (a do bloco seguinte, não a do texto que a
 * precede). Sem este teste a faixa morta acima da linha do rodapé volta
 * a ficar vazia e a nota vira parágrafo no miolo.
 */
import assert from 'node:assert/strict';
import {
  FOOTNOTE_RULE_GAP,
  footnoteDeadZone,
  footnoteZoneBottom,
  assignFootnotes,
  noteStyleOf,
  isIndexFootnote,
} from './footnote.js';

// estilo: ausente/lixo = Rodapé; só 'p' vira Parágrafo (campo aditivo)
assert.equal(noteStyleOf(null), 'default');
assert.equal(noteStyleOf({}), 'default');
assert.equal(noteStyleOf({ noteStyle: 'default' }), 'default');
assert.equal(noteStyleOf({ noteStyle: 'rodape' }), 'default');
assert.equal(noteStyleOf({ noteStyle: 'p' }), 'p');

// geometria da spec: conteúdo [88..754], linha do rodapé base 803
assert.equal(footnoteDeadZone(88, 666, 803, 0.5, FOOTNOTE_RULE_GAP), 42.5);
assert.equal(footnoteDeadZone(88, 666, 803, 1, 6), 42);
assert.equal(footnoteDeadZone(88, 666, 803, 8, 6), 35);
assert.ok(footnoteDeadZone(88, 666, 803, 0.5, 6) > 30, 'faixa morta tem que caber 2 linhas de legenda');

// CSS bottom: página 842, linha em 803
assert.equal(footnoteZoneBottom(842, 803, 0.5, 6), 45.5);
assert.equal(footnoteZoneBottom(842, 803, 1, 6), 46);

// nota depois de um parágrafo da pág. 0 → pág. 0
{
  const blocks = [
    { id: 'p', type: 'p' },
    { id: 'n', type: 'footnote' },
  ];
  const pageOf = (b) => (b.id === 'p' ? 0 : null);
  const by = assignFootnotes(blocks, pageOf);
  assert.equal(by[0].length, 1);
  assert.equal(by[0][0].id, 'n');
  assert.equal(by[1], undefined);
}

// nota depois de um bloco que termina na pág. 1 (parágrafo cortado)
{
  const blocks = [
    { id: 'p', type: 'p' },
    { id: 'n', type: 'footnote' },
    { id: 'q', type: 'p' },
  ];
  const pageOf = (b) => (b.id === 'p' ? 1 : b.id === 'q' ? 2 : null);
  const by = assignFootnotes(blocks, pageOf);
  assert.equal(by[1][0].id, 'n');
  assert.equal(by[2], undefined);
}

// pagebreak empurra a nota seguinte pra página nova
{
  const blocks = [
    { id: 'p', type: 'p' },
    { id: 'br', type: 'pagebreak' },
    { id: 'n', type: 'footnote' },
  ];
  const pageOf = (b) => (b.id === 'p' || b.id === 'br' ? 0 : null);
  const by = assignFootnotes(blocks, pageOf);
  assert.equal(by[0], undefined);
  assert.equal(by[1][0].id, 'n');
}

// pagebreak sem página (PDF: a barra não renderiza) ainda avança
{
  const blocks = [
    { id: 'p', type: 'p' },
    { id: 'br', type: 'pagebreak' },
    { id: 'n', type: 'footnote' },
  ];
  const pageOf = (b) => (b.id === 'p' ? 0 : null);
  const by = assignFootnotes(blocks, pageOf);
  assert.equal(by[1][0].id, 'n');
}

// duas notas no mesmo ponto empilham na mesma página
{
  const blocks = [
    { id: 'p', type: 'p' },
    { id: 'n1', type: 'footnote' },
    { id: 'n2', type: 'footnote' },
  ];
  const pageOf = (b) => (b.id === 'p' ? 0 : null);
  const by = assignFootnotes(blocks, pageOf);
  assert.deepEqual(by[0].map((b) => b.id), ['n1', 'n2']);
}

// coluna direita não muda a página corrente
{
  const blocks = [
    { id: 'p', type: 'p' },
    { id: 'img', type: 'image', placement: 'right' },
    { id: 'n', type: 'footnote' },
  ];
  const pageOf = (b) => (b.id === 'p' ? 0 : b.id === 'img' ? 3 : null);
  const by = assignFootnotes(blocks, pageOf);
  assert.equal(by[0][0].id, 'n');
}

// nota sozinha (doc só com nota) cai na pág. 0
{
  const by = assignFootnotes([{ id: 'n', type: 'footnote' }], () => null);
  assert.equal(by[0][0].id, 'n');
}

// pinPage fixa a nota na página do hover, mesmo com o bloco anterior noutra
{
  const blocks = [
    { id: 'p', type: 'p' },
    { id: 'n', type: 'footnote', pinPage: 2 },
  ];
  const by = assignFootnotes(blocks, (b) => (b.id === 'p' ? 0 : null));
  assert.equal(by[0], undefined);
  assert.equal(by[2][0].id, 'n');
}

// nota do Índice não vai pro miolo
{
  assert.equal(isIndexFootnote({ type: 'footnote', scope: 'index' }), true);
  assert.equal(isIndexFootnote({ type: 'footnote' }), false);
  const blocks = [
    { id: 'p', type: 'p' },
    { id: 'idx', type: 'footnote', scope: 'index' },
    { id: 'n', type: 'footnote' },
  ];
  const by = assignFootnotes(blocks, (b) => (b.id === 'p' ? 0 : null));
  assert.deepEqual(by[0].map((b) => b.id), ['n']);
}

console.log('test-footnote: ok');
