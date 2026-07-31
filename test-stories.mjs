/* O que quebraria calado sem este teste:
 * - canvas de trabalho fora de 360×640 (ou export fora de 1080×1920)
 * - EXPORT_SCALE ≠ 3
 * - layout freestyle: migração col L/R → x+scale; seed com x/y/scale
 * - safe margins desalinhadas da spec Instagram (110/165 no export)
 * - open de doc antigo sem kind/pages reescrevendo o projeto
 * - pageIndex estourando o array de páginas
 * - default de fundo/texto e bloco full-width
 * - z-order de camadas (array maior = frente) reordenado errado ou invertido
 * - letter-spacing default (tracking global) ou efeitos de texto sumindo no open
 * - estilos de highlight inválidos passando no normalize
 * - snap X/Y: centro da tela / bordas e centros de peers (arraste sem ímã)
 * - bloco gráfico (imagem + b.chart) perdendo spec no open ou rótulo de camada
 * - rotação de bloco: open sem rotate = 0; ímã em 0/15/30/45/90; 0 some do disco
 * - sticker token: seed/open com symbol+scale default; kind desconhecido → token
 */
import assert from 'node:assert/strict';
import {
  PAGE_W, PAGE_H, COL_W, COL_GAP, COL_COUNT,
  EXPORT_W, EXPORT_H, EXPORT_SCALE, SAFE_EXPORT,
  DEFAULT_BG, DEFAULT_TEXT,
  SAFE, seedDoc, normalizeStoriesDoc, isStoriesDoc,
  mkBlock, mkPage, clampPageIndex, clampMarginMode,
  safeOf, safeRect, dangerZones, colRect,
  reorderBlocks, nudgeBlockZ, bringBlockToFront, sendBlockToBack,
  moveBlockRelative, blockLayerLabel,
  TEXT_STYLE_DEFAULTS, textLetterSpacingOf, clampLetterSpacing,
  textBorderOf, textShadow3dOf, textEffectsCss, textOutlineShadows,
  imgBorderOf, imgBorderColorOf,
  clampHiliteStyle, hiliteStyleLabel, HILITE_STYLES, HILITE_STYLE_LABELS,
  HILITE_BRUSH_MASK, hiliteBrushCss,
  BLOCK_SNAP_PX, collectBlockSnapTargets, collectBlockSnapTargetsX,
  snapBlockY, snapBlockX, migrateBlockLayout, blockScaleOf, blockWidthPx,
  defaultStoriesLogo, normalizeStoriesLogo,
  ROTATE_SNAPS, ROTATE_SNAP_STEP, ROTATE_SNAP_THRESH,
  clampRotate, rotateDist, snapRotate, rotateOf, setBlockRotate, rotatedBoxCorner,
  TILT_MAX, clampTilt, tiltOf, setBlockTilt, imgTiltCss,
  DEFAULT_STICKER_SCALE, DEFAULT_STICKER_H,
  clampStickerKind, clampStickerSymbol,
} from './stories-core.js';
import {
  COIN_SYMBOLS, COIN_POPULAR, DEFAULT_COIN_SYMBOL,
  normalizeCoinSymbol, clampCoinSymbol, coinIconPath, coinLabel,
  filterCoinIcons, isKnownCoinSymbol,
} from './coin-icons.js';

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

// ── safe area + colRect legado (só migração) ────────────────────────────────
const left = colRect('left', 'stories');
const right = colRect('right', 'stories');
const full = colRect('full', 'stories');
const sr = safeRect('stories');
assert.equal(left.w + right.w, sr.w);
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
assert.ok(seed.pages[0].blocks.some((b) => b.type === 'text' && b.scale === 100 && (b.x | 0) === 0));
assert.equal(seed.pages[0].bg, DEFAULT_BG);
// defaults de fundo (Fill) — iguais à capa do Diagramador
assert.equal(seed.pages[0].bgImage, null);
assert.equal(seed.pages[0].bgX, 50);
assert.equal(seed.pages[0].bgY, 50);
assert.equal(seed.pages[0].bgScale, 100);

const n2 = normalizeStoriesDoc({
  kind: 'stories',
  pages: [{ id: 'p1', bg: '#111111', blocks: [{ type: 'image', col: 'full', h: 300 }] }],
});
assert.equal(n2.pages[0].blocks[0].type, 'image');
assert.equal(n2.pages[0].blocks[0].radius, 4);
assert.equal(n2.pages[0].blocks[0].x, 0);
assert.equal(n2.pages[0].blocks[0].scale, 100);
assert.equal(n2.pages[0].blocks[0].col, undefined);
// doc antigo sem bgX/bgY/bgScale não quebra e recebe defaults
assert.equal(n2.pages[0].bgX, 50);
assert.equal(n2.pages[0].bgY, 50);
assert.equal(n2.pages[0].bgScale, 100);
assert.equal(n2.pages[0].bgImage, null);

const n3 = normalizeStoriesDoc({
  kind: 'stories',
  pages: [{
    id: 'p2',
    bgImage: 'data:image/png;base64,xx',
    bgX: 20,
    bgY: 80,
    bgScale: 150,
    blocks: [{ type: 'text', col: 'full', html: 'oi' }],
  }],
});
assert.equal(n3.pages[0].bgImage, 'data:image/png;base64,xx');
assert.equal(n3.pages[0].bgX, 20);
assert.equal(n3.pages[0].bgY, 80);
assert.equal(n3.pages[0].bgScale, 150);
// clamp de escala (cover mínimo 100, máximo 250)
const n4 = normalizeStoriesDoc({
  kind: 'stories',
  pages: [{ bgScale: 50, bgX: -10, bgY: 200, blocks: [] }],
});
assert.equal(n4.pages[0].bgScale, 100);
assert.equal(n4.pages[0].bgX, 0);
assert.equal(n4.pages[0].bgY, 100);

const tb0 = mkBlock('text');
assert.equal(tb0.col, undefined); // sem colunas
assert.equal(tb0.x, 0);
assert.equal(tb0.scale, 100);
assert.equal(tb0.size, 24);
assert.equal(tb0.rotate, undefined); // rotação aditiva
const ib0 = mkBlock('image');
assert.equal(ib0.radius, 4);
assert.equal(ib0.scale, 100);
assert.equal(ib0.x, 0);
assert.equal(ib0.shadow, 0);
assert.equal(ib0.border, undefined); // borda opcional
assert.equal(ib0.rotate, undefined);
assert.equal(ib0.chart, undefined);
// chart = imagem + b.chart (mesmo contrato do Diagramador)
const cb0 = mkBlock('chart');
assert.equal(cb0.type, 'image');
assert.equal(cb0.chart?.kind, 'chart');
assert.equal(cb0.chart?.spec, null); // placeholder até o modal
assert.equal(cb0.src, null);
// sticker token (1º kind) — aditivo no .pdgm
const sk0 = mkBlock('sticker');
assert.equal(sk0.type, 'sticker');
assert.equal(sk0.sticker, 'token');
assert.equal(sk0.symbol, 'btc');
assert.equal(sk0.scale, DEFAULT_STICKER_SCALE);
assert.equal(sk0.h, DEFAULT_STICKER_H);
assert.equal(sk0.x, 0);
assert.equal(sk0.rotate, undefined);
assert.equal(clampStickerKind('nope'), 'token');
assert.equal(clampStickerSymbol(' ETH '), 'eth');
assert.equal(clampStickerSymbol(''), 'btc');
const nSticker = normalizeStoriesDoc({
  kind: 'stories',
  pages: [{
    blocks: [
      { type: 'sticker', symbol: 'SOL', scale: 40 },
      { type: 'sticker' }, // defaults
      { type: 'sticker', sticker: 'weird', symbol: '??', rotate: 15 },
    ],
  }],
});
assert.equal(nSticker.pages[0].blocks[0].type, 'sticker');
assert.equal(nSticker.pages[0].blocks[0].sticker, 'token');
assert.equal(nSticker.pages[0].blocks[0].symbol, 'sol');
assert.equal(nSticker.pages[0].blocks[0].scale, 40);
assert.equal(nSticker.pages[0].blocks[1].symbol, 'btc');
assert.equal(nSticker.pages[0].blocks[1].scale, DEFAULT_STICKER_SCALE);
assert.equal(nSticker.pages[0].blocks[2].sticker, 'token');
assert.equal(nSticker.pages[0].blocks[2].symbol, 'btc'); // ?? limpo
assert.equal(nSticker.pages[0].blocks[2].rotate, 15);
assert.equal(blockLayerLabel({ type: 'sticker', sticker: 'token', symbol: 'eth' }), 'Token ETH');
// catálogo de ícones (mesma base mexc-bot)
assert.ok(COIN_SYMBOLS.length > 100);
assert.ok(isKnownCoinSymbol('btc'));
assert.ok(isKnownCoinSymbol('ETH'));
assert.equal(clampCoinSymbol('unknown-xyz'), DEFAULT_COIN_SYMBOL);
assert.equal(normalizeCoinSymbol(' BtC '), 'btc');
assert.equal(coinIconPath('eth'), 'coin-icons/eth.svg');
assert.equal(coinLabel('btc'), 'Bitcoin');
assert.ok(COIN_POPULAR.includes('btc'));
assert.ok(filterCoinIcons('bit').some((c) => c.symbol === 'btc'));
assert.ok(filterCoinIcons('zzzznotoken').length === 0);
assert.equal(n2.pages[0].blocks[0].shadow, 0);
assert.equal(imgBorderOf({}), 0);
assert.equal(imgBorderColorOf({}), '#FFFFFF');
assert.equal(imgBorderOf({ border: 8 }), 8);
assert.equal(imgBorderOf({ border: 99 }), 24); // clamp
const nImgBorder = normalizeStoriesDoc({
  kind: 'stories',
  pages: [{ blocks: [{ type: 'image', border: 4, borderColor: '#FF0000' }] }],
});
assert.equal(nImgBorder.pages[0].blocks[0].border, 4);
assert.equal(nImgBorder.pages[0].blocks[0].borderColor, '#FF0000');
// border 0 no open → campo omitido
const nImgBorder0 = normalizeStoriesDoc({
  kind: 'stories',
  pages: [{ blocks: [{ type: 'image', border: 0, borderColor: '#fff' }] }],
});
assert.equal(nImgBorder0.pages[0].blocks[0].border, undefined);

// ── tipografia global + efeitos de texto (aditivos) ─────────────────────────
// default mais apertado que o −0.01 legado (títulos de story)
assert.equal(TEXT_STYLE_DEFAULTS.letterSpacing, -0.03);
assert.equal(textLetterSpacingOf(seed), -0.03);
assert.equal(textLetterSpacingOf({}), -0.03);
assert.equal(textLetterSpacingOf({ blockStyles: { text: { letterSpacing: -0.05 } } }), -0.05);
assert.equal(clampLetterSpacing(-1), -0.08);
assert.equal(clampLetterSpacing(1), 0.15);
// doc antigo sem blockStyles/hiliteStyle não quebra
assert.deepEqual(seed.blockStyles, {});
assert.equal(seed.hiliteStyle, 'solid');
const nLs = normalizeStoriesDoc({
  kind: 'stories',
  blockStyles: { text: { letterSpacing: -0.05 } },
  hiliteStyle: 'brush',
  pages: [{ blocks: [{ type: 'text', html: 'x', textBorder: 2, textBorderColor: '#fff', textShadow3d: 50, textShadow3dColor: '#111' }] }],
});
assert.equal(nLs.blockStyles.text.letterSpacing, -0.05);
assert.equal(nLs.hiliteStyle, 'brush');
assert.equal(nLs.pages[0].blocks[0].textBorder, 2);
assert.equal(nLs.pages[0].blocks[0].textShadow3d, 50);
assert.equal(nLs.pages[0].blocks[0].textBorderColor, '#fff');
// border/sombra 0 ou ausentes → campos omitidos
const nFx0 = normalizeStoriesDoc({
  kind: 'stories',
  pages: [{ blocks: [{ type: 'text', html: 'y', textBorder: 0, textShadow3d: 0 }] }],
});
assert.equal(nFx0.pages[0].blocks[0].textBorder, undefined);
assert.equal(nFx0.pages[0].blocks[0].textShadow3d, undefined);
assert.equal(textBorderOf({}), 0);
assert.equal(textShadow3dOf({}), 0);
const fx = textEffectsCss({ textBorder: 2, textBorderColor: '#fff', textShadow3d: 50, textShadow3dColor: '#000' });
assert.ok(fx.textShadow && fx.textShadow !== 'none');
assert.ok(fx.webkitTextStroke.includes('2px'));
assert.equal(fx.paintOrder, 'stroke fill');
assert.equal(textEffectsCss({}).textShadow, 'none');
// borda: anéis densos (>> 8 sombras de 45°) → cantos conectados/arredondados
const outline = textOutlineShadows(2, '#fff');
assert.ok(outline.length > 8);
// r=1: max(16,8)=16 · r=2: max(16,16)=16 → ≥32 amostras
assert.ok(outline.length >= 32);
assert.equal(textOutlineShadows(0, '#fff').length, 0);
assert.equal(clampHiliteStyle('marker'), 'marker');
assert.equal(clampHiliteStyle('none'), 'none');
assert.equal(clampHiliteStyle('nope'), 'solid');
assert.ok(HILITE_STYLES.includes('brush'));
assert.ok(HILITE_STYLES.includes('none'));
assert.equal(hiliteStyleLabel('brush'), 'Pincel');
assert.equal(hiliteStyleLabel('none'), 'Nenhum');
assert.equal(HILITE_STYLE_LABELS.solid, 'Sólido');
assert.equal(HILITE_STYLE_LABELS.rounded, 'Pill');
// pincel: máscara no ::before (texto não perde opacidade) + textura sutil
assert.ok(HILITE_BRUSH_MASK.startsWith('data:image/svg+xml,'));
assert.ok(HILITE_BRUSH_MASK.includes('ellipse'));
const brushCss = hiliteBrushCss();
assert.ok(brushCss.includes('mask-image'));
assert.ok(brushCss.includes('var(--hl'));
assert.ok(brushCss.includes('::before')); // tinta atrás do glifo
assert.ok(brushCss.includes('hl-prev-brush'));
assert.ok(brushCss.includes('skewX')); // marcador em diagonal
assert.ok(brushCss.includes('999px')); // pill de verdade
// hilite inválido no open → solid
assert.equal(normalizeStoriesDoc({ kind: 'stories', hiliteStyle: 'xyz', pages: [{}] }).hiliteStyle, 'solid');
assert.equal(normalizeStoriesDoc({ kind: 'stories', hiliteStyle: 'none', pages: [{}] }).hiliteStyle, 'none');


assert.equal(clampPageIndex(99, 3), 2);
assert.equal(isStoriesDoc(seed), true);

// ── rotação de bloco (aditiva + ímã) ─────────────────────────────────────────
assert.equal(ROTATE_SNAP_STEP, 15);
assert.equal(ROTATE_SNAP_THRESH, 4);
assert.ok(ROTATE_SNAPS.includes(0));
assert.ok(ROTATE_SNAPS.includes(15));
assert.ok(ROTATE_SNAPS.includes(30));
assert.ok(ROTATE_SNAPS.includes(45));
assert.ok(ROTATE_SNAPS.includes(90));
assert.ok(ROTATE_SNAPS.includes(180));
assert.ok(ROTATE_SNAPS.includes(-45));
assert.equal(clampRotate(0), 0);
assert.equal(clampRotate(45), 45);
assert.equal(clampRotate(360), 0);
assert.equal(clampRotate(370), 10);
assert.equal(clampRotate(-190), 170);
assert.equal(clampRotate(180), 180);
assert.equal(clampRotate(-180), 180);
assert.equal(clampRotate(NaN), 0);
assert.equal(clampRotate(undefined), 0);
assert.equal(rotateOf({}), 0);
assert.equal(rotateOf({ rotate: 45 }), 45);
assert.equal(rotateOf({ rotate: 400 }), 40); // 400 → 40
assert.equal(rotateDist(0, 10), 10);
assert.equal(rotateDist(170, -170), 20);
assert.equal(snapRotate(0), 0);
assert.equal(snapRotate(2), 0); // ímã em 0
assert.equal(snapRotate(14), 15);
assert.equal(snapRotate(43), 45);
assert.equal(snapRotate(88), 90);
assert.equal(snapRotate(178), 180);
assert.equal(snapRotate(-2), 0);
assert.equal(snapRotate(7), 7); // meio do vão 0–15, livre
assert.equal(snapRotate(7.4), 7);
// setBlockRotate: 0 apaga o campo
const rotBlk = { id: 'r1', type: 'text' };
setBlockRotate(rotBlk, 45);
assert.equal(rotBlk.rotate, 45);
setBlockRotate(rotBlk, 1); // ímã não aplica aqui — grava o valor clampado
assert.equal(rotBlk.rotate, 1);
setBlockRotate(rotBlk, 0);
assert.equal(rotBlk.rotate, undefined);
// normalize preserva rotate ≠ 0 e omite 0
const nRot = normalizeStoriesDoc({
  kind: 'stories',
  pages: [{
    blocks: [
      { type: 'text', html: 'a', rotate: 45 },
      { type: 'image', rotate: 0 },
      { type: 'image', rotate: -90 },
      { type: 'text', html: 'b' }, // sem campo
    ],
  }],
});
assert.equal(nRot.pages[0].blocks[0].rotate, 45);
assert.equal(nRot.pages[0].blocks[1].rotate, undefined);
assert.equal(nRot.pages[0].blocks[2].rotate, -90);
assert.equal(nRot.pages[0].blocks[3].rotate, undefined);
// doc antigo sem rotate não quebra
assert.equal(normalizeStoriesDoc({
  kind: 'stories',
  pages: [{ blocks: [{ type: 'text', html: 'x' }] }],
}).pages[0].blocks[0].rotate, undefined);
// canto TR sem rotação: centro + halfW / −halfH
assert.deepEqual(rotatedBoxCorner(100, 100, 40, 20, 0, 'tr'), { x: 140, y: 80 });
// 90° horário (CSS: y↓): TR → canto inferior direito do AABB local
const c90 = rotatedBoxCorner(0, 0, 40, 20, 90, 'tr');
assert.ok(Math.abs(c90.x - 20) < 1e-9);
assert.ok(Math.abs(c90.y - 40) < 1e-9);
// pad empurra para fora (afasta do centro)
const cPad = rotatedBoxCorner(0, 0, 30, 40, 0, 'tr', 10);
assert.ok(cPad.x > 30 && cPad.y < -40);

// ── layout freestyle: migração col → x+scale ────────────────────────────────
const half = sr.w / 2;
assert.deepEqual(migrateBlockLayout({ col: 'full', scale: 100 }), { x: 0, scale: 100 });
assert.deepEqual(migrateBlockLayout({ col: 'left', scale: 100 }), { x: 0, scale: 50 });
assert.deepEqual(migrateBlockLayout({ col: 'right', scale: 100 }), { x: half, scale: 50 });
// imgAlign center no full com scale 50 → x centralizado
const mid = migrateBlockLayout({ col: 'full', scale: 50, imgAlign: 'center', type: 'image' });
assert.equal(mid.scale, 50);
assert.equal(mid.x, Math.round((sr.w - sr.w * 0.5) / 2));
// x já presente: não remigra col
assert.deepEqual(migrateBlockLayout({ x: 40, scale: 70, col: 'right' }), { x: 40, scale: 70 });
// normalize: left/right → x; sem campo col no open
const nCol = normalizeStoriesDoc({
  kind: 'stories',
  pages: [{
    blocks: [
      { type: 'image', col: 'right', scale: 100, h: 100 },
      { type: 'text', col: 'left', html: 'hi' },
      { type: 'image', x: 12, scale: 40 },
    ],
  }],
});
assert.equal(nCol.pages[0].blocks[0].x, half);
assert.equal(nCol.pages[0].blocks[0].scale, 50);
assert.equal(nCol.pages[0].blocks[0].col, undefined);
assert.equal(nCol.pages[0].blocks[1].x, 0);
assert.equal(nCol.pages[0].blocks[1].scale, 50);
assert.equal(nCol.pages[0].blocks[1].col, undefined);
assert.equal(nCol.pages[0].blocks[2].x, 12);
assert.equal(nCol.pages[0].blocks[2].scale, 40);
assert.equal(blockWidthPx({ scale: 50 }), sr.w * 0.5);
assert.equal(blockScaleOf({ scale: 80 }), 80);

// ── perspectiva 3D (tilt) em imagem/gráfico ──────────────────────────────────
assert.equal(TILT_MAX, 60);
assert.equal(clampTilt(0), 0);
assert.equal(clampTilt(30), 30);
assert.equal(clampTilt(-45), -45);
assert.equal(clampTilt(99), 60);
assert.equal(clampTilt(-99), -60);
assert.equal(clampTilt(NaN), 0);
assert.equal(tiltOf({}), 0);
assert.equal(tiltOf({ tilt: 25 }), 25);
assert.equal(imgTiltCss({}), '');
assert.ok(imgTiltCss({ tilt: 30 }).includes('perspective('));
assert.ok(imgTiltCss({ tilt: 30 }).includes('rotateY(30deg)'));
const tiltBlk = { type: 'image' };
setBlockTilt(tiltBlk, 20);
assert.equal(tiltBlk.tilt, 20);
setBlockTilt(tiltBlk, 0);
assert.equal(tiltBlk.tilt, undefined);
const nTilt = normalizeStoriesDoc({
  kind: 'stories',
  pages: [{
    blocks: [
      { type: 'image', tilt: 30 },
      { type: 'image', tilt: 0 },
      { type: 'text', html: 'x', tilt: 40 }, // texto ignora tilt no normalize
    ],
  }],
});
assert.equal(nTilt.pages[0].blocks[0].tilt, 30);
assert.equal(nTilt.pages[0].blocks[1].tilt, undefined);
assert.equal(nTilt.pages[0].blocks[2].tilt, undefined);

// ── layers / z-order (índice maior = na frente) ─────────────────────────────
const layerIds = () => stack.map((b) => b.id);
const stack = [
  { id: 'a', type: 'text', html: '<b>Olá</b> mundo' },
  { id: 'b', type: 'image' },
  { id: 'c', type: 'text', html: '' },
];
reorderBlocks(stack, 0, 2);
assert.deepEqual(layerIds(), ['b', 'c', 'a']); // a foi pra frente
reorderBlocks(stack, 2, 0);
assert.deepEqual(layerIds(), ['a', 'b', 'c']);
nudgeBlockZ(stack, 'a', 1);
assert.deepEqual(layerIds(), ['b', 'a', 'c']);
bringBlockToFront(stack, 'b');
assert.deepEqual(layerIds(), ['a', 'c', 'b']);
sendBlockToBack(stack, 'b');
assert.deepEqual(layerIds(), ['b', 'a', 'c']);
// drop: a na frente de b (lista UI: topo = frente)
moveBlockRelative(stack, 'a', 'b', 'front');
assert.deepEqual(layerIds(), ['b', 'a', 'c']);
moveBlockRelative(stack, 'c', 'b', 'back');
assert.deepEqual(layerIds(), ['c', 'b', 'a']);
// bordas / no-op
assert.deepEqual(reorderBlocks([...stack], 1, 1).map((b) => b.id), layerIds());
bringBlockToFront(stack, 'a'); // já na frente
assert.deepEqual(layerIds(), ['c', 'b', 'a']);
assert.equal(blockLayerLabel({ type: 'image' }), 'Imagem');
assert.equal(blockLayerLabel({ type: 'image', chart: { kind: 'chart', spec: null } }), 'Gráfico');
assert.equal(blockLayerLabel({ type: 'image', chart: { kind: 'timeline', spec: {} } }), 'Linha do tempo');
assert.equal(blockLayerLabel({ type: 'text', html: '' }), 'Texto');
assert.equal(blockLayerLabel({ type: 'text', html: '<b>Olá</b> mundo' }), 'Olá mundo');
assert.ok(blockLayerLabel({ type: 'text', html: 'x'.repeat(40) }).endsWith('…'));
assert.ok(blockLayerLabel({ type: 'text', html: 'x'.repeat(40) }).length <= 28);

// ── chart: normalize preserva kind/spec (reedição + zip) ────────────────────
const chartSpec = { type: 'line', title: 'Preço', labels: ['jan'], series: [{ name: 'btc', data: [1] }] };
const nChart = normalizeStoriesDoc({
  kind: 'stories',
  pages: [{
    blocks: [
      { type: 'image', src: 'data:image/svg+xml,x', chart: { kind: 'chart', spec: chartSpec } },
      { type: 'image', src: 'data:image/svg+xml,y', chart: { kind: 'timeline', spec: { title: 'TL' } } },
      { type: 'image', src: 'data:image/png,z' }, // sem chart
      { type: 'image', chart: { kind: 'chart', spec: null } }, // placeholder
    ],
  }],
});
assert.deepEqual(nChart.pages[0].blocks[0].chart, { kind: 'chart', spec: chartSpec });
assert.equal(nChart.pages[0].blocks[1].chart.kind, 'timeline');
assert.equal(nChart.pages[0].blocks[1].chart.spec.title, 'TL');
assert.equal(nChart.pages[0].blocks[2].chart, undefined);
assert.deepEqual(nChart.pages[0].blocks[3].chart, { kind: 'chart', spec: null });

// ── snap X/Y (arraste freestyle) ────────────────────────────────────────────
assert.equal(BLOCK_SNAP_PX, 6);
const safeH = safeRect('stories').h;
const peers = [
  { id: 'img', type: 'image', y: 100, h: 200, x: 40, scale: 50 },
  { id: 'txt', type: 'text', y: 0, x: 0 },
];
const targets = collectBlockSnapTargets(peers, 'txt', safeH, (b) => (b.type === 'image' ? b.h : 40));
// centro da tela + topo/meio/base da imagem + o próprio texto excluído
assert.ok(targets.includes(safeH / 2));
assert.ok(targets.includes(0));
assert.ok(targets.includes(100)); // topo imagem
assert.ok(targets.includes(200)); // mid imagem 100+100
assert.ok(targets.includes(300)); // base imagem
// snap: centro do texto (h=40) no topo da imagem (100) → y = 100 - 20 = 80
const hitMidTop = snapBlockY(82, 40, [100], BLOCK_SNAP_PX);
assert.equal(hitMidTop.y, 80);
assert.equal(hitMidTop.guide, 100);
assert.equal(hitMidTop.kind, 'mid');
// start no alvo
const hitTop = snapBlockY(102, 40, [100], BLOCK_SNAP_PX);
assert.equal(hitTop.y, 100);
assert.equal(hitTop.kind, 'start');
// end no alvo: y + 40 = 100 → y = 60
const hitBot = snapBlockY(58, 40, [100], BLOCK_SNAP_PX);
assert.equal(hitBot.y, 60);
assert.equal(hitBot.kind, 'end');
// longe do alvo: sem snap
const miss = snapBlockY(50, 40, [200], BLOCK_SNAP_PX);
assert.equal(miss.y, 50);
assert.equal(miss.guide, null);
// centro da safe area
const midScreen = safeH / 2;
const hitCenter = snapBlockY(midScreen - 20 + 2, 40, [midScreen], BLOCK_SNAP_PX);
assert.equal(hitCenter.y, Math.round(midScreen - 20));
assert.equal(hitCenter.kind, 'mid');
// eixo X
const safeW = sr.w;
const xTargets = collectBlockSnapTargetsX(peers, 'txt', safeW, (b) => blockWidthPx(b));
assert.ok(xTargets.includes(0));
assert.ok(xTargets.includes(safeW / 2));
assert.ok(xTargets.includes(40)); // left da imagem
const hitX = snapBlockX(42, 50, [40], BLOCK_SNAP_PX);
assert.equal(hitX.x, 40);
assert.equal(hitX.kind, 'start');

// ── logo Paradigma (doc.logo) ───────────────────────────────────────────────
const logo0 = defaultStoriesLogo();
assert.equal(logo0.on, false);
assert.equal(logo0.kind, 'nome');
assert.equal(logo0.pos, 'header');
assert.equal(seed.logo.on, false);
const nLogo = normalizeStoriesDoc({
  kind: 'stories',
  logo: { on: true, kind: 'icone', pos: 'footer', align: 'center', color: '#FFFFFF', size: 1.5 },
  pages: [{}],
});
assert.equal(nLogo.logo.on, true);
assert.equal(nLogo.logo.kind, 'icone');
assert.equal(nLogo.logo.pos, 'footer');
assert.equal(nLogo.logo.align, 'center');
assert.equal(nLogo.logo.size, 1.5);
// doc antigo sem logo → default off
const nNoLogo = normalizeStoriesDoc({ kind: 'stories', pages: [{}] });
assert.equal(nNoLogo.logo.on, false);
assert.equal(normalizeStoriesLogo({ kind: 'nope', on: true }).kind, 'nome');
assert.equal(normalizeStoriesLogo({ on: true, kind: 'full', size: 9 }).size, 2.6);

console.log('test-stories: ok');
