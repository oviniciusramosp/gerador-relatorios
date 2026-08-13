/* O que quebraria calado sem este teste:
 * - refresh do Diagramador abre na capa/página 1 em vez da página que o user via
 * - chave LS antiga/lixo (kind desconhecido, page negativa) derruba o restore
 * - miolo:7 num doc que agora só tem 3 páginas não cai na última
 * - capa/índice desligados não degradam pra primeira página disponível
 */
import assert from 'node:assert/strict';
import {
  normalizeViewPage, viewPageFromDataset, viewPagesEqual,
  resolveViewPage, pickViewPage,
} from './view-page.js';

assert.equal(normalizeViewPage(null), null);
assert.equal(normalizeViewPage('miolo'), null);
assert.equal(normalizeViewPage({}), null);
assert.equal(normalizeViewPage({ kind: 'nope' }), null);
assert.deepEqual(normalizeViewPage({ kind: 'cover' }), { kind: 'cover' });
assert.deepEqual(normalizeViewPage({ kind: 'index', page: 99 }), { kind: 'index' });
assert.deepEqual(normalizeViewPage({ kind: 'back' }), { kind: 'back' });
assert.deepEqual(normalizeViewPage({ kind: 'miolo', page: 4 }), { kind: 'miolo', page: 4 });
assert.deepEqual(normalizeViewPage({ kind: 'miolo', page: 4.8 }), { kind: 'miolo', page: 4 });
assert.deepEqual(normalizeViewPage({ kind: 'miolo', page: -2 }), { kind: 'miolo', page: 0 });
assert.deepEqual(normalizeViewPage({ kind: 'miolo' }), { kind: 'miolo', page: 0 });

assert.deepEqual(viewPageFromDataset({ cover: 'cover' }), { kind: 'cover' });
assert.deepEqual(viewPageFromDataset({ cover: 'back' }), { kind: 'back' });
assert.deepEqual(viewPageFromDataset({ special: 'index' }), { kind: 'index' });
assert.deepEqual(viewPageFromDataset({ page: '2' }), { kind: 'miolo', page: 2 });
assert.equal(viewPageFromDataset({ page: '' }), null);
assert.equal(viewPageFromDataset({ cover: 'other' }), null);
assert.equal(viewPageFromDataset(null), null);

assert.equal(viewPagesEqual({ kind: 'cover' }, { kind: 'cover' }), true);
assert.equal(viewPagesEqual({ kind: 'cover' }, { kind: 'back' }), false);
assert.equal(viewPagesEqual({ kind: 'miolo', page: 1 }, { kind: 'miolo', page: 1 }), true);
assert.equal(viewPagesEqual({ kind: 'miolo', page: 1 }, { kind: 'miolo', page: 2 }), false);

const pages = [
  { kind: 'cover' },
  { kind: 'index' },
  { kind: 'miolo', page: 0 },
  { kind: 'miolo', page: 1 },
  { kind: 'miolo', page: 2 },
  { kind: 'back' },
];
assert.deepEqual(resolveViewPage({ kind: 'index' }, pages), { kind: 'index' });
assert.deepEqual(resolveViewPage({ kind: 'miolo', page: 1 }, pages), { kind: 'miolo', page: 1 });
assert.deepEqual(resolveViewPage({ kind: 'miolo', page: 9 }, pages), { kind: 'miolo', page: 2 });
assert.deepEqual(resolveViewPage({ kind: 'cover' }, pages.filter((p) => p.kind !== 'cover')), { kind: 'index' });
assert.deepEqual(resolveViewPage(null, pages), { kind: 'cover' });
assert.equal(resolveViewPage({ kind: 'miolo', page: 1 }, []), null);

const onlyCover = [{ kind: 'cover' }];
assert.deepEqual(resolveViewPage({ kind: 'miolo', page: 3 }, onlyCover), { kind: 'cover' });

const laid = [
  { view: { kind: 'cover' }, top: 0 },
  { view: { kind: 'index' }, top: 900 },
  { view: { kind: 'miolo', page: 0 }, top: 1800 },
  { view: { kind: 'miolo', page: 1 }, top: 2700 },
];
assert.deepEqual(pickViewPage(laid, 40), { kind: 'cover' });
assert.deepEqual(pickViewPage(laid, 900), { kind: 'index' });
assert.deepEqual(pickViewPage(laid, 1850), { kind: 'miolo', page: 0 });
assert.deepEqual(pickViewPage(laid, 4000), { kind: 'miolo', page: 1 });
assert.equal(pickViewPage([], 10), null);

console.log('test-view-page: ok');
