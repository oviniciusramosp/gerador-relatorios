/* Barra de formatação flutuante + mini-editor de link — shell DOM compartilhado.
 *
 *   import { ensureFmtbarChrome } from './ui-fmtbar.js';
 *   const { fmtbar, linkedit, closeFmtbar, closeLinkEdit, positionFmtbar } = ensureFmtbarChrome({
 *     captionMode: true, // Stories: sem seletor de tipo
 *     withLink: false,   // Stories: sem hyperlink (export de imagem)
 *     withHiliteStyle: true, // Stories: menu de estilo de highlight com prévia
 *   });
 *
 * CSS: paradigma.css (#fmtbar, #linkedit, .hilite-style-menu).
 * A lógica de execCommand / tipos de bloco fica no app (domain).
 */

/**
 * @param {{
 *   parent?: HTMLElement,
 *   captionMode?: boolean,
 *   withTypeSelect?: boolean,
 *   withLink?: boolean,
 *   withHiliteStyle?: boolean,
 * }} [opts]
 */
export function ensureFmtbarChrome(opts = {}) {
  const parent = opts.parent || document.body;
  const withType = opts.withTypeSelect !== false && !opts.captionMode;
  // default true (Diagramador); Stories desliga — link em PNG de story não faz sentido
  const withLink = opts.withLink !== false;
  // Stories: botão + menu de estilo do highlight (com prévia visual)
  const withHiliteStyle = !!opts.withHiliteStyle;

  let fmtbar = document.getElementById('fmtbar');
  if (!fmtbar) {
    fmtbar = document.createElement('div');
    fmtbar.id = 'fmtbar';
    fmtbar.hidden = true;
    parent.appendChild(fmtbar);
  }

  // só injeta markup se vazio (permite HTML estático no Diagramador)
  if (!fmtbar.querySelector('.markbtn')) {
    const typeHtml = withType
      ? `<select class="typeselect" title="Tipo de bloco">
          <option value="h1">H1</option>
          <option value="h2">H2</option>
          <option value="h3">H3</option>
          <option value="p">Parágrafo</option>
          <option value="li">Lista de Pontos</option>
          <option value="ol">Lista Numérica</option>
          <option value="check">Checklist</option>
          <option value="quote">Citação</option>
        </select>
        <span class="sep"></span>`
      : '';
    const linkHtml = withLink
      ? `<button type="button" class="linkbtn" data-cmd="link" title="Link"><svg viewBox="0 0 512 512" fill="none" stroke="currentColor" stroke-width="36" stroke-linecap="round" stroke-linejoin="round"><path d="M208,352H144a96,96,0,0,1,0-192h64"/><path d="M304,160h64a96,96,0,0,1,0,192H304"/><line x1="163.29" y1="256" x2="350.71" y2="256"/></svg></button>
      <span class="sep"></span>`
      : '';
    // botão à DIREITA da cor de destaque; menu separado (#hiliteStyleMenu)
    const hiliteStyleHtml = withHiliteStyle
      ? `<button type="button" class="hilite-style-btn" title="Estilo do destaque" aria-label="Estilo do destaque" aria-haspopup="listbox" aria-expanded="false" aria-controls="hiliteStyleMenu">
          <span class="hilite-style-label">Sólido</span>
          <svg class="hilite-style-chev" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>`
      : '';
    fmtbar.innerHTML = `
      ${typeHtml}
      <button type="button" class="markbtn" data-cmd="bold" title="Negrito (⌘B)" style="font-weight:700">B</button>
      <button type="button" class="markbtn" data-cmd="italic" title="Itálico (⌘I)" style="font-style:italic">I</button>
      <button type="button" class="markbtn" data-cmd="underline" title="Sublinhado (⌘U)" style="text-decoration:underline">U</button>
      <button type="button" class="markbtn" data-cmd="strikeThrough" title="Tachado" style="text-decoration:line-through">S</button>
      <span class="sep"></span>
      ${linkHtml}
      <button type="button" class="colorbtn cb-fore" data-cmd="foreColor" title="Cor do texto">A</button>
      <button type="button" class="colorbtn cb-back" data-cmd="hiliteColor" title="Destaque (cor de fundo)">A</button>
      ${hiliteStyleHtml}
    `;
  }
  if (opts.captionMode) fmtbar.classList.add('caption-mode');

  let linkedit = document.getElementById('linkedit');
  if (withLink && !linkedit) {
    linkedit = document.createElement('div');
    linkedit.id = 'linkedit';
    linkedit.hidden = true;
    linkedit.innerHTML = `
      <input id="linkUrl" type="url" placeholder="https://…" spellcheck="false" aria-label="URL do link">
      <button type="button" id="linkApply" title="Aplicar link">✓</button>
      <button type="button" id="linkRemove" title="Remover link" hidden>Remover</button>
    `;
    parent.appendChild(linkedit);
  }

  // menu de estilos de highlight (fora da fmtbar — position fixed, z acima)
  let hiliteStyleMenu = document.getElementById('hiliteStyleMenu');
  if (withHiliteStyle && !hiliteStyleMenu) {
    hiliteStyleMenu = document.createElement('div');
    hiliteStyleMenu.id = 'hiliteStyleMenu';
    hiliteStyleMenu.className = 'hilite-style-menu';
    hiliteStyleMenu.hidden = true;
    hiliteStyleMenu.setAttribute('role', 'listbox');
    hiliteStyleMenu.setAttribute('aria-label', 'Estilo do destaque');
    const items = [
      ['solid', 'Sólido'],
      ['marker', 'Marcador'],
      ['brush', 'Pincel'],
      ['underline', 'Traço'],
      ['rounded', 'Pill'],
      ['none', 'Nenhum'],
    ];
    hiliteStyleMenu.innerHTML = items.map(([val, label]) =>
      `<button type="button" role="option" data-style="${val}" aria-selected="false">`
      + `<span class="hl-prev hl-prev-${val}">${label}</span>`
      + `</button>`
    ).join('');
    parent.appendChild(hiliteStyleMenu);
  }

  const hiliteStyleBtn = withHiliteStyle
    ? fmtbar.querySelector('.hilite-style-btn')
    : null;

  function closeFmtbar() {
    fmtbar.hidden = true;
    if (hiliteStyleMenu) hiliteStyleMenu.hidden = true;
    if (hiliteStyleBtn) hiliteStyleBtn.setAttribute('aria-expanded', 'false');
  }
  function closeLinkEdit() {
    if (linkedit) linkedit.hidden = true;
  }

  /**
   * Posiciona a fmtbar acima/abaixo do rect (viewport).
   * @param {DOMRect|{left:number,top:number,bottom:number,width:number,height:number}} rect
   */
  function positionFmtbar(rect) {
    fmtbar.hidden = false;
    const bw = fmtbar.offsetWidth || 280;
    const bh = fmtbar.offsetHeight || 36;
    let x = rect.left + (rect.width || 0) / 2 - bw / 2;
    x = Math.max(8, Math.min(x, innerWidth - bw - 8));
    let y = rect.top - bh - 8;
    if (y < 8) y = rect.bottom + 8;
    fmtbar.style.left = x + 'px';
    fmtbar.style.top = y + 'px';
  }

  /**
   * @param {DOMRect|{left:number,top:number,bottom:number}} rect
   */
  function positionLinkEdit(rect) {
    if (!linkedit) return;
    linkedit.hidden = false;
    const bw = linkedit.offsetWidth || 280;
    const bh = linkedit.offsetHeight || 40;
    linkedit.style.left = Math.max(8, Math.min(rect.left, innerWidth - bw - 8)) + 'px';
    linkedit.style.top = (rect.top - bh - 8 >= 8 ? rect.top - bh - 8 : rect.bottom + 8) + 'px';
  }

  /** Ancora o menu de estilo sob o botão (ou acima se não couber). */
  function positionHiliteStyleMenu() {
    if (!hiliteStyleMenu || !hiliteStyleBtn || hiliteStyleMenu.hidden) return;
    const r = hiliteStyleBtn.getBoundingClientRect();
    const mw = hiliteStyleMenu.offsetWidth || 168;
    const mh = hiliteStyleMenu.offsetHeight || 220;
    let x = r.left;
    if (x + mw > innerWidth - 8) x = Math.max(8, r.right - mw);
    let y = r.bottom + 6;
    if (y + mh > innerHeight - 8) y = Math.max(8, r.top - mh - 6);
    hiliteStyleMenu.style.left = x + 'px';
    hiliteStyleMenu.style.top = y + 'px';
  }

  return {
    fmtbar,
    linkedit: linkedit || null,
    typeSelect: fmtbar.querySelector('.typeselect'),
    hiliteStyleBtn,
    hiliteStyleMenu: hiliteStyleMenu || null,
    /** @deprecated use hiliteStyleBtn — mantido nulo p/ não quebrar imports antigos */
    hiliteSelect: null,
    closeFmtbar,
    closeLinkEdit,
    positionFmtbar,
    positionLinkEdit,
    positionHiliteStyleMenu,
  };
}
