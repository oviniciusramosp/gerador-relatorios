/* Encaixa blocos colados no host partido em [antes|depois] do caret/seleção.

 * Sem isto: colar um parágrafo sobre texto selecionado gerava um bloco novo
 * e mantinha o original. splitHtmlAt só via o início da seleção, então o
 * “depois” (seleção + resto) virava outro parágrafo — parecia paste antes
 * do bloco, não substituição.
 */

/**
 * @param {string} beforeHtml  HTML antes do caret / início da seleção
 * @param {string} afterHtml   HTML depois do caret / fim da seleção (seleção já descartada)
 * @param {{ type: string, html?: string }[]} blocks
 * @returns {{
 *   hostHtml: string,
 *   insert: { type: string, html?: string, remnant?: boolean }[],
 * }}
 */
export function mergePastedBlocks(beforeHtml, afterHtml, blocks) {
  const before = String(beforeHtml ?? '');
  const after = String(afterHtml ?? '');
  if (!Array.isArray(blocks) || !blocks.length) {
    return { hostHtml: before + after, insert: [] };
  }

  const first = blocks[0];
  const hostHtml = first.type === 'p' ? before + (first.html || '') : before;
  const insert = (first.type === 'p' ? blocks.slice(1) : blocks.slice()).map((b) => ({ ...b }));

  if (!after) return { hostHtml, insert };

  // um único parágrafo: emenda no mesmo bloco (substitui a seleção / caret)
  if (!insert.length && first.type === 'p') {
    return { hostHtml: hostHtml + after, insert: [] };
  }
  const last = insert[insert.length - 1];
  if (last && last.type === 'p') {
    last.html = (last.html || '') + after;
    return { hostHtml, insert };
  }
  insert.push({ type: 'p', html: after, remnant: true });
  return { hostHtml, insert };
}
