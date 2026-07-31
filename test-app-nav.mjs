/* O que quebraria calado sem este teste:
 * - detectAppNavId mapear URL errada (Stories abre como Diagramador, etc.)
 * - lista de ferramentas sem um href usado no index
 */
import assert from 'node:assert/strict';
import { APP_NAV_ITEMS, detectAppNavId, resolveAppNavHref } from './app-nav.js';

assert.ok(APP_NAV_ITEMS.length >= 4);
const ids = new Set(APP_NAV_ITEMS.map((i) => i.id));
for (const need of ['index', 'graficos', 'diagramacao', 'timelines', 'stories', 'ui-catalog']) {
  assert.ok(ids.has(need), `falta item ${need}`);
}
for (const it of APP_NAV_ITEMS) {
  assert.ok(it.href && it.label, it.id);
  assert.ok(it.href.endsWith('.html'), it.href);
  assert.ok(it.icon && it.icon.includes('<svg'), `ícone de ${it.id}`);
  assert.equal(it.desc, undefined, `desc removida de ${it.id}`);
}

assert.equal(detectAppNavId('/foo/diagramacao.html'), 'diagramacao');
assert.equal(detectAppNavId('graficos.html'), 'graficos');
assert.equal(detectAppNavId('/repo/stories.html'), 'stories');
assert.equal(detectAppNavId('/repo/timelines.html'), 'timelines');
assert.equal(detectAppNavId('/repo/index.html'), 'index');
assert.equal(detectAppNavId('/repo/'), 'index');
assert.equal(detectAppNavId('/repo/stories'), 'stories');
assert.equal(detectAppNavId('/repo/unknown.html'), 'index');
assert.equal(detectAppNavId('/repo/ui/catalog.html'), 'ui-catalog');
assert.equal(detectAppNavId('catalog.html'), 'ui-catalog');

assert.equal(resolveAppNavHref('stories.html', '/repo/index.html'), 'stories.html');
assert.equal(resolveAppNavHref('stories.html', '/repo/ui/catalog.html'), '../stories.html');
assert.equal(resolveAppNavHref('ui/catalog.html', '/repo/ui/catalog.html'), 'catalog.html');
assert.equal(resolveAppNavHref('ui/catalog.html', '/repo/stories.html'), 'ui/catalog.html');

console.log('test-app-nav: ok');
