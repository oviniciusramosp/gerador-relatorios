/* Bloco Grid de Imagens — 1 a 4 colunas; título/legenda sob demanda (bloco inteiro).
 *
 *   buildImageGridEl(b, editing, ctx) → DOM
 *     b.items[]       — até 4 células { src, nw, nh, title?, caption? }
 *     b.equal         — 'width' (default) | 'height'
 *     b.titles        — true = reserva título em TODAS as colunas (default off)
 *     b.captions      — true = reserva legenda em TODAS as colunas (default off)
 *     b.captionStyle  — 'default' | 'p' (só com captions; default = estilo figcaption)
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

/** 'default' = estilo figcaption; 'p' = tipografia do parágrafo do doc. */
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
  return ars.map((ar) => ({ w: colW, h: colW / ar }));
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
 * @param {{ commit?:Function, rerender?:Function, removeBlock?:Function, pickImage?:Function, applyCaptionStyle?:(el:HTMLElement)=>void }} ctx
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
    if (equal === 'height') {
      frame.style.height = fr.h + 'px';
    }

    if (it.src) {
      const img = document.createElement('img');
      img.src = it.src;
      img.draggable = false;
      img.alt = '';
      img.style.borderRadius = radius + 'px';
      if (equal === 'width') {
        img.style.width = '100%';
        img.style.height = 'auto';
        img.style.display = 'block';
      } else {
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        img.style.display = 'block';
        // sem fundo: PNG/SVG transparentes mostram o papel da página
      }
      frame.appendChild(img);
      if (editing) {
        frame.classList.add('imggrid-has');
        frame.title = 'Clique para substituir';
        frame.addEventListener('click', (e) => {
          e.stopPropagation();
          ctx.pickImage?.(b.id, i);
        });
      }
    } else {
      // placeholder: aspect 4:3 pra ocupar a linha de imagem
      if (equal === 'width') frame.style.aspectRatio = '4 / 3';
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
      if (capStyle === 'p' && ctx.applyCaptionStyle) ctx.applyCaptionStyle(c);
      cell.appendChild(c);
    }

    grid.appendChild(cell);
  });

  wrap.appendChild(grid);
  return wrap;
}
