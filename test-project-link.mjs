import assert from 'node:assert/strict';
import { projectFormatFromName, shouldReloadLinkedProject } from './project-link.js';
import { serializeDocZip, loadDocZip, serializeDoc, deserializeDoc } from './doc-format.js';

assert.equal(projectFormatFromName('relatorio.pdgm.zip'), 'pdgm');
assert.equal(projectFormatFromName('diagramacao.pdgm (9).zip'), 'pdgm');
assert.equal(projectFormatFromName('doc.pdgm.json'), 'pdgm-json');
assert.equal(projectFormatFromName('notas.md'), null);

assert.equal(shouldReloadLinkedProject({
  localDirty: false, writing: false, diskMtime: 200, seenMtime: 100,
}), true);
assert.equal(shouldReloadLinkedProject({
  localDirty: false, writing: false, diskMtime: 100, seenMtime: 100,
}), false);
assert.equal(shouldReloadLinkedProject({
  localDirty: true, writing: false, diskMtime: 200, seenMtime: 100,
}), false, 'edição local pendente não recarrega (evita pisar o caret)');
assert.equal(shouldReloadLinkedProject({
  localDirty: false, writing: true, diskMtime: 200, seenMtime: 100,
}), false, 'gravação em curso não recarrega');
assert.equal(shouldReloadLinkedProject({
  localDirty: false, writing: false, diskMtime: NaN, seenMtime: 100,
}), false);

console.log('test-project-link: pure ok');

// round-trip serializeDocZip ↔ loadDocZip (mesmo caminho do autosave no disco)
const sample = {
  blocks: [
    { id: 'a', type: 'h1', html: 'Live link' },
    { id: 'b', type: 'p', html: 'editado pelo MCP' },
  ],
  footText: 'paradigma.education', headText: '', firstPage: 1,
  cover: { on: true, items: [] },
  back: { on: false, items: [] },
  index: { on: true, resumoOn: false, levels: { h1: true, h2: true }, color: 'padrao', width: 'curto', resumoWidth: 'full' },
  blockStyles: {},
  reviewed: [],
};
const zipBlob = await serializeDocZip(sample);
const zipBuf = await zipBlob.arrayBuffer();
const loaded = await loadDocZip(zipBuf, 't.pdgm.zip');
assert.equal(loaded.ok, true);
assert.equal(loaded.doc.blocks[1].html, 'editado pelo MCP');

const jsonEnv = serializeDoc(sample);
const back = deserializeDoc(jsonEnv);
assert.equal(back.blocks[0].html, 'Live link');
console.log('test-project-link: zip/json round-trip ok');
