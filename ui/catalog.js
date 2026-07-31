/* Catálogo vivo de UI — “storybook” sem build (ES modules + paradigma.css).
 * Abra: ui/catalog.html (ou /ui/catalog.html no server).
 */

import { UI_REGISTRY } from './registry.js';
import { widthSeg, COL_ICON, ALIGN_ICON } from '../ui-segment.js';
import { openSwatchPop } from '../swatch.js';
import { enhanceAll } from '../range-snap.js';
import { registerUiIcons, uiIco } from '../ui-icons.js';
import { createBlockHandles } from '../ui-handles.js';
import { ensureFmtbarChrome } from '../ui-fmtbar.js';
import { initAppNav } from '../app-nav.js';
import { initFeedback } from '../feedback.js';

registerUiIcons();
initAppNav({ current: 'ui-catalog', title: 'UI Catalog' });
initFeedback({ nav: '#fbNav' });

const demos = document.getElementById('demos');
const nav = document.getElementById('sideNav');
const statusFilter = document.getElementById('statusFilter');

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function card(comp, bodyNode) {
  const statusClass = comp.status === 'ready' ? 'ok' : comp.status === 'partial' ? 'warn' : 'plan';
  const wrap = el(`
    <article class="demo-card" id="demo-${comp.id}" data-status="${comp.status}">
      <header class="demo-head">
        <div>
          <h2>${comp.title}</h2>
          <code class="demo-id">${comp.id}</code>
        </div>
        <span class="badge ${statusClass}">${comp.status}</span>
      </header>
      <p class="demo-when"><strong>Quando:</strong> ${comp.when}</p>
      <p class="demo-never"><strong>Nunca:</strong> ${comp.never}</p>
      <pre class="demo-import">${comp.importHint}</pre>
      <div class="demo-body"></div>
      ${comp.module ? `<p class="demo-mod">módulo: <code>${comp.module}</code></p>` : ''}
      ${comp.css?.length ? `<p class="demo-mod">css: <code>${comp.css.join(', ')}</code></p>` : ''}
    </article>`);
  if (bodyNode) wrap.querySelector('.demo-body').append(bodyNode);
  return wrap;
}

function buildDemo(comp) {
  switch (comp.demo) {
    case 'tokens': {
      const box = el('<div class="token-grid"></div>');
      for (const [name, sample] of [
        ['--ground', 'var(--ground)'],
        ['--violet', 'var(--violet)'],
        ['--lilac', 'var(--lilac)'],
        ['--mint', 'var(--mint)'],
        ['--ink', 'var(--ink)'],
        ['--muted', 'var(--muted)'],
        ['--hair', 'var(--hair)'],
        ['--ctrl-h', 'var(--ctrl-h)'],
      ]) {
        box.append(el(`
          <div class="token-cell">
            <div class="token-swatch" style="background:${sample}"></div>
            <code>${name}</code>
          </div>`));
      }
      return box;
    }
    case 'segment': {
      const box = el('<div class="stack"></div>');
      const seg = el(`
        <div class="segment" role="tablist">
          <button type="button" aria-selected="true">Configurações</button>
          <button type="button" aria-selected="false">Conteúdo</button>
        </div>`);
      seg.querySelectorAll('button').forEach((b) => {
        b.onclick = () => {
          seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
        };
      });
      box.append(seg);
      return box;
    }
    case 'widthSeg': {
      const box = el('<div class="stack"></div>');
      const f1 = el('<div class="field">Posição</div>');
      let col = 'full';
      const mountCol = () => {
        f1.querySelector('.segment')?.remove();
        f1.append(widthSeg(col, [
          { val: 'left', label: 'Coluna Esquerda', icon: COL_ICON.left },
          { val: 'full', label: 'Largura Total', icon: COL_ICON.full },
          { val: 'right', label: 'Coluna Direita', icon: COL_ICON.right },
        ], (v) => { col = v; mountCol(); }));
      };
      mountCol();
      const f2 = el('<div class="field">Alinhamento</div>');
      let align = 'left';
      const mountAl = () => {
        f2.querySelector('.segment')?.remove();
        f2.append(widthSeg(align, [
          { val: 'left', label: 'Esquerda', icon: ALIGN_ICON.left },
          { val: 'center', label: 'Centro', icon: ALIGN_ICON.center },
          { val: 'right', label: 'Direita', icon: ALIGN_ICON.right },
        ], (v) => { align = v; mountAl(); }));
      };
      mountAl();
      box.append(f1, f2);
      return box;
    }
    case 'field': {
      return el(`
        <div class="stack">
          <label class="field">Modo
            <select><option>Stories</option><option>Reels</option></select>
          </label>
          <div class="field">Posição (div.field — mesmo visual de label.field)</div>
        </div>`);
    }
    case 'fieldbtn': {
      const box = el('<div class="stack row-gap"></div>');
      box.append(
        el(`<button type="button" class="fieldbtn">${uiIco('repeat', 16)}<span>Substituir</span></button>`),
        el(`<button type="button" class="fieldbtn danger">${uiIco('trash', 16)}<span>Remover</span></button>`),
      );
      return box;
    }
    case 'float-panel': {
      const p = el(`
        <div class="float-panel" style="position:relative;left:auto;top:auto;z-index:1">
          <div class="eyebrow">Imagem</div>
          <div class="field">Posição</div>
          <label class="field"><span class="field-row">Escala <span class="field-val">100%</span></span>
            <input type="range" min="10" max="100" value="100" data-snaps="10,50,100">
          </label>
          <button type="button" class="fieldbtn danger">${uiIco('trash', 16)}<span>Remover</span></button>
        </div>`);
      enhanceAll(p);
      return p;
    }
    case 'float-menu': {
      return el(`
        <div class="float-menu" style="position:relative;left:auto;top:auto;z-index:1">
          <button type="button"><span class="dl-label">PNG</span><span class="dl-badge">Página</span></button>
          <button type="button"><span class="dl-label">JPG</span><span class="dl-badge">Página</span></button>
          <div class="dl-sep"></div>
          <button type="button"><span class="dl-label">ZIP</span><span class="dl-badge">Projeto</span></button>
        </div>`);
    }
    case 'swatch': {
      const btn = el('<button type="button" class="colorfield" style="width:100%;height:var(--ctrl-h);background:#4E39FF"></button>');
      const wrap = el('<div class="field">Cor de exemplo</div>');
      wrap.append(btn);
      btn.onclick = () => openSwatchPop(btn, (c) => { btn.style.background = c; }, '#4E39FF', { opacity: false });
      return wrap;
    }
    case 'range-snap': {
      const wrap = el(`
        <label class="field"><span class="field-row">Tamanho <span class="field-val"><span class="field-edit" contenteditable="true">24</span>px</span></span>
          <input type="range" min="10" max="72" step="1" value="24" data-snaps="10,14,18,24,32,48,72">
        </label>`);
      enhanceAll(wrap);
      return wrap;
    }
    case 'ui-icons': {
      const row = el('<div class="icon-row"></div>');
      for (const [key, style] of [
        ['menu', 'outline'], ['expand', 'outline'], ['arrow-undo', 'solid'],
        ['arrow-redo', 'solid'], ['options', 'outline'], ['layers', 'outline'],
        ['reorder-three', 'solid'], ['add', 'outline'], ['trash', 'outline'], ['repeat', 'outline'],
      ]) {
        const cell = el(`<div class="icon-cell" title="${key} ${style}">${uiIco(key, 18, style)}<code>${key}</code></div>`);
        row.append(cell);
      }
      return row;
    }
    case 'focus-ring': {
      return el(`
        <div class="focus-demo">
          <div class="focus-ring focus-sample">Texto com anel de foco</div>
          <div class="focus-ring focus-sample img">Imagem (mesmo anel)</div>
        </div>`);
    }
    case 'notion-handles': {
      const box = el(`
        <div class="stack">
          <p class="hint">Instância real de <code>createBlockHandles()</code> — clique o botão para posicionar no preview.</p>
          <div class="handle-stage" id="handleStageDemo">
            <div class="handle-target" id="handleTargetDemo">Bloco de exemplo</div>
          </div>
          <button type="button" class="fieldbtn" id="handleShowBtn">Mostrar alças neste bloco</button>
          <button type="button" class="fieldbtn" id="handleHideBtn">Esconder</button>
          <p class="hint" id="handleLog"></p>
        </div>`);
      // defer wire até append
      queueMicrotask(() => {
        const h = createBlockHandles({
          parent: document.body,
          onMenuAction({ action, id }) {
            const log = box.querySelector('#handleLog');
            if (log) log.textContent = `menu: ${action} @ ${id}`;
          },
          onAddClick() {
            const log = box.querySelector('#handleLog');
            if (log) log.textContent = '+ clicado (app decide o que inserir)';
          },
        });
        const target = box.querySelector('#handleTargetDemo');
        box.querySelector('#handleShowBtn')?.addEventListener('click', () => {
          h.placeAtElement(target, 'demo-block');
        });
        box.querySelector('#handleHideBtn')?.addEventListener('click', () => h.hide());
      });
      return box;
    }
    case 'fmtbar': {
      const box = el(`
        <div class="stack">
          <p class="hint">Shell real de <code>ensureFmtbarChrome()</code> — selecione o texto abaixo.</p>
          <div class="fmt-demo" id="fmtDemo" contenteditable="true">Selecione esta frase para ver a fmtbar.</div>
        </div>`);
      queueMicrotask(() => {
        const { fmtbar, positionFmtbar, closeFmtbar } = ensureFmtbarChrome({ captionMode: true });
        const demo = box.querySelector('#fmtDemo');
        const show = () => {
          const sel = getSelection();
          if (!sel || sel.isCollapsed || !demo.contains(sel.anchorNode)) {
            closeFmtbar();
            return;
          }
          positionFmtbar(sel.getRangeAt(0).getBoundingClientRect());
          fmtbar.querySelectorAll('.markbtn').forEach((b) => {
            try { b.classList.toggle('on', document.queryCommandState(b.dataset.cmd)); }
            catch { /* ignore */ }
          });
        };
        demo?.addEventListener('mouseup', () => setTimeout(show, 0));
        demo?.addEventListener('keyup', () => setTimeout(show, 0));
        fmtbar.addEventListener('mousedown', (e) => {
          if (!e.target.closest('input,select,textarea')) e.preventDefault();
        });
        fmtbar.querySelectorAll('.markbtn').forEach((btn) => {
          btn.addEventListener('click', () => {
            document.execCommand(btn.dataset.cmd);
            show();
          });
        });
      });
      return box;
    }
    case 'editor-shell': {
      return el(`
        <div class="stack">
          <p class="hint"><strong>ready</strong> — <code>bindEditorShell()</code> em <code>ui-shell.js</code> + CSS <code>body.app-editor</code>.</p>
          <ul class="hint-list">
            <li>Liga sidebar slide + <code>inert</code>, segment options/layers, zoom pop, ícones undo/menu/expand, chevrons de details</li>
            <li>App fornece HTML com ids canônicos e callbacks de domínio (<code>onZoomFit</code>, …)</li>
            <li>Stories já migrou; Diagramador mantém HTML do contrato (pode ligar o mesmo bind)</li>
          </ul>
          <pre class="demo-import">import { bindEditorShell } from './ui-shell.js';
const shell = bindEditorShell({
  onZoomFit() { /* state.zoom='fit'; applyZoom() */ },
  onZoomPct(pct) { /* state.zoom=pct/100 */ },
  onSidebarChange() { /* refit se fit */ },
});
shell.setSegment('documento');
shell.setHistEnabled(canUndo, canRedo);</pre>
          <p class="hint">Consumidor de referência: <code>stories.js</code> + <code>stories.html</code> (<code>class="app-editor"</code>).</p>
        </div>`);
    }
    default:
      return el(`<p class="hint">Sem demo interativa — ver import e status <strong>${comp.status}</strong>.</p>`);
  }
}

function render(filter = 'all') {
  demos.replaceChildren();
  nav.replaceChildren();
  for (const comp of UI_REGISTRY) {
    if (filter !== 'all' && comp.status !== filter) continue;
    const body = buildDemo(comp);
    demos.append(card(comp, body));
    const a = el(`<a href="#demo-${comp.id}" class="nav-item ${comp.status}"><span>${comp.title}</span><small>${comp.status}</small></a>`);
    nav.append(a);
  }
}

statusFilter?.addEventListener('change', () => render(statusFilter.value));
render('all');
