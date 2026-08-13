/* Pin de comentário + popover da thread — componente compartilhado.
 *
 * Uso (Diagramador):
 *   import { createCommentChrome } from './ui-comments.js';
 *   const comments = createCommentChrome({
 *     getHost(id) { return blockOrCoverItem(id); },
 *     getAnchorEl(id) { return envelopeEl(id); },
 *     getAlignEl(id) { return colLeftOfSamePage(id) || envelopeEl(id); },
 *     onChange({ id, thread }) { writeThread(host, thread); save(); },
 *   });
 *   comments.sync([{ id, selected }]);
 *   comments.position();
 *
 * CSS: paradigma.css (.blk-comment-pin, #commentPanel).
 * Ícones: ui-icons.js (chatbubble / chatbubble-ellipses / create / trash).
 *
 * O APP decide QUAIS ids mostrar (selecionado e/ou com thread). Este módulo
 * só cria o DOM, posiciona à esquerda do +, e aplica add/edit/del/resolve.
 */

import { registerUiIcons, uiIco } from './ui-icons.js';
import { handleLayout, HANDLE_GEOM } from './ui-handles.js';
import {
  threadOf, addMessage, editMessage, deleteMessage, toggleResolved,
} from './comments.js';

/**
 * @typedef {object} CommentChromeOpts
 * @property {HTMLElement} [parent]
 * @property {(id: string) => object|null} getHost
 * @property {(id: string) => Element|null} getAnchorEl
 * @property {(id: string) => Element|null} [getAlignEl] — X do pin (coluna esq. da página)
 * @property {(p: { id: string, thread: object }) => void} [onChange]
 * @property {(id: string) => void} [onOpen]
 */

/**
 * Cria (ou reusa) #commentPins + #commentPanel.
 * @param {CommentChromeOpts} opts
 */
export function createCommentChrome(opts = {}) {
  registerUiIcons();
  const parent = opts.parent || document.body;

  let pinsHost = document.getElementById('commentPins');
  if (!pinsHost) {
    pinsHost = document.createElement('div');
    pinsHost.id = 'commentPins';
    parent.appendChild(pinsHost);
  }

  let panel = document.getElementById('commentPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'commentPanel';
    panel.className = 'float-panel comment-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Comentários');
    parent.appendChild(panel);
  }

  let openId = null;
  let editingId = null;
  let replyOpen = false;

  function pinOf(id) {
    return pinsHost.querySelector(`.blk-comment-pin[data-id="${CSS.escape(id)}"]`);
  }

  function paintPin(btn, host) {
    const t = threadOf(host);
    const open = t.messages.length > 0 && !t.resolved;
    btn.classList.toggle('has-thread', open);
    btn.classList.toggle('is-resolved', !open && t.messages.length > 0);
    btn.innerHTML = uiIco(open ? 'chatbubble-ellipses' : 'chatbubble', open ? 16 : 12, open ? 'solid' : 'outline');
    btn.title = !t.messages.length ? 'Adicionar comentário'
      : open ? 'Comentários'
        : 'Comentários (concluído)';
    btn.setAttribute('aria-label', btn.title);
  }

  function ensurePin(id) {
    let btn = pinOf(id);
    if (btn) return btn;
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'blk-comment-pin';
    btn.dataset.id = id;
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      opts.onOpen?.(id);
      if (openId === id && !panel.hidden) close();
      else open(id);
    });
    pinsHost.appendChild(btn);
    return btn;
  }

  function positionPanel(anchor) {
    if (!anchor || panel.hidden) return;
    const r = anchor.getBoundingClientRect();
    const mw = panel.offsetWidth || 280;
    const mh = panel.offsetHeight || 200;
    let x = r.left - mw - 8;
    if (x < 8) x = r.right + 8;
    if (x + mw > innerWidth - 8) x = Math.max(8, innerWidth - mw - 8);
    let y = r.top;
    if (y + mh > innerHeight - 8) y = Math.max(8, innerHeight - mh - 8);
    panel.style.left = x + 'px';
    panel.style.top = y + 'px';
  }

  function position() {
    for (const btn of pinsHost.querySelectorAll('.blk-comment-pin')) {
      const el = opts.getAnchorEl?.(btn.dataset.id);
      if (!el) { btn.hidden = true; continue; }
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) { btn.hidden = true; continue; }
      const alignEl = opts.getAlignEl?.(btn.dataset.id) || el;
      const xr = alignEl && alignEl !== el ? alignEl.getBoundingClientRect() : r;
      const cBtn = btn.classList.contains('has-thread') ? HANDLE_GEOM.H_COMMENT_BTN : HANDLE_GEOM.H_BTN;
      const { midY, commentLeft } = handleLayout(r, cBtn, xr);
      btn.style.left = commentLeft + 'px';
      btn.style.top = midY + 'px';
      btn.hidden = false;
    }
    if (openId) positionPanel(pinOf(openId));
  }

  /**
   * @param {{ id: string, selected?: boolean }[]} entries
   */
  function sync(entries) {
    const want = new Set();
    for (const e of entries || []) {
      if (!e?.id) continue;
      want.add(e.id);
      const btn = ensurePin(e.id);
      btn.classList.toggle('is-selected', !!e.selected);
      paintPin(btn, opts.getHost?.(e.id));
    }
    for (const btn of [...pinsHost.querySelectorAll('.blk-comment-pin')]) {
      if (!want.has(btn.dataset.id)) btn.remove();
    }
    if (openId && !want.has(openId)) close();
    position();
  }

  function emit(next) {
    if (!openId) return;
    opts.onChange?.({ id: openId, thread: next });
    const btn = pinOf(openId);
    if (btn) paintPin(btn, opts.getHost?.(openId));
    renderPanel();
    position();
  }

  function current() {
    return threadOf(opts.getHost?.(openId));
  }

  function renderPanel() {
    const t = current();
    const has = t.messages.length > 0;
    panel.replaceChildren();

    const head = document.createElement('div');
    head.className = 'comment-head';
    const eye = document.createElement('p');
    eye.className = 'eyebrow';
    eye.textContent = t.resolved ? 'Concluídos' : has ? 'Comentários' : 'Novo comentário';
    head.appendChild(eye);
    panel.appendChild(head);

    if (has) {
      const list = document.createElement('div');
      list.className = 'comment-list';
      for (const msg of t.messages) {
        list.appendChild(renderMsg(msg, t));
      }
      panel.appendChild(list);
    }

    if (!has && !editingId) {
      panel.appendChild(renderCompose({ reply: false, autofocus: true }));
    } else if (has && !t.resolved && replyOpen && !editingId) {
      panel.appendChild(renderCompose({ reply: true, autofocus: true }));
    } else if (has && !t.resolved && !replyOpen && !editingId) {
      const reply = document.createElement('button');
      reply.type = 'button';
      reply.className = 'comment-reply';
      reply.textContent = 'Responder';
      reply.addEventListener('click', () => {
        replyOpen = true;
        renderPanel();
        position();
      });
      panel.appendChild(reply);
    }
  }

  function renderMsg(msg, t) {
    const row = document.createElement('div');
    row.className = 'comment-msg';
    row.dataset.id = msg.id;

    if (editingId === msg.id) {
      const ta = document.createElement('textarea');
      ta.rows = 3;
      ta.value = msg.text;
      ta.setAttribute('aria-label', 'Editar comentário');
      let done = false;
      const commit = () => {
        if (done) return;
        done = true;
        editingId = null;
        emit(editMessage(t, msg.id, ta.value));
      };
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
        if (e.key === 'Escape') {
          e.preventDefault();
          done = true;
          editingId = null;
          renderPanel();
          position();
        }
      });
      ta.addEventListener('blur', () => queueMicrotask(commit));
      row.append(ta);
      queueMicrotask(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });
      return row;
    }

    const text = document.createElement('div');
    text.className = 'comment-msg-text';
    text.textContent = msg.text;
    const actions = document.createElement('div');
    actions.className = 'comment-msg-actions';
    const checkBtn = iconAction(
      'checkmark-circle',
      t.resolved ? 'Reabrir' : 'Concluir',
      () => emit(toggleResolved(t)),
      t.resolved ? 'solid' : 'outline',
    );
    checkBtn.classList.toggle('is-on', t.resolved);
    checkBtn.setAttribute('aria-pressed', String(!!t.resolved));
    const editBtn = iconAction('create', 'Editar', () => {
      editingId = msg.id;
      replyOpen = false;
      renderPanel();
      position();
    });
    const delBtn = iconAction('trash', 'Excluir', () => {
      editingId = null;
      emit(deleteMessage(t, msg.id));
    });
    delBtn.classList.add('danger');
    actions.append(checkBtn, editBtn, delBtn);
    row.append(text, actions);
    return row;
  }

  function iconAction(icon, label, onClick, style = 'outline') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'comment-ico';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.innerHTML = uiIco(icon, 14, style);
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  function renderCompose({ reply, autofocus }) {
    const box = document.createElement('div');
    box.className = 'comment-compose';
    const ta = document.createElement('textarea');
    ta.rows = 3;
    ta.placeholder = reply ? 'Responder…' : 'Escrever um comentário';
    ta.setAttribute('aria-label', reply ? 'Responder' : 'Novo comentário');
    let done = false;
    const commit = () => {
      if (done) return;
      const before = current().messages.length;
      const next = addMessage(current(), ta.value);
      ta.value = '';
      if (next.messages.length === before) {
        if (reply) {
          done = true;
          replyOpen = false;
          renderPanel();
          position();
        }
        return;
      }
      done = true;
      replyOpen = false;
      emit(next);
    };
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
      if (e.key === 'Escape') {
        e.preventDefault();
        done = true;
        if (reply) { replyOpen = false; renderPanel(); position(); }
        else close();
      }
    });
    ta.addEventListener('blur', () => queueMicrotask(commit));
    box.append(ta);
    if (autofocus) queueMicrotask(() => ta.focus());
    return box;
  }

  function flushCompose() {
    if (!openId) return;
    if (editingId) {
      const editTa = panel.querySelector('.comment-msg textarea');
      if (editTa) {
        opts.onChange?.({ id: openId, thread: editMessage(current(), editingId, editTa.value) });
      }
      editingId = null;
    }
    const ta = panel.querySelector('.comment-compose textarea');
    if (!ta) return;
    const next = addMessage(current(), ta.value);
    ta.value = '';
    if (next.messages.length) {
      opts.onChange?.({ id: openId, thread: next });
      const btn = pinOf(openId);
      if (btn) paintPin(btn, opts.getHost?.(openId));
    }
  }

  function open(id) {
    if (!id) return;
    openId = id;
    editingId = null;
    replyOpen = false;
    panel.hidden = false;
    renderPanel();
    position();
    panel.querySelector('textarea')?.focus();
  }

  function close() {
    if (openId) flushCompose();
    openId = null;
    editingId = null;
    replyOpen = false;
    panel.hidden = true;
  }

  panel.addEventListener('mousedown', (e) => {
    if (!e.target.closest('textarea, input')) e.preventDefault();
  });

  document.addEventListener('pointerdown', (e) => {
    if (panel.hidden) return;
    if (e.target.closest?.('#commentPanel, .blk-comment-pin')) return;
    close();
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || panel.hidden) return;
    if (editingId) return;
    if (e.target && e.target.closest && e.target.closest('#commentPanel textarea')) return;
    close();
  });

  return {
    pinsHost,
    panel,
    get openId() { return openId; },
    sync,
    position,
    open,
    close,
  };
}
