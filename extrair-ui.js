/* Interface do extrator: canvas, retângulo de plotagem, escolha de cor e
 * pré-visualização da curva rastreada. Chama extrair.js (que é puro). */

import { suggestColors, pickColor, trace, toSeries, makeLabels, oklab, rgb, assessTrace, detectGridlines, checkCalibration, parseValue } from './extrair.js';

const $ = (id) => document.getElementById(id);

let img = null;        // ImageData da imagem original
let bitmap = null;     // ImageBitmap pra desenhar
let rect = null;       // área de plotagem, em pixels da imagem
let scale = 1;         // canvas -> imagem
let traced = null;     // { ys, x0, diag }
let grid = [];         // linhas de grade detectadas (nível 2)
let onDone = () => {};

const cv = () => $('cv');

export function openExtractor(file, handler) {
  onDone = handler;
  const url = URL.createObjectURL(file);
  const im = new Image();
  im.onload = async () => {
    bitmap = await createImageBitmap(im);
    const c = document.createElement('canvas');
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(im, 0, 0);
    img = ctx.getImageData(0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    setup();
    $('dlg').showModal();
  };
  im.src = url;
}

function setup() {
  grid = []; $('gridOut').innerHTML = '';
  const c = cv();
  c.width = img.width; c.height = img.height;
  // o canvas é exibido reduzido; guarda o fator pra converter clique -> pixel
  requestAnimationFrame(() => { scale = img.width / c.getBoundingClientRect().width; });

  // chute inicial: a área ocupada pelos pixels coloridos é a área do gráfico
  const cores = suggestColors(img, { x: 0, y: 0, w: img.width, h: img.height });
  paintSwatches(cores);
  $('pick').value = cores[0]?.hex || '#4FC3F7';
  rect = bboxOf($('pick').value) || { x: Math.round(img.width * .08), y: Math.round(img.height * .08), w: Math.round(img.width * .84), h: Math.round(img.height * .78) };
  syncRectInputs();
  $('tolVal').textContent = $('tol').value;
  $('cN').value = 80;
  redraw();
}

/** Caixa que contém os pixels da cor — costuma ser exatamente o plot. */
function bboxOf(hexColor) {
  const target = oklab(...rgb(hexColor));
  const tol = +$('tol').value || 14;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y += 2) {
    for (let x = 0; x < img.width; x += 2) {
      const i = (y * img.width + x) * 4;
      const p = oklab(img.data[i], img.data[i + 1], img.data[i + 2]);
      if (Math.hypot(p[0] - target[0], p[1] - target[1], p[2] - target[2]) * 100 > tol) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  // sobe até o topo do gráfico: a curva raramente encosta na borda superior
  return { x: x0, y: Math.max(0, y0 - 4), w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function paintSwatches(cores) {
  $('swatches').innerHTML = '';
  cores.forEach((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.style.cssText = `width:1.8rem;height:1.8rem;padding:0;background:${c.hex};border-color:${c.hex}`;
    b.title = `${c.hex} — ${c.n} px`;
    b.onclick = () => { $('pick').value = c.hex; rect = bboxOf(c.hex) || rect; syncRectInputs(); redraw(); };
    $('swatches').append(b);
  });
}

const syncRectInputs = () => { $('rx').value = rect.x; $('ry').value = rect.y; $('rw').value = rect.w; $('rh').value = rect.h; };

// ── desenho ──────────────────────────────────────────────────────────────────
function redraw() {
  const c = cv(), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(bitmap, 0, 0);

  // escurece tudo que está fora da área de plotagem
  ctx.fillStyle = 'rgba(4,3,10,.72)';
  ctx.fillRect(0, 0, c.width, rect.y);
  ctx.fillRect(0, rect.y + rect.h, c.width, c.height - rect.y - rect.h);
  ctx.fillRect(0, rect.y, rect.x, rect.h);
  ctx.fillRect(rect.x + rect.w, rect.y, c.width - rect.x - rect.w, rect.h);

  ctx.strokeStyle = '#29E899'; ctx.lineWidth = Math.max(1, 1.5 * scale);
  ctx.setLineDash([6 * scale, 4 * scale]);
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.setLineDash([]);

  // linhas de grade detectadas (nível 2), se já rodou
  ctx.strokeStyle = 'rgba(232,176,41,.7)'; ctx.lineWidth = 1;
  grid.forEach((y) => { ctx.beginPath(); ctx.moveTo(rect.x, y); ctx.lineTo(rect.x + rect.w, y); ctx.stroke(); });

  traced = trace(img, rect, $('pick').value, { tol: +$('tol').value });
  const { ys } = traced;
  ctx.beginPath();
  let started = false;
  ys.forEach((y, i) => {
    if (y == null) { started = false; return; }
    const x = rect.x + i;
    if (started) ctx.lineTo(x, y); else { ctx.moveTo(x, y); started = true; }
  });
  ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = Math.max(1, 1.4 * scale);
  ctx.stroke();

  const achou = ys.filter((v) => v != null).length;
  $('tip').textContent = `${achou} de ${ys.length} colunas rastreadas. A linha branca é o que vai virar dado — se ela não seguir a curva, ajuste a tolerância ou a cor.`;

  // nível 1: aderência do traço aos pixels
  const a = assessTrace(traced, rect);
  const v = $('verdict');
  v.className = 'verdict ' + a.verdict;
  const rot = { ok: 'Traço fiel', atencao: 'Confira o traço', ruim: 'Traço com problema' }[a.verdict];
  v.textContent = `${rot} · cobertura ${Math.round(a.coverage * 100)}%`
    + (a.interpolated > 0.01 ? `, ${Math.round(a.interpolated * 100)}% interpolado` : '')
    + (a.notes.length ? ` — ${a.notes.join('; ')}` : '');

  updatePreview();
}

function updatePreview() {
  const top = parseValue($('cTop').value), bot = parseValue($('cBot').value);
  if (!traced || !Number.isFinite(top) || !Number.isFinite(bot)) { $('preview').textContent = 'Informe topo e base pra ver a prévia.'; return; }
  const d = series();
  const ok = d.filter((v) => v != null);
  $('preview').textContent = ok.length
    ? `${ok.length} pontos · primeiro ${fmt(ok[0])} · último ${fmt(ok.at(-1))} · máx ${fmt(Math.max(...ok))}`
    : 'Nada rastreado nessa área.';
}

const fmt = (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

// nível 2: acha as grades e mostra o valor implícito em cada uma, pro usuário
// conferir contra os rótulos da imagem. Não lê o número (isso é OCR/humano) —
// verifica consistência: grade torta ou eixo log aparecem aqui.
function runGrid() {
  grid = detectGridlines(img, rect);
  redraw();
  showGrid();
}
function showGrid() {
  const box = $('gridOut');
  if (!grid.length) { box.innerHTML = '<span class="warn">Nenhuma linha de grade clara. Calibre pelas bordas da área.</span>'; return; }
  const top = parseValue($('cTop').value), bot = parseValue($('cBot').value);
  if (!Number.isFinite(top) || !Number.isFinite(bot)) {
    box.innerHTML = `${grid.length} linhas de grade achadas. Preencha topo e base pra ver o valor de cada uma.`;
    return;
  }
  const { values, warn } = checkCalibration(grid, rect, top, bot);
  // topo → base, pra bater com a leitura do eixo. Se saírem "quebrados"
  // (1.488 em vez de 1.500), a área de plotagem está torta — ajuste as bordas.
  const linhas = values.map((g, i) => `<tr><td>grade ${i + 1}</td><td>${fmt(g.value)}</td></tr>`).join('');
  box.innerHTML = `<div>Valor em cada grade, do topo à base — confira contra os rótulos da imagem:</div>`
    + `<table>${linhas}</table>`
    + warn.map((w) => `<div class="warn">⚠ ${w}</div>`).join('');
}

const series = () => toSeries(traced.ys, {
  samples: Math.max(4, +$('cN').value || 80),
  rect, yTop: parseValue($('cTop').value), yBottom: parseValue($('cBot').value),
});

// ── interação no canvas ──────────────────────────────────────────────────────
function bindCanvas() {
  const c = cv();
  let drag = null;
  const at = (e) => {
    const r = c.getBoundingClientRect();
    return {
      x: Math.round(Math.max(0, Math.min(img.width - 1, (e.clientX - r.left) * (img.width / r.width)))),
      y: Math.round(Math.max(0, Math.min(img.height - 1, (e.clientY - r.top) * (img.height / r.height)))),
    };
  };

  c.addEventListener('pointerdown', (e) => {
    const p = at(e);
    if ($('pickMode').checked) {
      $('pick').value = pickColor(img, p.x, p.y);
      redraw();
      return;
    }
    drag = p; c.setPointerCapture(e.pointerId);
  });
  c.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = at(e);
    rect = { x: Math.min(drag.x, p.x), y: Math.min(drag.y, p.y), w: Math.abs(p.x - drag.x), h: Math.abs(p.y - drag.y) };
    if (rect.w > 4 && rect.h > 4) { syncRectInputs(); redraw(); }
  });
  c.addEventListener('pointerup', () => { drag = null; });

  ['rx', 'ry', 'rw', 'rh'].forEach((id, i) => $(id).addEventListener('input', () => {
    rect = { x: +$('rx').value | 0, y: +$('ry').value | 0, w: Math.max(5, +$('rw').value | 0), h: Math.max(5, +$('rh').value | 0) };
    redraw();
  }));
  $('tol').addEventListener('input', (e) => { $('tolVal').textContent = e.target.value; redraw(); });
  $('pick').addEventListener('input', redraw);
  ['cTop', 'cBot', 'cN'].forEach((id) => $(id).addEventListener('input', () => { updatePreview(); if (grid.length) showGrid(); }));
  $('btnGrid').addEventListener('click', runGrid);
}

// ── saída ────────────────────────────────────────────────────────────────────
// Barra a geração quando falta o essencial — senão os valores saem NaN e o
// gráfico quebra em silêncio (era o bug do "só NaN").
function validate() {
  if (!traced || traced.ys.filter((v) => v != null).length < 3)
    return 'Nada rastreado — clique na linha da série (ou ajuste a cor/área) antes de gerar.';
  const top = parseValue($('cTop').value), bot = parseValue($('cBot').value);
  if (!Number.isFinite(top) || !Number.isFinite(bot))
    return 'Preencha "Valor no topo" e "Valor na base" (passo 3). Aceita 1.5b, 688.2B, 2.51T, 0…';
  if (top === bot) return 'Topo e base não podem ter o mesmo valor.';
  return null;
}

function build() {
  const data = series().map((v) => (Number.isFinite(v) ? v : null));  // rede: nada de NaN
  const labels = makeLabels($('cX0').value || '1', $('cX1').value || String(data.length), data.length);
  return { name: $('cName').value || 'Série', data, labels };
}

export function initExtractor() {
  bindCanvas();
  const emit = (mode) => {
    const err = validate();
    if (err) { $('preview').innerHTML = `<span class="err">⚠ ${err}</span>`; $('cTop').focus(); return; }
    onDone(build(), mode); $('dlg').close();
  };
  $('btnUse').addEventListener('click', () => emit('replace'));
  $('btnAdd').addEventListener('click', () => emit('append'));
}
