/* Importa um gráfico JÁ renderizado a partir do HTML do elemento — o usuário
 * copia o "outerHTML" no DevTools (botão direito → Copy → Copy element) e cola.
 *
 * Por que isso existe: num SVG (recharts e afins) a curva exata já está no
 * atributo `d` do <path> e a calibração nos ticks de texto do eixo. Dá pra
 * reconstruir os valores reais sem IA, de graça e na hora — ao contrário do
 * caminho de screenshot→Claude, que é aproximado, lento e custa.
 *
 * ponytail: mira recharts (line/area, eixo Y com ticks de texto). Outras libs
 * de SVG com <path> + ticks de texto tendem a cair de pé. HTML sem SVG cai na
 * tabela; sem nada disso, use "Converter imagem" (IA). Não roda URL: o navegador
 * não lê o DOM de outro domínio (CORS) — por isso é colar o HTML, não a URL.
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

// `d` de um path (recharts usa só M + curvas C) -> vértices dos dados. O ponto
// de dado é o fim de cada comando; num C ("c1 c2 fim") são os 2 últimos números.
export function pathVertices(d) {
  const n = (String(d).match(/-?\d*\.?\d+(?:e-?\d+)?/gi) || []).map(Number);
  const pts = [];
  if (n.length < 2) return pts;
  pts.push({ x: n[0], y: n[1] });               // M
  for (let i = 2; i + 5 < n.length; i += 6) pts.push({ x: n[i + 4], y: n[i + 5] });
  return pts;
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

const MAXN = 48;   // ponto de dado no import; o resto o usuário arrasta/relabela

/* html (string) -> spec parcial pro renderer, ou null se não achar gráfico.
 * Lança Error com mensagem amigável quando acha SVG mas não consegue calibrar. */
export function parseChartHtml(html) {
  const doc = new DOMParser().parseFromString(String(html), 'text/html');

  // SVG principal = o que tem ticks de eixo Y (o brush/minimap não tem nenhum)
  const svgs = [...doc.querySelectorAll('svg')];
  const svg = svgs.find((s) => s.querySelector('.recharts-yAxis .recharts-cartesian-axis-tick-value'))
    || svgs.find((s) => s.querySelector('.recharts-cartesian-axis-tick-value'))
    || svgs.find((s) => s.querySelector('path[class*="curve"], path.recharts-curve'));
  if (!svg) {
    const t = parseTable(doc.body ? doc.body.textContent : '');   // fallback: era tabela
    return t && t.series.length ? { labels: t.labels, series: t.series } : null;
  }

  const paths = [...svg.querySelectorAll('path.recharts-line-curve, path.recharts-area-curve')]
    .filter((p) => (p.getAttribute('d') || '').length > 10);
  if (!paths.length) throw new Error('Achei um SVG mas nenhuma linha de dados (path). É recharts de linha/área?');

  // calibração do eixo Y pelos ticks de texto (px = y1 da linha do tick)
  const yTicks = [...svg.querySelectorAll('.recharts-yAxis .recharts-cartesian-axis-tick')].map((t) => ({
    px: +(t.querySelector('line')?.getAttribute('y1') ?? t.querySelector('text')?.getAttribute('y')),
    val: parseNumber(t.querySelector('text')?.textContent || ''),
  }));
  const rawYTick = [...svg.querySelectorAll('.recharts-yAxis .recharts-cartesian-axis-tick-value')]
    .map((t) => t.textContent).join(' ');   // junta todos: o sufixo (T/%/$) pode estar só em alguns
  const calib = calibrate(yTicks);

  // ticks do eixo X (px = atributo x do texto) pra reaproveitar os rótulos
  const xTicks = [...svg.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick text')]
    .map((t) => ({ px: +t.getAttribute('x'), label: t.textContent.trim() }))
    .filter((t) => Number.isFinite(t.px) && t.label);

  // sem calibração, cai pra "altura invertida": preserva a forma, valor arbitrário
  const allY = paths.flatMap((p) => pathVertices(p.getAttribute('d')).map((v) => v.y));
  const baseline = Math.max(...allY);
  const toVal = calib || ((py) => baseline - py);

  const series = paths.map((p, i) => {
    const v = downsample(pathVertices(p.getAttribute('d')), MAXN);
    const color = toHex(p.getAttribute('stroke'));
    return {
      name: p.getAttribute('name') || `série ${i + 1}`,
      data: v.map((pt) => Math.round(toVal(pt.y) * 1000) / 1000),
      _px: v.map((pt) => pt.x),
      ...(color ? { color } : {}),
    };
  });

  // rótulos do X: posiciona cada tick no ponto mais próximo da série principal
  const px = series[0]._px, labels = px.map(() => '');
  for (const t of xTicks) {
    let bi = 0, bd = Infinity;
    px.forEach((x, i) => { const d = Math.abs(x - t.px); if (d < bd) { bd = d; bi = i; } });
    labels[bi] = t.label;
  }
  series.forEach((s) => delete s._px);

  const type = paths.some((p) => /area-curve/.test(p.getAttribute('class') || '')) ? 'area' : 'line';
  return {
    type, labels, series,
    y: { format: calib ? guessFormat(rawYTick) : 'num' },
    x: { every: 1 },
    _calibrated: !!calib,
  };
}
