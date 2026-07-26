/* Auto-checagem do plugin do Figma: figma-plugin/code.js contra um MOCK da API.
 *   node test-figma-plugin.mjs
 *
 * O que ISSO cobre: a árvore de nós (aninhamento, lado do card, quantos eventos),
 * os flags de auto-layout (layoutMode/itemSpacing/padding) e o parse do plano
 * (SVG com <metadata> ou JSON cru).
 * O que NÃO cobre: se a API real do Figma aceita cada propriedade — pra isso só
 * rodando o plugin num arquivo de verdade. O mock aceita qualquer atribuição.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderTimeline, figmaPlan } from './timeline.js';

// ── mock mínimo da API ──────────────────────────────────────────────────────
const node = (type) => ({
  type, children: [], fills: [], strokes: [], width: 0, height: 0, x: 0, y: 0,
  appendChild(c) { c.parent = this; this.children.push(c); this.height += c.height; this.width = Math.max(this.width, c.width); },
  insertChild(i, c) { const k = this.children.indexOf(c); if (k >= 0) this.children.splice(k, 1); c.parent = this; this.children.splice(i, 0, c); },
  resize(w, h) { this.width = w; this.height = h; },
  remove() {},
});
const page = { ...node('PAGE'), selection: [] };
let uiMsgs = [];
const figma = {
  showUI() {}, ui: { postMessage: (m) => uiMsgs.push(m) },
  currentPage: page,
  viewport: { center: { x: 0, y: 0 }, scrollAndZoomIntoView() {} },
  loadFontAsync: async ({ family, style }) => {
    // só "IBM Plex Sans" falha, pra exercitar o fallback pra Inter
    if (family === 'IBM Plex Sans') throw new Error('fonte ausente');
  },
  createFrame: () => node('FRAME'),
  createText: () => ({ ...node('TEXT'), characters: '', set fontName(v) { this._font = v; }, get fontName() { return this._font; } }),
  createRectangle: () => node('RECTANGLE'),
  createEllipse: () => node('ELLIPSE'),
  createNodeFromSvg: (svg) => { const n = node('FRAME'); n.svg = svg; n.resize(24, 24); return n; },
};

const src = await readFile(new URL('./figma-plugin/code.js', import.meta.url), 'utf8');
new Function('figma', '__html__', src)(figma, '<html></html>');
assert.equal(typeof figma.ui.onmessage, 'function', 'o plugin tem que registrar figma.ui.onmessage');

const EV = [
  { date: 'Novembro/2022', text: 'Lançamento da primeira Testnet', icon: 'flask' },
  { date: 'Fevereiro/2023', text: 'Lançamento da Mainnet fechada', icon: 'rocket' },
  { date: 'Março/2026', text: 'Perpétuo do S&P500', icon: 'txt:S&P' },
];
const spec = { title: 'Linha do Tempo: Hyperliquid', subtitle: 'Marcos', events: EV };

const run = async (raw) => {
  uiMsgs = []; page.children = []; page.selection = [];
  figma.ui.onmessage({ type: 'build', raw });
  await new Promise((r) => setTimeout(r, 10));
  return { msg: uiMsgs.at(-1), root: page.children.at(-1) };
};

// 1) plano dentro do SVG copiado (caminho do botão "Copiar para o Figma")
const svg = renderTimeline(spec, { embedPlan: true });
let { msg, root } = await run(svg);
assert.equal(msg?.type, 'ok', 'build falhou: ' + JSON.stringify(msg));
assert.ok(root, 'nada foi criado na página');
assert.equal(root.layoutMode, 'VERTICAL', 'raiz tem que ser auto-layout vertical');
assert.ok(root.paddingTop > 0 && root.itemSpacing > 0, 'raiz sem padding/gap não é auto-layout de verdade');
assert.equal(page.selection[0], root, 'o frame criado tem que ficar selecionado');

const corpo = root.children.find((c) => c.name === 'Eventos');
const head = root.children.find((c) => c.name === 'Cabeçalho');
assert.ok(head, 'cabeçalho não foi montado');
assert.equal(head.counterAxisAlignItems, 'CENTER', 'cabeçalho centralizado');
assert.ok(corpo, 'corpo não foi montado');
assert.equal(corpo.layoutMode, 'VERTICAL');

const rows = corpo.children.filter((c) => c.name === 'Evento');
assert.equal(rows.length, EV.length, 'um frame por evento');
assert.ok(rows.every((r) => r.layoutMode === 'HORIZONTAL' && r.counterAxisAlignItems === 'CENTER'),
  'cada evento é uma linha horizontal centralizada');

// alternada: 1º card à esquerda do nó, 2º à direita
const posCard = (row) => row.children.findIndex((c) => c.name === 'Card');
const posNode = (row) => row.children.findIndex((c) => c.name === 'Nó');
assert.ok(posCard(rows[0]) < posNode(rows[0]), 'evento 1 (par) tem o card antes do nó');
assert.ok(posCard(rows[1]) > posNode(rows[1]), 'evento 2 (ímpar) tem o card depois do nó');
assert.ok(rows.every((r) => r.children.length === 3), 'linha = card + nó + espaçador');

// card: auto-layout com padding, data e texto como TEXT
const card0 = rows[0].children[posCard(rows[0])];
assert.equal(card0.layoutMode, 'VERTICAL');
assert.ok(card0.paddingLeft > 0, 'card sem padding');
assert.equal(card0.children.filter((c) => c.type === 'TEXT').length, 2, 'card tem data + texto');
assert.equal(card0.children[1].characters, EV[0].text, 'texto do card veio do evento');

// nó: anel + ícone (svg) no ícone normal, anel + texto na sigla
const no0 = rows[0].children[posNode(rows[0])];
assert.ok(no0.children.some((c) => c.type === 'ELLIPSE'), 'nó tem anel');
assert.ok(no0.children.some((c) => c.svg), 'nó tem o ícone vetorial');
const no2 = rows[2].children[posNode(rows[2])];
assert.equal(no2.children.find((c) => c.type === 'TEXT')?.characters, 'S&P', 'sigla no nó');

// eixo: existe, fora do fluxo, e é o primeiro filho (atrás)
const eixo = corpo.children.find((c) => c.name === 'Eixo');
assert.ok(eixo, 'eixo não foi criado');
assert.equal(eixo.layoutPositioning, 'ABSOLUTE', 'eixo tem que sair do auto-layout');
assert.equal(corpo.children.indexOf(eixo), 0, 'eixo tem que ficar atrás dos eventos');

// fonte: cai pra Inter quando a IBM Plex Sans não está instalada
assert.equal(card0.children[0].fontName.family, 'Inter', 'fallback de fonte não funcionou');

// 2) JSON cru do plano também serve
({ msg, root } = await run(JSON.stringify(figmaPlan(spec))));
assert.equal(msg?.type, 'ok', 'plano em JSON cru devia funcionar');

// 3) erros claros, sem criar lixo na página
for (const [raw, esperado] of [['', /cole o conteúdo/i], ['nada disso', /não achei o plano/i],
  [JSON.stringify({ v: 99, events: [] }), /formato de plano/i]]) {
  const r = await run(raw);
  assert.equal(r.msg?.type, 'erro', `"${raw.slice(0, 20)}" devia dar erro`);
  assert.match(r.msg.msg, esperado);
  assert.equal(page.children.length, 0, 'erro não pode deixar frame pela metade');
}

// 4) horizontal: linhas viram colunas (VERTICAL por evento)
({ root } = await run(JSON.stringify(figmaPlan({ ...spec, layout: 'horizontal' }))));
const corpoH = root.children.find((c) => c.name === 'Eventos');
assert.equal(corpoH.layoutMode, 'HORIZONTAL', 'horizontal: corpo em linha');
assert.ok(corpoH.children.filter((c) => c.name === 'Evento').every((r) => r.layoutMode === 'VERTICAL'),
  'horizontal: cada evento empilha card e nó');

console.log('ok — figma-plugin/code.js (mock da API; rodar no Figma real pra validar a API)');
