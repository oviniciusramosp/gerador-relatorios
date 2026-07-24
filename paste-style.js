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
