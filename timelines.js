/* Editor de linhas do tempo — liga os controles ao renderer puro (timeline.js). */
import { renderTimeline, layoutSize, DEFAULTS, sortEvents, toLines, parseLines } from './timeline.js';
import { ICONS, iconSvg, isTextIcon, textIconLabel } from './timeline-icons.js';
import { openSwatchPop } from './swatch.js';
import { logoPickSvg } from './logos.js';

const $ = (id) => document.getElementById(id);
const out = $('out');

let spec = structuredClone(DEFAULTS);
Object.assign(spec, {
  title: 'Linha do Tempo: Hyperliquid',
  subtitle: 'Principais produtos, atualizações e marcos históricos',
  theme: 'dark',
  events: [
    { date: 'Novembro/2022', text: 'Lançamento da primeira Testnet', icon: 'flask' },
    { date: 'Fevereiro/2023', text: 'Lançamento da Mainnet fechada', icon: 'rocket' },
    { date: 'Março/2023', text: 'Começa o programa de referrals, Mainnet aberta', icon: 'users' },
    { date: 'Maio/2023', text: 'Lançamento do vault HLP', icon: 'cube' },
    { date: 'Novembro/2023', text: 'Inicia campanha de pontos', icon: 'star' },
    { date: 'Fevereiro/2024', text: 'Corretora alcança US$ 1 bilhão em volume diário pela primeira vez', icon: 'chart-bar' },
    { date: 'Abril/2024', text: 'HIP-1 e HIP-2', icon: 'doc' },
    { date: 'Outubro/2024', text: 'Lançamento dos Builder Codes', icon: 'code' },
    { date: 'Novembro/2024', text: 'Lançamento e airdrop do token HYPE', icon: 'parachute' },
    { date: 'Novembro/2024', text: 'Alcança US$ 1 bilhão em Open Interest', icon: 'trend-up' },
    { date: 'Fevereiro/2025', text: 'Lançamento da HyperEVM', icon: 'gear' },
    { date: 'Março/2025', text: 'Volume acumulado ultrapassa US$ 1 trilhão', icon: 'coins' },
    { date: 'Março/2025', text: 'Incidente "Jelly Jelly"', icon: 'alert' },
    { date: 'Junho/2025', text: 'Primeira DAT de HYPE (Hyperion DeFi)', icon: 'bank' },
    { date: 'Julho/2025', text: 'Receita mensal ultrapassa US$ 100 milhões', icon: 'money' },
    { date: 'Outubro/2025', text: 'Maior liquidação da história do mercado cripto, HLP lucra US$ 40 milhões', icon: 'bolt' },
    { date: 'Dezembro/2025', text: 'Lançamento da PURR, maior DAT de HYPE atualmente', icon: 'flame' },
    { date: 'Janeiro/2026', text: 'HIP-3 supera US$ 1 bilhão em volume diário', icon: 'trophy' },
    { date: 'Fevereiro/2026', text: 'HIP-4 inaugura mercados de previsões', icon: 'target' },
    { date: 'Março/2026', text: 'Lançamento do perpétuo oficial do S&P500', icon: 'txt:S&P' },
    { date: 'Maio/2026', text: 'Primeiro ETF de HYPE nos EUA', icon: 'txt:ETF' },
  ],
});

// ── render ───────────────────────────────────────────────────────────────────
function sync({ keepList = false, keepJson = false, keepLines = false } = {}) {
  out.innerHTML = renderTimeline(spec);
  const { w, h } = layoutSize(spec);
  $('dims').textContent = `${w} × ${h} px  →  PNG ${w * +$('scale').value} × ${h * +$('scale').value}`;
  if (!keepJson) $('json').value = JSON.stringify(spec, null, 2);
  if (!keepLines) $('lines').value = toLines(spec.events);
  if (!keepList) buildEvents();
}

// ── segmento Eventos: Manual / Texto / Imagem ────────────────────────────────
const segBtns = [...document.querySelectorAll('#dataSegment button')];
segBtns.forEach((b) => b.addEventListener('click', () => {
  segBtns.forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  document.querySelectorAll('.pane').forEach((p) => { p.hidden = p.dataset.pane !== b.dataset.seg; });
}));

// ── lista de eventos (editar, reordenar, apagar) ──────────────────────────────
function buildEvents() {
  const host = $('events');
  host.innerHTML = '';
  spec.events.forEach((ev, i) => {
    const row = document.createElement('div');
    row.className = 'ev'; row.dataset.i = i;

    // alça de arraste: só ela é draggable, pra não atrapalhar a seleção de texto
    const grip = document.createElement('button');
    grip.type = 'button'; grip.className = 'ev-grip'; grip.textContent = '⠿';
    grip.title = 'Arraste pra reordenar'; grip.setAttribute('aria-label', 'Arraste pra reordenar');
    grip.draggable = true;
    grip.addEventListener('dragstart', (e) => {
      dragFrom = i; row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i));
    });
    grip.addEventListener('dragend', () => { row.classList.remove('dragging'); clearDropMarks(); });

    const move = document.createElement('div');
    move.className = 'ev-move';
    move.append(
      mkBtn('▲', 'Subir', () => reorder(i, i - 1), i === 0),
      mkBtn('▼', 'Descer', () => reorder(i, i + 1), i === spec.events.length - 1),
    );

    const fields = document.createElement('div');
    fields.className = 'ev-fields';
    const date = mkInput(ev.date ?? '', 'Data (ex.: Fevereiro/2023)', (v) => { ev.date = v; });
    date.classList.add('ev-date');
    const text = mkInput(ev.text ?? '', 'Descrição do evento', (v) => { ev.text = v; });
    fields.append(date, text);

    const right = document.createElement('div');
    right.className = 'ev-right';
    const icon = document.createElement('button');
    icon.type = 'button'; icon.className = 'ev-icon'; icon.title = 'Ícone do evento (opcional)';
    paintIconBtn(icon, ev.icon);
    icon.onclick = () => openIconPop(icon, (key) => {
      if (key) ev.icon = key; else delete ev.icon;
      paintIconBtn(icon, ev.icon); sync({ keepList: true });
    }, ev.icon);
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'ev-del'; del.textContent = '×'; del.title = 'Remover evento';
    del.onclick = () => { spec.events.splice(i, 1); sync(); };
    right.append(icon, del);

    // drop na linha: metade de cima insere antes, metade de baixo insere depois
    row.addEventListener('dragover', (e) => {
      if (dragFrom == null) return;
      e.preventDefault();
      const r = row.getBoundingClientRect();
      clearDropMarks();
      row.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
    });
    row.addEventListener('drop', (e) => {
      if (dragFrom == null) return;
      e.preventDefault();
      const r = row.getBoundingClientRect();
      const before = e.clientY < r.top + r.height / 2;
      let to = i + (before ? 0 : 1);
      if (dragFrom < to) to--;                    // remover primeiro desloca o índice
      clearDropMarks(); reorder(dragFrom, to); dragFrom = null;
    });

    row.append(grip, move, fields, right);
    host.append(row);
  });
}
let dragFrom = null;
const clearDropMarks = () => document.querySelectorAll('.ev').forEach((r) => r.classList.remove('drop-before', 'drop-after'));

function mkBtn(label, title, onclick, disabled) {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = label; b.title = title; b.disabled = !!disabled; b.onclick = onclick;
  return b;
}
function mkInput(value, aria, oninput) {
  const el = document.createElement('input');
  el.type = 'text'; el.value = value; el.setAttribute('aria-label', aria); el.placeholder = aria;
  el.oninput = () => { oninput(el.value); sync({ keepList: true }); };
  return el;
}
function reorder(from, to) {
  if (to < 0 || to >= spec.events.length || from === to) return;
  const [ev] = spec.events.splice(from, 1);
  spec.events.splice(to, 0, ev);
  sync();
}
function paintIconBtn(btn, key) {
  btn.innerHTML = isTextIcon(key)
    ? `<span class="badge">${textIconLabel(key).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`
    : key && ICONS[key] ? iconSvg(key, { x: 0, y: 0, w: 24, h: 24 }, 'currentColor', 1.8).replace(/ x="0" y="0"/, '')
    : '<span class="badge">—</span>';
}

$('btnAdd').addEventListener('click', () => { spec.events.push({ date: '', text: '' }); sync(); });
$('btnSort').addEventListener('click', () => { spec.events = sortEvents(spec.events); sync(); flash('Eventos ordenados por data.'); });

$('lines').addEventListener('input', (e) => { spec.events = parseLines(e.target.value); sync({ keepLines: true }); });

// ── picker de ícone ──────────────────────────────────────────────────────────
let iconPop = null;
function closeIconPop() {
  if (!iconPop) return;
  removeEventListener('pointerdown', outsideIcon);
  iconPop.remove(); iconPop = null;
}
function outsideIcon(e) { if (iconPop && !iconPop.contains(e.target)) closeIconPop(); }
function openIconPop(anchor, pick, current) {
  closeIconPop();
  iconPop = document.createElement('div');
  iconPop.className = 'icon-pop';
  const label = (t) => { const d = document.createElement('div'); d.className = 'ip-label'; d.textContent = t; iconPop.append(d); };

  label('Ícone');
  const grid = document.createElement('div');
  grid.className = 'ip-grid';
  const none = mkBtn('—', 'Sem ícone', () => { pick(''); closeIconPop(); });
  if (!current) none.classList.add('on');
  grid.append(none);
  for (const [key, ic] of Object.entries(ICONS)) {
    const b = document.createElement('button');
    b.type = 'button'; b.title = ic.label;
    b.innerHTML = iconSvg(key, { x: 0, y: 0, w: 24, h: 24 }, 'currentColor', 1.8).replace(/ x="0" y="0"/, '');
    if (key === current) b.classList.add('on');
    b.onclick = () => { pick(key); closeIconPop(); };
    grid.append(b);
  }
  iconPop.append(grid);

  label('Sigla no lugar do ícone');
  const row = document.createElement('div');
  row.className = 'ip-row';
  const inp = document.createElement('input');
  inp.type = 'text'; inp.placeholder = 'ex.: S&P, ETF'; inp.maxLength = 6;
  inp.value = isTextIcon(current) ? textIconLabel(current) : '';
  inp.setAttribute('aria-label', 'Sigla no nó');
  const ok = mkBtn('Usar', 'Usar a sigla', () => {
    const v = inp.value.trim();
    if (v) { pick('txt:' + v); closeIconPop(); }
  });
  inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); ok.click(); } };
  row.append(inp, ok);
  iconPop.append(row);

  document.body.append(iconPop);
  const r = anchor.getBoundingClientRect(), pw = iconPop.offsetWidth, ph = iconPop.offsetHeight;
  iconPop.style.left = Math.max(6, Math.min(r.left, innerWidth - pw - 6)) + 'px';
  iconPop.style.top = (r.bottom + 4 + ph > innerHeight ? Math.max(6, r.top - 4 - ph) : r.bottom + 4) + 'px';
  setTimeout(() => addEventListener('pointerdown', outsideIcon), 0);
}

// ── controles de formato ─────────────────────────────────────────────────────
$('layoutPicker').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-layout]'); if (!b) return;
  spec.layout = b.dataset.layout;
  paintLayout(); sync({ keepList: true });
});
const paintLayout = () => $('layoutPicker').querySelectorAll('button').forEach((b) =>
  b.setAttribute('aria-pressed', b.dataset.layout === spec.layout));

['title', 'subtitle', 'source'].forEach((k) =>
  $(k).addEventListener('input', (e) => { spec[k] = e.target.value; sync({ keepList: true }); }));

[['showTitle', 'title'], ['showSubtitle', 'subtitle'], ['showSource', 'source']].forEach(([id, key]) =>
  $(id).addEventListener('click', () => {
    spec.show[key] = !spec.show[key];
    $(id).setAttribute('aria-checked', spec.show[key]);
    sync({ keepList: true });
  }));
$('showRange').addEventListener('change', (e) => { spec.show.range = e.target.checked; sync({ keepList: true }); });

$('theme').addEventListener('change', (e) => { spec.theme = e.target.value; paintAccent(); sync({ keepList: true }); });
// accent null = mint da marca resolvido pelo renderer; o swatch mostra a cor resolvida
const accentOf = () => spec.accent || (spec.theme === 'light' ? '#00875A' : '#29E899');
$('accent').addEventListener('click', () => openSwatchPop($('accent'),
  (hex) => { spec.accent = hex; paintAccent(); sync({ keepList: true }); }, accentOf(), { opacity: false }));
const paintAccent = () => { $('accent').style.background = accentOf(); };

['card', 'connector', 'arrow', 'transparent'].forEach((id) =>
  $(id).addEventListener('change', (e) => { spec[id] = e.target.checked; sync({ keepList: true }); }));

[['fontScale', 'fsVal', (v) => v + '×'], ['nodeSize', 'nodeVal', (v) => v + ' px'], ['gap', 'gapVal', (v) => v + ' px']]
  .forEach(([id, o, fmt]) => $(id).addEventListener('input', (e) => {
    spec[id] = +e.target.value; $(o).textContent = fmt(e.target.value); sync({ keepList: true });
  }));

['width', 'colWidth'].forEach((id) =>
  $(id).addEventListener('input', (e) => { spec[id] = +e.target.value || DEFAULTS[id]; sync({ keepList: true }); }));

$('scale').addEventListener('change', () => sync({ keepList: true, keepJson: true, keepLines: true }));

// ── logo da Paradigma (mesmo componente do gerador de gráficos) ───────────────
const wmDefaultOpacity = (pos) => (pos === 'center' ? 0.08 : 1);
function setWm(patch) {
  spec.watermark = { ...DEFAULTS.watermark, ...spec.watermark, ...patch };
  paintWatermark(); sync({ keepList: true });
}
$('wmPicker').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-logo]'); if (!b) return;
  const wasOff = (spec.watermark?.logo ?? 'none') === 'none';
  const patch = { logo: b.dataset.logo };
  if (wasOff && b.dataset.logo !== 'none') patch.opacity = wmDefaultOpacity(spec.watermark?.pos ?? 'footer');
  setWm(patch);
});
['icone', 'full', 'nome'].forEach((kind) => {
  const b = $('wmPicker').querySelector(`button[data-logo="${kind}"]`);
  if (b) b.innerHTML = logoPickSvg(kind);
});
$('wmPos').addEventListener('change', (e) => setWm({ pos: e.target.value, opacity: wmDefaultOpacity(e.target.value) }));
$('wmAlign').addEventListener('change', (e) => setWm({ align: e.target.value }));
$('wmColor').addEventListener('click', () => openSwatchPop($('wmColor'),
  (hex) => setWm({ color: hex }), { ...DEFAULTS.watermark, ...spec.watermark }.color, { opacity: false }));
$('wmOpacity').addEventListener('input', (e) => setWm({ opacity: +e.target.value / 100 }));
$('wmScale').addEventListener('input', (e) => setWm({ size: +e.target.value / 100 }));

function paintWatermark() {
  const wm = { ...DEFAULTS.watermark, ...spec.watermark };
  $('wmPicker').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.logo === wm.logo));
  $('wmOpts').hidden = wm.logo === 'none';
  $('wmPos').value = wm.pos; $('wmAlign').value = wm.align;
  $('wmColor').style.background = wm.color;
  $('wmAlignField').hidden = wm.pos === 'center';   // no centro o logo é sempre centralizado
  const op = wm.opacity ?? wmDefaultOpacity(wm.pos);
  $('wmOpacity').value = Math.round(op * 100); $('wmOpVal').textContent = Math.round(op * 100) + '%';
  $('wmScale').value = Math.round((wm.size || 1) * 100);
  $('wmScaleVal').textContent = (+(wm.size || 1).toFixed(2)) + '×';
}

// ── spec JSON ────────────────────────────────────────────────────────────────
$('btnApply').addEventListener('click', () => {
  try { spec = { ...structuredClone(DEFAULTS), ...JSON.parse($('json').value) }; }
  catch (err) { return flash('JSON inválido: ' + err.message, true); }
  fillControls(); sync();
});
$('btnCopy').addEventListener('click', async () => {
  await navigator.clipboard.writeText(JSON.stringify(spec, null, 2)); flash('Spec copiada.');
});

function fillControls() {
  spec.show = { ...DEFAULTS.show, ...spec.show };
  for (const id of ['theme', 'title', 'subtitle', 'source', 'fontScale', 'nodeSize', 'gap', 'width', 'colWidth']) {
    if ($(id)) $(id).value = spec[id] ?? DEFAULTS[id];
  }
  ['card', 'connector', 'arrow', 'transparent'].forEach((id) => { $(id).checked = !!spec[id]; });
  $('showRange').checked = !!spec.show.range;
  ['title', 'subtitle', 'source'].forEach((k) =>
    $('show' + k[0].toUpperCase() + k.slice(1)).setAttribute('aria-checked', !!spec.show[k]));
  $('fsVal').textContent = spec.fontScale + '×';
  $('nodeVal').textContent = spec.nodeSize + ' px';
  $('gapVal').textContent = spec.gap + ' px';
  paintLayout(); paintAccent(); paintWatermark();
}

// ── export ───────────────────────────────────────────────────────────────────
// A fonte vai embutida: o SVG rasterizado no canvas roda isolado e não vê a
// @font-face do documento (mesmo motivo e mesmo cache do gerador de gráficos).
let fontPromise;
const fontDataUri = () => (fontPromise ??= fetch('fonts/IBMPlexSans-Var.ttf')
  .then((r) => { if (!r.ok) throw new Error('fonte não encontrada (sirva a pasta por http, não file://)'); return r.blob(); })
  .then((b) => new Promise((res, rej) => {
    const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b);
  }))
  .catch((e) => {
    fontPromise = null;
    throw e instanceof TypeError
      ? new Error('não consegui buscar a fonte — o servidor caiu? Confira que node server.mjs está no ar e clique de novo.')
      : e;
  }));

const svgString = async (sp) => renderTimeline(sp, { fontDataUri: await fontDataUri() });

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const slug = (s) => (s || 'linha-do-tempo').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'linha-do-tempo';

async function toPng(sp, scale) {
  const svg = await svgString(sp);
  const { w, h } = layoutSize(sp);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = w * scale; c.height = h * scale;
    const ctx = c.getContext('2d');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, w, h);
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

// ── modo embutido (iframe da Diagramação): manda o SVG pro relatório ─────────
if (new URLSearchParams(location.search).has('embed')) {
  const b = document.createElement('button');
  b.id = 'btnImport'; b.className = 'primary'; b.textContent = 'Importar para o relatório →';
  document.querySelector('header nav').prepend(b);
  b.addEventListener('click', async () => {
    flash('Gerando SVG…');
    try {
      const svg = await svgString(spec);
      const { w, h } = layoutSize(spec);
      parent.postMessage({ type: 'pdgm-chart-svg', svg, title: spec.title, w, h }, location.origin);
      flash('Importado.');
    } catch (e) { flash('Falhou: ' + e.message, true); }
  });
}

// ── Converter imagem em linha do tempo (CLI do Claude, via server local) ─────
$('btnIA').addEventListener('click', () => $('fileIA').click());
$('iaClose').addEventListener('click', () => { $('iaOverlay').hidden = true; });
$('fileIA').addEventListener('change', (e) => { if (e.target.files[0]) convertImage(e.target.files[0]); e.target.value = ''; });

// arrastar a imagem em cima do palco também converte
const drop = $('drop');
drop.addEventListener('dragover', (e) => {
  if (![...e.dataTransfer.types].includes('Files')) return;   // arraste de evento na lista não conta
  e.preventDefault(); drop.classList.add('over');
});
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  const f = e.dataTransfer.files?.[0];
  if (!f) return;
  e.preventDefault(); drop.classList.remove('over');
  if (f.type.startsWith('image/')) convertImage(f);
});

function iaShow() {
  const ov = $('iaOverlay');
  ov.hidden = false; ov.classList.remove('err');
  $('iaClose').hidden = true;
  ov.querySelector('.ia-title').textContent = 'Lendo a linha do tempo com o Claude…';
  const t0 = Date.now();
  const tick = () => { $('iaTimer').textContent = `${Math.round((Date.now() - t0) / 1000)}s · pode levar até 1 min`; };
  tick();
  return setInterval(tick, 1000);
}
function iaError(msg) {
  const ov = $('iaOverlay');
  ov.hidden = false; ov.classList.add('err');
  ov.querySelector('.ia-title').textContent = 'Não deu';
  $('iaTimer').textContent = msg;
  $('iaClose').hidden = false;
}

async function convertImage(file) {
  const timer = iaShow();
  try {
    const r = await fetch('/api/timeline', {
      method: 'POST', headers: { 'content-type': file.type || 'image/png' }, body: file,
    });
    const data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || `HTTP ${r.status}`);
    if (!data.spec?.events?.length) throw new Error('o Claude não achou eventos na imagem');
    // o que a IA manda é CONTEÚDO (eventos + textos); a forma continua sua
    spec.events = data.spec.events;
    ['title', 'subtitle', 'source'].forEach((k) => { if (data.spec[k]) spec[k] = data.spec[k]; });
    if (data.spec.layout) spec.layout = data.spec.layout;
    spec.show = { ...spec.show, title: !!spec.title, subtitle: !!spec.subtitle };
    $('iaOverlay').hidden = true;
    fillControls(); sync();
    flash(`${spec.events.length} eventos importados${data.cost ? ` · US$ ${data.cost.toFixed(3)}` : ''}.`);
  } catch (e) {
    iaError(String(e.message || e));
  } finally { clearInterval(timer); }
}

// A aba Imagem depende de /api/timeline, que só existe com o server.mjs rodando
// (no GitHub Pages estático não há backend) — sem ele, esconde a aba em vez de
// oferecer um botão que quebra.
(async function gateIA() {
  let ok = false;
  try { ok = (await fetch('/api/health', { signal: AbortSignal.timeout(1500) })).ok; } catch {}
  if (ok) return;
  segBtns.find((b) => b.dataset.seg === 'imagem')?.remove();
  document.querySelector('.pane[data-pane="imagem"]')?.remove();
  $('dataSegment').classList.remove('cols-3');
})();

// ── status ───────────────────────────────────────────────────────────────────
let flashT;
function flash(msg, isError = false) {
  const el = $('status');
  el.textContent = msg;
  el.classList.toggle('err', isError);
  clearTimeout(flashT);
  flashT = setTimeout(() => { el.textContent = ''; el.classList.remove('err'); }, isError ? 8000 : 4000);
}

// ── start ────────────────────────────────────────────────────────────────────
fillControls();
sync();
