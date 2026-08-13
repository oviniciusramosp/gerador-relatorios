/* O que quebraria calado: selecionar o texto de um parágrafo e colar outro
 * gerava um bloco novo e mantinha o original (parecia paste antes do bloco).
 * Sem este teste o merge volta a empurrar o “depois” pra um parágrafo extra.
 */
import assert from 'node:assert/strict';
import { mergePastedBlocks } from './paste-blocks.js';

// selecionou o parágrafo inteiro: splitHtmlAt descarta a seleção, before=after=""
{
  const r = mergePastedBlocks('', '', [{ type: 'p', html: 'novo' }]);
  assert.equal(r.hostHtml, 'novo');
  assert.equal(r.insert.length, 0);
}

// rede de segurança: even if after still had the old text, it must NOT
// become a second block (that was the visible bug)
{
  const r = mergePastedBlocks('', 'texto original', [{ type: 'p', html: 'novo' }]);
  assert.equal(r.insert.length, 0);
}

// caret no meio, um parágrafo só: fica no mesmo bloco
{
  const r = mergePastedBlocks('olá ', ' mundo', [{ type: 'p', html: 'x' }]);
  assert.equal(r.hostHtml, 'olá x mundo');
  assert.equal(r.insert.length, 0);
}

// seleção no meio: antes + colado + depois no mesmo bloco
{
  const r = mergePastedBlocks('aaa ', ' ccc', [{ type: 'p', html: 'BBB' }]);
  assert.equal(r.hostHtml, 'aaa BBB ccc');
  assert.equal(r.insert.length, 0);
}

// vários parágrafos: 1º emenda no antes, último no depois
{
  const r = mergePastedBlocks('pre ', ' pos', [
    { type: 'p', html: 'A' },
    { type: 'p', html: 'B' },
    { type: 'p', html: 'C' },
  ]);
  assert.equal(r.hostHtml, 'pre A');
  assert.equal(r.insert.length, 2);
  assert.equal(r.insert[0].html, 'B');
  assert.equal(r.insert[1].html, 'C pos');
}

// 1º bloco não é parágrafo: o host fica com o antes; o depois vira remnant
{
  const r = mergePastedBlocks('pre ', ' pos', [{ type: 'h1', html: 'Título' }]);
  assert.equal(r.hostHtml, 'pre ');
  assert.equal(r.insert.length, 2);
  assert.equal(r.insert[0].type, 'h1');
  assert.equal(r.insert[0].html, 'Título');
  assert.equal(r.insert[1].remnant, true);
  assert.equal(r.insert[1].html, ' pos');
}

// selecionou tudo e colou um título: host vazio, só o título entra
{
  const r = mergePastedBlocks('', '', [{ type: 'h1', html: 'T' }]);
  assert.equal(r.hostHtml, '');
  assert.equal(r.insert.length, 1);
  assert.equal(r.insert[0].type, 'h1');
}

// clipboard vazio: junta antes+depois
{
  const r = mergePastedBlocks('a', 'b', []);
  assert.equal(r.hostHtml, 'ab');
  assert.equal(r.insert.length, 0);
}

// não muta o array original
{
  const src = [{ type: 'p', html: 'A' }, { type: 'p', html: 'B' }];
  const r = mergePastedBlocks('x', 'y', src);
  assert.equal(src[1].html, 'B');
  assert.equal(r.insert[0].html, 'By');
}

console.log('test-paste-blocks: ok');
