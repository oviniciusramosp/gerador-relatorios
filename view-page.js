/* Página visível do palco (chrome de sessão — não vai no .pdgm).
 *
 * kind: 'cover' | 'index' | 'back' | 'miolo'
 * page: índice do miolo (só kind=miolo)
 */

export function normalizeViewPage(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = raw.kind;
  if (kind === 'cover' || kind === 'index' || kind === 'back') return { kind };
  if (kind === 'miolo') {
    const page = +raw.page;
    if (!Number.isFinite(page) || page < 0) return { kind: 'miolo', page: 0 };
    return { kind: 'miolo', page: Math.floor(page) };
  }
  return null;
}

/** dataset da .page → chave, ou null se a página não for endereçável. */
export function viewPageFromDataset(ds) {
  if (!ds) return null;
  if (ds.cover === 'cover' || ds.cover === 'back') return { kind: ds.cover };
  if (ds.special === 'index') return { kind: 'index' };
  if (ds.page != null && ds.page !== '') {
    const page = +ds.page;
    if (Number.isFinite(page) && page >= 0) return { kind: 'miolo', page: Math.floor(page) };
  }
  return null;
}

export function viewPagesEqual(a, b) {
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'miolo') return a.page === b.page;
  return true;
}

/** Escolhe o descritor mais próximo da chave salva (miolo estourado → última). */
export function resolveViewPage(view, pages) {
  if (!Array.isArray(pages) || !pages.length) return null;
  const key = normalizeViewPage(view);
  if (!key) return pages[0];
  if (key.kind === 'miolo') {
    const miolo = pages.filter((p) => p && p.kind === 'miolo');
    if (!miolo.length) return pages[0];
    const exact = miolo.find((p) => p.page === key.page);
    if (exact) return exact;
    return miolo[Math.min(key.page, miolo.length - 1)];
  }
  return pages.find((p) => p && p.kind === key.kind) || pages[0];
}

/**
 * Página “atual” pelo eixo Y: a última cuja top está acima (ou em) viewportY.
 * `pages` já vem ordenado de cima pra baixo: [{ view, top }].
 */
export function pickViewPage(pages, viewportY) {
  if (!Array.isArray(pages) || !pages.length) return null;
  const y = +viewportY;
  const line = Number.isFinite(y) ? y : 0;
  let best = pages[0];
  for (const p of pages) {
    if (!p) continue;
    if (p.top <= line) best = p;
    else break;
  }
  return best.view || null;
}
