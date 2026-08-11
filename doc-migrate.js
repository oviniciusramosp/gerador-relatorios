/* Migração / defaults ao abrir um .pdgm (json ou zip).
 *
 * Puro de propósito: sem DOM, sem state. Usado por diagramacao.js no load e
 * pelos testes de retrocompat — uma fonte só evita drift entre o open real e
 * o que a suite acha que o open faz.
 *
 * Object.assign(seed, raw) é shallow: doc.index inteiro do arquivo substitui o
 * seed. normalizeOpenedDoc preenche campos NOVOS que o arquivo antigo não tem
 * (resumoOn, levels, ruleTop legado, logo da capa, type title/subtitle…).
 */

export const RULE_W_DEFAULT = 0.5;
export const RULE_W_LEGACY = 1;
export const RULE_W_MIN = 0.25;
export const RULE_W_MAX = 8;
export const RULE_W_STEP = 0.25;

// largura da coluna ESQUERDA do miolo (px). Direita = 499 − 24 − colLeft.
// Slider: COL_L_MIN…COL_L_MAX nas extremidades (160 ↔ 360). Padrão histórico = 258.
export const COL_L_DEFAULT = 258;
export const COL_L_MIN = 160;
export const COL_L_MAX = 360;

export const hasOwn = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);

export function clampColL(n) {
  const v = Math.round(+n);
  if (!Number.isFinite(v)) return COL_L_DEFAULT;
  return Math.min(COL_L_MAX, Math.max(COL_L_MIN, v));
}

const FOOT_ALIGNS = new Set(['left', 'center', 'right']);
export const clampFootAlign = (a) => (FOOT_ALIGNS.has(a) ? a : 'left');

export function clampRuleW(n) {
  const v = +n;
  if (!Number.isFinite(v)) return RULE_W_DEFAULT;
  const stepped = Math.round(v / RULE_W_STEP) * RULE_W_STEP;
  return Math.min(RULE_W_MAX, Math.max(RULE_W_MIN, stepped));
}

/** Logo default da capa/contracapa (seed + migração de cov sem logo). */
export const defaultLogo = () => ({
  on: true, kind: 'nome', pos: 'header', align: 'left', color: '#FFFFFF', size: 1,
});

// tipos válidos de cover-item (qualquer outro / ausente → 'p', depois migração de capa)
const COVER_TYPES = new Set([
  'title', 'subtitle', 'h1', 'h2', 'h3', 'h4', 'p', 'quote',
  'li', 'ol', 'check', 'callout', 'image', 'table', 'divider',
]);

/** type por item: só normaliza valor inválido/ausente. Mutates `it`. */
export function ensureCoverType(it) {
  if (!it) return 'p';
  if (COVER_TYPES.has(it.type)) return it.type;
  it.type = 'p';
  return 'p';
}

// Importação antiga da CAPA (não contracapa): sem type title/subtitle ainda, e só 1 ou 2
// itens "texto genérico" (type ausente ou 'p') → o 1º (menor Y) é Título e o 2º Subtítulo.
// Capa moderna (já tem title/subtitle, ou 3+ parágrafos) não mexe.
export function migrateCoverTitleSubtitle(cov) {
  if (!cov?.items?.length) return;
  for (const it of cov.items) ensureCoverType(it);
  if (cov.items.some((it) => it.type === 'title' || it.type === 'subtitle')) return;
  const plain = cov.items
    .filter((it) => it.type === 'p')
    .slice()
    .sort((a, b) => (a.y || 0) - (b.y || 0) || String(a.id || '').localeCompare(String(b.id || '')));
  if (plain.length !== 1 && plain.length !== 2) return;
  plain[0].type = 'title';
  if (plain[1]) plain[1].type = 'subtitle';
}

// Migração de capa/contracapa (load + abrir .pdgm): Y livre, logo default, type de item, bgFit.
export function migrateSpecialPages(doc) {
  [doc.cover, doc.back].forEach((cov) => {
    if (!cov) return;
    if (!cov.logo) cov.logo = defaultLogo();
    ensureCoverBgFit(cov);
    if (!cov.items) return;
    let yy = 40;
    cov.items.forEach((it) => {
      if (typeof it.y !== 'number') { it.y = yy; yy += 60; }
      ensureCoverType(it);
    });
  });
  // só a CAPA (não a contracapa): par Título/Subtítulo do seed antigo
  migrateCoverTitleSubtitle(doc.cover);
}

/**
 * Preenche defaults de campos NOVOS em docs antigos.
 * @param {object} doc  — já mesclado com seed (Object.assign(seed, raw))
 * @param {object|null} raw — objeto vindo do arquivo ANTES do merge (pra ruleTop legado etc.)
 * @returns {object} doc (mutado)
 */
export function normalizeOpenedDoc(doc, raw = null) {
  if (!Array.isArray(doc.reviewed)) doc.reviewed = [];
  if (!doc.blockStyles || typeof doc.blockStyles !== 'object') doc.blockStyles = {};

  // espessura cabeçalho/rodapé
  if (raw) {
    if (!hasOwn(raw, 'ruleTop') || raw.ruleTop == null) doc.ruleTop = RULE_W_LEGACY;
    else doc.ruleTop = clampRuleW(raw.ruleTop);
    if (!hasOwn(raw, 'ruleBot') || raw.ruleBot == null) doc.ruleBot = RULE_W_LEGACY;
    else doc.ruleBot = clampRuleW(raw.ruleBot);
  } else {
    if (doc.ruleTop != null) doc.ruleTop = clampRuleW(doc.ruleTop);
    if (doc.ruleBot != null) doc.ruleBot = clampRuleW(doc.ruleBot);
  }

  // posição do chrome: ausentes = layout histórico (cabeçalho esq, nº esq, site dir)
  doc.headAlign = clampFootAlign((raw && hasOwn(raw, 'headAlign') ? raw.headAlign : doc.headAlign) || 'left');
  doc.pnumAlign = clampFootAlign((raw && hasOwn(raw, 'pnumAlign') ? raw.pnumAlign : doc.pnumAlign) || 'left');
  doc.footAlign = clampFootAlign((raw && hasOwn(raw, 'footAlign') ? raw.footAlign : doc.footAlign) || 'right');
  if (raw && !hasOwn(raw, 'printMirror')) doc.printMirror = false;
  else doc.printMirror = !!doc.printMirror;

  // cor de fundo global das páginas (PDF). Ausente/vazio → branco (papel).
  // Valor inválido fica pro paint path (parseColor); não engolir hex custom sem validar aqui.
  if (doc.pageBg == null || doc.pageBg === '') doc.pageBg = '#FFFFFF';

  // cores do rodapé (nº da página + texto). Ausente → mint / cinza histórico do CSS.
  if (!doc.pnumColor) doc.pnumColor = PNUM_COLOR_DEFAULT;
  if (!doc.footColor) doc.footColor = FOOT_COLOR_DEFAULT;

  // largura da coluna esquerda do miolo (px). Ausente → padrão 258.
  if (raw && !hasOwn(raw, 'colLeft')) doc.colLeft = COL_L_DEFAULT;
  else doc.colLeft = clampColL(doc.colLeft);

  if (doc.index) {
    if (doc.index.resumoOn === undefined) doc.index.resumoOn = true;
    if (!doc.index.levels) doc.index.levels = { h1: true, h2: true, h3: false, h4: false };
    doc.index.color ||= 'padrao';
    doc.index.width ||= 'curto';
    doc.index.resumoWidth ||= 'full';
    // cores Custom do índice: aditivo — docs antigos sem colors usam o default do esquema Padrão
    ensureIndexColors(doc.index);
  }
  migrateSpecialPages(doc);
  return doc;
}

/** Cores default do rodapé — batem com .page .foot .pnum / .site no CSS. */
export const PNUM_COLOR_DEFAULT = '#3DE8A0';
export const FOOT_COLOR_DEFAULT = '#828080';

/** Cores default do esquema "Padrão" do índice (num mint / texto corpo / nº da página). */
export const INDEX_COLOR_DEFAULTS = {
  num: '#29E899',
  text: '#4E4E4E',
  page: '#828080',
};

/** Preenche index.colors com defaults (mutates). Aceita color scheme 'padrao'|'cinza'|'custom'. */
export function ensureIndexColors(idx) {
  if (!idx) return idx;
  const d = INDEX_COLOR_DEFAULTS;
  const cur = idx.colors && typeof idx.colors === 'object' ? idx.colors : {};
  idx.colors = {
    num: cur.num || d.num,
    text: cur.text || d.text,
    page: cur.page || d.page,
  };
  if (idx.color !== 'padrao' && idx.color !== 'cinza' && idx.color !== 'custom') {
    idx.color = 'padrao';
  }
  return idx;
}

/** bgFit da capa/contracapa: 'fill' (cover) | 'fit' (contain). Ausente → fill. */
export function ensureCoverBgFit(cov) {
  if (!cov) return cov;
  if (cov.bgFit !== 'fit' && cov.bgFit !== 'fill') cov.bgFit = 'fill';
  return cov;
}
