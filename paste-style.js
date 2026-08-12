/* Parsing PURO de estilos inline colados (Figma / Google Docs / Word) → marcas
 * semânticas. Sem DOM: string/objeto → objeto. É o núcleo testável da tarefa 10
 * (o resto, em inlineHtmlOf, precisa do DOM real do clipboard).
 *
 * Decisão de design (tarefa 10): o que é semântico vira TAG limpa (<b>/<i>/<u>/<s>),
 * porque o resto do editor (execCommand) sabe editar isso; cor e fundo, que não têm
 * tag, ficam num <span style> enxuto — os MESMOS atributos que o foreColor/hiliteColor
 * da tarefa 5 geram, então o pipeline de PDF já os imprime de graça. */

// 'rgb(41,232,153)' → '#29E899' · '#abc' → '#AABBCC' · 'transparent'/''/rgba alpha 0 → null.
// Nomes de cor (red, etc.) e formatos exóticos: null (ignora, não polui o paste).
export function cssColorToHex(v) {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  if (!s || s === 'transparent' || s === 'inherit' || s === 'initial' || s === 'currentcolor' || s === 'none') return null;
  const h = (x) => Math.max(0, Math.min(255, Math.round(+x))).toString(16).padStart(2, '0');
  const m = s.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/);
  if (m) {
    if (m[4] !== undefined && parseFloat(m[4]) === 0) return null;   // 100% transparente = sem cor
    return ('#' + h(m[1]) + h(m[2]) + h(m[3])).toUpperCase();
  }
  let hex = s.replace(/^#/, '');
  if (/^[0-9a-f]{3}$/.test(hex)) hex = hex.split('').map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/.test(hex) ? '#' + hex.toUpperCase() : null;
}

// style: objeto tipo CSSStyleDeclaration (camelCase) OU literal equivalente; tag: nome da tag.
// Retorna { bold, italic, underline, strike, color, bg } — cada um pronto pra virar marca.
export function marksFromStyle(style, tag) {
  const st = style || {};
  const deco = st.textDecoration || st.textDecorationLine || '';
  // atenção: o Google embrulha TUDO num <b style="font-weight:normal"> — por isso,
  // dentro de <b>/<strong>, o style vence a tag na decisão de negrito.
  const bold = (tag === 'b' || tag === 'strong')
    ? !(st.fontWeight && (st.fontWeight === 'normal' || +st.fontWeight < 600))
    : (st.fontWeight === 'bold' || +st.fontWeight >= 600);
  const italic = (tag === 'i' || tag === 'em' || st.fontStyle === 'italic');
  const underline = (tag === 'u' || deco.includes('underline'));
  const strike = (tag === 's' || tag === 'strike' || tag === 'del' || deco.includes('line-through'));
  // preto puro é o default do Google Docs/Word em CADA run — preservá-lo forçaria
  // preto sobre o corpo cinza (#4E4E4E) e "quebraria" o paste que hoje funciona.
  // Descarta → herda a cor do bloco. Cor de verdade (verde Figma etc.) passa.
  let color = cssColorToHex(st.color);
  if (color === '#000000') color = null;
  let bg = cssColorToHex(st.backgroundColor);
  if (bg === '#FFFFFF') bg = null;                 // fundo branco = sem highlight
  return { bold, italic, underline, strike, color, bg };
}

// ── paste em célula de tabela ────────────────────────────────────────────────
// Célula herda tipografia/cor da tabela. Colar do Docs/Word/Figma NÃO pode
// trazer font-size, font-family nem cor — só marcas semânticas + link + lista.

export function escapePasteHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Texto puro → HTML de célula (quebras viram <br>). */
export function cellPasteFromPlainText(text) {
  return escapePasteHtml(text).replace(/\r\n|\r|\n/g, '<br>');
}

/**
 * Sanitiza HTML colado em célula.
 * Mantém: <b><i><u><s>, <a href>, <br>, listas (• / 1.).
 * Descarta: color, background, font-size, font-family e qualquer outro style.
 *
 * @param {string} html
 * @param {{ root?: { childNodes: Iterable<any> } }} [opts]
 *   opts.root — nó raiz já parseado (testes sem DOMParser).
 *   Sem root, usa DOMParser no browser.
 */
export function sanitizeCellPasteHtml(html, opts = {}) {
  let root = opts.root || null;
  if (!root) {
    if (typeof DOMParser === 'undefined') {
      // Node / ambiente sem DOM: cai no plain (caller deve preferir text/plain)
      return cellPasteFromPlainText(String(html || '').replace(/<[^>]+>/g, ' '));
    }
    root = new DOMParser().parseFromString(String(html || ''), 'text/html').body;
  }
  return serializeCellPaste(root).replace(/(?:<br>\s*)+$/i, '').replace(/^(?:<br>\s*)+/i, '');
}

/**
 * Walk de DOM (ou mock com nodeType/tagName/style/childNodes/getAttribute).
 * Exportado pra teste com árvore fake sem jsdom.
 */
export function serializeCellPaste(node) {
  if (!node) return '';
  let out = '';
  const kids = node.childNodes || [];
  for (const n of kids) {
    if (n.nodeType === 3) {
      out += escapePasteHtml(n.nodeValue ?? n.textContent ?? '');
      continue;
    }
    if (n.nodeType !== 1) continue;
    const tag = String(n.tagName || '').toLowerCase();
    if (tag === 'br') {
      out += '<br>';
      continue;
    }
    // blocos de lista → bullets / numeração inline (célula não tem “bloco li”)
    if (tag === 'ul' || tag === 'ol') {
      const ordered = tag === 'ol';
      let i = 0;
      for (const li of n.childNodes || []) {
        if (li.nodeType !== 1 || String(li.tagName || '').toLowerCase() !== 'li') continue;
        i += 1;
        const inner = serializeCellPaste(li).trim();
        if (!inner) continue;
        if (out && !out.endsWith('<br>')) out += '<br>';
        out += (ordered ? `${i}. ` : '• ') + inner;
      }
      if (out && !out.endsWith('<br>')) out += '<br>';
      continue;
    }
    if (tag === 'li') {
      // li solto (sem ul) — trata como bullet
      const inner = serializeCellPaste(n).trim();
      if (!inner) continue;
      if (out && !out.endsWith('<br>')) out += '<br>';
      out += '• ' + inner;
      continue;
    }
    // parágrafos / divs: quebra de linha entre blocos
    if (tag === 'p' || tag === 'div' || tag === 'h1' || tag === 'h2' || tag === 'h3'
      || tag === 'h4' || tag === 'h5' || tag === 'h6' || tag === 'blockquote'
      || tag === 'tr' || tag === 'section' || tag === 'article') {
      const inner = serializeCellPaste(n);
      if (!inner.trim() && !inner.includes('<br>')) {
        // parágrafo vazio → uma quebra (separador de linha do Docs)
        if (out && !out.endsWith('<br>')) out += '<br>';
        continue;
      }
      if (out && !out.endsWith('<br>')) out += '<br>';
      out += inner;
      continue;
    }
    // células de planilha colada sem tab (HTML table) — junta com espaço/br
    if (tag === 'table' || tag === 'tbody' || tag === 'thead' || tag === 'tfoot') {
      out += serializeCellPaste(n);
      continue;
    }
    if (tag === 'td' || tag === 'th') {
      const inner = serializeCellPaste(n).trim();
      if (!inner) continue;
      if (out && !out.endsWith('<br>') && !out.endsWith(' ')) out += ' ';
      out += inner;
      continue;
    }
    if (tag === 'script' || tag === 'style' || tag === 'meta' || tag === 'link') continue;

    let inner = serializeCellPaste(n);
    if (!inner.trim() && !inner.includes('<br>')) continue;

    // só marcas semânticas — NUNCA color/bg/font-size/family
    const styleObj = styleObjectOf(n);
    const { bold, italic, underline, strike } = marksFromStyle(styleObj, tag);
    if (bold) inner = '<b>' + inner + '</b>';
    if (italic) inner = '<i>' + inner + '</i>';
    if (underline) inner = '<u>' + inner + '</u>';
    if (strike) inner = '<s>' + inner + '</s>';

    if (tag === 'a') {
      const href = (typeof n.getAttribute === 'function' ? n.getAttribute('href') : '') || '';
      const h = String(href).trim();
      if (h) {
        const url = /^([a-z][a-z0-9+.-]*:|\/|#)/i.test(h) ? h : 'https://' + h;
        inner = '<a href="' + escapePasteHtml(url) + '">' + inner + '</a>';
      }
    }
    out += inner;
  }
  return out;
}

/** CSSStyleDeclaration ou plain object → plain camelCase p/ marksFromStyle. */
function styleObjectOf(n) {
  const st = n.style;
  if (!st) return {};
  // mock de teste: já é plain object com fontWeight etc.
  if (typeof st.getPropertyValue !== 'function' && !st.cssText) return st;
  return {
    fontWeight: st.fontWeight,
    fontStyle: st.fontStyle,
    textDecoration: st.textDecoration,
    textDecorationLine: st.textDecorationLine,
    color: st.color,
    backgroundColor: st.backgroundColor,
  };
}
