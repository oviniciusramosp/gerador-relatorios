/* Feedback → GitHub Issue (prefill no browser, sem token).
 *
 *   import { initFeedback, openFeedbackReport } from './feedback.js';
 *   initFeedback(); // botão no header + modal
 *   openFeedbackReport({ type:'bug', title, desc, steps, fileName, askAttachFile });
 *
 * Tipos: bug | feature | melhoria.
 * Opcional: seletor de elemento (id preferido; senão seletor estável + path).
 * Abre issues/new com title/body/labels — o usuário confirma no GitHub logado.
 * Anexo: a URL do GitHub não envia binários; se askAttachFile, mostramos um
 * banner pedindo para arrastar o .zip/.json na página do issue ao publicar.
 *
 * CSS injetado uma vez pelo módulo (mesmo contrato do swatch.js). */

const REPO = 'oviniciusramosp/gerador-relatorios';
const LABELS = {
  bug: 'bug',
  feature: 'enhancement',
  melhoria: 'enhancement',
};
const TYPE_PREFIX = {
  bug: 'bug',
  feature: 'feat',
  melhoria: 'melhoria',
};
const TYPE_TITLE = {
  bug: 'Bug',
  feature: 'Feature',
  melhoria: 'Melhoria',
};

let mounted = false;
let cssReady = false;
let uiRef = null; // { root, banner } — setado no init; openFeedbackReport usa
let state = {
  type: 'bug',
  element: null, // { id, selector, tag, text, path }
  picking: false,
  // metadados do arquivo que falhou (só nome) — banner pede anexo manual no GitHub
  attachHint: null, // { name: string } | null
};

// ── CSS ──────────────────────────────────────────────────────────────────────
function ensureCss() {
  if (cssReady) return;
  cssReady = true;
  const s = document.createElement('style');
  s.id = 'pdgm-feedback-css';
  s.textContent = `
/* ion-icon name="bug-outline" — botão só ícone no header */
#fbBtn {
  display: inline-grid; place-items: center;
  width: var(--ctrl-h, 2rem); height: var(--ctrl-h, 2rem);
  padding: 0; border-radius: var(--ctrl-r, 9px);
  flex: none;
}
#fbBtn svg { width: 16px; height: 16px; display: block; }
#fbRoot { position: fixed; inset: 0; z-index: 80; }
#fbRoot[hidden] { display: none !important; }
#fbRoot .fb-backdrop {
  position: absolute; inset: 0; background: rgba(0,0,0,.55);
}
#fbRoot .fb-panel {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: min(480px, calc(100vw - 2rem));
  max-height: min(88dvh, 720px);
  display: grid; grid-template-rows: auto 1fr auto;
  background: var(--ground); color: var(--ink);
  border: 1px solid var(--hair-strong); border-radius: 10px;
  box-shadow: 0 24px 60px -20px #000;
}
#fbRoot .fb-head {
  display: flex; align-items: center; justify-content: space-between; gap: .75rem;
  padding: .85rem 1rem; border-bottom: 1px solid var(--hair);
}
#fbRoot .fb-head h2 { margin: 0; font-size: .95rem; font-weight: 600; letter-spacing: -.01em; }
#fbRoot .fb-x {
  border: 0; background: transparent; color: var(--muted); cursor: pointer;
  font-size: 1rem; padding: .2rem .45rem; border-radius: 6px; line-height: 1;
}
#fbRoot .fb-x:hover { background: color-mix(in srgb, var(--lilac) 14%, transparent); color: var(--ink); }
#fbRoot .fb-body {
  padding: .9rem 1rem; overflow-y: auto; display: grid; gap: .7rem; align-content: start;
}
#fbRoot .fb-foot {
  display: flex; gap: .45rem; justify-content: flex-end; flex-wrap: wrap;
  padding: .75rem 1rem; border-top: 1px solid var(--hair);
}
#fbRoot label.field textarea {
  min-height: 88px; resize: vertical; font-size: .82rem; line-height: 1.45;
}
#fbRoot #fbPick { width: 100%; text-align: center; }
#fbRoot .fb-el-picked {
  display: flex; gap: .4rem; align-items: baseline; flex-wrap: wrap;
  font-size: .74rem; color: var(--muted);
}
#fbRoot .fb-el-picked code {
  font-family: ui-monospace, "SF Mono", monospace;
  font-size: .72rem; color: var(--mint); word-break: break-all;
}
#fbRoot .fb-el-picked button {
  font-size: .72rem; padding: .15rem .45rem; margin-left: auto;
}
#fbRoot #fbAttachBanner[hidden] { display: none !important; }
#fbRoot .fb-attach-banner {
  display: grid; gap: .25rem;
  padding: .65rem .75rem; border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--violet) 40%, var(--hair-strong));
  background: color-mix(in srgb, var(--violet) 12%, transparent);
  font-size: .74rem; line-height: 1.4; color: var(--ink);
}
#fbRoot .fb-attach-banner strong { font-weight: 600; }
#fbRoot .fb-attach-banner code {
  font-family: ui-monospace, "SF Mono", monospace;
  font-size: .72rem; color: var(--mint); word-break: break-all;
}
#fbRoot .fb-attach-banner .muted { color: var(--muted); font-size: .7rem; }
#fbRoot .segment { margin: 0; }
body.fb-picking, body.fb-picking * { cursor: crosshair !important; }
#fbPickBanner {
  position: fixed; left: 50%; top: 12px; transform: translateX(-50%);
  z-index: 90; display: flex; align-items: center; gap: .75rem;
  padding: .55rem .85rem; border-radius: 999px;
  background: var(--violet); color: #fff; font-size: .82rem; font-weight: 600;
  box-shadow: 0 12px 30px -12px #000; max-width: calc(100vw - 2rem);
}
#fbPickBanner[hidden] { display: none !important; }
#fbPickBanner button {
  background: rgba(255,255,255,.18); border: 0; color: #fff;
  border-radius: 999px; padding: .25rem .65rem; font-size: .74rem; font-weight: 600;
}
#fbPickBanner button:hover { background: rgba(255,255,255,.28); }
.fb-hl {
  outline: 2px solid var(--mint) !important;
  outline-offset: 2px !important;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--mint) 28%, transparent) !important;
}
@media print {
  #fbBtn, #fbRoot, #fbPickBanner { display: none !important; }
}
`;
  document.head.appendChild(s);
}

// ── seletor de elemento ──────────────────────────────────────────────────────
function cssEscape(s) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s);
  return String(s).replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

function isUnique(sel) {
  try { return document.querySelectorAll(sel).length === 1; } catch { return false; }
}

/** Melhor identificador estável pro report — id > seletor curto > path. */
export function describeElement(el) {
  if (!el || el.nodeType !== 1) return null;
  const tag = el.tagName.toLowerCase();
  const id = el.id || '';
  const classes = [...el.classList].filter((c) => c && c !== 'fb-hl' && !c.startsWith('fb-'));
  const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);

  let selector = '';
  if (id && isUnique(`#${cssEscape(id)}`)) {
    selector = `#${id}`;
  } else {
    // data-* comuns no app
    for (const a of el.attributes || []) {
      if (!a.name.startsWith('data-') || !a.value) continue;
      if (['data-type', 'data-seg', 'data-pane', 'data-cmd', 'data-styletype', 'data-sw', 'data-id'].includes(a.name)
          || a.name.endsWith('-id') || a.name === 'data-block-id') {
        const val = String(a.value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const cand = `${tag}[${a.name}="${val}"]`;
        if (isUnique(cand)) { selector = cand; break; }
      }
    }
    if (!selector && classes.length) {
      const cand = `${tag}.${classes.map(cssEscape).join('.')}`;
      if (isUnique(cand)) selector = cand;
    }
    if (!selector) {
      // path curto a partir de um ancestral com id
      const parts = [];
      let n = el;
      let guard = 0;
      while (n && n.nodeType === 1 && n !== document.body && guard++ < 8) {
        let part = n.tagName.toLowerCase();
        if (n.id) {
          parts.unshift(`#${n.id}`);
          break;
        }
        const cls = [...n.classList].filter((c) => c !== 'fb-hl' && !c.startsWith('fb-'))[0];
        if (cls) part += `.${cssEscape(cls)}`;
        const parent = n.parentElement;
        if (parent) {
          const sibs = [...parent.children].filter((c) => c.tagName === n.tagName);
          if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(n) + 1})`;
        }
        parts.unshift(part);
        n = parent;
      }
      selector = parts.join(' > ');
    }
  }

  // path legível (debug)
  const path = (() => {
    const parts = [];
    let n = el;
    let g = 0;
    while (n && n.nodeType === 1 && g++ < 6) {
      let p = n.tagName.toLowerCase();
      if (n.id) p += `#${n.id}`;
      else if (n.classList?.length) {
        const c = [...n.classList].find((x) => x !== 'fb-hl' && !x.startsWith('fb-'));
        if (c) p += `.${c}`;
      }
      parts.unshift(p);
      n = n.parentElement;
    }
    return parts.join(' > ');
  })();

  return { id, selector, tag, text, path };
}

// ── DOM do modal ─────────────────────────────────────────────────────────────
function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// ion-icon name="bug-outline" (path de ionicons-lib / Ionicons MIT)
const BUG_OUTLINE_SVG = `<svg viewBox="0 0 512 512" fill="none" stroke="currentColor" stroke-width="32" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M370 378c28.89 23.52 46 46.07 46 86M142 378c-28.89 23.52-46 46.06-46 86M384 208c28.89-23.52 32-56.07 32-96M128 206c-28.89-23.52-32-54.06-32-94M464 288.13h-80M128 288.13H48M256 192v256"/><path d="M256 448c-70.4 0-128-57.6-128-128v-96.07c0-65.07 57.6-96 128-96h0c70.4 0 128 25.6 128 96V320c0 70.4-57.6 128-128 128"/><path d="M179.43 143.52a49.1 49.1 0 0 1-3.43-15.73A80 80 0 0 1 255.79 48h.42A80 80 0 0 1 336 127.79a41.9 41.9 0 0 1-3.12 14.3"/></svg>`;

function buildUi() {
  const root = el(`
    <div id="fbRoot" hidden role="dialog" aria-modal="true" aria-labelledby="fbTitle">
      <div class="fb-backdrop" data-fb-close></div>
      <div class="fb-panel">
        <div class="fb-head">
          <h2 id="fbTitle">Reportar Bug ou Solicitar Melhoria e Features</h2>
          <button type="button" class="fb-x" data-fb-close title="Fechar" aria-label="Fechar">✕</button>
        </div>
        <div class="fb-body">
          <div class="segment cols-3" id="fbType" role="tablist" aria-label="Tipo">
            <button type="button" data-type="bug" aria-selected="true">Bug</button>
            <button type="button" data-type="feature" aria-selected="false">Feature</button>
            <button type="button" data-type="melhoria" aria-selected="false">Melhoria</button>
          </div>
          <label class="field">Título
            <input id="fbTitleIn" type="text" maxlength="120" placeholder="Resumo curto" autocomplete="off">
          </label>
          <label class="field" id="fbDescLab">Descrição
            <textarea id="fbDesc" placeholder="O que acontece? O que você esperava?"></textarea>
          </label>
          <label class="field" id="fbStepsLab">Passos para reproduzir (opcional)
            <textarea id="fbSteps" placeholder="1. …&#10;2. …&#10;3. …"></textarea>
          </label>
          <label class="field" id="fbElLab">Elemento (opcional)
            <button type="button" id="fbPick">Selecionar Elemento na Tela</button>
            <div class="fb-el-picked" id="fbElBox" hidden></div>
          </label>
          <div id="fbAttachBanner" class="fb-attach-banner" hidden role="note">
            <strong>Anexe o arquivo no GitHub</strong>
            <span>Ao publicar o issue, arraste <code id="fbAttachName">o arquivo</code> para a página do GitHub (área de comentário / anexos). O prefill da URL não envia binários.</span>
            <span class="muted">O GitHub aceita anexo por drag-and-drop no formulário do issue — use o mesmo .zip/.json que falhou ao abrir.</span>
          </div>
        </div>
        <div class="fb-foot">
          <button type="button" data-fb-close>Cancelar</button>
          <button type="button" class="primary" id="fbSubmit">Cadastrar no GitHub</button>
        </div>
      </div>
    </div>
  `);
  const banner = el(`
    <div id="fbPickBanner" hidden>
      <span>Clique no elemento com problema · Esc cancela</span>
      <button type="button" id="fbPickCancel">Cancelar</button>
    </div>
  `);
  document.body.append(root, banner);
  return { root, banner };
}

function pageName() {
  const p = location.pathname.split('/').pop() || 'index.html';
  return p || 'index.html';
}

function toolLabel() {
  const p = pageName();
  if (p.includes('diagramacao')) return 'Diagramação';
  if (p.includes('grafico')) return 'Gráficos';
  if (p.includes('timeline')) return 'Linhas do tempo';
  if (p === '' || p === 'index.html') return 'Home';
  return p;
}

function setType(type, ui) {
  state.type = type in TYPE_TITLE ? type : 'bug';
  ui.root.querySelectorAll('#fbType button').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.type === state.type));
  });
  const isBug = state.type === 'bug';
  ui.root.querySelector('#fbStepsLab').hidden = !isBug;
  ui.root.querySelector('#fbDesc').placeholder = isBug
    ? 'O que acontece? O que você esperava?'
    : state.type === 'feature'
      ? 'Qual feature você quer? Em que tela / fluxo?'
      : 'O que melhorar? Como está hoje e como deveria ficar?';
  ui.root.querySelector('#fbDescLab').firstChild.textContent = isBug ? 'Descrição' : 'Pedido';
}

function renderElementBox(ui) {
  const box = ui.root.querySelector('#fbElBox');
  const pick = ui.root.querySelector('#fbPick');
  const info = state.element;
  if (!info) {
    box.hidden = true;
    box.innerHTML = '';
    pick.textContent = 'Selecionar Elemento na Tela';
    return;
  }
  // confirmação compacta (sem copiar) — o detalhe vai no final da descrição do issue
  const label = info.id ? `#${info.id}` : info.selector;
  box.hidden = false;
  box.innerHTML = `<span>Selecionado: <code>${escapeHtml(label)}</code></span>
    <button type="button" id="fbClearEl">Limpar</button>`;
  pick.textContent = 'Trocar elemento…';
  box.querySelector('#fbClearEl')?.addEventListener('click', () => {
    state.element = null;
    renderElementBox(ui);
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatElementBlock(element) {
  if (!element) return '';
  const lines = ['', '---', '', '### Elemento escolhido'];
  if (element.id) lines.push(`- **id:** \`#${element.id}\``);
  lines.push(`- **seletor:** \`${element.selector}\``);
  lines.push(`- **tag:** \`${element.tag}\``);
  if (element.text) lines.push(`- **texto:** ${element.text}`);
  lines.push(`- **path:** \`${element.path}\``);
  return lines.join('\n');
}

function formatAttachHintBlock(hint) {
  if (!hint?.name) return '';
  return [
    '', '---', '', '### Arquivo do erro',
    `- **nome:** \`${hint.name}\``,
    '',
    '_Anexe este arquivo no issue (arraste na página do GitHub). O prefill da URL não envia binários._',
  ].join('\n');
}

function buildIssue({ type, title, desc, steps, element, attachHint }) {
  const prefix = TYPE_PREFIX[type] || 'bug';
  const fullTitle = title.trim()
    ? `[${prefix}] ${title.trim()}`
    : `[${prefix}] (sem título)`;

  const lines = [];
  lines.push(`## Tipo`);
  lines.push(TYPE_TITLE[type] || type);
  lines.push('');
  lines.push(type === 'bug' ? '## O que acontece' : '## Pedido');
  lines.push(desc.trim() || '_sem descrição_');
  // elemento no final da descrição (não no UI com "copiar seletor")
  if (element) lines.push(formatElementBlock(element));
  if (attachHint) lines.push(formatAttachHintBlock(attachHint));
  lines.push('');

  if (type === 'bug' && steps.trim()) {
    lines.push('## Passos para reproduzir');
    lines.push(steps.trim());
    lines.push('');
  }

  lines.push('## Ambiente');
  lines.push(`- **ferramenta:** ${toolLabel()}`);
  lines.push(`- **página:** \`${pageName()}\``);
  lines.push(`- **URL:** ${location.href}`);
  lines.push(`- **viewport:** ${window.innerWidth}×${window.innerHeight}`);
  lines.push(`- **user-agent:** ${String(navigator.userAgent || '').slice(0, 220)}`);
  lines.push('');
  lines.push('---');
  lines.push('_Aberto pelo botão Reportar do gerador-relatorios._');

  return {
    title: fullTitle.slice(0, 200),
    body: lines.join('\n'),
    labels: LABELS[type] || 'bug',
  };
}

/** Sempre nova aba — <a target=_blank> evita fallback que troca a aba atual. */
function openInNewTab(url) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function issueUrl(payload) {
  const u = new URL(`https://github.com/${REPO}/issues/new`);
  u.searchParams.set('title', payload.title);
  u.searchParams.set('body', payload.body);
  if (payload.labels) u.searchParams.set('labels', payload.labels);
  return u.toString();
}

// ── picker ───────────────────────────────────────────────────────────────────
function startPicker(ui) {
  if (state.picking) return;
  state.picking = true;
  ui.root.hidden = true;
  ui.banner.hidden = false;
  document.body.classList.add('fb-picking');

  let last = null;
  const over = (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest('#fbPickBanner') || t.closest('#fbRoot') || t.id === 'fbBtn') return;
    if (last && last !== t) last.classList.remove('fb-hl');
    last = t;
    t.classList.add('fb-hl');
  };
  const click = (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest('#fbPickBanner')) return;
    e.preventDefault();
    e.stopPropagation();
    if (t.id === 'fbBtn') return;
    state.element = describeElement(t);
    stopPicker(ui, { reopen: true });
  };
  const key = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      stopPicker(ui, { reopen: true });
    }
  };
  // capture: pega antes dos handlers do app (menus, etc.)
  document.addEventListener('mouseover', over, true);
  document.addEventListener('click', click, true);
  document.addEventListener('keydown', key, true);
  state._pick = { over, click, key, last: () => last, setLast: (n) => { last = n; } };
}

function stopPicker(ui, { reopen = false } = {}) {
  if (!state.picking) return;
  state.picking = false;
  document.body.classList.remove('fb-picking');
  ui.banner.hidden = true;
  const p = state._pick;
  if (p) {
    document.removeEventListener('mouseover', p.over, true);
    document.removeEventListener('click', p.click, true);
    document.removeEventListener('keydown', p.key, true);
    const last = p.last?.();
    if (last) last.classList.remove('fb-hl');
    state._pick = null;
  }
  document.querySelectorAll('.fb-hl').forEach((n) => n.classList.remove('fb-hl'));
  if (reopen) {
    ui.root.hidden = false;
    renderElementBox(ui);
  }
}

// ── banner “anexe no GitHub” ─────────────────────────────────────────────────
function renderAttachBanner(ui) {
  const banner = ui.root.querySelector('#fbAttachBanner');
  if (!banner) return;
  const hint = state.attachHint;
  if (!hint?.name && !hint?.force) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  const nameEl = banner.querySelector('#fbAttachName');
  if (nameEl) nameEl.textContent = hint.name || 'o arquivo que falhou';
}

// ── open / close ─────────────────────────────────────────────────────────────
function openModal(ui) {
  ui.root.hidden = false;
  setType(state.type, ui);
  renderElementBox(ui);
  renderAttachBanner(ui);
  queueMicrotask(() => ui.root.querySelector('#fbTitleIn')?.focus());
}

function closeModal(ui) {
  if (state.picking) stopPicker(ui, { reopen: false });
  ui.root.hidden = true;
}

/**
 * Abre o modal de report já preenchido (toast de erro, etc.).
 * @param {{
 *   type?: 'bug'|'feature'|'melhoria',
 *   title?: string,
 *   desc?: string,
 *   steps?: string,
 *   fileName?: string,
 *   askAttachFile?: boolean,
 * }} [opts]
 */
export function openFeedbackReport(opts = {}) {
  if (typeof document === 'undefined') return false;
  // garante UI montada (ex.: chamada antes do init — raro)
  if (!uiRef) initFeedback();
  const ui = uiRef;
  if (!ui) return false;

  state.type = opts.type && opts.type in TYPE_TITLE ? opts.type : 'bug';
  state.element = null;
  state.attachHint = (opts.askAttachFile || opts.fileName)
    ? { name: opts.fileName || '', force: !!opts.askAttachFile }
    : null;

  const titleIn = ui.root.querySelector('#fbTitleIn');
  const descIn = ui.root.querySelector('#fbDesc');
  const stepsIn = ui.root.querySelector('#fbSteps');
  if (titleIn) titleIn.value = opts.title || '';
  if (descIn) descIn.value = opts.desc || '';
  if (stepsIn) stepsIn.value = opts.steps || '';

  openModal(ui);
  return true;
}

// ── init ─────────────────────────────────────────────────────────────────────
/**
 * @param {{ nav?: Element|string, label?: string }=} opts
 *   nav — onde colocar o botão (default: `header nav` ou cria um nav no header)
 */
export function initFeedback(opts = {}) {
  if (typeof document === 'undefined') return null;
  if (mounted) return document.getElementById('fbBtn');
  // iframe embed: sem botão (a diagramação já tem o próprio)
  try {
    if (new URLSearchParams(location.search).has('embed')) return null;
  } catch { /* ignore */ }

  ensureCss();
  mounted = true;

  let nav = opts.nav
    ? (typeof opts.nav === 'string' ? document.querySelector(opts.nav) : opts.nav)
    : document.querySelector('header nav');
  if (!nav) {
    const header = document.querySelector('header') || document.body;
    nav = document.createElement('nav');
    nav.style.marginLeft = 'auto';
    nav.style.display = 'flex';
    nav.style.gap = '.4rem';
    nav.style.alignItems = 'center';
    header.appendChild(nav);
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'fbBtn';
  btn.title = 'Reportar bug ou solicitar feature/melhoria';
  btn.setAttribute('aria-label', 'Reportar bug ou solicitar feature/melhoria');
  // ion-icon name="bug-outline"
  btn.innerHTML = BUG_OUTLINE_SVG;
  nav.appendChild(btn);

  const ui = buildUi();
  uiRef = ui;
  setType('bug', ui);

  btn.addEventListener('click', () => openModal(ui));
  ui.root.querySelectorAll('[data-fb-close]').forEach((n) => {
    n.addEventListener('click', () => closeModal(ui));
  });
  ui.root.querySelector('#fbType').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-type]');
    if (!b) return;
    setType(b.dataset.type, ui);
  });
  ui.root.querySelector('#fbPick').addEventListener('click', () => startPicker(ui));
  ui.banner.querySelector('#fbPickCancel').addEventListener('click', () => {
    stopPicker(ui, { reopen: true });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !ui.root.hidden && !state.picking) closeModal(ui);
  });

  ui.root.querySelector('#fbSubmit').addEventListener('click', () => {
    const title = ui.root.querySelector('#fbTitleIn').value;
    const desc = ui.root.querySelector('#fbDesc').value;
    const steps = ui.root.querySelector('#fbSteps').value;
    if (!title.trim() && !desc.trim()) {
      ui.root.querySelector('#fbTitleIn').focus();
      return;
    }
    const payload = buildIssue({
      type: state.type,
      title,
      desc,
      steps,
      element: state.element,
      attachHint: state.attachHint,
    });
    openInNewTab(issueUrl(payload));
    closeModal(ui);
  });

  return btn;
}

// self-check leve (node): `node feedback.js`
export function _testDescribe() {
  // só no browser; no node devolve null
  if (typeof document === 'undefined') return 'skip';
  const d = document.createElement('div');
  d.id = 'fb-test-unique-id';
  document.body.appendChild(d);
  const info = describeElement(d);
  d.remove();
  return info?.selector === '#fb-test-unique-id' ? 'ok' : info;
}

if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].endsWith('feedback.js')) {
  // smoke sem DOM: só montagem da URL do GitHub
  const pure = issueUrl({ title: '[bug] x', body: 'hello\n\nworld', labels: 'bug' });
  const ok = pure.includes('github.com/oviniciusramosp/gerador-relatorios/issues/new')
    && pure.includes('labels=bug')
    && /title=.*bug/.test(pure)
    && pure.includes('body=hello');
  console.log(ok ? 'feedback.js ok' : pure);
  process.exit(ok ? 0 : 1);
}
