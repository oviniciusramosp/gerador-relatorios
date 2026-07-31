/* Navegação entre ferramentas pelo título do header.
 *
 * Troca o <h1> do header por um botão com chevron ↓ que abre um menu
 * (Gráficos, Diagramador, Linhas do Tempo, Stories, Início).
 * CSS injetado uma vez — mesmo contrato de feedback.js / swatch.js.
 *
 *   import { initAppNav } from './app-nav.js';
 *   initAppNav(); // auto-detecta a página pela URL
 *   initAppNav({ current: 'stories' }); // força o item ativo
 */

/** @typedef {{ id: string, href: string, label: string, icon: string }} AppNavItem */

// SVGs outline 16×16 (stroke) — um por ferramenta
const ICO = {
  index: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 7.5L8 2.5l5.5 5"/><path d="M4 6.5V13a.5.5 0 0 0 .5.5H6.5v-3h3v3H11.5a.5.5 0 0 0 .5-.5V6.5"/></svg>`,
  graficos: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 13V8M8 13V3M13 13V6"/></svg>`,
  diagramacao: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 1.5h5.5L12.5 4.5V14a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V2A.5.5 0 0 1 4 1.5Z"/><path d="M9.5 1.5V4.5H12.5M5.5 8h5M5.5 10.5h5M5.5 13h3"/></svg>`,
  timelines: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v10M3 5h6.5a1.5 1.5 0 0 1 0 3H5.5a1.5 1.5 0 0 0 0 3H13"/></svg>`,
  stories: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="1.5" width="8" height="13" rx="1.5"/><path d="M7 12.5h2"/></svg>`,
  'ui-catalog': `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>`,
};

/** @type {AppNavItem[]} */
export const APP_NAV_ITEMS = [
  { id: 'index', href: 'index.html', label: 'Início', icon: ICO.index },
  { id: 'graficos', href: 'graficos.html', label: 'Gráficos', icon: ICO.graficos },
  { id: 'diagramacao', href: 'diagramacao.html', label: 'Diagramador', icon: ICO.diagramacao },
  { id: 'timelines', href: 'timelines.html', label: 'Linhas do Tempo', icon: ICO.timelines },
  { id: 'stories', href: 'stories.html', label: 'Criador de Stories', icon: ICO.stories },
  { id: 'ui-catalog', href: 'ui/catalog.html', label: 'UI Catalog', icon: ICO['ui-catalog'] },
];

const CHEV = `<svg class="app-nav-chev" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

let cssReady = false;
let mounted = false;

function ensureCss() {
  if (cssReady || typeof document === 'undefined') return;
  cssReady = true;
  const s = document.createElement('style');
  s.id = 'app-nav-css';
  s.textContent = `
    /* gap menor pro botão menu (sidebar) — compensa o padding-left do título */
    header .hleft { gap: .3rem; }

    .app-nav {
      position: relative;
      display: inline-flex;
      align-items: center;
      min-width: 0;
    }
    .app-nav-btn {
      display: inline-flex;
      align-items: center;
      gap: .22rem;
      max-width: 100%;
      margin: 0;
      /* padding-left generoso: o "D" de Diagramador não cola na borda do hover */
      padding: .28rem .4rem .28rem .55rem;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: inherit;
      font: inherit; /* herda o h1 (1rem no header; 2.6rem no index) */
      font-weight: 600;
      letter-spacing: -.01em;
      line-height: 1.2;
      cursor: pointer;
      text-align: left;
    }
    .app-nav-btn:hover {
      background: color-mix(in srgb, var(--lilac, #BAB1FF) 12%, transparent);
    }
    .app-nav-btn[aria-expanded="true"] {
      background: color-mix(in srgb, var(--violet, #4E39FF) 16%, transparent);
    }
    .app-nav-btn:focus-visible {
      outline: 2px solid var(--violet, #4E39FF);
      outline-offset: 2px;
    }
    .app-nav-label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .app-nav-chev {
      width: 12px;
      height: 12px;
      flex: none;
      color: var(--muted, #9a93c9);
      opacity: .95;
      transition: transform .12s ease;
    }
    .app-nav-btn[aria-expanded="true"] .app-nav-chev {
      transform: rotate(180deg);
      color: var(--ink, #fff);
    }
    #appNavMenu {
      position: fixed;
      z-index: 60;
      display: grid;
      gap: .1rem;
      min-width: 220px;
      max-width: min(300px, calc(100vw - 16px));
      padding: .3rem;
      border: 1px solid var(--hair-strong, rgba(186,177,255,.34));
      border-radius: 10px;
      background: color-mix(in srgb, var(--lilac, #BAB1FF) 10%, var(--ground, #0E0C1B));
      box-shadow: 0 16px 50px -16px #000;
    }
    #appNavMenu[hidden] { display: none; }
    #appNavMenu a {
      display: flex;
      align-items: center;
      gap: .65rem;
      /* padding-left generoso (ícone+texto não colados na borda do menu) */
      padding: .55rem 1rem .55rem 1.35rem;
      border-radius: 7px;
      color: inherit;
      text-decoration: none;
      font-size: .84rem;
      font-weight: 600;
      line-height: 1.25;
    }
    #appNavMenu a .app-nav-ico {
      flex: none;
      width: 16px;
      height: 16px;
      display: grid;
      place-items: center;
      color: var(--lilac, #BAB1FF);
    }
    #appNavMenu a .app-nav-ico svg {
      width: 16px;
      height: 16px;
      display: block;
    }
    #appNavMenu a:hover {
      background: color-mix(in srgb, var(--violet, #4E39FF) 16%, transparent);
    }
    #appNavMenu a:hover .app-nav-ico { color: var(--ink, #fff); }
    #appNavMenu a[aria-current="page"] {
      background: color-mix(in srgb, var(--violet, #4E39FF) 18%, transparent);
      color: var(--ink, #fff);
    }
    #appNavMenu a[aria-current="page"] .app-nav-ico { color: var(--mint, #29E899); }
    #appNavMenu a[aria-current="page"] .app-nav-item-label::after {
      content: " · atual";
      font-size: .62rem;
      font-weight: 600;
      letter-spacing: .06em;
      text-transform: uppercase;
      color: var(--mint, #29E899);
      font-stretch: 85%;
    }
    #appNavMenu .app-nav-item-label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `;
  document.head.appendChild(s);
}

/** Estamos sob /ui/ ? (catálogo em subpasta — hrefs do menu precisam de ../) */
function inUiDir(pathname = typeof location !== 'undefined' ? location.pathname : '') {
  const p = String(pathname || '');
  return /\/ui\//.test(p) || /\/ui$/.test(p);
}

/** Resolve href do menu a partir da página atual (root vs ui/). */
export function resolveAppNavHref(href, pathname = typeof location !== 'undefined' ? location.pathname : '') {
  const h = String(href || '');
  if (inUiDir(pathname)) {
    if (h.startsWith('ui/')) return h.slice(3); // ui/catalog.html → catalog.html
    return '../' + h;
  }
  return h;
}

/** Detecta o id da ferramenta pela URL atual. */
export function detectAppNavId(pathname = typeof location !== 'undefined' ? location.pathname : '') {
  const path = String(pathname || '');
  const base = path.split('/').pop() || '';
  const lower = base.toLowerCase();
  if (lower === 'catalog.html' || /\/ui\/catalog/i.test(path)) return 'ui-catalog';
  if (!lower || lower === 'index.html') return 'index';
  for (const it of APP_NAV_ITEMS) {
    const leaf = it.href.split('/').pop();
    if (leaf === lower || it.href === lower) return it.id;
  }
  // path sem .html (Pages às vezes serve /stories)
  for (const it of APP_NAV_ITEMS) {
    if (it.id !== 'index' && it.id !== 'ui-catalog' && lower.startsWith(it.id)) return it.id;
  }
  return 'index';
}

function positionMenu(btn, menu) {
  const r = btn.getBoundingClientRect();
  menu.hidden = false;
  const mw = menu.offsetWidth || 220;
  const mh = menu.offsetHeight || 200;
  let x = r.left;
  x = Math.min(Math.max(8, x), innerWidth - mw - 8);
  let y = r.bottom + 6;
  if (y + mh > innerHeight - 8) y = Math.max(8, r.top - mh - 6);
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
}

/**
 * @param {{ current?: string, title?: string, h1?: Element|string }=} opts
 */
export function initAppNav(opts = {}) {
  if (typeof document === 'undefined') return null;
  if (mounted) return document.getElementById('appNavBtn');

  // iframe embed: não polui o chrome embutido
  try {
    if (new URLSearchParams(location.search).has('embed')) return null;
  } catch { /* ignore */ }

  const h1 = opts.h1
    ? (typeof opts.h1 === 'string' ? document.querySelector(opts.h1) : opts.h1)
    : document.querySelector('header h1');
  if (!h1) return null;

  ensureCss();
  mounted = true;

  const current = opts.current || detectAppNavId();
  const labelText = (opts.title != null && String(opts.title)) || h1.textContent.trim() || 'Paradigma';

  const wrap = document.createElement('div');
  wrap.className = 'app-nav';
  wrap.id = 'appNav';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'appNavBtn';
  btn.className = 'app-nav-btn';
  btn.setAttribute('aria-haspopup', 'menu');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'appNavMenu');
  btn.title = 'Navegar entre ferramentas';
  btn.innerHTML = `<span class="app-nav-label"></span>${CHEV}`;
  btn.querySelector('.app-nav-label').textContent = labelText;

  const menu = document.createElement('div');
  menu.id = 'appNavMenu';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;

  for (const it of APP_NAV_ITEMS) {
    const a = document.createElement('a');
    a.href = resolveAppNavHref(it.href);
    a.setAttribute('role', 'menuitem');
    a.dataset.id = it.id;
    if (it.id === current) a.setAttribute('aria-current', 'page');
    a.innerHTML =
      `<span class="app-nav-ico">${it.icon}</span>` +
      `<span class="app-nav-item-label"></span>`;
    a.querySelector('.app-nav-item-label').textContent = it.label;
    // página atual: clique só fecha (sem reload desnecessário)
    if (it.id === current) {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        close();
      });
    }
    menu.appendChild(a);
  }

  function open() {
    positionMenu(btn, menu);
    btn.setAttribute('aria-expanded', 'true');
  }
  function close() {
    if (menu.hidden) return;
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }
  function toggle() {
    if (menu.hidden) open();
    else close();
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggle();
  });
  document.addEventListener('mousedown', (e) => {
    if (menu.hidden) return;
    if (e.target.closest('#appNavMenu') || e.target.closest('#appNavBtn')) return;
    close();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      e.preventDefault();
      close();
      btn.focus();
    }
  });
  addEventListener('resize', () => { if (!menu.hidden) positionMenu(btn, menu); });

  // troca h1 pelo botão, mantendo o lugar no fluxo do header
  h1.replaceWith(wrap);
  wrap.appendChild(btn);
  document.body.appendChild(menu);

  return btn;
}
