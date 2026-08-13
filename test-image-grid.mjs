/**
 * Regressões do bloco Grid de Imagens (diagramador).
 *
 * Sem este teste quebraria calado:
 * - equal=width deixando de gerar colunas iguais (larguras diferentes)
 * - equal=width: slot vazio com aspect 4:3 alto empurrando legenda abaixo das fotos
 * - equal=height sem normalizar a soma das larguras na faixa total
 * - ensureImageGrid aceitando >4 itens ou 0 itens
 * - default de equal/titles/captions/gap poluindo o JSON
 * - setGridCols fora de 1..4
 * - gap custom não entrando no layout
 * - PDF/export filtrando slots vazios e 1 foto esticando nas 2 colunas
 */
import assert from 'node:assert/strict';
import {
  ensureImageGrid, equalModeOf, layoutImageFrames, planImageGrid, setGridCols,
  setGridItemImage, clearGridItemImage, setTitlesOn, setCaptionsOn, titlesOn,
  captionsOn, captionStyleOf, gapOf, clampGap, IMAGE_GRID_MAX, IMAGE_GRID_GAP,
  seedGridItem, itemAspect,
} from './bloco-image-grid.js';

// ── ensure: 2 slots default, sem título/legenda, equal width ────────────────
{
  const b = { id: 'g1', type: 'image-grid' };
  ensureImageGrid(b);
  assert.equal(b.items.length, 2);
  assert.equal(equalModeOf(b), 'width');
  assert.equal(b.equal, undefined, 'default width não polui o JSON');
  assert.equal(titlesOn(b), false);
  assert.equal(captionsOn(b), false);
  assert.equal(gapOf(b), IMAGE_GRID_GAP);
  assert.ok(b.items.every((it) => it.src === null && it.title === undefined && it.caption === undefined));
}

{
  const b = { items: Array.from({ length: 8 }, () => seedGridItem()), equal: 'height' };
  ensureImageGrid(b);
  assert.equal(b.items.length, IMAGE_GRID_MAX);
  assert.equal(equalModeOf(b), 'height');
}

// ── setGridCols 1..4 ────────────────────────────────────────────────────────
{
  const b = { type: 'image-grid' };
  ensureImageGrid(b);
  assert.equal(setGridCols(b, 4), 4);
  assert.equal(b.items.length, 4);
  assert.equal(setGridCols(b, 1), 1);
  assert.equal(b.items.length, 1);
  assert.equal(setGridCols(b, 99), IMAGE_GRID_MAX);
  assert.equal(setGridCols(b, 0), 1);
}

// ── titles/captions toggle (bloco inteiro) ──────────────────────────────────
{
  const b = { type: 'image-grid' };
  ensureImageGrid(b);
  setTitlesOn(b, true);
  assert.equal(titlesOn(b), true);
  assert.ok(b.items.every((it) => it.title === ''));
  b.items[0].title = 'A';
  setTitlesOn(b, false);
  assert.equal(titlesOn(b), false);
  // conteúdo preservado ao desligar
  assert.equal(b.items[0].title, 'A');
  setCaptionsOn(b, true);
  assert.equal(captionsOn(b), true);
  assert.equal(captionStyleOf(b), 'default');
  b.captionStyle = 'p';
  ensureImageGrid(b);
  assert.equal(captionStyleOf(b), 'p');
  delete b.captionStyle;
  ensureImageGrid(b);
  assert.equal(captionStyleOf(b), 'default');
}

// ── gap clamp + default ─────────────────────────────────────────────────────
{
  assert.equal(clampGap(-3), 0);
  assert.equal(clampGap(100), 48);
  assert.equal(clampGap(12), 12);
  const b = { gap: 8 };
  ensureImageGrid(b);
  assert.equal(b.gap, undefined, 'gap default some do JSON');
  b.gap = 16;
  ensureImageGrid(b);
  assert.equal(gapOf(b), 16);
}

// ── set image ───────────────────────────────────────────────────────────────
{
  const b = { type: 'image-grid' };
  ensureImageGrid(b);
  setGridItemImage(b, 0, { src: 'data:image/png,x', nw: 800, nh: 400 });
  assert.equal(itemAspect(b.items[0]), 2);
  clearGridItemImage(b, 0);
  assert.equal(b.items[0].src, null);
}

// ── layout equal width ──────────────────────────────────────────────────────
{
  const items = [
    { src: 'a', nw: 100, nh: 100 },
    { src: 'b', nw: 200, nh: 100 },
    { src: 'c', nw: 100, nh: 200 },
  ];
  const totalW = 499;
  const frames = layoutImageFrames(items, totalW, IMAGE_GRID_GAP, 'width');
  const colW = (totalW - 2 * IMAGE_GRID_GAP) / 3;
  for (const f of frames) {
    assert.ok(Math.abs(f.w - colW) < 1e-6);
  }
  // c é o mais alto (AR 0.5 → h = 2×colW)
  assert.ok(Math.abs(frames[2].h - colW * 2) < 1e-6);
}

// ── equal width: slot vazio herda altura da imagem mais alta (não 4:3 fixo) ──
// Sem este assert, placeholder alto empurrava legenda/conteúdo abaixo das fotos.
{
  const tall = { src: 'tall', nw: 100, nh: 200 }; // AR 0.5
  const empty = { src: null, nw: 0, nh: 0 };
  const totalW = 400;
  const gap = 8;
  const frames = layoutImageFrames([tall, empty], totalW, gap, 'width');
  const colW = (totalW - gap) / 2;
  const tallH = colW / (100 / 200);
  assert.ok(Math.abs(frames[0].h - tallH) < 1e-6, 'imagem mantém proporção');
  assert.ok(Math.abs(frames[1].h - tallH) < 1e-6, 'vazio = altura da imagem mais alta');
  // se o vazio usasse 4:3, seria colW*(3/4) — bem menor que tallH (2×colW)
  assert.ok(frames[1].h > colW, 'vazio não cai no 4:3 baixo');
}

// só vazios → fallback 4:3 (sem imagem de referência)
{
  const frames = layoutImageFrames(
    [{ src: null }, { src: null }],
    400, 8, 'width',
  );
  const colW = (400 - 8) / 2;
  const h43 = colW / (4 / 3);
  assert.ok(Math.abs(frames[0].h - h43) < 1e-6);
  assert.ok(Math.abs(frames[1].h - h43) < 1e-6);
}

// ── layout equal height + gap custom ────────────────────────────────────────
{
  const items = [
    { src: 'a', nw: 100, nh: 100 },
    { src: 'b', nw: 200, nh: 100 },
  ];
  const totalW = 400;
  const gap = 20;
  const frames = layoutImageFrames(items, totalW, gap, 'height');
  assert.ok(Math.abs(frames[0].h - frames[1].h) < 1e-6);
  const sumW = frames[0].w + frames[1].w;
  assert.ok(Math.abs(sumW - (totalW - gap)) < 1e-6, `soma larguras com gap ${gap}: ${sumW}`);
}

// ── export = preview: 2 slots, 1 foto NÃO estica na faixa ───────────────────
{
  const b = { type: 'image-grid', items: [
    { src: 'a', nw: 200, nh: 100 },
    { src: null, nw: 0, nh: 0 },
  ] };
  const totalW = 400;
  const gap = IMAGE_GRID_GAP;
  const edit = planImageGrid(b, totalW, { editing: true });
  const pdf = planImageGrid(b, totalW, { editing: false });
  assert.equal(edit.n, 2);
  assert.equal(pdf.n, 2, 'PDF não colapsa pra 1 coluna');
  assert.equal(pdf.skip, false);
  const colW = (totalW - gap) / 2;
  assert.ok(Math.abs(pdf.frames[0].w - colW) < 1e-6, 'foto fica na metade da faixa');
  assert.ok(Math.abs(pdf.frames[1].w - colW) < 1e-6, 'slot vazio reserva a coluna');
  assert.equal(edit.frames[0].w, pdf.frames[0].w);
}

{
  const b = { type: 'image-grid' };
  ensureImageGrid(b);
  const emptyPdf = planImageGrid(b, 499, { editing: false });
  assert.equal(emptyPdf.n, 2);
  assert.equal(emptyPdf.skip, true, 'grid sem foto some no PDF');
  assert.equal(planImageGrid(b, 499, { editing: true }).skip, false);
}

console.log('test-image-grid: ok');
