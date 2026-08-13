/* O que quebraria calado sem este teste:
 *
 *   node test-comments.mjs
 *
 * 1. .pdgm antigo sem comments deixa de abrir (normalize injeta lixo / explode).
 * 2. Thread vazia fica persistida no bloco (botão “sempre visível” sem mensagem).
 * 3. Contagem do índice soma H1+H2 (balão do capítulo mente) ou ignora o corpo.
 * 4. Concluir não zera o balão — capítulo parece ter pendência eterno.
 * 5. Apagar a última mensagem deixa comments: { messages: [] } no arquivo.
 */
import assert from 'node:assert/strict';
import {
  emptyThread, normalizeThread, threadOf, hasComments, hasOpenComments, countOpenMessages,
  writeThread, stripComments, addMessage, editMessage, deleteMessage,
  toggleResolved, countCommentsByHeading, countCommentsOnItems,
  firstCommentedBlockId, normalizeDocComments,
} from './comments.js';

// ── normalize: ausente / lixo → thread vazia ────────────────────────────────
assert.deepEqual(normalizeThread(undefined), emptyThread());
assert.deepEqual(normalizeThread(null), emptyThread());
assert.deepEqual(normalizeThread('nope'), emptyThread());
assert.deepEqual(normalizeThread({ resolved: 1, messages: 'x' }), emptyThread());
assert.equal(hasComments({}), false);
assert.equal(countOpenMessages({}), 0);

// array legado = lista de mensagens
const fromArr = normalizeThread([{ id: 'c1', text: ' oi ', createdAt: 10 }]);
assert.equal(fromArr.messages.length, 1);
assert.equal(fromArr.messages[0].text, 'oi');
assert.equal(fromArr.resolved, false);

// mensagem vazia some; id ausente ganha fallback estável
const dirty = normalizeThread({
  resolved: true,
  messages: [
    { id: 'c1', text: '  ' },
    { text: 'ok', createdAt: 3 },
    null,
    42,
  ],
});
assert.equal(dirty.messages.length, 1);
assert.equal(dirty.messages[0].text, 'ok');
assert.equal(dirty.messages[0].id, 'c-legacy-1');
assert.equal(dirty.resolved, true);

// ── write / strip: vazio apaga o campo (aditivo) ────────────────────────────
const host = { id: 'b1', type: 'p', html: 'x' };
writeThread(host, { messages: [{ id: 'c1', text: 'nota' }] });
assert.equal(host.comments.messages[0].text, 'nota');
assert.equal(hasComments(host), true);
writeThread(host, emptyThread());
assert.equal(host.comments, undefined, 'thread vazia não persiste no bloco');
writeThread(host, { messages: [{ id: 'c1', text: 'volta' }] });
stripComments(host);
assert.equal(host.comments, undefined);

// ── add / edit / delete / resolver ──────────────────────────────────────────
let t = emptyThread();
t = addMessage(t, '  primeira  ', { id: 'c1', now: 100 });
assert.equal(t.messages.length, 1);
assert.equal(t.messages[0].text, 'primeira');
assert.equal(t.messages[0].createdAt, 100);

t = addMessage(t, '', { id: 'c-empty' });
assert.equal(t.messages.length, 1, 'texto vazio não cria mensagem');

t = addMessage(t, 'resposta', { id: 'c2', now: 200 });
assert.equal(t.messages.length, 2, 'responder = mensagem na mesma thread');

t = editMessage(t, 'c1', '  editada  ', { now: 300 });
assert.equal(t.messages[0].text, 'editada');
assert.equal(t.messages[0].updatedAt, 300);
assert.equal(t.messages[0].createdAt, 100, 'createdAt não muda no edit');

t = editMessage(t, 'c1', '   ');
assert.equal(t.messages[0].text, 'editada', 'edit vazio é no-op');

t = toggleResolved(t);
assert.equal(t.resolved, true);
assert.equal(countOpenMessages({ comments: t }), 0, 'concluída some do balão');
assert.equal(hasComments({ comments: t }), true, 'ainda tem mensagem associada');
assert.equal(hasOpenComments({ comments: t }), false, 'concluída não é pin “cheio”');
t = toggleResolved(t);
assert.equal(t.resolved, false);
assert.equal(countOpenMessages({ comments: t }), 2);

t = deleteMessage(t, 'c2');
assert.equal(t.messages.length, 1);
t = deleteMessage(t, 'c1');
assert.equal(t.messages.length, 0);
assert.equal(t.resolved, false, 'última mensagem some → resolved reseta');

// ── índice: contagem exclusiva por seção ────────────────────────────────────
const blocks = [
  { id: 'pre', type: 'p', comments: { messages: [{ id: 'x', text: 'antes' }] } },
  { id: 'h1a', type: 'h1', comments: { messages: [{ id: 'a', text: 'no h1' }] } },
  { id: 'p1', type: 'p', comments: { messages: [{ id: 'b', text: 'corpo' }, { id: 'c', text: '2' }] } },
  { id: 'h2a', type: 'h2' },
  { id: 'p2', type: 'p', comments: { messages: [{ id: 'd', text: 'na h2' }] } },
  { id: 'h1b', type: 'h1' },
  { id: 'p3', type: 'p', comments: { resolved: true, messages: [{ id: 'e', text: 'feito' }] } },
];
const counts = countCommentsByHeading(blocks);
assert.equal(counts.get('h1a'), 3, 'H1 = próprio + corpo até o H2 (não inclui H2)');
assert.equal(counts.get('h2a'), 1, 'H2 = próprio + corpo até o próximo H1');
assert.equal(counts.get('h1b'), 0, 'thread concluída não conta');
assert.equal(counts.has('pre'), false, 'antes do 1º título não entra no índice');

assert.equal(firstCommentedBlockId(blocks, 'h1a'), 'h1a');
assert.equal(firstCommentedBlockId(blocks, 'h2a'), 'p2');
assert.equal(firstCommentedBlockId(blocks, 'h1b'), 'h1b', 'sem aberto → o próprio heading');

assert.equal(countCommentsOnItems([
  { comments: { messages: [{ id: '1', text: 'capa' }] } },
  { comments: { resolved: true, messages: [{ id: '2', text: 'ok' }] } },
]), 1);

// ── open de doc antigo / campo podre ────────────────────────────────────────
const doc = {
  blocks: [
    { id: 'b1', type: 'p', html: 'x' },
    { id: 'b2', type: 'p', comments: { messages: [] } },
    { id: 'b3', type: 'p', comments: 'lixo' },
    { id: 'b4', type: 'p', comments: { messages: [{ id: 'c1', text: 'fica' }] } },
  ],
  cover: { items: [{ id: 'cv', comments: { messages: [] } }] },
};
normalizeDocComments(doc);
assert.equal(doc.blocks[0].comments, undefined);
assert.equal(doc.blocks[1].comments, undefined, '[] some no open');
assert.equal(doc.blocks[2].comments, undefined, 'lixo some no open');
assert.equal(doc.blocks[3].comments.messages[0].text, 'fica');
assert.equal(doc.cover.items[0].comments, undefined);

const untouched = { blocks: [{ id: 'z', type: 'p' }] };
normalizeDocComments(untouched);
assert.deepEqual(untouched.blocks[0], { id: 'z', type: 'p' }, 'doc sem campo comments permanece idêntico');

console.log('test-comments: ok');
