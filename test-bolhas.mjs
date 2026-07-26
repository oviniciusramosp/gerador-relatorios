/* Self-check do gráfico de bolhas (node test-bolhas.mjs).
 *
 * O erro que este formato comete calado é ler RAIO onde devia ler ÁREA: com
 * r ∝ valor, um valor 4× maior vira uma bolha 16× maior — o gráfico exagera
 * pelo próprio valor e ninguém percebe olhando. Depois vêm os de layout, que
 * também não lançam exceção: bolha fora da imagem e rótulo encavalado.
 */
import { strict as assert } from 'node:assert';
import { renderChart } from './chart.js';
// a UI (graficos.js) registra os Ionicons antes de renderizar; sem isso, aqui
// só existiriam os 36 da casa e ícones como `percent`/`swap` sairiam vazios
import { registerIcons } from './timeline-icons.js';
import { IONICONS_LIB } from './ionicons-lib.js';
registerIcons(IONICONS_LIB);

const B = (label, value, icon, group, cat) => ({ label, value, icon, group, cat });
const MERCADOS = [
  B('Taxas de Juros', 7.9e12, 'stats-chart', 'TRADFI', 'Derivativos'),
  B('Derivativos Forex', 7e12, 'swap-horizontal', 'TRADFI', 'Derivativos'),
  B('Forex Spot', 2.6e12, 'money', 'TRADFI', 'Spot'),
  B('Derivativos Ações', 1.8e12, 'trend-up', 'TRADFI', 'Derivativos'),
  B('Ações Spot', 840e9, 'chart-bar', 'TRADFI', 'Spot'),
  B('Derivativos', 200e9, 'trend-up', 'CRYPTO', 'Derivativos'),
  B('Spot', 130e9, 'coins', 'CRYPTO', 'Spot'),
  B('Opções', 3e9, 'options', 'CRYPTO', 'Derivativos'),
];
const CATS = { Derivativos: '#232B3B', Spot: '#D3D7DE' };
const base = { type: 'bubble', bubbles: MERCADOS, bubbleCats: CATS, y: { format: 'compact', prefix: 'US$ ' } };
const meta = (extra = {}) => { const m = {}; renderChart({ width: 1600, height: 700, ...base, ...extra }, { meta: m }); return m; };
const svgDe = (extra = {}) => renderChart({ width: 1600, height: 700, ...base, ...extra });

// ── ÁREA proporcional ao valor, não o raio ───────────────────────────────────
const m = meta();
assert.equal(m.bubbles.length, MERCADOS.length);
const r = (nome) => m.bubbles.find((b) => b.label === nome).r;
// 7,9 tri / 2,6 tri = 3,04× de valor → √3,04 = 1,74× de raio (e 3,04× de área)
const razaoValor = 7.9e12 / 2.6e12;
assert.ok(Math.abs(r('Taxas de Juros') / r('Forex Spot') - Math.sqrt(razaoValor)) < 0.02,
  `raio fora da regra: ${(r('Taxas de Juros') / r('Forex Spot')).toFixed(2)}× para √${razaoValor.toFixed(2)} = ${Math.sqrt(razaoValor).toFixed(2)}×`);
// a área é que fica proporcional
const area = (nome) => Math.PI * r(nome) ** 2;
assert.ok(Math.abs(area('Taxas de Juros') / area('Forex Spot') - razaoValor) / razaoValor < 0.02, 'área fora de proporção');
// e o erro clássico (raio proporcional) estaria MUITO longe disso
assert.ok(r('Taxas de Juros') / r('Forex Spot') < razaoValor / 1.5, 'parece que o raio virou proporcional ao valor');

// ── nada fora da imagem, e a imagem cresce quando o texto não cabe ───────────
const dentro = (larg, alt, extra = {}) => {
  const s_ = renderChart({ width: larg, height: alt, ...base, ...extra });
  const circulos = [...s_.matchAll(/<circle cx="([\d.-]+)" cy="([\d.-]+)" r="([\d.-]+)"/g)]
    .map((x) => ({ cx: +x[1], cy: +x[2], r: +x[3] }));
  for (const c of circulos) {
    assert.ok(c.cx - c.r >= -1 && c.cx + c.r <= larg + 1, `bolha fora na horizontal: cx=${c.cx} r=${c.r} (W=${larg})`);
    assert.ok(c.cy - c.r >= -1 && c.cy + c.r <= alt + 1, `bolha fora na vertical: cy=${c.cy} r=${c.r} (H=${alt})`);
  }
  const textos = [...s_.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)"/g)].map((x) => ({ x: +x[1], y: +x[2] }));
  for (const e of textos) assert.ok(e.y >= 0 && e.y <= alt + 1, `texto fora da imagem: y=${e.y}`);
  return circulos;
};
// na largura mínima cabe tudo; e o renderer AVISA quando a pedida é curta
assert.ok(meta({ width: 900 }).minWidth > 900, 'minWidth não avisou que 900px é estreito');
dentro(meta({ width: 900 }).minWidth, 700);
dentro(2200, 700);
dentro(1600, 420);          // imagem baixa: as bolhas encolhem em vez de vazar

/* ── rótulo de uma bolha não pode encavalar no da vizinha ────────────────────
 * A faixa de cada bolha é o maior entre o diâmetro e o texto: reservar só o
 * diâmetro fazia "Derivativos US$ 200 bi" (bolha de 6px) escrever por cima da
 * vizinha. Aqui a checagem é a distância entre centros contra a soma das
 * meias-larguras de texto. */
{
  const larg = meta().minWidth;
  const s_ = renderChart({ width: larg, height: 700, ...base });
  const rot = [...s_.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)" font-size="([\d.-]+)"[^>]*text-anchor="middle"[^>]*>([^<]+)</g)]
    .map((x) => ({ x: +x[1], y: +x[2], fs: +x[3], t: x[4] }));
  const porLinha = {};
  for (const e of rot) (porLinha[Math.round(e.y)] ||= []).push(e);
  for (const linha of Object.values(porLinha)) {
    const ord = linha.sort((a, b) => a.x - b.x);
    for (let i = 1; i < ord.length; i++) {
      const meia = (e) => e.t.length * e.fs * 0.53 * 0.9 / 2;
      assert.ok(ord[i].x - ord[i - 1].x >= meia(ord[i]) + meia(ord[i - 1]) - 1,
        `rótulos encavalados: "${ord[i - 1].t}" e "${ord[i].t}"`);
    }
  }
}

/* ── ícone: mesmo set da timeline, com TETO e PISO ───────────────────────────
 * `max` impede que o ícone domine a bolha gigante (o tamanho é o dado, não o
 * desenho); `min` é onde o traço vira borrão e é melhor não desenhar. A marca
 * d'água também é um <svg x=…>, então some do teste com watermark: none. */
const semMarca = { watermark: { logo: 'none' } };
const ladosDe = (extra) => [...svgDe({ ...semMarca, ...extra })
  .matchAll(/<svg x="[\d.-]+" y="[\d.-]+" width="([\d.]+)"/g)].map((m) => +m[1]);

const lados = ladosDe({});
assert.ok(lados.length >= 5, `ícones não foram desenhados: ${lados.length}`);
assert.ok(Math.max(...lados) <= 56 + 0.01, `ícone passou do teto padrão: ${Math.max(...lados)}px`);
// teto configurável, e ele MORDE de verdade na bolha grande
assert.ok(Math.max(...ladosDe({ bubbleIcon: { min: 13, max: 24 } })) <= 24.01, 'bubbleIcon.max ignorado');
assert.ok(Math.max(...ladosDe({ bubbleIcon: { min: 13, max: 90 } })) > 56, 'teto maior deveria deixar o ícone crescer');
// piso: subindo o mínimo, os ícones das bolhas pequenas desaparecem
assert.ok(ladosDe({ bubbleIcon: { min: 45, max: 90 } }).length < lados.length, 'bubbleIcon.min não escondeu os pequenos');
assert.ok(ladosDe({ bubbleIcon: { min: 999, max: 999 } }).length === 0, 'com piso altíssimo, nenhum ícone deveria sair');

// sigla `txt:` vale como na timeline, e é dimensionada pelo MESMO lado do ícone
assert.ok(svgDe({ bubbles: [B('Índice', 1e9, 'txt:S&P', 'A', 'x')] }).includes('S&amp;P'), 'sigla txt: não saiu');
const fsSigla = (max) => +[...renderChart({ width: 1400, height: 600, ...base, ...semMarca, bubbleIcon: { min: 13, max },
  bubbles: [B('Grande', 1e12, 'txt:S&P', 'A', 'x')] }).matchAll(/font-size="([\d.]+)"[^>]*>S&amp;P</g)][0][1];
assert.ok(Math.abs(fsSigla(30) - 30 * 0.46) < 0.5, `sigla não seguiu o teto do ícone: ${fsSigla(30)}px com max=30`);
assert.ok(fsSigla(56) > fsSigla(30), 'sigla deveria crescer junto com o teto do ícone');
// bolha pequena demais esconde o ícone em vez de virar borrão
const minusculo = svgDe({ ...semMarca, bubbles: [B('Gigante', 1e12, 'stats-chart', 'A', 'x'), B('Nada', 1, 'stats-chart', 'A', 'x')] });
assert.equal((minusculo.match(/<svg x=/g) || []).length, 1, 'ícone deveria sumir na bolha minúscula');

/* ── rótulo à distância CONSTANTE da bolha, nas três posições ────────────────
 * Antes ficavam numa base comum: a bolha pequena tinha o texto longe dela e o
 * par se perdia. A distância é da BORDA, então vale em qualquer tamanho. */
for (const onde of ['below', 'above', 'right']) {
  const s_ = renderChart({ width: 1700, height: 700, ...base, ...semMarca, bubbleLabel: onde });
  const cs = [...s_.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)]
    .map((x) => ({ cx: +x[1], cy: +x[2], r: +x[3] })).filter((c) => c.r > 3);
  // a LEGENDA usa text-anchor="end" e repete nomes que também são de bolha
  // ("Derivativos", "Spot") — sem tirá-la, o teste mede a distância errada
  const ts = [...s_.matchAll(/<text x="([\d.]+)" y="([\d.]+)"([^>]*)>([^<]+)</g)]
    .filter((x) => !/text-anchor="end"/.test(x[3]))
    .map((x) => ({ x: +x[1], y: +x[2], t: x[4] }));
  const dists = MERCADOS.map((b) => {
    const rot = ts.find((e) => e.t === b.label);
    assert.ok(rot, `rótulo "${b.label}" não foi desenhado (${onde})`);
    // a dona é a bolha mais PRÓXIMA — casar por raio pegava a errada
    const c = cs.sort((p, q) => Math.hypot(p.cx - rot.x, p.cy - rot.y) - Math.hypot(q.cx - rot.x, q.cy - rot.y))[0];
    return Math.round(onde === 'right' ? rot.x - (c.cx + c.r)
      : onde === 'above' ? (c.cy - c.r) - rot.y : rot.y - (c.cy + c.r));
  });
  assert.equal(new Set(dists).size, 1, `[${onde}] distância bolha→rótulo variou: ${dists.join(' ')}`);
  assert.ok(dists[0] > 0, `[${onde}] rótulo caiu em cima da bolha: ${dists[0]}px`);
}

// ── raio mínimo: valor miúdo existe no dado e sumia no desenho ───────────────
const rMenor = (extra) => Math.min(...meta(extra).bubbles.map((b) => b.r));
assert.ok(rMenor({ bubbleMinR: 20 }) >= 19.9, `bubbleMinR ignorado: ${rMenor({ bubbleMinR: 20 })}`);
assert.ok(rMenor({}) >= 8.9, `piso padrão não aplicado: ${rMenor({})}`);
// mas o piso não pode passar da MAIOR bolha (num conjunto todo pequeno, viraria o tamanho de todas)
const mp = meta({ bubbleMinR: 500 });
assert.ok(Math.max(...mp.bubbles.map((b) => b.r)) >= Math.min(...mp.bubbles.map((b) => b.r)), 'piso inverteu a ordem');

// ── categoria manda na cor (é o que faz a legenda significar algo) ───────────
const comIcones = svgDe();
assert.ok(comIcones.includes('#232B3B') && comIcones.includes('#D3D7DE'), 'bubbleCats ignorado');
assert.ok(comIcones.includes('Derivativos') && comIcones.includes('Spot'), 'faltou a legenda das categorias');

// ── grupo: título, subtítulo e separador ─────────────────────────────────────
assert.ok(comIcones.includes('TRADFI') && comIcones.includes('CRYPTO'), 'faltou o título do grupo');
// sem texto próprio, o subtítulo é a SOMA do desenhado — número que o gráfico garante
assert.ok(/Total: US\$ 20,1 tri/.test(comIcones), `esperava o total somado: ${(comIcones.match(/Total:[^<]*/g) || []).join(' | ')}`);
// com texto próprio, manda o texto (a referência trazia um % que não sai da soma)
assert.ok(svgDe({ bubbleGroups: { TRADFI: 'Total: ~US$ 20 tri · Derivativos: 44%' } }).includes('Derivativos: 44%'),
  'bubbleGroups não sobrescreveu o subtítulo');

// ── entradas degeneradas não podem explodir ──────────────────────────────────
for (const bs of [[], [B('', 0, '', '', '')], [B('x', -5, '', '', '')], [B('só um', 42, '', '', '')]]) {
  const s_ = svgDe({ bubbles: bs });
  assert.ok(!/NaN|Infinity/.test(s_), `NaN com ${JSON.stringify(bs)}`);
}

console.log('ok — bolhas: ÁREA proporcional, rótulo a distância constante nas 3 posições, piso de raio, ícone com teto/piso, sigla proporcional, nada fora da imagem');
