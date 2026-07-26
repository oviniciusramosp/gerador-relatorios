/* Self-check do layout de cards da pizza/rosca (node test-pizza-cards.mjs).
 *
 * O que quebraria calado: layout não lança exceção — só sai torto. Os três
 * riscos aqui são card fora da área da imagem, duas colunas desequilibradas
 * (todos os cards de um lado) e cards sobrepostos quando duas fatias finas
 * caem na mesma altura.
 */
import { strict as assert } from 'node:assert';
import { renderChart } from './chart.js';

const W = 1200, H = 675;
const svgDe = (labels, data, extra = {}) => renderChart({
  type: 'pie', labels, series: [{ name: 'x', data }], y: { format: 'pct' }, width: W, height: H, ...extra,
});
// Texto dos cards: <text x=… text-anchor="start|end"> (o % dentro da fatia usa
// anchor "middle", então fica de fora). Cada card são DUAS linhas — a do valor
// e a do nome —, então `linhas` conta o dobro de `cards`.
const linhasDe = (svg) => [...svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)"[^>]*text-anchor="(start|end)"[^>]*>([^<]+)</g)]
  .map((m) => ({ x: +m[1], y: +m[2], lado: m[3] === 'start' ? 1 : -1, txt: m[4] }));
// 1 por card: a linha de destaque é a que traz o valor
const cardsDe = (svg) => linhasDe(svg).filter((k) => /%$/.test(k.txt));

const HYPE = [['Gênesis', 'Emissões Futuras', 'Contribuidores', 'Fundação Hype', 'Incentivos para Comunidade'],
  [31, 38.9, 23.8, 6, 0.3]];

// ── todo rótulo aparece, e o valor vem junto do nome (identidade nunca só por cor)
const svg = svgDe(...HYPE);
for (const nome of HYPE[0]) assert.ok(svg.includes(nome), `sumiu o rótulo "${nome}"`);

// ── as duas colunas ficam equilibradas ───────────────────────────────────────
// Sem balanceamento, a distribuição real acima jogava 4 cards de um lado e 1 do
// outro: a fatia que cai perto da vertical escolhe lado por fração de grau.
for (const [labels, data] of [HYPE,
  [['a', 'b'], [70, 30]],
  [['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], [20, 18, 15, 13, 11, 9, 8, 6]],
  [['gigante', 'resto'], [97, 3]]]) {
  const c = cardsDe(svgDe(labels, data));
  assert.equal(c.length, data.length, `número de cards ≠ número de fatias em ${JSON.stringify(data)}`);
  const dir = c.filter((x) => x.lado === 1).length, esq = c.filter((x) => x.lado === -1).length;
  assert.ok(Math.abs(dir - esq) <= 1, `colunas tortas (${esq} esq / ${dir} dir) em ${JSON.stringify(data)}`);
}

// ── nada escapa da imagem, nem sobrepõe ──────────────────────────────────────
for (const [labels, data] of [HYPE, [['a', 'b', 'c', 'd', 'e', 'f'], [40, 30, 20, 5, 4, 1]]]) {
  const svgN = svgDe(labels, data);
  for (const k of linhasDe(svgN)) {          // vale pras DUAS linhas do card
    assert.ok(k.y > 0 && k.y < H, `card fora da imagem na vertical: ${k.txt} (y=${k.y})`);
    assert.ok(k.x > 0 && k.x < W, `card fora da imagem na horizontal: ${k.txt} (x=${k.x})`);
  }
  // duas fatias finas vizinhas apontam quase pra mesma altura — o anti-colisão
  // tem que separá-las, senão os textos ficam um por cima do outro. 40px é o
  // card inteiro (valor + nome), então menos que isso já é sobreposição real.
  for (const lado of [1, -1]) {
    const ys = cardsDe(svgN).filter((k) => k.lado === lado).map((k) => k.y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) {
      assert.ok(ys[i] - ys[i - 1] >= 40, `cards colados (y=${ys[i - 1]} e ${ys[i]}) em ${JSON.stringify(data)}`);
    }
  }
}

// ── o gráfico fica CENTRADO na imagem (era encostado à esquerda antes) ───────
const arcos = [...svgDe(...HYPE).matchAll(/<path d="M([\d.]+) ([\d.]+)A([\d.]+)/g)].map((m) => ({ x: +m[1], r: +m[3] }));
assert.ok(arcos.length >= 4, 'as fatias não foram desenhadas');
const raio = arcos[0].r;
// A 1ª fatia começa no topo do círculo, então seu x é o centro — a menos de
// ~1px, que é o respiro de 2px entre fatias empurrando o início do arco.
assert.ok(Math.abs(arcos[0].x - W / 2) <= 3, `gráfico fora do centro: x=${arcos[0].x}, esperado ~${W / 2}`);
assert.ok(raio > 100, `círculo pequeno demais (r=${raio}) — os cards comeram o gráfico`);

// ── % com casas FIXAS e iguais entre si ──────────────────────────────────────
const pcts = (s) => [...s.matchAll(/>([\d,]+%)</g)].map((m) => m[1]);
const comFracao = pcts(svgDe(...HYPE));
assert.ok(comFracao.every((p) => /,\d%$/.test(p)), `casa decimal inconsistente: ${comFracao.join(' ')}`);
assert.ok(comFracao.includes('38,9%') && comFracao.includes('31,0%'), `esperava 38,9% e 31,0%: ${comFracao.join(' ')}`);
// tudo redondo não ganha ",0" à toa
const redondo = pcts(svgDe(['a', 'b', 'c', 'd'], [25, 25, 25, 25]));
assert.ok(redondo.every((p) => p === '25%'), `não deveria ter decimal: ${redondo.join(' ')}`);

/* ── "Outros": junta a cauda longa ───────────────────────────────────────────
 * Numa distribuição real sobram fatias de 0,3% — invisíveis no desenho, mas
 * cada uma gasta um card e uma cor da paleta e empurra as que importam. */
const CAUDA = [['Gênesis', 'Emissões', 'Contrib', 'Fundação', 'Incentivos', 'Airdrop 2', 'Parceiros', 'Bug bounty'],
  [31, 38.9, 23.8, 4, 0.9, 0.7, 0.4, 0.3]];
const semGrupo = svgDe(...CAUDA);
const comGrupo = svgDe(...CAUDA, { groupSmall: { on: true, pct: 2, label: 'Outros' } });
assert.equal(cardsDe(semGrupo).length, 8);
assert.equal(cardsDe(comGrupo).length, 5, 'as 4 miúdas deviam virar 1 card só');
assert.ok(comGrupo.includes('Outros'), 'faltou o card "Outros"');
// o valor agrupado é a SOMA das miúdas, não some do gráfico
assert.ok(pcts(comGrupo).includes('2,3%'), `esperava 2,3% (0,9+0,7+0,4+0,3): ${pcts(comGrupo).join(' ')}`);
// as grandes continuam com o mesmo %: agrupar não pode remexer no resto
for (const p of ['31,0%', '38,9%', '23,8%']) assert.ok(pcts(comGrupo).includes(p), `mudou ${p} ao agrupar`);
// UMA fatia miúda não vira "Outros" — trocaria um nome informativo por genérico
assert.ok(!svgDe(['A', 'B', 'C'], [60, 39, 1], { groupSmall: { on: true, pct: 2 } }).includes('Outros'),
  'com uma miúda só, o nome real tem que ficar');
// desligado é o padrão: quem não pediu não vê o gráfico mudar
assert.ok(!semGrupo.includes('Outros'));

// ── cor por fatia (spec.sliceColors), pra editar no painel ───────────────────
assert.ok(svgDe(...CAUDA, { sliceColors: { Gênesis: '#FF0000' } }).includes('#FF0000'), 'sliceColors ignorado');

// ── rosca (raio interno) segue o mesmo layout ────────────────────────────────
const rosca = svgDe(...HYPE, { type: 'donut' });
assert.equal(cardsDe(rosca).length, HYPE[1].length, 'a rosca perdeu os cards');

console.log('ok — pizza: cards equilibrados sem sobrepor, gráfico centrado, % com casas iguais, "Outros" junta a cauda longa e cor por fatia');
