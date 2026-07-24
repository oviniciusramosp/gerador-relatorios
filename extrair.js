/* Extrator de curva: imagem (pixels) -> série numérica. Sem LLM, sem rede.
 *
 * É o mesmo princípio de um digitalizador de gráfico: acha os pixels da cor da
 * série, segue a curva coluna a coluna, e converte pixel -> valor com a
 * calibração que o usuário der (os 4 valores das bordas da área de plotagem).
 *
 * Puro: recebe ImageData, devolve números. Sem DOM.
 */

// ── cor ──────────────────────────────────────────────────────────────────────
// Distância em OKLab: perceptualmente uniforme, então a tolerância se comporta
// igual pra cor clara e escura. Em RGB o mesmo número de tolerância pega demais
// no escuro e de menos no claro.
const s2l = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export function oklab(r, g, b) {
  const R = s2l(r / 255), G = s2l(g / 255), B = s2l(b / 255);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 100;

export const hex = (r, g, b) => '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase();
export const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Cor média de um quadrado 2r+1 em volta de (x,y) — clique não precisa ser exato. */
export function pickColor(img, x, y, r = 2) {
  let n = 0, acc = [0, 0, 0];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const px = x + dx, py = y + dy;
      if (px < 0 || py < 0 || px >= img.width || py >= img.height) continue;
      const i = (py * img.width + px) * 4;
      acc[0] += img.data[i]; acc[1] += img.data[i + 1]; acc[2] += img.data[i + 2]; n++;
    }
  }
  return hex(...acc.map((c) => Math.round(c / n)));
}

/**
 * Cores candidatas a série: agrupa pixels coloridos (croma alto) e devolve os
 * grupos maiores. Fundo, grade e texto ficam de fora porque são cinza.
 */
export function suggestColors(img, rect, { max = 5, minChroma = 0.06 } = {}) {
  const bins = new Map();
  const step = Math.max(1, Math.floor(Math.min(rect.w, rect.h) / 260));
  let sampled = 0;
  for (let y = rect.y; y < rect.y + rect.h; y += step) {
    for (let x = rect.x; x < rect.x + rect.w; x += step) {
      const i = (y * img.width + x) * 4;
      if (img.data[i + 3] < 200) continue;
      sampled++;
      const [r, g, b] = [img.data[i], img.data[i + 1], img.data[i + 2]];
      const L = oklab(r, g, b);
      if (Math.hypot(L[1], L[2]) < minChroma) continue;      // cinza: grade/texto
      // agrupa em caixas de 16 níveis por canal pra tolerar anti-aliasing
      const k = `${r >> 4}_${g >> 4}_${b >> 4}`;
      const e = bins.get(k) || { n: 0, r: 0, g: 0, b: 0 };
      e.n++; e.r += r; e.g += g; e.b += b; bins.set(k, e);
    }
  }
  const floor = Math.max(6, sampled * 0.002);   // menos que isso é respingo/anti-aliasing
  return [...bins.values()]
    .filter((e) => e.n >= floor)
    .map((e) => {
      const R = Math.round(e.r / e.n), G = Math.round(e.g / e.n), B = Math.round(e.b / e.n);
      const [, a, bb] = oklab(R, G, B);
      // linha de série é fina mas saturada; preenchimento de área é grande mas
      // lavado. Pontuar por croma × √n coloca a linha na frente da mancha.
      return { hex: hex(R, G, B), n: e.n, score: Math.hypot(a, bb) * Math.sqrt(e.n) };
    })
    .sort((a, b) => b.score - a.score).slice(0, max);
}

/**
 * Fallback pra gráfico preto-e-branco: sem croma pra separar a série do
 * resto (tudo é cinza), agrupa por LUMINÂNCIA em vez de matiz. Descarta
 * quase-branco (fundo) e pontua mais escuro × mais pixel como candidato mais
 * provável — convenção comum de gráfico P&B: o traço do dado é desenhado
 * mais escuro/grosso que grade e texto. Menos confiável que suggestColors
 * (grade escura ou eixo grosso podem competir), por isso só entra como
 * fallback quando ela não acha nenhuma cor.
 */
export function suggestGrayColors(img, rect, { max = 5, minDark = 0.12 } = {}) {
  const bins = new Map();
  const step = Math.max(1, Math.floor(Math.min(rect.w, rect.h) / 260));
  let sampled = 0;
  for (let y = rect.y; y < rect.y + rect.h; y += step) {
    for (let x = rect.x; x < rect.x + rect.w; x += step) {
      const i = (y * img.width + x) * 4;
      if (img.data[i + 3] < 200) continue;
      sampled++;
      const [r, g, b] = [img.data[i], img.data[i + 1], img.data[i + 2]];
      const L = oklab(r, g, b)[0];               // luminância perceptual, 0..1
      if (L > 1 - minDark) continue;              // quase-branco: fundo
      const k = Math.round(L * 20);               // 20 faixas de cinza
      const e = bins.get(k) || { n: 0, r: 0, g: 0, b: 0, L: 0 };
      e.n++; e.r += r; e.g += g; e.b += b; e.L += L; bins.set(k, e);
    }
  }
  const floor = Math.max(6, sampled * 0.002);
  return [...bins.values()]
    .filter((e) => e.n >= floor)
    .map((e) => {
      const R = Math.round(e.r / e.n), G = Math.round(e.g / e.n), B = Math.round(e.b / e.n);
      const dark = 1 - e.L / e.n;                 // mais escuro pontua mais
      return { hex: hex(R, G, B), n: e.n, score: dark * Math.sqrt(e.n) };
    })
    .sort((a, b) => b.score - a.score).slice(0, max);
}

// ── extração ─────────────────────────────────────────────────────────────────
/** Trechos verticais contíguos de pixels que casam com a cor, numa coluna. */
function runs(img, x, rect, target, tol) {
  const out = [];
  let start = -1;
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    const i = (y * img.width + x) * 4;
    const hit = img.data[i + 3] > 128
      && dist(oklab(img.data[i], img.data[i + 1], img.data[i + 2]), target) < tol;
    if (hit && start < 0) start = y;
    else if (!hit && start >= 0) { out.push([start, y - 1]); start = -1; }
  }
  if (start >= 0) out.push([start, rect.y + rect.h - 1]);
  return out;
}

/**
 * Agrupa os trechos em componentes conectadas (trechos que se tocam entre
 * colunas vizinhas). É isso que separa a curva do lixo: o ponto colorido de um
 * tooltip, o quadradinho de uma legenda ou um respingo de marca d'água formam
 * componentes curtas; a curva forma uma que atravessa o gráfico.
 *
 * Descartar por extensão horizontal — e não por "esse ponto fugiu da média" —
 * preserva pico real, que em série de volume é o dado mais importante.
 */
function keepLongComponents(cols, minCols, tolY = 2) {
  const parent = [];
  const find = (a) => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
  const ids = cols.map((r) => new Array(r.length).fill(-1));

  for (let x = 0; x < cols.length; x++) {
    for (let r = 0; r < cols[x].length; r++) {
      const [a0, a1] = cols[x][r];
      let id = -1;
      if (x > 0) {
        cols[x - 1].forEach(([b0, b1], k) => {
          if (a0 > b1 + tolY || b0 > a1 + tolY) return;      // não se tocam
          if (id < 0) id = ids[x - 1][k]; else union(id, ids[x - 1][k]);
        });
      }
      if (id < 0) { id = parent.length; parent.push(id); }
      ids[x][r] = find(id);
    }
  }

  const ext = new Map();
  for (let x = 0; x < cols.length; x++) {
    for (const id of ids[x]) {
      const r = find(id), e = ext.get(r);
      if (e) { e[1] = x; } else ext.set(r, [x, x]);
    }
  }
  return cols.map((r, x) => r.filter((_, k) => {
    const e = ext.get(find(ids[x][k]));
    return e && e[1] - e[0] + 1 >= minCols;
  }));
}

/**
 * Segue a curva coluna a coluna. Depois de jogar fora as componentes curtas,
 * quando ainda sobra mais de um trecho na coluna (duas séries da mesma cor)
 * escolhe o mais próximo da coluna anterior.
 *
 * Vãos curtos — curva tampada por tooltip ou legenda — são interpolados, e o
 * total vai em `gaps` pra interface poder avisar quantos pontos são inventados.
 */
export function trace(img, rect, colorHex, { tol = 14, minSpan = 0.02, maxGap = 0.06 } = {}) {
  const target = oklab(...rgb(colorHex));
  let cols = [];
  for (let x = rect.x; x < rect.x + rect.w; x++) cols.push(runs(img, x, rect, target, tol));
  const px = (cc) => cc.reduce((s, r) => s + r.reduce((t, [a, b]) => t + (b - a + 1), 0), 0);
  const coloredPx = px(cols);                                  // antes de filtrar
  cols = keepLongComponents(cols, Math.max(3, Math.round(rect.w * minSpan)));
  const keptPx = px(cols);                                     // depois

  // A linha é a BORDA DE CIMA da região colorida (com preenchimento de área, o
  // resto pra baixo é o gradiente até a base). Segue essa borda + meia
  // espessura da linha — não o meio do trecho, que desceria pro preenchimento.
  // Espessura = mediana das alturas dos trechos finos.
  const hs = cols.flat().map(([a, b]) => b - a + 1).filter((h) => h <= 8).sort((a, b) => a - b);
  const half = ((hs[hs.length >> 1] || 3) / 2);
  const center = ([a, b]) => a + Math.min(half, (b - a) / 2);

  const ys = new Array(cols.length).fill(null);
  const seed = cols.findIndex((r) => r.length === 1);
  if (seed < 0) {
    cols.forEach((r, i) => { if (r.length) ys[i] = center(r[0]); });
    const filled = ys.filter((v) => v != null).length;
    return { ys, x0: rect.x, gaps: 0, seeded: false, diag: { filled, gaps: 0, missing: ys.length - filled, coloredPx, keptPx, maxJump: 1 } };
  }
  ys[seed] = center(cols[seed][0]);
  const sweep = (from, to, dir) => {
    let last = ys[from];
    for (let i = from + dir; dir > 0 ? i <= to : i >= to; i += dir) {
      const r = cols[i];
      if (!r.length) { ys[i] = null; continue; }
      const best = r.reduce((a, b) => (Math.abs(center(b) - last) < Math.abs(center(a) - last) ? b : a));
      ys[i] = center(best); last = ys[i];
    }
  };
  sweep(seed, cols.length - 1, 1);
  sweep(seed, 0, -1);

  // diagnóstico ANTES de interpolar: o que é dado real vs. inventado
  const filled = ys.filter((v) => v != null).length;
  let maxJump = 0;
  for (let i = 1; i < ys.length; i++) if (ys[i] != null && ys[i - 1] != null) maxJump = Math.max(maxJump, Math.abs(ys[i] - ys[i - 1]));

  let gaps = 0;
  const limite = Math.max(2, Math.round(cols.length * maxGap));
  for (let i = 0; i < ys.length; i++) {
    if (ys[i] != null) continue;
    let j = i; while (j < ys.length && ys[j] == null) j++;
    const a = ys[i - 1], b = ys[j], len = j - i;
    if (i > 0 && j < ys.length && len <= limite) {
      for (let k = i; k < j; k++) ys[k] = a + ((b - a) * (k - i + 1)) / (len + 1);
      gaps += len;
    }
    i = j - 1;
  }
  const missing = ys.filter((v) => v == null).length;
  return { ys, x0: rect.x, gaps, seeded: true, diag: { filled, gaps, missing, coloredPx, keptPx, maxJump: maxJump / rect.h } };
}

// ── NÍVEL 1: aderência do traço aos pixels ───────────────────────────────────
/**
 * Avalia se o traço é fiel aos pixels da imagem — SEM depender da calibração.
 * Pega captura de tooltip (cor errada → poucos pixels), traço saltando entre
 * coisas (maxJump alto) e cobertura baixa. NÃO valida se os valores em si estão
 * certos (isso é a calibração, nível 2).
 */
export function assessTrace(traced, rect) {
  const { filled, gaps, missing, coloredPx, keptPx, maxJump } = traced.diag;
  const total = traced.ys.length;
  const coverage = filled / total;                     // % de colunas com dado real
  const interpolated = gaps / total;                   // % inventado sob tooltip/legenda
  const discarded = coloredPx ? 1 - keptPx / coloredPx : 0;  // % de pixel jogado fora (tooltip etc.)
  const notes = [];
  let verdict = 'ok';
  // tokens ASCII (batem com as classes CSS e o mapa de rótulos da interface)
  if (!traced.seeded) { verdict = 'ruim'; notes.push('nenhuma coluna sem ambiguidade — cor ou área provavelmente erradas'); }
  if (coverage < 0.8) { verdict = 'ruim'; notes.push(`só ${Math.round(coverage * 100)}% das colunas têm dado real`); }
  else if (coverage < 0.92) { verdict = verdict === 'ruim' ? verdict : 'atencao'; notes.push(`${Math.round(coverage * 100)}% de cobertura`); }
  if (interpolated > 0.15) { verdict = verdict === 'ruim' ? verdict : 'atencao'; notes.push(`${Math.round(interpolated * 100)}% interpolado`); }
  if (missing > total * 0.04) notes.push(`${missing} colunas sem ponto`);
  // salto brusco entre colunas vizinhas: sinal de traço pulando pra outra coisa
  if (maxJump > 0.5) { verdict = 'ruim'; notes.push(`salto de ${Math.round(maxJump * 100)}% da altura entre colunas vizinhas — traço pulou (tooltip/2ª série?)`); }
  else if (maxJump > 0.3) { verdict = verdict === 'ruim' ? verdict : 'atencao'; notes.push(`salto de ${Math.round(maxJump * 100)}% entre colunas`); }
  return { verdict, coverage, interpolated, discarded, maxJump, notes };
}

// ── NÍVEL 2: calibração pelas linhas de grade ────────────────────────────────
/**
 * Acha as linhas de grade horizontais dentro da área de plotagem. Grade é uma
 * linha fina que atravessa TODA a largura; a curva ocupa ~1 coluna por altura.
 * Então conta, por linha, quantas colunas são um máximo/mínimo vertical local
 * de luminância — grade pontua ~largura inteira, a curva pontua ~1.
 */
export function detectGridlines(img, rect, { step = 2, gap = 3, thresh = 0.45 } = {}) {
  const lum = (x, y) => { const i = (y * img.width + x) * 4; return 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]; };
  const cols = Math.ceil(rect.w / step);
  const score = [];
  for (let y = rect.y + gap; y < rect.y + rect.h - gap; y++) {
    let up = 0, down = 0;
    for (let x = rect.x; x < rect.x + rect.w; x += step) {
      const c = lum(x, y), a = lum(x, y - gap), b = lum(x, y + gap);
      if (c > a + 6 && c > b + 6) up++;         // linha clara sobre fundo escuro
      if (c < a - 6 && c < b - 6) down++;        // linha escura sobre fundo claro
    }
    score[y] = Math.max(up, down) / cols;
  }
  // picos acima do limiar, com supressão de vizinhos (a linha tem 1-2px);
  // tracejado pontua menos que linha cheia — 0.30 pega os dois (via opção)
  const found = [];
  for (let y = rect.y + gap; y < rect.y + rect.h - gap; y++) {
    if (score[y] < thresh) continue;
    if (found.length && y - found.at(-1) < 6) { if (score[y] > score[found.at(-1)]) found[found.length - 1] = y; continue; }
    found.push(y);
  }
  return found;
}

/**
 * Dada a calibração (valor no topo/base da área) e as linhas de grade achadas,
 * devolve o valor implícito em cada grade — o usuário confere contra os rótulos
 * da imagem. Se as grades não estão igualmente espaçadas, o eixo pode ser
 * não-linear (log) ou a área de plotagem está torta: avisa.
 */
export function checkCalibration(gridYs, rect, yTop, yBottom) {
  const px2val = (y) => yTop + ((y - rect.y) / rect.h) * (yBottom - yTop);
  const values = gridYs.map((y) => ({ y, value: px2val(y) }));
  const warn = [];
  if (gridYs.length >= 3) {
    const gaps = gridYs.slice(1).map((y, i) => y - gridYs[i]);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const dev = Math.max(...gaps.map((g) => Math.abs(g - mean))) / mean;
    if (dev > 0.15) warn.push(`grades desiguais (${Math.round(dev * 100)}% de variação) — eixo pode ser log, ou a área de plotagem não bate com as grades`);
  }
  return { values, warn };
}

/**
 * Lê um valor de calibração como o usuário digita, casando com o rótulo do eixo:
 * "1.5b", "1,5 bi", "688.2B", "2.51T", "900m", "US$ 1.500", "0". Sufixo de
 * escala: k/mil=10³, m/mi=10⁶, b/bi=10⁹, t/tri=10¹². Devolve NaN se não der.
 */
export function parseValue(raw) {
  if (raw == null) return NaN;
  let s = String(raw).trim().toLowerCase().replace(/us\$|r\$|\$|%|\s/g, '');
  if (!s) return NaN;
  const m = s.match(/^(-?[\d.,]+)(tri|t|bi|b|mil|mi|mm|m|k)?$/);
  if (!m) return NaN;
  let n = m[1];
  const c = n.lastIndexOf(','), d = n.lastIndexOf('.');
  if (c >= 0 && d >= 0) n = c > d ? n.replace(/\./g, '').replace(',', '.') : n.replace(/,/g, '');
  else if (c >= 0) n = n.split(',').length > 2 ? n.replace(/,/g, '') : n.replace(',', '.');
  else if (d >= 0) { const p = n.split('.'); if (p.length > 2 || (/^\d{3}$/.test(p[1]) && p[0] !== '0' && p[0] !== '')) n = p.join(''); }
  const v = Number(n);
  if (!Number.isFinite(v)) return NaN;
  const u = m[2];
  const mult = (u === 'tri' || u === 't') ? 1e12 : (u === 'bi' || u === 'b') ? 1e9
    : (u === 'mi' || u === 'mm' || u === 'm') ? 1e6 : (u === 'mil' || u === 'k') ? 1e3 : 1;
  return v * mult;
}

/** Reduz as ~N colunas a `samples` pontos (média do balde) e calibra pra valor. */
export function toSeries(ys, { samples = 80, rect, yTop, yBottom, invert = false }) {
  const px2val = (py) => {
    const f = (py - rect.y) / rect.h;               // 0 = topo, 1 = base
    return invert ? yBottom + f * (yTop - yBottom) : yTop + f * (yBottom - yTop);
  };
  const n = Math.min(samples, ys.length);
  const data = [];
  for (let k = 0; k < n; k++) {
    const a = Math.floor((k * ys.length) / n), b = Math.max(a + 1, Math.floor(((k + 1) * ys.length) / n));
    const vals = ys.slice(a, b).filter((v) => v != null);
    data.push(vals.length ? px2val(vals.reduce((s, v) => s + v, 0) / vals.length) : null);
  }
  return data;
}

// ── rótulos do eixo X ────────────────────────────────────────────────────────
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MES_EN = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };

/** Aceita "2025", "jan/2025", "2025-01", "01/2025", "23/07/2023", "Jul 2024". */
export function parseX(s) {
  s = String(s).trim().toLowerCase();
  if (/^\d{4}$/.test(s)) return { kind: 'year', v: +s };
  let m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (m) return { kind: 'date', v: Date.UTC(+m[1], +m[2] - 1, +(m[3] || 1)) };
  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (m) return { kind: 'date', v: Date.UTC(+m[3], +m[2] - 1, +m[1]) };
  m = s.match(/^(\d{1,2})[/.](\d{4})$/);
  if (m) return { kind: 'date', v: Date.UTC(+m[2], +m[1] - 1, 1) };
  m = s.match(/^([a-zç]{3,4})[\s/.-]*(\d{2,4})$/);
  if (m) {
    const i = MES.indexOf(m[1].slice(0, 3)) >= 0 ? MES.indexOf(m[1].slice(0, 3)) : MES_EN[m[1]];
    if (i != null && i >= 0) {
      const y = +m[2] < 100 ? 2000 + +m[2] : +m[2];
      return { kind: 'date', v: Date.UTC(y, i, 1) };
    }
  }
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? { kind: 'num', v: n } : null;
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);   // mês com inicial maiúscula
const fmtDate = (ms) => {
  const d = new Date(ms);
  return `${cap(MES[d.getUTCMonth()])}/${String(d.getUTCFullYear()).slice(2)}`;
};

const meses = (ms) => { const d = new Date(ms); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
const deMeses = (m) => Date.UTC(Math.floor(m / 12), m % 12, 1);

/** N rótulos distribuídos entre início e fim. Cai pra vazio se não der pra ler. */
export function makeLabels(startRaw, endRaw, n) {
  const a = parseX(startRaw), b = parseX(endRaw);
  if (!a || !b || a.kind !== b.kind) return Array.from({ length: n }, (_, i) => (i === 0 ? String(startRaw) : i === n - 1 ? String(endRaw) : ''));
  // data interpola em MESES, não em milissegundos: mês tem tamanho diferente e
  // a interpolação linear em ms cai no meio do mês, gerando rótulo torto
  const m0 = a.kind === 'date' ? meses(a.v) : 0, m1 = a.kind === 'date' ? meses(b.v) : 0;
  return Array.from({ length: n }, (_, i) => {
    const f = n === 1 ? 0 : i / (n - 1);
    if (a.kind === 'date') return fmtDate(deMeses(Math.round(m0 + (m1 - m0) * f)));
    const v = a.v + (b.v - a.v) * f;
    return a.kind === 'year' ? String(Math.round(v)) : String(+v.toFixed(2));
  });
}
