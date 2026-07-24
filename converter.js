/* Conversor imagem -> spec: pixels dão os DADOS, o LLM dá só o TEXTO.
 *
 * O LLM lê o que pixel não lê (título, valores impressos nos ticks do eixo,
 * datas do eixo X) e o extrator por pixel (extrair.js) mede o que LLM não mede
 * (a posição exata da curva, coluna a coluna). A calibração sai de âncoras
 * DETERMINISTAS — linhas de grade ou as bandas de texto dos rótulos do eixo —
 * casadas com os valores que o LLM leu, via regressão linear.
 *
 * Puro: recebe ImageData ({width,height,data}) + metadados, devolve spec.
 * Roda no browser (canvas) e em Node (teste-precisao.mjs decodifica o PNG).
 */
import {
  suggestColors, suggestGrayColors, trace, assessTrace, detectGridlines,
  parseValue, makeLabels, oklab, rgb,
} from './extrair.js';

// ── bandas de texto na margem do eixo ────────────────────────────────────────
/**
 * Acha as linhas centrais dos rótulos do eixo Y: na faixa vertical ao lado da
 * área de plotagem, cada rótulo ("$1.5b") é uma banda de linhas com "tinta"
 * (pixels que destoam do fundo). Serve de âncora quando o gráfico não tem
 * linhas de grade (ex.: ASXN). Altura mínima de 4 linhas descarta gridline
 * que invade a margem.
 */
export function detectTickBands(img, rect) {
  const x0 = Math.max(0, Math.round(rect.x)), x1 = Math.min(img.width, Math.round(rect.x + rect.w));
  const y0 = Math.max(0, Math.round(rect.y)), y1 = Math.min(img.height, Math.round(rect.y + rect.h));
  if (x1 - x0 < 4 || y1 - y0 < 4) return [];
  const lum = (x, y) => { const i = (y * img.width + x) * 4; return 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]; };
  // fundo = mediana da luminância da região
  const sample = [];
  for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) sample.push(lum(x, y));
  sample.sort((a, b) => a - b);
  const bg = sample[sample.length >> 1] ?? 0;

  const ink = [];
  for (let y = y0; y < y1; y++) {
    let n = 0;
    for (let x = x0; x < x1; x++) if (Math.abs(lum(x, y) - bg) > 40) n++;
    ink.push(n);
  }
  const bands = [];
  let start = -1, end = -1;
  const close = () => {
    if (start >= 0 && end - start + 1 >= 4) {
      let s = 0, w = 0;
      for (let k = start; k <= end; k++) { s += (y0 + k) * ink[k]; w += ink[k]; }
      bands.push(s / w);
    }
    start = -1;
  };
  for (let i = 0; i < ink.length; i++) {
    if (ink[i] >= 2) { if (start < 0) start = i; end = i; }
    else if (start >= 0 && i - end > 2) close();
  }
  close();
  return bands;
}

// ── regressão linear valor ~ linha(px) ───────────────────────────────────────
function linfit(rows, vals) {
  const n = rows.length;
  const mx = rows.reduce((a, b) => a + b, 0) / n, my = vals.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (rows[i] - mx) ** 2; sxy += (rows[i] - mx) * (vals[i] - my); }
  const slope = sxy / sxx, intercept = my - slope * mx;
  const at = (row) => intercept + slope * row;
  const maxResid = Math.max(...rows.map((r, i) => Math.abs(at(r) - vals[i])));
  return { slope, intercept, at, maxResid, rowOf: (v) => (v - intercept) / slope };
}

const dOK = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const round4 = (v) => {
  if (v === 0 || !Number.isFinite(v)) return v;
  const m = 10 ** (3 - Math.floor(Math.log10(Math.abs(v))));
  return Math.round(v * m) / m;
};

// ── pipeline ─────────────────────────────────────────────────────────────────
/**
 * meta (do LLM, modo "pixels"):
 *   { type, title, subtitle, source, yTicks: ["$1.5b",...], axisSide,
 *     xStart, xEnd, series: [{name, colorHint?}], y: {format, prefix}, plotRect }
 * Devolve { spec, plotRect, report }.
 */
export function buildSpecFromImage(img, meta) {
  const W = img.width, H = img.height;
  const pr = meta.plotRect || { x: 0.08, y: 0.1, w: 0.85, h: 0.75 };
  // área de busca: plotRect do LLM com folga (o LLM erra alguns %)
  const mx = Math.round(W * 0.03), my = Math.round(H * 0.03);
  const rx = Math.max(0, Math.round(pr.x * W) - mx), ry = Math.max(0, Math.round(pr.y * H) - my);
  const rect = {
    x: rx, y: ry,
    w: Math.min(W - rx, Math.round(pr.w * W) + 2 * mx),
    h: Math.min(H - ry, Math.round(pr.h * H) + 2 * my),
  };

  // ── calibração Y: âncoras deterministas ↔ valores lidos pelo LLM ──
  const ticks = (meta.yTicks || []).map(parseValue);
  if (ticks.length < 2 || ticks.some(Number.isNaN)) {
    throw new Error('yTicks ilegíveis: ' + JSON.stringify(meta.yTicks));
  }
  // limiar 0.30: pega gridline tracejada (~40% de máximos locais) além da cheia
  const gridYs = detectGridlines(img, rect, { thresh: 0.30 });
  // margem dos rótulos: o LLM erra a borda do plot em alguns % — varre 3
  // larguras (borda do LLM, +3% e +6% pra dentro) e a pontuação decide.
  // Janela desce 6% além da base: o rótulo "0" senta NO eixo.
  const prx = pr.x * W, prw = pr.w * W;
  const bandSets = [0, 0.03, 0.06].map((inset) => {
    const m = meta.axisSide === 'right'
      ? { x: prx + prw + 2 - inset * W, w: W - prx - prw - 2 + inset * W }
      : { x: 0, w: prx - 2 + inset * W };
    return detectTickBands(img, { ...m, y: pr.y * H - H * 0.02, h: pr.h * H + H * 0.08 });
  });

  // Ticks de eixo são igualmente espaçados em VALOR ⇒ as linhas deles são
  // igualmente espaçadas em PIXEL. Então a calibração vira uma busca global:
  // a progressão aritmética (PA) de n posições que mais casa com as linhas
  // detectadas — grades E bandas juntas. Isso mata as duas pragas de uma vez:
  // banda intrusa (título/rótulo do X) não cabe na PA, e pareamento deslocado
  // de 1 tick prevê uma linha onde nada foi detectado. Linha de grade vale
  // mais que banda de rótulo (rótulo às vezes é desenhado deslocado da linha
  // dele — vimos +7px no CoinMarketCap e +9px num rótulo de topo com clamp).
  const n = ticks.length;
  const faixaTicks = Math.abs(ticks[0] - ticks[n - 1]);
  const allRows = [];
  for (const rows of [gridYs, ...bandSets]) {
    for (const r of rows) if (!allRows.some((a) => Math.abs(a - r) < 3)) allRows.push(r);
  }
  const isGrid = (r) => gridYs.some((g) => Math.abs(g - r) < 3);
  let bestAP = null;
  for (const a of allRows) {
    for (const b of allRows) {
      if (b <= a) continue;
      for (let k = 1; k < n; k++) {              // a e b separados por k passos da PA
        const step = (b - a) / k;
        if (step < 8 || step * (n - 1) > H) continue;
        for (let s = 0; s + k < n; s++) {        // a na posição s da PA
          const start = a - s * step;
          let score = 0; const matched = [];
          for (let t = 0; t < n; t++) {
            const p = start + t * step;
            // tick previsto fora da imagem = hipótese impossível (é o que
            // diferencia o pareamento certo do deslocado em 1 tick)
            if (p < -6 || p > H + 6) { score = -Infinity; break; }
            let dr = Infinity, rr = null;
            for (const r of allRows) { const d = Math.abs(r - p); if (d < dr) { dr = d; rr = r; } }
            if (dr <= 3) { score += isGrid(rr) ? 1.2 : 1; matched.push([rr, ticks[t]]); }
            else if (dr <= 10) score += 0.3;     // quase: rótulo desenhado deslocado da linha
          }
          if (matched.length >= 3 && (!bestAP || score > bestAP.score)) bestAP = { score, matched };
        }
      }
    }
  }
  const report = { notas: [] };
  let fit, kind, anchorRows;
  if (bestAP) {
    anchorRows = bestAP.matched.map(([r]) => r);
    fit = linfit(anchorRows, bestAP.matched.map(([, v]) => v));
    const nGrid = anchorRows.filter(isGrid).length;
    kind = `PA ${anchorRows.length}/${n} ticks (${nGrid} grade, ${anchorRows.length - nGrid} rótulo)`;
  } else {
    // fallback: confia nas bordas do plotRect do LLM (precisão de LLM, avisa)
    fit = linfit([pr.y * H, (pr.y + pr.h) * H], [ticks[0], ticks[n - 1]]);
    kind = 'plotRect do LLM (aproximado)'; anchorRows = [];
    report.notas.push(`sem âncoras (grades: ${gridYs.length}, rótulos: ${bandSets.map((b) => b.length).join('/')}, ticks: ${n}) — calibração aproximada`);
  }

  // a calibração é precisa — rederiva a janela VERTICAL do traço a partir dela
  // (o plotRect do LLM erra; cortar o pé da curva perde os primeiros meses)
  if (anchorRows.length) {
    const rowA = fit.rowOf(Math.max(...ticks)), rowB = fit.rowOf(Math.min(...ticks));
    const padY = Math.round(H * 0.015);
    const ny0 = Math.max(0, Math.min(rect.y, Math.floor(Math.min(rowA, rowB) - padY)));
    const ny1 = Math.min(H, Math.max(rect.y + rect.h, Math.ceil(Math.max(rowA, rowB) + padY)));
    rect.y = ny0; rect.h = ny1 - ny0;
  }

  // ── cor + traço da(s) série(s) ──
  // sem cor (gráfico preto-e-branco): cai pra luminância — pior sinal, mas
  // melhor que recusar o gráfico inteiro
  const colorCands = suggestColors(img, rect);
  const cands = colorCands.length ? colorCands : suggestGrayColors(img, rect);
  if (!cands.length) throw new Error('nenhuma cor (nem cinza) de série na área de plotagem');
  const wanted = Math.max(1, meta.series?.length || 1);
  let chosen;
  if (wanted === 1) chosen = [cands[0].hex];
  else if (meta.series.every((s) => /^#[0-9a-f]{6}$/i.test(s.colorHint || ''))) {
    chosen = meta.series.map((s) => {
      const t = oklab(...rgb(s.colorHint));
      return cands.reduce((a, b) => (dOK(oklab(...rgb(a.hex)), t) < dOK(oklab(...rgb(b.hex)), t) ? a : b)).hex;
    });
  } else chosen = cands.slice(0, wanted).map((c) => c.hex);

  const results = chosen.map((hex) => {
    const t = trace(img, rect, hex);
    return { hex, t, q: assessTrace(t, rect) };
  });

  // extensão real dos dados (1ª/última coluna com curva, em qualquer série)
  let first = Infinity, last = -Infinity;
  for (const { t } of results) {
    const a = t.ys.findIndex((v) => v != null);
    if (a < 0) continue;
    let b = t.ys.length - 1; while (b > a && t.ys[b] == null) b--;
    first = Math.min(first, a); last = Math.max(last, b);
  }
  if (!Number.isFinite(first) || last - first < 10) throw new Error('curva não encontrada nos pixels');

  // ── amostra + calibra ──
  // média do balde, EXCETO quando o balde é um EXTREMO LOCAL da série (ápice
  // acima dos vizinhos → máx; vale → mín). Média pura achata pico fino (vimos
  // -14% no pico de volume); extremo cego pega o lado errado em encosta íngreme.
  const samples = Math.max(40, Math.min(180, Math.round((last - first + 1) / 6)));
  const amostrar = (ys) => {
    const total = ys.length, stats = [];
    for (let k = 0; k < samples; k++) {
      const a = Math.floor((k * total) / samples), b = Math.max(a + 1, Math.floor(((k + 1) * total) / samples));
      const vals = ys.slice(a, b).filter((v) => v != null).map((py) => fit.at(py));
      stats.push(vals.length ? {
        mean: vals.reduce((s, v) => s + v, 0) / vals.length,
        mn: Math.min(...vals), mx: Math.max(...vals),
      } : null);
    }
    const lim = faixaTicks * 0.02;
    return stats.map((st, k) => {
      if (!st) return null;
      const L = stats[k - 1], R = stats[k + 1];
      const pico = st.mx - st.mean > lim && (!L || st.mx >= L.mx) && (!R || st.mx >= R.mx);
      const vale = st.mean - st.mn > lim && (!L || st.mn <= L.mn) && (!R || st.mn <= R.mn);
      return pico && !vale ? st.mx : vale && !pico ? st.mn : st.mean;
    });
  };
  const series = results.map(({ t }, i) => ({
    name: meta.series?.[i]?.name || `série ${i + 1}`,
    data: amostrar(t.ys.slice(first, last + 1)).map((v) => (v == null ? null : round4(v))),
  }));

  // eixo: dos ticks lidos; estica só se o dado passar deles DE VERDADE
  // (>0.5% da faixa — ruído de meia-linha de pixel não conta)
  const all = series.flatMap((s) => s.data).filter((v) => v != null);
  const faixa = Math.max(...ticks) - Math.min(...ticks);
  let yMin = Math.min(...ticks), yMax = Math.max(...ticks);
  if (Math.min(...all) < yMin - faixa * 0.005) yMin = Math.min(...all);
  if (Math.max(...all) > yMax + faixa * 0.005) yMax = Math.max(...all);

  const spec = {
    type: meta.type === 'area' ? 'area' : 'line',
    title: meta.title || '', subtitle: meta.subtitle || '', source: meta.source || '',
    labels: makeLabels(meta.xStart ?? '', meta.xEnd ?? '', samples),
    series,
    y: { ...(meta.y || {}), min: yMin, max: yMax },
    x: { every: Math.ceil(samples / 8) },
  };

  // plotRect da sobreposição, ancorado em VALOR: como spec.y.min/max entram
  // exatos no domínio do renderer, o retângulo [1ª col..última col] ×
  // [linha(yMax)..linha(yMin)] da imagem casa 1:1 com a área de plotagem
  const plotRect = {
    x: (rect.x + first) / W,
    w: (last - first) / W,
    y: fit.rowOf(yMax) / H,
    h: (fit.rowOf(yMin) - fit.rowOf(yMax)) / H,
  };

  report.calibracao = {
    ancoras: kind, n: anchorRows.length,
    linhas: anchorRows.map((r) => Math.round(r)),
    residuoPct: anchorRows.length >= 3 ? +(fit.maxResid / (yMax - yMin) * 100).toFixed(2) : null,
  };
  report.pontos = samples;
  report.series = results.map(({ hex, q }) => ({
    cor: hex, verdict: q.verdict,
    cobertura: +(q.coverage * 100).toFixed(1), interpolado: +(q.interpolated * 100).toFixed(1),
    notas: q.notes,
  }));
  return { spec, plotRect, report };
}
