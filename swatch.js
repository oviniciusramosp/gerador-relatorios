/* Swatch de cor — COMPONENTE ÚNICO, reutilizável pelo app inteiro (gráficos + diagramação).
 *
 *   openSwatchPop(anchor, pick, current, opts)
 *     anchor  — elemento que ancora o popover (o botão de cor)
 *     pick    — callback(cor) ao vivo (chip/nomeada/HEX/opacidade). Contrato: `cor` sai como
 *               "#RRGGBB" em 100% de opacidade e "rgba(r,g,b,a)" abaixo disso.
 *     current — cor atual (destaca o chip/nomeada certos). Aceita "#RRGGBB"/"#RGB" (opacidade
 *               assumida 100%) OU "rgba(r,g,b,a)"/"rgb(r,g,b)" de entrada — nesse caso o hex vira
 *               o destaque e o alpha inicializa o slider.
 *     opts    — { opacity:false } esconde a seção de Opacidade inteira (pra host que já tem seu
 *               próprio controle, ex. o watermark do gráfico).
 *               { paper:true } preview/HEX com base branca sob a cor com alpha (como o papel
 *               do PDF) em vez do xadrez — use no fundo do Callout. Default: opacity=true.
 *               { allowNone:true } botão "Nenhum" no topo — pick(false) e fecha. Use em
 *               highlight (hiliteColor) pra remover o fundo da seleção. noneLabel opcional.
 *               { docColors:{ text?:string[], bg?:string[] } } cores usadas no documento
 *               (seção "Nesse documento", expandable aberto por padrão). Hosts sem doc
 *               (gráficos, catálogo) simplesmente omitem.
 *
 * Fluxo: clicar nomeada/complementar/documento SELECIONA a cor (atualiza HEX + .on + preview)
 * e aplica via pick com a opacidade atual do slider — NÃO fecha o popover, pra o slider
 * modular a cor recém-escolhida. Fecha com Enter no HEX ou clique fora.
 *
 * Seções (expandable): (1) Nesse documento (open se houver cores), (2) Cores nomeadas
 * (fechado), (3) Complementares (fechado). Fixas: HEX (texto + <input type=color> nativo
 * sob o preview) + Opacidade. O nativo só escolhe matiz RGB; alpha continua no slider.
 * O CSS é injetado uma vez pelo próprio módulo — nenhum host precisa declarar nada. */

import { enhanceRange } from './range-snap.js';

export const NAMED_COLORS = [
  { name: 'Paradigma Aqua', hex: '#29E899' },
  { name: 'Bitcoin Orange', hex: '#F7931A' },
  { name: 'Strategy Orange', hex: '#FF6A00' },
  { name: 'ETH Purple', hex: '#627EEA' },
  { name: 'SOL Purple', hex: '#9945FF' },
  { name: 'HYPE Green', hex: '#97FCE4' },
  { name: 'XRP Grey', hex: '#23292F' },
];
// complementares: 11 famílias × (clara, padrão, escura). Ordem fixa no arco
// (não sort por matiz) — a grade tem 9 colunas = 3 famílias por linha
// (clara|padrão|escura × 3), ocupando a largura do popover.
const SWATCH_VARIANTS = ['clara', 'padrão', 'escura'];
const SWATCH_FAMILIES = [
  { name: 'Vermelha',     colors: ['#FCA5A5', '#EF4444', '#9F1239'] },
  { name: 'Laranja',      colors: ['#FDBA74', '#F97316', '#9A3412'] },
  { name: 'Amarela',      colors: ['#FDE68A', '#EAB308', '#A16207'] },
  { name: 'Verde limão',  colors: ['#D9F99D', '#84CC16', '#3F6212'] },
  { name: 'Verde',        colors: ['#86EFAC', '#16A34A', '#14532D'] },
  { name: 'Azul',         colors: ['#93C5FD', '#2563EB', '#1E3A8A'] },
  { name: 'Roxo',         colors: ['#C4B5FD', '#7C3AED', '#4C1D95'] },
  { name: 'Lilás',        colors: ['#E9D5FF', '#C084FC', '#86198F'] },
  { name: 'Rosa',         colors: ['#FBCFE8', '#EC4899', '#9D174D'] },
  { name: 'Cinza',        colors: ['#E2E8F0', '#94A3B8', '#334155'] },
  { name: 'Preto/branco', colors: ['#FFFFFF', '#1F2937', '#000000'] },
];

export const normHex = (v) => {
  let s = String(v).trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(s)) s = s.split('').map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/i.test(s) ? '#' + s.toUpperCase() : null;
};

// Parser de cor pra opacidade — lógica pura (string→número), sem `document`, testável em node puro.
// Aceita hex ("#RRGGBB"/"#RGB", com ou sem "#") OU "rgb(r,g,b)"/"rgba(r,g,b,a)". Retorna
// { hex, alpha } (alpha 0..1) pra inicializar o popover (destaque do chip + valor do slider),
// ou null se `v` não for uma cor reconhecível (mesmo caso em que normHex já retornava null).
const RGBA_RE = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/i;
export function parseColor(v) {
  const s = String(v ?? '').trim();
  const m = RGBA_RE.exec(s);
  if (m) {
    const [r, g, b] = [m[1], m[2], m[3]].map((n) => Math.max(0, Math.min(255, +n)));
    const hex = '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase();
    const alpha = m[4] === undefined ? 1 : Math.max(0, Math.min(1, +m[4]));
    return { hex, alpha };
  }
  const hex = normHex(s);
  return hex ? { hex, alpha: 1 } : null;
}

// Monta o retorno de pick(): hex puro em 100% (contrato antigo intacto — nenhum consumidor
// quebra), "rgba(r,g,b,a)" abaixo disso. `alpha` em 0..1; arredonda pra 2 casas só pra manter
// a string limpa (o slider já entrega múltiplos de 0.01, isso só protege contra `current` externo
// com mais casas).
export function withAlpha(hex, alpha) {
  const h = normHex(hex) || '#000000';
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 100) / 100;
  if (a >= 1) return h;
  const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/** Cores ignoradas ao varrer HTML/CSS (não são “cor do documento”). */
const SKIP_COLOR_WORDS = new Set([
  'transparent', 'inherit', 'initial', 'unset', 'currentcolor', 'none',
]);

/**
 * Extrai hex de declarações color / background(-color) e <font color> em HTML.
 * Puro (sem DOM) — testável em node.
 * @param {string} html
 * @param {{ text?:Set<string>, bg?:Set<string> }} buckets  — muta Sets de hex
 */
export function harvestColorsFromHtml(html, buckets = {}) {
  if (!html || typeof html !== 'string') return buckets;
  const text = buckets.text || (buckets.text = new Set());
  const bg = buckets.bg || (buckets.bg = new Set());
  const add = (set, raw) => {
    if (raw == null) return;
    const s = String(raw).trim();
    if (!s || SKIP_COLOR_WORDS.has(s.toLowerCase())) return;
    // ignora gradientes / vars / urls
    if (/gradient\s*\(|url\s*\(|var\s*\(/i.test(s)) return;
    const p = parseColor(s);
    if (p?.hex) set.add(p.hex);
  };
  let m;
  const reColor = /(?:^|[;"'\s{])color\s*:\s*([^;"'}]+)/gi;
  const reBg = /background(?:-color)?\s*:\s*([^;"'}]+)/gi;
  const reFont = /<font\b[^>]*\bcolor\s*=\s*["']?([^"'\s>]+)/gi;
  while ((m = reColor.exec(html))) add(text, m[1]);
  while ((m = reBg.exec(html))) add(bg, m[1]);
  while ((m = reFont.exec(html))) add(text, m[1]);
  return buckets;
}

/**
 * Normaliza opts.docColors → { text: hex[], bg: hex[] } únicos e ordenados.
 * Aceita string[] (tudo em text) ou { text, bg }.
 */
export function normalizeDocColors(raw) {
  const text = new Set();
  const bg = new Set();
  const add = (set, list) => {
    if (!list) return;
    const arr = Array.isArray(list) ? list : [list];
    for (const c of arr) {
      const p = parseColor(c);
      if (p?.hex) set.add(p.hex);
    }
  };
  if (Array.isArray(raw)) add(text, raw);
  else if (raw && typeof raw === 'object') {
    add(text, raw.text);
    add(bg, raw.bg);
  }
  const sortHex = (a, b) => a.localeCompare(b);
  return { text: [...text].sort(sortHex), bg: [...bg].sort(sortHex) };
}

/** Expandable do popover (details nativo). open=true inicia aberto. */
function makeExpandable(label, { open = false } = {}) {
  const det = document.createElement('details');
  det.className = 'sp-det';
  if (open) det.open = true;
  const sum = document.createElement('summary');
  sum.className = 'sp-det-sum';
  const chev = document.createElement('span');
  chev.className = 'sp-det-chev';
  chev.setAttribute('aria-hidden', 'true');
  const lab = document.createElement('span');
  lab.className = 'sp-label';
  lab.textContent = label;
  sum.append(chev, lab);
  const body = document.createElement('div');
  body.className = 'sp-det-body';
  det.append(sum, body);
  return { det, body };
}

let swatchPop = null;
export function openSwatchPop(anchor, pick, current, opts) {
  closeSwatchPop();
  const showOpacity = !(opts && opts.opacity === false);
  const paperBase = !!(opts && opts.paper); // base branca sob alpha (papel do PDF)
  const allowNone = !!(opts && opts.allowNone);
  const noneLabel = (opts && opts.noneLabel) || 'Nenhum';
  const docColors = normalizeDocColors(opts && opts.docColors);
  const hasDoc = docColors.text.length > 0 || docColors.bg.length > 0;
  // current === false | 'false' | 'transparent' | 'none' → sem cor (ex.: highlight desligado)
  const isNoneCurrent = current === false || current === 'false' || current === 'transparent'
    || current === 'none' || current == null || current === '';
  const parsed = isNoneCurrent ? null : parseColor(current);
  // selectedHex = matiz em edição (muda ao clicar nomeada/complementar/HEX válido)
  let selectedHex = parsed ? parsed.hex : null;
  let alpha = parsed ? parsed.alpha : 1;   // 0..1 — só o slider de Opacidade muda isso
  let noneOn = allowNone && !selectedHex; // "Nenhum" ativo se não há cor atual
  swatchPop = document.createElement('div');
  swatchPop.className = 'swatch-pop' + (paperBase ? ' paper-base' : '');

  // refs preenchidos abaixo (selectColor precisa de inp/colorInp/paintPreview/markOn)
  let inp, colorInp, paintPreview, markOn, noneBtn;

  /** type=color exige #rrggbb minúsculo; invalid/empty → fallback pro nativo não quebrar. */
  const toColorInputValue = (hex) => {
    const h = normHex(hex);
    return h ? h.toLowerCase() : '#000000';
  };

  const markNone = (on) => {
    noneOn = !!on;
    if (noneBtn) noneBtn.classList.toggle('on', noneOn);
  };

  /** Seleciona matiz: atualiza HEX + nativo + .on + preview; aplica com alpha atual; NÃO fecha. */
  const selectColor = (hex, { close = false } = {}) => {
    const h = normHex(hex);
    if (!h) return;
    selectedHex = h;
    markNone(false);
    if (inp) {
      inp.value = h;
      inp.classList.remove('bad');
    }
    if (colorInp) colorInp.value = toColorInputValue(h);
    markOn?.(h);
    paintPreview?.();
    pick(withAlpha(h, alpha));
    if (close) closeSwatchPop();
  };

  const pickNone = () => {
    selectedHex = null;
    markNone(true);
    markOn?.(null);
    if (inp) { inp.value = ''; inp.classList.remove('bad'); }
    paintPreview?.();
    pick(false);
    closeSwatchPop();
  };

  const appendChip = (parent, hex, title) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'sp-chip'; b.style.background = hex;
    b.dataset.hex = normHex(hex) || hex;
    b.title = title || hex;
    if (selectedHex === normHex(hex)) b.classList.add('on');
    b.onclick = () => selectColor(hex);
    parent.append(b);
  };

  // ── 0) Nenhum (só com allowNone — ex.: remover highlight) ─────────────────
  if (allowNone) {
    noneBtn = document.createElement('button');
    noneBtn.type = 'button';
    noneBtn.className = 'sp-none' + (noneOn ? ' on' : '');
    noneBtn.setAttribute('aria-pressed', String(noneOn));
    noneBtn.title = 'Sem cor / remover';
    noneBtn.innerHTML = '<span class="sp-none-ico" aria-hidden="true">'
      + '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">'
      + '<circle cx="8" cy="8" r="5.2"/><path d="M4.2 11.8L11.8 4.2"/></svg></span>'
      + `<span>${noneLabel}</span>`;
    noneBtn.addEventListener('mousedown', (e) => e.preventDefault()); // não rouba seleção do texto
    noneBtn.onclick = () => pickNone();
    swatchPop.append(noneBtn);
  }

  // ── 1) Nesse documento (aberto se houver cores) ───────────────────────────
  if (hasDoc) {
    const { det, body } = makeExpandable('Nesse documento', { open: true });
    const addGroup = (label, hexes) => {
      if (!hexes.length) return;
      const g = document.createElement('div');
      g.className = 'sp-docgroup';
      const lab = document.createElement('div');
      lab.className = 'sp-doclab';
      lab.textContent = label;
      const row = document.createElement('div');
      row.className = 'sp-docrow';
      for (const hex of hexes) appendChip(row, hex, `${label} · ${hex}`);
      g.append(lab, row);
      body.append(g);
    };
    addGroup('Texto', docColors.text);
    addGroup('Fundo', docColors.bg);
    swatchPop.append(det);
  }

  // ── 2) Cores nomeadas (fechado por padrão) ────────────────────────────────
  {
    const { det, body } = makeExpandable('Cores nomeadas', { open: false });
    const named = document.createElement('div'); named.className = 'sp-named';
    NAMED_COLORS.forEach(({ name, hex }) => {
      const row = document.createElement('button');
      row.type = 'button'; row.className = 'sp-namerow'; row.title = hex;
      row.dataset.hex = normHex(hex) || hex;
      if (selectedHex === normHex(hex)) row.classList.add('on');
      const c = document.createElement('span'); c.className = 'sp-swatch'; c.style.background = hex;
      const t = document.createElement('span'); t.textContent = name;
      row.append(c, t);
      row.onclick = () => selectColor(hex);
      named.append(row);
    });
    body.append(named);
    swatchPop.append(det);
  }

  // ── 3) Complementares (fechado por padrão) ────────────────────────────────
  {
    const { det, body } = makeExpandable('Complementares', { open: false });
    const grid = document.createElement('div'); grid.className = 'sp-grid';
    SWATCH_FAMILIES.forEach(({ name, colors }) => {
      colors.forEach((hex, i) => {
        appendChip(grid, hex, `${name} ${SWATCH_VARIANTS[i]} · ${hex}`);
      });
    });
    body.append(grid);
    swatchPop.append(det);
  }

  markOn = (hex) => {
    const h = normHex(hex);
    swatchPop.querySelectorAll('.sp-namerow.on, .sp-chip.on').forEach((el) => el.classList.remove('on'));
    if (!h) return;
    markNone(false);
    swatchPop.querySelectorAll('.sp-namerow, .sp-chip').forEach((el) => {
      if (normHex(el.dataset.hex) === h) el.classList.add('on');
    });
  };

  // ── HEX + picker nativo (sempre visível) ──────────────────────────────────
  {
    const lab = document.createElement('div');
    lab.className = 'sp-label';
    lab.textContent = 'HEX';
    swatchPop.append(lab);
  }
  const row = document.createElement('div'); row.className = 'sp-hex';
  inp = document.createElement('input');
  inp.type = 'text'; inp.placeholder = '#RRGGBB'; inp.value = selectedHex || '';
  inp.spellcheck = false; inp.setAttribute('aria-label', 'Cor em HEX');

  // Preview (alpha/xadrez/papel) por cima do <input type=color>; clique passa ao nativo
  // (pointer-events:none no overlay). Assim o SO abre o color picker e o visual de
  // opacidade continua no mesmo chip — sem segundo controle na row.
  const pickWrap = document.createElement('div');
  pickWrap.className = 'sp-pick';
  colorInp = document.createElement('input');
  colorInp.type = 'color';
  colorInp.className = 'sp-native';
  colorInp.value = toColorInputValue(selectedHex);
  colorInp.title = 'Escolher cor';
  colorInp.setAttribute('aria-label', 'Escolher cor');
  // input (não change): aplica ao vivo enquanto o diálogo nativo arrasta a cor
  colorInp.oninput = () => selectColor(colorInp.value);
  const preview = document.createElement('span');
  preview.className = 'sp-swatch';
  preview.setAttribute('aria-hidden', 'true');
  // pinta o preview com o hex do campo + a opacidade atual do slider.
  // <100%: xadrez (default) OU base branca (opts.paper) — no callout a base branca
  // mostra como a tinta a 10% fica no papel do PDF.
  paintPreview = () => {
    const h = normHex(inp.value) || selectedHex;
    preview.classList.remove('checker', 'paper');
    if (h && alpha < 1) {
      const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
      preview.style.background = '';
      preview.style.setProperty('--sp-ov', `rgba(${r},${g},${b},${alpha})`);
      preview.classList.add(paperBase ? 'paper' : 'checker');
    } else {
      // sólido: esconde o overlay e deixa o nativo aparecer (cor real do type=color)
      preview.style.background = h ? h : 'transparent';
      // com hex válido o overlay cobre o nativo com a mesma cor (borda/estilo .sp-swatch);
      // sem hex, transparente — mostra o valor default do nativo.
    }
  };
  // Enter no HEX: confirma e fecha (atalho de “pronto”)
  const commitHex = () => {
    const h = normHex(inp.value);
    if (h) selectColor(h, { close: true });
    else inp.classList.add('bad');
  };
  inp.oninput = () => {
    const h = normHex(inp.value);
    inp.classList.toggle('bad', inp.value.trim() !== '' && !h);
    if (h) {
      selectedHex = h;
      if (colorInp) colorInp.value = toColorInputValue(h);
      markOn(h);
      // preview ao vivo enquanto digita; não fecha
      pick(withAlpha(h, alpha));
    }
    paintPreview();
  };
  inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); commitHex(); } };
  paintPreview();
  pickWrap.append(colorInp, preview);
  row.append(pickWrap, inp);
  swatchPop.append(row);

  if (showOpacity) {
    const lab = document.createElement('div');
    lab.className = 'sp-label';
    lab.textContent = 'Opacidade';
    swatchPop.append(lab);
    const oprow = document.createElement('div'); oprow.className = 'sp-op';
    const slider = document.createElement('input');
    slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.step = '1';
    slider.value = String(Math.round(alpha * 100));
    slider.setAttribute('aria-label', 'Opacidade');
    slider.setAttribute('data-snaps', '0,10,25,50,75,100');
    const val = document.createElement('span'); val.className = 'sp-opval'; val.textContent = slider.value + '%';
    // aplica em tempo real na cor SELECIONADA (selectedHex) — se o user clicou em
    // Paradigma Aqua e depois arrasta o slider, o alpha modula aquele hex, não o initial.
    // enhanceRange usa capture: o ímã roda antes deste handler e o value já vem snappado.
    slider.oninput = () => {
      alpha = +slider.value / 100;
      val.textContent = slider.value + '%';
      paintPreview();
      const h = normHex(inp.value) || selectedHex || '#000000';
      selectedHex = normHex(h) || selectedHex;
      pick(withAlpha(selectedHex || '#000000', alpha));
    };
    oprow.append(slider, val);
    swatchPop.append(oprow);
    enhanceRange(slider);
  }

  document.body.append(swatchPop);
  const r = anchor.getBoundingClientRect(), pw = swatchPop.offsetWidth, ph = swatchPop.offsetHeight;
  swatchPop.style.left = Math.max(6, Math.min(r.left, innerWidth - pw - 6)) + 'px';
  swatchPop.style.top = (r.bottom + 4 + ph > innerHeight ? Math.max(6, r.top - 4 - ph) : r.bottom + 4) + 'px';
  setTimeout(() => addEventListener('pointerdown', outsideSwatch), 0);
}
function outsideSwatch(e) {
  if (!swatchPop || swatchPop.contains(e.target)) return;
  // Diálogo nativo de cor: em alguns browsers o mousedown “fora” dispara com o
  // type=color ainda focado — não fechar o pop senão o input some e o picker some junto.
  const native = swatchPop.querySelector('.sp-native');
  if (native && document.activeElement === native) return;
  closeSwatchPop();
}
export function closeSwatchPop() {
  if (!swatchPop) return;
  removeEventListener('pointerdown', outsideSwatch);
  swatchPop.remove(); swatchPop = null;
}

// CSS do componente — injetado uma vez (anchors .swatch/.colorfield + popover .sp-*)
// guard `typeof document` pra o módulo importar sem crashar em node (self-check no fim do arquivo)
(function injectCss() {
  if (typeof document === 'undefined' || document.getElementById('swatch-css')) return;
  const s = document.createElement('style'); s.id = 'swatch-css';
  s.textContent = `
  .swatch { flex: 0 0 auto; width: 1.5rem; height: 1.5rem; padding: 0; border-radius: 5px; border: 1px solid var(--hair-strong); cursor: pointer; background: transparent; }
  .colorfield { width: 100%; height: var(--ctrl-h, 2rem); padding: 0; border-radius: var(--ctrl-r, var(--r)); border: 1px solid var(--hair-strong); cursor: pointer; }
  .colorfield:hover, .swatch:hover { outline: 2px solid var(--violet); outline-offset: 1px; }
  .swatch-pop {
    position: fixed; z-index: 70; width: 15rem; max-height: 80vh; overflow-y: auto;
    display: flex; flex-direction: column; gap: .3rem;
    padding: .6rem; border: 1px solid var(--hair-strong); border-radius: 8px;
    background: color-mix(in srgb, var(--lilac) 8%, var(--ground)); box-shadow: 0 18px 50px -20px #000;
  }
  .swatch-pop .sp-label { font-size: .6rem; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 0; }
  /* "Nenhum" — remove cor/highlight (opts.allowNone) */
  .swatch-pop .sp-none {
    display: flex; align-items: center; gap: .45rem; width: 100%;
    padding: .35rem .45rem; border: 1px solid var(--hair); border-radius: 6px;
    background: transparent; color: var(--ink); cursor: pointer;
    font-size: .8rem; font-stretch: 90%; text-align: left;
  }
  .swatch-pop .sp-none:hover { background: color-mix(in srgb, var(--violet) 14%, transparent); border-color: var(--hair-strong); }
  .swatch-pop .sp-none.on {
    border-color: var(--violet);
    background: color-mix(in srgb, var(--violet) 16%, transparent);
  }
  .swatch-pop .sp-none-ico { display: grid; place-items: center; color: var(--muted); flex: none; }
  .swatch-pop .sp-none.on .sp-none-ico { color: var(--violet); }
  .swatch-pop .sp-none-ico svg { display: block; }
  /* expandable (nomeadas / complementares / nesse documento) */
  .sp-det { margin: 0; border: 0; }
  .sp-det-sum {
    list-style: none; cursor: pointer; display: flex; align-items: center; gap: .35rem;
    padding: .2rem 0; user-select: none;
  }
  .sp-det-sum::-webkit-details-marker { display: none; }
  .sp-det-chev {
    width: 0; height: 0; flex: 0 0 auto;
    border-top: 4px solid transparent; border-bottom: 4px solid transparent;
    border-left: 5px solid var(--muted);
    transition: transform .12s ease;
  }
  .sp-det[open] > .sp-det-sum .sp-det-chev { transform: rotate(90deg); }
  .sp-det-body { display: grid; gap: .35rem; padding: .2rem 0 .15rem; }
  .sp-docgroup { display: grid; gap: .2rem; }
  .sp-doclab { font-size: .62rem; color: var(--muted); font-stretch: 85%; }
  .sp-docrow { display: flex; flex-wrap: wrap; gap: .3rem; }
  .sp-named { display: flex; flex-direction: column; gap: .1rem; }
  .sp-namerow { display: flex; align-items: center; gap: .5rem; padding: .28rem .35rem; border: 1px solid transparent; border-radius: 6px; background: transparent; color: var(--ink); cursor: pointer; font-size: .78rem; text-align: left; }
  .sp-namerow:hover { background: color-mix(in srgb, var(--violet) 14%, transparent); }
  .sp-namerow.on { border-color: var(--violet); }
  .sp-swatch { width: 1.15rem; height: 1.15rem; flex: 0 0 auto; border-radius: 4px; border: 1px solid var(--hair-strong); }
  /* trilha F: xadrez (checker) por trás do preview quando a opacidade < 100% — sem ele uma
     cor bem transparente fica visualmente idêntica a "sem cor" no fundo escuro do popover.
     --sp-ov (setado via JS) é a cor com alpha, layer de CIMA; o xadrez fica embaixo aparecendo
     através dela. Em 100%/sem cor a classe não é aplicada e cai no background-color normal. */
  .sp-swatch.checker {
    background-image: linear-gradient(var(--sp-ov, transparent), var(--sp-ov, transparent)),
      repeating-conic-gradient(#6b6b6b 0% 25%, #3a3a3a 0% 50%);
    background-size: auto, 8px 8px;
  }
  /* base branca (papel) + cor com alpha por cima — preview fiel ao PDF
     (.colorfield = botões grandes da sidebar; .swatch = chips pequenos) */
  .sp-swatch.paper, .swatch.paper, .colorfield.paper {
    background-image: linear-gradient(var(--sp-ov, transparent), var(--sp-ov, transparent)),
      linear-gradient(#ffffff, #ffffff);
    background-color: #fff;
  }
  /* complementares: 9 colunas fixas (3 famílias × clara|padrão|escura por linha).
     justify-content: space-between espalha as colunas na largura do popover
     (antes sobrava faixa vazia à direita com 6 colunas). Chip mantém o mesmo
     tamanho de .sp-swatch (nomeadas/preview HEX). */
  .sp-grid { display: grid; grid-template-columns: repeat(9, 1.15rem); row-gap: .3rem; column-gap: .3rem; justify-content: space-between; }
  /* borda forte: sem ela o chip preto some no fundo do popover (que é quase preto) */
  .sp-chip { width: 1.15rem; height: 1.15rem; padding: 0; border-radius: 5px; border: 1px solid var(--hair-strong); cursor: pointer; }
  .sp-chip:hover { outline: 2px solid var(--violet); outline-offset: 1px; }
  .sp-chip.on { outline: 2px solid var(--ink); outline-offset: 1px; }
  .sp-hex { display: flex; align-items: center; gap: .4rem; }
  /* chip clicável: nativo embaixo + overlay .sp-swatch (alpha/xadrez) com pointer-events:none */
  .sp-pick {
    position: relative; flex: 0 0 auto; width: 1.15rem; height: 1.15rem;
  }
  .sp-pick .sp-native {
    position: absolute; inset: 0; width: 100%; height: 100%;
    padding: 0; margin: 0; border: 1px solid var(--hair-strong); border-radius: 4px;
    cursor: pointer; background: transparent;
    /* sobrescreve height:var(--ctrl-h) global de paradigma.css */
    min-height: 0; box-sizing: border-box;
  }
  .sp-pick .sp-native::-webkit-color-swatch-wrapper { padding: 0; }
  .sp-pick .sp-native::-webkit-color-swatch { border: none; border-radius: 3px; }
  .sp-pick .sp-native::-moz-color-swatch { border: none; border-radius: 3px; }
  .sp-pick .sp-swatch {
    position: absolute; inset: 0; pointer-events: none;
    width: auto; height: auto; /* preenche o .sp-pick, não o 1.15rem fixo sozinho */
  }
  .sp-hex input[type="text"] { flex: 1; min-width: 0; padding: .35rem .5rem; border: 1px solid var(--hair-strong); border-radius: 6px; background: var(--ground); color: var(--ink); font-family: ui-monospace, monospace; font-size: .8rem; text-transform: uppercase; }
  .sp-hex input[type="text"].bad { border-color: var(--coral, #CE5249); }
  /* trilha F: slider de opacidade — valor em % alinhado à direita, largura tabular pra não
     "pular" o slider ao lado quando o número muda de dígito (9% → 10%). */
  .sp-op { display: flex; align-items: center; gap: .5rem; }
  .sp-op .range-snap { flex: 1; min-width: 0; }
  .sp-op input[type="range"] { flex: 1; width: 100%; accent-color: var(--violet); }
  .sp-opval { flex: 0 0 auto; min-width: 2.4em; text-align: right; font-size: .78rem; color: var(--muted); font-variant-numeric: tabular-nums; }`;
  document.head.append(s);
})();

// self-check: `node swatch.js` (não roda ao importar no browser — sem `process`). Cobre só o
// parser de cor (hex↔rgba), que é a única lógica não-DOM do arquivo — o resto (popover, CSS)
// exige `document` de verdade e não vale a pena mockar aqui.
function demo() {
  const eq = (got, want, msg) => console.assert(JSON.stringify(got) === JSON.stringify(want), msg, JSON.stringify(got));

  // 1) hex puro a 100% → sai como hex do pick (contrato retrocompatível intacto)
  eq(withAlpha('#29E899', 1), '#29E899', 'hex a 100% sai como hex, não rgba');

  // 2) current em rgba (entrada) → extrai o hex certo (destaca o chip) + a opacidade certa (slider)
  eq(parseColor('rgba(41,232,153,0.5)'), { hex: '#29E899', alpha: 0.5 }, 'rgba de entrada → hex + alpha');
  eq(parseColor('rgb(0,0,0)'), { hex: '#000000', alpha: 1 }, 'rgb sem alpha → opacidade 100%');
  eq(parseColor('#F7931A'), { hex: '#F7931A', alpha: 1 }, 'hex puro de entrada → alpha 100% (default)');
  eq(parseColor(''), null, 'string vazia → null (sem cor, como normHex)');

  // 3) opacidade < 100% aplicada no slider → pick recebe rgba(r,g,b,a) com os componentes certos
  eq(withAlpha('#29E899', 0.5), 'rgba(41,232,153,0.5)', '50% → rgba com os componentes certos');
  eq(withAlpha('#000000', 0), 'rgba(0,0,0,0)', '0% → rgba com alpha 0 (não hex)');

  // 4) harvest HTML + normalizeDocColors
  const buckets = harvestColorsFromHtml(
    '<p style="color:#4E4E4E;background-color:rgba(255,0,0,0.5)">x</p><font color="#00ff00">y</font>',
  );
  eq([...buckets.text].sort(), ['#00FF00', '#4E4E4E'], 'harvest texto de style+font');
  eq([...buckets.bg], ['#FF0000'], 'harvest fundo (alpha ignorado no hex)');

  const norm = normalizeDocColors({ text: ['#abc', 'not-a-color', '#AABBCC'], bg: ['#000'] });
  eq(norm, { text: ['#AABBCC'], bg: ['#000000'] }, 'normalize dedupe + ignora inválido');
  eq(normalizeDocColors(['#29E899', '#29e899']), { text: ['#29E899'], bg: [] }, 'array plano → text');

  console.log('swatch: todos os asserts passaram');
}

if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].endsWith('swatch.js')) demo();
