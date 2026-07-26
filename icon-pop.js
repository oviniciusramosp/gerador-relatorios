/* Picker de ícone — componente compartilhado (timeline, gráfico de bolhas, callout).
 *
 * Uso:  openIconPop(botao, (key) => { ... }, keyAtual, opts?)
 *       paintIconBtn(botao, key, style?)
 *
 * opts:
 *   styleToggle — mostra Solid | Outline no topo (callout)
 *   style       — 'solid' | 'outline' (default 'outline')
 *   onStyle     — (style) => void  quando o usuário troca o toggle
 *
 * O CSS mora em paradigma.css (.icon-pop e filhos).
 */
import { ICONS, iconSvg, isTextIcon, textIconLabel, allIcons, findIcon } from './timeline-icons.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
// o iconSvg posiciona em x/y absolutos (é feito pro SVG do renderer); dentro de
// um botão HTML isso desloca o desenho, então o x="0" y="0" sai fora
const glifo = (key, style = 'outline', preferLib = false) =>
  iconSvg(key, { x: 0, y: 0, w: 24, h: 24 }, 'currentColor', 1.8, style, preferLib).replace(/ x="0" y="0"/, '');

export function paintIconBtn(btn, key, style = 'outline', preferLib = false) {
  btn.innerHTML = isTextIcon(key)
    ? `<span class="badge">${esc(textIconLabel(key))}</span>`
    : key && findIcon(key, style, preferLib) ? glifo(key, style, preferLib)
      : '<span class="badge">—</span>';
}

let iconPop = null;
function closeIconPop() {
  if (!iconPop) return;
  removeEventListener('pointerdown', outsideIcon);
  iconPop.remove(); iconPop = null;
}
function outsideIcon(e) { if (iconPop && !iconPop.contains(e.target)) closeIconPop(); }

const mkBtn = (label, title, onclick) => {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = label; b.title = title; b.onclick = onclick;
  return b;
};

export function openIconPop(anchor, pick, current, opts = {}) {
  closeIconPop();
  let style = opts.style === 'solid' ? 'solid' : 'outline';
  const styleToggle = !!opts.styleToggle;
  const onStyle = typeof opts.onStyle === 'function' ? opts.onStyle : null;

  iconPop = document.createElement('div');
  iconPop.className = 'icon-pop';
  const label = (t) => { const d = document.createElement('div'); d.className = 'ip-label'; d.textContent = t; iconPop.append(d); };

  // toggle Solid / Outline — só no callout (opts.styleToggle)
  if (styleToggle) {
    const tog = document.createElement('div');
    tog.className = 'ip-style';
    tog.setAttribute('role', 'tablist');
    tog.setAttribute('aria-label', 'Estilo do ícone');
    const solidBtn = document.createElement('button');
    solidBtn.type = 'button'; solidBtn.textContent = 'Solid'; solidBtn.title = 'Ícones preenchidos';
    const outlineBtn = document.createElement('button');
    outlineBtn.type = 'button'; outlineBtn.textContent = 'Outline'; outlineBtn.title = 'Ícones em traço';
    const syncTog = () => {
      solidBtn.setAttribute('aria-selected', String(style === 'solid'));
      outlineBtn.setAttribute('aria-selected', String(style === 'outline'));
    };
    solidBtn.onclick = () => {
      if (style === 'solid') return;
      style = 'solid'; syncTog(); onStyle?.(style); pinta();
    };
    outlineBtn.onclick = () => {
      if (style === 'outline') return;
      style = 'outline'; syncTog(); onStyle?.(style); pinta();
    };
    syncTog();
    tog.append(solidBtn, outlineBtn);
    iconPop.append(tog);
  }

  // busca com ícone de lupa (Ionicons search-outline)
  const MAX = 96;
  const searchWrap = document.createElement('div');
  searchWrap.className = 'ip-search-wrap';
  const searchIco = document.createElement('span');
  searchIco.className = 'ip-search-ico';
  searchIco.setAttribute('aria-hidden', 'true');
  searchIco.innerHTML = glifo('search', 'outline', true) || '';
  const busca = document.createElement('input');
  busca.type = 'search'; busca.placeholder = 'buscar ícone…';
  busca.setAttribute('aria-label', 'Buscar ícone');
  busca.className = 'ip-search';
  searchWrap.append(searchIco, busca);
  iconPop.append(searchWrap);

  const grid = document.createElement('div');
  grid.className = 'ip-grid';

  // callout (styleToggle): só Ionicons oficiais; charts/timelines: casa + lib
  const CASA = styleToggle ? [] : Object.keys(ICONS);
  const preferLib = styleToggle;
  const norm = (v) => String(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  function pinta() {
    const todos = allIcons(style, { libOnly: styleToggle });
    const LIB = Object.keys(todos).filter((k) => !ICONS[k]);
    const q = norm(busca.value.trim());
    grid.innerHTML = '';
    // "Sem ícone" — célula vazia (sem traço, sem badge); pick('') remove o ícone do callout
    if (!q) {
      const none = document.createElement('button');
      none.type = 'button'; none.className = 'ip-none';
      none.title = 'Sem ícone';
      none.setAttribute('aria-label', 'Sem ícone');
      if (!current) none.classList.add('on');
      none.onclick = () => { pick(''); closeIconPop(); };
      grid.append(none);
    }
    const hit = (k) => !q || norm(k).includes(q) || norm(todos[k]?.label || '').includes(q);
    const lista = styleToggle
      ? Object.keys(todos).filter(hit).sort()
      : [...CASA.filter(hit), ...LIB.filter(hit)];
    for (const key of lista.slice(0, MAX)) {
      if (!findIcon(key, style, preferLib) && !isTextIcon(key)) continue;
      const b = document.createElement('button');
      b.type = 'button'; b.title = `${todos[key]?.label || key} (${key})`;
      b.innerHTML = glifo(key, style, preferLib);
      if (key === current) b.classList.add('on');
      b.onclick = () => { pick(key); closeIconPop(); };
      grid.append(b);
    }
  }
  busca.oninput = pinta;
  pinta();
  iconPop.append(grid);

  label('Sigla no lugar do ícone');
  const row = document.createElement('div');
  row.className = 'ip-row';
  const inp = document.createElement('input');
  inp.type = 'text'; inp.placeholder = 'ex.: S&P, ETF'; inp.maxLength = 6;
  inp.value = isTextIcon(current) ? textIconLabel(current) : '';
  inp.setAttribute('aria-label', 'Sigla');
  // botão check (mesma altura do input) no lugar de "Usar"
  const ok = document.createElement('button');
  ok.type = 'button'; ok.className = 'ip-ok';
  ok.title = 'Usar a sigla';
  ok.setAttribute('aria-label', 'Usar a sigla');
  ok.innerHTML = glifo('checkmark', 'outline', true) || '✓';
  ok.onclick = () => {
    const v = inp.value.trim();
    if (v) { pick('txt:' + v); closeIconPop(); }
  };
  inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); ok.click(); } };
  row.append(inp, ok);
  iconPop.append(row);

  document.body.append(iconPop);
  const r = anchor.getBoundingClientRect(), pw = iconPop.offsetWidth, ph = iconPop.offsetHeight;
  iconPop.style.left = Math.max(6, Math.min(r.left, innerWidth - pw - 6)) + 'px';
  iconPop.style.top = (r.bottom + 4 + ph > innerHeight ? Math.max(6, r.top - 4 - ph) : r.bottom + 4) + 'px';
  busca.focus();
  setTimeout(() => addEventListener('pointerdown', outsideIcon), 0);
}
