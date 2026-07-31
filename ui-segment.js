/* Segment control de ícones — compartilhado (Diagramador, Stories, …).
 *
 * Visual: .segment / .segment.cols-3 / .segment.iconseg em paradigma.css.
 * NÃO redefinir height dos botões no app (o .segment já tem --ctrl-h + padding 2px).
 *
 * opts = [{ val, label, icon }, …]
 * 3+ opções → .cols-3; 2 → grid 2 colunas (default).
 */

/** Ícones de POSIÇÃO/LARGURA de coluna (quadro + faixa). */
export const COL_ICON = {
  left: '<svg viewBox="0 0 16 16"><rect x="1.5" y="2" width="13" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="3" y="4" width="4.5" height="8" fill="currentColor"/></svg>',
  full: '<svg viewBox="0 0 16 16"><rect x="1.5" y="2" width="13" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="3" y="4" width="10" height="8" fill="currentColor"/></svg>',
  right: '<svg viewBox="0 0 16 16"><rect x="1.5" y="2" width="13" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="8.5" y="4" width="4.5" height="8" fill="currentColor"/></svg>',
};

/** Ícones de alinhamento de TEXTO (barras). Não confundir com COL_ICON. */
export const ALIGN_ICON = {
  left: '<svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="2" rx="1" fill="currentColor"/><rect x="2" y="7" width="7" height="2" rx="1" fill="currentColor"/><rect x="2" y="11" width="9" height="2" rx="1" fill="currentColor"/></svg>',
  center: '<svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="2" rx="1" fill="currentColor"/><rect x="4.5" y="7" width="7" height="2" rx="1" fill="currentColor"/><rect x="3.5" y="11" width="9" height="2" rx="1" fill="currentColor"/></svg>',
  right: '<svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="2" rx="1" fill="currentColor"/><rect x="7" y="7" width="7" height="2" rx="1" fill="currentColor"/><rect x="5" y="11" width="9" height="2" rx="1" fill="currentColor"/></svg>',
};

/** Posição vertical (logo capa): faixa no topo / base do quadro. */
export const POS_ICON = {
  header: '<svg viewBox="0 0 16 16"><rect x="1.5" y="2" width="13" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="3" y="4" width="10" height="3" fill="currentColor"/></svg>',
  footer: '<svg viewBox="0 0 16 16"><rect x="1.5" y="2" width="13" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="3" y="9" width="10" height="3" fill="currentColor"/></svg>',
};

/**
 * Pílula de segment só com ícone.
 * @param {string} cur valor selecionado
 * @param {{val:string,label:string,icon:string}[]} opts
 * @param {(val:string)=>void} onPick
 * @returns {HTMLDivElement}
 */
export function widthSeg(cur, opts, onPick) {
  const wrap = document.createElement('div');
  wrap.className = 'segment iconseg' + (opts.length >= 3 ? ' cols-3' : '');
  wrap.setAttribute('role', 'tablist');
  for (const { val, label, icon } of opts) {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = label;
    b.innerHTML = icon;
    b.setAttribute('aria-selected', String(cur === val));
    // não rouba caret/seleção do contenteditable sob o popover
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.onclick = () => onPick(val);
    wrap.append(b);
  }
  return wrap;
}
