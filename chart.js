/* Renderer de gráficos da Paradigma: spec (JSON) -> string SVG.
 *
 * Puro: não toca no DOM, não depende do navegador. As 3 ferramentas do gerador
 * usam esta mesma função — o editor (graficos.html) e, depois, a diagramação,
 * que embute o SVG direto no relatório.
 *
 * Uso:  import { renderChart } from './chart.js'
 *       el.innerHTML = renderChart(spec)
 */

// ── tokens ───────────────────────────────────────────────────────────────────
// Slots categóricos: hues da marca (violet/mint/lilac) + 3 extensões, com o
// lightness ajustado por modo. Ordem e steps validados com o validador de
// paleta (OKLCH lightness band, chroma floor, ΔE CVD, contraste).
//   dark  -> todos os gates PASS
//   light -> 1 WARN (amber↔mint protan ΔE 7.1, faixa 6–8) legal porque todo
//            gráfico sai com legenda + rótulo direto (encoding secundário).
// Não cicle os slots: a 7ª série vira "Outros", não uma cor nova.
export const THEMES = {
  dark: {
    surface: '#0E0C1B',
    ink:     '#FFFFFF',
    muted:   '#BAB1FF',
    faint:   'rgba(186,177,255,.62)',
    grid:    'rgba(186,177,255,.13)',
    axis:    'rgba(186,177,255,.30)',
    // 6 slots da marca + 6 de extensão (validados; ver README §Paleta). Ordem
    // escolhida por busca pra manter pares VIZINHOS distinguíveis — importa em
    // empilhado, onde segmentos vizinhos se tocam.
    series:  ['#554FFE', '#01AD6F', '#C08600', '#9283E3', '#CE5249', '#0092C6',
              '#C15AA7', '#6F9D17', '#0695B5', '#CC4F6E', '#9B61C9', '#DC701C'],
  },
  light: {
    surface: '#FFFFFF',
    ink:     '#0E0C1B',
    muted:   '#4A4463',
    faint:   'rgba(14,12,27,.55)',
    grid:    'rgba(14,12,27,.10)',
    axis:    'rgba(14,12,27,.26)',
    series:  ['#4626F1', '#038756', '#B88000', '#7F6FCE', '#BA3E38', '#007FAD',
              '#AA4591', '#659003', '#0085A2', '#B3385A', '#8349AE', '#DC701C'],
  },
};

export const SERIES_NAMES = ['Violeta', 'Verde', 'Âmbar', 'Lilás', 'Coral', 'Azul',
  'Magenta', 'Oliva', 'Teal', 'Rosa', 'Roxo', 'Laranja'];

export const DEFAULTS = {
  type: 'line',          // line | area | bar | hbar | stacked | stacked100 | donut | pie | candle | sankey | bubble
  // bubble: cada item é uma bolha com ÁREA proporcional ao valor e um ícone
  // dentro. `group` separa em blocos (TRADFI | CRYPTO), `cat` dá cor e legenda.
  bubbles: [],           // [{ label, value, icon, group, cat }]
  bubbleCats: {},        // { "Derivativos": "#232B3B", "Spot": "#D3D7DE" } — ordem = ordem da legenda
  bubbleGroups: {},      // subtítulo por grupo; sem entrada, mostra a soma do que está desenhado
  bubbleLabel: 'below',  // below | above | right — onde fica o rótulo em relação à bolha
  bubbleMinR: 9,         // raio MÍNIMO em px: valor miúdo existe no dado e sumia no desenho
  // ícone dentro da bolha: `max` impede que ele domine a bolha gigante, `min` é
  // o tamanho abaixo do qual ele vira borrão e é melhor não desenhar
  bubbleIcon: { min: 13, max: 56 },
  // sankey: o dado NÃO são séries, são ligações — spec.links = [{from,to,value}].
  // A espessura do fluxo é o valor; as colunas saem da topologia (ver sankey()).
  links: [],
  // cor por nó: { "Lucro Líquido": "#01AD6F" } — o resto sai da paleta
  nodeColors: {},
  // ajuste manual do sankey no modo Editar: px de deslocamento VERTICAL por nó
  // (o horizontal é a etapa do fluxo, mover mudaria o significado). Por NOME,
  // pra sobreviver a mudança de dado — o índice não sobrevive.
  nodeOffsets: {},
  // cor por fatia de pizza/rosca, por RÓTULO: { "Gênesis": "#554FFE" }
  sliceColors: {},
  // sankey: fator de espessura das barras (0.15–1), independente da altura da
  // imagem. Serve pra crescer a imagem pelo TEXTO sem engordar as barras junto.
  sankeyScale: 1,
  // sankey: espessura MÍNIMA de nó e fita, em px. Sem piso, o fluxo miúdo sai
  // com fração de pixel e some no antialiasing — some do desenho, não do dado.
  sankeyMinLink: 2,
  // junta as fatias abaixo de `pct` numa só (pizza/rosca) — a cauda longa de
  // 0,3% gasta card e cor da paleta sem ser legível no desenho
  groupSmall: { on: false, pct: 2, label: 'Outros' },
  // combo: series[i].as = 'bar'|'line' mistura formas; series[i].axis = 'y2'
  // manda a série pro eixo direito (config em spec.y2, mesmo formato do y).
  // candle: séries 1-4 = abertura/máxima/mínima/fechamento (+5ª ex.: volume)
  theme: 'light',
  width: 1200, height: 675,
  title: '', subtitle: '', source: '',
  // mostrar cada texto no gráfico? desligado por padrão — o texto fica guardado
  // mas só aparece quando o switch é ligado
  show: { title: false, subtitle: false, source: false },
  labels: [],
  // [{ name, data:[…], color?, area?, hidden?, stroke? }]
  // hidden: série fica na spec (e no CSV) mas não é desenhada nem entra na legenda
  // stroke: 'solid' | 'dashed' | 'dotted' — `dashed: true` ainda é aceito (specs antigas)
  series: [],
  // side: lado do eixo de valor (left|right) — o y2, se houver, vai pro oposto
  // scale: 'linear' | 'log' — log serve pra série que cresce por ordem de
  // grandeza (TVL, market cap, preço); exige valores > 0 e ignora `zero`,
  // porque em log o zero fica infinitamente longe. Não vale em stacked100.
  y: { format: 'num', prefix: '', suffix: '', title: '', min: null, max: null, ticks: 5, zero: true, side: 'left', scale: 'linear' },
  x: { title: '', every: 1, hidden: [], offsets: {} },
  // every: mostra 1 a cada N rótulos · hidden: índices sem TEXTO do rótulo
  // (o ponto/barra continua no lugar, só o texto some) · offsets: {indice: dx}
  // desloca só o TEXTO do rótulo, na HORIZONTAL — nunca o dado/posição real do
  // ponto, e nunca na vertical (o rótulo sempre fica na mesma linha do eixo)
  grid: 'y',             // y | x | both | none
  legend: 'top',         // top | bottom | none
  labelMode: 'none',     // none | ends (primeiro+último) | max | all
  smooth: false,
  strokeWidth: 8,
  dotSize: 0,            // 0 = sem marcador; >=8 recomendado quando ligado
  barGap: 0.28,          // fração da banda usada como respiro entre grupos
  barRadius: 4,          // canto arredondado da barra, em px (bar/hbar — empilhado não arredonda: os segmentos ficam colados)
  // "trilha": fundo atrás de cada barra cobrindo o range INTEIRO do eixo (não só
  // 0→valor) — iguala visualmente o "100%" de referência entre as barras, tipo
  // barra de progresso. scale: espessura da trilha relativa à própria barra
  // (1 = igual; >1 sobra dos dois lados; <1 fica mais fina que a barra).
  barTrack: { show: false, opacity: 0.12, scale: 1 },
  // candle: up/down null = usa o verde/coral do tema (acompanha claro↔escuro);
  // um hex explícito fixa a cor. wick = espessura do pavio em px.
  candle: { up: null, down: null, wick: 1.2 },
  fontScale: 1.6,
  transparent: false,    // fundo transparente (pra colar sobre outra arte)
  annotations: [],       // [{ at: <índice ou label>, text: '' }]
  donutThickness: 0.42,  // fração do raio
  // logo da Paradigma: logo none|icone|full|nome · color = tom (cinza padrão) ·
  // pos center = marca d'água (grande, faded, atrás dos dados) · header|footer =
  // logo no canto, com region externo|interno (à área do plot) e align left|right ·
  // opacity null = resolve por pos · size (fator de escala)
  watermark: { logo: 'icone', pos: 'center', region: 'externo', align: 'right', color: '#94A3B8', opacity: 0.08, size: 0.7 },
};

import { LOGOS } from './logos.js';
// mesmo set (36 da casa + 421 Ionicons) e mesmo desenho do criador de timelines
import { iconSvg, isTextIcon, textIconLabel } from './timeline-icons.js';

// ── util ─────────────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// chave estável do valor de um tick (pro override de texto do eixo Y)
const yKey = (v) => String(+(+v).toFixed(6));

// marca d'água: <svg> aninhado com o logo, tingido gravando a cor DIRETO nos
// fills — currentColor não sobrevive à rasterização em canvas (PNG). Recebe a
// caixa-alvo {x,y,w,h}; preserveAspectRatio encaixa mantendo a razão.
export function logoSvg(logo, box, color, opacity) {
  const L = LOGOS[logo];
  if (!L) return '';
  const inner = L.inner.replace(/currentColor/g, color);
  // toda caixa é montada com a proporção exata do logo, então centralizar dentro
  // dela (xMidYMid) não deixa sobra — o logo preenche a caixa.
  // opacity num <g> por fora, não no <svg> aninhado: opacity direto no <svg>
  // renderiza certo embutido numa página (innerHTML), mas errado quando o
  // arquivo .svg é aberto sozinho (documento SVG top-level) — <g> é consistente
  // nos dois casos.
  return `<g opacity="${opacity}"><svg x="${n2(box.x)}" y="${n2(box.y)}" width="${n2(box.w)}" height="${n2(box.h)}"`
    + ` viewBox="0 0 ${L.w} ${L.h}" preserveAspectRatio="xMidYMid meet"`
    + ` aria-hidden="true">${inner}</svg></g>`;
}
const n2 = (v) => Math.round(v * 100) / 100;

// Estilo do traço da linha. Os intervalos escalam com a espessura porque o
// traço padrão é 8px: valores fixos (o "7 5" antigo) somem num traço grosso.
// Pontilhado usa traço de comprimento 0 + linecap round = bolinha.
// `dashed: true` de specs antigas continua valendo.
const STROKES = { dashed: (w) => `${n2(w * 1.7)} ${n2(w * 1.15)}`, dotted: (w) => `0 ${n2(w * 1.8)}` };
function dashArray(se, w) {
  const kind = se.stroke || (se.dashed ? 'dashed' : 'solid');
  const fn = STROKES[kind];
  return fn ? ` stroke-dasharray="${fn(w)}"` : '';
}
const deepMerge = (base, over) => {
  const out = { ...base };
  for (const k in over) {
    if (over[k] === undefined) continue;
    out[k] = (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]))
      ? deepMerge(base[k] ?? {}, over[k]) : over[k];
  }
  return out;
};

export function formatValue(v, y = {}) {
  if (v == null || Number.isNaN(v)) return '—';
  const { format = 'num', prefix = '', suffix = '', dp } = y;
  // maximumFractionDigits (não minimum): 80 sai "80", 68.5 sai "68,5"
  // `dp` força o número de casas — o eixo log/symlog usa isso porque as 2 casas
  // padrão transformam 0,001 em "0" e o eixo ganha três rótulos "0" seguidos
  const br = (x, d) => x.toLocaleString('pt-BR', { maximumFractionDigits: dp ?? d });
  let s;
  if (format === 'pct') s = br(v, Math.abs(v) < 10 ? 1 : 0) + '%';
  else if (format === 'compact') {
    const a = Math.abs(v);
    const [d, u] = a >= 1e12 ? [v / 1e12, ' tri'] : a >= 1e9 ? [v / 1e9, ' bi'] : a >= 1e6 ? [v / 1e6, ' mi'] : a >= 1e3 ? [v / 1e3, ' mil'] : [v, ''];
    s = br(d, u ? (Math.abs(d) < 100 ? 1 : 0) : 2) + u;
  } else if (format === 'usd') s = 'US$ ' + br(v, Math.abs(v) < 10 ? 2 : 0);
  else if (format === 'brl') s = 'R$ ' + br(v, Math.abs(v) < 10 ? 2 : 0);
  else s = br(v, 2);
  return prefix + s + suffix;
}

/* Ticks de escala log: potências de 10, com subdivisões só quando o intervalo
 * é curto — numa faixa de 1 década "1, 10" sozinho é inútil, mas em 5 décadas
 * o 1-2-5 de cada uma vira uma parede de rótulo. Sempre cai em décadas
 * fechadas nas pontas, então o domínio (min/max dos ticks) fica redondo. */
function logTicks(min, max) {
  const lo = Math.floor(Math.log10(min)), hi = Math.ceil(Math.log10(max));
  const decadas = hi - lo;
  const mults = decadas <= 1 ? [1, 2, 3, 5, 7] : decadas <= 3 ? [1, 2, 5] : [1];
  const out = [];
  for (let e = lo; e <= hi; e++) {
    for (const m of mults) {
      const v = +(m * 10 ** e).toPrecision(12);
      if (v >= 10 ** lo && v <= 10 ** hi) out.push(v);
    }
  }
  return out.length >= 2 ? out : [10 ** lo, 10 ** hi];
}

/* SYMLOG — log que atravessa o zero (PnL, funding, variação: cruzam o zero E
 * variam por ordem de grandeza). Log puro não existe pra negativo, e não é
 * questão de implementação: log(-5) não é definido, e log(0) é -infinito.
 *
 * Solução clássica (a `symlog` do matplotlib): LINEAR dentro de [-T, T], LOG
 * fora, espelhado nos dois lados. A faixa linear é o que permite o zero
 * existir no eixo; T é a fronteira.
 *
 *   |v| ≤ T  →  v/T                     (ocupa 1 unidade de eixo, linear)
 *   |v| > T  →  ±(1 + log10(|v|/T))     (cada década vale 1 unidade)
 *
 * A transformação é contínua em ±T (as duas expressões dão ±1), então não há
 * degrau visível na curva. */
export const symlog = (v, T) => (v === 0 ? 0
  : Math.sign(v) * (Math.abs(v) <= T ? Math.abs(v) / T : 1 + Math.log10(Math.abs(v) / T)));
// exportada porque o editor precisa da inversa EXATA pra converter o arraste de
// volta em valor — reimplementar lá sairia do sincronismo na primeira mudança
export const symlogInv = (y, T) => (y === 0 ? 0
  : Math.sign(y) * (Math.abs(y) <= 1 ? Math.abs(y) * T : T * 10 ** (Math.abs(y) - 1)));

/* Fronteira da faixa linear. Idealmente é a menor magnitude não-zero (assim
 * todo dado cai na parte log), mas com um piso: um único valor minúsculo
 * (0,0001 no meio de milhões) geraria 10 décadas e espremeria o resto do
 * gráfico. Limita em 5 décadas abaixo do maior valor absoluto. */
function symThreshold(vals) {
  const abs = vals.map(Math.abs).filter((v) => v > 0);
  if (!abs.length) return 1;
  const maxAbs = Math.max(...abs), minAbs = Math.min(...abs);
  return 10 ** Math.max(Math.floor(Math.log10(minAbs)), Math.floor(Math.log10(maxAbs)) - 5);
}

// Ticks do symlog: o ZERO (que é o ponto do eixo em que o dado muda de sinal,
// então nunca pode faltar) mais as décadas de cada lado que couberem.
function symTicks(min, max, T) {
  const dec = (limite) => {
    const out = [];
    for (let e = Math.log10(T); 10 ** e <= Math.abs(limite) * 1.0000001; e++) out.push(+(10 ** e).toPrecision(12));
    return out;
  };
  const neg = min < 0 ? dec(min).map((v) => -v).reverse() : [];
  const pos = max > 0 ? dec(max) : [];
  return [...neg, 0, ...pos];
}

// Passos "redondos" (1/2/2.5/5 × 10^n) cobrindo [min,max].
function niceTicks(min, max, count) {
  if (min === max) { min -= 1; max += 1; }
  const step0 = (max - min) / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(step0));
  const norm = step0 / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}

// Largura aproximada de texto. ponytail: heurística por caractere em vez de
// medir no DOM — mantém o renderer puro (roda em Node, em worker, no build do
// PDF). Erra ~5% em strings curtas, o suficiente pra dimensionar margens.
// × 0.9: todo chamador atual desenha com stretch:90 (rótulo de eixo, legenda,
// fonte do dado) — sem isso a margem esquerda/inferior saía maior que as
// outras (media 12-20px a mais nos 4 lados de padding da imagem).
const textW = (s, size) => String(s).length * size * 0.53 * 0.9;

const linePath = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + n2(p[0]) + ' ' + n2(p[1])).join(' ');

// Interpolação monótona (Fritsch–Carlson). Catmull-Rom seria menos código, mas
// dá overshoot — a curva sobe acima do topo real da série e o gráfico passa a
// mentir sobre o dado. Numa casa de pesquisa isso não pode acontecer.
function smoothPath(pts) {
  const n = pts.length;
  if (n < 3) return linePath(pts);
  const dx = [], m = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0];
    m[i] = dx[i] === 0 ? 0 : (pts[i + 1][1] - pts[i][1]) / dx[i];
  }
  const t = [m[0]];
  // média harmônica; zera na virada de sinal, e é isso que trava o overshoot
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (2 * m[i - 1] * m[i]) / (m[i - 1] + m[i]);
  t[n - 1] = m[n - 2];
  let d = `M${n2(pts[0][0])} ${n2(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${n2(pts[i][0] + h)} ${n2(pts[i][1] + t[i] * h)},`
       + `${n2(pts[i + 1][0] - h)} ${n2(pts[i + 1][1] - t[i + 1] * h)},`
       + `${n2(pts[i + 1][0])} ${n2(pts[i + 1][1])}`;
  }
  return d;
}

const arc = (cx, cy, rOut, rIn, a0, a1) => {
  const P = (r, a) => [n2(cx + r * Math.cos(a)), n2(cy + r * Math.sin(a))];
  const big = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = P(rOut, a0), [x1, y1] = P(rOut, a1), [x2, y2] = P(rIn, a1), [x3, y3] = P(rIn, a0);
  return `M${x0} ${y0}A${n2(rOut)} ${n2(rOut)} 0 ${big} 1 ${x1} ${y1}L${x2} ${y2}A${n2(rIn)} ${n2(rIn)} 0 ${big} 0 ${x3} ${y3}Z`;
};

// ── render ───────────────────────────────────────────────────────────────────
export function renderChart(userSpec = {}, opts = {}) {
  const s = deepMerge(DEFAULTS, userSpec);
  const t = THEMES[s.theme] || THEMES.dark;
  const W = s.width, H = s.height;
  const F = s.fontScale;
  const fs = { title: 18 * F, sub: 17 * F, legend: 14 * F, axis: 13 * F, val: 13 * F, src: 12 * F };   // title: 60% do tamanho antigo (30)
  // sufixo pra IDs de gradiente — vários gráficos podem acabar no mesmo DOM
  // (diagramação embute o SVG direto no relatório), então "grad-0" colidiria
  const uid = Math.random().toString(36).slice(2, 8);

  // filtra as ocultas aqui, uma vez só: tudo daqui pra baixo (legenda, domínio
  // do eixo, formas) já as ignora sem precisar checar. _i guarda o índice em
  // spec.series — depois do filtro a posição no array não aponta mais de volta,
  // e o editor usa esse índice pra saber que dado o arraste altera.
  const series = (s.series || []).map((se, i) => ({
    ...se,
    name: se.name ?? SERIES_NAMES[i] ?? `Série ${i + 1}`,
    color: se.color || t.series[i % t.series.length],
    data: (se.data || []).map((v) => (v === null || v === '' ? null : Number(v))),
    _i: i,
  })).filter((se) => !se.hidden);
  const labels = s.labels?.length ? s.labels : (series[0]?.data || []).map((_, i) => String(i + 1));

  const out = [];
  const pad = 34 * F;
  let top = pad;

  // — logo da Paradigma — (canto opaco no header/footer, ou marca d'água faded
  // no centro; some com logo:'none')
  const wm = s.watermark || {};
  const wmL = wm.logo && wm.logo !== 'none' ? LOGOS[wm.logo] : null;
  const wmOp = wm.opacity ?? (wm.pos === 'center' ? 0.08 : 1);   // centro faded, canto opaco
  const wmH = wmL ? 40 * F * (wm.size || 1) : 0;          // altura do logo no canto
  const wmW = wmL ? wmH * (wmL.w / wmL.h) : 0;

  // — cabeçalho — (cada texto só entra se o switch estiver ligado E tiver conteúdo)
  const showTitle = s.title && s.show?.title;
  const showSub = s.subtitle && s.show?.subtitle;
  const showSrc = s.source && s.show?.source;
  if (showTitle) { top += fs.title * 0.82; out.push(txt(pad, top, esc(s.title), { size: fs.title, weight: 600, fill: t.ink, ls: -0.02 })); }
  if (showSub) { top += fs.sub * 1.35; out.push(txt(pad, top, esc(s.subtitle), { size: fs.sub, fill: t.muted, stretch: 90 })); }
  if (showTitle || showSub) top += 34 * F;   // gap até o gráfico — folga maior que antes (era 22)

  // logo no cabeçalho EXTERNO reserva faixa no topo (não pisa nos dados); o
  // INTERNO desenha por cima do plot, então não reserva nada.
  const wmCorner = wmL && (wm.pos === 'header' || wm.pos === 'footer');
  if (wmCorner && wm.pos === 'header' && wm.region === 'externo') top = Math.max(top, pad + wmH + 18 * F);

  // — legenda (sempre presente com 2+ séries: identidade nunca só por cor;
  // candle dispensa — O/H/L/C não são séries de verdade) —
  const showLegend = s.legend !== 'none' && series.length >= 2 && s.type !== 'candle';
  const legendH = showLegend ? fs.legend * 2.1 : 0;
  if (showLegend && s.legend === 'top') { out.push(legend(series, pad, top + fs.legend, fs.legend, t)); top += legendH; }

  const srcH = showSrc ? fs.src * 2.2 : 0;
  const wmFooterH = wmCorner && wm.pos === 'footer' && wm.region === 'externo' ? wmH + 10 * F : 0;
  const bottomLegendH = showLegend && s.legend === 'bottom' ? legendH : 0;
  const plotBottom = H - pad - Math.max(srcH, wmFooterH) - bottomLegendH;

  // marca d'água central: grande e faded, DESENHADA ANTES do plot (os dados
  // passam por cima, como DefiLlama/CoinMarketCap). A caixa tem a proporção
  // exata do logo e é centralizada na IMAGEM inteira (não na área do plot),
  // então o logo fica perfeitamente no centro.
  if (wmL && wm.pos === 'center') {
    const ar = wmL.w / wmL.h;
    let bw = Math.min(W * 0.5 * (wm.size || 1), W * 0.92), bh = bw / ar;
    const capH = Math.min((H - 2 * pad) * (wm.size || 1), H * 0.82);   // não estoura a altura
    if (bh > capH) { bh = capH; bw = bh * ar; }
    out.push(logoSvg(wm.logo, { x: (W - bw) / 2, y: (H - bh) / 2, w: bw, h: bh }, wm.color, wmOp));
  }

  // meta interno pra pegar a caixa do plot (pro logo INTERNO); reusa o do editor
  const meta = opts.meta || {};
  if (s.type === 'bubble') {
    out.push(...bubbles(s, t, { pad, top, plotBottom, W, H, fs, meta }));
  } else if (s.type === 'sankey') {
    out.push(...sankey(s, t, { pad, top, plotBottom, W, H, fs, meta }));
  } else if (s.type === 'donut' || s.type === 'pie') {
    out.push(...donut(series, labels, s, t, { pad, top, plotBottom, W, fs }));
  } else {
    out.push(...cartesian(series, labels, s, t, { pad, top, plotBottom, W, fs, meta, uid }));
  }

  if (showLegend && s.legend === 'bottom') out.push(legend(series, pad, plotBottom + legendH * 0.72, fs.legend, t));
  if (showSrc) out.push(txt(pad, H - pad + fs.src * 0.3, esc(s.source), { size: fs.src, fill: t.faint, stretch: 90 }));

  // logo de canto (header/footer): desenhado DEPOIS do plot pra o interno ficar
  // por cima dos dados. Externo alinha às margens do chart; interno, aos cantos
  // da área de plotagem (meta.plot; cai nas margens se não houver — ex.: donut).
  if (wmCorner) {
    const p = meta.plot, ins = 16 * F;
    const pl = p ? p.left : pad, prr = p ? p.right : W - pad;
    const x = wm.region === 'interno'
      ? (wm.align === 'left' ? pl + ins : prr - ins - wmW)
      : (wm.align === 'left' ? pad : W - pad - wmW);
    const y = wm.pos === 'header'
      ? (wm.region === 'interno' ? (p ? p.top : top) + ins : pad)
      : (wm.region === 'interno' ? (p ? p.bottom : plotBottom) - ins - wmH : H - pad - wmH);
    out.push(logoSvg(wm.logo, { x, y, w: wmW, h: wmH }, wm.color, wmOp));
  }

  const font = opts.fontDataUri
    ? `@font-face{font-family:"Plex";src:url("${opts.fontDataUri}") format("truetype-variations");font-weight:100 700;font-stretch:62% 100%}`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(s.title || 'Gráfico')}">
<style>${font}text{font-family:"Plex",system-ui,sans-serif;font-synthesis:none}</style>
${s.transparent ? '' : `<rect width="${W}" height="${H}" fill="${t.surface}"/>`}
${out.join('\n')}
</svg>`;
}

function txt(x, y, content, o = {}) {
  const a = [`x="${n2(x)}"`, `y="${n2(y)}"`, `font-size="${n2(o.size)}"`, `fill="${o.fill}"`];
  if (o.weight) a.push(`font-weight="${o.weight}"`);
  if (o.stretch) a.push(`font-stretch="${o.stretch}%"`);
  if (o.ls) a.push(`letter-spacing="${n2(o.ls * o.size)}"`);
  if (o.anchor) a.push(`text-anchor="${o.anchor}"`);
  if (o.baseline) a.push(`dominant-baseline="${o.baseline}"`);
  if (o.opacity) a.push(`opacity="${o.opacity}"`);
  return `<text ${a.join(' ')}>${content}</text>`;
}

function legend(series, x, y, size, t) {
  let cx = x;
  const parts = series.map((se) => {
    const g = `<rect x="${n2(cx)}" y="${n2(y - size * 0.72)}" width="${n2(size * 0.78)}" height="${n2(size * 0.78)}" rx="2" fill="${se.color}"/>`
      // texto em token de tinta, nunca na cor da série
      + txt(cx + size * 1.15, y, esc(se.name), { size, fill: t.muted, stretch: 90 });
    cx += size * 1.15 + textW(se.name, size) + size * 1.5;
    return g;
  });
  return parts.join('');
}

// ── cartesiano: line / area / bar / hbar / stacked / stacked100 / candle ──────
function cartesian(series, labels, s, t, box) {
  const { pad, top, plotBottom, W, fs, meta, uid } = box;
  const horiz = s.type === 'hbar';
  const stacked = s.type === 'stacked' || s.type === 'stacked100';
  const isCandle = s.type === 'candle';
  const out = [];

  // combo: cada série pode ser barra ou linha (se.as); candle usa as 4
  // primeiras séries como O/H/L/C. Em empilhado, série com as:'line' sai do
  // empilhamento e vira overlay (ex.: linha de "acumulado" sobre barra
  // empilhada, tipicamente no eixo y2) — definido cedo pra filtrar o domínio
  // do eixo Y mais abaixo.
  const kindOf = (se) => se.as || (s.type === 'bar' || horiz || stacked ? 'bar' : s.type === 'area' ? 'area' : 'line');
  const candleSer = isCandle ? series.slice(0, 4) : [];
  const plainSer = isCandle ? series.slice(4) : series;
  const stackSer = stacked ? plainSer.filter((se) => kindOf(se) !== 'line') : plainSer;

  // eixo direito (y2): combo com escalas diferentes (ex.: barras em US$ +
  // linha de preço, ou barra empilhada + linha de acumulado). hbar ignora —
  // não faz sentido combinar com barra horizontal.
  const canY2 = !horiz;
  const y2cfg = { format: 'compact', prefix: '', suffix: '', min: null, max: null, ticks: 5, zero: true, ...(s.y2 || {}) };
  const onY2 = (se) => canY2 && se.axis === 'y2';
  const serY1 = series.filter((se) => !onY2(se)), serY2 = series.filter(onY2);

  // valores por índice (empilhados somam — só as séries de barra; overlay de
  // linha fica de fora, mede pelo eixo dele mesmo)
  let vals = [];
  if (stacked) {
    labels.forEach((_, i) => {
      const pos = stackSer.reduce((a, se) => a + Math.max(0, se.data[i] ?? 0), 0);
      const neg = stackSer.reduce((a, se) => a + Math.min(0, se.data[i] ?? 0), 0);
      vals.push(pos, neg);
    });
    if (s.type === 'stacked100') vals = [0, 100];
  } else {
    vals = serY1.flatMap((se) => se.data).filter((v) => v != null);
  }
  if (!vals.length) vals = [0, 1];

  /* Escala log. Nunca em stacked100 — lá a soma É a escala, e segmento
   * empilhado em log não soma visualmente.
   *
   * Duas variantes, escolhidas pelo DADO, não por opção separada na UI: com
   * tudo positivo é log puro; havendo negativo ou zero, vira SYMLOG (linear
   * perto do zero, log fora — ver symlog() lá em cima). Quem pede "escala
   * logarítmica" quer comprimir ordens de grandeza; se a série cruza o zero,
   * o log puro simplesmente não existe e recusar seria inútil.  */
  const podeLog = s.y.scale === 'log' && s.type !== 'stacked100' && vals.some((v) => v !== 0);
  const symY = podeLog && vals.some((v) => v <= 0);
  const logY = podeLog && !symY;
  const T = symY ? symThreshold(vals) : 1;

  let vMin = s.y.min ?? Math.min(...(logY ? vals.filter((v) => v > 0) : vals));
  let vMax = s.y.max ?? Math.max(...(logY ? vals.filter((v) => v > 0) : vals));
  // `zero` não se aplica: em log puro o zero fica infinitamente longe, e em
  // symlog ele já está garantido no eixo por construção
  if (!podeLog && s.y.zero && s.y.min == null && vMin > 0 && !isCandle) vMin = 0;   // candle não força o zero
  if (!podeLog && s.y.zero && s.y.max == null && vMax < 0) vMax = 0;
  const ticks = symY ? symTicks(vMin, vMax, T)
    : logY ? logTicks(Math.max(vMin, 1e-12), Math.max(vMax, 1e-11))
      : (s.y.min != null && s.y.max != null)
        ? niceTicks(vMin, vMax, s.y.ticks).filter((v) => v >= vMin - 1e-9 && v <= vMax + 1e-9)
        : niceTicks(vMin, vMax, s.y.ticks);
  // em log, min/max manual só vale se for positivo (o editor congela o domínio
  // ao entrar em edição gravando esses dois campos — sem isso o eixo fugiria
  // enquanto o ponto é arrastado)
  const okLim = (v) => (logY ? v > 0 : v != null);
  const dMin = (okLim(s.y.min) ? s.y.min : null) ?? Math.min(...ticks);
  const dMax = (okLim(s.y.max) ? s.y.max : null) ?? Math.max(...ticks);

  const yFmt = s.type === 'stacked100' ? { format: 'pct' } : s.y;
  /* Casas decimais dos RÓTULOS do eixo em escala log/symlog. Cada tick é uma
   * ordem de grandeza diferente, então as 2 casas padrão colapsam a ponta de
   * baixo: num eixo de funding (0,001 · 0,01 · 0,1) saíam "0", "0,01", "0,1" —
   * dois rótulos "0" e um "-0". Aqui as casas saem do MENOR tick, não do valor
   * sendo formatado, pra todos os rótulos ficarem coerentes entre si. */
  const menorTick = Math.min(...ticks.map(Math.abs).filter((v) => v > 0));
  const tickFmt = podeLog && menorTick < 1
    ? { ...yFmt, dp: Math.min(6, Math.ceil(-Math.log10(menorTick))) }
    : yFmt;
  // texto do tick: override manual (spec.y.tickText[valor]) ou o formatado
  const tickText = s.y.tickText || {};
  const tickLabels = ticks.map((v) => tickText[yKey(v)] ?? formatValue(v, tickFmt));

  // escala do y2 (só se alguma série pedir)
  const has2 = serY2.length > 0;
  let ticks2 = [], d2Min = 0, d2Max = 1, tickLabels2 = [];
  if (has2) {
    const v2 = serY2.flatMap((se) => se.data).filter((v) => v != null);
    let m2 = y2cfg.min ?? Math.min(...v2), M2 = y2cfg.max ?? Math.max(...v2);
    if (y2cfg.zero && y2cfg.min == null && m2 > 0) m2 = 0;
    ticks2 = niceTicks(m2, M2, y2cfg.ticks);
    d2Min = y2cfg.min ?? Math.min(...ticks2); d2Max = y2cfg.max ?? Math.max(...ticks2);
    const tt2 = y2cfg.tickText || {};
    tickLabels2 = ticks2.map((v) => tt2[yKey(v)] ?? formatValue(v, y2cfg));
  }

  // margens: eixo de valor de um lado, eixo de categoria do outro.
  // y.side escolhe o lado do eixo de valor; o y2 (quando existe) vai pro oposto.
  const yRight = !horiz && s.y.side === 'right';
  const valAxisW = Math.max(...tickLabels.map((l) => textW(l, fs.axis))) + 14 * s.fontScale;
  const val2AxisW = has2 ? Math.max(...tickLabels2.map((l) => textW(l, fs.axis))) + 14 * s.fontScale : 0;
  const yTitleW = s.y.title && !horiz ? fs.axis * 1.6 : 0;
  // folga entre a linha do eixo e o rótulo — a MESMA nos dois lados, senão a
  // margem externa da imagem sai diferente à esquerda e à direita
  const axisGap = 22 * s.fontScale;
  // 1.85 (não 2.2): sobrava folga não usada abaixo da linha de base do texto
  // do eixo X (medido: baixo/esquerda tinham mais respiro que topo/direita)
  const catAxisH = fs.axis * 1.85;
  const catAxisW = horiz ? Math.max(...labels.map((l) => textW(l, fs.axis))) + 14 * s.fontScale : 0;

  const barSer = !horiz && !stacked ? plainSer.filter((se) => kindOf(se) === 'bar') : [];
  // overlay de linha: em empilhado só entra quem tem as:'line'/'area' explícito
  // (o default de kindOf já é 'bar' pra empilhado, então isso não pega a
  // barra normal) — hbar continua sem combo
  const lineSer = !horiz ? plainSer.filter((se) => kindOf(se) !== 'bar') : [];
  // com barra, candle ou overlay sobre empilhado, pontos de linha alinham ao CENTRO da banda
  const mixed = isCandle || (barSer.length > 0 && lineSer.length > 0) || (stacked && lineSer.length > 0);

  // rótulo do eixo X é centrado no ponto, então metade da largura dele fica pra
  // fora — e se o rótulo da ponta estiver colado na borda do plot, essa metade
  // invade a margem da imagem. Reserva só o que de fato passa da borda: quanto
  // o rótulo já está pra dentro depende do tipo (barra/candle nascem meia-banda
  // pra dentro) e do índice dele (com x.hidden a última visível pode estar longe
  // da ponta), então mede pela posição real, não pela largura sozinha.
  const every = Math.max(1, s.x.every | 0);
  const xHidden = new Set(s.x.hidden || []);
  const visIdx = labels.map((_, i) => i).filter((i) => !(i % every) && !xHidden.has(i));
  const rawLeft = pad + (horiz ? catAxisW : (yRight ? val2AxisW : valAxisW + yTitleW));
  const rawRight = W - pad - (horiz ? 0 : (yRight ? valAxisW + yTitleW : val2AxisW));
  const centeredCat = !((s.type === 'line' || s.type === 'area') && !mixed);
  const nCat = labels.length;
  // distâncias na escala provisória: a reserva encolhe o plot e muda um pouco
  // essas contas, mas o erro é de fração de pixel — não vale iterar
  const rawPlotW = rawRight - rawLeft;
  const distL = (i) => (centeredCat ? rawPlotW * (i + 0.5) / nCat : (nCat > 1 ? rawPlotW * i / (nCat - 1) : rawPlotW / 2));
  const distR = (i) => (centeredCat ? rawPlotW * (nCat - i - 0.5) / nCat : (nCat > 1 ? rawPlotW * (nCat - 1 - i) / (nCat - 1) : rawPlotW / 2));
  const over = (i, dist) => (i == null || horiz ? 0 : Math.max(0, textW(labels[i], fs.axis) / 2 - dist(i)));
  // limite até onde o texto pode chegar: NÃO é o pad, é o mesmo tanto que o
  // rótulo do eixo de valor já vaza pra fora dele (valAxisW reserva +14·fs mas
  // o texto é desenhado a −22·fs, sobrando 8·fs pra fora). Clampar no pad puro
  // deixaria a margem da direita maior que a dos outros 3 lados.
  const outerInk = pad - 8 * s.fontScale;
  const left = Math.max(rawLeft, outerInk + over(visIdx[0], distL));
  const right = Math.min(rawRight, W - outerInk - over(visIdx.at(-1), distR));
  const bottom = plotBottom - catAxisH - (s.x.title ? fs.axis * 1.5 : 0);
  const plotH = bottom - top, plotW = right - left;

  /* Fração 0-1 do valor dentro do domínio — o coração das três escalas:
   *   linear  distância = diferença de valor
   *   log     distância = diferença de EXPOENTE (valor ≤ 0 encosta no piso em
   *           vez de virar NaN e sumir com a série inteira)
   *   symlog  distância = diferença de symlog(), que já trata sinal e zero    */
  const tf = symY ? (v) => symlog(v, T) : logY ? (v) => Math.log10(Math.max(v, Number.MIN_VALUE)) : (v) => v;
  const t0 = tf(dMin), t1 = tf(dMax), span = (t1 - t0) || 1;
  const frac = (v) => (podeLog
    ? Math.min(1, Math.max(0, (tf(v) - t0) / span))
    : (v - dMin) / (dMax - dMin));
  const V = (v) => horiz ? left + frac(v) * plotW
                         : bottom - frac(v) * plotH;
  const V2 = (v) => bottom - ((v - d2Min) / (d2Max - d2Min)) * plotH;
  const Vfor = (se) => (onY2(se) ? V2 : V);
  const fmtFor = (se) => (onY2(se) ? y2cfg : yFmt);

  // geometria pra edição interativa: caixa do plot + como converter pixel↔valor.
  // stacked100 mede em 0–100 (%); os outros no domínio real do eixo.
  if (meta) {
    meta.plot = { left, right, top, bottom, plotW, plotH, horiz };
    // log/sym: o editor precisa inverter pixel→valor pela MESMA curva, senão o
    // ponto largado pula de ordem de grandeza (sym leva o T junto)
    meta.scale = { dMin, dMax, log: logY, sym: symY, T };
    meta.scale2 = has2 ? { dMin: d2Min, dMax: d2Max } : null;
    meta.format = s.type === 'stacked100' ? { format: 'pct' } : s.y;
    meta.format2 = has2 ? y2cfg : null;
    meta.marks = [];
    meta.catLabels = [];   // posição de cada rótulo de categoria, pra editar in-place
    meta.yTicks = [];      // posição/valor de cada tick do eixo de valor, idem
  }
  const band = (horiz ? plotH : plotW) / labels.length;
  const catCenter = (i) => (horiz ? top : left) + band * (i + 0.5);
  const catPoint = (i) => labels.length === 1 ? (horiz ? top : left) + (horiz ? plotH : plotW) / 2
    : (horiz ? top : left) + ((horiz ? plotH : plotW) / (labels.length - 1)) * i;

  // — grade + eixo de valor —
  const gridOn = s.grid === 'both' || s.grid === (horiz ? 'x' : 'y');
  ticks.forEach((v, i) => {
    const p = V(v);
    const zero = Math.abs(v) < 1e-9 && dMin < 0;
    if (gridOn) {
      out.push(horiz
        ? `<line x1="${n2(p)}" y1="${n2(top)}" x2="${n2(p)}" y2="${n2(bottom)}" stroke="${zero ? t.axis : t.grid}" stroke-width="1"/>`
        : `<line x1="${n2(left)}" y1="${n2(p)}" x2="${n2(right)}" y2="${n2(p)}" stroke="${zero ? t.axis : t.grid}" stroke-width="1"/>`);
    }
    const lx = horiz ? p : (yRight ? right + axisGap : left - axisGap);
    const ly = horiz ? bottom + fs.axis * 1.5 : p + fs.axis * 0.35;
    const anchor = horiz ? 'middle' : (yRight ? 'start' : 'end');
    out.push(txt(lx, ly, esc(tickLabels[i]), { size: fs.axis, fill: t.faint, anchor, stretch: 90 }));
    if (meta) meta.yTicks.push({ axis: 'y', value: v, key: yKey(v), cx: lx, cy: ly, anchor, w: textW(tickLabels[i], fs.axis), h: fs.axis, horiz });
  });
  // ticks do y2 no lado oposto ao do eixo principal (sem gridline própria — a
  // grade é do eixo de valor principal)
  if (has2) ticks2.forEach((v, i) => {
    const p = V2(v), ly = p + fs.axis * 0.35;
    const lx = yRight ? left - axisGap : right + axisGap;
    const anchor = yRight ? 'end' : 'start';
    out.push(txt(lx, ly, esc(tickLabels2[i]), { size: fs.axis, fill: t.faint, anchor, stretch: 90 }));
    if (meta) meta.yTicks.push({ axis: 'y2', value: v, key: yKey(v), cx: lx, cy: ly, anchor, w: textW(tickLabels2[i], fs.axis), h: fs.axis, horiz });
  });

  // — eixo de categoria — (every/xHidden vêm de cima: entram no cálculo da margem)
  const catPos = (i) => ((s.type === 'line' || s.type === 'area') && !mixed ? catPoint(i) : catCenter(i));
  const xOffsets = s.x.offsets || {};
  labels.forEach((l, i) => {
    if (i % every) return;
    const p = catPos(i);
    // offset desloca só a POSIÇÃO HORIZONTAL DO TEXTO — p (posição real do
    // ponto/barra) não muda, e a vertical do rótulo é sempre a mesma do eixo
    const lx = (horiz ? left - axisGap : p) + (xOffsets[i] || 0);
    // 2.2 (não 1.6): o rótulo cabia inteiro dentro do catAxisH reservado (fit
    // "justo", sem sobra) — mas os outros 3 lados vazam um pouco pra fora da
    // própria margem (texto de eixo Y centrado na grade, "jul" mais largo que
    // o espaço da última categoria). Empurrando pra baixo, o rótulo do eixo X
    // vaza pela mesma quantidade e a margem inferior finalmente bate com as outras.
    const ly = horiz ? p + fs.axis * 0.35 : bottom + fs.axis * 2.2;
    const anchor = horiz ? 'end' : 'middle';
    const hidden = xHidden.has(i);
    if (!hidden) out.push(txt(lx, ly, esc(l), { size: fs.axis, fill: t.faint, anchor, stretch: 90 }));
    // entra no meta mesmo oculto: mantém a alça clicável (reativar/reposicionar) no editor
    if (meta) meta.catLabels.push({ i, cx: lx, cy: ly, anchor, w: textW(l, fs.axis), h: fs.axis, horiz, hidden });
  });
  // à direita o título gira +90 (lê de cima pra baixo), que é a convenção do
  // eixo secundário — girado -90 dos dois lados o da direita sai de cabeça pra baixo
  if (s.y.title && !horiz) out.push(`<g transform="translate(${n2(yRight ? W - pad - fs.axis * 0.8 : pad + fs.axis * 0.8)},${n2((top + bottom) / 2)}) rotate(${yRight ? 90 : -90})">${txt(0, 0, esc(s.y.title), { size: fs.axis, fill: t.muted, anchor: 'middle', stretch: 90 })}</g>`);
  // 3.9 (não 3.1): o rótulo de categoria passou a vazar mais pra baixo (ly
  // acima, 2.2 em vez de 1.6) — sem esse ajuste o título do eixo X colidia com ele
  if (s.x.title) out.push(txt((left + right) / 2, bottom + fs.axis * 3.9, esc(s.x.title), { size: fs.axis, fill: t.muted, anchor: 'middle', stretch: 90 }));

  // — anotações (linhas verticais marcadas) —
  (s.annotations || []).forEach((a) => {
    const i = typeof a.at === 'number' ? a.at : labels.indexOf(a.at);
    if (i < 0) return;
    const p = catPos(i);
    out.push(`<line x1="${n2(p)}" y1="${n2(top)}" x2="${n2(p)}" y2="${n2(bottom)}" stroke="${t.axis}" stroke-width="1" stroke-dasharray="4 4"/>`);
    if (a.text) out.push(txt(p + 6, top + fs.axis, esc(a.text), { size: fs.axis, fill: t.muted, stretch: 90 }));
  });

  // — marcas —
  const GAP = 2; // respiro de 2px entre fatias/barras vizinhas (spec de marca)
  const R = Math.max(0, s.barRadius);
  const track = s.barTrack;

  // — candle: pavio (mín→máx) + corpo (abertura→fechamento), verde/coral —
  if (isCandle && candleSer.length >= 4) {
    const [O, Hi, Lo, C] = candleSer.map((se) => se.data);
    const cdl = s.candle || {};
    // sem cor explícita, cai nos slots verde e coral do tema (segue claro↔escuro)
    const up = cdl.up || t.series[1], down = cdl.down || t.series[4];
    const wickW = Math.max(0, cdl.wick ?? 1.2);
    const bw = Math.max(2, Math.min(band * 0.62, 14 * s.fontScale));
    labels.forEach((_, i) => {
      if (O[i] == null || Hi[i] == null || Lo[i] == null || C[i] == null) return;
      const x = catCenter(i), col = C[i] >= O[i] ? up : down;
      out.push(`<line x1="${n2(x)}" y1="${n2(V(Hi[i]))}" x2="${n2(x)}" y2="${n2(V(Lo[i]))}" stroke="${col}" stroke-width="${n2(wickW)}"/>`);
      const yTop = V(Math.max(O[i], C[i])), yBot = V(Math.min(O[i], C[i]));
      out.push(`<rect x="${n2(x - bw / 2)}" y="${n2(yTop)}" width="${n2(bw)}" height="${n2(Math.max(1.2, yBot - yTop))}" fill="${col}"/>`);
    });
  }

  // — barras do combo (série com as:'bar' num gráfico de linha, ou tipo bar) —
  if (barSer.length) {
    const inner = Math.min(band * (1 - s.barGap), plotW * 0.16);
    const barSize = Math.max(1, inner / barSer.length - (barSer.length > 1 ? GAP : 0));
    barSer.forEach((se, k) => {
      const k0 = se._i, Vx = Vfor(se);
      const zero = onY2(se) ? Math.max(d2Min, Math.min(0, d2Max)) : Math.max(dMin, Math.min(0, dMax));
      labels.forEach((_, i) => {
        const v = se.data[i];
        if (v == null) return;
        const a = Vx(zero), b = Vx(v);
        const x = catCenter(i) - inner / 2 + k * (barSize + GAP);
        if (track.show) out.push(trackRect(x, barSize, top, bottom, false, R, track, se.color));
        out.push(roundedEnd(x, Math.min(a, b), barSize, Math.abs(b - a), Math.min(R, barSize / 2), false, b < a, se.color));
        if (meta) meta.marks.push({ s: k0, i, value: v, base: 0, kind: 'bar', axis: onY2(se) ? 'y2' : 'y', x: x + barSize / 2, y: b });
        if (s.labelMode === 'all') out.push(txt(x + barSize / 2, Math.min(a, b) - 6,
          esc(formatValue(v, fmtFor(se))), { size: fs.val, fill: t.muted, anchor: 'middle', stretch: 90 }));
      });
    });
  }

  if (horiz || stacked) {
    // hbar continua com todas as séries; empilhado exclui o overlay de linha
    // (esse é desenhado depois, no bloco de linha) da pilha em si
    const barsHere = stacked ? stackSer : series;
    const groups = stacked ? 1 : barsHere.length;
    // teto de largura: com 2–3 categorias a banda fica enorme e a barra vira
    // uma parede. 16% do plot é o limite do padrão da casa.
    const inner = Math.min(band * (1 - s.barGap), (horiz ? plotH : plotW) * 0.16);
    const barSize = Math.max(1, inner / groups - (groups > 1 ? GAP : 0));

    labels.forEach((_, i) => {
      let accP = 0, accN = 0;
      const total = stacked && s.type === 'stacked100'
        ? barsHere.reduce((a, se) => a + Math.abs(se.data[i] ?? 0), 0) || 1 : 1;

      barsHere.forEach((se, k) => {
        let v = se.data[i];
        if (v == null) return;
        if (s.type === 'stacked100') v = (v / total) * 100;
        const start = stacked ? (v >= 0 ? accP : accN) : Math.max(dMin, Math.min(0, dMax));
        const end = stacked ? start + v : v;
        if (stacked) { if (v >= 0) accP = end; else accN = end; }

        const a = V(start), b = V(end);
        const cs = catCenter(i) - inner / 2 + (stacked ? 0 : k * (barSize + GAP)) + (stacked ? (band - inner) / 2 * 0 : 0);
        const off = stacked ? catCenter(i) - inner / 2 : cs;
        const len = Math.max(0, Math.abs(b - a) - (stacked ? GAP : 0));
        const size = stacked ? inner : barSize;
        // canto arredondado só na ponta do dado, ancorado na base
        const grow = b < a;
        const x = horiz ? Math.min(a, b) : off;
        const y = horiz ? off : Math.min(a, b) + (stacked && grow ? GAP : 0);
        const w = horiz ? len : size, h = horiz ? size : len;
        const r = stacked ? 0 : Math.min(R, size / 2);
        if (track.show && !stacked) out.push(trackRect(off, size, left, right, true, R, track, se.color));
        out.push(roundedEnd(x, y, w, h, r, horiz, grow, se.color));

        // alça de arraste no topo do segmento; base = quanto já foi empilhado
        // abaixo (0 em barra simples), pra converter arraste → valor da série.
        // s: índice VERDADEIRO em spec.series (barsHere pode ser um filtro)
        if (meta) meta.marks.push({
          s: se._i, i, value: se.data[i], base: stacked ? start : 0, kind: 'bar',
          x: horiz ? b : off + size / 2, y: horiz ? off + size / 2 : b,
        });

        if (s.labelMode === 'all' && !stacked) {
          out.push(txt(horiz ? Math.max(a, b) + 6 : off + size / 2, horiz ? off + size / 2 + fs.val * 0.35 : Math.min(a, b) - 6,
            esc(formatValue(se.data[i], s.y)), { size: fs.val, fill: t.muted, anchor: horiz ? 'start' : 'middle', stretch: 90 }));
        }
      });
    });
  }
  if (lineSer.length) {
    // line / area (e a parte de linha do combo)
    const px = (i) => (mixed ? catCenter(i) : catPoint(i));
    const pending = [];   // rótulos diretos, posicionados só no fim (ver anti-colisão)
    lineSer.forEach((se) => {
      const k = se._i, Vx = Vfor(se);
      const pts = se.data.map((v, i) => (v == null ? null : [px(i), Vx(v)])).filter(Boolean);
      if (meta) se.data.forEach((v, i) => { if (v != null) meta.marks.push({ s: k, i, value: v, base: 0, kind: 'point', axis: onY2(se) ? 'y2' : 'y', x: px(i), y: Vx(v) }); });
      if (!pts.length) return;
      const d = s.smooth ? smoothPath(pts) : linePath(pts);
      if (s.type === 'area' || se.area) {
        const zero = onY2(se) ? Math.max(d2Min, Math.min(0, d2Max)) : Math.max(dMin, Math.min(0, dMax));
        const base = Vx(zero);
        // degradê vertical, forte perto da linha e some na base — mesma
        // convenção de praticamente todo gráfico de área por aí. Um
        // gradiente reto não segue o contorno da curva coluna a coluna (isso
        // exigiria uma máscara por ponto); a aproximação vertical padrão já
        // dá o efeito certo.
        const topOp = lineSer.length > 1 ? 0.22 : 0.35;
        const gid = `grad-${uid}-${k}`;
        out.push(`<defs><linearGradient id="${gid}" x1="0" y1="${n2(top)}" x2="0" y2="${n2(base)}" gradientUnits="userSpaceOnUse">`
          + `<stop offset="0%" stop-color="${se.color}" stop-opacity="${topOp}"/>`
          + `<stop offset="100%" stop-color="${se.color}" stop-opacity="0"/>`
          + `</linearGradient></defs>`);
        out.push(`<path d="${d}L${n2(pts.at(-1)[0])} ${n2(base)}L${n2(pts[0][0])} ${n2(base)}Z" fill="url(#${gid})"/>`);
      }
      out.push(`<path d="${d}" fill="none" stroke="${se.color}" stroke-width="${s.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${dashArray(se, s.strokeWidth)}/>`);
      // um ponto sozinho não desenha traço nenhum — força marcador, senão a
      // série some do gráfico
      const dot = pts.length === 1 ? Math.max(s.dotSize, 9) : s.dotSize;
      if (dot > 0) pts.forEach((p) => out.push(`<circle cx="${n2(p[0])}" cy="${n2(p[1])}" r="${dot / 2}" fill="${se.color}" stroke="${t.surface}" stroke-width="2"/>`));

      // rótulos diretos, seletivos — nunca um número em cada ponto
      const idx = se.data.map((v, i) => [v, i]).filter(([v]) => v != null);
      if (!idx.length) return;
      // com 3+ séries, rotular as duas pontas empilha texto demais no mesmo
      // lugar: fica só a ponta direita, e a legenda carrega a identidade
      const ends = lineSer.length >= 3 ? [idx.at(-1)[1]] : [idx[0][1], idx.at(-1)[1]];
      const picks = s.labelMode === 'all' ? idx.map(([, i]) => i)
        : s.labelMode === 'ends' ? ends
        : s.labelMode === 'max' ? [idx.reduce((a, b) => (b[0] > a[0] ? b : a))[1]] : [];
      [...new Set(picks)].forEach((i) => {
        const last = i === idx.at(-1)[1];
        pending.push({ x: px(i) + (last ? -4 : 4), y: Vx(se.data[i]) - 10, anchor: last ? 'end' : 'start',
          text: esc(formatValue(se.data[i], fmtFor(se))) });
      });
    });

    // anti-colisão: por coluna de ancoragem, empurra rótulos que ficaram
    // sobrepostos. Sem isso, séries próximas escrevem uma por cima da outra.
    const minGap = fs.val * 1.25;
    ['start', 'end'].forEach((side) => {
      const col = pending.filter((p) => p.anchor === side).sort((a, b) => a.y - b.y);
      for (let i = 1; i < col.length; i++) {
        if (col[i].y - col[i - 1].y < minGap) col[i].y = col[i - 1].y + minGap;
      }
      // se o empurrão vazou pra fora do plot, desloca a coluna toda pra cima
      const over = (col.at(-1)?.y ?? 0) - bottom;
      if (over > 0) col.forEach((p) => { p.y -= over; });
    });
    pending.forEach((p) => out.push(txt(p.x, p.y, p.text,
      { size: fs.val, fill: t.muted, anchor: p.anchor, weight: 600, stretch: 90 })));
  }

  // linha de base
  out.push(horiz
    ? `<line x1="${n2(left)}" y1="${n2(top)}" x2="${n2(left)}" y2="${n2(bottom)}" stroke="${t.axis}" stroke-width="1"/>`
    : `<line x1="${n2(left)}" y1="${n2(bottom)}" x2="${n2(right)}" y2="${n2(bottom)}" stroke="${t.axis}" stroke-width="1"/>`);
  return out;
}

// trilha atrás da barra: cobre o range INTEIRO do eixo (from→to), não só
// 0→valor — por isso arredonda os dois cantos (rx/ry do <rect> já dá conta,
// diferente da barra em si que arredonda só a ponta do dado). crossPos/crossSize
// = posição/espessura no eixo transversal (x/largura vertical, y/altura horiz.);
// track.scale recentraliza uma trilha mais grossa/fina que a própria barra.
function trackRect(crossPos, crossSize, from, to, horiz, r, track, seriesColor) {
  const sz = Math.max(0, crossSize * (track.scale ?? 1));
  const off = crossPos + (crossSize - sz) / 2;
  const rr = Math.min(r, sz / 2, Math.abs(to - from) / 2);
  const fill = track.color || seriesColor, op = track.opacity ?? 0.12;
  return horiz
    ? `<rect x="${n2(Math.min(from, to))}" y="${n2(off)}" width="${n2(Math.abs(to - from))}" height="${n2(sz)}" rx="${n2(rr)}" fill="${fill}" opacity="${op}"/>`
    : `<rect x="${n2(off)}" y="${n2(Math.min(from, to))}" width="${n2(sz)}" height="${n2(Math.abs(to - from))}" rx="${n2(rr)}" fill="${fill}" opacity="${op}"/>`;
}

function roundedEnd(x, y, w, h, r, horiz, grow, fill) {
  if (r <= 0 || w <= 0 || h <= 0) return `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" fill="${fill}"/>`;
  const rr = Math.min(r, w / 2, h / 2);
  // arredonda só as duas quinas da ponta do dado
  let d;
  if (!horiz) d = grow
    ? `M${n2(x)} ${n2(y + h)}V${n2(y + rr)}q0 ${-rr} ${rr} ${-rr}h${n2(w - 2 * rr)}q${rr} 0 ${rr} ${rr}V${n2(y + h)}Z`
    : `M${n2(x)} ${n2(y)}V${n2(y + h - rr)}q0 ${rr} ${rr} ${rr}h${n2(w - 2 * rr)}q${rr} 0 ${rr} ${-rr}V${n2(y)}Z`;
  else d = `M${n2(x)} ${n2(y)}h${n2(w - rr)}q${rr} 0 ${rr} ${rr}v${n2(h - 2 * rr)}q0 ${rr} ${-rr} ${rr}H${n2(x)}Z`;
  return `<path d="${d}" fill="${fill}"/>`;
}

/* ── bubble (bolhas com ícone) ────────────────────────────────────────────────
 *
 * Cada item vira um círculo com ÁREA proporcional ao valor e um ícone dentro —
 * é o formato de "tamanho de mercado", onde o que importa é a comparação de
 * grandeza entre coisas que não estão numa série temporal.
 *
 * Área, não raio: o olho lê ÁREA. Com raio proporcional, um valor 4× maior
 * viraria uma bolha 16× maior em área — o gráfico exageraria por um fator igual
 * ao próprio valor. Daí `r ∝ √valor`, que é a regra do formato.
 *
 * `group` quebra em blocos com título e um total calculado (TRADFI | CRYPTO);
 * `cat` dá a cor e monta a legenda. Bolhas alinhadas pelo TOPO: com o centro
 * alinhado, os rótulos (que vão embaixo) ficariam em degrau conforme o raio.
 */
function bubbles(s, t, box) {
  const { pad, top, plotBottom, W, H: H_, fs, meta } = box;
  const out = [];
  const itens = (s.bubbles || [])
    .map((b) => ({ label: String(b.label ?? ''), value: Math.abs(+b.value || 0),
      icon: b.icon || '', group: String(b.group ?? ''), cat: String(b.cat ?? '') }))
    .filter((b) => b.value > 0);
  if (!itens.length) return out;

  const cats = s.bubbleCats || {};
  const corDe = (b) => cats[b.cat] || t.series[Math.max(0, Object.keys(cats).indexOf(b.cat)) % t.series.length];
  const grupos = [...new Set(itens.map((b) => b.group))];
  const fmt = (v) => formatValue(v, s.y);

  // — legenda das categorias, canto superior direito (identidade nunca só por cor) —
  const usadas = [...new Set(itens.map((b) => b.cat))].filter(Boolean);
  let topo = top;
  if (usadas.length > 1) {
    let ly = top + fs.legend * 0.9;
    for (const c of usadas) {
      const cor = cats[c] || t.series[usadas.indexOf(c) % t.series.length];
      const tw = textW(c, fs.legend);
      out.push(`<circle cx="${n2(W - pad - tw - fs.legend * 1.1)}" cy="${n2(ly - fs.legend * 0.32)}" r="${n2(fs.legend * 0.42)}" fill="${cor}"/>`);
      out.push(txt(W - pad, ly, esc(c), { size: fs.legend, fill: t.muted, anchor: 'end', stretch: 90 }));
      ly += fs.legend * 1.7;
    }
    topo = Math.max(top, ly - fs.legend * 1.7 + fs.legend);
  }

  /* Escala: a maior bolha ocupa a altura que sobra depois de reservar o
   * cabeçalho do grupo e o rótulo de baixo. A largura entra na conta porque com
   * muitas bolhas o limite deixa de ser a altura — a soma dos diâmetros é que
   * estoura, e as bolhas passariam por cima uma da outra. */
  const ondeRot = ['above', 'right'].includes(s.bubbleLabel) ? s.bubbleLabel : 'below';
  const aoLado = ondeRot === 'right';
  const cabecalho = grupos.some((g) => g) ? fs.legend * 3.2 : 0;
  const rotuloH = aoLado ? 0 : fs.legend * 2.6;         // nome + valor fora da bolha
  const gapRot = fs.legend * 0.85;                      // respiro bolha → rótulo (IGUAL pra todas)
  const gapX = fs.legend * 1.1, gapGrupo = fs.legend * 2.4;
  const alturaUtil = Math.max(20, plotBottom - topo - cabecalho - rotuloH - (aoLado ? 0 : gapRot));
  const larguraUtil = W - 2 * pad - gapX * Math.max(0, itens.length - 1)
    - gapGrupo * Math.max(0, grupos.length - 1);
  const maxV = Math.max(...itens.map((b) => b.value));
  const raiz = itens.reduce((a, b) => a + Math.sqrt(b.value), 0);
  // dois tetos: pela altura (a maior bolha cabe) e pela largura (todas cabem lado a lado)
  // k é a escala em px por √valor — costuma ser MENOR que 1 (√7,9 trilhões já
  // é 2,8 milhões), então nada de piso aqui: um `Math.max(1, …)` transformava
  // os raios em milhões de pixels
  const kAltura = alturaUtil / 2 / Math.sqrt(maxV);
  const kLargura = larguraUtil / 2 / raiz;
  const k = Math.max(0, Math.min(kAltura, kLargura)) || 1;   // r = k·√valor
  /* Raio MÍNIMO: valor miúdo ao lado de gigante vira um ponto de 1px — existe
   * no dado e some no desenho. O piso entra depois da proporção, então só
   * levanta quem sumiria; e é cortado pelo raio da maior bolha, senão num
   * conjunto todo pequeno o piso viraria o tamanho de todas. */
  const rMin = Math.max(0, Math.min(s.bubbleMinR ?? 9, k * Math.sqrt(maxV)));
  const raio = (b) => Math.max(rMin, k * Math.sqrt(b.value));

  /* Cada bolha ocupa uma FAIXA, não o próprio diâmetro: o rótulo embaixo
   * costuma ser mais largo que a bolha (uma bolha de 6px com "Derivativos
   * US$ 200 bi" embaixo), e reservar só o diâmetro fazia os textos de bolhas
   * vizinhas se encavalarem. */
  const doGrupo = (g) => itens.filter((b) => b.group === g);
  const larguraTexto = (b) => Math.max(textW(b.label, fs.legend * 0.9), textW(fmt(b.value), fs.legend * 1.15));
  // com o rótulo À DIREITA o texto não disputa espaço horizontal com o vizinho
  // pelo centro: ele soma ao diâmetro, em vez de ser o maior dos dois
  const faixaK = (b, kk) => {
    const d = Math.max(Math.min(s.bubbleMinR ?? 9, kk * Math.sqrt(maxV)), kk * Math.sqrt(b.value)) * 2;
    return aoLado ? d + fs.legend * 0.6 + larguraTexto(b) : Math.max(d, larguraTexto(b));
  };
  const faixa = (b) => faixaK(b, k);
  // o grupo também não pode ser mais estreito que o próprio cabeçalho, senão o
  // texto do título vaza por cima do grupo seguinte (ou pra fora da imagem)
  const cabTexto = (g) => {
    const soma = doGrupo(g).reduce((a, b) => a + b.value, 0);
    return (s.bubbleGroups || {})[g] ?? `Total: ${fmt(soma)}`;
  };
  const largGrupoK = (g, kk) => Math.max(
    doGrupo(g).reduce((a, b) => a + faixaK(b, kk), 0) + gapX * Math.max(0, doGrupo(g).length - 1),
    g ? Math.max(textW(g, fs.legend * 1.5), textW(cabTexto(g), fs.legend * 0.82)) : 0);
  const largGrupo = (g) => largGrupoK(g, k);
  const largComK = (kk) => grupos.reduce((a, g) => a + largGrupoK(g, kk), 0) + gapGrupo * Math.max(0, grupos.length - 1);
  const largTotal = largComK(k);
  let x = pad + Math.max(0, (W - 2 * pad - largTotal) / 2);
  // topo das bolhas, comum a todas. Com o rótulo ACIMA, ele mora nesta folga —
  // sem reservar, o texto subiria por cima do cabeçalho do grupo.
  const yTopo = topo + cabecalho + (ondeRot === 'above' ? rotuloH + gapRot : 0);

  grupos.forEach((g, gi) => {
    const doG = doGrupo(g);
    const inicioG = x;
    if (g) {
      /* Subtítulo do grupo: por padrão a SOMA do que está desenhado, porque
       * esse é o número que o gráfico pode garantir. Qualquer outra métrica
       * (a referência trazia "Derivatives: 44%", que não sai da soma das
       * bolhas) entra como texto livre em `spec.bubbleGroups` — inventar uma
       * fórmula pra bater com um número que não conheço seria chutar. */
      out.push(txt(x, topo + fs.legend * 1.15, esc(g),
        { size: fs.legend * 1.5, fill: t.ink, weight: 600, ls: -0.01 }));
      out.push(txt(x, topo + fs.legend * 2.5, esc(cabTexto(g)),
        { size: fs.legend * 0.82, fill: t.faint, weight: 600, stretch: 90 }));
    }
    // linha separando o grupo anterior — só entre grupos, nunca na borda
    if (gi > 0) {
      const lx = x - gapGrupo / 2;
      out.push(`<line x1="${n2(lx)}" y1="${n2(topo)}" x2="${n2(lx)}" y2="${n2(plotBottom)}" stroke="${t.grid}" stroke-width="1"/>`);
    }

    doG.forEach((b) => {
      const r = raio(b), fx = faixa(b);
      // com rótulo ao lado, a bolha encosta à esquerda da faixa e o texto ocupa
      // o resto; nos outros modos ela fica no meio, com o texto centrado nela
      const cx = aoLado ? x + r : x + fx / 2;
      const cy = yTopo + r;
      out.push(`<circle cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(r)}" fill="${corDe(b)}"/>`);

      /* Ícone dentro, no MESMO set do criador de timelines (36 da casa + 421
       * Ionicons) e com a mesma sigla `txt:` como alternativa.
       *
       * `max` trava o crescimento: sem teto, na bolha gigante o ícone vira um
       * desenho enorme que rouba a leitura do tamanho — que é o dado. `min` é o
       * piso de legibilidade: abaixo dele o traço vira borrão, e é melhor
       * bolha limpa que ícone ilegível. */
      const ic = { ...DEFAULTS.bubbleIcon, ...(s.bubbleIcon || {}) };
      const tinta = ehClaro(corDe(b)) ? '#0E0C1B' : '#FFFFFF';
      const lado = Math.min(r * 1.15, ic.max);
      if (b.icon && lado >= ic.min) {
        if (isTextIcon(b.icon)) {
          // sigla dimensionada pelo MESMO `lado` do ícone: assim ela tem o peso
          // visual dos ícones vizinhos em vez de virar um texto solto
          const fsSigla = lado * 0.46;
          out.push(txt(cx, cy + fsSigla * 0.36, esc(textIconLabel(b.icon)),
            { size: fsSigla, fill: tinta, anchor: 'middle', weight: 600, stretch: 90 }));
        } else {
          out.push(iconSvg(b.icon, { x: cx - lado / 2, y: cy - lado / 2, w: lado, h: lado }, tinta,
            Math.max(1.2, 24 / lado * 1.6)));
        }
      }

      /* Rótulo à distância CONSTANTE da borda da bolha — não numa base comum.
       * Com base comum, a bolha pequena ficava com o texto longe dela e a
       * ligação entre os dois se perdia; a distância fixa mantém o par colado,
       * em qualquer tamanho. */
      if (aoLado) {
        const tx = cx + r + fs.legend * 0.6;
        out.push(txt(tx, cy - fs.legend * 0.1, esc(b.label), { size: fs.legend * 0.9, fill: t.muted, stretch: 90 }));
        out.push(txt(tx, cy + fs.legend * 1.15, esc(fmt(b.value)),
          { size: fs.legend * 1.15, fill: t.ink, weight: 600 }));
      } else if (ondeRot === 'above') {
        const baseY = cy - r - gapRot;
        out.push(txt(cx, baseY - fs.legend * 1.25, esc(b.label), { size: fs.legend * 0.9, fill: t.muted, anchor: 'middle', stretch: 90 }));
        out.push(txt(cx, baseY, esc(fmt(b.value)), { size: fs.legend * 1.15, fill: t.ink, anchor: 'middle', weight: 600 }));
      } else {
        const baseY = cy + r + gapRot + fs.legend * 0.75;
        out.push(txt(cx, baseY, esc(b.label), { size: fs.legend * 0.9, fill: t.muted, anchor: 'middle', stretch: 90 }));
        out.push(txt(cx, baseY + fs.legend * 1.25, esc(fmt(b.value)),
          { size: fs.legend * 1.15, fill: t.ink, anchor: 'middle', weight: 600 }));
      }
      x += fx + gapX;
    });
    // avança pela largura do GRUPO (que pode ser maior que a soma das faixas,
    // quando o cabeçalho é mais largo) — senão o título do grupo seguinte
    // começa cedo demais e escreve por cima do anterior
    x = inicioG + largGrupo(g) + gapGrupo;
  });

  if (meta) {
    meta.bubbles = itens.map((b) => ({ label: b.label, value: b.value, r: raio(b) }));
    /* Largura mínima pra tudo caber lado a lado. Calculada com a escala da
     * ALTURA (`kAltura`), não com a escala em uso: as duas se perseguem —
     * alargar a imagem aumenta as bolhas, que pedem mais largura ainda, e o
     * número nunca convergia (medido: com o valor de uma passada, uma bolha
     * saía em cx=1438 numa imagem de 1396). Pela altura o alvo é fixo, e é o
     * teto: com essa largura, quem limita passa a ser a altura e tudo cabe. */
    meta.minWidth = Math.ceil(largComK(kAltura) + 2 * pad);
  }
  return out;
}

// luminância aproximada, pra decidir tinta clara ou escura sobre o preenchimento
function ehClaro(hex) {
  const m = /^#?([\da-f]{6})$/i.exec(String(hex || ''));
  if (!m) return false;
  const v = parseInt(m[1], 16);
  return (0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) > 150;
}

/* ── sankey (diagrama de fluxo) ───────────────────────────────────────────────
 *
 * Dado = LIGAÇÕES, não séries: [{from, to, value}]. A espessura do fluxo é o
 * valor, e é isso que faz o gráfico responder "de onde veio e pra onde foi"
 * numa olhada — receita por fonte → agregações → total → lucro/custo.
 *
 * Três decisões que o layout exige:
 *
 * 1. COLUNA de cada nó = maior caminho desde uma origem (não o menor). Com o
 *    menor, um atalho "fonte → total" puxaria o Total pra 2ª coluna e todas as
 *    etapas intermediárias ficariam espremidas depois dele.
 * 2. ALTURA do nó = max(entrada, saída). Num nó que só repassa, os dois lados
 *    são iguais; num que junta ou vaza, o maior lado é que manda — senão os
 *    fluxos não caberiam na própria caixa.
 * 3. ORDEM dentro da coluna: baricentro dos vizinhos, algumas passadas. É o
 *    que desembaraça os cruzamentos; sem isso o desenho vira um novelo mesmo
 *    com os valores certos.
 */
function sankey(s, t, box) {
  const { pad, top, plotBottom, W, H: H_, fs, meta } = box;
  const out = [];
  const links = (s.links || [])
    .map((l) => ({ from: String(l.from ?? ''), to: String(l.to ?? ''), value: Math.abs(+l.value || 0) }))
    .filter((l) => l.from && l.to && l.value > 0 && l.from !== l.to);
  if (!links.length) return out;

  // — nós na ordem em que aparecem —
  const nome = [];
  for (const l of links) for (const k of [l.from, l.to]) if (!nome.includes(k)) nome.push(k);
  const N = nome.map((n) => ({ n, entra: [], sai: [] }));
  const idx = new Map(nome.map((n, i) => [n, i]));
  links.forEach((l, i) => {
    l.a = idx.get(l.from); l.b = idx.get(l.to); l.i = i;
    N[l.a].sai.push(l); N[l.b].entra.push(l);
  });

  // — coluna: maior caminho desde uma origem. O `visto` corta ciclo (fluxo que
  //   volta pra trás não tem coluna definida e travaria o laço) —
  const col = N.map(() => 0);
  const prof = (i, visto) => {
    if (visto.has(i)) return 0;
    visto.add(i);
    let m = 0;
    for (const l of N[i].entra) m = Math.max(m, prof(l.a, visto) + 1);
    visto.delete(i);
    return m;
  };
  N.forEach((_, i) => { col[i] = prof(i, new Set()); });
  // quem não alimenta ninguém vai pra última coluna: são os destinos finais, e
  // alinhá-los à direita é o que fecha o desenho
  const nCols = Math.max(...col) + 1;
  N.forEach((nd, i) => { if (!nd.sai.length) col[i] = nCols - 1; });

  const valor = N.map((nd) => Math.max(
    nd.entra.reduce((a, l) => a + l.value, 0),
    nd.sai.reduce((a, l) => a + l.value, 0)));

  // — geometria —
  const colunas = Array.from({ length: nCols }, (_, c) => N.map((_, i) => i).filter((i) => col[i] === c));
  const nodeW = Math.max(6, 10 * s.fontScale);
  /* Respiro entre nós: uma linha de texto, não um valor fixo miúdo. Num fluxo
   * real a coluna 1 tem um nó gigante e uma penca de miúdos; com respiro
   * pequeno demais os miúdos viram uma pilha espremida no rodapé, cada rótulo
   * colado no do vizinho.
   *
   * Mas o respiro também não pode ser a altura CHEIA do rótulo (nome+valor):
   * a escala é o que SOBRA depois dos gaps, então com 10 nós numa coluna os
   * gaps comiam 90% da altura e as fitas viravam fios de cabelo — o gráfico
   * deixava de mostrar a proporção, que é a única coisa que ele existe pra
   * mostrar. Uma linha basta: o anti-colisão dos rótulos espalha o resto. */
  const gapV = fs.legend * 1.2;
  const alturaDisp = plotBottom - top;

  /* ESPESSURA DO NÓ — duas coisas que o fluxo real exige e que a proporção
   * pura não entrega:
   *
   * 1. `y.scale: 'log'`. Com US$ 699M ao lado de US$ 2,26M, a barra pequena
   *    fica com 0,8px: existe no dado e some no desenho. Em log a razão de
   *    357× vira ~8×, e as duas aparecem. Comprimir é MENTIR sobre a
   *    proporção — por isso não é o padrão e o eixo diz qual escala está
   *    valendo; é a troca consciente entre "proporção fiel" e "dá pra ver".
   *    Fórmula log10(1 + v/min): passa pela origem (valor 0 → espessura 0) e
   *    não explode com valor menor que 1, o que log puro faria.
   *
   * 2. `sankeyScale`. A espessura é uma FRAÇÃO da altura, então esticar a
   *    imagem pra caber o texto engordava as barras junto e não sobrava nada:
   *    o texto continuava apertado. Com o fator, altura da imagem e espessura
   *    da barra viram controles separados — cresce a imagem, encolhe a barra,
   *    e o que sobra vira respiro pro rótulo.                                 */
  const positivos = valor.filter((v) => v > 0);
  const minV = positivos.length ? Math.min(...positivos) : 1;
  const logY = s.y?.scale === 'log';
  const peso = (v) => (logY ? Math.log10(1 + Math.max(0, v) / minV) : Math.max(0, v));
  const fator = Math.min(1, Math.max(0.15, s.sankeyScale ?? 1));

  /* PISO de espessura. Numa distribuição real o fluxo miúdo sai com fração de
   * pixel e some no antialiasing — some do DESENHO, não do dado, que é o pior
   * tipo de sumiço: o gráfico passa a mostrar menos do que sabe. E o controle
   * de espessura piorava isso (metade de 1,5px é 0,75px). Piso em px, aplicado
   * DEPOIS da proporção: só os que sumiriam são levantados.
   *
   * O nó também respeita o piso das fitas dele — um nó com 5 saídas miúdas
   * precisa de 5 pisos de altura, senão as fitas vazam pra fora da caixa. */
  const minLink = Math.max(0, s.sankeyMinLink ?? 2);
  const pisoNo = (i) => Math.max(minLink, N[i].sai.length * minLink, N[i].entra.length * minLink);

  /* A escala sai por iteração, não por fórmula: quem já está no piso não
   * responde mais à escala, então o espaço que sobra pros outros muda a cada
   * ajuste. 6 passadas convergem de sobra e mantêm a conta fechada. */
  let escala = Math.min(...colunas.map((c) => {
    const soma = c.reduce((a, i) => a + peso(valor[i]), 0);
    const sobra = alturaDisp - gapV * Math.max(0, c.length - 1);
    return soma > 0 ? Math.max(0, sobra) / soma : Infinity;
  })) * fator;
  /* Teto na altura do nó: nó maior que a área não tem posição válida — ficaria
   * pra fora por definição, e "nada fora da imagem" vale acima do piso. Só
   * morde quando o piso × nº de fitas passa da área (piso muito alto num nó
   * muito ramificado); nesse caso o piso cede, porque é ele que é opcional. */
  const alt = (i) => Math.min(alturaDisp, Math.max(1.5, pisoNo(i), peso(valor[i]) * escala));
  // piso da FITA cede junto: forçar minLink num nó que já bateu no teto faria
  // as fitas somarem mais que a caixa e vazarem por baixo dela
  const pisoFita = (i) => Math.min(minLink, alt(i) / Math.max(1, N[i].sai.length, N[i].entra.length));
  for (let passo = 0; passo < 6; passo++) {
    const excesso = Math.max(...colunas.map((c) => {
      const usado = c.reduce((a, i) => a + alt(i), 0) + gapV * Math.max(0, c.length - 1);
      return usado - alturaDisp;
    }));
    if (excesso <= 0.5) break;
    // encolhe só a parte que ainda responde à escala (a que está no piso é fixa)
    const col_ = colunas.reduce((pior, c) => {
      const usado = c.reduce((a, i) => a + alt(i), 0) + gapV * Math.max(0, c.length - 1);
      return usado > pior.usado ? { c, usado } : pior;
    }, { c: [], usado: -Infinity }).c;
    const flexivel = col_.filter((i) => peso(valor[i]) * escala > pisoNo(i))
      .reduce((a, i) => a + peso(valor[i]), 0);
    if (flexivel <= 0) break;                         // tudo no piso: não há o que encolher
    escala = Math.max(0, escala - excesso / flexivel);
  }

  // ordem inicial: como veio no dado; depois baricentro pra desembaraçar
  const ordem = colunas.map((c) => [...c]);
  const yDe = new Array(N.length).fill(0);
  /* NENHUM retângulo pode sair da imagem — nem por arraste, nem por piso, nem
   * por coluna cheia. O corte é aqui, no renderer, e não só no editor: a spec
   * pode chegar de qualquer lugar (JSON colado, arquivo salvo, IA) e o desenho
   * tem que se defender sozinho. */
  const dentro = (y, i) => Math.max(top, Math.min(y, plotBottom - alt(i)));
  const empilha = () => ordem.forEach((c) => {
    const somaNos = c.reduce((a, i) => a + alt(i), 0);
    // com muitos nós (ou piso alto) a coluna não cabe com o respiro cheio —
    // aperta o respiro antes de deixar vazar, que é o mal menor
    const g = somaNos + gapV * Math.max(0, c.length - 1) > alturaDisp && c.length > 1
      ? Math.max(0, (alturaDisp - somaNos) / (c.length - 1))
      : gapV;
    let y = top + Math.max(0, (alturaDisp - (somaNos + g * Math.max(0, c.length - 1))) / 2);
    c.forEach((i) => { yDe[i] = dentro(y, i); y += alt(i) + g; });
  });
  empilha();
  const efetivo = new Array(N.length).fill(0);
  const aplicaOffsets = () => {
    // ajuste manual do editor: soma DEPOIS do layout automático, por nome, pra
    // sobreviver a mudança de dado (o índice muda quando uma ligação entra ou sai)
    const off = s.nodeOffsets || {};
    N.forEach((nd, i) => {
      const base = yDe[i];
      // o arraste também é cortado: puxar o nó pra fora da imagem o esconderia
      yDe[i] = dentro(base + (off[nd.n] || 0), i);
      // guarda o quanto DE FATO andou: o editor regrava isso no lugar do valor
      // pedido, senão um arraste longo demais deixaria um offset gigante
      // guardado e voltar o nó exigiria desfazer todo o excesso primeiro
      efetivo[i] = yDe[i] - base;
    });
  };
  for (let passo = 0; passo < 6; passo++) {
    const dir = passo % 2 === 0;                     // alterna: puxa da esquerda, depois da direita
    ordem.forEach((c) => {
      const centro = (i) => {
        const viz = dir ? N[i].entra.map((l) => l.a) : N[i].sai.map((l) => l.b);
        if (!viz.length) return yDe[i] + alt(i) / 2;
        return viz.reduce((a, j) => a + yDe[j] + alt(j) / 2, 0) / viz.length;
      };
      c.sort((i, j) => centro(i) - centro(j));
    });
    empilha();
  }
  aplicaOffsets();   // só no fim: o baricentro trabalha sobre o layout limpo

  // — cor: paleta por nó, com override manual (spec.nodeColors) —
  const cores = s.nodeColors || {};
  const corDe = (i) => cores[nome[i]] || t.series[i % t.series.length];

  /* Fluxos primeiro, nós por cima. Cada ligação sai empilhada na borda direita
   * da origem e chega empilhada na esquerda do destino — a ordem do
   * empilhamento segue a posição vertical do OUTRO lado, senão os fluxos se
   * cruzam dentro do próprio nó. */
  const offSai = new Array(N.length).fill(0), offEntra = new Array(N.length).fill(0);
  /* Faixa reservada à direita pros rótulos da ÚLTIMA coluna. Antes eles eram
   * escritos à esquerda do nó (não havia espaço à direita) e caíam POR CIMA do
   * nó anterior — medido: 3 rótulos sobre nós. Encolhendo o grafo, todo rótulo
   * escreve à direita, sempre fora do desenho. */
  const fsNome = fs.legend;
  const rotFim = N.map((nd, i) => (nd.sai.length ? 0 : textW(nd.n, fsNome) + fsNome * 0.6));
  const reserva = Math.min(Math.max(0, ...rotFim), (W - 2 * pad) * 0.28);
  const plotW = W - 2 * pad - reserva;
  const xDe = (c) => pad + (nCols === 1 ? 0 : (plotW - nodeW) * c / (nCols - 1));
  const meio = (i) => yDe[i] + alt(i) / 2;
  [...links]
    .sort((p, q) => (meio(p.b) - meio(q.b)) || (meio(p.a) - meio(q.a)))
    .forEach((l) => {
      /* Espessura de cada PONTA em relação ao nó daquela ponta, não um valor
       * único pra fita. Em escala linear dá exatamente no mesmo (a fração do
       * valor vezes a altura proporcional é o próprio valor × escala), mas em
       * log é o que mantém tudo encaixado: o nó comprime, e as fitas dentro
       * dele comprimem junto, sempre preenchendo a caixa sem sobrar nem faltar.
       * A fita então afina ou engorda no caminho — é a cara honesta de uma
       * escala que não conserva soma. */
      // o piso vale pras fitas também — e cabe, porque `pisoNo` já reservou
      // espaço no nó pra cada fita que entra ou sai dele
      const h0 = Math.max(pisoFita(l.a), (l.value / (valor[l.a] || 1)) * alt(l.a));
      const h1 = Math.max(pisoFita(l.b), (l.value / (valor[l.b] || 1)) * alt(l.b));
      const x0 = xDe(col[l.a]) + nodeW, x1 = xDe(col[l.b]);
      const y0 = yDe[l.a] + offSai[l.a], y1 = yDe[l.b] + offEntra[l.b];
      offSai[l.a] += h0; offEntra[l.b] += h1;
      const cm = (x0 + x1) / 2;   // curva em S: horizontal nas pontas, como manda o padrão
      out.push(`<path d="M${n2(x0)} ${n2(y0)}C${n2(cm)} ${n2(y0)},${n2(cm)} ${n2(y1)},${n2(x1)} ${n2(y1)}`
        + `L${n2(x1)} ${n2(y1 + h1)}C${n2(cm)} ${n2(y1 + h1)},${n2(cm)} ${n2(y0 + h0)},${n2(x0)} ${n2(y0 + h0)}Z"`
        + ` fill="${corDe(l.a)}" opacity="0.26"/>`);
    });

  if (meta) meta.sankeyNodes = [];
  N.forEach((nd, i) => {
    const x = xDe(col[i]), y = yDe[i], h = alt(i);
    out.push(`<rect x="${n2(x)}" y="${n2(y)}" width="${n2(nodeW)}" height="${n2(h)}" rx="2" fill="${corDe(i)}"/>`);
    // geometria pro editor arrastar o nó (o rótulo acompanha)
    if (meta) meta.sankeyNodes.push({ n: nd.n, x, y, w: nodeW, h, offset: efetivo[i] });
  });

  /* Rótulos. Três coisas que o desenho exige e que a primeira versão errava:
   *
   * 1. Ancorado no TOPO do nó, não no centro. Num nó alto o texto fica sobre o
   *    começo do próprio fluxo (é o que a referência faz) e some da frente dos
   *    vizinhos; centrado, ele flutuava no meio do fluxo e brigava com tudo.
   * 2. QUEBRA em duas linhas quando não cabe até a coluna seguinte — sem isso
   *    "Receita Padrão da Corretora" atravessava o gráfico inteiro por cima
   *    dos outros nós.
   * 3. Anti-colisão por coluna: nós finos e vizinhos (as taxas pequenas aqui)
   *    apontam quase pra mesma altura e os textos empilham um no outro.       */
  const larguraCol = nCols > 1 ? (plotW - nodeW) / (nCols - 1) : plotW;
  const cabe = Math.max(fs.legend * 4, larguraCol - nodeW - fs.legend * 1.6);
  const quebra = (texto) => {
    if (textW(texto, fs.legend) <= cabe) return [texto];
    const p = texto.split(' ');
    if (p.length < 2) return [texto];
    // corta no espaço que deixa as duas metades mais parecidas
    let melhor = 1, dif = Infinity;
    for (let k = 1; k < p.length; k++) {
      const d = Math.abs(textW(p.slice(0, k).join(' '), fs.legend) - textW(p.slice(k).join(' '), fs.legend));
      if (d < dif) { dif = d; melhor = k; }
    }
    return [p.slice(0, melhor).join(' '), p.slice(melhor).join(' ')];
  };

  const off = s.nodeOffsets || {};
  const rot = N.map((nd, i) => {
    const linhas = quebra(nd.n);
    return { i, linhas, c: col[i],
      // nó movido à mão: o rótulo é ÂNCORA, não cede. Sem isso o anti-colisão
      // puxava o rótulo de volta pro lugar "certo" e ele descolava do nó que o
      // usuário acabou de arrastar — o movimento parecia não ter pegado.
      fixo: !!off[nd.n],
      // duas linhas de nome + a do valor
      h: fs.legend * (0.95 * linhas.length + 1.05),
      y: yDe[i] + Math.min(fs.legend * 0.95, alt(i) / 2 + fs.legend * 0.35) };
  });
  /* Duas passadas, não um deslocamento em bloco. Empurrar a coluna inteira pra
   * cima quando o último rótulo estoura embaixo jogava o PRIMEIRO pra fora da
   * imagem (medido: y = -163) — o nó grande fica no topo e os finos se
   * amontoam no fim, então o empurrão acumulado é enorme. Descendo e depois
   * subindo só quem passou do limite, cada um cede o mínimo. */
  const respiro = fs.legend * 0.25;
  for (let c = 0; c < nCols; c++) {
    const col_ = rot.filter((r) => r.c === c).sort((a, b) => a.y - b.y);
    if (!col_.length) continue;
    // `fixo` (nó arrastado à mão) não cede em nenhuma passada — quem desvia são
    // os automáticos, dos dois lados dele
    for (let k = 1; k < col_.length; k++) {                     // desce quem sobrepõe
      if (col_[k].fixo) continue;
      col_[k].y = Math.max(col_[k].y, col_[k - 1].y + col_[k - 1].h + respiro);
    }
    let limite = plotBottom;                                    // sobe quem passou do fim
    for (let k = col_.length - 1; k >= 0; k--) {
      if (!col_[k].fixo && col_[k].y + col_[k].h > limite) col_[k].y = limite - col_[k].h;
      limite = Math.min(limite, col_[k].y - respiro);
    }
    let piso = top + fs.legend * 0.9;                            // e ninguém acima do topo
    for (const r of col_) {
      if (!r.fixo) r.y = Math.max(r.y, piso);
      piso = Math.max(piso, r.y + r.h + respiro);
    }
  }

  /* Altura mínima pra caber TODOS os rótulos. A coluna mais cheia é quem manda:
   * quando não cabe, o anti-colisão empilha o que pode e o resto encavala — o
   * gráfico fica errado por falta de espaço, não por bug. Em vez de espremer, o
   * renderer devolve o número e quem chama decide (o editor cresce a imagem). */
  if (meta) {
    const porCol = Array.from({ length: nCols }, (_, c) => rot.filter((r) => r.c === c)
      .reduce((a, r) => a + r.h + respiro, 0));
    // os PISOS também pedem altura: um nó com muitas fitas precisa de um piso
    // por fita. Sem contar isso aqui, o piso batia no teto do nó e cedia
    // silenciosamente — a imagem cresce e o piso é respeitado de verdade.
    const porPiso = colunas.map((c) => c.reduce((a, i) => a + pisoNo(i), 0) + gapV * Math.max(0, c.length - 1));
    meta.minHeight = Math.ceil(Math.max(...porCol, ...porPiso) + (H_ - (plotBottom - top)) + fs.legend);
  }
  // sempre à direita do nó: a faixa reservada acima garante espaço até na
  // última coluna, então nenhum rótulo precisa invadir o desenho pra caber
  rot.forEach((r) => {
    const tx = xDe(r.c) + nodeW + fs.legend * 0.5;
    r.linhas.forEach((linha, k) => out.push(txt(tx, r.y + k * fs.legend * 0.95, esc(linha),
      { size: fs.legend, fill: t.ink, weight: 600, anchor: 'start', stretch: 90 })));
    out.push(txt(tx, r.y + r.linhas.length * fs.legend * 0.95, esc(formatValue(valor[r.i], s.y)),
      { size: fs.legend * 0.85, fill: t.faint, anchor: 'start', stretch: 90 }));
  });
  return out;
}

// ── donut ────────────────────────────────────────────────────────────────────
function donut(series, labels, s, t, box) {
  const { pad, top, plotBottom, W, fs } = box;
  const out = [];
  const cores = s.sliceColors || {};
  let data = series.length > 1 && series[0].data.length === 1
    ? series.map((se, i) => ({ name: se.name, v: se.data[0] ?? 0, color: cores[se.name] || se.color || t.series[i % t.series.length] }))
    : labels.map((l, i) => ({ name: l, v: series[0]?.data[i] ?? 0, color: cores[l] || t.series[i % t.series.length] }));

  /* Junta as fatias miúdas numa só. Numa distribuição real a cauda longa vira
   * um punhado de fatias de 0,3% — invisíveis no desenho, mas cada uma
   * gastando um card e uma cor da paleta, e empurrando as que importam pra
   * fora do olho. Agrupar é o que a paleta da casa já pressupõe ("a 7ª série
   * vira Outros, não uma cor nova"). Só agrupa 2+: virar "Outros" com uma
   * fatia só troca um nome informativo por um genérico.                       */
  const g = s.groupSmall || {};
  const bruto = data.reduce((a, d) => a + Math.abs(d.v), 0) || 1;
  if (g.on && g.pct > 0) {
    const miudas = data.filter((d) => (Math.abs(d.v) / bruto) * 100 < g.pct);
    if (miudas.length > 1) {
      const soma = miudas.reduce((a, d) => a + d.v, 0);
      data = data.filter((d) => !miudas.includes(d));
      data.push({ name: g.label || 'Outros', v: soma, color: cores[g.label || 'Outros'] || t.faint, _juntou: miudas.length });
    }
  }
  const total = data.reduce((a, d) => a + Math.abs(d.v), 0) || 1;

  /* Cards em volta da rosca, cada um na ALTURA da sua fatia, em vez da lista
   * lateral: com a lista, achar de quem é a fatia exige ir e voltar entre
   * gráfico e legenda comparando cor. Aqui o card fica do lado pra onde a
   * fatia aponta, então a leitura é local. O gráfico vai pro centro da imagem,
   * com uma coluna de cards de cada lado. */
  const fsVal = fs.legend * 1.15, fsName = fs.legend * 0.9;
  const sw = fs.legend * 0.72;                    // lado do quadradinho de cor
  const gapSw = fs.legend * 0.5;                  // quadradinho → texto
  const linhaH = fsName * 1.2;                    // valor → nome
  /* % da fatia com casas FIXAS, decididas pelo conjunto. Numa distribuição,
   * arredondar 38,9→39 e 23,8→24 faz a soma fechar em 100,3% e apaga a
   * diferença entre fatias vizinhas. E as casas têm que ser as MESMAS em todas:
   * "31%" ao lado de "38,9%" parece defeito, não precisão.
   *
   * Formatado aqui, e não pelo formatValue: lá as casas são um teto ("até N"),
   * então 31 sairia "31" e 38,9 sairia "38,9" no mesmo eixo. Piso fixo é o que
   * essa leitura precisa — e não dá pra impor isso lá, porque no eixo log
   * "1,000" (1 com 3 casas) se confunde com mil. */
  const temFracao = data.some((d) => {
    const p = (Math.abs(d.v) / total) * 100;
    return Math.abs(p - Math.round(p)) >= 0.05;
  });
  const pct = (p) => (temFracao ? p.toFixed(1).replace('.', ',') : String(Math.round(p))) + '%';
  const cards = data.map((d) => {
    const share = pct((Math.abs(d.v) / total) * 100);
    const val = s.y.format === 'pct' ? pct(d.v) : formatValue(d.v, s.y);
    // dado já em % não precisa da fatia recalculada ("42% · 42%" não informa nada)
    const destaque = s.y.format === 'pct' ? val : share;
    const abaixo = s.y.format === 'pct' ? d.name : `${d.name} · ${val}`;
    return { ...d, destaque, abaixo,
      w: sw + gapSw + Math.max(textW(destaque, fsVal), textW(abaixo, fsName)) };
  });
  const cardW = Math.max(...cards.map((c) => c.w));
  const cardH = fsVal + linhaH;
  const gapChart = 26 * s.fontScale;              // respiro entre fatia e card

  // o gráfico é o que sobra depois de reservar as duas colunas de card
  const alturaDisp = plotBottom - top;
  const size = Math.max(60, Math.min(alturaDisp, W - 2 * pad - 2 * (cardW + gapChart)));
  const cx = W / 2, cy = top + alturaDisp / 2;
  // pie = rosca cheia (raio interno 0)
  const rOut = size / 2, rIn = s.type === 'pie' ? 0 : rOut * (1 - s.donutThickness);
  const GAPa = 2 / rOut; // respiro de ~2px em radianos

  let a = -Math.PI / 2;
  const marcas = [];
  data.forEach((d, i) => {
    const sweep = (Math.abs(d.v) / total) * Math.PI * 2;
    if (sweep > GAPa * 1.5) out.push(`<path d="${arc(cx, cy, rOut, rIn, a + GAPa / 2, a + sweep - GAPa / 2)}" fill="${d.color}"/>`);
    const mid = a + sweep / 2;
    // pizza: % escrito NA fatia (fatia pequena não cabe texto — fica só no card)
    if (s.type === 'pie' && sweep / (Math.PI * 2) >= 0.05) {
      const rr = rOut * 0.62;
      out.push(txt(cx + Math.cos(mid) * rr, cy + Math.sin(mid) * rr + fs.legend * 0.35,
        esc(pct((Math.abs(d.v) / total) * 100)),
        { size: fs.legend, fill: '#fff', anchor: 'middle', weight: 600 }));
    }
    // lado = pra onde a fatia aponta; altura = onde ela está
    marcas.push({ ...cards[i], mid, dir: Math.cos(mid) >= 0 ? 1 : -1, y: cy + Math.sin(mid) * rOut * 0.98 });
    a += sweep;
  });

  /* Equilibra as duas colunas. Fatia cujo meio cai perto da vertical (topo ou
   * base do círculo) tem |cos| ~ 0 e escolhe lado por uma fração de grau —
   * numa distribuição real isso jogava 4 cards de um lado e 1 do outro, com o
   * gráfico visualmente torto. Quem muda de lado é sempre a mais vertical, que
   * é a que menos "aponta" pra algum lado. */
  for (let volta = 0; volta < marcas.length; volta++) {
    const dir = marcas.filter((m) => m.dir === 1), esq = marcas.filter((m) => m.dir === -1);
    if (Math.abs(dir.length - esq.length) <= 1) break;
    const cheio = dir.length > esq.length ? 1 : -1;
    const troca = marcas.filter((m) => m.dir === cheio)
      .sort((x, y2) => Math.abs(Math.cos(x.mid)) - Math.abs(Math.cos(y2.mid)))[0];
    if (!troca) break;
    troca.dir = -cheio;
  }

  /* Empurra os cards que se sobrepõem, coluna por coluna, e recentra a coluna
   * se o empurrão vazar da área — mesma ideia do anti-colisão dos rótulos de
   * linha. Sem isso, duas fatias finas vizinhas escrevem uma por cima da outra. */
  [1, -1].forEach((dir) => {
    const col = marcas.filter((m) => m.dir === dir).sort((x, y2) => x.y - y2.y);
    if (!col.length) return;
    const minGap = cardH + fs.legend * 0.55;
    for (let i = 1; i < col.length; i++) {
      if (col[i].y - col[i - 1].y < minGap) col[i].y = col[i - 1].y + minGap;
    }
    const sobra = (col.at(-1).y + cardH) - plotBottom;
    if (sobra > 0) col.forEach((m) => { m.y -= sobra; });
    const falta = top + fsVal - col[0].y;
    if (falta > 0) col.forEach((m) => { m.y += falta; });
  });

  // identidade nunca só por cor: o nome vai escrito no card, sempre
  marcas.forEach((m) => {
    const xBorda = cx + m.dir * (size / 2 + gapChart);   // lado do card virado pro gráfico
    const xSw = m.dir > 0 ? xBorda : xBorda - sw;
    const xTxt = m.dir > 0 ? xBorda + sw + gapSw : xBorda - sw - gapSw;
    const anchor = m.dir > 0 ? 'start' : 'end';
    out.push(`<rect x="${n2(xSw)}" y="${n2(m.y - fsVal * 0.72)}" width="${n2(sw)}" height="${n2(sw)}" rx="2" fill="${m.color}"/>`);
    // valor na COR DA FATIA (é o que amarra card e seção à distância)
    out.push(txt(xTxt, m.y, esc(m.destaque), { size: fsVal, fill: m.color, anchor, weight: 600, stretch: 90 }));
    out.push(txt(xTxt, m.y + linhaH, esc(m.abaixo), { size: fsName, fill: t.muted, anchor, stretch: 90 }));
  });
  return out;
}
