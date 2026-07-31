/* O que quebraria calado: registry incompleto → LLM recria componente
 * “ready” sem achar importHint/module; catálogo e UI.md ficam mentirosos. */

import assert from 'node:assert/strict';
import { UI_REGISTRY, uiById, uiReady } from './ui/registry.js';
import { widthSeg, COL_ICON, ALIGN_ICON, POS_ICON } from './ui-segment.js';
import { uiIco, menuIco, registerUiIcons } from './ui-icons.js';
import { HANDLE_GEOM, createBlockHandles } from './ui-handles.js';
import { ensureFmtbarChrome } from './ui-fmtbar.js';
import { bindEditorShell } from './ui-shell.js';

const REQUIRED = ['id', 'title', 'status', 'module', 'css', 'when', 'never', 'importHint', 'apps'];
const STATUSES = new Set(['ready', 'partial', 'planned']);

assert.ok(UI_REGISTRY.length >= 10, 'registry deve listar a base de UI');

const ids = new Set();
for (const c of UI_REGISTRY) {
  for (const k of REQUIRED) {
    assert.ok(k in c, `componente ${c.id || '?'} sem campo ${k}`);
  }
  assert.ok(STATUSES.has(c.status), `${c.id}: status inválido ${c.status}`);
  assert.ok(c.id && !ids.has(c.id), `id duplicado ou vazio: ${c.id}`);
  ids.add(c.id);
  assert.ok(c.when.length > 10, `${c.id}: when muito curto`);
  assert.ok(c.never.length > 10, `${c.id}: never muito curto`);
  assert.ok(c.importHint.length > 5, `${c.id}: importHint vazio`);
  if (c.status === 'ready' && c.module) {
    assert.ok(
      c.importHint.includes(c.module) || c.importHint.includes('import'),
      `${c.id}: importHint deve apontar o módulo ready`,
    );
  }
}

assert.equal(uiById('widthSeg')?.status, 'ready');
assert.equal(uiById('ui-icons')?.status, 'ready');
assert.equal(uiById('float-panel')?.status, 'ready');
assert.ok(uiReady().length >= 8);

// contratos de módulo (sem DOM completo: só exports e strings de ícone)
assert.ok(COL_ICON.left && COL_ICON.full && COL_ICON.right);
assert.ok(ALIGN_ICON.left && ALIGN_ICON.center && ALIGN_ICON.right);
assert.ok(POS_ICON.header && POS_ICON.footer);
assert.equal(typeof widthSeg, 'function');

registerUiIcons();
const menu = uiIco('menu', 18, 'outline');
assert.ok(menu.includes('<svg'), 'uiIco deve devolver svg');
assert.ok(menuIco('trash').includes('<svg'));

assert.equal(typeof widthSeg, 'function');
assert.equal(typeof createBlockHandles, 'function');
assert.equal(typeof ensureFmtbarChrome, 'function');
assert.equal(typeof bindEditorShell, 'function');
assert.equal(HANDLE_GEOM.H_BTN, 16);
assert.equal(HANDLE_GEOM.H_PAD, 10);
assert.equal(HANDLE_GEOM.H_GUTTER, 42);

// componentes ready críticos devem apontar módulos reais (não só CSS)
assert.equal(uiById('widthSeg')?.module, 'ui-segment.js');
assert.equal(uiById('ui-icons')?.module, 'ui-icons.js');
assert.equal(uiById('notion-handles')?.status, 'ready');
assert.equal(uiById('notion-handles')?.module, 'ui-handles.js');
assert.equal(uiById('fmtbar')?.status, 'ready');
assert.equal(uiById('fmtbar')?.module, 'ui-fmtbar.js');
assert.equal(uiById('editor-shell')?.status, 'ready');
assert.equal(uiById('editor-shell')?.module, 'ui-shell.js');

console.log('test-ui-registry: ok');
