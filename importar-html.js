/* Importa um gráfico JÁ renderizado a partir do HTML do elemento — o usuário
 * copia o "outerHTML" no DevTools (botão direito → Copy → Copy element) e cola.
 *
 * Por que isso existe: num SVG (recharts e afins) a curva exata já está no
 * atributo `d` do <path> e a calibração nos ticks de texto do eixo. Dá pra
 * reconstruir os valores reais sem IA, de graça e na hora — ao contrário do
 * caminho de screenshot→Claude, que é aproximado, lento e custa.
 *
 * ponytail: mira recharts (line/área/barra, eixo Y com ticks de texto, até
 * 2 eixos). Outras libs de SVG com <path>/<rect> + ticks de texto tendem a
 * cair de pé. HTML sem SVG cai na tabela; sem nada disso, use "Converter
 * imagem" (IA). Não roda URL: o navegador não lê o DOM de outro domínio
 * (CORS) — por isso é colar o HTML, não a URL.
 */

import { num } from './tabela.js';
import { parseTable } from './tabela.js';

// "US$ 1.50T", "3,00 tri", "45%", "1.2B", "2 mil" -> número absoluto.
// Reusa o num() (decimais pt/US) e só trata o sufixo de magnitude.
export function parseNumber(raw) {
  const s = String(raw ?? '').trim();
  const suf = (s.match(/[a-z]+$/i) || [''])[0].toLowerCase();
  const mult = /^t/.test(suf) ? 1e12 : /^b/.test(suf) ? 1e9
    : suf === 'mil' || suf === 'k' ? 1e3               // 'mil' antes de 'mi' (milhão)
    : /^(m$|mi|mm|mn)/.test(suf) ? 1e6 : 1;
  const base = num(s.replace(/[a-z]+$/i, ''));   // tira o sufixo antes do num()
  return base == null ? NaN : base * mult;
}

// `d` de um path -> vértices dos dados. O ponto de dado é o FIM de cada comando
// (num C "c1 c2 fim" são os 2 últimos números), então basta andar comando a
// comando. Cobre M/L/H/V/C/S/Q/T/A, absoluto e relativo — recharts só usa M+C,
// mas sparkline de card escrito à mão usa M+L. Vértices saem em ordem de X
// crescente (é como as duas famílias desenham).
const PARAMS = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7 };

export function pathVertices(d) {
  // Z não gera ponto e não tem argumento — some do stream pra simplificar o laço
  const tok = String(d).match(/[mlhvcsqta]|-?\d*\.?\d+(?:e-?\d+)?/gi) || [];
  const pts = [];
  let x = 0, y = 0, cmd = 'M';
  for (let i = 0; i < tok.length;) {
    if (/[a-z]/i.test(tok[i])) { cmd = tok[i]; i++; }
    const k = cmd.toLowerCase(), n = PARAMS[k], abs = cmd === cmd.toUpperCase();
    const a = tok.slice(i, i + n).map(Number);
    if (a.length < n || a.some(Number.isNaN)) break;
    i += n;
    if (k === 'h') x = abs ? a[0] : x + a[0];
    else if (k === 'v') y = abs ? a[0] : y + a[0];
    else { x = abs ? a[n - 2] : x + a[n - 2]; y = abs ? a[n - 1] : y + a[n - 1]; }
    pts.push({ x, y });
  }
  return pts;
}

// amostra a curva (vértices ordenados por x) em cada x de `xs`, interpolando
// linear entre os 2 vértices vizinhos — usa isso pra alinhar uma linha aos
// centros das categorias de um combo barra+linha (contagens de ponto podem
// não bater 1:1 entre as duas séries)
export function sampleAt(vertices, xs) {
  return xs.map((x) => {
    if (!vertices.length) return null;
    if (x <= vertices[0].x) return vertices[0].y;
    const last = vertices[vertices.length - 1];
    if (x >= last.x) return last.y;
    for (let i = 0; i < vertices.length - 1; i++) {
      const a = vertices[i], b = vertices[i + 1];
      if (a.x <= x && x <= b.x) {
        const f = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
        return a.y + f * (b.y - a.y);
      }
    }
    return last.y;
  });
}

// ticks [{px, val}] -> função px→valor (reta pelos dois ticks mais afastados,
// pra diluir o arredondamento). Precisa de ≥2 px distintos.
export function calibrate(ticks) {
  const t = ticks.filter((k) => Number.isFinite(k.px) && Number.isFinite(k.val))
    .sort((a, b) => a.px - b.px);
  if (t.length < 2 || t[0].px === t[t.length - 1].px) return null;
  const a = t[0], b = t[t.length - 1];
  const m = (b.val - a.val) / (b.px - a.px);
  return (px) => a.val + m * (px - a.px);
}

const downsample = (arr, n) => arr.length <= n ? arr
  : Array.from({ length: n }, (_, k) => arr[Math.round(k * (arr.length - 1) / (n - 1))]);

const toHex = (c) => {
  const m = /rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/i.exec(c || '');
  return m ? '#' + [1, 2, 3].map((i) => (+m[i]).toString(16).padStart(2, '0')).join('') : null;
};

function guessFormat(rawTick) {
  const s = String(rawTick || '');
  if (/%/.test(s)) return 'pct';
  if (/US\$|\$/.test(s)) return 'usd';
  if (/R\$/.test(s)) return 'brl';
  if (/[tbmk]\b|tri|bi|mil/i.test(s)) return 'compact';
  return 'num';
}

// Teto de pontos no import. Cada vértice do path É um ponto de dado real, então
// cortar perde fidelidade — o limite existe só pra não estourar a tabela/edição
// com curva absurdamente densa. 400 cobre 1 ano diário e as sparklines de card.
const MAXN = 400;

// eixo Y do recharts: 1 (só esquerdo) ou 2 (esquerdo + direito — combo/dual-axis).
// Cada <g class="...recharts-yAxis..."> carrega orientation na linha do eixo.
function readYAxis(g) {
  const ticks = [...g.querySelectorAll('.recharts-cartesian-axis-tick')].map((t) => ({
    px: +(t.querySelector('line')?.getAttribute('y1') ?? t.querySelector('text')?.getAttribute('y')),
    val: parseNumber(t.querySelector('text')?.textContent || ''),
  }));
  const rawTick = [...g.querySelectorAll('.recharts-cartesian-axis-tick-value')].map((t) => t.textContent).join(' ');
  return { orientation: g.querySelector('.recharts-cartesian-axis-line')?.getAttribute('orientation') || 'left', ticks, rawTick, calib: calibrate(ticks) };
}

// barras recharts: <path class="recharts-rectangle"> (ou <rect>, sem cantos
// arredondados) já traz x/y/width/height como atributo puro — não precisa
// decompor o d= como as curvas. Categoria = centro X; agrupa por "name"
// (múltiplas séries). Empilhado (stackId no recharts) é detectado quando 2+
// séries têm barras exatamente na mesma pegada x/largura em toda categoria —
// nesse caso o valor de cada série vem da ALTURA × inclinação da calibração
// (a posição Y dá o acumulado, não o valor individual). Barra horizontal não
// é tratada (YAGNI até aparecer o caso).
function parseBars(svg, calib) {
  const bars = [...svg.querySelectorAll('path.recharts-rectangle, rect.recharts-rectangle')]
    .map((b) => ({
      name: b.getAttribute('name') || 'série 1',
      x: +b.getAttribute('x'), w: +b.getAttribute('width'), y: +b.getAttribute('y'), h: +b.getAttribute('height'),
    }))
    .filter((b) => [b.x, b.w, b.y, b.h].every(Number.isFinite));
  if (!bars.length) return null;

  // arredonda o centro pra juntar antialiasing/subpixel da mesma categoria
  const centers = [...new Set(bars.map((b) => Math.round((b.x + b.w / 2) * 10) / 10))].sort((a, b) => a - b);
  const nearest = (cx) => centers.reduce((a, c) => (Math.abs(c - cx) < Math.abs(a - cx) ? c : a));
  const names = [...new Set(bars.map((b) => b.name))];

  const footprint = (b) => `${b.x.toFixed(1)}_${b.w.toFixed(1)}`;
  const stacked = names.length > 1 && bars.every((b) => bars.some((o) => o !== b && o.name !== b.name && footprint(o) === footprint(b)));
  const slope = calib ? calib(1) - calib(0) : -1;   // calib é linear — diferença dá o valor por px

  const series = names.map((name) => ({ name, data: new Array(centers.length).fill(null) }));
  bars.forEach((b) => {
    const ci = centers.indexOf(nearest(b.x + b.w / 2));
    const v = stacked ? Math.abs(slope) * b.h : (calib ? calib(b.y) : b.y);
    series[names.indexOf(b.name)].data[ci] = calib ? Math.round(v * 1000) / 1000 : v;
  });
  return { series, centers, stacked };
}

// SVG escrito à mão (sparkline de card, sem classe de lib) -> os <path> de dados.
// Área e linha vêm duplicadas — mesmo traçado, uma com fill e o Z que fecha na
// base. Fica só com as que têm stroke; se não houver nenhuma, usa as de fill
// (os 2 vértices da base saem depois, em vertsOf).
function plainPaths(svg) {
  const all = [...svg.querySelectorAll('path[d]')]
    .filter((p) => !p.closest('defs, clipPath, mask'))
    .filter((p) => pathVertices(p.getAttribute('d')).length >= 3);
  const stroked = all.filter((p) => (p.getAttribute('stroke') || 'none') !== 'none');
  return stroked.length ? stroked : all;
}

// maior tamanho de fonte declarado no elemento (classe utilitária text-[1.7rem]
// ou style inline). Serve só pra ranquear textos dentro do card.
function fontSize(el) {
  const s = (el.getAttribute('class') || '') + ';' + (el.getAttribute('style') || '');
  const v = [...s.matchAll(/(\d*\.?\d+)\s*(rem|em|px)\b/g)].map((m) => +m[1] * (m[2] === 'px' ? 1 / 16 : 1));
  return v.length ? Math.max(...v) : 0;
}

/* Card sem eixo nenhum (sparkline estilo hyperscreener): a escala está no número
 * grande do próprio card — é o valor do ÚLTIMO ponto — e o fundo do viewBox é o
 * zero. Com esses dois âncoras dá pra calibrar. Pega o texto numérico de maior
 * fonte DENTRO do card do gráfico (os cards vizinhos têm números maiores e nada
 * a ver). 🤔 assume "número grande = valor atual"; é o padrão desses cards, mas
 * não é lido de lugar nenhum — por isso a spec volta com _note avisando. */
function cardAnchor(svg, verts) {
  const root = svg.closest('.card') || svg.parentElement;
  const last = verts[verts.length - 1];
  const h = +(svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/)[3];
  if (!root || !last || !Number.isFinite(h) || h === last.y) return null;
  let best = null;
  for (const el of root.querySelectorAll('*')) {
    if (el.children.length) continue;                       // só folhas de texto
    const v = parseNumber(el.textContent);
    if (!Number.isFinite(v) || v === 0) continue;
    const size = fontSize(el);
    if (size && (!best || size > best.size)) best = { size, v, raw: el.textContent.trim() };
  }
  return best ? { fn: (py) => best.v * (h - py) / (h - last.y), raw: best.raw } : null;
}

/* html (string) -> spec parcial pro renderer, ou null se não achar gráfico.
 * Lança Error com mensagem amigável quando acha SVG mas não consegue calibrar. */
export function parseChartHtml(html) {
  const doc = new DOMParser().parseFromString(String(html), 'text/html');

  // SVG principal = o que tem ticks de eixo Y (o brush/minimap não tem nenhum)
  const svgs = [...doc.querySelectorAll('svg')];
  const svg = svgs.find((s) => s.querySelector('.recharts-yAxis .recharts-cartesian-axis-tick-value'))
    || svgs.find((s) => s.querySelector('.recharts-cartesian-axis-tick-value'))
    || svgs.find((s) => s.querySelector('path[class*="curve"], path.recharts-curve, path.recharts-rectangle, rect.recharts-rectangle'))
    || svgs.find((s) => plainPaths(s).length);   // SVG sem lib: sparkline de card
  if (!svg) {
    const t = parseTable(doc.body ? doc.body.textContent : '');   // fallback: era tabela
    if (t && t.series.length) return { labels: t.labels, series: t.series };
    /* <canvas> (ECharts, Chart.js, TradingView): o dado virou PIXEL na hora de
     * desenhar e não existe no DOM — nenhum parser de HTML tira número daí.
     * Vale dizer isso e apontar a saída, em vez do genérico "não achei
     * gráfico", que faz o usuário colar o mesmo HTML de novo. */
    if (doc.querySelector('canvas')) {
      /* O tooltip do ECharts fica no DOM e, num sankey, tem a cara "A → B" +
       * valor. Só que ele guarda UM fluxo — o que estava sob o mouse quando o
       * HTML foi copiado. Reconhecer isso vale pra dizer exatamente o que
       * falta, em vez de repetir o recado genérico de canvas.
       *
       * Lido pela ESTRUTURA (o menor elemento com a seta), não por regex no
       * texto todo: o textContent cola os elementos sem separador e a captura
       * saía com o título grudado no nome do nó. */
      const comSeta = [...doc.querySelectorAll('div, span, p')]
        .filter((el) => /→|-&gt;|->/.test(el.textContent) && !el.querySelector('canvas'))
        .sort((a, b) => a.textContent.length - b.textContent.length)[0];
      if (comSeta) {
        const partes = [...comSeta.querySelectorAll('strong, b')].map((e) => e.textContent.trim()).filter(Boolean);
        const [de, para] = partes.length >= 2 ? partes
          : comSeta.textContent.split(/→|-&gt;|->/).map((x) => x.trim());
        const valor = (comSeta.textContent.match(/[R]?\$\s?[\d.,]+\s*[KMBTkmbt]?/g) || []).pop();
        throw new Error(`isso é um sankey em <canvas> (ECharts): do gráfico inteiro, o HTML só traz o TOOLTIP de UM `
          + `fluxo — "${de} → ${para}"${valor ? ` (${valor})` : ''} — porque foi o que estava sob o mouse na hora de copiar. `
          + `Os outros fluxos não existem no DOM, só como pixel. Caminho: "Converter imagem em gráfico" com um print — `
          + `a IA lê as fitas e devolve origem/destino/valor. Ou digite na caixa de texto: origem,destino,valor.`);
      }
      throw new Error('esse gráfico é desenhado em <canvas> (ECharts e afins) — o HTML não carrega os números, '
        + 'eles só existem como pixel. Cole a URL da página (DefiLlama eu busco pela API), ou baixe o CSV do '
        + 'site e cole na caixa de CSV, ou use "Converter imagem em gráfico".');
    }
    return null;
  }

  // 1 ou 2 eixos Y — combo/dual-axis (ex.: barra empilhada + linha de
  // acumulado) usa a direita pra segunda escala
  // Atenção: o recharts costuma renderizar o eixo esquerdo SEM ticks quando quem
  // rotula é o direito (só a linha do eixo, pro rótulo "Volume (USD)" ficar lá).
  // Eixo sem tick não calibra nada — se só um eixo tem escala, ele vale por todos,
  // senão o valor cairia no fallback de pixel (eixo Y preenchido errado).
  const yAxisGroups = [...svg.querySelectorAll('.recharts-cartesian-axis.recharts-yAxis')].map(readYAxis);
  const withCalib = yAxisGroups.filter((a) => a.calib);
  const yLeft = yAxisGroups.find((a) => a.orientation === 'left' && a.calib)
    || (withCalib.length === 1 ? withCalib[0] : null)
    || yAxisGroups.find((a) => a.orientation === 'left') || yAxisGroups[0] || { calib: null, rawTick: '' };
  const yRight = yAxisGroups.find((a) => a.orientation === 'right' && a !== yLeft);

  // ticks do eixo X (px = atributo x do texto) pra reaproveitar os rótulos
  const xTicks = [...svg.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick text')]
    .map((t) => ({ px: +t.getAttribute('x'), label: t.textContent.trim() }))
    .filter((t) => Number.isFinite(t.px) && t.label);
  const matchLabels = (centers) => {
    const labels = centers.map(() => '');
    for (const t of xTicks) {
      let bi = 0, bd = Infinity;
      centers.forEach((x, i) => { const d = Math.abs(x - t.px); if (d < bd) { bd = d; bi = i; } });
      labels[bi] = t.label;
    }
    return labels;
  };

  const recharts = [...svg.querySelectorAll('path.recharts-line-curve, path.recharts-area-curve')]
    .filter((p) => (p.getAttribute('d') || '').length > 10);
  const plain = recharts.length ? [] : plainPaths(svg);
  const paths = recharts.length ? recharts : plain;
  const bars = parseBars(svg, yLeft.calib);

  if (!paths.length && !bars) throw new Error('Achei um SVG mas nenhuma linha nem barra de dados. É recharts de linha/área/barra?');

  // só barra (sem linha): como antes, empilha se detectou stackId
  if (!paths.length) {
    return {
      type: bars.stacked ? 'stacked' : 'bar', labels: matchLabels(bars.centers), series: bars.series,
      y: { format: yLeft.calib ? guessFormat(yLeft.rawTick) : 'num' },
      x: { every: 1 },
      _calibrated: !!yLeft.calib,
    };
  }

  // tem barra E linha: combo — barra fica no eixo esquerdo (como já estava),
  // linha vai pro direito se ele existir (padrão do gráfico "volume + linha
  // de acumulado/preço"); a linha é amostrada NOS MESMOS centros de X da
  // barra por interpolação — as duas séries raramente têm a mesma contagem
  // de ponto no d= original
  if (bars) {
    const useY2 = !!yRight?.calib;
    const lineCalib = useY2 ? yRight.calib : yLeft.calib;
    const lineSeries = paths.map((p, i) => {
      const verts = pathVertices(p.getAttribute('d'));
      const ys = sampleAt(verts, bars.centers);
      const color = toHex(p.getAttribute('stroke'));
      return {
        name: p.getAttribute('name') || `linha ${i + 1}`,
        data: ys.map((y) => (y == null ? null : lineCalib ? Math.round(lineCalib(y) * 1000) / 1000 : y)),
        as: /area-curve/.test(p.getAttribute('class') || '') ? 'area' : 'line',
        ...(useY2 ? { axis: 'y2' } : {}),
        ...(color ? { color } : {}),
      };
    });
    return {
      type: bars.stacked ? 'stacked' : 'bar', labels: matchLabels(bars.centers), series: [...bars.series, ...lineSeries],
      y: { format: yLeft.calib ? guessFormat(yLeft.rawTick) : 'num' },
      ...(useY2 ? { y2: { format: guessFormat(yRight.rawTick) } } : {}),
      x: { every: 1 },
      _calibrated: !!yLeft.calib,
    };
  }

  // só linha/área (sem barra). Num path de ÁREA fechado com Z os 2 últimos
  // vértices são os cantos da base, não dado — fora.
  const vertsOf = (p) => {
    const d = p.getAttribute('d') || '';
    const v = pathVertices(d);
    return /z\s*$/i.test(d) ? v.slice(0, -2) : v;
  };
  const allY = paths.flatMap((p) => vertsOf(p).map((v) => v.y));
  const baseline = Math.max(...allY);
  // sem eixo: tenta a escala pelo número grande do card antes de cair no pixel
  const anchor = yLeft.calib ? null : cardAnchor(svg, vertsOf(paths[0]));
  const toVal = yLeft.calib || anchor?.fn || ((py) => baseline - py);

  const series = paths.map((p, i) => {
    const v = downsample(vertsOf(p), MAXN);
    const color = toHex(p.getAttribute('stroke'));
    return {
      name: p.getAttribute('name') || `série ${i + 1}`,
      data: v.map((pt) => Math.round(toVal(pt.y) * 1000) / 1000),
      _px: v.map((pt) => pt.x),
      ...(color ? { color } : {}),
    };
  });

  const px = series[0]._px, labels = matchLabels(px);
  series.forEach((s) => delete s._px);

  // área: pela classe (recharts) ou por existir um path preenchido no SVG (card)
  const type = paths.some((p) => /area-curve/.test(p.getAttribute('class') || ''))
    || (plain.length && svg.querySelector('path[fill]:not([fill="none"])')) ? 'area' : 'line';
  return {
    type, labels, series,
    y: { format: yLeft.calib ? guessFormat(yLeft.rawTick) : anchor ? guessFormat(anchor.raw) : 'num' },
    x: { every: 1 },
    _calibrated: !!(yLeft.calib || anchor),
    ...(anchor ? { _note: `Sem eixo: escala tirada do número do card (${anchor.raw} no último ponto) com base zero — confira.` } : {}),
  };
}
