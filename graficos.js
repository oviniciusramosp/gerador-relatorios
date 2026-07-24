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
  if (!svg || !chartMeta.marks) return;
  const NS = 'http://www.w3.org/2000/svg';
  for (const m of chartMeta.marks) {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', m.x); c.setAttribute('cy', m.y); c.setAttribute('r', 7);
    c.setAttribute('class', 'edit-handle'); c.dataset.mark = `${m.s}:${m.i}`;
    svg.appendChild(c);
  }
}

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
  spec.type = b.dataset.type;
  paintTypePicker();
  sync({ keepTable: true });
});
function paintTypePicker() {
  $('typePicker').querySelectorAll('button').forEach((b) =>
    b.setAttribute('aria-pressed', b.dataset.type === spec.type));
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
const wmDefaultOpacity = (pos) => (pos === 'center' ? 0.1 : 1);   // centro faded, canto opaco
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
  buildSeries(); sync({ keepTable: true });
});

[['yformat', 'y.format'], ['labelMode', 'labelMode'], ['grid', 'grid'], ['legend', 'legend']]
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
  catch (err) { return flash('JSON inválido: ' + err.message); }
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

    const dash = document.createElement('button');
    dash.type = 'button'; dash.className = 'lblswitch'; dash.setAttribute('role', 'switch');
    dash.setAttribute('aria-checked', !!s.dashed); dash.title = 'Linha tracejada';
    dash.onclick = () => { s.dashed = !s.dashed; dash.setAttribute('aria-checked', s.dashed); sync({ keepTable: true }); };

    row.append(sw, name, dash);

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
      );
      row.append(opts);
    }
    $('series').append(row);
  });
}

function fillControls() {
  const v = { ...spec, yformat: spec.y.format, ymin: spec.y.min ?? '', ymax: spec.y.max ?? '', ytitle: spec.y.title ?? '',
    yprefix: spec.y.prefix ?? '', ysuffix: spec.y.suffix ?? '', xevery: spec.x.every };
  for (const id of ['theme', 'title', 'subtitle', 'source', 'yformat', 'labelMode', 'grid', 'legend',
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
const fontDataUri = () => (fontPromise ??= fetch('fonts/IBMPlexSans-Var.ttf')
  .then((r) => { if (!r.ok) throw new Error('fonte não encontrada (sirva a pasta por http, não file://)'); return r.blob(); })
  .then((b) => new Promise((res, rej) => {
    const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b);
  })));

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
  } catch (e) { flash('Falhou: ' + e.message); }
});

$('btnSvg').addEventListener('click', async () => {
  try {
    download(new Blob([await svgString(spec)], { type: 'image/svg+xml' }), `${slug(spec.title)}.svg`);
    flash('SVG baixado (fonte embutida).');
  } catch (e) { flash('Falhou: ' + e.message); }
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
    } catch (e) { flash('Falhou: ' + e.message); }
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

// ── Candles por API (Binance/Hyperliquid): ativo + datas → gráfico candle ─────
$('btnCandles').addEventListener('click', async () => {
  const symbol = $('cdSymbol').value.trim();
  const start = $('cdStart').value, end = $('cdEnd').value;
  if (!symbol) return flash('Diga o ativo (BTCUSDT na Binance; HYPE na Hyperliquid).');
  if (!start || !end) return flash('Preencha as datas De e Até.');
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
    const hourly = /h$/.test($('cdInterval').value);
    const lb = (ms) => {
      const d = new Date(ms);
      const dm = `${d.getUTCDate()}/${capFirst(MES[d.getUTCMonth()])}`;
      return hourly ? `${dm} ${String(d.getUTCHours()).padStart(2, '0')}h` : dm;
    };
    const cSpec = {
      type: 'candle',
      title: `${symbol.toUpperCase()} — ${$('cdVenue').value === 'binance' ? 'Binance' : 'Hyperliquid'}`,
      labels: rows.map((k) => lb(k.t)),
      series: [
        { name: 'Abertura', data: rows.map((k) => k.o) },
        { name: 'Máxima', data: rows.map((k) => k.h) },
        { name: 'Mínima', data: rows.map((k) => k.l) },
        { name: 'Fechamento', data: rows.map((k) => k.c) },
      ],
      y: { format: 'num', zero: false },
      x: { every: Math.ceil(rows.length / 10) },
    };
    if ($('cdVol').value === '1') {
      cSpec.series.push({ name: 'Volume', data: rows.map((k) => k.v), as: 'bar', axis: 'y2', color: '#94A3B8' });
      cSpec.y2 = { format: 'compact' };
    }
    spec = { ...structuredClone(DEFAULTS), ...cSpec };
    exitEditIfOn(); fillControls(); buildSeries(); sync(); pushHistory();
    hideChat();   // dados de API, não de imagem — o chat da extração não se aplica
    flash(`${rows.length} candles de ${symbol.toUpperCase()}.`);
  } catch (e) {
    flash('Candles: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Buscar candles';
  }
});
function exitEditIfOn() { if (editMode) exitEdit(); }

// ── Importar de HTML/SVG: reconstrói a spec do markup colado (sem IA) ─────────
$('btnImportHtml').addEventListener('click', () => {
  const html = $('htmlIn').value.trim();
  if (!html) return flash('Cole o HTML do elemento primeiro.');
  let partial;
  try { partial = parseChartHtml(html); }
  catch (err) { return flash('Não deu: ' + err.message); }
  if (!partial || !partial.series?.length) return flash('Não achei gráfico nem tabela nesse HTML.');
  spec = { ...structuredClone(DEFAULTS), ...partial };
  fillControls(); buildSeries(); sync();
  enterEdit(); pushHistory();
  const n = spec.series[0].data.length, cal = partial._calibrated;
  flash(`Importado — ${spec.series.length} série(s), ${n} pontos.` +
    (cal ? ' Arraste pra ajustar.' : ' Sem eixo pra calibrar: defina mín/máx ou arraste.'));
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
  if (!file.type.startsWith('image/')) return flash('Mande uma imagem (PNG/JPG).');
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
  if (!iaSession) return flash('Converta uma imagem primeiro.');
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
  const lbl = labelZone(vb);              // clicou na faixa do eixo → renomear inline
  if (lbl) { e.preventDefault(); editLabel(lbl); return; }
  const m = nearestMark(vb.x, vb.y);
  if (m) { drag = m; editLayer.setPointerCapture(e.pointerId); editLayer.classList.add('dragging'); }
});
function endDrag(e) {
  if (!drag) return;
  drag = null; tip.hidden = true;
  editLayer.classList.remove('dragging');
  if (e) editLayer.releasePointerCapture(e.pointerId);
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
  sync(); pushHistory();
  flash('Ponto adicionado.');
});

// remover ponto: botão direito em cima de uma marca tira aquela coluna
editLayer.addEventListener('contextmenu', (e) => {
  if (!editMode) return;
  e.preventDefault();
  const vb = toViewBox(e.clientX, e.clientY);
  const m = vb && nearestMark(vb.x, vb.y);
  if (!m || spec.labels.length <= 2) return;   // mantém ao menos 2 pontos
  spec.labels.splice(m.i, 1);
  spec.series.forEach((se) => se.data.splice(m.i, 1));
  sync(); pushHistory();
  flash('Ponto removido.');
});

let flashT;
function flash(msg) {
  $('status').textContent = msg;
  clearTimeout(flashT); flashT = setTimeout(() => ($('status').textContent = ''), 4000);
}

// ── start ────────────────────────────────────────────────────────────────────
fillControls();
buildSeries();
sync();
pushHistory();   // baseline do undo
