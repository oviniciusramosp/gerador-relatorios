/* Bloco Grid de Imagens — 1 a 4 colunas; título/legenda sob demanda (bloco inteiro).
 *
 *   buildImageGridEl(b, editing, ctx) → DOM
 *     b.items[]       — até 4 células { src, nw, nh, title?, caption? }
 *     b.equal         — 'width' (default) | 'height'
 *     b.titles        — true = reserva título em TODAS as colunas (default off)
 *     b.captions      — true = reserva legenda em TODAS as colunas (default off)
 *     b.captionStyle  — 'default' | 'p' (só com captions; default = tipo caption / ⋮ Legenda)
 *     b.gap           — px entre colunas (default IMAGE_GRID_GAP)
 *     b.radius        — raio dos cantos (default 4)
 *     ctx             — { commit, rerender, removeBlock, pickImage }
 */

export const IMAGE_GRID_MAX = 4;
export const IMAGE_GRID_GAP = 8;          // gap default entre colunas (px)
export const IMAGE_GRID_GAP_MAX = 48;
export const IMAGE_GRID_EMPTY_AR = 4 / 3; // aspect do slot vazio
const DEFAULT_RADIUS = 4;

export function seedGridItem() {
  return { src: null, nw: 0, nh: 0 };
}

/** Garante 1..4 items e flags válidas. Mutável; idempotente. */
export function ensureImageGrid(b) {
  if (!b || typeof b !== 'object') return b;
  if (!Array.isArray(b.items) || !b.items.length) {
    b.items = [seedGridItem(), seedGridItem()];
  }
  b.items = b.items.slice(0, IMAGE_GRID_MAX).map((raw) => {
    const it = raw && typeof raw === 'object' ? raw : {};
    const out = {
      src: it.src || null,
      nw: +it.nw || 0,
      nh: +it.nh || 0,
    };
    // title/caption só existem quando o usuário já digitou (ou toggle ligou com '')
    if (it.title != null) out.title = it.title;
    if (it.caption != null) out.caption = it.caption;
    return out;
  });
  if (!b.items.length) b.items = [seedGridItem()];
  if (b.equal !== 'height') delete b.equal;
  if (b.titles !== true) delete b.titles;
  if (b.captions !== true) delete b.captions;
  if (b.captionStyle !== 'p') delete b.captionStyle;
  // gap: só persiste se ≠ default
  if (b.gap != null) {
    const g = clampGap(b.gap);
    if (g === IMAGE_GRID_GAP) delete b.gap;
    else b.gap = g;
  }
  return b;
}

export function equalModeOf(b) {
  return b && b.equal === 'height' ? 'height' : 'width';
}

export function titlesOn(b) {
  return !!(b && b.titles);
}

export function captionsOn(b) {
  return !!(b && b.captions);
}

/** 'default' = tipo caption (⋮ Legenda); 'p' = tipografia do parágrafo do doc. */
export function captionStyleOf(b) {
  return b && b.captionStyle === 'p' ? 'p' : 'default';
}

export function clampGap(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return IMAGE_GRID_GAP;
  return Math.max(0, Math.min(IMAGE_GRID_GAP_MAX, v));
}

export function gapOf(b) {
  return b && b.gap != null ? clampGap(b.gap) : IMAGE_GRID_GAP;
}

export function itemAspect(it) {
  if (it && it.src && it.nw > 0 && it.nh > 0) return it.nw / it.nh;
  return IMAGE_GRID_EMPTY_AR;
}

/**
 * Dimensões da área de imagem de cada célula (sem título/legenda).
 * equal=width: colunas iguais; slot vazio herda a altura da imagem MAIS ALTA
 * (não o aspect 4:3 fixo — isso empurrava legenda/conteúdo abaixo das fotos).
 * equal=height: mesma altura; larguras proporcionais ao aspect.
 * @returns {{ w: number, h: number }[]}
 */
export function layoutImageFrames(items, totalW, gap = IMAGE_GRID_GAP, equal = 'width') {
  const list = Array.isArray(items) && items.length ? items : [seedGridItem()];
  const n = Math.max(1, Math.min(IMAGE_GRID_MAX, list.length));
  const g = clampGap(gap);
  const gaps = Math.max(0, n - 1) * g;
  const avail = Math.max(1, totalW - gaps);
  const slice = list.slice(0, n);
  const ars = slice.map(itemAspect);

  if (equal === 'height') {
    const sumAr = ars.reduce((a, r) => a + r, 0) || n;
    const H = avail / sumAr;
    return ars.map((ar) => ({ w: H * ar, h: H }));
  }
  const colW = avail / n;
  const frames = ars.map((ar) => ({ w: colW, h: colW / ar }));
  // placeholder vazio: altura = max das células com imagem; se só vazios, 4:3
  let maxFilledH = 0;
  for (let i = 0; i < n; i++) {
    if (slice[i] && slice[i].src) maxFilledH = Math.max(maxFilledH, frames[i].h);
  }
  const emptyH = maxFilledH > 0 ? maxFilledH : colW / IMAGE_GRID_EMPTY_AR;
  for (let i = 0; i < n; i++) {
    if (!slice[i] || !slice[i].src) frames[i].h = emptyH;
  }
  return frames;
}

export function addGridItem(b) {
  ensureImageGrid(b);
  if (b.items.length >= IMAGE_GRID_MAX) return false;
  b.items.push(seedGridItem());
  return true;
}

export function removeGridItem(b, index) {
  ensureImageGrid(b);
  if (b.items.length <= 1) return false;
  const i = Math.max(0, Math.min(b.items.length - 1, index | 0));
  b.items.splice(i, 1);
  return true;
}

/** Define o número de colunas (1..MAX), acrescentando slots vazios ou cortando o fim. */
export function setGridCols(b, n) {
  ensureImageGrid(b);
  const target = Math.max(1, Math.min(IMAGE_GRID_MAX, n | 0));
  while (b.items.length < target) b.items.push(seedGridItem());
  while (b.items.length > target) b.items.pop();
  return b.items.length;
}

export function setGridItemImage(b, index, { src, nw, nh }) {
  ensureImageGrid(b);
  const i = index | 0;
  if (i < 0 || i >= b.items.length) return false;
  const it = b.items[i];
  it.src = src || null;
  it.nw = +nw || 0;
  it.nh = +nh || 0;
  return true;
}

export function clearGridItemImage(b, index) {
  ensureImageGrid(b);
  const i = index | 0;
  if (i < 0 || i >= b.items.length) return false;
  const it = b.items[i];
  it.src = null;
  it.nw = 0;
  it.nh = 0;
  return true;
}

/** Liga/desliga títulos em TODAS as colunas (conteúdo preservado ao desligar). */
export function setTitlesOn(b, on) {
  ensureImageGrid(b);
  if (on) {
    b.titles = true;
    for (const it of b.items) {
      if (it.title == null) it.title = '';
    }
  } else {
    delete b.titles;
  }
}

/** Liga/desliga legendas em TODAS as colunas. */
export function setCaptionsOn(b, on) {
  ensureImageGrid(b);
  if (on) {
    b.captions = true;
    for (const it of b.items) {
      if (it.caption == null) it.caption = '';
    }
  } else {
    delete b.captions;
  }
}

/**
 * Monta o DOM do grid.
 * @param {object} b
 * @param {boolean} editing
 * @param {{ commit?:Function, rerender?:Function, removeBlock?:Function, pickImage?:Function, applyCaptionStyle?:(el:HTMLElement, mode?:'default'|'p')=>void }} ctx
 * @param {number} [colW]
 */
export function buildImageGridEl(b, editing, ctx = {}, colW = 499) {
  ensureImageGrid(b);
  const equal = equalModeOf(b);
  const gap = gapOf(b);
  const radius = b.radius != null ? b.radius : DEFAULT_RADIUS;
  const showTitle = titlesOn(b);
  const showCap = captionsOn(b);
  const capStyle = captionStyleOf(b);

  // em edição: todos os slots; no PDF/export: só células com imagem
  const entries = b.items.map((it, i) => ({ it, i }))
    .filter(({ it }) => editing || !!it.src);
  const layoutItems = entries.map(({ it }) => it);
  const frames = layoutImageFrames(
    layoutItems.length ? layoutItems : [seedGridItem()],
    colW, gap, equal,
  );
  const n = Math.max(1, entries.length || 1);

  const wrap = document.createElement('div');
  wrap.className = 'imggrid-wrap b';
  wrap.dataset.id = b.id;
  wrap.dataset.equal = equal;
  wrap.dataset.capstyle = capStyle;
  if (showTitle) wrap.dataset.titles = '1';
  if (showCap) wrap.dataset.captions = '1';
  wrap.style.width = colW + 'px';

  const grid = document.createElement('div');
  grid.className = 'imggrid';
  grid.dataset.equal = equal;
  // display:contents nas células + grid de N colunas × (título?) × imagem × (legenda?)
  // faz a linha de título ter a altura do MAIOR título → placeholders e imagens alinham.
  grid.style.display = 'grid';
  grid.style.columnGap = gap + 'px';
  grid.style.rowGap = '0';
  grid.style.alignItems = 'start';
  if (equal === 'width') {
    grid.style.gridTemplateColumns = `repeat(${n}, minmax(0, 1fr))`;
  } else {
    grid.style.gridTemplateColumns = frames.map((fr) => Math.max(1, fr.w) + 'px').join(' ');
  }
  // linhas: [título?] imagem [legenda?]
  const rowParts = [];
  if (showTitle) rowParts.push('auto');
  rowParts.push('auto');
  if (showCap) rowParts.push('auto');
  grid.style.gridTemplateRows = rowParts.join(' ');

  if (!entries.length) {
    wrap.appendChild(grid);
    return wrap;
  }

  const titleRow = showTitle ? 1 : 0;
  const imgRow = showTitle ? 2 : 1;
  const capRow = showTitle ? 3 : 2;

  entries.forEach(({ it, i }, li) => {
    const fr = frames[li] || frames[0];
    const col = li + 1;
    // cell com display:contents — filhos entram no grid pai (alinha linhas entre colunas)
    const cell = document.createElement('div');
    cell.className = 'imggrid-cell' + (it.src ? '' : ' is-empty');
    cell.dataset.item = String(i);
    cell.style.display = 'contents';

    if (showTitle) {
      const t = document.createElement('div');
      t.className = 'figtitle';
      t.dataset.role = 'title';
      t.dataset.id = b.id;
      t.dataset.item = String(i);
      t.dataset.ph = 'Título';
      t.innerHTML = it.title != null ? it.title : '';
      t.style.gridColumn = String(col);
      t.style.gridRow = String(titleRow);
      if (editing) { t.contentEditable = 'true'; t.spellcheck = true; t.lang = 'pt-BR'; }
      cell.appendChild(t);
    }

    const frame = document.createElement('div');
    frame.className = 'imggrid-frame';
    frame.style.gridColumn = String(col);
    frame.style.gridRow = String(imgRow);
    frame.style.width = '100%';
    frame.style.borderRadius = radius + 'px';

    if (it.src) {
      const img = document.createElement('img');
      img.src = it.src;
      img.draggable = false;
      img.alt = '';
      img.style.borderRadius = radius + 'px';
      // Altura do frame SEMPRE de layoutImageFrames (nw/nh), nunca height:auto no <img>.
      // height:auto só fecha depois do decode — a paginação media o grid “baixo”, cabia
      // no resto da página, e ao carregar a foto a legenda vazava da área de conteúdo.
      frame.style.height = Math.max(1, fr.h) + 'px';
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.display = 'block';
      // equal=width: aspect do frame = nw/nh → cover preenche sem letterbox.
      // equal=height: frames já têm H comum e W proporcional; contain evita crop.
      img.style.objectFit = equal === 'height' ? 'contain' : 'cover';
      frame.appendChild(img);
      if (editing) {
        // ações no hover: Substituir / Remover — clique na foto NÃO abre o file picker
        // (evita troca acidental; vazio continua com o botão + do placeholder)
        frame.classList.add('imggrid-has');
        const actions = document.createElement('div');
        actions.className = 'imggrid-actions';
        const rep = document.createElement('button');
        rep.type = 'button';
        rep.className = 'imggrid-rep';
        rep.title = 'Substituir imagem';
        rep.setAttribute('aria-label', 'Substituir imagem');
        // ion-icon "repeat-outline" simplificado (mesmo sentido do Substituir da imagem avulsa)
        rep.innerHTML = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13 7a5 5 0 0 0-8.5-3.5L3 5"/><path d="M3 2v3h3"/><path d="M3 9a5 5 0 0 0 8.5 3.5L13 11"/><path d="M13 14v-3h-3"/></svg>';
        rep.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          ctx.pickImage?.(b.id, i);
        });
        // remover só a imagem (slot fica vazio — não tira a coluna)
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'imggrid-rm';
        rm.title = 'Remover imagem';
        rm.setAttribute('aria-label', 'Remover imagem');
        rm.innerHTML = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 4h10M6 4V3h4v1M5 4l.5 9h5L11 4"/></svg>';
        rm.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!clearGridItemImage(b, i)) return;
          ctx.commit?.();
          ctx.rerender?.();
        });
        actions.append(rep, rm);
        frame.appendChild(actions);
      }
    } else {
      // placeholder: altura do layout (= max das imagens com equal=width; ou H comum em height)
      frame.style.height = fr.h + 'px';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'imggrid-empty';
      btn.dataset.item = String(i);
      btn.innerHTML = '<span class="imggrid-empty-ico" aria-hidden="true">+</span><span>Imagem</span>';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        ctx.pickImage?.(b.id, i);
      });
      frame.appendChild(btn);
    }

    cell.appendChild(frame);

    if (showCap) {
      const c = document.createElement('figcaption');
      c.dataset.role = 'caption';
      c.dataset.id = b.id;
      c.dataset.item = String(i);
      c.dataset.ph = 'Legenda';
      c.innerHTML = it.caption != null ? it.caption : '';
      c.style.gridColumn = String(col);
      c.style.gridRow = String(capRow);
      if (editing) { c.contentEditable = 'true'; c.spellcheck = true; c.lang = 'pt-BR'; }
      // default = tipo 'caption' (⋮ Legenda); 'p' = tipografia do parágrafo
      if (ctx.applyCaptionStyle) ctx.applyCaptionStyle(c, capStyle);
      cell.appendChild(c);
    }

    grid.appendChild(cell);
  });

  wrap.appendChild(grid);
  return wrap;
}
