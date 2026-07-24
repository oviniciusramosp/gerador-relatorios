/* Auto-checagem do renderer de linha do tempo.  node test-timeline.mjs */
import assert from 'node:assert/strict';
import { renderTimeline, layoutSize, wrap, dateKey, sortEvents, toLines, parseLines } from './timeline.js';

const EV = [
  { date: 'Novembro/2022', text: 'Lançamento da primeira Testnet', icon: 'flask' },
  { date: 'Fevereiro/2023', text: 'Lançamento da Mainnet fechada', icon: 'rocket' },
  { date: 'Maio/2026', text: 'Primeiro ETF de HYPE nos EUA', icon: 'txt:ETF' },
];

// quebra de linha: respeita o limite e não perde palavra
const ls = wrap('Maior liquidação da história do mercado cripto, HLP lucra US$ 40 milhões', 180, 15);
assert.ok(ls.length > 1, 'texto longo tem que quebrar em várias linhas');
assert.equal(ls.join(' ').split(/\s+/).length, 12, 'nenhuma palavra some na quebra');
assert.deepEqual(wrap('a\nb', 999, 15), ['a', 'b'], '\\n força quebra');

// altura acompanha o conteúdo (é o ponto do layout automático)
const h1 = layoutSize({ events: EV }).h;
const h3 = layoutSize({ events: [...EV, ...EV, ...EV] }).h;
assert.ok(h3 > h1 * 2, 'mais eventos ⇒ imagem mais alta');
assert.equal(layoutSize({ events: EV, width: 1100 }).w, 1100, 'largura respeita a spec (vertical)');
// card mais estreito não muda a largura da imagem, só quebra mais o texto ⇒ mais alta
const largo = layoutSize({ events: EV, width: 1200, cardScale: 1 });
const estreito = layoutSize({ events: EV, width: 1200, cardScale: 0.35 });
assert.equal(estreito.w, largo.w, 'cardScale não mexe na largura da imagem');
assert.ok(estreito.h > largo.h, 'card estreito ⇒ texto quebra mais ⇒ imagem mais alta');
// horizontal: largura sai das colunas, não de spec.width
const hz = layoutSize({ layout: 'horizontal', events: EV, colWidth: 250, width: 400 });
assert.ok(hz.w >= 3 * 250, 'horizontal dimensiona por coluna × eventos');

// os 3 layouts renderizam, com todos os eventos e sem quebrar o XML
for (const layout of ['alternada', 'esquerda', 'horizontal']) {
  const svg = renderTimeline({ layout, events: EV, title: 'Linha do Tempo: Hyperliquid' });
  assert.ok(svg.startsWith('<svg') && svg.trim().endsWith('</svg>'), layout + ': SVG malformado');
  // palavra-chave em vez da frase inteira: o texto pode ter quebrado em linhas
  for (const w of ['Testnet', 'Mainnet', 'HYPE']) assert.ok(svg.includes(w), `${layout}: evento "${w}" não saiu`);
  assert.ok(svg.includes('NOVEMBRO/2022'), layout + ': data sai em caixa alta');
  assert.ok(svg.includes('ETF'), layout + ': nó de sigla (txt:) não saiu');
  assert.ok(svg.includes('2022  —  2026'), layout + ': tarja de período errada');
}

// escape: texto do usuário não pode injetar markup no SVG
const inj = renderTimeline({ events: [{ date: '2026', text: '<script>x</script>' }] });
assert.ok(!inj.includes('<script>'), 'texto do evento tem que ser escapado');

// datas: parse e ordenação
assert.equal(dateKey('Fevereiro/2023'), 2023 * 12 + 1);
assert.equal(dateKey('fev/2023'), 2023 * 12 + 1);
assert.equal(dateKey('03/2025'), 2025 * 12 + 2);
assert.equal(dateKey('2025-03'), 2025 * 12 + 2);
assert.equal(dateKey('2024'), 2024 * 12);
assert.equal(dateKey('sem data'), null);
const fora = [{ date: 'Maio/2026' }, { date: 'Novembro/2022' }, { date: 'sem data' }, { date: 'Março/2023' }];
assert.deepEqual(sortEvents(fora).map((e) => e.date),
  ['Novembro/2022', 'Março/2023', 'Maio/2026', 'sem data'], 'ordenação por data');

// lista de texto: ida e volta
assert.deepEqual(parseLines(toLines(EV)), EV, 'toLines/parseLines não são inversas');
assert.deepEqual(parseLines('2026 | só data e texto'), [{ date: '2026', text: 'só data e texto' }]);

console.log('ok — timeline.js');
