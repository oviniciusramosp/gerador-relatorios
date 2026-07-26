/* Self-check do sankey (node test-sankey.mjs).
 *
 * Layout não lança exceção — sai errado calado. Os riscos aqui são: nó na
 * coluna errada (topologia), fluxo que não cabe na própria caixa (altura), e
 * rótulo fora da imagem (foi o que aconteceu: y = -163 na 1ª versão).
 */
import { strict as assert } from 'node:assert';
import { renderChart } from './chart.js';

const W = 1200, H = 675;
const L = (from, to, value) => ({ from, to, value });
const svgDe = (links, extra = {}) => renderChart({
  type: 'sankey', links, y: { format: 'compact' }, width: W, height: H, ...extra,
});
const nosDe = (svg) => [...svg.matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)"/g)]
  .map((m) => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] }));
const textosDe = (svg) => [...svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)"[^>]*>([^<]+)</g)]
  .map((m) => ({ x: +m[1], y: +m[2], t: m[3] }));

// o caso real: receita por fonte → agregações → total → lucro/custo
const FLUXO = [
  L('Receita Padrão da Corretora', 'Receita Perpétuos', 656.04), L('HIP-3', 'Receita Perpétuos', 22.41),
  L('Receita Perpétuos', 'Receita HyperCore', 678.44), L('Spot Markets', 'Spot Revenue', 38.25),
  L('Spot Revenue', 'Receita HyperCore', 38.25), L('EVM Priority Fees', 'HyperEVM', 8.61),
  L('Base Fees', 'HyperEVM', 3.91), L('HyperEVM', 'Receita Total', 12.51),
  L('Receita HyperCore', 'Receita Total', 716.69), L('HIP-1 Auction Fees', 'Auction Fees', 6.38),
  L('HIP-3 Auction Fees', 'Auction Fees', 4.46), L('Auction Fees', 'Receita Total', 10.84),
  L('Receita Total', 'Lucro Líquido', 745.51), L('Receita Total', 'Custos', 7.17), L('Custos', 'HLP', 7.17),
];
const svg = svgDe(FLUXO);
const nos = nosDe(svg);

// ── um nó por nome, em colunas ───────────────────────────────────────────────
assert.equal(nos.length, 16, `esperava 16 nós, veio ${nos.length}`);
const colunas = [...new Set(nos.map((n) => Math.round(n.x)))].sort((a, b) => a - b);
assert.equal(colunas.length, 6, `esperava 6 colunas, veio ${colunas.length}`);

/* Coluna = MAIOR caminho desde uma origem. "Receita Total" recebe direto de
 * HyperEVM (2 saltos) e via HyperCore (3): tem que ficar na coluna do caminho
 * LONGO, senão as etapas do meio caem depois dele e o fluxo anda pra trás. */
// nome comprido sai quebrado em 2 linhas, então procura pela última palavra
// (distintiva: Perpétuos / HyperCore / Total) quando não achar o texto inteiro
const xDe = (nome) => {
  const ts = textosDe(svg);
  const alvo = ts.find((e) => e.t === nome) || ts.find((e) => e.t === nome.split(' ').at(-1));
  assert.ok(alvo, `rótulo "${nome}" não foi desenhado`);
  return alvo.x;
};
assert.ok(xDe('Receita Total') > xDe('HyperEVM'), 'Receita Total deveria vir depois de HyperEVM');
assert.ok(xDe('Receita Total') > xDe('Receita HyperCore'), 'Receita Total deveria vir depois de HyperCore');
assert.ok(xDe('Receita Perpétuos') < xDe('Receita HyperCore'), 'ordem das etapas invertida');

/* ── altura PROPORCIONAL ao valor ────────────────────────────────────────────
 * O invariante do sankey: dobrar o valor dobra a espessura. Não dá pra fixar a
 * altura em px — ela depende do respiro reservado pros rótulos (o gap é a
 * altura do rótulo, senão o nó gigante come a coluna e os miúdos viram uma
 * pilha espremida). O que não pode mudar é a RAZÃO entre dois nós. */
const alturaDe = (nome) => {
  const m_ = {}; renderChart({ type: 'sankey', links: FLUXO, width: W, height: H }, { meta: m_ });
  return m_.sankeyNodes.find((n) => n.n === nome).h;
};
const hTotal = alturaDe('Receita Total'), hSpot = alturaDe('Spot Revenue');
// Receita Total (752,68) / Spot Revenue (38,25) ≈ 19,7×
assert.ok(Math.abs(hTotal / hSpot - 752.68 / 38.25) < 0.5,
  `espessura fora de proporção: ${(hTotal / hSpot).toFixed(1)}× para uma razão de valor de 19,7×`);
const maisAlto = nos.reduce((a, b) => (b.h > a.h ? b : a));
assert.ok(maisAlto.h > H * 0.25, `o maior nó ficou baixo demais (${maisAlto.h}px)`);
// e o menor fluxo (US$ 921K contra centenas de milhões) não some nem vira negativo
assert.ok(nos.every((n) => n.h >= 1), 'nó com altura zero/negativa');

/* Coluna cheia não pode achatar as fitas. Reservar a altura CHEIA do rótulo no
 * respiro entre nós parecia certo — e transformou as fitas em fios de cabelo:
 * a escala é o que sobra depois dos gaps, então com 10 nós numa coluna os gaps
 * comiam 90% da altura. O gráfico deixava de mostrar proporção, que é a única
 * coisa que ele existe pra mostrar. Este teste é o que pega isso. */
const denso = [
  L('Gigante', 'Meio', 700), L('a', 'Meio', 27), L('b', 'Meio', 39), L('c', 'Meio', 9), L('d', 'Meio', 4),
  L('e', 'Meio', 3), L('f', 'Meio', 2), L('g', 'Meio', 7), L('h', 'Meio', 5), L('i', 'Meio', 11),
  L('Meio', 'Fim', 807),
];
const mD = {}; renderChart({ type: 'sankey', links: denso, width: W, height: 700 }, { meta: mD });
const gigante = mD.sankeyNodes.find((n) => n.n === 'Gigante');
assert.ok(gigante.h > 700 * 0.2,
  `com 10 nós numa coluna as fitas viraram fio: o nó de 700 (de 807) ficou com ${Math.round(gigante.h)}px de 700`);
// e continua proporcional entre si
const pequeno = mD.sankeyNodes.find((n) => n.n === 'a');
assert.ok(Math.abs(gigante.h / pequeno.h - 700 / 27) / (700 / 27) < 0.15,
  `proporção quebrada na coluna densa: ${(gigante.h / pequeno.h).toFixed(1)}× para 25,9× de valor`);

// ── NADA fora da imagem: foi o bug real (rótulo em y = -163) ─────────────────
for (const e of textosDe(svg)) {
  assert.ok(e.y >= 0 && e.y <= H, `rótulo fora da imagem: "${e.t}" em y=${e.y}`);
  assert.ok(e.x >= 0 && e.x <= W, `rótulo fora da imagem: "${e.t}" em x=${e.x}`);
}
for (const n of nos) assert.ok(n.y >= 0 && n.y + n.h <= H + 1, `nó fora da imagem em y=${n.y}`);

// nome comprido quebra em duas linhas em vez de atravessar o gráfico
assert.ok(svg.includes('Receita Padrão') && svg.includes('da Corretora'), 'faltou quebrar o nome longo');

/* ── NADA sobreposto ─────────────────────────────────────────────────────────
 * Requisito explícito. As linhas de um mesmo rótulo contam como UM bloco (elas
 * se empilham de propósito); o que não pode é bloco sobre bloco, nem bloco
 * sobre nó. Era o caso da última coluna, que escrevia à esquerda por falta de
 * espaço e caía em cima do nó anterior — 3 colisões antes da faixa reservada. */
const blocosDe = (s_) => {
  const linhas = [...s_.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)" font-size="([\d.-]+)"[^>]*?(?:text-anchor="(\w+)")?[^>]*>([^<]+)</g)]
    .map((m) => ({ x: +m[1], y: +m[2], fs: +m[3], anc: m[4] || 'start', t: m[5] }));
  const bl = []; let cur = null;
  for (const e of linhas) {
    const w = e.t.length * e.fs * 0.53 * 0.9;
    const x0 = e.anc === 'end' ? e.x - w : e.x, x1 = e.anc === 'end' ? e.x : e.x + w;
    if (cur && Math.abs(cur.x - e.x) < 0.5 && e.y - cur.y1 < e.fs * 1.5) {
      cur.y1 = e.y; cur.x0 = Math.min(cur.x0, x0); cur.x1 = Math.max(cur.x1, x1); cur.t += ' | ' + e.t;
    } else { cur = { x: e.x, x0, x1, y0: e.y - e.fs, y1: e.y, t: e.t }; bl.push(cur); }
  }
  return bl;
};
const bate = (a, b) => a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1 && a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1;
for (const [nome, s_] of [['fluxo real', svg], ['título ligado', svgDe(FLUXO, { title: 'Receita e Lucro', show: { title: true } })]]) {
  const bl = blocosDe(s_), ns = nosDe(s_);
  for (let i = 0; i < bl.length; i++) {
    for (let j = i + 1; j < bl.length; j++) {
      assert.ok(!bate(bl[i], bl[j]), `[${nome}] rótulo sobre rótulo: "${bl[i].t}" × "${bl[j].t}"`);
    }
    for (const n of ns) {
      assert.ok(!bate(bl[i], { x0: n.x, x1: n.x + n.w, y0: n.y, y1: n.y + n.h }),
        `[${nome}] rótulo sobre nó: "${bl[i].t}"`);
    }
  }
}

// ── nó arrastável: o editor precisa da geometria, e o offset tem que valer ───
const m1 = {}; renderChart({ type: 'sankey', links: FLUXO, width: W, height: H }, { meta: m1 });
assert.equal(m1.sankeyNodes.length, 16, 'faltou expor os nós pro editor arrastar');
const antes = m1.sankeyNodes.find((n) => n.n === 'Custos').y;
const m2 = {}; renderChart({ type: 'sankey', links: FLUXO, width: W, height: H, nodeOffsets: { Custos: 60 } }, { meta: m2 });
const depois = m2.sankeyNodes.find((n) => n.n === 'Custos').y;
assert.ok(Math.abs((depois - antes) - 60) < 0.01, `nodeOffsets não aplicou: ${antes} → ${depois}`);
// e mexer num nó não pode arrastar os outros junto
const outro = (nome) => m2.sankeyNodes.find((n) => n.n === nome).y - m1.sankeyNodes.find((n) => n.n === nome).y;
assert.equal(outro('Lucro Líquido'), 0, 'mover um nó mexeu em outro');

/* ── altura cresce até caber os rótulos ──────────────────────────────────────
 * Requisito: a imagem se ajusta ao dado, não o texto se espreme na imagem.
 * O renderer só INFORMA (meta.minHeight); quem cresce é o editor. */
const apertado = Array.from({ length: 10 }, (_, i) => L(`Fonte de Receita Número ${i + 1}`, 'Total', 10 + i));
const mA = {}; renderChart({ type: 'sankey', links: apertado, width: W, height: 400 }, { meta: mA });
assert.ok(mA.minHeight > 400, `com 10 nós numa coluna, 400px não cabe — minHeight veio ${mA.minHeight}`);
// e na altura sugerida tudo entra, sem pedir mais (senão o editor entra em vaivém)
const svgAlto = renderChart({ type: 'sankey', links: apertado, width: W, height: mA.minHeight });
for (const e of textosDe(svgAlto)) {
  assert.ok(e.y >= 0 && e.y <= mA.minHeight, `rótulo fora mesmo na altura sugerida: "${e.t}"`);
}
const mB = {}; renderChart({ type: 'sankey', links: apertado, width: W, height: mA.minHeight }, { meta: mB });
assert.ok(mB.minHeight <= mA.minHeight, 'minHeight não estabilizou — o editor cresceria em loop');

/* ── rótulo acompanha o nó arrastado ─────────────────────────────────────────
 * O anti-colisão puxava o rótulo de volta pro lugar "certo" e ele descolava do
 * nó recém-movido: o arraste parecia não ter pegado. Nó com offset é âncora. */
const semOff = {}; renderChart({ type: 'sankey', links: FLUXO, width: W, height: H }, { meta: semOff });
const comOff = {}; renderChart({ type: 'sankey', links: FLUXO, width: W, height: H, nodeOffsets: { Custos: 120 } }, { meta: comOff });
const dyNo = comOff.sankeyNodes.find((n) => n.n === 'Custos').y - semOff.sankeyNodes.find((n) => n.n === 'Custos').y;
assert.equal(Math.round(dyNo), 120);
const yLbl = (s_) => textosDe(s_).find((e) => e.t === 'Custos').y;
const dyLbl = yLbl(renderChart({ type: 'sankey', links: FLUXO, width: W, height: H, nodeOffsets: { Custos: 120 } }))
  - yLbl(renderChart({ type: 'sankey', links: FLUXO, width: W, height: H }));
assert.ok(Math.abs(dyLbl - 120) < 25, `rótulo não seguiu o nó: nó ${dyNo}px, rótulo ${dyLbl}px`);

/* ── escala log e fator de espessura ─────────────────────────────────────────
 * Dois controles pro mesmo aperto: fluxo de US$ 2,26M ao lado de US$ 699M fica
 * com 1,5px (existe no dado, some no desenho), e esticar a imagem pra caber o
 * texto engordava as barras junto, sem sobrar respiro. */
const hDe = (spec, nome) => {
  const m_ = {}; renderChart({ type: 'sankey', links: FLUXO, width: W, height: 700, ...spec }, { meta: m_ });
  return m_.sankeyNodes.find((n) => n.n === nome).h;
};
const linGrande = hDe({}, 'Receita Total'), linMiudo = hDe({}, 'Base Fees');
const logGrande = hDe({ y: { scale: 'log' } }, 'Receita Total'), logMiudo = hDe({ y: { scale: 'log' } }, 'Base Fees');
assert.ok(linMiudo < 3, `o caso que motiva o log: no linear o miúdo tem ${linMiudo.toFixed(1)}px`);
assert.ok(logMiudo > 6, `log não resgatou o miúdo: ${logMiudo.toFixed(1)}px`);
assert.ok(logGrande / logMiudo < linGrande / linMiudo / 10, 'log deveria comprimir a razão em uma ordem de grandeza');
// mesmo comprimido, MAIOR continua maior — inverter a ordem seria mentira grave
assert.ok(logGrande > logMiudo, 'log inverteu a ordem das espessuras');

// o fator encolhe a barra sem mexer na altura da imagem
assert.ok(Math.abs(hDe({ sankeyScale: 0.5 }, 'Receita Total') / linGrande - 0.5) < 0.02, 'sankeyScale não escalou');
assert.ok(hDe({ sankeyScale: 1 }, 'Receita Total') === linGrande, 'sankeyScale=1 tem que ser o padrão');
// fora de faixa não pode zerar nem explodir o desenho
for (const f of [0, -1, 5, null]) {
  const m_ = {}; renderChart({ type: 'sankey', links: FLUXO, width: W, height: 700, sankeyScale: f }, { meta: m_ });
  assert.ok(m_.sankeyNodes.every((n) => n.h > 0 && n.h < 700), `sankeyScale=${f} quebrou a altura`);
}

/* ── NENHUM retângulo fora da imagem, em nenhuma combinação ──────────────────
 * Requisito duro. Medido antes do corte: arraste grande jogava o nó pra
 * y=1381 numa imagem de 600, e piso alto num nó ramificado punha o nó em
 * 54–854. O corte mora no RENDERER (não só no editor) porque a spec chega de
 * qualquer lugar: JSON colado, arquivo salvo, extração por IA. */
{
  const F = [L('A', 'Meio', 700), L('B', 'Meio', 27), L('C', 'Meio', 39), L('Meio', 'Fim', 766)];
  const muitos = (n) => Array.from({ length: n }, (_, i) => L('n' + i, 'T', 10 + i)).concat([L('T', 'F', 300)]);
  const casos = [
    ['arraste enorme pra baixo', 600, { nodeOffsets: { B: 900 } }],
    ['arraste enorme pra cima', 600, { nodeOffsets: { B: -900 } }],
    ['offset no nó gigante', 600, { nodeOffsets: { A: 400 } }],
    ['offset absurdo', 600, { nodeOffsets: { A: 99999, B: -99999 } }],
    ['coluna com 14 nós', 600, { links: muitos(14) }],
    ['piso alto + ramificado', 600, { links: muitos(20), sankeyMinLink: 40 }],
    ['imagem baixinha', 200, {}],
    ['imagem minúscula', 120, {}],
    ['escala mínima', 600, { sankeyScale: 0.15 }],
    ['tudo junto', 300, { links: muitos(12), nodeOffsets: { A: 5000, B: -5000 }, sankeyMinLink: 30, sankeyScale: 0.15 }],
  ];
  for (const [nome, altura, extra] of casos) {
    const m_ = {}; renderChart({ type: 'sankey', links: F, width: W, height: altura, ...extra }, { meta: m_ });
    for (const n of m_.sankeyNodes) {
      assert.ok(n.y >= -0.5 && n.y + n.h <= altura + 0.5,
        `[${nome}] nó "${n.n}" fora da imagem (h=${altura}): ${n.y.toFixed(0)}–${(n.y + n.h).toFixed(0)}`);
      assert.ok(n.h > 0, `[${nome}] nó "${n.n}" com altura ${n.h}`);
    }
  }
}

/* ── PISO de espessura ───────────────────────────────────────────────────────
 * Fluxo miúdo saía com fração de pixel e sumia no antialiasing: sumia do
 * DESENHO, não do dado — o gráfico mostrando menos do que sabe. E o controle de
 * espessura piorava (metade de 1,5px é 0,75px). O piso vale pra nó E pra fita,
 * em qualquer escala. */
const espessurasDe = (spec) => {
  const s_ = renderChart({ type: 'sankey', links: FLUXO, width: W, height: 700, ...spec });
  return [...s_.matchAll(/<path d="M[\d.]+ ([\d.]+)C.*?([\d.]+)Z" fill="[^"]+" opacity="0\.26"/g)]
    .map((m) => +m[2] - +m[1]);
};
for (const spec of [{}, { sankeyScale: 0.5 }, { sankeyScale: 0.15 }, { y: { scale: 'log' } }]) {
  const e = espessurasDe(spec);
  assert.ok(e.length >= FLUXO.length - 1, `fitas não desenhadas com ${JSON.stringify(spec)}`);
  assert.ok(Math.min(...e) >= 1, `fita invisível (${Math.min(...e).toFixed(2)}px) com ${JSON.stringify(spec)}`);
  const mm = {}; renderChart({ type: 'sankey', links: FLUXO, width: W, height: 700, ...spec }, { meta: mm });
  assert.ok(Math.min(...mm.sankeyNodes.map((n) => n.h)) >= 1, `nó invisível com ${JSON.stringify(spec)}`);
}
// piso configurável, e o padrão não pode ser zero
assert.ok(Math.min(...espessurasDe({ sankeyMinLink: 5 })) >= 5, 'sankeyMinLink não subiu o piso');
// mesmo com piso, a coluna continua cabendo na área (o piso não pode vazar)
for (const spec of [{ sankeyMinLink: 6 }, { sankeyMinLink: 6, sankeyScale: 0.2 }]) {
  const mm = {}; renderChart({ type: 'sankey', links: FLUXO, width: W, height: 700, ...spec }, { meta: mm });
  for (const n of mm.sankeyNodes) {
    assert.ok(n.y >= -1 && n.y + n.h <= 701, `piso empurrou o nó "${n.n}" pra fora: ${n.y.toFixed(0)}–${(n.y + n.h).toFixed(0)}`);
  }
}

/* Fita tem que ENCAIXAR no nó nas duas pontas. Em log a soma das partes não é
 * o todo (log a + log b ≠ log(a+b)), então usar uma espessura única por fita
 * faria os fluxos vazarem pra fora do nó ou deixarem buraco dentro dele. */
for (const escala of [undefined, 'log']) {
  const m_ = {}; const s_ = renderChart({ type: 'sankey', links: FLUXO, width: W, height: 700, y: { scale: escala } }, { meta: m_ });
  // só as FITAS: o `opacity` as separa dos paths da marca d'água, que também
  // são <path d="M…C…"> e entrariam na conta
  const fitas = [...s_.matchAll(/<path d="M([\d.]+) ([\d.]+)C[^"]*" fill="[^"]*" opacity="0\.26"/g)]
    .map((x) => ({ x: +x[1], y: +x[2] }));
  assert.ok(fitas.length >= FLUXO.length - 1, `só ${fitas.length} fitas encontradas (escala ${escala || 'linear'})`);
  for (const f of fitas) {
    // Todo nó da mesma coluna divide o mesmo x, então o dono da fita é o que
    // também CONTÉM o y dela — casar só por x pegava o primeiro da coluna.
    const naColuna = m_.sankeyNodes.filter((n) => Math.abs(n.x + n.w - f.x) < 0.6);
    assert.ok(naColuna.length, `fita solta em x=${f.x} (escala ${escala || 'linear'})`);
    const dono = naColuna.find((n) => f.y >= n.y - 0.6 && f.y <= n.y + n.h + 0.6);
    assert.ok(dono, `fita saiu de dentro de todos os nós da coluna (escala ${escala || 'linear'}): y=${f.y.toFixed(1)}, `
      + `nós ${naColuna.map((n) => `${n.n} ${n.y.toFixed(0)}–${(n.y + n.h).toFixed(0)}`).join(' · ')}`);
  }
}

// ── cor por nó (spec.nodeColors) manda na paleta ─────────────────────────────
const colorido = svgDe(FLUXO, { nodeColors: { 'Lucro Líquido': '#01AD6F', Custos: '#CE5249' } });
assert.ok(colorido.includes('#01AD6F') && colorido.includes('#CE5249'), 'nodeColors foi ignorado');

// ── entradas degeneradas não podem explodir ──────────────────────────────────
for (const caso of [[], [L('a', 'a', 5)], [L('a', 'b', 0)], [L('', 'b', 5)], [L('a', 'b', -3)]]) {
  const s = svgDe(caso);
  assert.ok(!/NaN|Infinity/.test(s), `NaN com ${JSON.stringify(caso)}`);
}
// ciclo (a→b→a) não pode travar o cálculo de coluna
const ciclo = svgDe([L('a', 'b', 5), L('b', 'c', 5), L('c', 'a', 5)]);
assert.ok(!/NaN|Infinity/.test(ciclo) && nosDe(ciclo).length === 3, 'ciclo quebrou o layout');

// ── um fluxo só: 2 nós, 2 colunas ────────────────────────────────────────────
const simples = nosDe(svgDe([L('Entrada', 'Saída', 100)]));
assert.equal(simples.length, 2);
assert.notEqual(simples[0].x, simples[1].x, 'os dois nós ficaram na mesma coluna');

console.log('ok — sankey: colunas, proporção, ZERO sobreposição, piso de espessura em qualquer escala, fita encaixada no nó, arraste e ciclo');
