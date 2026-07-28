/* Retrocompat do .pdgm.json — o que quebraria calado:
 *
 *   node test-pdgm-compat.mjs
 *
 * 1. Arquivo antigo (sem resumoOn, reviewed, freePdf, ruleTop…) deixa de abrir.
 * 2. Campo novo opcional some no round-trip (serialização seletiva / hardcode).
 * 3. Envelope inválido lança em vez de devolver null (UI sem try/catch).
 *
 * A migração de defaults no open vive em diagramacao.js (normalizeOpenedDoc +
 * Object.assign(seedDoc(), raw)). Aqui recriamos SÓ as regras puras que o
 * contrato do arquivo exige — se o open real divergir, este teste e o load
 * precisam ser atualizados juntos (ver AGENTS.md → contratos).
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { serializeDoc, deserializeDoc, serializeDocZip, loadDocZip } from './doc-format.js';

const FIXTURE = fileURLToPath(new URL('./fixtures/pdgm-v1-minimal.json', import.meta.url));

// Espessura legada pré-slider (diagramacao.js · RULE_W_LEGACY).
const RULE_W_LEGACY = 1;

/** Defaults de topo equivalentes ao seedDoc() (subset relevante ao arquivo). */
function seedLike() {
  return {
    blocks: [{ id: 'seed', type: 'p', html: '' }],
    footText: 'paradigma.education',
    headText: '',
    firstPage: 1,
    source: null,
    ruleTop: 0.5,
    ruleBot: 0.5,
    headAlign: 'left',
    pnumAlign: 'left',
    footAlign: 'right',
    printMirror: false,
    blockStyles: {},
    cover: { on: true, items: [] },
    back: { on: true, items: [] },
    index: {
      on: true,
      resumoOn: true,
      levels: { h1: true, h2: true, h3: false, h4: false },
      color: 'padrao',
      width: 'curto',
      resumoWidth: 'full',
      resumo: '<p>Escreva aqui o resumo do relatório.</p>',
    },
    reviewed: [],
    freePdf: { mode: 'page', message: '…', link: 'https://paradigma.education', cta: 'Tornar-se Pro', locked: null, lockedSections: null },
  };
}

/** Espelha applyDoc + normalizeOpenedDoc nos pontos que o .pdgm antigo toca. */
function openCompat(raw) {
  const doc = Object.assign(seedLike(), raw);
  if (!Array.isArray(doc.reviewed)) doc.reviewed = [];
  if (!doc.blockStyles || typeof doc.blockStyles !== 'object') doc.blockStyles = {};

  // ruleTop/ruleBot ausentes no arquivo → visual legado 1px, não o default do seed (0.5)
  if (!Object.prototype.hasOwnProperty.call(raw, 'ruleTop') || raw.ruleTop == null) {
    doc.ruleTop = RULE_W_LEGACY;
  }
  if (!Object.prototype.hasOwnProperty.call(raw, 'ruleBot') || raw.ruleBot == null) {
    doc.ruleBot = RULE_W_LEGACY;
  }

  doc.headAlign = doc.headAlign || 'left';
  doc.pnumAlign = doc.pnumAlign || 'left';
  doc.footAlign = doc.footAlign || 'right';
  if (!Object.prototype.hasOwnProperty.call(raw, 'printMirror')) doc.printMirror = false;

  if (doc.index) {
    if (doc.index.resumoOn === undefined) doc.index.resumoOn = true;
    if (!doc.index.levels) doc.index.levels = { h1: true, h2: true, h3: false, h4: false };
    doc.index.color ||= 'padrao';
    doc.index.width ||= 'curto';
    doc.index.resumoWidth ||= 'full';
  }
  return doc;
}

// ── fixture no disco ─────────────────────────────────────────────────────────
const envelope = JSON.parse(await readFile(FIXTURE, 'utf8'));
assert.equal(envelope.v, 1, 'fixture: envelope v1');
assert.equal(typeof envelope.doc, 'object');
assert.equal(envelope.doc.index.resumoOn, undefined, 'fixture deve ser shape antigo (sem resumoOn)');
assert.equal(envelope.doc.reviewed, undefined, 'fixture sem reviewed');
assert.equal(envelope.doc.freePdf, undefined, 'fixture sem freePdf');
assert.equal(envelope.doc.ruleTop, undefined, 'fixture sem ruleTop');

// ── deserialize puro ─────────────────────────────────────────────────────────
const raw = deserializeDoc(envelope);
assert.ok(raw, 'fixture válida tem que abrir');
assert.equal(raw.blocks[0].html, 'Relatório legado');
assert.match(raw.index.resumo, /Resumo antigo/);
assert.equal(raw.index.resumoOn, undefined, 'deserialize não injeta defaults (isso é do open na UI)');

assert.equal(deserializeDoc(null), null);
assert.equal(deserializeDoc({}), null);
assert.equal(deserializeDoc({ v: 1, doc: 'nope' }), null);
assert.equal(deserializeDoc({ doc: { blocks: [] } }), null, 'sem v → null');

// ── open com defaults (contrato do load na UI) ───────────────────────────────
// deep-clone: openCompat muta nested (index.*) — não pode sujar o raw do arquivo
const opened = openCompat(JSON.parse(JSON.stringify(raw)));
assert.equal(opened.blocks[0].html, 'Relatório legado', 'conteúdo do miolo não some');
assert.equal(opened.blocks[1].html, 'Aberto em versões novas sem perder conteúdo.');
assert.equal(opened.index.resumoOn, true, 'resumoOn default em doc antigo');
assert.deepEqual(opened.index.levels, { h1: true, h2: true, h3: false, h4: false });
assert.equal(opened.index.color, 'padrao');
assert.equal(opened.index.width, 'curto');
assert.match(opened.index.resumo, /Resumo antigo/, 'texto do resumo legado permanece');
assert.deepEqual(opened.reviewed, []);
assert.equal(opened.ruleTop, RULE_W_LEGACY, 'regra de cabeçalho legada = 1px');
assert.equal(opened.ruleBot, RULE_W_LEGACY);
assert.equal(opened.footText, 'paradigma.education');
assert.equal(opened.back.on, false, 'Object.assign preserva back.on do arquivo');
assert.ok(opened.freePdf && opened.freePdf.mode === 'page', 'freePdf vem do seed quando ausente');
assert.equal(raw.index.resumoOn, undefined, 'raw do arquivo permanece intocado após open');

// ── round-trip JSON preserva o que o usuário salvou ──────────────────────────
const wire = serializeDoc(raw);
assert.equal(wire.v, 1);
const back = deserializeDoc(wire);
assert.deepEqual(back.blocks, raw.blocks);
assert.equal(back.index.resumo, raw.index.resumo);
assert.equal(back.index.resumoOn, undefined, 'round-trip não inventa resumoOn no dump cru');

// campo aditivo (feature futura) não pode ser engolido pela serialização
const withExtra = {
  ...raw,
  blocks: [...raw.blocks, { id: 'bx', type: 'callout', html: 'novo', tone: 'mint', futureFlag: 42 }],
  experimentalLayout: { cols: 2 },
};
const extraBack = deserializeDoc(serializeDoc(withExtra));
assert.equal(extraBack.blocks[2].futureFlag, 42, 'campo desconhecido em block sobrevive');
assert.deepEqual(extraBack.experimentalLayout, { cols: 2 }, 'campo de topo desconhecido sobrevive');

// ── zip mínimo (sem media/, sem charts/) ainda abre ──────────────────────────
const zipBlob = await serializeDocZip(raw);
const zipRes = await loadDocZip(await zipBlob.arrayBuffer(), 'pdgm-v1-minimal.pdgm.zip');
assert.equal(zipRes.ok, true, zipRes.detail || zipRes.title);
assert.equal(zipRes.doc.blocks[0].html, 'Relatório legado');
assert.match(zipRes.doc.index.resumo, /Resumo antigo/);

console.log('test-pdgm-compat: fixture antiga abre, migra defaults e round-trip preserva extras');
