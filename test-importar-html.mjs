/* Self-check das funções puras do importador (node test-importar-html.mjs).
 * Não cobre parseChartHtml (precisa de DOM) — cobre o núcleo: número, vértices
 * do path e calibração, que é onde a lógica quebraria calada. */
import { strict as assert } from 'node:assert';
import { parseNumber, pathVertices, calibrate } from './importar-html.js';

// número com sufixo de magnitude + decimais pt/US
assert.equal(parseNumber('1.50T'), 1.5e12);
assert.equal(parseNumber('3.00T'), 3e12);
assert.equal(parseNumber('0.00'), 0);
assert.equal(parseNumber('45%'), 45);
assert.equal(parseNumber('US$ 1.2B'), 1.2e9);
assert.equal(parseNumber('2 mil'), 2000);
assert.equal(parseNumber('1.234,5'), 1234.5);   // pt-BR
assert.ok(Number.isNaN(parseNumber('Others')));

// vértices: M + dois C; ponto de dado = fim de cada comando
const v = pathVertices('M70,269.999C72,269,74,269,76,268C78,267,80,266,82,45.446');
assert.deepEqual(v[0], { x: 70, y: 269.999 });
assert.deepEqual(v[v.length - 1], { x: 82, y: 45.446 });
assert.equal(v.length, 3);

// sparkline de card: M + L absolutos, fechado com Z (o Z não vira ponto)
const l = pathVertices('M0.00,196.61 L4.10,196.77 L8.20,197.15 L8.20,200.00 L0.00,200.00 Z');
assert.equal(l.length, 5);
assert.deepEqual(l[1], { x: 4.1, y: 196.77 });
// relativo + H/V
assert.deepEqual(pathVertices('m10,10 l5,5 h5 v-5'), [
  { x: 10, y: 10 }, { x: 15, y: 15 }, { x: 20, y: 15 }, { x: 20, y: 10 }]);
// coordenadas repetidas sem repetir a letra do comando
assert.equal(pathVertices('M0,0L1,1 2,2 3,3').length, 4);

// calibração px→valor pelos ticks reais do exemplo hyperscreener
const f = calibrate([{ px: 270, val: 0 }, { px: 0, val: 6e12 }]);
assert.ok(Math.abs(f(45.446) - 4.99e12) < 5e9);   // topo da curva ≈ 4.99T
assert.ok(Math.abs(f(269.999)) < 1e8);             // base ≈ 0
assert.equal(calibrate([{ px: 5, val: 1 }]), null); // 1 tick só → sem reta

console.log('ok');
