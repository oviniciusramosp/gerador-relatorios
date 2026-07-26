/* Self-check da escala logarítmica do eixo de valor (node test-escala-log.mjs).
 *
 * O que quebraria calado sem isso: a distância em log é de EXPOENTE, não de
 * valor — um erro aqui não dá exceção, só desenha o dado no lugar errado. E
 * log não tem zero: valor ≤ 0 vira NaN e some com a série inteira do SVG.
 */
import { strict as assert } from 'node:assert';
import { renderChart, symlog, symlogInv } from './chart.js';

const meta = (spec) => { const m = {}; renderChart({ width: 800, height: 400, ...spec }, { meta: m }); return m; };
const base = { type: 'line', labels: ['a', 'b', 'c'] };
const ticksDe = (spec) => {
  const svg = renderChart({ width: 800, height: 400, ...spec });
  return [...svg.matchAll(/text-anchor="end"[^>]*>([^<]+)</g)].map((m) => m[1]);
};

// ── domínio fecha em décadas redondas, não no dado cru ───────────────────────
const m = meta({ ...base, series: [{ name: 's', data: [1.2, 240, 52000] }], y: { scale: 'log' } });
assert.equal(m.scale.dMin, 1);
assert.equal(m.scale.dMax, 100000);
assert.equal(m.scale.log, true, 'o editor precisa saber que é log pra inverter o arraste');

// ── a posição é o EXPOENTE: 100 fica a 2 de 5 décadas do piso ────────────────
const pos = (v, sc) => (Math.log10(v) - Math.log10(sc.dMin)) / (Math.log10(sc.dMax) - Math.log10(sc.dMin));
assert.ok(Math.abs(pos(100, m.scale) - 0.4) < 1e-9);
assert.ok(Math.abs(pos(1, m.scale)) < 1e-9);            // piso
assert.ok(Math.abs(pos(100000, m.scale) - 1) < 1e-9);   // topo
// e NÃO é linear: no linear 100 de 1..100000 ficaria colado no chão (~0.001)
assert.ok(pos(100, m.scale) > 0.3, 'caiu na conta linear');

// ── nada de NaN com zero/negativo em nenhuma combinação ──────────────────────
for (const data of [[0, -5, 10, 1000], [0, 0, 0], [-1, -2], [-0.001, 0.5]]) {
  const svg = renderChart({ ...base, labels: data.map((_, i) => 'p' + i), series: [{ name: 's', data }], y: { scale: 'log' }, width: 600, height: 300 });
  assert.ok(!/NaN|Infinity/.test(svg), `NaN no SVG com data=${JSON.stringify(data)}`);
}
// série toda zero não tem log nem symlog possível → cai no linear, sem explodir
const zeros = meta({ ...base, series: [{ name: 's', data: [0, 0, 0] }], y: { scale: 'log' } }).scale;
assert.equal(zeros.log, false); assert.equal(zeros.sym, false);

// ── SYMLOG: log que atravessa o zero (log puro não existe pra negativo) ──────
const sm = meta({ ...base, series: [{ name: 's', data: [-52000, -4, 0, 900, 41000] }], y: { scale: 'log' } });
assert.equal(sm.scale.sym, true, 'com negativo tem que virar symlog, não log puro');
assert.equal(sm.scale.log, false);
assert.ok(sm.scale.dMin < 0 && sm.scale.dMax > 0, 'o domínio precisa cobrir os dois sinais');

// simetria: -X e +X ficam à mesma distância do zero, em lados opostos
const p = (v) => (symlog(v, sm.scale.T) - symlog(sm.scale.dMin, sm.scale.T))
  / (symlog(sm.scale.dMax, sm.scale.T) - symlog(sm.scale.dMin, sm.scale.T));
assert.ok(Math.abs((p(0) - p(-1000)) - (p(1000) - p(0))) < 1e-9, 'symlog não ficou simétrico');
assert.ok(Math.abs(p(0) - 0.5) < 1e-9, 'domínio simétrico → zero no meio do eixo');
// e continua comprimindo ordem de grandeza: de 1 pra 1000 anda menos que 1/3 do eixo
assert.ok(p(1000) - p(1) < 0.34);

// ida e volta exata + continuidade na fronteira da faixa linear
for (const T of [0.001, 1, 100]) {
  for (const v of [-9999, -1.5, -T, 0, T, 1.5, 9999]) {
    assert.ok(Math.abs(symlogInv(symlog(v, T), T) - v) <= Math.abs(v) * 1e-9 + 1e-12,
      `ida-e-volta falhou em v=${v}, T=${T}`);
  }
  assert.equal(symlog(T, T), 1);     // as duas metades da fórmula se encontram
  assert.equal(symlog(-T, T), -1);   // sem degrau na curva
  assert.equal(symlog(0, T), 0);
}

// o zero SEMPRE entra nos ticks: é onde o dado troca de sinal
for (const data of [[-100, 50], [-1, -9000], [3, -0.5]]) {
  const t = meta({ ...base, series: [{ name: 's', data }], y: { scale: 'log' } });
  assert.ok(t.scale.dMin <= 0 && t.scale.dMax >= 0, `zero fora do domínio com ${JSON.stringify(data)}`);
}

// rótulo de tick não pode colapsar: em eixo de funding as 2 casas padrão
// viravam "0", "-0" e "0" três vezes no mesmo eixo
const svgF = renderChart({ ...base, labels: ['a', 'b', 'c'], series: [{ name: 's', data: [-0.05, 0.001, 0.3] }], y: { scale: 'log' }, width: 800, height: 400 });
const tf = [...svgF.matchAll(/text-anchor="end"[^>]*>([^<]+)</g)].map((m) => m[1]);
assert.equal(tf.length, new Set(tf).size, `rótulos duplicados no eixo: ${tf.join(' ')}`);
assert.ok(tf.includes('0,001'), `esperava 0,001 legível, veio: ${tf.join(' ')}`);

// ── densidade dos ticks acompanha o alcance (1 década cheia vs 5 enxuta) ─────
assert.deepEqual(ticksDe({ ...base, series: [{ name: 's', data: [3, 7] }], y: { scale: 'log' } }),
  ['1', '2', '3', '5', '7', '10']);
assert.deepEqual(ticksDe({ ...base, series: [{ name: 's', data: [1, 52000] }], y: { scale: 'log' } }),
  ['1', '10', '100', '1.000', '10.000', '100.000']);   // 5 décadas: só as potências
// com format compact os mesmos ticks saem legíveis (o formato é ortogonal à escala)
assert.deepEqual(ticksDe({ ...base, series: [{ name: 's', data: [1, 52000] }], y: { scale: 'log', format: 'compact' } }),
  ['1', '10', '100', '1 mil', '10 mil', '100 mil']);

// ── stacked100 nunca vira log (a soma É a escala; empilhar em log mentiria) ──
assert.equal(meta({ type: 'stacked100', labels: ['a'], series: [{ name: 's', data: [50] }, { name: 't', data: [50] }], y: { scale: 'log' } }).scale.log, false);

// ── min/max manual (o editor congela o eixo assim) vale em log se for > 0 ────
const fix = meta({ ...base, series: [{ name: 's', data: [5, 500] }], y: { scale: 'log', min: 1, max: 1000 } });
assert.equal(fix.scale.dMin, 1); assert.equal(fix.scale.dMax, 1000);
// min ≤ 0 é impossível em log — tem que ser ignorado, não aceito
assert.ok(meta({ ...base, series: [{ name: 's', data: [5, 500] }], y: { scale: 'log', min: 0 } }).scale.dMin > 0);

// ── linear continua intacto (a mudança não pode vazar pro caminho normal) ────
const lin = meta({ ...base, series: [{ name: 's', data: [0, 50, 100] }], y: {} });
assert.equal(lin.scale.log, false);
assert.equal(lin.scale.dMin, 0);

console.log('ok — escala log (domínio, expoente, densidade) + symlog (simetria, ida-e-volta, zero no eixo, rótulo legível) + linear intacto');
