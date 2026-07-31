/* Shell do editor (header + sidebar + zoom + segment) — componente real.
 *
 * Contrato HTML (ids estáveis — Diagramador / Stories):
 *
 *   body.app-editor
 *   header
 *     .hleft > #btnSidebar, h1, .crumb?
 *     .zoomwrap > #zoomFit, #zoomPct > #zoomPctLabel
 *     #zoomPop > #zoomRange, #zoomPopVal
 *     nav > #btnUndo, #btnRedo, …ações
 *   main#main (ou main)
 *     aside#sidebar > .sidebar-panel
 *       #segment[role=tablist] > button[data-seg=documento|conteudo]
 *       .pane-stack > .pane[data-pane=…]
 *     section.stage  (conteúdo do app)
 *
 *   import { bindEditorShell } from './ui-shell.js';
 *   const shell = bindEditorShell({
 *     onZoomFit() { state.zoom = 'fit'; applyZoom(); },
 *     onZoomPct(pct) { state.zoom = pct/100; applyZoom(); },
 *     onSidebarChange() { if (state.zoom==='fit') applyZoom(); },
 *     isZoomFit: () => state.zoom === 'fit',
 *   });
 *   shell.setSegment('documento');
 *   shell.syncZoomLabel(100);
 *   shell.setHistEnabled(canUndo, canRedo);
 *
 * CSS: paradigma.css (.app-editor …).
 */

import { registerUiIcons, uiIco } from './ui-icons.js';
import { enhanceAll } from './range-snap.js';

const SEG_ICO = { documento: 'options', conteudo: 'layers' };

/**
 * @typedef {object} BindEditorShellOpts
 * @property {() => void} [onZoomFit]
 * @property {(pct: number) => void} [onZoomPct]  // 10–200
 * @property {(open: boolean) => void} [onSidebarChange]
 * @property {() => boolean} [isZoomFit]
 * @property {string} [initialSegment] default 'documento'
 * @property {boolean} [wireZoom] default true
 * @property {boolean} [wireSidebar] default true
 * @property {boolean} [wireSegment] default true
 * @property {boolean} [wireDetailsChevrons] default true
 */

/**
 * Liga o shell já presente no DOM. Não cria header/sidebar (conteúdo é do app).
 * @param {BindEditorShellOpts} [opts]
 */
export function bindEditorShell(opts = {}) {
  registerUiIcons();
  document.body.classList.add('app-editor');

  const main = document.getElementById('main') || document.querySelector('main');
  const sidebar = document.getElementById('sidebar');
  const btnSidebar = document.getElementById('btnSidebar');
  const zoomFit = document.getElementById('zoomFit');
  const zoomPct = document.getElementById('zoomPct');
  const zoomPop = document.getElementById('zoomPop');
  const zoomRange = document.getElementById('zoomRange');
  const zoomPctLabel = document.getElementById('zoomPctLabel');
  const zoomPopVal = document.getElementById('zoomPopVal');
  const btnUndo = document.getElementById('btnUndo');
  const btnRedo = document.getElementById('btnRedo');
  const wireZoom = opts.wireZoom !== false;
  const wireSidebar = opts.wireSidebar !== false;
  const wireSegment = opts.wireSegment !== false;
  const wireChevrons = opts.wireDetailsChevrons !== false;

  // ── ícones canônicos ─────────────────────────────────────────────────────
  if (btnSidebar && !btnSidebar.querySelector('svg')) {
    btnSidebar.innerHTML = uiIco('menu', 18, 'outline');
  }
  if (zoomFit && !zoomFit.querySelector('svg')) {
    zoomFit.innerHTML = uiIco('expand', 16, 'outline');
  }
  if (btnUndo && !btnUndo.querySelector('svg')) {
    btnUndo.innerHTML = uiIco('arrow-undo', 16, 'solid');
  }
  if (btnRedo && !btnRedo.querySelector('svg')) {
    btnRedo.innerHTML = uiIco('arrow-redo', 16, 'solid');
  }

  // ── segment Configurações / Conteúdo ─────────────────────────────────────
  const segBtns = [...document.querySelectorAll('#segment button[data-seg]')];
  if (wireSegment) {
    segBtns.forEach((b) => {
      const key = SEG_ICO[b.dataset.seg];
      if (!key || b.querySelector('svg')) return;
      const label = b.textContent.trim();
      b.innerHTML = `${uiIco(key, 14, 'outline')}<span>${label}</span>`;
    });
  }

  function setSegment(name) {
    segBtns.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.seg === name)));
    document.querySelectorAll('.pane-stack > .pane, .pane[data-pane]').forEach((p) => {
      if (!p.dataset.pane) return;
      const on = p.dataset.pane === name;
      p.hidden = !on;
      p.classList.remove('sb-fading');
      p.style.opacity = p.style.transition = p.style.zIndex = '';
    });
  }
  if (wireSegment) {
    segBtns.forEach((b) => b.addEventListener('click', () => setSegment(b.dataset.seg)));
    setSegment(opts.initialSegment || 'documento');
  }

  // ── chevrons dos <details> ───────────────────────────────────────────────
  if (wireChevrons && sidebar) {
    sidebar.querySelectorAll('details > summary').forEach((sum) => {
      if (sum.querySelector('.det-chev')) return;
      const label = sum.textContent.trim();
      sum.replaceChildren();
      const chev = document.createElement('span');
      chev.className = 'det-chev';
      chev.setAttribute('aria-hidden', 'true');
      chev.innerHTML = uiIco('chevron-forward', 12, 'outline');
      sum.append(chev, document.createTextNode(label));
    });
  }

  // ── sidebar slide + inert ────────────────────────────────────────────────
  function setSidebarOpen(open) {
    if (!btnSidebar || !main) return;
    btnSidebar.setAttribute('aria-pressed', String(open));
    main.classList.toggle('sidebar-collapsed', !open);
    btnSidebar.title = open ? 'Esconder o menu' : 'Mostrar o menu';
    if (sidebar) {
      if (open) sidebar.removeAttribute('inert');
      else sidebar.setAttribute('inert', '');
    }
  }
  function isSidebarOpen() {
    return btnSidebar?.getAttribute('aria-pressed') !== 'false'
      && !main?.classList.contains('sidebar-collapsed');
  }
  if (wireSidebar && btnSidebar && main && sidebar) {
    btnSidebar.addEventListener('click', () => {
      const open = btnSidebar.getAttribute('aria-pressed') !== 'true';
      setSidebarOpen(open);
      // re-fit durante o slide (apps de zoom fit)
      if (opts.onSidebarChange) {
        const t0 = performance.now();
        const tick = (now) => {
          opts.onSidebarChange(open);
          if (now - t0 < 320) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    });
  }

  // ── zoom header ──────────────────────────────────────────────────────────
  function syncZoomLabel(pct) {
    const p = Math.round(+pct);
    if (zoomPctLabel) zoomPctLabel.textContent = p + '%';
    if (zoomPopVal) zoomPopVal.textContent = p + '%';
    if (zoomRange && document.activeElement !== zoomRange) zoomRange.value = String(p);
  }
  function setZoomFitPressed(on) {
    zoomFit?.setAttribute('aria-pressed', String(!!on));
  }
  function closeZoomPop() {
    if (!zoomPop || !zoomPct) return;
    zoomPop.hidden = true;
    zoomPct.setAttribute('aria-expanded', 'false');
  }
  function openZoomPop() {
    if (!zoomPop || !zoomPct) return;
    zoomPop.hidden = false;
    zoomPct.setAttribute('aria-expanded', 'true');
    const r = zoomPct.getBoundingClientRect();
    zoomPop.style.left = Math.max(8, r.left + (r.width - 200) / 2) + 'px';
    zoomPop.style.top = (r.bottom + 6) + 'px';
  }
  if (wireZoom) {
    zoomFit?.addEventListener('click', () => {
      opts.onZoomFit?.();
      setZoomFitPressed(true);
    });
    zoomPct?.addEventListener('click', () => {
      if (zoomPop?.hidden) openZoomPop();
      else closeZoomPop();
    });
    document.addEventListener('mousedown', (e) => {
      if (!zoomPop || zoomPop.hidden) return;
      if (e.target.closest?.('#zoomPop') || e.target.closest?.('#zoomPct')) return;
      closeZoomPop();
    });
    zoomRange?.addEventListener('input', () => {
      const pct = +zoomRange.value || 100;
      syncZoomLabel(pct);
      setZoomFitPressed(false);
      opts.onZoomPct?.(pct);
    });
    if (zoomPop) enhanceAll(zoomPop);
  }

  // ── hist buttons ─────────────────────────────────────────────────────────
  function setHistEnabled(canUndo, canRedo) {
    if (btnUndo) btnUndo.disabled = !canUndo;
    if (btnRedo) btnRedo.disabled = !canRedo;
  }

  return {
    main,
    sidebar,
    btnSidebar,
    zoomFit,
    zoomPct,
    zoomPop,
    zoomRange,
    btnUndo,
    btnRedo,
    segBtns,
    setSegment,
    setSidebarOpen,
    isSidebarOpen,
    syncZoomLabel,
    setZoomFitPressed,
    setHistEnabled,
    openZoomPop,
    closeZoomPop,
  };
}
