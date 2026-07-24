/* Menu "/" de tipos de bloco (estilo Notion) — trilha B (t1).
 *
 *   const slash = initSlashMenu({ defs, onPick })
 *     defs   — [{ type, label, icon }]  (a MESMA paleta #blocktypes, sem duplicar)
 *     onPick — (def, blockId) => void   (aplicar o tipo escolhido)
 *   retorna { open(blockId, filtro), close(), isOpen() }
 *
 * O host (diagramacao.js) chama open() a cada tecla enquanto o bloco começa com "/…"
 * (o texto depois da barra é o filtro). Navegação ↑/↓, Enter aplica, Esc fecha, clique
 * aplica. O keydown é CAPTURE no document → vence o handler de Enter do bloco (bubble em
 * #pages), então Enter escolhe o item em vez de quebrar o parágrafo. O CSS é injetado uma
 * vez pelo próprio módulo. */

export function initSlashMenu({ defs, onPick }) {
  let open = false, curId = null, items = [], sel = 0;

  const pop = document.createElement('div');
  pop.className = 'slash-pop'; pop.hidden = true;
  document.body.appendChild(pop);

  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  function paint() {
    pop.replaceChildren();
    if (!items.length) {
      const e = document.createElement('div'); e.className = 'slash-empty'; e.textContent = 'nenhum tipo';
      pop.appendChild(e); return;
    }
    items.forEach((def, i) => {
      const row = document.createElement('button');
      row.type = 'button'; row.className = 'slash-row' + (i === sel ? ' on' : '');
      const ic = document.createElement('span'); ic.className = 'slash-ico'; ic.innerHTML = def.icon || '';
      const lb = document.createElement('span'); lb.textContent = def.label;
      row.append(ic, lb);
      row.addEventListener('mousedown', (e) => e.preventDefault());   // não rouba o caret do bloco
      row.addEventListener('click', () => choose(i));
      pop.appendChild(row);
    });
  }

  function place(id) {
    const host = document.querySelector(`#pages [data-id="${id}"]`);
    if (!host) return;
    const r = host.getBoundingClientRect();
    pop.hidden = false;                                  // precisa estar visível pra medir
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    const x = Math.min(r.left, innerWidth - pw - 8);
    const y = r.bottom + 4 + ph > innerHeight ? Math.max(8, r.top - 4 - ph) : r.bottom + 4;
    pop.style.left = Math.max(8, x) + 'px';
    pop.style.top = y + 'px';
  }

  function choose(i) {
    const def = items[i]; if (!def) { api.close(); return; }
    const id = curId;
    api.close();
    onPick(def, id);
  }

  // keydown CAPTURE no document → roda antes do handler de Enter do bloco (bubble em #pages)
  document.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, items.length - 1); paint(); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); paint(); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); choose(sel); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); api.close(); }
  }, true);

  const api = {
    open(id, filtro) {
      curId = id;
      const f = norm(filtro);
      items = f ? defs.filter(d => norm(d.label).includes(f) || norm(d.type).includes(f)) : defs.slice();
      sel = 0; open = true;
      paint(); place(id);
    },
    close() { open = false; curId = null; pop.hidden = true; },
    isOpen() { return open; },
  };
  return api;
}

// CSS do componente — injetado uma vez
(function injectCss() {
  if (document.getElementById('slash-css')) return;
  const s = document.createElement('style'); s.id = 'slash-css';
  s.textContent = `
  .slash-pop {
    position: fixed; z-index: 72; width: 14rem; max-height: 60vh; overflow-y: auto;
    display: flex; flex-direction: column; gap: 1px; padding: .35rem;
    border: 1px solid var(--hair-strong); border-radius: 9px;
    background: color-mix(in srgb, var(--lilac) 8%, var(--ground)); box-shadow: 0 18px 50px -20px #000;
  }
  .slash-pop[hidden] { display: none; }
  .slash-row {
    display: flex; align-items: center; gap: .55rem; text-align: left;
    padding: .38rem .45rem; border: 1px solid transparent; border-radius: 6px;
    background: transparent; color: var(--ink); cursor: pointer; font-stretch: 85%; font-size: .8rem;
  }
  .slash-row:hover { background: color-mix(in srgb, var(--violet) 14%, transparent); }
  .slash-row.on { border-color: var(--violet); background: color-mix(in srgb, var(--violet) 16%, transparent); }
  .slash-ico { flex: none; width: 22px; height: 22px; display: grid; place-items: center;
    border: 1px solid var(--hair); border-radius: 5px; color: var(--lilac); font-size: 12px; line-height: 1; }
  .slash-ico svg { width: 15px; height: 15px; display: block; }
  .slash-empty { padding: .5rem; color: var(--muted); font-size: .78rem; }`;
  document.head.appendChild(s);
})();
