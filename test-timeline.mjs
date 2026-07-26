/* Auto-checagem do renderer de linha do tempo.  node test-timeline.mjs */
import assert from 'node:assert/strict';
import { renderTimeline, layoutSize, wrap, dateKey, sortEvents, mergeEvents, parseSliceText, toLines, parseLines } from './timeline.js';

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

// junção de fatias (import por imagem): repetido entra 1×, truncado vira o completo
const fatia1 = [
  { date: 'Novembro/2022', text: 'Lançamento da primeira Testnet', icon: 'flask' },
  { date: 'Março/2023', text: 'Começa o programa de referrals, Mainnet aberta' },
  { date: 'Outubro/2025', text: 'Maior liquidação da história do' },        // cortado pela borda
];
const fatia2 = [
  { date: 'Março/2023', text: 'Começa o programa de referrals, Mainnet aberta', icon: 'users' },  // repetido
  { date: 'Outubro/2025', text: 'Maior liquidação da história do mercado cripto, HLP lucra US$ 40 milhões', icon: 'bolt' },
  { date: 'Maio/2026', text: 'Primeiro ETF de HYPE nos EUA' },
];
const juntos = mergeEvents([fatia1, fatia2]);
assert.equal(juntos.length, 4, 'sobreposição das fatias tem que colapsar');
assert.equal(juntos.find((e) => e.date === 'Março/2023').icon, 'users', 'ícone da 2ª fatia não pode se perder');
assert.match(juntos.find((e) => e.date === 'Outubro/2025').text, /40 milhões$/, 'fica a versão inteira, não a cortada');
// acento/caixa/pontuação diferentes = mesmo evento
assert.equal(mergeEvents([[{ date: '2026', text: 'HIP-4 inaugura mercados' }],
  [{ date: '2026', text: 'HIP 4 inaugura mercados!' }]]).length, 1, 'normalização de texto');
// datas iguais com eventos DIFERENTES continuam dois
assert.equal(mergeEvents([[{ date: 'Março/2025', text: 'Volume acumulado' }],
  [{ date: 'Março/2025', text: 'Incidente Jelly Jelly' }]]).length, 2, 'mesma data ≠ mesmo evento');

// restos REAIS do fatiamento (saíram do import da timeline da Hyperliquid):
// nota do modelo sobre a borda, e o mesmo evento sem a data (o rótulo foi cortado)
const restos = mergeEvents([
  [{ date: 'Julho/2025', text: 'Receita mensal ultrapassa US$ 100 milhões', icon: 'money' },
    { date: 'Maio/2026', text: 'Primeiro ETF de HYPE nos EUA', icon: 'txt:ETF' }],
  [{ date: 'Maio/2026', text: '(texto cortado)', icon: 'flag' },
    { date: '', text: 'Receita mensal ultrapassa US$ 100 milhões', icon: 'money' }],
]);
assert.equal(restos.length, 2, 'placeholder e duplicado-sem-data têm que sumir');
assert.ok(restos.every((e) => e.date), 'nenhum evento fica sem data quando a vizinha tem');
// evento cortado que veio SEM data mas com texto novo não pode ser descartado
assert.equal(mergeEvents([[{ date: '', text: 'Evento só na borda' }]]).length, 1, 'sem data ainda entra');

// resposta do Claude por fatia: meta + eventos, tolerante a lixo em volta
const resp = parseSliceText([
  'Aqui está a transcrição:',        // preâmbulo: sem "|", tem que ser ignorado
  '```',
  'TITULO: Linha do Tempo: Hyperliquid',
  'SUBTITULO: Principais produtos',
  'FONTE:',                          // vazio: não entra no meta
  'LAYOUT: alternada',
  'Novembro/2022 | Lançamento da primeira Testnet | flask',
  'Março/2025 | Incidente "Jelly Jelly" | alert',   // aspas: o que quebrava o JSON
  '```',
].join('\n'));
assert.deepEqual(resp.meta, { title: 'Linha do Tempo: Hyperliquid', subtitle: 'Principais produtos', layout: 'alternada' });
assert.equal(resp.events.length, 2, 'só linha com | é evento');
assert.equal(resp.events[1].text, 'Incidente "Jelly Jelly"', 'aspas no texto sobrevivem');
assert.equal(parseSliceText('').events.length, 0, 'resposta vazia não inventa evento');

// lista de texto: ida e volta
assert.deepEqual(parseLines(toLines(EV)), EV, 'toLines/parseLines não são inversas');
assert.deepEqual(parseLines('2026 | só data e texto'), [{ date: '2026', text: 'só data e texto' }]);

console.log('ok — timeline.js');
