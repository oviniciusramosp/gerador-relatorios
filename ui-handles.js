/* Alças Notion (+ / ⠿ + menu Duplicar|Remover) — componente real compartilhado.
 *
 * Uso (Diagramador / Stories):
 *   import { createBlockHandles, HANDLE_GEOM } from './ui-handles.js';
 *   import { registerUiIcons, uiIco, menuIco } from './ui-icons.js';
 *   registerUiIcons();
 *   const handles = createBlockHandles({
 *     onMenuAction({ action, id }) { … },
 *     onAddClick(ctx) { … },
 *   });
 *   handles.placeAtElement(el, id);
 *   handles.hide();
 *
 * CSS: paradigma.css (#bhandle, #badd, #bmenu).
 * Ícones: ui-icons.js (reorder-three solid, add outline, copy/trash).
 *
 * O APP decide QUANDO mostrar (seleção vs hover) e o que fazer em drag/menu.
 * Este módulo só: cria DOM, posiciona, menu, pending de pointer.
 */

import { registerUiIcons, uiIco, menuIco } from './ui-icons.js';

/** Geometria canônica — H_GUTTER = faixa hit-test bloco→botão. */
export const HANDLE_GEOM = Object.freeze({
  H_BTN: 16,
  H_GAP: 0,
  H_PAD: 10,
  // comentário à esquerda do +: gap MAIOR que o vão +↔dragger (H_GAP=0)
  H_COMMENT_GAP: 10,
  // pin com thread: botão/ícone maiores (vazio fica no H_BTN=16, como o +)
  H_COMMENT_BTN: 20,
  DRAG_PX: 5,
  get H_GUTTER() {
    return this.H_BTN + this.H_GAP + this.H_BTN + this.H_PAD; // 42
  },
  get H_COMMENT_GUTTER() {
    return this.H_COMMENT_BTN + this.H_COMMENT_GAP + this.H_GUTTER; // 72
  },
});

/** Posições fixed (viewport) de [comentário] [+] [⠿] à esquerda do bloco. */
export function handleLayout(rect, commentBtn = HANDLE_GEOM.H_BTN) {
  const { H_BTN, H_GAP, H_PAD, H_COMMENT_GAP } = HANDLE_GEOM;
  const midY = rect.top + rect.height / 2;
  const dragLeft = rect.left - H_PAD - H_BTN;
  const addLeft = dragLeft - H_GAP - H_BTN;
  const commentLeft = addLeft - H_COMMENT_GAP - commentBtn;
  return { midY, dragLeft, addLeft, commentLeft };
}

/**
 * @typedef {object} CreateBlockHandlesOpts
 * @property {HTMLElement} [parent]
 * @property {boolean} [wireMenu] default true — false = app liga listeners do menu
 * @property {boolean} [wireAdd] default true
 * @property {boolean} [wireHandle] default true
 * @property {(p: { action: 'dup'|'del', id: string }) => void} [onMenuAction]
 * @property {(p: { id: string|null, handleFor: object|null }) => void} [onAddClick]
 * @property {(p: { id: string, event: PointerEvent, handleFor: object }) => void} [onHandlePointerDown]
 */

/**
 * Cria (ou reusa) #bhandle, #badd, #bmenu no parent (default body).
 * @param {CreateBlockHandlesOpts} [opts]
 */
export function createBlockHandles(opts = {}) {
  registerUiIcons();
  const parent = opts.parent || document.body;
  const wireMenu = opts.wireMenu !== false;
  const wireAdd = opts.wireAdd !== false;
  const wireHandle = opts.wireHandle !== false;
  const { H_BTN, H_GAP, H_PAD, DRAG_PX } = HANDLE_GEOM;

  let bhandle = document.getElementById('bhandle');
  if (!bhandle) {
    bhandle = document.createElement('div');
    bhandle.id = 'bhandle';
    bhandle.hidden = true;
    bhandle.title = 'Arrastar ou clicar para opções';
    bhandle.setAttribute('role', 'button');
    bhandle.tabIndex = -1;
    bhandle.setAttribute('aria-label', 'Opções do bloco');
    parent.appendChild(bhandle);
  }
  bhandle.innerHTML = uiIco('reorder-three', 12, 'solid');

  let badd = document.getElementById('badd');
  if (!badd) {
    badd = document.createElement('button');
    badd.id = 'badd';
    badd.type = 'button';
    badd.hidden = true;
    badd.title = 'Adicionar bloco abaixo';
    badd.setAttribute('aria-label', 'Adicionar bloco abaixo');
    parent.appendChild(badd);
  }
  badd.innerHTML = uiIco('add', 12, 'outline');

  let bmenu = document.getElementById('bmenu');
  if (!bmenu) {
    bmenu = document.createElement('div');
    bmenu.id = 'bmenu';
    bmenu.hidden = true;
    bmenu.setAttribute('role', 'menu');
    parent.appendChild(bmenu);
  }
  bmenu.innerHTML =
    `<button type="button" data-a="dup"><span class="ico">${menuIco('copy')}</span>Duplicar</button>`
    + `<button type="button" data-a="del" class="danger"><span class="ico">${menuIco('trash')}</span>Remover</button>`;

  /** @type {{ id: string, _el?: Element, kind?: string }|null} */
  let handleFor = null;
  /** @type {{ id: string, x: number, y: number, kind?: string }|null} */
  let handlePending = null;
  let menuId = null;

  function hide() {
    bhandle.hidden = true;
    badd.hidden = true;
    handleFor = null;
  }

  /**
   * Posiciona + e ⠿ ao meio da altura do elemento (viewport coords).
   * @param {Element|null|undefined} el
   * @param {string} id
   * @param {{ kind?: string }} [meta]
   */
  function placeAtElement(el, id, meta = {}) {
    if (!el || !id) return hide();
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return hide();
    handleFor = { id, _el: el, kind: meta.kind };
    const midY = r.top + r.height / 2;
    const dragLeft = r.left - H_PAD - H_BTN;
    const addLeft = dragLeft - H_GAP - H_BTN;
    bhandle.style.left = dragLeft + 'px';
    bhandle.style.top = midY + 'px';
    bhandle.hidden = false;
    badd.style.left = addLeft + 'px';
    badd.style.top = midY + 'px';
    badd.hidden = false;
  }

  function closeMenu() {
    bmenu.hidden = true;
    menuId = null;
    delete bmenu.dataset.id;
  }

  function openMenu(id, anchorEl) {
    menuId = id;
    bmenu.hidden = false;
    bmenu.dataset.id = id;
    const r = (anchorEl || bhandle).getBoundingClientRect();
    const mw = bmenu.offsetWidth || 160;
    const mh = bmenu.offsetHeight || 72;
    let x = r.right + 6;
    if (x + mw > innerWidth - 8) x = Math.max(8, r.left - mw - 6);
    let y = r.top;
    if (y + mh > innerHeight - 8) y = Math.max(8, innerHeight - mh - 8);
    bmenu.style.left = x + 'px';
    bmenu.style.top = y + 'px';
  }

  if (wireMenu) {
    bmenu.addEventListener('mousedown', (e) => e.preventDefault());
    bmenu.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-a]');
      if (!btn || !menuId) return;
      const id = menuId;
      const action = btn.dataset.a;
      closeMenu();
      if (action === 'dup' || action === 'del') {
        opts.onMenuAction?.({ action, id });
      }
    });
    document.addEventListener('pointerdown', (e) => {
      if (bmenu.hidden) return;
      if (e.target.closest?.('#bmenu') || e.target.closest?.('#bhandle')) return;
      closeMenu();
    }, true);
  }

  if (wireAdd) {
    badd.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      opts.onAddClick?.({ id: handleFor?.id || null, handleFor });
    });
  }

  if (wireHandle) {
    bhandle.addEventListener('pointerdown', (e) => {
      if (!handleFor?.id) return;
      e.preventDefault();
      e.stopPropagation();
      closeMenu();
      opts.onHandlePointerDown?.({ id: handleFor.id, event: e, handleFor });
      handlePending = {
        id: handleFor.id,
        x: e.clientX,
        y: e.clientY,
        kind: handleFor.kind,
      };
    });
  }

  return {
    bhandle,
    badd,
    bmenu,
    geom: HANDLE_GEOM,
    DRAG_PX,
    get handleFor() { return handleFor; },
    set handleFor(v) { handleFor = v; },
    get handlePending() { return handlePending; },
    set handlePending(v) { handlePending = v; },
    get menuId() { return menuId; },
    hide,
    placeAtElement,
    openMenu,
    closeMenu,
    /** Promove pending a drag se moveu ≥ DRAG_PX; senão null e limpa. */
    consumePendingAsDrag(clientX, clientY) {
      if (!handlePending) return null;
      const dx = clientX - handlePending.x;
      const dy = clientY - handlePending.y;
      if (Math.hypot(dx, dy) < DRAG_PX) return null;
      const p = handlePending;
      handlePending = null;
      return p;
    },
    /** Click sem drag: devolve id e limpa pending. */
    consumePendingAsClick() {
      const p = handlePending;
      handlePending = null;
      return p;
    },
    clearPending() { handlePending = null; },
  };
}
