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
  type: 'line',          // line | area | bar | hbar | stacked | stacked100 | donut | pie | candle
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
  series: [],            // [{ name, data:[…], color?, dashed?, area? }]
  // side: lado do eixo de valor (left|right) — o y2, se houver, vai pro oposto
  y: { format: 'num', prefix: '', suffix: '', title: '', min: null, max: null, ticks: 5, zero: true, side: 'left' },
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
  const { format = 'num', prefix = '', suffix = '' } = y;
  // maximumFractionDigits (não minimum): 80 sai "80", 68.5 sai "68,5"
  const br = (x, d) => x.toLocaleString('pt-BR', { maximumFractionDigits: d });
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

  const series = (s.series || []).map((se, i) => ({
    ...se,
    name: se.name ?? SERIES_NAMES[i] ?? `Série ${i + 1}`,
    color: se.color || t.series[i % t.series.length],
    data: (se.data || []).map((v) => (v === null || v === '' ? null : Number(v))),
  }));
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
  if (s.type === 'donut' || s.type === 'pie') {
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

  let vMin = s.y.min ?? Math.min(...vals);
  let vMax = s.y.max ?? Math.max(...vals);
  if (s.y.zero && s.y.min == null && vMin > 0 && !isCandle) vMin = 0;   // candle não força o zero
  if (s.y.zero && s.y.max == null && vMax < 0) vMax = 0;
  const ticks = (s.y.min != null && s.y.max != null)
    ? niceTicks(vMin, vMax, s.y.ticks).filter((v) => v >= vMin - 1e-9 && v <= vMax + 1e-9)
    : niceTicks(vMin, vMax, s.y.ticks);
  const dMin = s.y.min ?? Math.min(...ticks), dMax = s.y.max ?? Math.max(...ticks);

  const yFmt = s.type === 'stacked100' ? { format: 'pct' } : s.y;
  // texto do tick: override manual (spec.y.tickText[valor]) ou o formatado
  const tickText = s.y.tickText || {};
  const tickLabels = ticks.map((v) => tickText[yKey(v)] ?? formatValue(v, yFmt));

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

  const V = (v) => horiz ? left + ((v - dMin) / (dMax - dMin)) * plotW
                         : bottom - ((v - dMin) / (dMax - dMin)) * plotH;
  const V2 = (v) => bottom - ((v - d2Min) / (d2Max - d2Min)) * plotH;
  const Vfor = (se) => (onY2(se) ? V2 : V);
  const fmtFor = (se) => (onY2(se) ? y2cfg : yFmt);

  // geometria pra edição interativa: caixa do plot + como converter pixel↔valor.
  // stacked100 mede em 0–100 (%); os outros no domínio real do eixo.
  if (meta) {
    meta.plot = { left, right, top, bottom, plotW, plotH, horiz };
    meta.scale = { dMin, dMax };
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
  const R = 4;

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
      const k0 = series.indexOf(se), Vx = Vfor(se);
      const zero = onY2(se) ? Math.max(d2Min, Math.min(0, d2Max)) : Math.max(dMin, Math.min(0, dMax));
      labels.forEach((_, i) => {
        const v = se.data[i];
        if (v == null) return;
        const a = Vx(zero), b = Vx(v);
        const x = catCenter(i) - inner / 2 + k * (barSize + GAP);
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
        out.push(roundedEnd(x, y, w, h, r, horiz, grow, se.color));

        // alça de arraste no topo do segmento; base = quanto já foi empilhado
        // abaixo (0 em barra simples), pra converter arraste → valor da série.
        // s: índice VERDADEIRO em spec.series (barsHere pode ser um filtro)
        if (meta) meta.marks.push({
          s: series.indexOf(se), i, value: se.data[i], base: stacked ? start : 0, kind: 'bar',
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
      const k = series.indexOf(se), Vx = Vfor(se);
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
      out.push(`<path d="${d}" fill="none" stroke="${se.color}" stroke-width="${s.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${se.dashed ? ' stroke-dasharray="7 5"' : ''}/>`);
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

// ── donut ────────────────────────────────────────────────────────────────────
function donut(series, labels, s, t, box) {
  const { pad, top, plotBottom, W, fs } = box;
  const out = [];
  const data = series.length > 1 && series[0].data.length === 1
    ? series.map((se) => ({ name: se.name, v: se.data[0] ?? 0, color: se.color }))
    : labels.map((l, i) => ({ name: l, v: series[0]?.data[i] ?? 0, color: series[0]?.color && series.length === 1 ? t.series[i % t.series.length] : t.series[i % t.series.length] }));
  const total = data.reduce((a, d) => a + Math.abs(d.v), 0) || 1;

  const size = Math.min(plotBottom - top, (W - pad * 2) * 0.62);
  const cx = pad + size / 2, cy = top + size / 2;
  // pie = rosca cheia (raio interno 0)
  const rOut = size / 2, rIn = s.type === 'pie' ? 0 : rOut * (1 - s.donutThickness);
  const GAPa = 2 / rOut; // respiro de ~2px em radianos

  let a = -Math.PI / 2;
  data.forEach((d) => {
    const sweep = (Math.abs(d.v) / total) * Math.PI * 2;
    if (sweep > GAPa * 1.5) out.push(`<path d="${arc(cx, cy, rOut, rIn, a + GAPa / 2, a + sweep - GAPa / 2)}" fill="${d.color}"/>`);
    // pizza: % escrito NA fatia (fatia pequena não cabe texto — fica só na legenda)
    if (s.type === 'pie' && sweep / (Math.PI * 2) >= 0.05) {
      const mid = a + sweep / 2, rr = rOut * 0.62;
      out.push(txt(cx + Math.cos(mid) * rr, cy + Math.sin(mid) * rr + fs.legend * 0.35,
        esc(formatValue((Math.abs(d.v) / total) * 100, { format: 'pct' })),
        { size: fs.legend, fill: '#fff', anchor: 'middle', weight: 600 }));
    }
    a += sweep;
  });

  // rótulos diretos à direita — legenda + valor, identidade nunca só por cor
  let ly = top + fs.legend * 1.2;
  const lx = pad + size + 34 * s.fontScale;
  data.forEach((d) => {
    out.push(`<rect x="${n2(lx)}" y="${n2(ly - fs.legend * 0.72)}" width="${n2(fs.legend * 0.78)}" height="${n2(fs.legend * 0.78)}" rx="2" fill="${d.color}"/>`);
    out.push(txt(lx + fs.legend * 1.2, ly, esc(d.name), { size: fs.legend, fill: t.muted, stretch: 90 }));
    // se o dado já está em %, mostrar a fatia calculada ao lado repete a mesma
    // informação ("42% · 42%") — nesse caso vale só o valor
    const val = formatValue(d.v, s.y);
    const share = formatValue((Math.abs(d.v) / total) * 100, { format: 'pct' });
    out.push(txt(W - pad, ly, esc(s.y.format === 'pct' ? val : `${val}  ·  ${share}`),
      { size: fs.legend, fill: t.ink, anchor: 'end', weight: 600, stretch: 90 }));
    ly += fs.legend * 2;
  });
  return out;
}
