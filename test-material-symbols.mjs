/**
 * Material Symbols + Tabler Icons — famílias e eixos.
 *
 * Sem este teste quebraria calado:
 * - defaults poluindo JSON (weight 400 gravado)
 * - shape rounded/sharp sem classe CSS correta
 * - family tabler sem gravar / sem classe ti
 * - applyMaterialOpts de header vs bloco trocando campos
 * - sanitize de nome inválido
 */
import assert from 'node:assert/strict';
import {
  MATERIAL_SYMBOLS, TABLER_ICONS, normalizeMaterialName, normalizeTablerName,
  materialIconHtml, iconHtml, tablerIconHtml,
  materialOptsFrom, applyMaterialOpts, normalizeMsOpts, materialClassForShape,
  MS_DEFAULTS, clampMsWeight, clampMsGrade, clampMsOpsz, clampTablerStroke,
  mapIconName, resolveIconName, switchIconFamily, MS_TO_TABLER,
} from './material-symbols.js';

assert.ok(MATERIAL_SYMBOLS.length >= 2000, `Material lista completa esperada, got ${MATERIAL_SYMBOLS.length}`);
assert.ok(TABLER_ICONS.length >= 4000, `Tabler lista completa esperada, got ${TABLER_ICONS.length}`);
assert.ok(MATERIAL_SYMBOLS.includes('home'));
assert.ok(MATERIAL_SYMBOLS.includes('rocket_launch'));
assert.ok(TABLER_ICONS.includes('star'));
assert.equal(normalizeMaterialName('Rocket Launch'), 'rocket_launch');
assert.equal(normalizeTablerName('brand_tabler'), 'brand-tabler');

const html = materialIconHtml('star', {
  size: 24, color: '#4E39FF', fill: true, weight: 500, grade: 50, opsz: 32, shape: 'rounded',
});
assert.ok(html.includes('material-symbols-rounded'));
assert.ok(html.includes("'FILL' 1"));
assert.ok(html.includes("'wght' 500"));
assert.ok(html.includes("'GRAD' 50"));
assert.ok(html.includes("'opsz' 32"));
assert.ok(html.includes('star'));

const th = tablerIconHtml('home', { size: 28, color: '#112233' });
assert.ok(th.includes('ti ti-home'));
assert.ok(th.includes('28px'));
assert.ok(iconHtml('star', { family: 'tabler', fill: true }).includes('ti-star'));
// Tabler: sem filled no produto; stroke em px
assert.ok(!tablerIconHtml('home-filled', { stroke: 2 }).includes('ti-home-filled'));
assert.ok(tablerIconHtml('home', { stroke: 2.5 }).includes('data-stroke="2.5"'));
assert.equal(clampTablerStroke(0), 1);
assert.equal(clampTablerStroke(9), 3);
assert.equal(clampTablerStroke(1.7), 1.5);

assert.equal(materialClassForShape('sharp'), 'material-symbols-sharp');
assert.equal(materialClassForShape('outlined'), 'material-symbols-outlined');
assert.equal(materialIconHtml('<script>'), '');

// opts defaults
const d = normalizeMsOpts({});
assert.equal(d.weight, 400);
assert.equal(d.grade, 0);
assert.equal(d.fill, false);
assert.equal(d.shape, 'outlined');

// bloco icon: defaults não poluem
{
  const b = { type: 'icon', icon: 'star' };
  applyMaterialOpts(b, { weight: 400, fill: false, shape: 'outlined' }, 'icon');
  assert.equal(b.weight, undefined);
  assert.equal(b.fill, undefined);
  assert.equal(b.shape, undefined);
  applyMaterialOpts(b, { weight: 700, fill: true, shape: 'rounded', grade: 100, opsz: 40 }, 'icon');
  assert.equal(b.weight, 700);
  assert.equal(b.fill, true);
  assert.equal(b.shape, 'rounded');
  assert.equal(b.grade, 100);
  assert.equal(b.opsz, 40);
  const o = materialOptsFrom(b, 'icon');
  assert.equal(o.weight, 700);
  assert.equal(o.shape, 'rounded');
  applyMaterialOpts(b, { family: 'tabler' }, 'icon');
  assert.equal(b.family, 'tabler');
  assert.equal(materialOptsFrom(b, 'icon').family, 'tabler');
  // Tabler limpa eixos Material (fill/weight/shape) e aceita stroke em px
  assert.equal(b.fill, undefined);
  assert.equal(b.weight, undefined);
  assert.equal(b.shape, undefined);
  applyMaterialOpts(b, { stroke: 1.5 }, 'icon');
  assert.equal(b.stroke, 1.5);
  applyMaterialOpts(b, { stroke: 2 }, 'icon');
  assert.equal(b.stroke, undefined); // default some do JSON
  applyMaterialOpts(b, { family: 'material' }, 'icon');
  assert.equal(b.family, undefined);
}

// header: campos icon*
{
  const b = { type: 'h1', icon: 'rocket_launch' };
  applyMaterialOpts(b, { fill: true, weight: 600, shape: 'sharp', color: '#112233' }, 'head');
  assert.equal(b.iconFill, true);
  assert.equal(b.iconWeight, 600);
  assert.equal(b.iconShape, 'sharp');
  assert.equal(b.iconColor, '#112233');
  assert.equal(b.fill, undefined); // não vaza pro modo icon
  const o = materialOptsFrom(b, 'head');
  assert.equal(o.fill, true);
  assert.equal(o.shape, 'sharp');
}

assert.equal(clampMsWeight(50), 100);
assert.equal(clampMsWeight(900), 700);
assert.equal(clampMsGrade(-100), -50);
assert.equal(clampMsOpsz(10), 20);

// cross-map Material ↔ Tabler (sem isto, alternar lib perde o glifo)
assert.ok(Object.keys(MS_TO_TABLER).length >= 500, 'mapa Material→Tabler deve ser denso');
assert.equal(mapIconName('star', 'material', 'tabler'), 'star');
assert.equal(mapIconName('favorite', 'material', 'tabler'), 'heart');
assert.equal(mapIconName('delete', 'material', 'tabler'), 'trash');
assert.equal(mapIconName('home', 'material', 'tabler'), 'home');
assert.equal(mapIconName('heart', 'tabler', 'material'), 'favorite');
assert.equal(mapIconName('trash', 'tabler', 'material'), 'delete');
assert.equal(resolveIconName('favorite', 'tabler'), 'heart');
assert.equal(resolveIconName('heart', 'material'), 'favorite');
// applyMaterialOpts troca family → remapeia icon
{
  const b = { type: 'icon', icon: 'favorite' };
  applyMaterialOpts(b, { family: 'tabler' }, 'icon');
  assert.equal(b.family, 'tabler');
  assert.equal(b.icon, 'heart');
  applyMaterialOpts(b, { family: 'material' }, 'icon');
  assert.equal(b.family, undefined);
  assert.equal(b.icon, 'favorite');
}
// switchIconFamily (header)
{
  const b = { type: 'h1', icon: 'star' };
  const r = switchIconFamily(b, 'tabler', 'head');
  assert.equal(r.family, 'tabler');
  assert.equal(b.icon, 'star');
  assert.equal(b.iconFamily, 'tabler');
  switchIconFamily(b, 'material', 'head');
  assert.equal(b.icon, 'star');
  assert.equal(b.iconFamily, undefined);
}
// render com nome da outra lib ainda funciona
assert.ok(iconHtml('favorite', { family: 'tabler' }).includes('ti-heart'));
assert.ok(iconHtml('heart', { family: 'material' }).includes('favorite'));

console.log('test-material-symbols: ok');
