/* Retrocompat do .pdgm.json — o que quebraria calado:
 *
 *   node test-pdgm-compat.mjs
 *
 * 1. Arquivo antigo (sem resumoOn, reviewed, freePdf, ruleTop…) deixa de abrir.
 * 2. Campo novo opcional some no round-trip (serialização seletiva / hardcode).
 * 3. Envelope inválido lança em vez de devolver null (UI sem try/catch).
 * 4. Open real (normalizeOpenedDoc em doc-migrate.js) diverge do que a suite
 *    “acha” que acontece — por isso o teste importa o MESMO módulo da UI.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { serializeDoc, deserializeDoc, serializeDocZip, loadDocZip } from './doc-format.js';
import {
  RULE_W_DEFAULT, RULE_W_LEGACY, COL_L_DEFAULT, COL_L_MIN, COL_L_MAX,
  clampColL, defaultLogo, normalizeOpenedDoc,
  INDEX_COLOR_DEFAULTS, ensureIndexColors, ensureCoverBgFit, ensureMioloRules,
  PNUM_COLOR_DEFAULT, FOOT_COLOR_DEFAULT,
} from './doc-migrate.js';

const FIXTURE = fileURLToPath(new URL('./fixtures/pdgm-v1-minimal.json', import.meta.url));

/** Defaults de topo equivalentes ao seedDoc() (subset relevante ao arquivo). */
function seedLike() {
  return {
    blocks: [{ id: 'seed', type: 'p', html: '' }],
    footText: 'paradigma.education',
    headText: '',
    firstPage: 1,
    source: null,
    ruleTop: RULE_W_DEFAULT,
    ruleBot: RULE_W_DEFAULT,
    headAlign: 'left',
    pnumAlign: 'left',
    footAlign: 'right',
    printMirror: false,
    pageBg: '#FFFFFF',
    colLeft: COL_L_DEFAULT,
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

/** Espelha applyDoc: Object.assign(seed, raw) + normalizeOpenedDoc(doc, raw). */
function openCompat(raw) {
  const doc = Object.assign(seedLike(), raw);
  return normalizeOpenedDoc(doc, raw);
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

// ── open com defaults (MESMO normalizeOpenedDoc da UI) ───────────────────────
// deep-clone: normalize muta nested (index.*, cover.logo…) — não sujar o raw
const opened = openCompat(JSON.parse(JSON.stringify(raw)));
assert.equal(opened.blocks[0].html, 'Relatório legado', 'conteúdo do miolo não some');
assert.equal(opened.blocks[1].html, 'Aberto em versões novas sem perder conteúdo.');
assert.equal(opened.index.resumoOn, true, 'resumoOn default em doc antigo');
assert.deepEqual(opened.index.levels, { h1: true, h2: true, h3: false, h4: false });
assert.equal(opened.index.color, 'padrao');
assert.equal(opened.index.width, 'curto');
assert.deepEqual(opened.index.colors, INDEX_COLOR_DEFAULTS, 'colors default em doc antigo (Custom)');
assert.match(opened.index.resumo, /Resumo antigo/, 'texto do resumo legado permanece');
assert.deepEqual(opened.reviewed, []);
assert.equal(opened.ruleTop, RULE_W_LEGACY, 'regra de cabeçalho legada = 1px');
assert.equal(opened.ruleBot, RULE_W_LEGACY);
assert.equal(opened.footText, 'paradigma.education');
assert.equal(opened.back.on, false, 'Object.assign preserva back.on do arquivo');
assert.ok(opened.freePdf && opened.freePdf.mode === 'page', 'freePdf vem do seed quando ausente');
assert.equal(opened.pageBg, '#FFFFFF', 'pageBg default em doc antigo (papel branco)');
assert.equal(opened.pnumColor, PNUM_COLOR_DEFAULT, 'pnumColor default (mint) em doc antigo');
assert.equal(opened.footColor, FOOT_COLOR_DEFAULT, 'footColor default (cinza) em doc antigo');
assert.equal(opened.colLeft, COL_L_DEFAULT, 'colLeft default em doc antigo (258px)');

// cores custom do rodapé preservadas
const withFootColors = openCompat({
  ...JSON.parse(JSON.stringify(raw)),
  pnumColor: '#FF00AA',
  footColor: '#112233',
});
assert.equal(withFootColors.pnumColor, '#FF00AA');
assert.equal(withFootColors.footColor, '#112233');
assert.equal(raw.index.resumoOn, undefined, 'raw do arquivo permanece intocado após open');
assert.ok(opened.cover.logo, 'capa sem logo ganha defaultLogo na migração');
assert.deepEqual(opened.cover.logo, defaultLogo());
assert.equal(opened.cover.bgFit, 'fill', 'bgFit default Fill em capa antiga');

// pageBg custom preservado no open (campo aditivo)
const withPageBg = openCompat({ ...JSON.parse(JSON.stringify(raw)), pageBg: '#1A1A2E' });
assert.equal(withPageBg.pageBg, '#1A1A2E', 'pageBg custom não some no open');
assert.equal(withPageBg.blocks[0].html, 'Relatório legado');

// colLeft custom + clamp
const withCol = openCompat({ ...JSON.parse(JSON.stringify(raw)), colLeft: 300 });
assert.equal(withCol.colLeft, 300, 'colLeft custom preservado');
assert.equal(clampColL(50), COL_L_MIN, 'clampColL piso');
assert.equal(clampColL(999), COL_L_MAX, 'clampColL teto');
assert.equal(clampColL('x'), COL_L_DEFAULT, 'clampColL inválido → padrão');

// capa antiga: 1–2 itens type "p" (ou sem type) → title/subtitle
const capaAntiga = openCompat({
  blocks: [],
  cover: {
    on: true,
    items: [
      { id: 'c1', html: 'Título velho', y: 100 },
      { id: 'c2', html: 'Subtítulo velho', y: 160 },
    ],
  },
  back: { on: false, items: [] },
  index: { on: false },
});
assert.equal(capaAntiga.cover.items[0].type, 'title');
assert.equal(capaAntiga.cover.items[1].type, 'subtitle');
assert.equal(capaAntiga.cover.bgFit, 'fill', 'capa antiga sem bgFit → fill');
// weight ausente no item: UI trata como 700 (não injeta no open — aditivo opcional)
assert.equal(capaAntiga.cover.items[0].weight, undefined);

// bgFit 'fit' + weight/letterSpacing/lineHeight no title preservados no open
const capaFit = openCompat({
  blocks: [],
  cover: {
    on: true,
    bgFit: 'fit',
    items: [{
      id: 't1', type: 'title', html: 'Bold free', y: 100,
      weight: 900, letterSpacing: 0.02, lineHeight: 1.3,
    }],
  },
  back: { on: false, bgFit: 'fit', items: [] },
  index: { on: true, color: 'custom', colors: { num: '#FF0000', text: '#111111', page: '#999999' } },
});
assert.equal(capaFit.cover.bgFit, 'fit');
assert.equal(capaFit.back.bgFit, 'fit');
assert.equal(capaFit.cover.items[0].weight, 900, 'weight 900 do título da capa sobrevive ao open');
assert.equal(capaFit.cover.items[0].letterSpacing, 0.02, 'letterSpacing do título sobrevive ao open');
assert.equal(capaFit.cover.items[0].lineHeight, 1.3, 'lineHeight do título sobrevive ao open');
assert.equal(capaFit.index.color, 'custom');
assert.deepEqual(capaFit.index.colors, {
  num: '#FF0000', text: '#111111', page: '#999999',
  line: INDEX_COLOR_DEFAULTS.line, // aditivo: docs antigos sem line ganham preto 5%
});

// ensureIndexColors / ensureCoverBgFit / ensureMioloRules: helpers puros
const idxBare = {};
ensureIndexColors(idxBare);
assert.deepEqual(idxBare.colors, INDEX_COLOR_DEFAULTS);
assert.equal(idxBare.color, 'padrao');
const covBare = {};
ensureCoverBgFit(covBare);
assert.equal(covBare.bgFit, 'fill');

// mioloRules ausente → defaults off; flags true sobrevivem ao open
const semRegras = openCompat({ blocks: [], cover: { on: false, items: [] }, back: { on: false, items: [] }, index: { on: false } });
assert.deepEqual(semRegras.mioloRules, { h1NewPage: false, headKeepWithNext: false }, 'mioloRules default off');
const comRegras = openCompat({
  blocks: [],
  cover: { on: false, items: [] },
  back: { on: false, items: [] },
  index: { on: false },
  mioloRules: { h1NewPage: true, headKeepWithNext: true },
});
assert.equal(comRegras.mioloRules.h1NewPage, true);
assert.equal(comRegras.mioloRules.headKeepWithNext, true);
const rBare = {};
ensureMioloRules(rBare);
assert.deepEqual(rBare.mioloRules, { h1NewPage: false, headKeepWithNext: false });
ensureCoverBgFit({ bgFit: 'fit' });
assert.equal(ensureCoverBgFit({ bgFit: 'fit' }).bgFit, 'fit');
assert.equal(ensureCoverBgFit({ bgFit: 'nope' }).bgFit, 'fill', 'bgFit inválido → fill');

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

console.log('test-pdgm-compat: fixture + normalizeOpenedDoc real + round-trip ok');
