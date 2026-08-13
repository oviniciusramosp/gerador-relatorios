/* Nota de rodapé: bloco que NÃO entra no fluxo do miolo.
 *
 * Sem isto, a nota competiria por CONTENT_H (e empurraria o texto)
 * ou sumiria na faixa entre o fim da coluna (754) e a linha do rodapé (803).
 * assignFootnotes decide a página: a do último bloco de fluxo anterior.
 */

export const FOOTNOTE_RULE_GAP = 6;   // folga entre a última nota e a linha do rodapé

/** 'default' = estilo Rodapé (⋮ da nota); 'p' = tipografia viva do Parágrafo. */
export function noteStyleOf(b) {
  return b && b.noteStyle === 'p' ? 'p' : 'default';
}

/** Nota da página Índice/Resumo — não entra no miolo. */
export function isIndexFootnote(b) {
  return !!(b && b.type === 'footnote' && b.scope === 'index');
}

/** Espaço (px) entre o fim da coluna de conteúdo e a linha do rodapé. */
export function footnoteDeadZone(contentTop, contentH, ruleBotBottom, ruleH, gap) {
  const noteBottom = ruleBotBottom - (ruleH || 0) - (gap || 0);
  return Math.max(0, noteBottom - (contentTop + contentH));
}

/** CSS `bottom` da zona de notas: encosta acima da linha do rodapé + gap. */
export function footnoteZoneBottom(pageH, ruleBotBottom, ruleH, gap) {
  return pageH - (ruleBotBottom - (ruleH || 0) - (gap || 0));
}

/**
 * Agrupa notas na página do último bloco de fluxo que as precede.
 * pageOf(block) → índice da última página em que o bloco aparece, ou null.
 * pagebreak sem página (PDF, a barra não renderiza) avança 1.
 *
 * @param {{ type?: string, placement?: string }[]} blocks
 * @param {(b: object) => number|null|undefined} pageOf
 * @returns {object[][]}  byPage[i] = notas da página i
 */
export function assignFootnotes(blocks, pageOf) {
  const byPage = [];
  let curPage = 0;
  const push = (b, pi) => {
    const i = Math.max(0, pi | 0);
    (byPage[i] || (byPage[i] = [])).push(b);
  };
  for (const b of blocks || []) {
    if (!b || b.placement === 'right') continue;
    if (b.type === 'footnote') {
      if (b.scope === 'index') continue;   // página Índice/Resumo, não o miolo
      if (b.pinPage != null && Number.isFinite(+b.pinPage)) {
        push(b, +b.pinPage);
        continue;
      }
      push(b, curPage);
      continue;
    }
    if (b.type === 'pagebreak') {
      const p = pageOf(b);
      curPage = p != null ? (p | 0) + 1 : curPage + 1;
      continue;
    }
    const p = pageOf(b);
    if (p != null) curPage = p | 0;
  }
  return byPage;
}
