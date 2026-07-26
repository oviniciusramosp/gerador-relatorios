/* Renderer de linha do tempo da Paradigma: spec (JSON) -> string SVG.
 *
 * Puro: não toca no DOM, não depende do navegador — igual chart.js, e reusando
 * dele os tokens de tema (THEMES) e o logo tingido (logoSvg), pra a timeline
 * sair no mesmo padrão visual do gráfico sem paleta paralela.
 *
 * Uso:  import { renderTimeline } from './timeline.js'
 *       el.innerHTML = renderTimeline(spec)
 *
 * A ALTURA é sempre calculada (o conteúdo manda): o texto quebra na largura da
 * coluna e cada evento ocupa a linha que precisa. `spec.width` é a largura da
 * imagem nos layouts verticais; no horizontal a largura sai de `colWidth × nº
 * de eventos`. Chame layoutSize(spec) pra saber as duas antes de renderizar.
 */
import { THEMES, logoSvg } from './chart.js';
import { iconSvg, isTextIcon, textIconLabel } from './timeline-icons.js';

export const DEFAULTS = {
  layout: 'alternada',      // alternada | esquerda | horizontal
  theme: 'light',
  // 1200 = mesma largura padrão do gerador de gráficos (chart.js), pra gráfico e
  // timeline caírem no relatório com a mesma caixa
  width: 1200,             // largura da imagem (layouts verticais)
  colWidth: 250,           // largura da coluna de cada evento (layout horizontal)
  cardScale: 0.5,          // fração do espaço ao lado do eixo que o card ocupa (só vertical)
  title: 'Linha do Tempo',
  subtitle: '',
  source: '',
  // mesma convenção do gráfico: o texto fica guardado, o switch decide se aparece.
  // range = a tarja "2022 — 2026", derivada dos anos do primeiro/último evento
  show: { title: true, subtitle: true, source: false, range: true },
  events: [],              // [{ date, text, icon?, color? }] — icon: chave de ICONS ou 'txt:S&P'
  accent: null,            // cor da data/eixo/nó; null = mint da marca (por tema)
  card: true,              // fundo do card atrás do texto (exemplos 2 e 3)
  nodeSize: 46,            // diâmetro do nó
  gap: 26,                 // respiro entre eventos
  connector: true,         // traço ligando o nó ao card
  arrow: true,             // seta na ponta do eixo
  fontScale: 1,
  transparent: false,
  // logo: none|icone|full|nome · pos header|footer|center (center = marca d'água)
  watermark: { logo: 'none', pos: 'footer', align: 'right', color: '#94A3B8', opacity: 1, size: 0.7 },
};

// accent padrão por tema (mint da marca, escurecido no claro pra ter contraste)
const ACCENT = { dark: '#29E899', light: '#00875A' };
// fundo/borda do card — rgba, então funciona também com fundo transparente
const CARD = {
  dark:  { fill: 'rgba(186,177,255,.055)', stroke: 'rgba(186,177,255,.13)' },
  light: { fill: 'rgba(14,12,27,.035)',    stroke: 'rgba(14,12,27,.10)' },
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
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

// Largura aproximada de texto — mesma heurística por caractere do chart.js
// (mantém o renderer puro: roda em Node, no build do PDF, sem medir no DOM).
const textW = (s, size, stretch = 100) => String(s).length * size * 0.53 * (stretch / 100);

/** Quebra o texto na largura disponível; respeita \n explícito. */
export function wrap(text, maxW, size, stretch = 100) {
  const out = [];
  for (const para of String(text ?? '').split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (cur && textW(t, size, stretch) > maxW) { out.push(cur); cur = w; } else cur = t;
    }
    out.push(cur);
  }
  return out;
}

function txt(x, y, content, o = {}) {
  const a = [`x="${n2(x)}"`, `y="${n2(y)}"`, `font-size="${n2(o.size)}"`, `fill="${o.fill}"`];
  if (o.weight) a.push(`font-weight="${o.weight}"`);
  if (o.stretch) a.push(`font-stretch="${o.stretch}%"`);
  if (o.ls) a.push(`letter-spacing="${n2(o.ls * o.size)}"`);
  if (o.anchor) a.push(`text-anchor="${o.anchor}"`);
  if (o.opacity) a.push(`opacity="${o.opacity}"`);
  return `<text ${a.join(' ')}>${content}</text>`;
}

// ── medidas ──────────────────────────────────────────────────────────────────
function metrics(s) {
  const F = s.fontScale;
  return {
    F,
    pad: 40 * F,
    fs: { title: 30 * F, sub: 16 * F, eyebrow: 11 * F, date: 12 * F, text: 15 * F, src: 12 * F, badge: 13 * F },
    cardPad: s.card ? 14 * F : 2 * F,
    lineH: 15 * F * 1.42,
    dateGap: 9 * F,
    conn: (s.connector ? 18 : 8) * F,
    node: s.nodeSize * F,
    gap: s.gap * F,
  };
}

/** Altura do bloco de texto de um evento (data + linhas), já quebrado. */
function measure(ev, cardW, m) {
  const lines = wrap(ev.text || '', cardW - 2 * m.cardPad, m.fs.text);
  const hasDate = !!(ev.date ?? '').toString().trim();
  const h = 2 * m.cardPad + (hasDate ? m.fs.date + m.dateGap : 0) + lines.length * m.lineH;
  return { lines, hasDate, h };
}

/** Anos das pontas, pra tarja "2022 — 2026". */
function rangeLabel(events) {
  const years = events.map((e) => (String(e.date || '').match(/\b(19|20)\d{2}\b/) || [])[0]).filter(Boolean);
  if (!years.length) return '';
  const a = years[0], b = years[years.length - 1];
  return a === b ? a : `${a}  —  ${b}`;
}

/**
 * Tamanho final da imagem, sem renderizar — o editor usa pra mostrar as dimensões
 * e calcular o PNG. Devolve { w, h }.
 */
export function layoutSize(userSpec = {}) {
  return plan(deepMerge(DEFAULTS, userSpec)).size;
}

// ── planejamento (geometria) ─────────────────────────────────────────────────
// Separado do desenho porque a altura depende do conteúdo: primeiro mede tudo,
// decide a caixa, e só então emite SVG. layoutSize() reusa esta função.
function plan(s) {
  const m = metrics(s);
  const events = (s.events || []).filter((e) => e && (e.date || e.text));
  const horiz = s.layout === 'horizontal';
  const wmL = s.watermark?.logo && s.watermark.logo !== 'none' ? s.watermark : null;
  const wmH = wmL ? 40 * m.F * (wmL.size || 1) : 0;
  const wmCenterTop = wmL && wmL.pos === 'header' && wmL.align === 'center' ? wmH + 14 * m.F : 0;
  const wmFooter = wmL && wmL.pos === 'footer' ? wmH + 14 * m.F : 0;

  // — cabeçalho (centralizado, como nos 3 exemplos) —
  const range = s.show?.range ? rangeLabel(events) : '';
  const showTitle = !!(s.title && s.show?.title);
  const showSub = !!(s.subtitle && s.show?.subtitle);
  const head = [];
  let y = m.pad + wmCenterTop;
  if (range) { y += m.fs.eyebrow; head.push({ kind: 'eyebrow', y, text: range }); y += 16 * m.F; }
  if (showTitle) { y += m.fs.title * 0.78; head.push({ kind: 'title', y, text: s.title }); y += 12 * m.F; }
  if (showSub) { y += m.fs.sub; head.push({ kind: 'sub', y, text: s.subtitle }); y += 6 * m.F; }
  if (range || showTitle || showSub) { y += 14 * m.F; head.push({ kind: 'rule', y }); y += 26 * m.F; }

  const srcH = s.source && s.show?.source ? m.fs.src * 2.2 : 0;
  const W0 = Math.max(360, s.width);

  if (!horiz) {
    const axisX = s.layout === 'esquerda' ? m.pad + m.node / 2 : W0 / 2;
    // espaço livre de um lado do eixo; o card usa a fração cardScale dele e fica
    // encostado no eixo (a sobra vira margem externa). Sem isso, com a largura de
    // 1200 do gráfico, o card ocupa ~520px e o texto vira uma linha esticada.
    const avail = s.layout === 'esquerda'
      ? W0 - m.pad - (axisX + m.node / 2 + m.conn)
      : W0 / 2 - m.pad - m.node / 2 - m.conn;
    const cardW = Math.max(140, avail * (s.cardScale ?? 1));
    const rows = [];
    let cursor = y;
    events.forEach((ev, i) => {
      const side = s.layout === 'esquerda' ? 'right' : (i % 2 ? 'right' : 'left');
      const mm = measure(ev, cardW, m);
      const rowH = Math.max(m.node, mm.h);
      rows.push({ ev, i, side, cardW, ...mm, cy: cursor + rowH / 2, top: cursor + (rowH - mm.h) / 2 });
      cursor += rowH + m.gap;
    });
    // fundo do conteúdo = base do último card OU a ponta da seta, o que descer mais
    const last = rows.length ? cursor - m.gap : y;
    const tip = rows.length && s.arrow ? rows[rows.length - 1].cy + m.node / 2 + 24 * m.F : 0;
    const H = Math.max(last, tip) + m.pad + srcH + wmFooter;
    return { m, events, head, rows, axisX, horiz, size: { w: W0, h: Math.round(H) }, srcH, wmH, wmFooter };
  }

  // — horizontal: colunas de largura fixa, cards alternando acima/abaixo —
  const colW = Math.max(120, s.colWidth * m.F);
  const cardW = colW - 20 * m.F;
  const cols = events.map((ev, i) => ({ ev, i, side: i % 2 ? 'below' : 'above', cardW, ...measure(ev, cardW, m) }));
  const maxAbove = Math.max(0, ...cols.filter((c) => c.side === 'above').map((c) => c.h));
  const maxBelow = Math.max(0, ...cols.filter((c) => c.side === 'below').map((c) => c.h));
  const axisY = y + maxAbove + m.conn + m.node / 2;
  const W = Math.max(360, 2 * m.pad + Math.max(1, cols.length) * colW);
  const H = axisY + m.node / 2 + m.conn + maxBelow + m.pad + srcH + wmFooter;
  cols.forEach((c) => {
    c.cx = m.pad + colW * c.i + colW / 2;
    c.top = c.side === 'above' ? axisY - m.node / 2 - m.conn - c.h : axisY + m.node / 2 + m.conn;
  });
  return { m, events, head, cols, axisY, colW, horiz, size: { w: Math.round(W), h: Math.round(H) }, srcH, wmH, wmFooter };
}

// ── render ───────────────────────────────────────────────────────────────────
export function renderTimeline(userSpec = {}, opts = {}) {
  const s = deepMerge(DEFAULTS, userSpec);
  const t = THEMES[s.theme] || THEMES.dark;
  const p = plan(s);
  const { m } = p;
  const W = p.size.w, H = p.size.h;
  const accent = s.accent || ACCENT[s.theme] || ACCENT.dark;
  const card = CARD[s.theme] || CARD.dark;
  if (opts.meta) opts.meta.size = { w: W, h: H };

  const out = [];
  const wm = s.watermark || {};
  const wmL = wm.logo && wm.logo !== 'none' ? wm : null;

  // marca d'água central: grande, faded, ATRÁS de tudo
  if (wmL && wm.pos === 'center') {
    const bw = Math.min(W * 0.5 * (wm.size || 1), W * 0.9);
    out.push(logoSvg(wm.logo, { x: (W - bw) / 2, y: (H - bw * 0.55) / 2, w: bw, h: bw * 0.55 },
      wm.color, wm.opacity ?? 0.08));
  }

  // — cabeçalho —
  for (const h of p.head) {
    if (h.kind === 'eyebrow') out.push(txt(W / 2, h.y, esc(h.text), { size: m.fs.eyebrow, fill: accent, weight: 600, stretch: 85, ls: 0.22, anchor: 'middle' }));
    if (h.kind === 'title') out.push(txt(W / 2, h.y, esc(h.text), { size: m.fs.title, fill: t.ink, weight: 600, ls: -0.02, anchor: 'middle' }));
    if (h.kind === 'sub') out.push(txt(W / 2, h.y, esc(h.text), { size: m.fs.sub, fill: t.muted, stretch: 90, anchor: 'middle' }));
    if (h.kind === 'rule') out.push(`<line x1="${n2(W / 2 - 26 * m.F)}" y1="${n2(h.y)}" x2="${n2(W / 2 + 26 * m.F)}" y2="${n2(h.y)}" stroke="${accent}" stroke-width="${n2(1.5 * m.F)}" opacity=".55"/>`);
  }

  // — eixo + eventos —
  if (p.horiz) drawHorizontal(out, s, t, p, accent, card);
  else drawVertical(out, s, t, p, accent, card);

  if (s.source && s.show?.source) {
    out.push(txt(W / 2, H - m.pad - p.wmFooter + m.fs.src * 0.3, esc(s.source),
      { size: m.fs.src, fill: t.faint, stretch: 90, anchor: 'middle' }));
  }

  // logo de canto (cabeçalho/rodapé) — depois do conteúdo, pra ficar por cima
  if (wmL && wm.pos !== 'center') {
    const h = p.wmH, w = h * 3;   // caixa larga; preserveAspectRatio encaixa sem distorcer
    const y = wm.pos === 'header' ? m.pad : H - m.pad - h;
    const x = wm.align === 'left' ? m.pad : wm.align === 'center' ? (W - w) / 2 : W - m.pad - w;
    out.push(logoSvg(wm.logo, { x, y, w, h }, wm.color, wm.opacity ?? 1));
  }

  const font = opts.fontDataUri
    ? `@font-face{font-family:"Plex";src:url("${opts.fontDataUri}") format("truetype-variations");font-weight:100 700;font-stretch:62% 100%}`
    : '';

  // opts.embedPlan: carimba o plano do Figma num <metadata> (elemento padrão de
  // SVG, ignorado por qualquer renderer). É assim que UM texto no clipboard serve
  // aos dois caminhos: colado direto no Figma vira vetor; colado no plugin da
  // Paradigma vira frame com auto-layout.
  const meta = opts.embedPlan
    ? `\n<metadata id="pdgm-timeline">${esc(JSON.stringify(figmaPlan(userSpec)))}</metadata>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(s.title || 'Linha do tempo')}">${meta}
<style>${font}text{font-family:"Plex",system-ui,sans-serif;font-synthesis:none}</style>
${s.transparent ? '' : `<rect width="${W}" height="${H}" fill="${t.surface}"/>`}
${out.join('\n')}
</svg>`;
}

// nó do eixo: círculo + ícone (ou sigla, no caso txt:)
function node(cx, cy, m, color, surface, icon) {
  const r = m.node / 2;
  const g = [`<circle cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(r)}" fill="${surface}" stroke="${color}" stroke-width="${n2(1.6 * m.F)}"/>`];
  if (isTextIcon(icon)) {
    const label = textIconLabel(icon);
    // sigla longa encolhe pra caber no círculo
    const size = Math.min(m.fs.badge, (r * 1.7) / Math.max(1, label.length) * 1.7);
    g.push(txt(cx, cy + size * 0.35, esc(label), { size, fill: color, weight: 600, stretch: 85, anchor: 'middle' }));
  } else if (icon) {
    const k = m.node * 0.52;
    g.push(iconSvg(icon, { x: cx - k / 2, y: cy - k / 2, w: k, h: k }, color, 1.8));
  } else {
    g.push(`<circle cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(r * 0.3)}" fill="${color}"/>`);
  }
  return g.join('');
}

function cardBox(out, x, y, w, h, m, card, on) {
  if (!on) return;
  out.push(`<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" rx="${n2(8 * m.F)}" fill="${card.fill}" stroke="${card.stroke}" stroke-width="1"/>`);
}

function drawVertical(out, s, t, p, accent, card) {
  const { m, rows, axisX } = p;
  if (!rows.length) return;
  const y0 = rows[0].cy, y1 = rows[rows.length - 1].cy;
  // sobra do eixo depois do último nó: passa do raio do nó, senão a seta encosta nele
  const tail = m.node / 2 + 20 * m.F;
  out.push(`<line x1="${n2(axisX)}" y1="${n2(y0)}" x2="${n2(axisX)}" y2="${n2(y1 + (s.arrow ? tail : 0))}" stroke="${accent}" stroke-width="${n2(1.6 * m.F)}" opacity=".45"/>`);
  if (s.arrow) {
    const ay = y1 + tail, k = 5 * m.F;
    out.push(`<path d="M${n2(axisX - k)} ${n2(ay - k * 1.2)}L${n2(axisX)} ${n2(ay + k * 0.6)}L${n2(axisX + k)} ${n2(ay - k * 1.2)}" fill="none" stroke="${accent}" stroke-width="${n2(1.6 * m.F)}" opacity=".7" stroke-linecap="round" stroke-linejoin="round"/>`);
  }

  for (const r of rows) {
    const color = r.ev.color || accent;
    const right = r.side === 'right';
    const cardX = right ? axisX + m.node / 2 + m.conn : axisX - m.node / 2 - m.conn - r.cardW;
    if (s.connector) {
      const x1 = right ? axisX + m.node / 2 : axisX - m.node / 2;
      const x2 = right ? cardX : cardX + r.cardW;
      out.push(`<line x1="${n2(x1)}" y1="${n2(r.cy)}" x2="${n2(x2)}" y2="${n2(r.cy)}" stroke="${accent}" stroke-width="${n2(1.4 * m.F)}" opacity=".4"/>`);
    }
    cardBox(out, cardX, r.top, r.cardW, r.h, m, card, s.card);
    // texto encostado na borda de dentro: lado esquerdo alinha à direita
    const tx = right ? cardX + m.cardPad : cardX + r.cardW - m.cardPad;
    const anchor = right ? undefined : 'end';
    let ty = r.top + m.cardPad;
    if (r.hasDate) {
      ty += m.fs.date * 0.85;
      out.push(txt(tx, ty, esc(String(r.ev.date).toUpperCase()), { size: m.fs.date, fill: color, weight: 600, stretch: 85, ls: 0.14, anchor }));
      ty += m.dateGap;
    }
    r.lines.forEach((ln, k) => {
      out.push(txt(tx, ty + m.lineH * (k + 0.78), esc(ln), { size: m.fs.text, fill: t.ink, anchor }));
    });
    out.push(node(axisX, r.cy, m, color, t.surface, r.ev.icon));
  }
}

function drawHorizontal(out, s, t, p, accent, card) {
  const { m, cols, axisY } = p;
  if (!cols.length) return;
  const x0 = cols[0].cx, x1 = cols[cols.length - 1].cx;
  const end = x1 + (s.arrow ? m.node / 2 + 20 * m.F : 0);
  out.push(`<line x1="${n2(x0)}" y1="${n2(axisY)}" x2="${n2(end)}" y2="${n2(axisY)}" stroke="${accent}" stroke-width="${n2(1.6 * m.F)}" opacity=".45"/>`);
  if (s.arrow) {
    const k = 5 * m.F;
    out.push(`<path d="M${n2(end - k * 1.2)} ${n2(axisY - k)}L${n2(end + k * 0.6)} ${n2(axisY)}L${n2(end - k * 1.2)} ${n2(axisY + k)}" fill="none" stroke="${accent}" stroke-width="${n2(1.6 * m.F)}" opacity=".7" stroke-linecap="round" stroke-linejoin="round"/>`);
  }

  for (const c of cols) {
    const color = c.ev.color || accent;
    const cardX = c.cx - c.cardW / 2;
    if (s.connector) {
      const ya = c.side === 'above' ? c.top + c.h : axisY + m.node / 2;
      const yb = c.side === 'above' ? axisY - m.node / 2 : c.top;
      out.push(`<line x1="${n2(c.cx)}" y1="${n2(ya)}" x2="${n2(c.cx)}" y2="${n2(yb)}" stroke="${accent}" stroke-width="${n2(1.4 * m.F)}" opacity=".4"/>`);
    }
    cardBox(out, cardX, c.top, c.cardW, c.h, m, card, s.card);
    const tx = cardX + m.cardPad;
    let ty = c.top + m.cardPad;
    if (c.hasDate) {
      ty += m.fs.date * 0.85;
      out.push(txt(tx, ty, esc(String(c.ev.date).toUpperCase()), { size: m.fs.date, fill: color, weight: 600, stretch: 85, ls: 0.14 }));
      ty += m.dateGap;
    }
    c.lines.forEach((ln, k) => out.push(txt(tx, ty + m.lineH * (k + 0.78), esc(ln), { size: m.fs.text, fill: t.ink })));
    out.push(node(c.cx, axisY, m, color, t.surface, c.ev.icon));
  }
}

// ── plano pro Figma ──────────────────────────────────────────────────────────
// Auto-layout NÃO cabe em SVG (nem em nenhum formato de clipboard público — o
// formato nativo do Figma é binário proprietário). Então o SVG copiado leva este
// plano embutido num <metadata>, e o plugin da Paradigma (figma-plugin/) monta
// frames com layoutMode a partir dele. Sem o plugin, o mesmo texto colado no
// Figma vira camadas vetoriais normais — só sem auto-layout.
//
// O plano é COMPLETO de propósito: cores em rgba 0-1, medidas em px e o SVG de
// cada ícone já tingido. O plugin não precisa conhecer tema, paleta nem a
// biblioteca de ícones — ele só empilha nós.
const rgba = (v) => {
  const s = String(v ?? '').trim();
  const m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (m) {
    const [r, g, b, a = 1] = m[1].split(',').map((x) => parseFloat(x));
    return { r: r / 255, g: g / 255, b: b / 255, a: +a };
  }
  const h = /^#([0-9a-f]{6})$/i.exec(s);
  if (!h) return null;
  const n = parseInt(h[1], 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: 1 };
};

export function figmaPlan(userSpec = {}) {
  const s = deepMerge(DEFAULTS, userSpec);
  const t = THEMES[s.theme] || THEMES.dark;
  const p = plan(s), m = p.m;
  const accent = s.accent || ACCENT[s.theme] || ACCENT.dark;
  const cardTok = CARD[s.theme] || CARD.dark;
  const cells = p.horiz ? p.cols : p.rows;
  const cardW = cells?.[0]?.cardW ?? 260;
  const iconOf = (ev) => {
    if (isTextIcon(ev.icon)) return { badge: textIconLabel(ev.icon) };
    if (!ev.icon) return {};
    const k = m.node * 0.52;
    return { svg: iconSvg(ev.icon, { x: 0, y: 0, w: k, h: k }, ev.color || accent, 1.8) };
  };
  return {
    v: 1,
    layout: s.layout,
    size: p.size,
    cor: {
      surface: s.transparent ? null : rgba(t.surface), ink: rgba(t.ink), muted: rgba(t.muted),
      faint: rgba(t.faint), accent: rgba(accent), card: rgba(cardTok.fill), cardStroke: rgba(cardTok.stroke),
    },
    txt: {
      range: p.head.find((h) => h.kind === 'eyebrow')?.text || '',
      title: p.head.find((h) => h.kind === 'title')?.text || '',
      subtitle: p.head.find((h) => h.kind === 'sub')?.text || '',
      source: s.source && s.show?.source ? s.source : '',
    },
    med: {
      pad: m.pad, gap: m.gap, conn: m.conn, node: m.node, cardPad: m.cardPad,
      lineH: m.lineH, dateGap: m.dateGap, cardW, fs: m.fs, radius: 8 * m.F,
    },
    op: { card: s.card, connector: s.connector, arrow: s.arrow },
    events: (cells || []).map((c) => ({
      date: c.hasDate ? String(c.ev.date).toUpperCase() : '',
      text: c.ev.text || '',
      side: c.side,
      ...iconOf(c.ev),
    })),
  };
}

// ── datas: parse e ordenação ─────────────────────────────────────────────────
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/**
 * "Fevereiro/2023", "fev/23", "03/2025", "2025-03", "2024" -> número ordenável
 * (ano*12 + mês). Devolve null se não achar nem o ano — aí a ordenação mantém
 * a posição original em vez de inventar uma.
 */
export function dateKey(str) {
  const s = String(str ?? '').toLowerCase().trim();
  const year = (s.match(/\b(19|20)\d{2}\b/) || [])[0];
  if (!year) return null;
  let month = 0;
  const nome = MESES.findIndex((mm) => s.includes(mm.slice(0, 3)));
  if (nome >= 0) month = nome;
  else {
    // "03/2025" ou "2025-03": o número que NÃO é o ano e cabe em 1..12
    const nums = s.match(/\d+/g)?.filter((v) => v !== year) || [];
    const mn = nums.map(Number).find((v) => v >= 1 && v <= 12);
    if (mn) month = mn - 1;
  }
  return +year * 12 + month;
}

// Texto comparável: sem acento, sem caixa, sem pontuação, espaço normalizado.
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Junta as listas de eventos vindas de FATIAS com sobreposição da mesma imagem.
 * Mesmo evento = mesma data + um texto contido no outro (a fatia corta o card no
 * meio, então uma versão vem truncada) — fica a versão MAIS LONGA, e o ícone de
 * quem tiver. Determinístico: quem decide é esta regra, não o modelo.
 */
export function mergeEvents(lists) {
  const out = [];
  for (const list of lists) {
    for (const ev of list || []) {
      const t = norm(ev.text);
      // sem texto, ou texto que é nota do próprio modelo sobre a borda da fatia
      // ("(texto cortado)"): não é evento, é resto do fatiamento
      if (!t || /^\(.*\)$/.test(String(ev.text).trim())) continue;
      const d = norm(ev.date);
      const hit = out.find((o) => {
        const od = norm(o.date), ot = norm(o.text);
        // data VAZIA é curinga: a fatia cortou o rótulo e só veio o texto
        if (d && od && d !== od) return false;
        return ot && (ot.includes(t) || t.includes(ot));
      });
      if (!hit) { out.push({ ...ev }); continue; }
      // repetido: fica a versão mais completa, e nem data nem ícone se perdem
      if (String(ev.text || '').length > String(hit.text || '').length) hit.text = ev.text;
      if (!String(hit.date || '').trim() && ev.date) hit.date = ev.date;
      if (!hit.icon && ev.icon) hit.icon = ev.icon;
    }
  }
  return out;
}

/** Ordena eventos por data (estável; sem data fica no fim, na ordem original). */
export function sortEvents(events) {
  return events
    .map((e, i) => ({ e, i, k: dateKey(e.date) }))
    .sort((a, b) => (a.k == null) - (b.k == null) || (a.k - b.k) || (a.i - b.i))
    .map((x) => x.e);
}

// ── lista de texto (um evento por linha: "data | texto | icone") ──────────────
// Na lista de texto cada evento é UMA linha, então quebra de linha dentro do
// texto do card viaja escapada como \n literal (e volta em parseLines).
export function toLines(events) {
  return (events || []).map((e) =>
    [e.date || '', String(e.text ?? '').replace(/\n/g, '\\n'), e.icon || '']
      .join(' | ').replace(/\s*\|\s*$/, '')).join('\n');
}

/**
 * Resposta do Claude pra uma imagem (ver ia-timeline.md): linhas de meta
 * (`TITULO:`, `SUBTITULO:`, `FONTE:`, `LAYOUT:`) + uma linha `data | texto |
 * ícone` por evento. Texto puro em vez de JSON de propósito: aspas dentro do
 * texto ("Jelly Jelly") quebravam o JSON e levavam a transcrição inteira com
 * elas. Só linha COM `|` conta como evento, então preâmbulo do modelo ("Aqui
 * está a transcrição:") é ignorado em vez de virar evento fantasma.
 */
export function parseSliceText(txt) {
  const META = { titulo: 'title', subtitulo: 'subtitle', fonte: 'source', layout: 'layout' };
  const meta = {}, evLines = [];
  for (const raw of String(txt ?? '').split('\n')) {
    const ln = raw.trim().replace(/^```\w*$|^```$/, '');
    if (!ln) continue;
    const m = /^([A-Za-zÀ-ú]+)\s*:\s*(.*)$/.exec(ln);
    const key = m && META[m[1].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')];
    if (key) { if (m[2].trim()) meta[key] = m[2].trim(); continue; }
    if (ln.includes('|')) evLines.push(ln);
  }
  return { meta, events: parseLines(evLines.join('\n')) };
}

export function parseLines(str) {
  return String(str ?? '').split('\n').map((ln) => ln.trim()).filter(Boolean).map((ln) => {
    const [date = '', text = '', icon = ''] = ln.split('|').map((v) => v.trim());
    const ev = { date, text: text.replace(/\\n/g, '\n') };
    if (icon) ev.icon = icon;
    return ev;
  });
}
