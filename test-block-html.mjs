/* O que quebraria calado: parágrafo selecionado pinta uma linha vazia fantasma
 * (Chrome mete <br> no fim do contenteditable) e ao deselecionar o bloco
 * “encolhe”. Sem este teste o strip do placeholder volta a deixar o <br> no
 * html salvo e o anel roxo cobre uma linha que não existe no texto.
 */
import assert from 'node:assert/strict';
import {
  stripTrailingPlaceholderBr,
  isPlaceholderBreak,
} from './block-html.js';

// sem trailing br: não mexe
assert.equal(stripTrailingPlaceholderBr('Olá mundo'), 'Olá mundo');
assert.equal(stripTrailingPlaceholderBr('a<br>b'), 'a<br>b');
assert.equal(stripTrailingPlaceholderBr('a<br>b<br>c'), 'a<br>b<br>c');
assert.equal(stripTrailingPlaceholderBr(''), '');
assert.equal(stripTrailingPlaceholderBr(null), '');
assert.equal(stripTrailingPlaceholderBr(undefined), '');

// um <br> no fim (placeholder do Chrome) some; o do meio fica
assert.equal(stripTrailingPlaceholderBr('Olá mundo<br>'), 'Olá mundo');
assert.equal(stripTrailingPlaceholderBr('Olá mundo<br/>'), 'Olá mundo');
assert.equal(stripTrailingPlaceholderBr('Olá mundo<br />'), 'Olá mundo');
assert.equal(stripTrailingPlaceholderBr('a<br>b<br>'), 'a<br>b');

// Safari / interchange
assert.equal(
  stripTrailingPlaceholderBr('texto<br class="Apple-interchange-newline">'),
  'texto',
);

// Chrome às vezes embrulha o placeholder
assert.equal(stripTrailingPlaceholderBr('texto<div><br></div>'), 'texto');
assert.equal(stripTrailingPlaceholderBr('texto<div><br/></div>'), 'texto');
assert.equal(stripTrailingPlaceholderBr('texto<div class="x"><br></div>'), 'texto');

// Shift+Enter no fim: dois <br> → sobra um (a linha nova intencional)
assert.equal(stripTrailingPlaceholderBr('linha<br><br>'), 'linha<br>');
assert.equal(stripTrailingPlaceholderBr('linha<br><div><br></div>'), 'linha<br>');

// negrito/link no fim, sem br: intacto
assert.equal(stripTrailingPlaceholderBr('a <b>b</b>'), 'a <b>b</b>');
assert.equal(stripTrailingPlaceholderBr('a <b>b</b><br>'), 'a <b>b</b>');

// bloco vazio / só br: o strip tira o br do html; o render vazio usa :empty
assert.equal(stripTrailingPlaceholderBr('<br>'), '');
assert.equal(stripTrailingPlaceholderBr('<div><br></div>'), '');

// isPlaceholderBreak: só DOM real — aqui um stub mínimo
const br = { nodeType: 1, nodeName: 'BR' };
assert.equal(isPlaceholderBreak(br), true);
assert.equal(isPlaceholderBreak({ nodeType: 3, nodeValue: 'x' }), false);
assert.equal(isPlaceholderBreak(null), false);
const wrap = {
  nodeType: 1,
  nodeName: 'DIV',
  childNodes: [br],
  textContent: '',
};
assert.equal(isPlaceholderBreak(wrap), true);
const withText = {
  nodeType: 1,
  nodeName: 'DIV',
  childNodes: [br, { nodeType: 3, nodeValue: 'ainda tem texto' }],
  textContent: 'ainda tem texto',
};
assert.equal(isPlaceholderBreak(withText), false);

console.log('test-block-html: ok');
