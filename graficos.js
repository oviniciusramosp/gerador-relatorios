/* Editor de gráficos — liga os controles ao renderer puro (chart.js). */
import { renderChart, DEFAULTS, THEMES, SERIES_NAMES, formatValue, symlog, symlogInv } from './chart.js';
import { parseTable, toTable, parseLinks, parseBubbles, num } from './tabela.js';
import { buildTableEl } from './bloco-tabela.js';   // mesma tabela Notion do diagramador
import { openIconPop, paintIconBtn } from './icon-pop.js';   // mesmo picker do criador de timelines
import { registerIcons, iconSvg } from './timeline-icons.js';
import { IONICONS_LIB, IONICONS_LIB_SOLID } from './ionicons-lib.js';  // outline + solid (undo/redo)
registerIcons(IONICONS_LIB);
registerIcons(IONICONS_LIB_SOLID, { style: 'solid' }); // filled — igual diagramador
// ícone de UI Ionicons (viewBox 512) em currentColor — mesmo helper do Diagramador
const uiIco = (key, size = 12, style = 'outline') =>
  iconSvg(key, { x: 0, y: 0, w: size, h: size }, 'currentColor', 1.8, style, true)
    .replace(/ x="0" y="0"/, '');
import { parseChartHtml } from './importar-html.js';
import { buildSpecFromImage } from './converter.js';
import { openSwatchPop } from './swatch.js';   // componente de cor compartilhado
import { logoPickSvg } from './logos.js';      // SVG do logo pro picker (Fase 0.3, trilha B)
import { enhanceAll } from './range-snap.js';  // snap points em todos os range com data-snaps
import { initFeedback } from './feedback.js';
import { initAppNav } from './app-nav.js';

const $ = (id) => document.getElementById(id);
const out = $('out');
let chartMeta = {};   // geometria do último render, pra arrastar pontos/barras
let editMode = false; // modo edição: alças visíveis, escala fixa, add/remove

let spec = structuredClone(DEFAULTS);
Object.assign(spec, {
  title: 'Preço do bitcoin',
  subtitle: 'Fechamento mensal, em dólar',
  source: 'Fonte: Glassnode • jul/2026',
  y: { ...DEFAULTS.y, format: 'compact', prefix: 'US$ ' },
  labels: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul'],
  series: [{ name: 'bitcoin', data: [42000, 51000, 47500, 62000, 58000, 71000, 68500] }],
});

// ── render ───────────────────────────────────────────────────────────────────
function sync({ keepTable = false, keepJson = false } = {}) {
  chartMeta = {};
  out.innerHTML = renderChart(spec, { meta: chartMeta });
  /* Cresce a imagem até caber todos os rótulos (hoje só o sankey pede isso: a
   * coluna cheia empilha nome+valor de cada nó). Espremer texto pra caber numa
   * altura fixa é o pior dos dois mundos — a imagem é que se ajusta ao dado.
   * Só CRESCE, e re-renderiza uma vez; o `>` corta o vaivém. */
  if (chartMeta.minHeight > spec.height || chartMeta.minWidth > spec.width) {
    if (chartMeta.minHeight > spec.height) spec.height = chartMeta.minHeight;
    // bolhas: a faixa de cada uma é o maior entre o diâmetro e o RÓTULO, e
    // texto não encolhe — sem alargar, a última bolha fica metade fora
    if (chartMeta.minWidth > spec.width) spec.width = chartMeta.minWidth;
    chartMeta = {};
    out.innerHTML = renderChart(spec, { meta: chartMeta });
    if ($('height')) $('height').value = spec.height;
    if ($('width')) $('width').value = spec.width;
  }
  drawHandles();
  if (ghostUrl && $('ghostOn').checked) positionGhost();   // realinha a sobreposição
  $('dims').textContent = `${spec.width} × ${spec.height} px  →  PNG ${spec.width * +$('scale').value} × ${spec.height * +$('scale').value}`;
  if (!keepJson) $('json').value = JSON.stringify(spec, null, 2);
  if (!keepTable) {
    $('tsv').value = toTable(spec);
    if (csvMode === 'tabela') rebuildCsvTable();
  }
}

const freePointId = () => 'fp_' + Math.random().toString(36).slice(2, 9);

// desenha uma alça em cima de cada ponto/barra editável (só no modo edição). O
// arraste é capturado pelo #editLayer. Donut não tem marks → sem alças.
function drawHandles() {
  if (!editMode) return;
  const svg = out.querySelector('svg');
  if (!svg) return;
  const NS = 'http://www.w3.org/2000/svg';
  for (const m of chartMeta.marks || []) {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', m.x); c.setAttribute('cy', m.y); c.setAttribute('r', 7);
    c.setAttribute('class', 'edit-handle');
    c.dataset.mark = m.free ? `free:${m.freeId}:${m.s}` : `${m.s}:${m.i}`;
    svg.appendChild(c);
  }
  // rótulo oculto: marca fantasma no lugar dele, só pra achar e clicar de novo
  for (const c of chartMeta.catLabels || []) {
    if (!c.hidden) continue;
    const g = document.createElementNS(NS, 'circle');
    g.setAttribute('cx', c.cx); g.setAttribute('cy', c.cy); g.setAttribute('r', 3);
    g.setAttribute('class', 'edit-handle-ghost');
    svg.appendChild(g);
  }
  for (const nd of chartMeta.sankeyNodes || []) {
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', nd.x - 3); r.setAttribute('y', nd.y);
    r.setAttribute('width', nd.w + 6); r.setAttribute('height', Math.max(nd.h, 6));
    r.setAttribute('rx', 3); r.setAttribute('class', 'edit-handle');
    r.dataset.node = nd.n;
    svg.appendChild(r);
  }
  // fantasma: ponto livre entre 2 dots (não mexe no eixo)
  if (insertGhost) {
    const g = document.createElementNS(NS, 'circle');
    g.setAttribute('cx', insertGhost.x); g.setAttribute('cy', insertGhost.y);
    g.setAttribute('r', 7); g.setAttribute('class', 'edit-insert-ghost');
    svg.appendChild(g);
  }
  // fantasma: rótulo novo entre 2 labels do eixo X
  if (labelInsertGhost) {
    const g = document.createElementNS(NS, 'circle');
    g.setAttribute('cx', labelInsertGhost.x); g.setAttribute('cy', labelInsertGhost.y);
    g.setAttribute('r', 4); g.setAttribute('class', 'edit-insert-ghost');
    svg.appendChild(g);
  }
}

// marcas ordenadas pela posição VISUAL (categoria + freePoints)
function visualMarksOrdered() {
  // prefer série 0 (ou a de menor s) por “slot” visual; freePoints têm freeId
  const byKey = new Map();
  for (const m of chartMeta.marks || []) {
    if (m.kind !== 'point' && m.kind !== 'bar') continue;
    const key = m.free ? `f:${m.freeId}` : `i:${m.i}`;
    const prev = byKey.get(key);
    if (!prev || m.s < prev.s) byKey.set(key, m);
  }
  const along = (m) => (chartMeta.plot?.horiz ? m.y : m.x);
  return [...byKey.values()].sort((a, b) => along(a) - along(b) || (a.i - b.i));
}
// segmento visual entre 2 pontos (para freePoint no meio da linha)
function nearestInsertSegment(vb) {
  if (!vb || !chartMeta.plot) return null;
  if (spec.type === 'donut' || spec.type === 'pie' || spec.type === 'sankey'
    || spec.type === 'bubble' || spec.type === 'candle') return null;
  const ordered = visualMarksOrdered();
  if (ordered.length < 2) return null;
  const horiz = !!chartMeta.plot.horiz;
  const coord = horiz ? vb.y : vb.x;
  let left = ordered[0], right = ordered[1], bd = Infinity;
  for (let i = 0; i < ordered.length - 1; i++) {
    const a = ordered[i], b = ordered[i + 1];
    const ax = horiz ? a.y : a.x, bx = horiz ? b.y : b.x;
    const mid = (ax + bx) / 2;
    const d = Math.abs(coord - mid);
    if (d < bd) { bd = d; left = a; right = b; }
  }
  const mx = (left.x + right.x) / 2;
  const my = (left.y + right.y) / 2;
  const p = chartMeta.plot;
  const origin = horiz ? p.top : p.left;
  const span = horiz ? p.plotH : p.plotW;
  const midAlong = horiz ? my : mx;
  const frac = span ? Math.max(0, Math.min(1, (midAlong - origin) / span)) : 0.5;
  return { left, right, x: mx, y: my, frac };
}
// segmento entre 2 rótulos do eixo X (para inserir categoria no eixo)
function nearestLabelSegment(vb) {
  if (!vb || !chartMeta.plot) return null;
  const labs = (chartMeta.catLabels || [])
    .filter((c) => !c.hidden && c.i != null)
    .slice()
    .sort((a, b) => (a.horiz ? a.cy - b.cy : a.cx - b.cx) || a.i - b.i);
  if (labs.length < 2) return null;
  const horiz = !!chartMeta.plot.horiz;
  const coord = horiz ? vb.y : vb.x;
  let left = labs[0], right = labs[1], bd = Infinity;
  for (let i = 0; i < labs.length - 1; i++) {
    const a = labs[i], b = labs[i + 1];
    const ax = horiz ? a.cy : a.cx, bx = horiz ? b.cy : b.cx;
    const mid = (ax + bx) / 2;
    const d = Math.abs(coord - mid);
    if (d < bd) { bd = d; left = a; right = b; }
  }
  const mx = (left.cx + right.cx) / 2;
  const my = (left.cy + right.cy) / 2;
  return { left, right, x: mx, y: my, insertAt: Math.min(left.i, right.i) + 1 };
}
let insertGhost = null;      // freePoint preview
let labelInsertGhost = null; // new X-label preview

// ── segment de topo: Importar | Customizar ───────────────────────────────────
// ion-icon: download-outline / options-outline (mesmo idioma do Diagramador)
const MAIN_SEG_ICO = { importar: 'download', customizar: 'options' };
const mainSegBtns = [...document.querySelectorAll('#mainSegment button[data-main]')];
mainSegBtns.forEach((b) => {
  const key = MAIN_SEG_ICO[b.dataset.main];
  if (!key) return;
  const label = b.textContent.trim();
  b.innerHTML = `${uiIco(key, 14, 'outline')}<span>${label}</span>`;
});
function setMainSegment(name) {
  mainSegBtns.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.main === name)));
  document.querySelectorAll('.pane.sb-main').forEach((p) => {
    p.hidden = p.dataset.pane !== name;
  });
}
mainSegBtns.forEach((b) => b.addEventListener('click', () => setMainSegment(b.dataset.main)));
setMainSegment('importar');

// ── sub-segment Importar dados: Imagem / Corretora / HTML ────────────────────
const DATA_SEG_ICO = { imagem: 'image', corretora: 'stats-chart', html: 'code-slash' };
const SOURCE_PANES = new Set(['imagem', 'corretora', 'html']);
const dataSegBtns = [...document.querySelectorAll('#dataSegment button')];
dataSegBtns.forEach((b) => {
  const key = DATA_SEG_ICO[b.dataset.seg];
  if (!key) return;
  const label = b.textContent.trim();
  b.innerHTML = `${uiIco(key, 13, 'outline')}<span>${label}</span>`;
});
function setDataSegment(name) {
  dataSegBtns.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.seg === name)));
  // só os panes de fonte — não mexe em .sb-main (Importar/Customizar)
  document.querySelectorAll('.pane[data-pane]').forEach((p) => {
    if (!SOURCE_PANES.has(p.dataset.pane)) return;
    p.hidden = p.dataset.pane !== name;
  });
}
dataSegBtns.forEach((b) => b.addEventListener('click', () => {
  setDataSegment(b.dataset.seg);
  if (b.dataset.seg === 'corretora') loadSymbols($('cdVenue').value);   // carrega só quando a aba abre
}));
setDataSegment('imagem');

// ── controles ────────────────────────────────────────────────────────────────
const bindText = (id, path) => $(id).addEventListener('input', (e) => {
  set(path, e.target.value); sync({ keepTable: true }); scheduleHistory();
});
const set = (path, v) => {
  const ks = path.split('.'); let o = spec;
  while (ks.length > 1) o = o[ks.shift()];
  o[ks[0]] = v;
};

['title', 'subtitle', 'source'].forEach((k) => bindText(k, k));
bindText('ytitle', 'y.title');
bindText('yprefix', 'y.prefix');
bindText('ysuffix', 'y.suffix');

// picker de tipo (botões com ícone)
$('typePicker').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-type]'); if (!b) return;
  const de = spec.type, para = b.dataset.type;
  spec.type = para;
  if (de === 'candle' && para !== 'candle') soFechamento(true);
  if (para === 'candle' && de !== 'candle') soFechamento(false);
  paintTypePicker(); buildSeries();
  sync({ keepTable: true });
  if (csvMode === 'tabela') rebuildCsvTable();
  else $('tsv').value = toTable(spec);
  pushHistory();
});
// candle → linha/área: traça só o Fechamento. Candle usa as 4 primeiras séries
// como O/H/L/C (contrato do renderer), então basta ocultar as 3 primeiras —
// ocultar, não apagar, pra não perder o dado: voltar pra candle reacende todas.
function soFechamento(ligar) {
  if (spec.series.length < 4) return;
  spec.series.forEach((se, i) => {
    if (i >= 3) return;
    if (ligar) se.hidden = true; else delete se.hidden;
  });
}
function paintTypePicker() {
  $('typePicker').querySelectorAll('button').forEach((b) =>
    b.setAttribute('aria-pressed', b.dataset.type === spec.type));
  paintCandle();   // as opções de candle só aparecem nesse tipo
  paintBarOpts();  // idem pra barra/barra horizontal
  paintPieOpts();  // e o "Outros" só em pizza/rosca
  paintSankeyOpts();
  paintBubbleOpts();
  syncSidebarVisibility();
}

// ── visibilidade da sidebar por tipo / nº de séries ──────────────────────────
// Famílias: cartesian (eixos/grade), lineish (traço), bars/pie/candle/bubble/sankey
// (blocos em "Opções do tipo"), values (formato de número), legend (2+ séries).
const CARTESIAN = new Set(['line', 'area', 'bar', 'hbar', 'stacked', 'stacked100', 'candle']);
const LINEISH = new Set(['line', 'area']);
const BARS = new Set(['bar', 'hbar']);
const PIEISH = new Set(['pie', 'donut']);
const SERIES_TITLE = {
  bubble: 'Bolhas', sankey: 'Nós', pie: 'Fatias', donut: 'Fatias',
  candle: 'Séries (O/H/L/C)',
};
const TIPO_OPTS_TITLE = {
  bar: 'Opções de barra', hbar: 'Opções de barra',
  pie: 'Opções de pizza', donut: 'Opções de rosca',
  candle: 'Opções de candle', bubble: 'Opções de bolhas', sankey: 'Opções de sankey',
};

function typeFlags(t) {
  const type = t || 'line';
  return {
    cartesian: CARTESIAN.has(type),
    lineish: LINEISH.has(type),
    bars: BARS.has(type),
    pieish: PIEISH.has(type),
    candle: type === 'candle',
    bubble: type === 'bubble',
    sankey: type === 'sankey',
    // formato de valor: quase todos — bolha/sankey/pizza usam número formatado
    values: CARTESIAN.has(type) || PIEISH.has(type) || type === 'bubble' || type === 'sankey',
    // rótulos diretos nos pontos/barras (não candle: OHLCV não é série de valor único)
    labelMode: CARTESIAN.has(type) && type !== 'candle',
    // escala log: cartesiano + sankey (fluxo com ordens de grandeza)
    yscale: (CARTESIAN.has(type) && type !== 'stacked100') || type === 'sankey',
    hasTypeOpts: BARS.has(type) || PIEISH.has(type)
      || type === 'candle' || type === 'bubble' || type === 'sankey',
  };
}

/** Contagem “visível” pra decidir se legenda faz sentido. */
function legendItemCount() {
  const t = spec.type;
  if (t === 'candle') return 0;
  if (t === 'bubble') {
    return new Set((spec.bubbles || []).map((b) => b.cat).filter(Boolean)).size
      || (spec.bubbles || []).length;
  }
  if (t === 'sankey') return 0; // nós têm cor própria; sem controle de legenda global
  if (PIEISH.has(t)) return (spec.labels || []).length;
  return (spec.series || []).filter((s) => !s.hidden).length;
}

function syncSidebarVisibility() {
  const t = spec.type || 'line';
  const f = typeFlags(t);
  const n = legendItemCount();
  const flags = { ...f, legend: n >= 2 && f.cartesian && !f.candle };

  // seções inteiras
  const secOpts = $('secTipoOpts');
  if (secOpts) secOpts.hidden = !f.hasTypeOpts;
  const secTraco = $('secTraco');
  if (secTraco) secTraco.hidden = !f.lineish;
  const secEixos = $('secEixos');
  if (secEixos) {
    // eixos some se nenhum campo [data-show] ficar visível
    const anyEixo = f.values || f.cartesian || f.yscale || flags.legend || f.labelMode;
    secEixos.hidden = !anyEixo;
  }

  // títulos dinâmicos
  const seriesLabel = $('seriesSecLabel');
  if (seriesLabel) {
    // preserva o chevron .det-chev se o initSidebarDetails já rodou
    const chev = seriesLabel.querySelector('.det-chev');
    const text = SERIES_TITLE[t] || 'Séries';
    seriesLabel.textContent = text;
    if (chev) seriesLabel.prepend(chev);
  }
  const optsLabel = $('tipoOptsLabel');
  if (optsLabel) {
    const chev = optsLabel.querySelector('.det-chev');
    optsLabel.textContent = TIPO_OPTS_TITLE[t] || 'Opções do tipo';
    if (chev) optsLabel.prepend(chev);
  }

  // campos marcados com data-show="flag1 flag2" (OR)
  document.querySelectorAll('[data-show]').forEach((el) => {
    const keys = el.dataset.show.trim().split(/\s+/);
    el.hidden = !keys.some((k) => flags[k]);
  });
}

// switches de mostrar título/subtítulo/fonte no gráfico
[['showTitle', 'title'], ['showSubtitle', 'subtitle'], ['showSource', 'source']].forEach(([id, key]) => {
  $(id).addEventListener('click', () => {
    spec.show[key] = !spec.show[key];
    $(id).setAttribute('aria-checked', spec.show[key]);
    sync({ keepTable: true }); pushHistory();
  });
});
// logo da Paradigma: picker + posição + região/lado + cor + sliders
const wmDefaultOpacity = (pos) => (pos === 'center' ? 0.08 : 1);   // centro faded, canto opaco
function setWm(patch) {
  spec.watermark = { ...DEFAULTS.watermark, ...spec.watermark, ...patch };
  paintWatermark(); sync({ keepTable: true }); scheduleHistory();
}
$('wmPicker').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-logo]'); if (!b) return;
  const wasOff = (spec.watermark?.logo ?? 'none') === 'none';
  const patch = { logo: b.dataset.logo };
  // ao ligar, semeia a opacidade com o padrão da posição atual
  if (wasOff && b.dataset.logo !== 'none') patch.opacity = wmDefaultOpacity(spec.watermark?.pos ?? 'footer');
  setWm(patch);
});
// SVG real do logo no picker (2 colunas × 76px, mesmo do Diagramador). "Nenhum" já
// nasce com o círculo riscado no HTML. currentColor herda do botão (.logopick).
// maxH/maxW maiores que o default: aproveita a célula larga.
['icone', 'full', 'nome'].forEach((kind) => {
  const b = $('wmPicker').querySelector(`button[data-logo="${kind}"]`);
  if (b) b.innerHTML = logoPickSvg(kind, 36, 90);
});
// trocar de posição reseta a opacidade pro padrão da nova (centro faded/canto opaco)
$('wmPos').addEventListener('change', (e) => setWm({ pos: e.target.value, opacity: wmDefaultOpacity(e.target.value) }));
$('wmRegion').addEventListener('change', (e) => setWm({ region: e.target.value }));
$('wmAlign').addEventListener('change', (e) => setWm({ align: e.target.value }));
// { opacity:false }: esse logo já tem slider de opacidade próprio (wmOpacity, abaixo) — o
// swatch não deve mostrar o dele, senão duplica o controle (opt-out coordenado c/ trilha F).
$('wmColor').addEventListener('click', () => openSwatchPop($('wmColor'), (hex) => setWm({ color: hex }), { ...DEFAULTS.watermark, ...spec.watermark }.color, { opacity: false }));
$('wmOpacity').addEventListener('input', (e) => setWm({ opacity: +e.target.value / 100 }));
$('wmScale').addEventListener('input', (e) => setWm({ size: +e.target.value / 100 }));
// ↺ — volta pro padrão da posição (opacidade) e pro size default do logo (1× no slider = 100)
$('wmOpReset').addEventListener('click', () => {
  const pos = { ...DEFAULTS.watermark, ...spec.watermark }.pos;
  setWm({ opacity: wmDefaultOpacity(pos) });
});
$('wmScaleReset').addEventListener('click', () => {
  // 1× (slider 100) — mesmo reset do logo na diagramação; DEFAULTS.size 0.7 é o seed do centro
  setWm({ size: 1 });
});
// — candle: cores de alta/baixa e espessura do pavio —
// up/down guardam null enquanto o usuário não escolhe: aí a cor sai do tema e
// acompanha claro↔escuro. O swatch mostra a cor resolvida (nunca "vazio").
const candleCfg = () => ({ ...DEFAULTS.candle, ...spec.candle });
const candleColor = (k) => candleCfg()[k] || (THEMES[spec.theme] || THEMES.dark).series[k === 'up' ? 1 : 4];
// scheduleHistory (debounce) no pavio/sliders — um passo de undo por gesto, não por tecla
const setCandle = (patch) => { spec.candle = { ...candleCfg(), ...patch }; paintCandle(); sync({ keepTable: true }); scheduleHistory(); };
['up', 'down'].forEach((k) => {
  const el = $('candle' + k[0].toUpperCase() + k.slice(1));
  el.addEventListener('click', () => openSwatchPop(el, (hex) => setCandle({ [k]: hex }), candleColor(k), { opacity: false }));
});
$('candleWick').addEventListener('input', (e) => setCandle({ wick: Math.max(0, +e.target.value || 0) }));
function paintCandle() {
  $('candleOpts').hidden = spec.type !== 'candle';
  $('candleUp').style.background = candleColor('up');
  $('candleDown').style.background = candleColor('down');
  $('candleWick').value = candleCfg().wick;
}

// — barra/barra horizontal: canto arredondado, espaço entre barras, trilha —
// (empilhado fica de fora: segmento arredondado/trilha atrás não fazem sentido
// quando as barras já ficam coladas umas nas outras formando o próprio 100%)
const barTrackCfg = () => ({ ...DEFAULTS.barTrack, ...spec.barTrack });
const setBarTrack = (patch) => { spec.barTrack = { ...barTrackCfg(), ...patch }; sync({ keepTable: true }); scheduleHistory(); };
$('barRadius').addEventListener('input', (e) => {
  spec.barRadius = +e.target.value; $('brVal').textContent = spec.barRadius + ' px'; sync({ keepTable: true }); scheduleHistory();
});
$('barGap').addEventListener('input', (e) => {
  spec.barGap = +e.target.value; $('bgVal').textContent = Math.round(spec.barGap * 100) + '%'; sync({ keepTable: true }); scheduleHistory();
});
$('btShow').addEventListener('change', (e) => setBarTrack({ show: e.target.checked }));
$('btOpacity').addEventListener('input', (e) => {
  $('btOpVal').textContent = e.target.value + '%'; setBarTrack({ opacity: +e.target.value / 100 });
});
$('btScale').addEventListener('input', (e) => {
  $('btScaleVal').textContent = e.target.value + '%'; setBarTrack({ scale: +e.target.value / 100 });
});
// — bolhas: posição do rótulo, piso da bolha e limites do ícone —
const icoCfg = () => ({ ...DEFAULTS.bubbleIcon, ...spec.bubbleIcon });
$('bbLabel').addEventListener('change', (e) => { spec.bubbleLabel = e.target.value; sync({ keepTable: true }); pushHistory(); });
$('bbMinR').addEventListener('input', (e) => {
  spec.bubbleMinR = +e.target.value; $('bbMinRVal').textContent = e.target.value + 'px'; sync({ keepTable: true }); scheduleHistory();
});
$('bbIcoMin').addEventListener('input', (e) => {
  // o piso não pode passar do teto, senão nenhum ícone aparece e parece que quebrou
  const v = Math.min(+e.target.value, icoCfg().max);
  spec.bubbleIcon = { ...icoCfg(), min: v };
  $('bbIcoMinVal').textContent = v + 'px'; sync({ keepTable: true }); scheduleHistory();
});
$('bbIcoMax').addEventListener('input', (e) => {
  const v = Math.max(+e.target.value, icoCfg().min);
  spec.bubbleIcon = { ...icoCfg(), max: v };
  $('bbIcoMaxVal').textContent = v + 'px'; sync({ keepTable: true }); scheduleHistory();
});
function paintBubbleOpts() {
  $('bubbleOpts').hidden = spec.type !== 'bubble';
  $('bbLabel').value = spec.bubbleLabel ?? 'below';
  const r = spec.bubbleMinR ?? DEFAULTS.bubbleMinR;
  $('bbMinR').value = r; $('bbMinRVal').textContent = r + 'px';
  const ic = icoCfg();
  $('bbIcoMin').value = ic.min; $('bbIcoMinVal').textContent = ic.min + 'px';
  $('bbIcoMax').value = ic.max; $('bbIcoMaxVal').textContent = ic.max + 'px';
}

// — sankey: espessura das barras, separada da altura da imagem —
$('skScale').addEventListener('input', (e) => {
  spec.sankeyScale = +e.target.value / 100;
  $('skScaleVal').textContent = e.target.value + '%';
  sync({ keepTable: true }); scheduleHistory();
});
function paintSankeyOpts() {
  $('sankeyOpts').hidden = spec.type !== 'sankey';
  const v = Math.round((spec.sankeyScale ?? 1) * 100);
  $('skScale').value = v; $('skScaleVal').textContent = v + '%';
}

// — pizza/rosca: juntar a cauda longa em "Outros" —
const gsCfg = () => ({ ...DEFAULTS.groupSmall, ...spec.groupSmall });
const setGs = (patch) => { spec.groupSmall = { ...gsCfg(), ...patch }; buildSeries(); sync({ keepTable: true }); scheduleHistory(); };
$('gsOn').addEventListener('change', (e) => setGs({ on: e.target.checked }));
$('gsPct').addEventListener('input', (e) => { $('gsVal').textContent = e.target.value + '%'; setGs({ pct: +e.target.value }); });
$('gsLabel').addEventListener('input', (e) => setGs({ label: e.target.value || 'Outros' }));
function paintPieOpts() {
  $('pieOpts').hidden = !['pie', 'donut'].includes(spec.type);
  const g = gsCfg();
  $('gsOn').checked = g.on;
  $('gsPct').value = g.pct; $('gsVal').textContent = g.pct + '%';
  $('gsLabel').value = g.label === 'Outros' ? '' : g.label;
}

function paintBarOpts() {
  $('barOpts').hidden = !['bar', 'hbar'].includes(spec.type);
  $('barRadius').value = spec.barRadius; $('brVal').textContent = spec.barRadius + ' px';
  $('barGap').value = spec.barGap; $('bgVal').textContent = Math.round(spec.barGap * 100) + '%';
  const bt = barTrackCfg();
  $('btShow').checked = bt.show;
  $('btOpacity').value = Math.round(bt.opacity * 100); $('btOpVal').textContent = Math.round(bt.opacity * 100) + '%';
  $('btScale').value = Math.round(bt.scale * 100); $('btScaleVal').textContent = Math.round(bt.scale * 100) + '%';
}

function paintWatermark() {
  const wm = { ...DEFAULTS.watermark, ...spec.watermark };
  $('wmPicker').querySelectorAll('button').forEach((b) =>
    b.setAttribute('aria-pressed', b.dataset.logo === wm.logo));
  $('wmOpts').hidden = wm.logo === 'none';
  $('wmPos').value = wm.pos;
  $('wmColor').style.background = wm.color;
  $('wmRegion').value = wm.region; $('wmAlign').value = wm.align;
  const center = wm.pos === 'center';                 // região/lado só p/ canto
  $('wmRegionField').hidden = center; $('wmAlignField').hidden = center;
  const op = wm.opacity ?? wmDefaultOpacity(wm.pos);
  $('wmOpacity').value = Math.round(op * 100); $('wmOpVal').textContent = Math.round(op * 100) + '%';
  $('wmScale').value = Math.round((wm.size || 1) * 100);
  $('wmScaleVal').textContent = (+(wm.size || 1).toFixed(2)) + '×';
  // title do ↺ de opacidade muda com a posição (centro = 8%, canto = 100%)
  const defOp = Math.round(wmDefaultOpacity(wm.pos) * 100);
  $('wmOpReset').title = `Redefinir para ${defOp}%`;
}

// ── tema: segment Claro/Escuro com ícones sunny / moon ───────────────────────
const THEME_ICO = { light: 'sunny', dark: 'moon' };
const themeSegBtns = [...document.querySelectorAll('#themeSeg button[data-theme]')];
themeSegBtns.forEach((b) => {
  const key = THEME_ICO[b.dataset.theme];
  if (!key) return;
  const label = b.textContent.trim();
  b.innerHTML = `${uiIco(key, 14, 'outline')}<span>${label}</span>`;
});
function paintTheme() {
  themeSegBtns.forEach((b) =>
    b.setAttribute('aria-selected', String(b.dataset.theme === (spec.theme || 'light'))));
}
function setTheme(next) {
  if (!THEMES[next] || next === spec.theme) { paintTheme(); return; }
  const from = THEMES[spec.theme].series, to = THEMES[next].series;
  // cor segue a entidade: remapeia só quem estava num slot padrão
  spec.series.forEach((s) => { const i = from.indexOf(s.color); if (i >= 0) s.color = to[i]; });
  spec.theme = next;
  paintTheme();
  buildSeries(); paintCandle(); sync({ keepTable: true }); pushHistory();   // swatch mostra a cor do tema novo
}
themeSegBtns.forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.theme)));

[['yformat', 'y.format'], ['yside', 'y.side'], ['yscale', 'y.scale'], ['labelMode', 'labelMode'], ['grid', 'grid'], ['legend', 'legend']]
  .forEach(([id, path]) => $(id).addEventListener('change', (e) => {
    set(path, e.target.value);
    // usd/brl/pct já trazem o símbolo — prefixo/sufixo manual duplicaria ("US$ US$")
    if (id === 'yformat' && ['usd', 'brl', 'pct'].includes(e.target.value)) {
      spec.y.prefix = ''; spec.y.suffix = ''; $('yprefix').value = ''; $('ysuffix').value = '';
    }
    sync({ keepTable: true }); pushHistory();
  }));

[['ymin', 'y.min'], ['ymax', 'y.max']].forEach(([id, path]) =>
  $(id).addEventListener('input', (e) => { set(path, e.target.value === '' ? null : +e.target.value); sync({ keepTable: true }); scheduleHistory(); }));

$('xevery').addEventListener('input', (e) => { spec.x.every = Math.max(1, +e.target.value || 1); sync({ keepTable: true }); scheduleHistory(); });

[['strokeWidth', 'swVal', (v) => v + ' px'], ['dotSize', 'dotVal', (v) => (+v ? v + ' px' : 'off')], ['fontScale', 'fsVal', (v) => v + '×']]
  .forEach(([id, out_, fmt]) => $(id).addEventListener('input', (e) => {
    spec[id] = +e.target.value; $(out_).textContent = fmt(e.target.value); sync({ keepTable: true }); scheduleHistory();
  }));

['smooth', 'transparent'].forEach((id) =>
  $(id).addEventListener('change', (e) => { spec[id] = e.target.checked; sync({ keepTable: true }); pushHistory(); }));

['width', 'height'].forEach((id) =>
  $(id).addEventListener('input', (e) => { spec[id] = +e.target.value || DEFAULTS[id]; sync({ keepTable: true }); scheduleHistory(); }));

$('scale').addEventListener('change', () => sync({ keepTable: true, keepJson: true }));

// ── CSV: Tabela (bloco-tabela) | Código (textarea) ───────────────────────────
let csvMode = 'tabela'; // 'tabela' | 'codigo'
const csvTableBlock = { id: 'csv-data', rows: [['', '']], colWidths: null };
const stripCell = (html) => {
  if (html == null) return '';
  const d = document.createElement('div');
  d.innerHTML = String(html);
  return (d.textContent || '').trim();
};
/** spec → matriz (1ª linha = cabeçalho) pro buildTableEl */
function specToMatrix(sp) {
  if (sp.type === 'sankey') {
    return [
      ['origem', 'destino', 'valor'],
      ...(sp.links || []).map((l) => [l.from ?? '', l.to ?? '', l.value == null ? '' : String(l.value)]),
    ];
  }
  if (sp.type === 'bubble') {
    return [
      ['rótulo', 'valor', 'ícone', 'grupo', 'categoria'],
      ...(sp.bubbles || []).map((b) => [
        b.label ?? '', b.value == null ? '' : String(b.value), b.icon || '', b.group || '', b.cat || '',
      ]),
    ];
  }
  return [
    ['', ...(sp.series || []).map((s) => s.name ?? '')],
    ...(sp.labels || []).map((l, i) => [
      l ?? '',
      ...(sp.series || []).map((s) => (s.data?.[i] == null ? '' : String(s.data[i]))),
    ]),
  ];
}
/** matriz editada → spec (preserva cor/estilo das séries quando possível) */
function applyMatrixToSpec(rawRows) {
  const rows = (rawRows || []).map((r) => r.map(stripCell));
  if (!rows.length) return false;
  const cols = Math.max(...rows.map((r) => r.length), 1);
  const plain = rows.map((r) => {
    const row = r.slice();
    while (row.length < cols) row.push('');
    return row;
  });
  if (spec.type === 'sankey') {
    const body = plain[0][0]?.toLowerCase() === 'origem' ? plain.slice(1) : plain;
    const links = [];
    for (const r of body) {
      const v = num(r[2]);
      if (!r[0] || !r[1] || v == null) continue;
      links.push({ from: r[0], to: r[1], value: v });
    }
    if (!links.length) return false;
    spec.links = links;
    return true;
  }
  if (spec.type === 'bubble') {
    const body = /r[oó]tulo/i.test(plain[0][0] || '') ? plain.slice(1) : plain;
    const bubbles = [];
    for (const r of body) {
      const v = num(r[1]);
      if (!r[0] || v == null) continue;
      bubbles.push({ label: r[0], value: v, icon: r[2] || '', group: r[3] || '', cat: r[4] || '' });
    }
    if (!bubbles.length) return false;
    spec.bubbles = bubbles;
    return true;
  }
  if (plain.length < 2) return false;
  const head = plain[0];
  const body = plain.slice(1);
  const names = head.slice(1);
  if (!names.length) return false;
  spec.labels = body.map((r) => r[0] ?? '');
  spec.series = names.map((name, k) => ({
    ...(spec.series[k] || {}),
    name: name || SERIES_NAMES[k] || `Série ${k + 1}`,
    data: body.map((r) => num(r[k + 1])),
  }));
  return true;
}
function rebuildCsvTable() {
  const host = $('csvTableHost');
  if (!host || csvMode !== 'tabela') return;
  csvTableBlock.rows = specToMatrix(spec);
  // largura fluida no sidebar (componente nasce com 499px de impressão)
  const el = buildTableEl(csvTableBlock, true, {
    commit: () => {
      if (!applyMatrixToSpec(csvTableBlock.rows)) return;
      $('tsv').value = toTable(spec);
      buildSeries();
      sync({ keepTable: true });
      scheduleHistory();
    },
    rerender: () => {
      if (applyMatrixToSpec(csvTableBlock.rows)) {
        $('tsv').value = toTable(spec);
        buildSeries();
        sync({ keepTable: true });
        scheduleHistory();
      }
      rebuildCsvTable();
    },
    removeBlock: () => {},
  });
  el.style.width = '100%';
  host.replaceChildren(el);
}
function setCsvMode(mode) {
  if (mode !== 'tabela' && mode !== 'codigo') return;
  // ao sair da tabela, garante que o textarea está em dia
  if (csvMode === 'tabela' && mode === 'codigo') {
    if (applyMatrixToSpec(csvTableBlock.rows)) {
      $('tsv').value = toTable(spec);
      buildSeries();
      sync({ keepTable: true });
    }
  }
  csvMode = mode;
  const host = $('csvTableHost');
  const ta = $('tsv');
  if (host) host.hidden = mode !== 'tabela';
  if (ta) ta.hidden = mode !== 'codigo';
  document.querySelectorAll('#csvModeSeg button[data-csv-mode]').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.csvMode === mode));
  });
  if (mode === 'tabela') rebuildCsvTable();
  else if (ta) ta.value = toTable(spec);
}
{
  const CSV_SEG_ICO = { tabela: 'grid', codigo: 'code-slash' };
  document.querySelectorAll('#csvModeSeg button[data-csv-mode]').forEach((b) => {
    const key = CSV_SEG_ICO[b.dataset.csvMode];
    if (key) {
      const label = b.textContent.trim();
      b.innerHTML = `${uiIco(key, 13, 'outline')}<span>${label}</span>`;
    }
    b.addEventListener('click', () => setCsvMode(b.dataset.csvMode));
  });
  setCsvMode('tabela');
}

$('tsv').addEventListener('input', (e) => {
  // sankey lê "origem,destino,valor"; bolhas leem "rótulo,valor,ícone,grupo,categoria"
  if (spec.type === 'sankey') {
    spec.links = parseLinks(e.target.value);
    buildSeries(); sync({ keepTable: true }); scheduleHistory();
    return;
  }
  if (spec.type === 'bubble') {
    spec.bubbles = parseBubbles(e.target.value);
    buildSeries(); sync({ keepTable: true }); scheduleHistory();
    return;
  }
  const t = parseTable(e.target.value);
  if (!t) return;
  spec.labels = t.labels;
  spec.series = t.series.map((s, i) => ({ ...spec.series[i], ...s }));
  buildSeries(); sync({ keepTable: true }); scheduleHistory();
});

// Projeto JSON ↔ CSV em sincronia: editar o JSON aplica na hora (como o CSV já faz).
// JSON inválido a meio da digitação é ignorado — só aplica quando parseia.
$('json').addEventListener('input', (e) => {
  let parsed;
  try { parsed = JSON.parse(e.target.value); }
  catch { return; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
  spec = { ...structuredClone(DEFAULTS), ...parsed };
  fillControls(); buildSeries(); sync({ keepJson: true }); scheduleHistory();
});
$('btnCopy').addEventListener('click', async () => {
  await navigator.clipboard.writeText(JSON.stringify(spec, null, 2)); flash('Spec copiada.');
});

// Abrir .json (sidebar): o spec JÁ é o estado inteiro. Salvar JSON / PNG / SVG
// saem do popover "Baixar" no header (mesmo padrão do Diagramador).
$('btnOpen').addEventListener('click', () => $('fileSpec').click());
$('fileSpec').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) openSpecFile(f); e.target.value = ''; });

async function openSpecFile(file) {
  let parsed;
  try { parsed = JSON.parse(await file.text()); }
  catch (err) { return flash('Arquivo inválido: ' + err.message, true); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return flash('Arquivo não é um projeto de gráfico.', true);
  spec = { ...structuredClone(DEFAULTS), ...parsed };
  exitEditIfOn(); fillControls(); buildSeries(); sync(); pushHistory();
  flash('Projeto carregado.');
}

// cores NOMEADAS (marca + tokens de ativos). 🤔 Strategy/HYPE/XRP são estimativas
// (não achei hex de marca confirmado) — trocar aqui se vierem os oficiais.
// lista de séries (cor via swatch, nome, tracejado via switch)
/* Sankey e pizza não têm "séries": o que o usuário quer pintar são os NÓS e as
 * FATIAS. Sem isso a lista ficava vazia (sankey) ou com uma linha só (pizza),
 * e a única forma de trocar cor era editar nodeColors na spec à mão. */
function buildParts() {
  const t = THEMES[spec.theme];
  const box = $('series');
  const nomes = spec.type === 'sankey'
    // ordem de aparição nas ligações = ordem em que o renderer atribui a paleta
    ? [...new Set((spec.links || []).flatMap((l) => [l.from, l.to]).filter(Boolean))]
    : (spec.labels || []);
  const chave = spec.type === 'sankey' ? 'nodeColors' : 'sliceColors';
  nomes.forEach((nome, i) => {
    const cor = (spec[chave] || {})[nome] || t.series[i % t.series.length];
    const row = document.createElement('div');
    row.className = 'serie';
    const sw = document.createElement('button');
    sw.type = 'button'; sw.className = 'swatch'; sw.title = `Cor de ${nome}`;
    sw.style.background = cor;
    sw.onclick = () => openSwatchPop(sw, (hex) => {
      spec[chave] = { ...spec[chave], [nome]: hex };
      buildSeries(); sync({ keepTable: true }); pushHistory();
    }, cor);
    const nm = document.createElement('input');
    nm.type = 'text'; nm.className = 'sname'; nm.value = nome; nm.readOnly = true;
    nm.title = spec.type === 'sankey' ? 'O nome vem das ligações — edite no CSV' : 'O nome vem dos rótulos — edite no CSV';
    row.append(sw, nm);
    box.append(row);
  });
}

/* Bolhas: uma linha por bolha, com o MESMO picker de ícone do criador de
 * timelines (36 da casa + 421 Ionicons + sigla `txt:`). A cor vem da categoria,
 * não da bolha — é o que faz a legenda significar alguma coisa. */
function buildBubbles() {
  const t = THEMES[spec.theme];
  const box = $('series');
  const cats = [...new Set((spec.bubbles || []).map((b) => b.cat).filter(Boolean))];
  (spec.bubbles || []).forEach((b) => {
    const row = document.createElement('div');
    row.className = 'serie';

    const ico = document.createElement('button');
    ico.type = 'button'; ico.className = 'ev-icon'; ico.title = 'Ícone dentro da bolha';
    paintIconBtn(ico, b.icon);
    ico.onclick = () => openIconPop(ico, (key) => {
      if (key) b.icon = key; else delete b.icon;
      paintIconBtn(ico, b.icon); sync({ keepTable: true }); pushHistory();
    }, b.icon);

    const cor = (spec.bubbleCats || {})[b.cat] || t.series[Math.max(0, cats.indexOf(b.cat)) % t.series.length];
    const sw = document.createElement('button');
    sw.type = 'button'; sw.className = 'swatch';
    sw.title = b.cat ? `Cor da categoria "${b.cat}" (vale pra todas as bolhas dela)` : 'Sem categoria — defina uma no CSV pra agrupar a cor';
    sw.style.background = cor;
    sw.onclick = () => openSwatchPop(sw, (hex) => {
      // a cor é da CATEGORIA: mudar aqui repinta todas as bolhas do mesmo tipo,
      // que é o que mantém a legenda verdadeira
      if (b.cat) spec.bubbleCats = { ...spec.bubbleCats, [b.cat]: hex };
      buildSeries(); sync({ keepTable: true }); pushHistory();
    }, cor);

    const nm = document.createElement('input');
    nm.type = 'text'; nm.className = 'sname'; nm.value = b.label ?? '';
    nm.setAttribute('aria-label', 'Rótulo da bolha');
    nm.oninput = () => { b.label = nm.value; sync({ keepTable: true }); };

    row.append(ico, sw, nm);
    box.append(row);
  });
}

function buildSeries() {
  const t = THEMES[spec.theme];
  $('series').innerHTML = '';
  if (spec.type === 'bubble') { buildBubbles(); syncSidebarVisibility(); return; }
  if (spec.type === 'sankey' || spec.type === 'pie' || spec.type === 'donut') {
    buildParts(); syncSidebarVisibility(); return;
  }
  spec.series.forEach((s, i) => {
    const color = s.color || t.series[i % t.series.length];
    const row = document.createElement('div');
    row.className = 'serie';

    const sw = document.createElement('button');
    sw.type = 'button'; sw.className = 'swatch'; sw.title = 'Cor da série';
    sw.style.background = color;
    sw.onclick = () => openSwatchPop(sw, (hex) => { s.color = hex; buildSeries(); sync({ keepTable: true }); pushHistory(); }, color);

    const name = document.createElement('input');
    name.type = 'text'; name.className = 'sname'; name.value = s.name ?? ''; name.setAttribute('aria-label', 'Nome da série');
    name.oninput = () => { s.name = name.value; sync({ keepTable: true }); scheduleHistory(); };

    // o switch é MOSTRAR/ESCONDER a série (o estilo do traço virou o dropdown
    // abaixo). Esconder não apaga: o dado continua na spec e no CSV.
    const vis = document.createElement('button');
    vis.type = 'button'; vis.className = 'lblswitch'; vis.setAttribute('role', 'switch');
    vis.setAttribute('aria-checked', !s.hidden); vis.title = 'Mostrar a série no gráfico';
    vis.onclick = () => {
      if (s.hidden) delete s.hidden; else s.hidden = true;
      vis.setAttribute('aria-checked', !s.hidden);
      row.classList.toggle('off', !!s.hidden);
      sync({ keepTable: true }); pushHistory();
      syncSidebarVisibility(); // legenda some/aparece com 1 vs 2+ séries visíveis
    };
    row.classList.toggle('off', !!s.hidden);

    row.append(sw, name, vis);

    // combo: forma (linha/barra) e eixo (esq/dir) por série — só nos tipos
    // verticais simples, onde o renderer aceita misturar
    if (['line', 'area', 'bar'].includes(spec.type)) {
      const opts = document.createElement('div');
      opts.className = 'serie-opts';
      const mk = (title, pairs, cur, set) => {
        const sel = document.createElement('select');
        sel.className = 'mini'; sel.title = title;
        pairs.forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; sel.append(o); });
        sel.value = cur;
        sel.onchange = () => { set(sel.value); sync({ keepTable: true }); pushHistory(); };
        return sel;
      };
      opts.append(
        mk('Forma da série', [['', 'Forma: auto'], ['line', 'Linha'], ['bar', 'Barra']],
          s.as || '', (v) => { if (v) s.as = v; else delete s.as; }),
        mk('Eixo da série', [['', 'Eixo esq.'], ['y2', 'Eixo dir.']],
          s.axis || '', (v) => { if (v) s.axis = v; else delete s.axis; }),
        // o glifo à esquerda do rótulo é o "ícone" do tipo de traço — dá pra ver
        // a diferença sem ler. `dashed` antigo é lido aqui e reescrito como stroke.
        mk('Estilo do traço', [['solid', '─── Sólida'], ['dashed', '╌╌╌ Tracejada'], ['dotted', '··· Pontilhada']],
          s.stroke || (s.dashed ? 'dashed' : 'solid'),
          (v) => { delete s.dashed; if (v === 'solid') delete s.stroke; else s.stroke = v; }),
      );
      row.append(opts);
    }
    $('series').append(row);
  });
  syncSidebarVisibility();
}

function fillControls() {
  const v = { ...spec, yformat: spec.y.format, ymin: spec.y.min ?? '', ymax: spec.y.max ?? '', ytitle: spec.y.title ?? '',
    yprefix: spec.y.prefix ?? '', ysuffix: spec.y.suffix ?? '', xevery: spec.x.every, yside: spec.y.side ?? 'left',
    yscale: spec.y.scale ?? 'linear' };
  for (const id of ['title', 'subtitle', 'source', 'yformat', 'yside', 'yscale', 'labelMode', 'grid', 'legend',
    'ymin', 'ymax', 'ytitle', 'yprefix', 'ysuffix', 'xevery', 'strokeWidth', 'dotSize', 'fontScale', 'width', 'height']) {
    if ($(id)) $(id).value = v[id];
  }
  $('smooth').checked = spec.smooth; $('transparent').checked = spec.transparent;
  $('swVal').textContent = spec.strokeWidth + ' px';
  $('dotVal').textContent = spec.dotSize ? spec.dotSize + ' px' : 'off';
  $('fsVal').textContent = spec.fontScale + '×';
  paintTheme();
  paintTypePicker(); // inclui syncSidebarVisibility (seções/campos por tipo)
  // switches de mostrar label (garante o objeto show mesmo em spec vinda de fora)
  spec.show = { title: false, subtitle: false, source: false, ...spec.show };
  ['title', 'subtitle', 'source'].forEach((k) =>
    $('show' + k[0].toUpperCase() + k.slice(1)).setAttribute('aria-checked', !!spec.show[k]));
  paintWatermark();
}

// ── export ───────────────────────────────────────────────────────────────────
// A fonte precisa ir embutida: o SVG desenhado no canvas roda isolado e não
// enxerga a @font-face do documento — sem isso o PNG sai com fonte de sistema.
let fontPromise;
// O cache guarda só o SUCESSO: promise rejeitada em cache deixava o botão
// quebrado até dar reload (servidor que caiu e voltou, rede que oscilou).
const fontDataUri = () => (fontPromise ??= fetch('fonts/IBMPlexSans-Var.ttf')
  .then((r) => { if (!r.ok) throw new Error('fonte não encontrada (sirva a pasta por http, não file://)'); return r.blob(); })
  .then((b) => new Promise((res, rej) => {
    const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b);
  }))
  .catch((e) => {
    fontPromise = null;                        // próximo clique tenta de novo
    throw e instanceof TypeError                // fetch só dá TypeError em falha de rede
      ? new Error('não consegui buscar a fonte — o servidor caiu? Confira que node server.mjs está no ar e clique de novo.')
      : e;
  }));

async function svgString(sp) {
  return renderChart(sp, { fontDataUri: await fontDataUri() });
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

const slug = (s) => (s || 'grafico').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'grafico';

async function toPng(sp, scale) {
  const svg = await svgString(sp);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = sp.width * scale; c.height = sp.height * scale;
    const ctx = c.getContext('2d');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, sp.width, sp.height);
    return await new Promise((res) => c.toBlob(res, 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}

async function exportPng() {
  flash('Gerando PNG…');
  try {
    download(await toPng(spec, +$('scale').value), `${slug(spec.title)}.png`);
    flash('PNG baixado.');
  } catch (e) { flash('Falhou: ' + e.message, true); }
}
async function exportSvg() {
  try {
    // SVG de export sempre sem fundo (cola em qualquer arte; PNG mantém o tema)
    download(new Blob([await svgString({ ...spec, transparent: true })], { type: 'image/svg+xml' }), `${slug(spec.title)}.svg`);
    flash('SVG baixado (fundo transparente).');
  } catch (e) { flash('Falhou: ' + e.message, true); }
}
function exportJson() {
  download(new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' }), `${slug(spec.title)}.json`);
  flash('Projeto salvo (.json).');
}

// ── popover "Baixar" (PNG / SVG / JSON) — ancora no botão, fecha ao clicar fora ──
const downloadMenu = $('downloadMenu');
const btnDownload = $('btnDownload');
const DL_ICO = { png: 'image', svg: 'code-slash', json: 'document-text' };
downloadMenu.querySelectorAll('button[data-dl]').forEach((b) => {
  const key = DL_ICO[b.dataset.dl];
  if (!key) return;
  const label = b.querySelector('.dl-label')?.textContent?.trim() || b.textContent.trim();
  const badge = b.querySelector('.dl-badge');
  const badgeHtml = badge ? badge.outerHTML : '';
  b.innerHTML = `${uiIco(key, 16, 'outline')}<span class="dl-label">${label}</span>${badgeHtml}`;
});
function openDownloadMenu() {
  const r = btnDownload.getBoundingClientRect();
  downloadMenu.hidden = false;
  btnDownload.setAttribute('aria-expanded', 'true');
  const mw = downloadMenu.offsetWidth || 240;
  downloadMenu.style.left = Math.max(8, r.right - mw) + 'px';
  downloadMenu.style.top = (r.bottom + 6) + 'px';
}
function closeDownloadMenu() {
  downloadMenu.hidden = true;
  btnDownload.setAttribute('aria-expanded', 'false');
}
btnDownload.addEventListener('click', () => {
  if (downloadMenu.hidden) openDownloadMenu(); else closeDownloadMenu();
});
document.addEventListener('mousedown', (e) => {
  if (downloadMenu.hidden) return;
  if (e.target.closest('#downloadMenu') || e.target.closest('#btnDownload')) return;
  closeDownloadMenu();
});
downloadMenu.querySelector('[data-dl="png"]').addEventListener('click', () => { closeDownloadMenu(); exportPng(); });
downloadMenu.querySelector('[data-dl="svg"]').addEventListener('click', () => { closeDownloadMenu(); exportSvg(); });
downloadMenu.querySelector('[data-dl="json"]').addEventListener('click', () => { closeDownloadMenu(); exportJson(); });

$('btnCsv').addEventListener('click', () => {
  download(new Blob([toTable(spec)], { type: 'text/csv;charset=utf-8' }), `${slug(spec.title)}.csv`);
  flash('CSV baixado.');
});

// ── modo embutido (iframe da Diagramação): importa o SVG direto pro relatório ──
// Botão primary na extrema direita do header (depois de Baixar, que é secundário).
// A confirmação/banner fica na diagramação — ao importar ela fecha o modal.
if (new URLSearchParams(location.search).has('embed')) {
  const b = document.createElement('button');
  b.id = 'btnImport'; b.className = 'primary'; b.textContent = 'Importar para o Relatório';
  document.querySelector('header nav').append(b);
  b.addEventListener('click', async () => {
    flash('Gerando SVG…');
    try {
      const svg = await svgString(spec);
      // o spec vai JUNTO com o SVG: a diagramação guarda os dois no bloco, e é o
      // spec que permite reabrir este gráfico aqui dentro e editar depois — sem
      // ele o relatório só teria um PNG vetorial burro, sem volta.
      parent.postMessage({ type: 'pdgm-chart-svg', kind: 'chart', svg, spec, title: spec.title, w: spec.width, h: spec.height }, location.origin);
      await importConfirmado();
      // modal fecha no parent; o banner de confirmação também (pdgm-chart-ok)
    } catch (e) { flash('Falhou: ' + e.message, true); }
  });
  // caminho de volta: a diagramação manda o spec de um gráfico já colocado no
  // relatório pra reabrir aqui exatamente como estava
  addEventListener('message', (e) => {
    if (e.origin !== location.origin || e.data?.type !== 'pdgm-chart-load' || !e.data.spec) return;
    spec = { ...structuredClone(DEFAULTS), ...e.data.spec };
    exitEditIfOn(); fillControls(); buildSeries(); sync(); pushHistory();
  });
  parent.postMessage({ type: 'pdgm-chart-ready' }, location.origin);   // só agora dá pra receber spec
}

// "Importado." é uma promessa: só sai depois que a diagramação confirma que o
// bloco ENTROU no documento. postMessage não avisa quando ninguém escuta do outro
// lado (aba do relatório aberta antes desta versão, handler que estourou) — sem
// esse aperto de mão o editor dizia "Importado." e o gráfico sumia sem rastro.
function importConfirmado() {
  return new Promise((ok, falhou) => {
    const fim = (fn, arg) => { clearTimeout(t); removeEventListener('message', ouvir); fn(arg); };
    const ouvir = (e) => {
      if (e.origin !== location.origin) return;
      if (e.data?.type === 'pdgm-chart-ok') fim(ok);
      else if (e.data?.type === 'pdgm-chart-fail') fim(falhou, new Error(e.data.error || 'a diagramação recusou'));
    };
    const t = setTimeout(() => fim(falhou, new Error('o relatório não confirmou — recarregue a aba da diagramação (⌘⇧R) e importe de novo')), 8000);
    addEventListener('message', ouvir);
  });
}

// ── Converter imagem em gráfico: manda pro CLI do Claude (server local) ───────
$('btnIA').addEventListener('click', () => $('fileIA').click());
$('iaClose').addEventListener('click', () => { $('iaOverlay').hidden = true; });

function iaShow() {
  const ov = $('iaOverlay');
  ov.hidden = false; ov.classList.remove('err');
  $('iaClose').hidden = true;
  ov.querySelector('.ia-title').textContent = 'Lendo o gráfico com o Claude…';
  const t0 = Date.now();
  // O que o usuário vê é o progresso REAL vindo do servidor (/api/progress),
  // não um palpite: numa imagem com muitas séries a IA passa minutos só
  // ESCREVENDO o JSON dos dados, e um cronômetro sozinho parece travamento.
  let fase = '';
  const tick = () => {
    const s = Math.round((Date.now() - t0) / 1000);
    ov.querySelector('#iaTimer').textContent = `${s}s${fase ? ' · ' + fase : ' · lendo…'}`;
  };
  const puxa = async () => {
    try {
      const p = await (await fetch('/api/progress')).json();
      if (!p.rodando) return;
      fase = p.chars > 0
        // gráfico com muitas séries = centenas de números pra transcrever;
        // mostrar o tamanho do que já saiu deixa claro que está andando
        ? `escrevendo os dados (${p.chars.toLocaleString('pt-BR')} caracteres)`
        : (p.fase || '');
    } catch { /* servidor ocupado respondendo: tenta no próximo tick */ }
  };
  tick();
  const iv = setInterval(() => { tick(); puxa(); }, 1000);
  return iv;   // cronômetro + progresso ao vivo
}
function iaError(msg) {
  const ov = $('iaOverlay');
  ov.hidden = false; ov.classList.add('err');
  ov.querySelector('.ia-title').textContent = 'Não deu';
  ov.querySelector('#iaTimer').innerHTML = msg;
  $('iaClose').hidden = false;
}

$('fileIA').addEventListener('change', (e) => { if (e.target.files[0]) convertImage(e.target.files[0]); e.target.value = ''; });

// ── Autocomplete de ativo (evita erro de digitação) + paste de URL da corretora ─
// A lista de símbolos quase não muda, então "tempo real" aqui é buscar uma vez
// por corretora (cache client + 5min de cache no server) e filtrar local — não
// tem por que fazer polling de verdade pra um catálogo que muda raríssimo.
// ponytail: mercados HIP-3 (builder-deployed, tipo "xyz:WTIOIL") não entram
// nessa lista — cobertos pelo paste de URL abaixo, que não depende dela.
const symbolCache = new Map();   // venue -> [symbols]
async function loadSymbols(venue) {
  if (symbolCache.has(venue)) return;
  symbolCache.set(venue, []);   // marca "em andamento" — evita 2 fetches simultâneos do mesmo venue
  try {
    const r = await fetch('/api/symbols?venue=' + venue);
    const j = await r.json();
    if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
    symbolCache.set(venue, j.symbols);
    if ($('cdVenue').value === venue) fillSymbolList(venue);
  } catch { symbolCache.delete(venue); }   // falhou — tenta de novo na próxima troca de corretora
}
function fillSymbolList(venue) {
  $('cdSymbolList').innerHTML = (symbolCache.get(venue) || []).map((s) => `<option value="${s}">`).join('');
}
// "quis dizer…" pra ativo digitado errado: acha o maior pedaço em comum de 3+
// letras (WTIOIL → cash:WTI, km:USOIL, xyz:BRENTOIL). Ignora o prefixo do dex
// HIP-3 na comparação. 3 letras é o piso: com 1-2 o "W" de WTIOIL casava com
// qualquer coisa e a sugestão virava lixo.
// no HIP-3 o dex vem minúsculo e a moeda maiúscula ("xyz:CL") — uppercase geral
// estragaria o nome no título do gráfico
const shownSymbol = (s) => (s.includes(':')
  ? s.replace(/^([^:]+):(.*)$/, (_, dex, c) => `${dex.toLowerCase()}:${c.toUpperCase()}`)
  : s.toUpperCase());

// Alguns mercados HIP-3 aparecem no site (e na URL) com um nome de vitrine
// diferente do nome que a API usa, e a API NÃO expõe esse apelido em lugar
// nenhum — conferido em meta, metaAndAssetCtxs, allMids, perpDexs e spotMeta,
// e nos bundles JS do site. Por isso a tradução mora aqui.
// xyz:WTIOIL = xyz:CL (CL é o ticker do WTI na NYMEX): abrir
// /trade/xyz:CL faz a própria Hyperliquid redirecionar pra /trade/xyz:WTIOIL,
// e os dois mostram o mesmo preço ao vivo.
const APELIDOS_HL = { 'xyz:wtioil': 'xyz:CL' };
const resolveSymbol = (s) => APELIDOS_HL[s.trim().toLowerCase()] || s.trim();

function nearbySymbols(typed, known) {
  const bare = typed.replace(/^[^:]+:/, '').toUpperCase();
  const subs = [];   // do maior pro menor: o 1º que casar é o melhor pedaço
  for (let n = bare.length; n >= 3; n--)
    for (let i = 0; i + n <= bare.length; i++) subs.push(bare.slice(i, i + n));
  const hits = known
    .map((s) => ({ s, score: (subs.find((f) => s.replace(/^[^:]+:/, '').toUpperCase().includes(f)) || '').length }))
    .filter((h) => h.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5).map((h) => h.s);
  return hits.length ? ` Quis dizer: ${hits.join(', ')}?` : '';
}
$('cdVenue').addEventListener('change', () => {
  fillSymbolList($('cdVenue').value);
  loadSymbols($('cdVenue').value);
});
// em 1 dia/1 semana não existe hora pra escolher — o rótulo é sempre o dia
const syncXLabelCtl = () => { $('cdXLabel').disabled = !/[mh]$/.test($('cdInterval').value); };
$('cdInterval').addEventListener('change', syncXLabelCtl);
syncXLabelCtl();

// volume liga/desliga na hora, sem re-buscar: todo o resto dos controles
// atualiza ao vivo, então só valer na próxima busca parecia que estava quebrado.
// Guarda os candles da última busca pra conseguir religar o volume depois.
let lastCandleRows = null;
const volSeries = (rows) => ({ name: 'Volume', data: rows.map((k) => k.v), as: 'bar', axis: 'y2', color: '#94A3B8' });
$('cdVol').addEventListener('change', () => {
  if (spec.type !== 'candle') return;             // não mexe em gráfico que não veio da corretora
  const at = spec.series.findIndex((se) => se.axis === 'y2');
  const quer = $('cdVol').value === '1';
  if (quer === (at >= 0)) return;
  if (quer) {
    if (!lastCandleRows) return flash('Busque os candles primeiro.', true);
    // se os pontos foram editados, o volume guardado não alinha mais
    if (lastCandleRows.length !== spec.labels.length)
      return flash('O volume não bate mais com os dados editados — busque os candles de novo.', true);
    spec.series.push(volSeries(lastCandleRows));
    spec.y2 = { format: 'compact' };
  } else {
    spec.series.splice(at, 1);
    delete spec.y2;
  }
  buildSeries(); sync(); pushHistory();
});

function parseAssetUrl(raw) {
  let u; try { u = new URL(raw); } catch { return null; }
  const host = u.hostname.replace(/^(app|www)\./, '');
  if (host === 'hyperliquid.xyz') {
    const m = u.pathname.match(/\/trade\/([^/?#]+)/);
    // a URL traz o nome de vitrine; resolve pro nome da API (ver APELIDOS_HL)
    return m ? { venue: 'hyperliquid', symbol: resolveSymbol(decodeURIComponent(m[1])) } : null;
  }
  // hypurrscan é explorer da Hyperliquid: /market/<ativo>, já com o nome da API
  if (host === 'hypurrscan.io') {
    const m = u.pathname.match(/\/market\/([^/?#]+)/);
    return m ? { venue: 'hyperliquid', symbol: resolveSymbol(decodeURIComponent(m[1])) } : null;
  }
  if (host === 'binance.com') {
    const m = u.pathname.match(/\/(?:trade|futures)\/([^/?#]+)/);
    return m ? { venue: 'binance', symbol: decodeURIComponent(m[1]).replace('_', '') } : null;
  }
  return null;
}
// cola a URL do gráfico na corretora (ex.: https://app.hyperliquid.xyz/trade/xyz:WTIOIL)
// em vez de digitar o ativo — extrai corretora + ativo direto do link.
// 'paste' (não 'input'): lê o clipboard de uma vez só — em 'input' cada tecla
// de uma URL sendo digitada aos poucos é uma URL válida mas incompleta, e
// isso disparava "não reconheci" a cada caractere.
$('cdSymbol').addEventListener('paste', (e) => {
  const v = (e.clipboardData?.getData('text') || '').trim();
  if (!/^https?:\/\//i.test(v)) return;   // não é URL — deixa colar normal
  e.preventDefault();
  const parsed = parseAssetUrl(v);
  if (!parsed) return flash('Não reconheci essa URL — cole o ativo direto.', true);
  $('cdVenue').value = parsed.venue;
  fillSymbolList(parsed.venue); loadSymbols(parsed.venue);
  const naUrl = decodeURIComponent(v.match(/\/trade\/([^/?#]+)/)?.[1] || '');
  e.target.value = parsed.symbol;
  // explica a troca de nome, senão parece que o campo ignorou o que foi colado
  flash(parsed.symbol !== naUrl && naUrl
    ? `Ativo: ${parsed.symbol} — é o nome que a API usa pro ${naUrl}.`
    : `Ativo: ${parsed.symbol} (${parsed.venue === 'binance' ? 'Binance' : 'Hyperliquid'}).`);
});

// Rótulos do eixo X de um candle. Em intervalo menor que 1 dia o padrão é
// marcar só a virada do dia, sem horário: o rótulo é o mesmo pros 24 candles do
// dia, então mostrar em todos vira repetição — só o primeiro candle de cada dia
// fica visível e o resto entra em x.hidden (o candle continua lá, some só o texto).
const MAX_X_LABELS = 12;
function candleLabels(rows, interval, mode) {
  const sub = /[mh]$/.test(interval);            // 1m/5m/1h/4h — menor que 1 dia
  const dia = (ms) => { const d = new Date(ms); return `${d.getUTCDate()}/${capFirst(MES[d.getUTCMonth()])}`; };
  const hora = (ms) => `${String(new Date(ms).getUTCHours()).padStart(2, '0')}h`;
  const thin = (n) => ({ every: Math.max(1, Math.ceil(n / MAX_X_LABELS)) });

  if (!sub || mode === 'dia') {
    const labels = rows.map((k) => dia(k.t));
    if (!sub) return { labels, x: thin(rows.length) };
    // índices em que o dia vira; se der muitos dias, mostra 1 a cada N viradas
    const viradas = labels.map((_, i) => i).filter((i) => i === 0 || labels[i] !== labels[i - 1]);
    const passo = Math.max(1, Math.ceil(viradas.length / MAX_X_LABELS));
    const visiveis = new Set(viradas.filter((_, n) => n % passo === 0));
    return { labels, x: { every: 1, hidden: labels.map((_, i) => i).filter((i) => !visiveis.has(i)) } };
  }
  const labels = rows.map((k) => (mode === 'hora' ? hora(k.t) : `${dia(k.t)} ${hora(k.t)}`));
  return { labels, x: thin(rows.length) };
}

// ── Candles por API (Binance/Hyperliquid): ativo + datas → gráfico candle ─────
$('btnCandles').addEventListener('click', async () => {
  // resolve o nome de vitrine antes de validar (digitado à mão também vale)
  const symbol = resolveSymbol($('cdSymbol').value);
  const start = $('cdStart').value, end = $('cdEnd').value;
  if (!symbol) return flash('Diga o ativo (BTCUSDT na Binance; HYPE na Hyperliquid).', true);
  if (!start || !end) return flash('Preencha as datas De e Até.', true);
  // ativo inexistente falha aqui, com sugestão — antes era HTTP 500 da corretora,
  // que não diz o que fazer nenhum
  const known = symbolCache.get($('cdVenue').value) || [];
  if (known.length && !known.some((s) => s.toLowerCase() === symbol.toLowerCase())) {
    return flash(`"${symbol}" não existe nessa corretora.${nearbySymbols(symbol, known)}`, true);
  }
  const btn = $('btnCandles');
  btn.disabled = true; btn.textContent = 'Buscando…';
  try {
    const qs = new URLSearchParams({
      venue: $('cdVenue').value, symbol, interval: $('cdInterval').value,
      start: Date.parse(start + 'T00:00:00Z'), end: Date.parse(end + 'T23:59:59Z'),
    });
    const r = await fetch('/api/candles?' + qs);
    const j = await r.json();
    if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
    const rows = j.rows;
    const { labels, x } = candleLabels(rows, $('cdInterval').value, $('cdXLabel').value);
    const cSpec = {
      type: 'candle',
      title: `${shownSymbol(symbol)} — ${$('cdVenue').value === 'binance' ? 'Binance' : 'Hyperliquid'}`,
      labels,
      series: [
        { name: 'Abertura', data: rows.map((k) => k.o) },
        { name: 'Máxima', data: rows.map((k) => k.h) },
        { name: 'Mínima', data: rows.map((k) => k.l) },
        { name: 'Fechamento', data: rows.map((k) => k.c) },
      ],
      y: { format: 'num', zero: false },
      x,
    };
    lastCandleRows = rows;
    if ($('cdVol').value === '1') {
      cSpec.series.push(volSeries(rows));
      cSpec.y2 = { format: 'compact' };
    }
    spec = { ...structuredClone(DEFAULTS), ...cSpec };
    exitEditIfOn(); fillControls(); buildSeries(); sync(); pushHistory();
    clearIaSession();   // dados de API, não de imagem — o chat da extração não se aplica
    flash(`${rows.length} candles de ${shownSymbol(symbol)}.`);
  } catch (e) {
    flash('Candles: ' + e.message, true);
  } finally {
    btn.disabled = false; btn.textContent = 'Buscar candles';
  }
});
function exitEditIfOn() { if (editMode) exitEdit(); }

// ── Importar de HTML/SVG: reconstrói a spec do markup colado (sem IA) ─────────
/* DefiLlama: o gráfico do site é ECharts em <canvas>, então o HTML não carrega
 * dado nenhum (diferente do recharts, que guarda a curva no `d` do <path>).
 * Mas a URL — do embed ou da página — traz o slug e quais métricas estão
 * ligadas, e a API deles é aberta: em vez de tentar ler pixel, busca a fonte.
 * Aceita tanto a URL solta quanto o <iframe …> inteiro colado. */
function parseLlamaUrl(texto) {
  const m = /defillama\.com\/(?:chart\/)?protocol\/([\w.-]+)([^\s"'<>]*)/i.exec(texto);
  if (!m) return null;
  const q = new URLSearchParams((m[2].split('?')[1] || '').replace(/&amp;/g, '&'));
  const on = (k, padrao) => (q.has(k) ? q.get(k) !== 'false' : padrao);
  // TVL é o que a página abre por padrão; as outras só entram se a URL pedir
  return { slug: m[1], tvl: on('tvl', true), openInterest: on('openInterest', false), fees: on('fees', false) };
}

async function importarLlama(alvo) {
  const btn = $('btnImportHtml');
  btn.disabled = true; flash(`Buscando ${alvo.slug} no DefiLlama…`);
  try {
    const qs = new URLSearchParams({ slug: alvo.slug });
    ['tvl', 'openInterest', 'fees'].forEach((k) => { if (alvo[k]) qs.set(k, '1'); });
    const r = await fetch('/api/llama?' + qs);
    const j = await r.json();
    if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
    const n = j.dias.length;
    // Rótulo pelo ALCANCE, não fixo: em 3 anos de história "02/03/23" repetido
    // 12 vezes não cabe no eixo e os textos encavalam — aí "Mar/23" basta.
    const anos = (Date.parse(j.dias.at(-1)) - Date.parse(j.dias[0])) / 31557600000;
    const labels = j.dias.map((iso) => {
      const [a, m, d] = iso.split('-');
      return anos > 1.5 ? `${capFirst(MES[+m - 1])}/${a.slice(2)}` : `${+d}/${capFirst(MES[+m - 1])}`;
    });
    spec = { ...structuredClone(DEFAULTS),
      type: 'line', labels, series: j.series,
      y: { ...DEFAULTS.y, format: 'compact', prefix: 'US$ ' },
      x: { ...DEFAULTS.x, every: Math.max(1, Math.ceil(n / MAX_X_LABELS)) } };
    clearIaSession();                 // dado de API, não de imagem
    exitEditIfOn(); fillControls(); buildSeries(); sync(); pushHistory();
    const quais = j.series.map((s) => s.name).join(' + ');
    flash(`DefiLlama: ${quais} — ${n} pontos, ${labels[0]} a ${labels.at(-1)}.`);
  } catch (e) {
    flash(/Failed to fetch|NetworkError/.test(e.message)
      ? 'Pra buscar no DefiLlama o servidor precisa estar no ar: node --watch server.mjs'
      : 'DefiLlama: ' + e.message, true);
  } finally { btn.disabled = false; }
}

$('btnImportHtml').addEventListener('click', () => {
  const html = $('htmlIn').value.trim();
  if (!html) return flash('Cole o HTML do elemento primeiro.', true);
  const llama = parseLlamaUrl(html);
  if (llama) return importarLlama(llama);   // URL/iframe do DefiLlama: busca a API
  let partial;
  try { partial = parseChartHtml(html); }
  catch (err) { return flash('Não deu: ' + err.message, true); }
  if (!partial || !partial.series?.length) return flash('Não achei gráfico nem tabela nesse HTML.', true);
  spec = { ...structuredClone(DEFAULTS), ...partial };
  const datou = datarX();                     // se as datas já estiverem preenchidas
  clearIaSession();   // dados do HTML colado, não de imagem — o chat da extração não se aplica
  fillControls(); buildSeries(); sync();
  enterEdit(); pushHistory();
  const n = spec.series[0].data.length, cal = partial._calibrated;
  flash(`Importado — ${spec.series.length} série(s), ${n} pontos.` +
    (datou ? ' Eixo X datado.' : '') +
    (partial._note ? ' ' + partial._note
      : cal ? ' Arraste pra ajustar.' : ' Sem eixo pra calibrar: defina mín/máx ou arraste.'));
});

/* Datas no eixo X. Sparkline de card não escreve data nenhuma no HTML — o que
 * dá pra saber é que os pontos são igualmente espaçados no tempo. Com as duas
 * pontas da janela, o passo sai por divisão. Rótulo em dia/mês, ou mês/ano
 * quando a janela passa de ~2 anos (senão vira papa de "13/Jan"). Não mexe em
 * nada se faltar data ou série — devolve false. */
function datarX() {
  const a = Date.parse($('hxStart').value + 'T00:00:00Z'), b = Date.parse($('hxEnd').value + 'T00:00:00Z');
  const n = spec.series?.[0]?.data.length || 0;
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a || n < 2) return false;
  const longa = (b - a) > 730 * 864e5;
  spec.labels = Array.from({ length: n }, (_, i) => {
    const d = new Date(a + (b - a) * i / (n - 1));
    return longa ? `${capFirst(MES[d.getUTCMonth()])}/${String(d.getUTCFullYear()).slice(2)}`
      : `${d.getUTCDate()}/${capFirst(MES[d.getUTCMonth()])}`;
  });
  spec.x = { ...spec.x, every: Math.max(1, Math.ceil(n / MAX_X_LABELS)), hidden: [] };
  return true;
}

$('btnDatarX').addEventListener('click', () => {
  if (!spec.series?.length) return flash('Importe o gráfico primeiro.', true);
  if (!datarX()) return flash('Preencha as duas datas (a última depois da primeira).', true);
  fillControls(); buildSeries(); sync(); pushHistory();
  flash(`Eixo X datado — ${spec.labels.length} pontos, 1 rótulo a cada ${spec.x.every}.`);
});

// decodifica a imagem no canvas -> ImageData pro extrator por pixel
async function fileToImageData(file) {
  const bmp = await createImageBitmap(file);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  return ctx.getImageData(0, 0, bmp.width, bmp.height);
}

async function convertImage(file) {
  if (!file.type.startsWith('image/')) return flash('Mande uma imagem (PNG/JPG).', true);
  setReference(file);                      // já deixa a original pronta pra sobrepor
  $('btnIA').disabled = true;
  const timer = iaShow();
  try {
    const r = await fetch('/api/convert', { method: 'POST', headers: { 'content-type': file.type || 'image/png' }, body: file });
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('json')) throw new Error('Servidor sem a rota de IA. Rode <code>node server.mjs</code> (não o http.server do Python).');
    const j = await r.json();
    if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
    let specIn = j.spec, rep = null;
    if (specIn.mode === 'pixels') {
      // o LLM só leu o texto (ticks, título); os DADOS saem da leitura por pixel
      const built = buildSpecFromImage(await fileToImageData(file), specIn);
      specIn = built.spec; ghostPlotRect = built.plotRect; rep = built.report;
    } else {
      ghostPlotRect = specIn.plotRect || null;   // pra alinhar a sobreposição na mesma escala
    }
    delete specIn.plotRect;                      // não são campos da spec do renderer
    delete specIn.mode;
    if (Array.isArray(specIn.labels)) specIn.labels = specIn.labels.map(capFirst);   // meses com inicial maiúscula
    // sankey não tem série nem eixo: o dado são as ligações que a IA leu das
    // fitas. Sem isso a spec chegava com `links` mas era tratada como cartesiana.
    const ehSankey = specIn.type === 'sankey' && Array.isArray(specIn.links);
    spec = { ...structuredClone(DEFAULTS), ...specIn };
    if (!ehSankey && spec.series?.length) spec.x.every = Math.max(spec.x.every || 1, Math.ceil((spec.labels?.length || spec.series[0].data.length) / 12));
    fillControls(); buildSeries(); sync();
    /* Sobreposição da original pra conferir — MENOS no sankey: lá o desenho é
     * recalculado do zero (colunas, ordem dos nós, altura), então a imagem
     * nunca alinha com o resultado e só atrapalha a leitura. `setReference`
     * liga o ghost lá em cima, então aqui é preciso DESLIGAR, não só não ligar. */
    $('ghostOn').checked = !ehSankey; applyGhost();
    $('iaOverlay').hidden = true;
    if (!ehSankey) enterEdit();                  // sankey: o modo edição move nó, não ponto
    pushHistory();
    iaSession = j.sessionId || null;             // habilita o chat com a mesma sessão
    if (iaSession) showChat('Extração pronta. Me peça pra corrigir algum dado, rótulo ou o título — reexamino a imagem.');
    else hideChat();
    flash(`Pronto — ${(j.ms / 1000).toFixed(0)}s${j.cost ? `, ~US$ ${j.cost.toFixed(3)}` : ''}`
      + (rep ? ` · ${rep.pontos} pontos por pixel, cobertura ${rep.series[0].cobertura}%` : '')
      + (ehSankey ? ` · ${spec.links.length} fluxos. Confira os valores na caixa de texto.`
        : '. Arraste os pontos pra ajustar.'));
  } catch (err) {
    iaError(/Failed to fetch|NetworkError/.test(err.message)
      ? 'Servidor de IA fora do ar. No terminal, rode:<br><code>node server.mjs</code>' : err.message);
  } finally {
    clearInterval(timer); $('btnIA').disabled = false;
  }
}

// ── chat flutuante com a IA da extração: continua a MESMA sessão ──────────────
let iaSession = null, refining = false;
function openChat() {
  $('iaPanel').hidden = false; $('iaFab').hidden = true;
  $('iaLog').scrollTop = $('iaLog').scrollHeight;
  setTimeout(() => $('iaMsg').focus(), 0);
}
function minChat() { $('iaPanel').hidden = true; $('iaFab').hidden = false; }
function hideChat() { $('iaPanel').hidden = true; $('iaFab').hidden = true; }
// dados que não vieram de imagem (API, HTML colado): o chat de correção lê a
// imagem original pra conferir o pedido — sem isso ele reexaminaria uma
// imagem de OUTRO gráfico (a última convertida na sessão) e nunca acertaria o
// pedido, só gastaria minutos. null a sessão, não só esconder o painel: se
// sobrar um FAB aberto de uma conversão anterior, clicar nele já bloqueia
// (`refineChart` recusa sem sessão) em vez de rodar a IA contra o gráfico errado.
function clearIaSession() { iaSession = null; hideChat(); }
function showChat(msg) {   // após conversão: liga o FAB e abre uma vez com boas-vindas
  $('iaLog').innerHTML = '';
  if (msg) appendChat('bot', msg);
  openChat();
}
function appendChat(who, text) {
  const el = document.createElement('div');
  el.className = 'ia-msg ia-' + (who === 'user' ? 'user' : 'bot');
  el.textContent = text;
  $('iaLog').append(el); $('iaLog').scrollTop = $('iaLog').scrollHeight;
  return el;
}
$('iaFab').addEventListener('click', openChat);
$('iaMin').addEventListener('click', minChat);

async function refineChart(message) {
  if (!iaSession) return flash('Converta uma imagem primeiro.', true);
  if (refining) return;                        // uma correção por vez
  refining = true;
  appendChat('user', message);
  const pending = appendChat('bot', 'pensando… 0s');
  pending.classList.add('pending');
  const t0 = Date.now();
  // mesma ideia do overlay da conversão: progresso REAL do servidor, porque a
  // correção relê a imagem e pode passar minutos reescrevendo os dados
  let fase = '';
  const timer = setInterval(async () => {
    const s = Math.round((Date.now() - t0) / 1000);
    pending.textContent = `pensando… ${s}s${fase ? ' · ' + fase : ''}`;
    try {
      const p = await (await fetch('/api/progress')).json();
      if (p.rodando) fase = p.chars > 0 ? `escrevendo (${p.chars.toLocaleString('pt-BR')} caracteres)` : (p.fase || '');
    } catch { /* ignora: é só o indicador */ }
  }, 1000);
  $('iaSend').disabled = $('iaMsg').disabled = true;
  const ctrl = new AbortController();
  // Sem teto curto aqui: quem decide é o servidor, que mata por INATIVIDADE
  // (4 min mudo, 15 min se a API avisou que estamos na fila) em vez de por
  // tempo total. O teto de 3 min do cliente era o que produzia o "demorou
  // demais" bem quando a resposta estava quase chegando. 16 min é só a rede
  // pro caso de a conexão em si morrer.
  const kill = setTimeout(() => ctrl.abort(), 960000);
  // manda só os campos de dado; tema/marca d'água/formato ficam locais
  const dataSpec = {
    type: spec.type, title: spec.title, subtitle: spec.subtitle, source: spec.source,
    labels: spec.labels, series: spec.series.map((s) => ({ name: s.name, data: s.data })),
    y: { format: spec.y.format, prefix: spec.y.prefix, suffix: spec.y.suffix },
  };
  try {
    const r = await fetch('/api/refine', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: iaSession, spec: dataSpec, message }), signal: ctrl.signal,
    });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
    if (j.sessionId) iaSession = j.sessionId;   // a conversa acumula contexto
    applyRefine(j.spec);
    pending.classList.remove('pending');
    // stalledMs = maior silêncio da API dentro da chamada. Só vale dizer quando
    // foi grande: aí a demora não foi a ferramenta, foi espera externa.
    const parado = j.stalledMs > 30000 ? `, ${Math.round(j.stalledMs / 60000)} min parado esperando a API` : '';
    pending.textContent = `✓ atualizado (${((j.ms || 0) / 1000).toFixed(0)}s${parado})`;
  } catch (e) {
    pending.classList.remove('pending'); pending.classList.add('err');
    pending.textContent = e.name === 'AbortError' ? '✗ conexão perdida — tente de novo ou recarregue a página'
      : /Failed to fetch|NetworkError/.test(e.message) ? '✗ servidor de IA fora do ar — rode node --watch server.mjs no terminal'
        : '✗ ' + e.message;
  } finally {
    clearInterval(timer); clearTimeout(kill);
    refining = false;
    $('iaSend').disabled = $('iaMsg').disabled = false;
    $('iaMsg').value = ''; $('iaMsg').focus();
  }
}
// aplica a spec corrigida preservando as escolhas locais (cor/tracejado/tema/etc.)
function applyRefine(c) {
  if (!c) return;
  if (c.type) spec.type = c.type;
  ['title', 'subtitle', 'source'].forEach((k) => { if (c[k] != null) spec[k] = c[k]; });
  if (Array.isArray(c.labels)) spec.labels = c.labels.map(capFirst);
  if (Array.isArray(c.series)) spec.series = c.series.map((s, i) => ({ ...(spec.series[i] || {}), name: s.name ?? spec.series[i]?.name, data: s.data }));
  if (c.y) spec.y = { ...spec.y, ...c.y };
  spec.y.min = null; spec.y.max = null;                          // dado pode mudar de magnitude → reescala
  fillControls(); buildSeries(); sync();
  if (editMode && chartMeta.scale && spec.type !== 'donut') {    // reata a escala fixa nos novos dados
    spec.y.min = chartMeta.scale.dMin; spec.y.max = chartMeta.scale.dMax; sync();
  }
  pushHistory();
}
$('iaSend').addEventListener('click', () => { const m = $('iaMsg').value.trim(); if (m) refineChart(m); });
$('iaMsg').addEventListener('keydown', (e) => {
  e.stopPropagation();                            // ⌘Z etc. não roubam a digitação
  if (e.key === 'Enter') { e.preventDefault(); const m = $('iaMsg').value.trim(); if (m) refineChart(m); }
});

// ── onion-skin: sobrepõe a imagem original ao gráfico pra comparar na mão ──────
let ghostUrl = null, ghostPlotRect = null, ghostMove = false;
let ghostAdjust = { dx: 0, dy: 0, scale: 1 };   // ajuste manual (dx/dy em px do viewBox)
function setReference(file) {
  if (ghostUrl) URL.revokeObjectURL(ghostUrl);
  ghostUrl = URL.createObjectURL(file);
  $('ghost').src = ghostUrl;
  $('ghostCtl').hidden = $('ghostMove').hidden = false;
  $('ghostOn').checked = true;
  ghostAdjust = { dx: 0, dy: 0, scale: 1 };
  applyGhost();
}
function applyGhost() {
  const on = $('ghostOn').checked && ghostUrl;
  $('ghost').hidden = !on;
  $('ghost').style.opacity = +$('ghostOp').value / 100;
  $('ghostVal').textContent = $('ghostOp').value + '%';
  if (on) positionGhost(); else $('ghost').classList.remove('movable', 'grabbing');
}
// alinha a original à MESMA escala do gráfico: mapeia a área de plotagem dela
// (plotRect, lido pela IA) sobre a do gráfico. Sem plotRect, usa a caixa inteira.
// Depois aplica o ajuste manual (arrastar/escala) por cima.
function positionGhost() {
  const g = $('ghost'), svg = out.querySelector('svg');
  if (!svg) return;
  const r = svg.getBoundingClientRect();
  const sx = r.width / spec.width, sy = r.height / spec.height;   // viewBox px → tela
  let bx, by, bw, bh;
  if (ghostPlotRect && chartMeta.plot) {
    const p = chartMeta.plot, pr = ghostPlotRect;
    bw = (p.plotW * sx) / pr.w; bh = (p.plotH * sy) / pr.h;
    bx = p.left * sx - pr.x * bw; by = p.top * sy - pr.y * bh;
  } else { bx = 0; by = 0; bw = r.width; bh = r.height; }
  const a = ghostAdjust, w = bw * a.scale, h = bh * a.scale;
  g.style.cssText = 'position:absolute;object-fit:fill;border-radius:4px;';
  g.style.width = w + 'px'; g.style.height = h + 'px';
  g.style.left = (bx - (w - bw) / 2 + a.dx * sx) + 'px';   // escala pelo centro + desloca
  g.style.top = (by - (h - bh) / 2 + a.dy * sy) + 'px';
  g.style.opacity = +$('ghostOp').value / 100;
  g.classList.toggle('movable', ghostMove);
}
$('ghostOn').addEventListener('change', applyGhost);
$('ghostOp').addEventListener('input', applyGhost);
addEventListener('resize', () => { if (ghostUrl && $('ghostOn').checked) positionGhost(); });

// ── ajustar a sobreposição na mão: arrastar move, roda escala, 2 cliques reseta
$('ghostMove').addEventListener('click', () => {
  ghostMove = !ghostMove;
  $('ghostMove').classList.toggle('on', ghostMove);
  if (ghostMove && !$('ghostOn').checked) $('ghostOn').checked = true;
  applyGhost();
  flash(ghostMove ? 'Ajuste a sobreposição: arraste move, roda escala, 2 cliques reseta.' : '');
});
{
  const gh = $('ghost');
  let gdrag = null;
  gh.addEventListener('pointerdown', (e) => {
    if (!ghostMove) return;
    gdrag = { x: e.clientX, y: e.clientY, dx: ghostAdjust.dx, dy: ghostAdjust.dy };
    gh.setPointerCapture(e.pointerId); gh.classList.add('grabbing');
  });
  gh.addEventListener('pointermove', (e) => {
    if (!gdrag) return;
    const r = out.querySelector('svg').getBoundingClientRect();
    ghostAdjust.dx = gdrag.dx + (e.clientX - gdrag.x) * (spec.width / r.width);
    ghostAdjust.dy = gdrag.dy + (e.clientY - gdrag.y) * (spec.height / r.height);
    positionGhost();
  });
  const stop = (e) => { if (gdrag) { gdrag = null; gh.classList.remove('grabbing'); try { gh.releasePointerCapture(e.pointerId); } catch { } } };
  gh.addEventListener('pointerup', stop);
  gh.addEventListener('pointercancel', stop);
  gh.addEventListener('wheel', (e) => {
    if (!ghostMove) return;
    e.preventDefault();
    ghostAdjust.scale = Math.max(0.2, Math.min(5, ghostAdjust.scale * (e.deltaY < 0 ? 1.04 : 0.96)));
    positionGhost();
  }, { passive: false });
  gh.addEventListener('dblclick', () => { if (ghostMove) { ghostAdjust = { dx: 0, dy: 0, scale: 1 }; positionGhost(); } });
}

// arrastar uma imagem pra janela também converte; um .json reabre o projeto
const drop = $('drop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault(); drop.classList.remove('over');
  const files = [...e.dataTransfer.files];
  const j = files.find((f) => f.name.endsWith('.json'));
  if (j) return openSpecFile(j);
  const f = files.find((f) => f.type.startsWith('image/'));
  if (f) convertImage(f);
});

// ── modo edição: escala fixa, alças, add/remove ──────────────────────────────
// Undo/redo vivem na top bar e valem pro criador inteiro (não só este modo).
let priorBounds = null;
$('editToggle').addEventListener('click', () => (editMode ? exitEdit() : enterEdit()));

function paintEditToggle() {
  const btn = $('editToggle');
  if (editMode) {
    btn.classList.add('on');
    btn.innerHTML = `${uiIco('checkmark', 14, 'outline')}<span>Concluir</span>`;
    btn.title = 'Sair do modo edição';
  } else {
    btn.classList.remove('on');
    // ion-icon name="create-outline" — mesmo do popover "Editar dados" no diagramador
    btn.innerHTML = `${uiIco('create', 14, 'outline')}<span>Editar</span>`;
    btn.title = 'Editar pontos e rótulos · Shift+arraste = posição livre no X';
  }
}

function enterEdit() {
  editMode = true;
  // congela a escala no que está na tela: senão arrastar um ponto reescala tudo
  if (chartMeta.scale && spec.type !== 'donut' && spec.type !== 'pie') {
    priorBounds = { min: spec.y.min, max: spec.y.max };
    spec.y.min = chartMeta.scale.dMin; spec.y.max = chartMeta.scale.dMax;
    if (chartMeta.scale2) {   // congela o eixo direito também
      spec.y2 = spec.y2 || {};
      priorBounds.min2 = spec.y2.min; priorBounds.max2 = spec.y2.max;
      spec.y2.min = chartMeta.scale2.dMin; spec.y2.max = chartMeta.scale2.dMax;
    }
  }
  paintEditToggle();
  editLayer.classList.add('on');
  fillControls(); sync();
  flash('Arraste: valor · Shift: X livre · 2× na linha: ponto · 2× no eixo: rótulo.');
}
function exitEdit() {
  editMode = false;
  insertGhost = null;
  labelInsertGhost = null;
  if (priorBounds) {
    spec.y.min = priorBounds.min; spec.y.max = priorBounds.max;
    if (spec.y2 && 'min2' in priorBounds) { spec.y2.min = priorBounds.min2; spec.y2.max = priorBounds.max2; }
    priorBounds = null;
  }
  paintEditToggle();
  editLayer.classList.remove('on', 'can-drag');
  fillControls(); sync();
}

// histórico (undo/redo) — snapshot do spec inteiro; top bar, global (como diagramador)
let history = [], hidx = -1, histT = 0;
function pushHistory() {
  clearTimeout(histT); histT = 0;
  const s = JSON.stringify(spec);
  if (hidx >= 0 && history[hidx] === s) { updateUndoBtns(); return; }
  history = history.slice(0, hidx + 1);
  history.push(s);
  if (history.length > 60) history.shift();
  hidx = history.length - 1;
  updateUndoBtns();
}
// sliders / digitação: coalesce num único passo (igual scheduleCommit do diagramador)
function scheduleHistory() {
  clearTimeout(histT);
  histT = setTimeout(pushHistory, 400);
}
function restoreHistory() {
  clearTimeout(histT); histT = 0;
  spec = JSON.parse(history[hidx]);
  fillControls(); buildSeries(); sync();
  if (editMode) editLayer.classList.add('on');
  updateUndoBtns();
}
function updateUndoBtns() {
  const u = $('btnUndo'), r = $('btnRedo');
  if (u) u.disabled = hidx <= 0;
  if (r) r.disabled = hidx >= history.length - 1;
}
// fecha rajada pendente antes de voltar (como diagramador commit+undo)
function doUndo() {
  clearTimeout(histT); histT = 0;
  pushHistory();   // grava o estado atual se ainda não estiver no hist
  if (hidx <= 0) return;
  hidx--;
  restoreHistory();
}
function doRedo() {
  clearTimeout(histT); histT = 0;
  if (hidx >= history.length - 1) return;
  hidx++;
  restoreHistory();
}
$('btnUndo').addEventListener('click', doUndo);
$('btnRedo').addEventListener('click', doRedo);
// ion-icon name="arrow-undo" / "arrow-redo" solid — iguais no diagramador
$('btnUndo').innerHTML = uiIco('arrow-undo', 16, 'solid');
$('btnRedo').innerHTML = uiIco('arrow-redo', 16, 'solid');
addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey) || /input|textarea/i.test(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); }
  else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); doRedo(); }
});
paintEditToggle();

// inicial maiúscula no rótulo (meses saem capitalizados por padrão na extração)
const capFirst = (s) => (typeof s === 'string' && s ? s[0].toUpperCase() + s.slice(1) : s);
// mês do meio entre dois rótulos tipo "Out/25"–"Jan/26" → "Dez/25"; senão vazio
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function midLabel(a, b) {
  const re = /^([a-zç]{3})\/(\d{2})$/i;   // aceita "Jan/25" e "jan/25"
  const pa = re.exec(a || ''), pb = re.exec(b || '');
  if (!pa || !pb) return '';
  const im = (x) => MES.indexOf(x.toLowerCase());
  const m = Math.round((+pa[2] * 12 + im(pa[1]) + +pb[2] * 12 + im(pb[1])) / 2);
  return `${capFirst(MES[((m % 12) + 12) % 12])}/${String(Math.floor(m / 12)).padStart(2, '0')}`;
}

// ── arraste: editar pontos/barras direto no gráfico ───────────────────────────
// O #editLayer (transparente, por cima) captura o ponteiro; acha a marca mais
// próxima, converte o pixel de volta pra valor e re-renderiza.
//   • arraste normal  → só o valor (eixo Y / valor no hbar); rótulo X fixo
//   • Shift+arraste   → valor + posição livre no eixo de categoria (x.pos),
//     sem mover o rótulo (março fica em março; o ponto pode ir entre mar/abr)
// Tooltip mostra X+Y. Donut edita pela planilha.
const editLayer = $('editLayer'), tip = $('dragTip');
let drag = null, raf = 0;
let labelDrag = null;   // { i, lbl, startClientX, startClientY, startDx, moved } — só horizontal
let nodeDrag = null;    // { n, startY, startOff } — nó do sankey, só vertical

const escTip = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// depois de inserir (delta=+1, at=índice novo) ou remover (delta=-1, at=índice
// removido) um ponto, realinha os índices guardados em x.hidden/x.offsets/x.pos —
// senão "oculto no índice 5" passa a apontar pro ponto errado.
function reindexX(at, delta) {
  if (!spec.x) return;
  const shift = (i) => (delta > 0 ? (i >= at ? i + 1 : i) : (i > at ? i - 1 : i));
  const remapMap = (map) => {
    if (!map || typeof map !== 'object') return map;
    const o = {};
    for (const k in map) {
      const i = +k;
      if (delta < 0 && i === at) continue;
      o[shift(i)] = map[k];
    }
    return o;
  };
  if (Array.isArray(spec.x.hidden)) spec.x.hidden = spec.x.hidden.filter((i) => delta > 0 || i !== at).map(shift);
  if (spec.x.offsets) spec.x.offsets = remapMap(spec.x.offsets);
  if (spec.x.pos) spec.x.pos = remapMap(spec.x.pos);
}

// fração 0..1 no eixo de categoria sob o cursor (X no vertical, Y no hbar)
function catFracAt(vb) {
  const p = chartMeta.plot; if (!p) return 0;
  const coord = p.horiz ? vb.y : vb.x;
  const origin = p.horiz ? p.top : p.left;
  const span = p.horiz ? p.plotH : p.plotW;
  if (!span) return 0;
  return Math.max(0, Math.min(1, (coord - origin) / span));
}
// se TODOS os rótulos forem números, o X vira escala contínua (tooltip + label)
function numericXScale() {
  const vals = (spec.labels || []).map((l) => num(l));
  if (!vals.length || vals.some((v) => v == null)) return null;
  const min = Math.min(...vals), max = Math.max(...vals);
  if (!(max > min)) return null;
  return { min, max, vals };
}
function formatXNum(v) {
  if (!Number.isFinite(v)) return '';
  const a = Math.abs(v);
  if (a >= 1000 || (a > 0 && a < 0.01)) return +v.toPrecision(4);
  if (Number.isInteger(v)) return String(v);
  return +v.toPrecision(4);
}
// aplica arraste: valor sempre; posição livre no eixo só com Shift
// freePoints: NÃO tocam labels[]; pontos de categoria usam x.pos
function applyMarkDrag(vb, { freeX = false } = {}) {
  const v = roundNice(valueAt(vb), drag.axis);
  let xDisp = '';
  if (drag.free) {
    const fp = (spec.freePoints || []).find((p) => p.id === drag.freeId);
    if (!fp) return { v, xDisp: 'livre' };
    fp.data = Array.isArray(fp.data) ? [...fp.data] : [];
    while (fp.data.length < spec.series.length) fp.data.push(null);
    fp.data[drag.s] = v;
    if (freeX) fp.pos = +catFracAt(vb).toFixed(5);
    xDisp = 'livre';
    return { v, xDisp };
  }
  spec.series[drag.s].data[drag.i] = v;
  xDisp = spec.labels[drag.i] ?? '';
  if (freeX) {
    const frac = catFracAt(vb);
    spec.x = { ...(spec.x || {}), pos: { ...(spec.x?.pos || {}) } };
    spec.x.pos[drag.i] = +frac.toFixed(5);
    const xs = drag.xScale;
    if (xs) {
      const xv = xs.min + frac * (xs.max - xs.min);
      const span = xs.max - xs.min;
      const step = 10 ** Math.floor(Math.log10(span / 200));
      xDisp = formatXNum(Math.round(xv / step) * step);
    }
  }
  return { v, xDisp };
}
// tooltip do arraste: X + Y, com altura pra caber as 2 linhas
function paintDragTip(e, vb, v, xDisp) {
  const cat = xDisp ?? (spec.labels[drag.i] ?? '');
  const val = formatValue(v, formatOf(drag.axis));
  const horiz = !!chartMeta.plot?.horiz;
  // hbar: valor no eixo X, categorias no Y
  const rows = horiz
    ? [['X', val], ['Y', cat]]
    : [['X', cat], ['Y', val]];
  tip.innerHTML = rows.map(([k, t]) =>
    `<div class="tip-row"><span class="tip-k">${k}</span><span class="tip-v">${escTip(t)}</span></div>`
  ).join('');
  tip.hidden = false;
  tip.style.left = (e.clientX - vb.r.left) + 'px';
  tip.style.top = (e.clientY - vb.r.top) + 'px';
}

// tela → coordenadas do viewBox do SVG
function toViewBox(clientX, clientY) {
  const svg = out.querySelector('svg'); if (!svg) return null;
  const r = svg.getBoundingClientRect();
  return { x: (clientX - r.left) * (spec.width / r.width), y: (clientY - r.top) * (spec.height / r.height), r };
}
// nó do sankey sob o ponto (px do viewBox). A folga lateral existe porque a
// barra é fina: sem ela, pegar o nó vira mira de precisão.
function nodeZone(vb) {
  for (const nd of chartMeta.sankeyNodes || []) {
    if (vb.x >= nd.x - 8 && vb.x <= nd.x + nd.w + 8 && vb.y >= nd.y - 4 && vb.y <= nd.y + nd.h + 4) return nd;
  }
  return null;
}

// marca mais próxima do ponto (em px do viewBox), dentro do raio
function nearestMark(vx, vy) {
  let best = null, bd = 26 ** 2;
  for (const m of chartMeta.marks || []) {
    const d = (m.x - vx) ** 2 + (m.y - vy) ** 2;
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}
// rótulo mais próximo do ponto, numa lista (caixa do texto, com folga). Serve
// tanto pro eixo de categoria (catLabels) quanto pros ticks de valor (yTicks).
function nearestIn(list, vx, vy) {
  for (const c of list || []) {
    const w = c.w || 30, h = c.h || 13, px = h * 0.7, py = h * 0.9;
    const xL = c.anchor === 'end' ? c.cx - w : c.anchor === 'middle' ? c.cx - w / 2 : c.cx;
    if (vx >= xL - px && vx <= xL + w + px && vy >= c.cy - h - py && vy <= c.cy + py) return c;
  }
  return null;
}
// só busca rótulo na FAIXA do eixo (fora do plot) — senão a marca do ponto de
// valor ~0, colada no eixo, rouba o clique do rótulo. Categoria de um lado,
// ticks de valor do outro (invertido no hbar).
function labelZone(vb) {
  const p = chartMeta.plot; if (!p) return null;
  const catZone = p.horiz ? vb.x < p.left : vb.y > p.bottom;
  if (catZone) { const c = nearestIn(chartMeta.catLabels, vb.x, vb.y); if (c) return c; }
  const valZone = p.horiz ? vb.y > p.bottom : (vb.x < p.left || vb.x > p.right);   // y2 fica à direita
  if (valZone) { const y = nearestIn(chartMeta.yTicks, vb.x, vb.y); if (y) return y; }
  return null;
}
// input inline centrado no rótulo (compensa offset do SVG no framewrap + baseline)
function editLabel(c) {
  const svg = out.querySelector('svg'); if (!svg) return;
  const wrap = editLayer.parentElement; // .framewrap — posição do input é relativa a ele
  const wr = wrap.getBoundingClientRect();
  const sr = svg.getBoundingClientRect();
  const sx = sr.width / spec.width, sy = sr.height / spec.height;
  const ox = sr.left - wr.left, oy = sr.top - wr.top;
  const isY = c.axis === 'y' || c.axis === 'y2';
  const yObj = () => (c.axis === 'y2' ? (spec.y2 = spec.y2 || {}) : spec.y);
  const def = isY ? formatValue(c.value, formatOf(c.axis)) : '';
  const cur = isY ? (yObj().tickText?.[c.key] ?? def) : (spec.labels[c.i] ?? '');
  const tw = c.w || 40, th = c.h || 13;
  // caixa do texto a partir do anchor + baseline (SVG y = baseline)
  const boxL = c.anchor === 'end' ? c.cx - tw : c.anchor === 'middle' ? c.cx - tw / 2 : c.cx;
  const boxT = c.cy - th * 0.85;
  const centerX = boxL + tw / 2;
  const centerY = boxT + th / 2;
  const inp = document.createElement('input');
  inp.type = 'text'; inp.className = 'label-edit'; inp.value = cur;
  const wpx = Math.max(56, tw * sx + 20);
  inp.style.left = (ox + centerX * sx) + 'px';
  inp.style.top = (oy + centerY * sy) + 'px';
  inp.style.width = wpx + 'px';
  inp.style.fontSize = Math.max(11, th * sy) + 'px';
  if (isY) inp.style.textAlign = 'right';
  else if (c.anchor === 'middle') inp.style.textAlign = 'center';
  wrap.appendChild(inp);
  inp.focus(); inp.select();
  let done = false;
  const commit = (save) => {
    if (done) return; done = true;
    if (save && inp.value !== cur) {
      if (isY) {
        const yo = yObj();
        yo.tickText = yo.tickText || {};
        if (inp.value === def || inp.value === '') delete yo.tickText[c.key];
        else yo.tickText[c.key] = inp.value;
      } else {
        spec.labels[c.i] = inp.value;
      }
      sync(); pushHistory();
    }
    inp.remove();
  };
  inp.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); commit(true); }
    else if (e.key === 'Escape') { e.preventDefault(); commit(false); }
  });
  inp.addEventListener('blur', () => commit(true));
}
// escala/formato do eixo da marca arrastada (série pode morar no y2)
const scaleOf = (axis) => (axis === 'y2' && chartMeta.scale2 ? chartMeta.scale2 : chartMeta.scale);
const formatOf = (axis) => (axis === 'y2' && chartMeta.format2 ? chartMeta.format2 : chartMeta.format);
// pixel do viewBox → valor da série (desconta a base do que já foi empilhado)
function valueAt(vb) {
  const { plot } = chartMeta;
  const scale = scaleOf(drag.axis);
  const frac = plot.horiz ? (vb.x - plot.left) / plot.plotW : (plot.bottom - vb.y) / plot.plotH;
  // em log/symlog o pixel anda na curva, não no valor — interpolar linear aqui
  // faria o ponto largado pular pra outra ordem de grandeza
  const dom = scale.sym
    ? symlogInv(symlog(scale.dMin, scale.T) + frac * (symlog(scale.dMax, scale.T) - symlog(scale.dMin, scale.T)), scale.T)
    : scale.log
      ? 10 ** (Math.log10(scale.dMin) + frac * (Math.log10(scale.dMax) - Math.log10(scale.dMin)))
      : scale.dMin + frac * (scale.dMax - scale.dMin);
  return dom - drag.base;
}
// arredonda pra um passo "redondo" pela amplitude do eixo (nada de 47.31284%)
function roundNice(v, axis) {
  const sc = scaleOf(axis);
  // log/sym: passo fixo não serve — 0,01 e 10.000 convivem no mesmo eixo. Fixa
  // em 3 dígitos significativos, que é "redondo" em qualquer ordem de grandeza
  // (e em sym o sinal vem junto: -1,23 mil é tão válido quanto 1,23 mil).
  if (sc.log || sc.sym) return v === 0 ? 0 : +v.toPrecision(3);
  const span = sc.dMax - sc.dMin || 1;
  const step = 10 ** Math.floor(Math.log10(span / 200));
  return Math.round(v / step) * step;
}

editLayer.addEventListener('pointermove', (e) => {
  if (labelDrag) {   // arrastando um rótulo do eixo X: só desloca na horizontal, o dado não muda
    const vb0 = labelDrag.vb0;
    const dx = (e.clientX - labelDrag.startClientX) * (spec.width / vb0.r.width);
    const dy = (e.clientY - labelDrag.startClientY) * (spec.height / vb0.r.height);
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) labelDrag.moved = true;   // qualquer direção conta como "arrastou"
    if (labelDrag.moved) {
      spec.x = spec.x || {}; spec.x.offsets = spec.x.offsets || {};
      spec.x.offsets[labelDrag.i] = Math.round(labelDrag.startDx + dx);   // só o componente horizontal é aplicado
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; sync({ keepTable: true, keepJson: true }); });
    }
    return;
  }
  if (nodeDrag) {   // nó do sankey: só vertical, o horizontal é a etapa do fluxo
    const vb0 = nodeDrag.vb0;
    const dy = (e.clientY - nodeDrag.startY) * (spec.height / vb0.r.height);
    spec.nodeOffsets = { ...spec.nodeOffsets, [nodeDrag.n]: Math.round(nodeDrag.startOff + dy) };
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; sync({ keepTable: true, keepJson: true }); });
    return;
  }
  if (!drag) {   // hover: marca / rótulo / fantasmas de inserção
    const vb = toViewBox(e.clientX, e.clientY);
    const onLabel = !!(vb && labelZone(vb));
    const onMark = !!(vb && (nearestMark(vb.x, vb.y) || nodeZone(vb)));
    editLayer.classList.toggle('can-edit', onLabel);
    editLayer.classList.toggle('can-drag', !onLabel && onMark);
    let nextPointGhost = null, nextLabelGhost = null;
    if (editMode && vb && chartMeta.plot) {
      const p = chartMeta.plot;
      const inPlot = vb.x >= p.left && vb.x <= p.right && vb.y >= p.top && vb.y <= p.bottom;
      const inCat = p.horiz ? vb.x < p.left : vb.y > p.bottom;
      if (inPlot && !onMark && !onLabel) {
        const seg = nearestInsertSegment(vb);
        if (seg) nextPointGhost = { x: seg.x, y: seg.y, frac: seg.frac, left: seg.left, right: seg.right };
      }
      if (inCat && !onLabel) {
        const seg = nearestLabelSegment(vb);
        if (seg) nextLabelGhost = { x: seg.x, y: seg.y, insertAt: seg.insertAt, left: seg.left, right: seg.right };
      }
    }
    const sameP = insertGhost && nextPointGhost
      && Math.abs(insertGhost.x - nextPointGhost.x) < 0.5
      && Math.abs(insertGhost.y - nextPointGhost.y) < 0.5;
    const sameL = labelInsertGhost && nextLabelGhost
      && Math.abs(labelInsertGhost.x - nextLabelGhost.x) < 0.5
      && Math.abs(labelInsertGhost.y - nextLabelGhost.y) < 0.5;
    if (!sameP || !sameL || !!insertGhost !== !!nextPointGhost || !!labelInsertGhost !== !!nextLabelGhost) {
      insertGhost = nextPointGhost;
      labelInsertGhost = nextLabelGhost;
      const svg = out.querySelector('svg');
      if (svg) {
        svg.querySelectorAll('.edit-insert-ghost').forEach((el) => el.remove());
        const NS = 'http://www.w3.org/2000/svg';
        if (insertGhost) {
          const g = document.createElementNS(NS, 'circle');
          g.setAttribute('cx', insertGhost.x); g.setAttribute('cy', insertGhost.y);
          g.setAttribute('r', 7); g.setAttribute('class', 'edit-insert-ghost');
          svg.appendChild(g);
        }
        if (labelInsertGhost) {
          const g = document.createElementNS(NS, 'circle');
          g.setAttribute('cx', labelInsertGhost.x); g.setAttribute('cy', labelInsertGhost.y);
          g.setAttribute('r', 4); g.setAttribute('class', 'edit-insert-ghost');
          svg.appendChild(g);
        }
      }
    }
    return;
  }
  const vb = toViewBox(e.clientX, e.clientY);
  const { v, xDisp } = applyMarkDrag(vb, { freeX: e.shiftKey });
  paintDragTip(e, vb, v, xDisp);
  if (!raf) raf = requestAnimationFrame(() => { raf = 0; sync({ keepTable: true, keepJson: true }); repositionTip(); });
});
function repositionTip() {
  if (!drag) return;
  const key = drag.free ? `free:${drag.freeId}:${drag.s}` : `${drag.s}:${drag.i}`;
  const h = out.querySelector(`.edit-handle[data-mark="${key}"]`);
  if (h) h.classList.add('hot');
}

editLayer.addEventListener('pointerdown', (e) => {
  if (!editMode) return;
  const vb = toViewBox(e.clientX, e.clientY);
  if (!vb) return;
  const lbl = labelZone(vb);              // clicou na faixa do eixo
  if (lbl) {
    e.preventDefault();
    if (lbl.axis) { editLabel(lbl); return; }   // tick do eixo Y: renomeia direto, como já era
    // rótulo do eixo X: só decide clique (renomeia) vs arraste (reposiciona) no pointerup
    const startDx = (spec.x?.offsets || {})[lbl.i] || 0;
    labelDrag = { i: lbl.i, lbl, startClientX: e.clientX, startClientY: e.clientY, startDx, vb0: vb, moved: false };
    editLayer.setPointerCapture(e.pointerId);
    return;
  }
  const nd = nodeZone(vb);                // sankey: pegou um nó
  if (nd) {
    e.preventDefault();
    nodeDrag = { n: nd.n, startY: e.clientY, startOff: (spec.nodeOffsets || {})[nd.n] || 0, vb0: vb };
    editLayer.setPointerCapture(e.pointerId); editLayer.classList.add('dragging');
    return;
  }
  const m = nearestMark(vb.x, vb.y);
  if (m) {
    drag = {
      ...m,
      free: !!m.free,
      freeId: m.freeId || null,
      xScale: m.free ? null : numericXScale(),
    };
    editLayer.setPointerCapture(e.pointerId);
    editLayer.classList.add('dragging');
    paintDragTip(e, vb, m.value, m.free ? 'livre' : (spec.labels[m.i] ?? ''));
  }
});
// solta a captura só se ela ainda estiver ativa — o navegador pode já ter
// liberado sozinho (ex.: pointercancel), e chamar de novo lança NotFoundError
// e aborta o resto do endDrag (perderia o commit/histórico em silêncio)
const releaseCapture = (e) => { if (e && editLayer.hasPointerCapture?.(e.pointerId)) editLayer.releasePointerCapture(e.pointerId); };

function endDrag(e) {
  if (nodeDrag) {
    const nd = nodeDrag; nodeDrag = null;
    releaseCapture(e); editLayer.classList.remove('dragging');
    /* Regrava o deslocamento que DE FATO foi aplicado (o renderer corta o que
     * jogaria o nó pra fora da imagem). Sem isso, um arraste longo demais
     * deixava um offset gigante guardado — o nó parava na borda e voltar exigia
     * desfazer todo o excesso antes de ver qualquer movimento.
     *
     * O sync vem ANTES de ler: durante o arraste o desenho é atualizado dentro
     * de um requestAnimationFrame, então no momento do "soltar" o chartMeta
     * ainda pode ser o do quadro anterior — e aí o valor lido seria o de antes
     * do arraste (medido: gravava 0 e o nó não saía do lugar). */
    sync();
    const real = (chartMeta.sankeyNodes || []).find((x) => x.n === nd.n);
    if (real && Math.abs(real.offset - (spec.nodeOffsets?.[nd.n] ?? 0)) > 0.5) {
      spec.nodeOffsets = { ...spec.nodeOffsets, [nd.n]: Math.round(real.offset) };
      sync();
    }
    pushHistory();
    flash(`"${nd.n}" reposicionado. Zerar: apague nodeOffsets na spec.`);
    return;
  }
  if (labelDrag) {
    const ld = labelDrag; labelDrag = null;
    releaseCapture(e);
    if (!ld.moved) editLabel(ld.lbl);             // não arrastou: foi um clique → renomeia
    else { sync(); pushHistory(); flash('Rótulo reposicionado.'); }
    return;
  }
  if (!drag) return;
  drag = null; tip.hidden = true;
  editLayer.classList.remove('dragging');
  releaseCapture(e);
  sync();          // fecha atualizando planilha + JSON
  pushHistory();   // cada arraste vira um passo de undo
}
editLayer.addEventListener('pointerup', endDrag);
editLayer.addEventListener('pointercancel', endDrag);

// 2 cliques:
//  · no plot, entre 2 pontos → freePoint (NÃO mexe em labels / eixo X)
//  · na faixa do eixo X, entre 2 labels → nova categoria no eixo
editLayer.addEventListener('dblclick', (e) => {
  if (!editMode || !chartMeta.plot) return;
  if (spec.type === 'donut' || spec.type === 'pie' || spec.type === 'sankey' || spec.type === 'bubble') return;
  const vb = toViewBox(e.clientX, e.clientY);
  if (!vb) return;
  if (nearestMark(vb.x, vb.y)) return;

  const p = chartMeta.plot;
  const inCat = p.horiz ? vb.x < p.left : vb.y > p.bottom;
  const inPlot = vb.x >= p.left && vb.x <= p.right && vb.y >= p.top && vb.y <= p.bottom;

  // —— inserir rótulo no eixo X (entre 2 labels) ——
  if (inCat) {
    const seg = nearestLabelSegment(vb);
    if (!seg) { flash('2 cliques entre dois rótulos do eixo X.', true); return; }
    const { left, right, insertAt } = seg;
    const name = midLabel(spec.labels[left.i], spec.labels[right.i]) || '';
    spec.labels.splice(insertAt, 0, name);
    spec.series.forEach((se) => {
      const va = se.data[left.i], vb_ = se.data[right.i];
      const a = va != null ? va : (vb_ ?? 0);
      const b = vb_ != null ? vb_ : (va ?? 0);
      se.data.splice(insertAt, 0, roundNice((a + b) / 2));
    });
    reindexX(insertAt, +1);
    labelInsertGhost = null;
    sync(); pushHistory();
    flash('Rótulo adicionado no eixo X.');
    return;
  }

  // —— freePoint no meio da linha (eixo X intocado) ——
  if (!inPlot || spec.type === 'candle') return;
  const seg = nearestInsertSegment(vb);
  if (!seg) { flash('2 cliques entre dois pontos da linha.', true); return; }
  const { left, right, frac } = seg;
  // valor por série: interpola pelos vizinhos (categoria ou free)
  const valOf = (m, sIdx) => {
    if (m.free) {
      const fp = (spec.freePoints || []).find((p) => p.id === m.freeId);
      return fp?.data?.[sIdx];
    }
    return spec.series[sIdx]?.data?.[m.i];
  };
  const data = spec.series.map((_, sIdx) => {
    const va = valOf(left, sIdx), vb_ = valOf(right, sIdx);
    const a = va != null ? va : (vb_ ?? 0);
    const b = vb_ != null ? vb_ : (va ?? 0);
    return roundNice((a + b) / 2);
  });
  spec.freePoints = [...(spec.freePoints || []), { id: freePointId(), pos: +frac.toFixed(5), data }];
  insertGhost = null;
  sync(); pushHistory();
  flash('Ponto livre adicionado (eixo X intacto). Shift+arraste pra mover.');
});

// botão direito: rótulo X oculta/mostra · freePoint remove · marca de categoria remove coluna
editLayer.addEventListener('contextmenu', (e) => {
  if (!editMode) return;
  e.preventDefault();
  const vb = toViewBox(e.clientX, e.clientY);
  const lbl = labelZone(vb);
  if (lbl && !lbl.axis) {
    spec.x = spec.x || {}; spec.x.hidden = spec.x.hidden || [];
    const k = spec.x.hidden.indexOf(lbl.i);
    if (k >= 0) { spec.x.hidden.splice(k, 1); flash('Rótulo visível.'); }
    else { spec.x.hidden.push(lbl.i); flash('Rótulo oculto (valor mantido).'); }
    sync(); pushHistory();
    return;
  }
  const m = vb && nearestMark(vb.x, vb.y);
  if (!m) return;
  if (m.free) {
    spec.freePoints = (spec.freePoints || []).filter((p) => p.id !== m.freeId);
    sync(); pushHistory();
    flash('Ponto livre removido.');
    return;
  }
  if (spec.labels.length <= 2) return;   // mantém ao menos 2 categorias
  spec.labels.splice(m.i, 1);
  spec.series.forEach((se) => se.data.splice(m.i, 1));
  reindexX(m.i, -1);
  sync(); pushHistory();
  flash('Ponto removido.');
});

// erro fica mais tempo e em vermelho — status text normal (4s, cor discreta)
// já passou batido antes (erro sumia rápido e ninguém via)
let flashT;
function flash(msg, isError = false) {
  const el = $('status');
  el.textContent = msg;
  el.classList.toggle('err', isError);
  clearTimeout(flashT); flashT = setTimeout(() => { el.textContent = ''; el.classList.remove('err'); }, isError ? 8000 : 4000);
}

// ── expand/collapse animado dos <details> da sidebar (mesmo do Diagramador) ──
// Intercepta o click no <summary>, anima height+opacity do .body, chevron via
// .is-open (não espera [open] no close). Estado em LS sobrevive a reload.
const LS_SIDEBAR = 'paradigma.graficos.sidebarSecs';
const SIDEBAR_SEC_DEFAULTS = {
  dados: true, csv: true, tipo: true, tipoOpts: true, series: true,
  eixos: false, traco: false, textos: true, canvas: false, spec: false,
};
const DET_MS = 260;
const DET_EASE = 'cubic-bezier(.4, 0, .2, 1)';

function readSidebarSecs() {
  const out = {};
  document.querySelectorAll('aside details[data-sec]').forEach(d => {
    out[d.dataset.sec] = !!d.open;
  });
  return out;
}
function persistSidebarSecsNow() {
  try { localStorage.setItem(LS_SIDEBAR, JSON.stringify(readSidebarSecs())); } catch {}
}
function setDetailsOpen(det, open) {
  const body = det.querySelector(':scope > .body');
  const want = !!open;
  const reduced = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const setOpenClass = (on) => det.classList.toggle('is-open', on);

  if (!body || reduced) {
    det.open = want;
    setOpenClass(want);
    delete det.dataset.detDir;
    persistSidebarSecsNow();
    return;
  }
  if (typeof det._detCleanup === 'function') det._detCleanup();

  if (!!det.open === want) {
    setOpenClass(want);
    persistSidebarSecsNow();
    return;
  }

  const clearInline = () => {
    body.style.height = '';
    body.style.opacity = '';
    body.style.overflow = '';
    body.style.transition = '';
    det.classList.remove('sb-det-animating');
    det._detCleanup = null;
  };

  setOpenClass(want);

  if (want) {
    det.dataset.detDir = 'open';
    det.open = true;
    det.classList.add('sb-det-animating');
    body.style.overflow = 'hidden';
    body.style.opacity = '0';
    body.style.height = '0px';
    const h = body.scrollHeight;
    void body.offsetHeight;
    body.style.transition = `height ${DET_MS}ms ${DET_EASE}, opacity ${Math.round(DET_MS * 0.85)}ms ease`;
    body.style.height = h + 'px';
    body.style.opacity = '1';
    let tid = 0;
    const finish = () => {
      body.removeEventListener('transitionend', onEnd);
      clearTimeout(tid);
      delete det.dataset.detDir;
      clearInline();
      persistSidebarSecsNow();
    };
    const onEnd = (e) => {
      if (e.target !== body) return;
      if (e.propertyName !== 'height' && e.propertyName !== 'opacity') return;
      finish();
    };
    body.addEventListener('transitionend', onEnd);
    tid = setTimeout(finish, DET_MS + 40);
    det._detCleanup = () => {
      body.removeEventListener('transitionend', onEnd);
      clearTimeout(tid);
      delete det.dataset.detDir;
      clearInline();
    };
  } else {
    det.dataset.detDir = 'close';
    det.classList.add('sb-det-animating');
    body.style.overflow = 'hidden';
    body.style.opacity = '1';
    body.style.height = body.scrollHeight + 'px';
    void body.offsetHeight;
    body.style.transition = `height ${DET_MS}ms ${DET_EASE}, opacity ${Math.round(DET_MS * 0.85)}ms ease`;
    body.style.height = '0px';
    body.style.opacity = '0';
    let tid = 0;
    const finish = () => {
      body.removeEventListener('transitionend', onEnd);
      clearTimeout(tid);
      det.open = false;
      delete det.dataset.detDir;
      clearInline();
      persistSidebarSecsNow();
    };
    const onEnd = (e) => {
      if (e.target !== body) return;
      if (e.propertyName !== 'height' && e.propertyName !== 'opacity') return;
      finish();
    };
    body.addEventListener('transitionend', onEnd);
    tid = setTimeout(finish, DET_MS + 40);
    det._detCleanup = () => {
      body.removeEventListener('transitionend', onEnd);
      clearTimeout(tid);
      det.open = false;
      delete det.dataset.detDir;
      clearInline();
    };
  }
}
function initSidebarDetails() {
  let saved = null;
  try {
    const raw = JSON.parse(localStorage.getItem(LS_SIDEBAR));
    if (raw && typeof raw === 'object') saved = raw;
  } catch {}

  document.querySelectorAll('aside details[data-sec]').forEach(det => {
    const id = det.dataset.sec;
    const open = (saved && Object.prototype.hasOwnProperty.call(saved, id))
      ? !!saved[id]
      : !!SIDEBAR_SEC_DEFAULTS[id];
    det.open = open;
    det.classList.toggle('is-open', open);

    const sum = det.querySelector(':scope > summary');
    if (!sum) return;
    // ion-icon name="chevron-forward-outline" — gira 90° com .is-open
    if (!sum.querySelector('.det-chev')) {
      const chev = document.createElement('span');
      chev.className = 'det-chev';
      chev.setAttribute('aria-hidden', 'true');
      chev.innerHTML = uiIco('chevron-forward', 12, 'outline');
      sum.prepend(chev);
    }
    sum.addEventListener('click', (e) => {
      // ⓘ / badge: não toggle (reforço; o botão já tem preventDefault próprio)
      if (e.target.closest('.infoicon') || e.target.closest('.sec-badge')) return;
      e.preventDefault();
      const dir = det.dataset.detDir;
      const next = dir === 'open' ? false : dir === 'close' ? true : !det.open;
      setDetailsOpen(det, next);
    });
  });

  // ion-icon name="information-circle-outline" + não borbulha pro <summary>
  document.querySelectorAll('aside .infoicon').forEach((btn) => {
    if (!btn.querySelector('svg')) btn.innerHTML = uiIco('information-circle', 14, 'outline');
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
  });
}

// ── sidebar recolhível (menu-outline) — slide width, igual Diagramador ───────
const btnSidebar = document.getElementById('btnSidebar');
const mainEl = document.querySelector('main');
const sidebarEl = document.getElementById('sidebar');
if (btnSidebar && mainEl && sidebarEl) {
  btnSidebar.innerHTML = uiIco('menu', 18, 'outline');
  btnSidebar.addEventListener('click', () => {
    const open = btnSidebar.getAttribute('aria-pressed') !== 'true';
    btnSidebar.setAttribute('aria-pressed', String(open));
    mainEl.classList.toggle('sidebar-collapsed', !open);
    btnSidebar.title = open ? 'Esconder o menu' : 'Mostrar o menu';
    // inert quando fechado: não entra no tab order nem recebe clique sob o clip
    if (open) sidebarEl.removeAttribute('inert');
    else sidebarEl.setAttribute('inert', '');
  });
}

// ── start ────────────────────────────────────────────────────────────────────
initAppNav(); // título do header → menu entre ferramentas
initFeedback(); // botão Reportar → issue no GitHub (prefill)
initSidebarDetails(); // chevron + expand animado + borda full-bleed
enhanceAll();   // ticks + ímã nos range com data-snaps (não mexe em defaults)
fillControls();
buildSeries();
sync();
pushHistory();   // baseline do undo
