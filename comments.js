/* Comentários de bloco do Diagramador — núcleo puro (sem DOM).
 *
 * Um bloco (miolo ou item de capa) tem no máximo UMA thread:
 *   { resolved: boolean, messages: [{ id, text, createdAt, updatedAt }] }
 *
 * Campo aditivo: ausente = sem comentários. Docs antigos abrem iguais.
 * serializeDoc dumpa o objeto inteiro — não precisa listar o campo à mão.
 */

const MSG_ID_RE = /^c[a-z0-9]+$/i;

export function commentId(now = Date.now(), rand = Math.random()) {
  return 'c' + now.toString(36) + rand.toString(36).slice(2, 6);
}

export function emptyThread() {
  return { resolved: false, messages: [] };
}

function asText(v) {
  return String(v == null ? '' : v).trim();
}

function normalizeMessage(raw, i = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const text = asText(raw.text);
  if (!text) return null;
  const createdAt = Number.isFinite(+raw.createdAt) ? +raw.createdAt : 0;
  const updatedAt = Number.isFinite(+raw.updatedAt) ? +raw.updatedAt : createdAt;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : `c-legacy-${i}`;
  return { id, text, createdAt, updatedAt };
}

/** Aceita thread, array legado de mensagens, ou lixo — devolve shape canônico. */
export function normalizeThread(raw) {
  if (!raw) return emptyThread();
  if (Array.isArray(raw)) {
    return {
      resolved: false,
      messages: raw.map(normalizeMessage).filter(Boolean),
    };
  }
  if (typeof raw !== 'object') return emptyThread();
  const src = Array.isArray(raw.messages) ? raw.messages : [];
  const messages = src.map(normalizeMessage).filter(Boolean);
  return {
    resolved: messages.length ? !!raw.resolved : false,
    messages,
  };
}

export function threadOf(host) {
  return normalizeThread(host && host.comments);
}

export function hasComments(host) {
  return threadOf(host).messages.length > 0;
}

/** Thread com mensagem em aberto (não concluída) — pin “cheio” e balão do índice. */
export function hasOpenComments(host) {
  const t = threadOf(host);
  return t.messages.length > 0 && !t.resolved;
}

/** Mensagens que entram no balão do índice. Thread concluída conta 0. */
export function countOpenMessages(host) {
  const t = threadOf(host);
  if (t.resolved) return 0;
  return t.messages.length;
}

export function writeThread(host, thread) {
  if (!host || typeof host !== 'object') return host;
  const t = normalizeThread(thread);
  if (!t.messages.length) delete host.comments;
  else host.comments = t;
  return host;
}

export function stripComments(host) {
  if (host && typeof host === 'object') delete host.comments;
  return host;
}

export function addMessage(thread, text, opts = {}) {
  const t = normalizeThread(thread);
  const body = asText(text);
  if (!body) return t;
  const now = opts.now != null ? +opts.now : Date.now();
  const id = opts.id || commentId(now, opts.rand);
  t.messages.push({
    id,
    text: body,
    createdAt: now,
    updatedAt: now,
  });
  return t;
}

export function editMessage(thread, id, text, opts = {}) {
  const t = normalizeThread(thread);
  const body = asText(text);
  if (!body) return t;
  const msg = t.messages.find((m) => m.id === id);
  if (!msg) return t;
  msg.text = body;
  msg.updatedAt = opts.now != null ? +opts.now : Date.now();
  return t;
}

export function deleteMessage(thread, id) {
  const t = normalizeThread(thread);
  t.messages = t.messages.filter((m) => m.id !== id);
  if (!t.messages.length) t.resolved = false;
  return t;
}

export function toggleResolved(thread) {
  const t = normalizeThread(thread);
  t.resolved = !t.resolved;
  return t;
}

/**
 * Contagem exclusiva por H1/H2 do índice flutuante.
 * Cada título dona os blocos até o próximo heading de nível igual ou mais alto.
 * Comentários antes do primeiro H1/H2 não entram em nenhum balão.
 */
export function countCommentsByHeading(blocks) {
  const counts = new Map();
  let currentId = null;
  for (const b of blocks || []) {
    if (!b) continue;
    if (b.type === 'h1' || b.type === 'h2') {
      currentId = b.id;
      if (currentId && !counts.has(currentId)) counts.set(currentId, 0);
    }
    const n = countOpenMessages(b);
    if (!n || !currentId) continue;
    counts.set(currentId, (counts.get(currentId) || 0) + n);
  }
  return counts;
}

export function countCommentsOnItems(items) {
  let n = 0;
  for (const it of items || []) n += countOpenMessages(it);
  return n;
}

/** Primeiro bloco com comentário em aberto na seção do heading (ou o próprio id). */
export function firstCommentedBlockId(blocks, headingId) {
  let inSection = false;
  let headingLevel = 0;
  for (const b of blocks || []) {
    if (!b) continue;
    if (b.id === headingId) {
      if (countOpenMessages(b)) return b.id;
      inSection = true;
      headingLevel = b.type === 'h1' ? 1 : 2;
      continue;
    }
    if (!inSection) continue;
    if (b.type === 'h1' || (b.type === 'h2' && headingLevel >= 2)) break;
    if (countOpenMessages(b)) return b.id;
  }
  return headingId;
}

/** Limpa threads vazias / lixo ao abrir .pdgm. Mutates doc. */
export function normalizeDocComments(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const clean = (host) => {
    if (!host || typeof host !== 'object') return;
    if (!Object.prototype.hasOwnProperty.call(host, 'comments')) return;
    const t = normalizeThread(host.comments);
    if (!t.messages.length) delete host.comments;
    else host.comments = t;
  };
  if (Array.isArray(doc.blocks)) {
    for (const b of doc.blocks) clean(b);
  }
  for (const cov of [doc.cover, doc.back]) {
    if (cov && Array.isArray(cov.items)) {
      for (const it of cov.items) clean(it);
    }
  }
  return doc;
}

export const COMMENT_MSG_ID_RE = MSG_ID_RE;
