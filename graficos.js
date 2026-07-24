/* Editor de gráficos — liga os controles ao renderer puro (chart.js). */
import { renderChart, DEFAULTS, THEMES, formatValue } from './chart.js';
import { parseTable, toTable } from './tabela.js';
import { parseChartHtml } from './importar-html.js';
import { buildSpecFromImage } from './converter.js';
import { openSwatchPop } from './swatch.js';   // componente de cor compartilhado
import { logoPickSvg } from './logos.js';      // SVG do logo pro picker (Fase 0.3, trilha B)

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
  drawHandles();
  if (ghostUrl && $('ghostOn').checked) positionGhost();   // realinha a sobreposição
  $('dims').textContent = `${spec.width} × ${spec.height} px  →  PNG ${spec.width * +$('scale').value} × ${spec.height * +$('scale').value}`;
  if (!keepJson) $('json').value = JSON.stringify(spec, null, 2);
  if (!keepTable) $('tsv').value = toTable(spec);
}

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
    c.setAttribute('class', 'edit-handle'); c.dataset.mark = `${m.s}:${m.i}`;
    svg.appendChild(c);
  }
  // rótulo oculto: marca fantasma no lugar dele, só pra achar e clicar de novo
  // (reativar ou arrastar) — o dado real não depende disso, é só um achado.
  for (const c of chartMeta.catLabels || []) {
    if (!c.hidden) continue;
    const g = document.createElementNS(NS, 'circle');
    g.setAttribute('cx', c.cx); g.setAttribute('cy', c.cy); g.setAttribute('r', 3);
    g.setAttribute('class', 'edit-handle-ghost');
    svg.appendChild(g);
  }
}

// ── segmento Dados: Imagem / Corretora / HTML (mesmo padrão da diagramação) ───
const dataSegBtns = [...document.querySelectorAll('#dataSegment button')];
function setDataSegment(name) {
  dataSegBtns.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.seg === name)));
  document.querySelectorAll('.pane').forEach((p) => { p.hidden = p.dataset.pane !== name; });
}
dataSegBtns.forEach((b) => b.addEventListener('click', () => {
  setDataSegment(b.dataset.seg);
  if (b.dataset.seg === 'corretora') loadSymbols($('cdVenue').value);   // carrega só quando a aba abre
}));
setDataSegment('imagem');

// ── controles ────────────────────────────────────────────────────────────────
const bindText = (id, path) => $(id).addEventListener('input', (e) => { set(path, e.target.value); sync({ keepTable: true }); });
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
}

// switches de mostrar título/subtítulo/fonte no gráfico
[['showTitle', 'title'], ['showSubtitle', 'subtitle'], ['showSource', 'source']].forEach(([id, key]) => {
  $(id).addEventListener('click', () => {
    spec.show[key] = !spec.show[key];
    $(id).setAttribute('aria-checked', spec.show[key]);
    sync({ keepTable: true });
  });
});
// logo da Paradigma: picker + posição + região/lado + cor + sliders
const wmDefaultOpacity = (pos) => (pos === 'center' ? 0.08 : 1);   // centro faded, canto opaco
function setWm(patch) {
  spec.watermark = { ...DEFAULTS.watermark, ...spec.watermark, ...patch };
  paintWatermark(); sync({ keepTable: true });
}
$('wmPicker').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-logo]'); if (!b) return;
  const wasOff = (spec.watermark?.logo ?? 'none') === 'none';
  const patch = { logo: b.dataset.logo };
  // ao ligar, semeia a opacidade com o padrão da posição atual
  if (wasOff && b.dataset.logo !== 'none') patch.opacity = wmDefaultOpacity(spec.watermark?.pos ?? 'footer');
  setWm(patch);
});
// troca o rótulo de texto ("Ícone"/"Completo"/"Nome") pelo SVG real do logo — uma vez, no
// load (o desenho não depende do spec). "Nenhum" fica como texto: não há logo pra desenhar.
// currentColor do path herda o color do próprio botão (.typepick button), então acompanha
// --muted/hover/[aria-pressed] de graça, sem CSS extra.
['icone', 'full', 'nome'].forEach((kind) => {
  const b = $('wmPicker').querySelector(`button[data-logo="${kind}"]`);
  if (b) b.innerHTML = logoPickSvg(kind);
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
// — candle: cores de alta/baixa e espessura do pavio —
// up/down guardam null enquanto o usuário não escolhe: aí a cor sai do tema e
// acompanha claro↔escuro. O swatch mostra a cor resolvida (nunca "vazio").
const candleCfg = () => ({ ...DEFAULTS.candle, ...spec.candle });
const candleColor = (k) => candleCfg()[k] || (THEMES[spec.theme] || THEMES.dark).series[k === 'up' ? 1 : 4];
// sem pushHistory aqui: o pavio é input numérico e gravaria um passo de undo por
// tecla — mesmo tratamento que os sliders de traço/ponto e que o logo (setWm)
const setCandle = (patch) => { spec.candle = { ...candleCfg(), ...patch }; paintCandle(); sync({ keepTable: true }); };
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
const setBarTrack = (patch) => { spec.barTrack = { ...barTrackCfg(), ...patch }; sync({ keepTable: true }); };
$('barRadius').addEventListener('input', (e) => {
  spec.barRadius = +e.target.value; $('brVal').textContent = spec.barRadius + ' px'; sync({ keepTable: true });
});
$('barGap').addEventListener('input', (e) => {
  spec.barGap = +e.target.value; $('bgVal').textContent = Math.round(spec.barGap * 100) + '%'; sync({ keepTable: true });
});
$('btShow').addEventListener('change', (e) => setBarTrack({ show: e.target.checked }));
$('btOpacity').addEventListener('input', (e) => {
  $('btOpVal').textContent = e.target.value + '%'; setBarTrack({ opacity: +e.target.value / 100 });
});
$('btScale').addEventListener('input', (e) => {
  $('btScaleVal').textContent = e.target.value + '%'; setBarTrack({ scale: +e.target.value / 100 });
});
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
}

$('theme').addEventListener('change', (e) => {
  const from = THEMES[spec.theme].series, to = THEMES[e.target.value].series;
  // cor segue a entidade: remapeia só quem estava num slot padrão
  spec.series.forEach((s) => { const i = from.indexOf(s.color); if (i >= 0) s.color = to[i]; });
  spec.theme = e.target.value;
  buildSeries(); paintCandle(); sync({ keepTable: true });   // swatch mostra a cor do tema novo
});

[['yformat', 'y.format'], ['yside', 'y.side'], ['labelMode', 'labelMode'], ['grid', 'grid'], ['legend', 'legend']]
  .forEach(([id, path]) => $(id).addEventListener('change', (e) => {
    set(path, e.target.value);
    // usd/brl/pct já trazem o símbolo — prefixo/sufixo manual duplicaria ("US$ US$")
    if (id === 'yformat' && ['usd', 'brl', 'pct'].includes(e.target.value)) {
      spec.y.prefix = ''; spec.y.suffix = ''; $('yprefix').value = ''; $('ysuffix').value = '';
    }
    sync({ keepTable: true });
  }));

[['ymin', 'y.min'], ['ymax', 'y.max']].forEach(([id, path]) =>
  $(id).addEventListener('input', (e) => { set(path, e.target.value === '' ? null : +e.target.value); sync({ keepTable: true }); }));

$('xevery').addEventListener('input', (e) => { spec.x.every = Math.max(1, +e.target.value || 1); sync({ keepTable: true }); });

[['strokeWidth', 'swVal', (v) => v + ' px'], ['dotSize', 'dotVal', (v) => (+v ? v + ' px' : 'off')], ['fontScale', 'fsVal', (v) => v + '×']]
  .forEach(([id, out_, fmt]) => $(id).addEventListener('input', (e) => {
    spec[id] = +e.target.value; $(out_).textContent = fmt(e.target.value); sync({ keepTable: true });
  }));

['smooth', 'transparent'].forEach((id) =>
  $(id).addEventListener('change', (e) => { spec[id] = e.target.checked; sync({ keepTable: true }); }));

['width', 'height'].forEach((id) =>
  $(id).addEventListener('input', (e) => { spec[id] = +e.target.value || DEFAULTS[id]; sync({ keepTable: true }); }));

$('scale').addEventListener('change', () => sync({ keepTable: true, keepJson: true }));

$('tsv').addEventListener('input', (e) => {
  const t = parseTable(e.target.value);
  if (!t) return;
  spec.labels = t.labels;
  spec.series = t.series.map((s, i) => ({ ...spec.series[i], ...s }));
  buildSeries(); sync({ keepTable: true });
});

$('btnApply').addEventListener('click', () => {
  try { spec = { ...structuredClone(DEFAULTS), ...JSON.parse($('json').value) }; }
  catch (err) { return flash('JSON inválido: ' + err.message, true); }
  fillControls(); buildSeries(); sync();
});
$('btnCopy').addEventListener('click', async () => {
  await navigator.clipboard.writeText(JSON.stringify(spec, null, 2)); flash('Spec copiada.');
});

// cores NOMEADAS (marca + tokens de ativos). 🤔 Strategy/HYPE/XRP são estimativas
// (não achei hex de marca confirmado) — trocar aqui se vierem os oficiais.
// lista de séries (cor via swatch, nome, tracejado via switch)
function buildSeries() {
  const t = THEMES[spec.theme];
  $('series').innerHTML = '';
  spec.series.forEach((s, i) => {
    const color = s.color || t.series[i % t.series.length];
    const row = document.createElement('div');
    row.className = 'serie';

    const sw = document.createElement('button');
    sw.type = 'button'; sw.className = 'swatch'; sw.title = 'Cor da série';
    sw.style.background = color;
    sw.onclick = () => openSwatchPop(sw, (hex) => { s.color = hex; buildSeries(); sync({ keepTable: true }); }, color);

    const name = document.createElement('input');
    name.type = 'text'; name.className = 'sname'; name.value = s.name ?? ''; name.setAttribute('aria-label', 'Nome da série');
    name.oninput = () => { s.name = name.value; sync({ keepTable: true }); };

    // o switch é MOSTRAR/ESCONDER a série (o estilo do traço virou o dropdown
    // abaixo). Esconder não apaga: o dado continua na spec e no CSV.
    const vis = document.createElement('button');
    vis.type = 'button'; vis.className = 'lblswitch'; vis.setAttribute('role', 'switch');
    vis.setAttribute('aria-checked', !s.hidden); vis.title = 'Mostrar a série no gráfico';
    vis.onclick = () => {
      if (s.hidden) delete s.hidden; else s.hidden = true;
      vis.setAttribute('aria-checked', !s.hidden);
      row.classList.toggle('off', !!s.hidden);
      sync({ keepTable: true });
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
        sel.onchange = () => { set(sel.value); sync({ keepTable: true }); };
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
}

function fillControls() {
  const v = { ...spec, yformat: spec.y.format, ymin: spec.y.min ?? '', ymax: spec.y.max ?? '', ytitle: spec.y.title ?? '',
    yprefix: spec.y.prefix ?? '', ysuffix: spec.y.suffix ?? '', xevery: spec.x.every, yside: spec.y.side ?? 'left' };
  for (const id of ['theme', 'title', 'subtitle', 'source', 'yformat', 'yside', 'labelMode', 'grid', 'legend',
    'ymin', 'ymax', 'ytitle', 'yprefix', 'ysuffix', 'xevery', 'strokeWidth', 'dotSize', 'fontScale', 'width', 'height']) {
    if ($(id)) $(id).value = v[id];
  }
  $('smooth').checked = spec.smooth; $('transparent').checked = spec.transparent;
  $('swVal').textContent = spec.strokeWidth + ' px';
  $('dotVal').textContent = spec.dotSize ? spec.dotSize + ' px' : 'off';
  $('fsVal').textContent = spec.fontScale + '×';
  paintTypePicker();
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

$('btnPng').addEventListener('click', async () => {
  flash('Gerando PNG…');
  try {
    download(await toPng(spec, +$('scale').value), `${slug(spec.title)}.png`);
    flash('PNG baixado.');
  } catch (e) { flash('Falhou: ' + e.message, true); }
});

$('btnSvg').addEventListener('click', async () => {
  try {
    download(new Blob([await svgString(spec)], { type: 'image/svg+xml' }), `${slug(spec.title)}.svg`);
    flash('SVG baixado (fonte embutida).');
  } catch (e) { flash('Falhou: ' + e.message, true); }
});

$('btnCsv').addEventListener('click', () => {
  download(new Blob([toTable(spec)], { type: 'text/csv;charset=utf-8' }), `${slug(spec.title)}.csv`);
  flash('CSV baixado.');
});

// ── modo embutido (iframe da Diagramação): importa o SVG direto pro relatório ──
if (new URLSearchParams(location.search).has('embed')) {
  const b = document.createElement('button');
  b.id = 'btnImport'; b.className = 'primary'; b.textContent = 'Importar para o relatório →';
  document.querySelector('header nav').prepend(b);
  b.addEventListener('click', async () => {
    flash('Gerando SVG…');
    try {
      const svg = await svgString(spec);
      parent.postMessage({ type: 'pdgm-chart-svg', svg, title: spec.title, w: spec.width, h: spec.height }, location.origin);
      flash('Importado.');
    } catch (e) { flash('Falhou: ' + e.message, true); }
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
  const tick = () => { ov.querySelector('#iaTimer').textContent = `${Math.round((Date.now() - t0) / 1000)}s · pode levar até 1 min`; };
  tick();
  return setInterval(tick, 1000);   // cronômetro ao vivo
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
    hideChat();   // dados de API, não de imagem — o chat da extração não se aplica
    flash(`${rows.length} candles de ${shownSymbol(symbol)}.`);
  } catch (e) {
    flash('Candles: ' + e.message, true);
  } finally {
    btn.disabled = false; btn.textContent = 'Buscar candles';
  }
});
function exitEditIfOn() { if (editMode) exitEdit(); }

// ── Importar de HTML/SVG: reconstrói a spec do markup colado (sem IA) ─────────
$('btnImportHtml').addEventListener('click', () => {
  const html = $('htmlIn').value.trim();
  if (!html) return flash('Cole o HTML do elemento primeiro.', true);
  let partial;
  try { partial = parseChartHtml(html); }
  catch (err) { return flash('Não deu: ' + err.message, true); }
  if (!partial || !partial.series?.length) return flash('Não achei gráfico nem tabela nesse HTML.', true);
  spec = { ...structuredClone(DEFAULTS), ...partial };
  const datou = datarX();                     // se as datas já estiverem preenchidas
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
    spec = { ...structuredClone(DEFAULTS), ...specIn };
    if (spec.series?.length) spec.x.every = Math.max(spec.x.every || 1, Math.ceil((spec.labels?.length || spec.series[0].data.length) / 12));
    fillControls(); buildSeries(); sync();
    $('ghostOn').checked = true; applyGhost();   // sobrepõe pra conferir na hora
    $('iaOverlay').hidden = true;
    enterEdit();                                 // já entra no modo de edição
    pushHistory();
    iaSession = j.sessionId || null;             // habilita o chat com a mesma sessão
    if (iaSession) showChat('Extração pronta. Me peça pra corrigir algum dado, rótulo ou o título — reexamino a imagem.');
    else hideChat();
    flash(`Pronto — ${(j.ms / 1000).toFixed(0)}s${j.cost ? `, ~US$ ${j.cost.toFixed(3)}` : ''}`
      + (rep ? ` · ${rep.pontos} pontos por pixel, cobertura ${rep.series[0].cobertura}%` : '')
      + '. Arraste os pontos pra ajustar.');
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
  const timer = setInterval(() => { pending.textContent = `pensando… ${Math.round((Date.now() - t0) / 1000)}s`; }, 500);
  $('iaSend').disabled = $('iaMsg').disabled = true;
  const ctrl = new AbortController();
  const kill = setTimeout(() => ctrl.abort(), 180000);   // teto de 3 min: nunca trava pra sempre
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
    pending.textContent = `✓ atualizado (${((j.ms || 0) / 1000).toFixed(0)}s)`;
  } catch (e) {
    pending.classList.remove('pending'); pending.classList.add('err');
    pending.textContent = e.name === 'AbortError' ? '✗ demorou demais (>3 min) — tente de novo ou recarregue a página'
      : /Failed to fetch|NetworkError/.test(e.message) ? '✗ servidor de IA fora do ar — rode node server.mjs no terminal'
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

// arrastar uma imagem pra janela também converte
const drop = $('drop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault(); drop.classList.remove('over');
  const f = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
  if (f) convertImage(f);
});

// ── modo edição: escala fixa, alças, add/remove, undo/redo ────────────────────
let priorBounds = null;
$('editToggle').addEventListener('click', () => (editMode ? exitEdit() : enterEdit()));

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
  $('editToggle').classList.add('on'); $('editToggle').textContent = '✓ Editando';
  editLayer.classList.add('on');
  ['undo', 'redo', 'editHint'].forEach((id) => ($(id).hidden = false));
  fillControls(); sync(); updateUndoBtns();
}
function exitEdit() {
  editMode = false;
  if (priorBounds) {
    spec.y.min = priorBounds.min; spec.y.max = priorBounds.max;
    if (spec.y2 && 'min2' in priorBounds) { spec.y2.min = priorBounds.min2; spec.y2.max = priorBounds.max2; }
    priorBounds = null;
  }
  $('editToggle').classList.remove('on'); $('editToggle').textContent = '✎ Editar';
  editLayer.classList.remove('on', 'can-drag');
  ['undo', 'redo', 'editHint'].forEach((id) => ($(id).hidden = true));
  fillControls(); sync();
}

// histórico (undo/redo) — snapshot do spec inteiro
let history = [], hidx = -1;
function pushHistory() {
  history = history.slice(0, hidx + 1);
  history.push(JSON.stringify(spec));
  if (history.length > 60) history.shift();
  hidx = history.length - 1;
  updateUndoBtns();
}
function restoreHistory() {
  spec = JSON.parse(history[hidx]);
  fillControls(); buildSeries(); sync();
  updateUndoBtns();
}
function updateUndoBtns() { $('undo').disabled = hidx <= 0; $('redo').disabled = hidx >= history.length - 1; }
$('undo').addEventListener('click', () => { if (hidx > 0) { hidx--; restoreHistory(); } });
$('redo').addEventListener('click', () => { if (hidx < history.length - 1) { hidx++; restoreHistory(); } });
addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey) || /input|textarea/i.test(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === 'z') { e.preventDefault(); (e.shiftKey ? $('redo') : $('undo')).click(); }
  else if (k === 'y') { e.preventDefault(); $('redo').click(); }
});

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
// próxima, converte o pixel de volta pra valor e re-renderiza. Vertical:
// line/area/bar/stacked. Horizontal: hbar. Donut edita pela planilha.
const editLayer = $('editLayer'), tip = $('dragTip');
let drag = null, raf = 0;
let labelDrag = null;   // { i, lbl, startClientX, startClientY, startDx, moved } — só horizontal

// depois de inserir (delta=+1, at=índice novo) ou remover (delta=-1, at=índice
// removido) um ponto, realinha os índices guardados em x.hidden/x.offsets —
// senão "oculto no índice 5" passa a apontar pro ponto errado.
function reindexX(at, delta) {
  if (!spec.x) return;
  const shift = (i) => (delta > 0 ? (i >= at ? i + 1 : i) : (i > at ? i - 1 : i));
  if (Array.isArray(spec.x.hidden)) spec.x.hidden = spec.x.hidden.filter((i) => delta > 0 || i !== at).map(shift);
  if (spec.x.offsets) {
    const o = {};
    for (const k in spec.x.offsets) {
      const i = +k;
      if (delta < 0 && i === at) continue;
      o[shift(i)] = spec.x.offsets[k];
    }
    spec.x.offsets = o;
  }
}

// tela → coordenadas do viewBox do SVG
function toViewBox(clientX, clientY) {
  const svg = out.querySelector('svg'); if (!svg) return null;
  const r = svg.getBoundingClientRect();
  return { x: (clientX - r.left) * (spec.width / r.width), y: (clientY - r.top) * (spec.height / r.height), r };
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
// input inline por cima do rótulo pra renomear. Serve pro eixo X (spec.labels[i])
// e pros ticks do eixo Y (override em spec.y.tickText[valor]).
function editLabel(c) {
  const svg = out.querySelector('svg'); if (!svg) return;
  const r = svg.getBoundingClientRect();
  const sx = r.width / spec.width, sy = r.height / spec.height;
  const isY = c.axis === 'y' || c.axis === 'y2';
  const yObj = () => (c.axis === 'y2' ? (spec.y2 = spec.y2 || {}) : spec.y);
  const def = isY ? formatValue(c.value, formatOf(c.axis)) : '';
  const cur = isY ? (yObj().tickText?.[c.key] ?? def) : (spec.labels[c.i] ?? '');
  const inp = document.createElement('input');
  inp.type = 'text'; inp.className = 'label-edit'; inp.value = cur;
  const wpx = Math.max(70, (c.w || 40) * sx + 24);
  inp.style.left = ((c.anchor === 'end' ? c.cx * sx - wpx : c.anchor === 'middle' ? c.cx * sx - wpx / 2 : c.cx * sx)) + 'px';
  inp.style.top = (c.cy * sy) + 'px';
  inp.style.width = wpx + 'px';
  if (isY) inp.style.textAlign = 'right';
  editLayer.parentElement.appendChild(inp);
  inp.focus(); inp.select();
  let done = false;
  const commit = (save) => {
    if (done) return; done = true;
    if (save && inp.value !== cur) {
      if (isY) {
        const yo = yObj();
        yo.tickText = yo.tickText || {};
        if (inp.value === def || inp.value === '') delete yo.tickText[c.key];   // volta ao automático
        else yo.tickText[c.key] = inp.value;
      } else {
        spec.labels[c.i] = inp.value;
      }
      sync(); pushHistory();
    }
    inp.remove();
  };
  inp.addEventListener('keydown', (e) => {
    e.stopPropagation();   // atalhos globais (⌘Z etc.) não roubam a digitação
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
  const dom = scale.dMin + frac * (scale.dMax - scale.dMin);
  return dom - drag.base;
}
// arredonda pra um passo "redondo" pela amplitude do eixo (nada de 47.31284%)
function roundNice(v, axis) {
  const sc = scaleOf(axis);
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
  if (!drag) {   // hover: mostra que dá pra pegar (ponto) ou renomear (rótulo)
    const vb = toViewBox(e.clientX, e.clientY);
    const onLabel = !!(vb && labelZone(vb));
    editLayer.classList.toggle('can-edit', onLabel);
    editLayer.classList.toggle('can-drag', !onLabel && !!(vb && nearestMark(vb.x, vb.y)));
    return;
  }
  const vb = toViewBox(e.clientX, e.clientY);
  const v = roundNice(valueAt(vb), drag.axis);
  spec.series[drag.s].data[drag.i] = v;
  tip.hidden = false;
  tip.textContent = formatValue(v, formatOf(drag.axis));
  tip.style.left = (e.clientX - vb.r.left) + 'px';
  tip.style.top = (e.clientY - vb.r.top) + 'px';
  if (!raf) raf = requestAnimationFrame(() => { raf = 0; sync({ keepTable: true, keepJson: true }); repositionTip(); });
});
function repositionTip() { const h = out.querySelector(`.edit-handle[data-mark="${drag.s}:${drag.i}"]`); if (h) h.classList.add('hot'); }

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
  const m = nearestMark(vb.x, vb.y);
  if (m) { drag = m; editLayer.setPointerCapture(e.pointerId); editLayer.classList.add('dragging'); }
});
// solta a captura só se ela ainda estiver ativa — o navegador pode já ter
// liberado sozinho (ex.: pointercancel), e chamar de novo lança NotFoundError
// e aborta o resto do endDrag (perderia o commit/histórico em silêncio)
const releaseCapture = (e) => { if (e && editLayer.hasPointerCapture?.(e.pointerId)) editLayer.releasePointerCapture(e.pointerId); };

function endDrag(e) {
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

// adicionar ponto: 2 cliques no gráfico inserem uma coluna (rótulo + valor
// interpolado em cada série); depois é só arrastar
editLayer.addEventListener('dblclick', (e) => {
  if (!editMode || !chartMeta.plot || spec.type === 'donut') return;
  const vb = toViewBox(e.clientX, e.clientY);
  const p = chartMeta.plot;
  const n = spec.labels.length;
  const span = (spec.type === 'line' || spec.type === 'area') ? n - 1 : n;
  const idx = Math.max(0, Math.min(n, Math.round(((vb.x - p.left) / p.plotW) * span + 0.5)));
  spec.labels.splice(idx, 0, midLabel(spec.labels[idx - 1], spec.labels[idx]));
  spec.series.forEach((se) => {
    const a = se.data[idx - 1] ?? se.data[idx] ?? 0, b = se.data[idx] ?? se.data[idx - 1] ?? 0;
    se.data.splice(idx, 0, roundNice((a + b) / 2));
  });
  reindexX(idx, +1);
  sync(); pushHistory();
  flash('Ponto adicionado.');
});

// botão direito: em cima de um RÓTULO do eixo X alterna oculto/visível (o
// dado continua intacto); em cima de uma MARCA (ponto/barra) remove a coluna
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
  if (!m || spec.labels.length <= 2) return;   // mantém ao menos 2 pontos
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

// ── start ────────────────────────────────────────────────────────────────────
fillControls();
buildSeries();
sync();
pushHistory();   // baseline do undo
