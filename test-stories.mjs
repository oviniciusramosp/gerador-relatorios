/* O que quebraria calado sem este teste:
 * - canvas de trabalho fora de 360×640 (ou export fora de 1080×1920)
 * - EXPORT_SCALE ≠ 3
 * - colunas ≠ 50% da área safe
 * - safe margins desalinhadas da spec Instagram (110/165 no export)
 * - open de doc antigo sem kind/pages reescrevendo o projeto
 * - pageIndex estourando o array de páginas
 * - default de fundo/texto e bloco full
 */
import assert from 'node:assert/strict';
import {
  PAGE_W, PAGE_H, COL_W, COL_GAP, COL_COUNT,
  EXPORT_W, EXPORT_H, EXPORT_SCALE, SAFE_EXPORT,
  DEFAULT_BG, DEFAULT_TEXT,
  SAFE, seedDoc, normalizeStoriesDoc, isStoriesDoc,
  mkBlock, mkPage, clampPageIndex, clampMarginMode,
  safeOf, safeRect, dangerZones, colRect,
} from './stories-core.js';

// ── artboard de trabalho + export Instagram ─────────────────────────────────
assert.equal(PAGE_W, 360);
assert.equal(PAGE_H, 640);
assert.equal(EXPORT_W, 1080);
assert.equal(EXPORT_H, 1920);
assert.equal(EXPORT_SCALE, 3);
assert.equal(PAGE_W * EXPORT_SCALE, EXPORT_W);
assert.equal(PAGE_H * EXPORT_SCALE, EXPORT_H);
assert.equal(COL_COUNT, 2);
assert.equal(COL_GAP, 0);
assert.equal(COL_W, 180);
assert.equal(DEFAULT_BG, '#FFFFFF');
assert.equal(DEFAULT_TEXT, '#000000');

// ── colunas 50/50 DENTRO do safe ───────────────────────────────────────────
const left = colRect('left', 'stories');
const right = colRect('right', 'stories');
const full = colRect('full', 'stories');
const sr = safeRect('stories');
assert.equal(left.x, sr.x);
assert.equal(left.y, sr.y);
assert.equal(left.w + right.w, sr.w);
assert.equal(left.w, right.w);
assert.equal(right.x, left.x + left.w);
assert.equal(full.w, sr.w);

// Safe no editor = spec Instagram ÷ 3 (110→37, 165→55)
assert.equal(SAFE.stories.top, 55);
assert.equal(SAFE.stories.bottom, 55);
assert.equal(SAFE.stories.left, 37);
assert.equal(SAFE.stories.right, 37);
// 110/3 não é inteiro → 37×3 = 111 (erro ≤ 1 px no export)
assert.ok(Math.abs(SAFE.stories.left * EXPORT_SCALE - SAFE_EXPORT.left) <= 1);
assert.equal(SAFE.stories.top * EXPORT_SCALE, SAFE_EXPORT.top); // 55×3 = 165
assert.equal(sr.w, 360 - 37 - 37);
assert.equal(sr.h, 640 - 55 - 55);

// Overlay: topo, base e laterais
const zones = dangerZones('stories');
assert.ok(zones.some((z) => z.id === 'top' && z.h === 55));
assert.ok(zones.some((z) => z.id === 'bottom' && z.h === 55));
assert.ok(zones.some((z) => z.id === 'left' && z.w === 37));
assert.ok(zones.some((z) => z.id === 'right' && z.w === 37));
assert.ok(zones.every((z) => z.x + z.w <= PAGE_W && z.y + z.h <= PAGE_H));

assert.equal(clampMarginMode('reels'), 'reels');
assert.equal(clampMarginMode(undefined), 'stories');
assert.deepEqual(safeOf('stories'), SAFE.stories);

// ── seed / normalize ────────────────────────────────────────────────────────
const seed = seedDoc();
assert.equal(seed.kind, 'stories');
assert.ok(seed.pages[0].blocks.some((b) => b.type === 'text' && b.col === 'full'));
assert.equal(seed.pages[0].bg, DEFAULT_BG);

const n2 = normalizeStoriesDoc({
  kind: 'stories',
  pages: [{ id: 'p1', bg: '#111111', blocks: [{ type: 'image', col: 'full', h: 300 }] }],
});
assert.equal(n2.pages[0].blocks[0].type, 'image');
assert.equal(n2.pages[0].blocks[0].radius, 4);

const tb0 = mkBlock('text');
assert.equal(tb0.col, 'full');
assert.equal(tb0.size, 24);
const ib0 = mkBlock('image');
assert.equal(ib0.radius, 4);
assert.equal(ib0.scale, 100);

assert.equal(clampPageIndex(99, 3), 2);
assert.equal(isStoriesDoc(seed), true);

console.log('test-stories: ok');
