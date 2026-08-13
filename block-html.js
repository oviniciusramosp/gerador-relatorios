/* HTML de bloco de texto (parágrafo, título, legenda…).
 *
 * Chrome/Safari metem um <br> (às vezes <div><br></div>) no fim do
 * contenteditable pra o caret ter onde pousar. Sem tirar, o bloco ganha uma
 * linha vazia no foco/seleção e “encolhe” ao deselecionar — o hover/anel
 * roxo pinta essa linha fantasma como se fosse conteúdo.
 *
 * Tira SÓ o último placeholder. `a<br><br>` (Shift+Enter no fim) vira `a<br`.
 * Bloco vazio (`<br>` sozinho) fica: o caret e o :empty { min-height: 1lh }
 * precisam dele.
 */

const TRAILING_DIV_BR = /<div(?:\s[^>]*)?>\s*<br(?:\s[^>]*)?\s*\/?>\s*<\/div>\s*$/i;
const TRAILING_BR = /<br(?:\s[^>]*)?\s*\/?>\s*$/i;

/** Remove um único <br> / <div><br></div> colado no fim do HTML. */
export function stripTrailingPlaceholderBr(html) {
  const s = String(html ?? '');
  if (!s) return '';
  if (TRAILING_DIV_BR.test(s)) return s.replace(TRAILING_DIV_BR, '');
  return s.replace(TRAILING_BR, '');
}

function isIgnorable(n) {
  if (!n) return true;
  if (n.nodeType === 8) return true;
  if (n.nodeType === 3) return !n.nodeValue || !/[^\u00a0\s]/.test(n.nodeValue);
  return false;
}

function lastMeaningful(el) {
  let n = el.lastChild;
  while (n && isIgnorable(n)) n = n.previousSibling;
  return n;
}

function previousMeaningful(n) {
  let p = n.previousSibling;
  while (p && isIgnorable(p)) p = p.previousSibling;
  return p;
}

/** <br> solto, ou <div><br></div> / <p><br></p> vazio (Chrome no foco). */
export function isPlaceholderBreak(n) {
  if (!n || n.nodeType !== 1) return false;
  if (n.nodeName === 'BR') return true;
  if (n.nodeName !== 'DIV' && n.nodeName !== 'P') return false;
  const kids = [];
  for (const c of n.childNodes) if (!isIgnorable(c)) kids.push(c);
  return kids.length === 1 && kids[0].nodeName === 'BR' && !(n.textContent || '').trim();
}

/**
 * Marca o placeholder do fim com .br-ph (CSS display:none). Não mexe num
 * bloco que só tem o <br> — parágrafo em branco precisa da linha.
 */
export function markTrailingPlaceholderBr(el) {
  if (!el || !el.querySelectorAll) return;
  el.querySelectorAll('.br-ph').forEach((n) => n.classList.remove('br-ph'));
  const last = lastMeaningful(el);
  if (!last || !isPlaceholderBreak(last)) return;
  if (!previousMeaningful(last)) return;
  last.classList.add('br-ph');
}

export function applyBlockHtml(el, html) {
  if (!el) return;
  el.innerHTML = stripTrailingPlaceholderBr(html);
  markTrailingPlaceholderBr(el);
}

export function readBlockHtml(el) {
  if (!el) return '';
  markTrailingPlaceholderBr(el);
  return stripTrailingPlaceholderBr(el.innerHTML);
}
