/**
 * Regressões do bloco Grid de Imagens (diagramador).
 *
 * Sem este teste quebraria calado:
 * - equal=width deixando de gerar colunas iguais (larguras diferentes)
 * - equal=height sem normalizar a soma das larguras na faixa total
 * - ensureImageGrid aceitando >4 itens ou 0 itens
 * - default de equal/titles/captions/gap poluindo o JSON
 * - setGridCols fora de 1..4
 * - gap custom não entrando no layout
 */
import assert from 'node:assert/strict';
import {
  ensureImageGrid, equalModeOf, layoutImageFrames, setGridCols, setGridItemImage,
  clearGridItemImage, setTitlesOn, setCaptionsOn, titlesOn, captionsOn,
  captionStyleOf, gapOf, clampGap, IMAGE_GRID_MAX, IMAGE_GRID_GAP,
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

console.log('test-image-grid: ok');
