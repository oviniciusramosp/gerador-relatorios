/* Bloco Tabela — UX inspirada no Notion.
 *
 *   buildTableEl(b, editing, ctx) → DOM
 *     b.rows       — matriz de HTML (1ª linha = cabeçalho)
 *     b.colWidths  — frações 0–1 por coluna (soma ≈ 1); opcional, equal se ausente
 *     ctx          — { commit(), rerender(), removeBlock(id) }
 *   parseMatrix(text) → matriz a partir de TSV/CSV
 *
 * Editor (editing=true), no estilo Notion:
 *   • arrastar a borda entre colunas redimensiona (b.colWidths)
 *   • “+” redondo só aparece perto da borda inferior (linha) / direita (coluna)
 *   • alça ⠿ da row/col: arrastar reordena; click sem arrasto abre menu
 *   • Tab avança célula; Tab na última cria linha; Enter desce uma linha
 *
 * Controles são flutuantes (absolute) — zero impacto no layout / paginação. */

import { splitRow } from './tabela.js';

export function parseMatrix(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return null;
  const delim = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const rows = lines.map((l) => splitRow(l, delim));
  const cols = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => { while (r.length < cols) r.push(''); return r; });
}

const COL_FULL = 499;
const MIN_COL_FR = 0.08;   // ~8% da largura — evita coluna colapsar no resize
const seed = () => [['Coluna 1', 'Coluna 2'], ['', '']];

function nColsOf(b) {
  return Math.max(1, ...(b.rows || []).map((r) => r.length), 1);
}
function ensureMatrix(b) {
  if (!b.rows || !b.rows.length) b.rows = seed();
  const cols = nColsOf(b);
  b.rows = b.rows.map((r) => {
    const row = r.slice();
    while (row.length < cols) row.push('');
    return row.slice(0, cols);
  });
}
/** frações normalizadas (soma 1), uma por coluna */
export function colWidthsOf(b) {
  ensureMatrix(b);
  const n = nColsOf(b);
  let w = Array.isArray(b.colWidths) ? b.colWidths.map(Number) : [];
  if (w.length !== n || w.some((x) => !(x > 0))) w = Array(n).fill(1 / n);
  const s = w.reduce((a, x) => a + x, 0) || 1;
  return w.map((x) => x / s);
}
function setColWidths(b, fracs) {
  const s = fracs.reduce((a, x) => a + x, 0) || 1;
  b.colWidths = fracs.map((x) => x / s);
}
function addRow(b, at /* null = fim */) {
  ensureMatrix(b);
  const row = Array(nColsOf(b)).fill('');
  if (at == null || at >= b.rows.length) b.rows.push(row);
  else b.rows.splice(Math.max(1, at), 0, row); // nunca antes do header se at=0 use 1
}
function addCol(b, at /* null = fim */) {
  ensureMatrix(b);
  const n = nColsOf(b);
  const i = at == null ? n : Math.max(0, Math.min(n, at));
  b.rows.forEach((r) => r.splice(i, 0, ''));
  const w = colWidthsOf(b);
  // nova coluna nasce com fatia igual à média; re-normaliza
  const slice = 1 / (n + 1);
  const scaled = w.map((x) => x * (1 - slice));
  scaled.splice(i, 0, slice);
  setColWidths(b, scaled);
}
function delRow(b, r) {
  ensureMatrix(b);
  if (b.rows.length <= 2 || r <= 0) return false; // protege header + 1 linha
  b.rows.splice(r, 1);
  return true;
}
function delCol(b, c) {
  ensureMatrix(b);
  if (nColsOf(b) <= 1) return false;
  b.rows.forEach((r) => r.splice(c, 1));
  const w = colWidthsOf(b);
  w.splice(c, 1);
  setColWidths(b, w);
  return true;
}
/** reordena linha de dados (header r=0 fica fixo) */
function moveRow(b, from, to) {
  ensureMatrix(b);
  if (from <= 0 || to <= 0 || from === to) return false;
  if (to >= b.rows.length) to = b.rows.length - 1;
  const [row] = b.rows.splice(from, 1);
  b.rows.splice(to, 0, row);
  return true;
}
function moveCol(b, from, to) {
  ensureMatrix(b);
  const n = nColsOf(b);
  if (from < 0 || to < 0 || from >= n || to >= n || from === to) return false;
  b.rows.forEach((r) => {
    const [cell] = r.splice(from, 1);
    r.splice(to, 0, cell);
  });
  const w = colWidthsOf(b);
  const [fw] = w.splice(from, 1);
  w.splice(to, 0, fw);
  setColWidths(b, w);
  return true;
}

function closeAnyTblMenu() {
  document.querySelectorAll('.tbl-menu').forEach((el) => el.remove());
}

function openTblMenu(anchor, items, onClose) {
  closeAnyTblMenu();
  const menu = document.createElement('div');
  menu.className = 'tbl-menu';
  items.forEach((it) => {
    if (it.switcher) {
      const row = document.createElement('div');
      row.className = 'tbl-menu-sw';
      const lab = document.createElement('span');
      lab.textContent = it.label;
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'sw';
      sw.setAttribute('role', 'switch');
      sw.setAttribute('aria-checked', String(!!it.on));
      sw.addEventListener('mousedown', (e) => e.preventDefault());
      sw.addEventListener('click', (e) => {
        e.stopPropagation();
        const next = sw.getAttribute('aria-checked') !== 'true';
        sw.setAttribute('aria-checked', String(next));
        it.fn(next);
      });
      row.append(lab, sw);
      menu.appendChild(row);
      return;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = it.label;
    if (it.danger) btn.className = 'danger';
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAnyTblMenu();
      onClose && onClose();
      it.fn();
    });
    menu.appendChild(btn);
  });
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth || 160, mh = menu.offsetHeight || 80;
  let x = r.left, y = r.bottom + 4;
  if (x + mw > innerWidth - 8) x = innerWidth - mw - 8;
  if (y + mh > innerHeight - 8) y = Math.max(8, r.top - mh - 4);
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  const dismiss = (e) => {
    if (menu.contains(e.target) || anchor.contains(e.target)) return;
    closeAnyTblMenu();
    onClose && onClose();
    document.removeEventListener('mousedown', dismiss, true);
  };
  setTimeout(() => document.addEventListener('mousedown', dismiss, true), 0);
  return menu;
}

const DEFAULT_HEADER_BG = '#F1F1F4';
function tableHeaderBg(b) { return b.headerColor || DEFAULT_HEADER_BG; }
function isHeaderRow(b, r) { return b.headerRow !== false && r === 0; }
function isHeaderCol(b, c) { return !!b.headerCol && c === 0; }
function isHeaderCell(b, r, c) { return isHeaderRow(b, r) || isHeaderCol(b, c); }

export function buildTableEl(b, editing, ctx) {
  ensureMatrix(b);
  const widths = colWidthsOf(b);
  const cols = widths.length;

  const wrap = document.createElement('div');
  wrap.className = 'tbl-wrap b' + (editing ? ' tbl-editing' : '');
  wrap.dataset.id = b.id;
  wrap.style.width = COL_FULL + 'px';

  const frame = document.createElement('div');
  frame.className = 'tbl-frame';

  const table = document.createElement('table');
  table.className = 'tbl'
    + (b.hideVLines === true ? ' no-vlines' : '')
    + (b.altRows ? ' alt-rows' : '')
    + (b.headerRow === false ? ' no-header-row' : '')
    + (b.headerCol ? ' header-col' : '');
  table.style.setProperty('--tbl-header-bg', tableHeaderBg(b));
  const cg = document.createElement('colgroup');
  widths.forEach((fr) => {
    const col = document.createElement('col');
    col.style.width = (fr * 100).toFixed(3) + '%';
    cg.appendChild(col);
  });
  table.appendChild(cg);

  b.rows.forEach((row, r) => {
    const tr = document.createElement('tr');
    tr.dataset.row = String(r);
    if (b.altRows && !isHeaderRow(b, r) && r % 2 === 0) tr.classList.add('alt');
    row.forEach((cell, c) => {
      const head = isHeaderCell(b, r, c);
      const td = document.createElement(head && isHeaderRow(b, r) ? 'th' : 'td');
      td.dataset.col = String(c);
      td.dataset.row = String(r);
      if (head) {
        td.classList.add('tbl-head-cell');
        td.style.background = tableHeaderBg(b);
        td.style.fontWeight = '700';
      }
      td.innerHTML = cell || '';
      if (editing) {
        td.contentEditable = 'true';
        td.spellcheck = true;
        td.lang = 'pt-BR';
        td.addEventListener('input', () => {
          b.rows[r][c] = td.innerHTML;
          ctx.commit();
        });
        td.addEventListener('paste', (e) => {
          const txt = e.clipboardData.getData('text/plain');
          if (!/\t|\r?\n/.test(txt)) return;
          const m = parseMatrix(txt);
          if (!m) return;
          e.preventDefault();
          e.stopPropagation();
          b.rows = m;
          delete b.colWidths;
          ctx.rerender();
        });
        td.addEventListener('keydown', (e) => onCellKey(e, b, r, c, ctx, table));
      }
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
  frame.appendChild(table);

  if (editing) {
    // hover contextual: alça da row/col sob o cursor; “+” só perto da borda
    const EDGE = 18; // px de proximidade da borda p/ mostrar +
    const updateEdgeProximity = (clientX, clientY) => {
      const r = table.getBoundingClientRect();
      const nearBot = clientY >= r.bottom - EDGE && clientY <= r.bottom + 16;
      const nearRight = clientX >= r.right - EDGE && clientX <= r.right + 16;
      wrap.classList.toggle('tbl-near-bot', nearBot);
      wrap.classList.toggle('tbl-near-right', nearRight);
    };
    wrap.addEventListener('pointerover', (e) => {
      const cell = e.target.closest && e.target.closest('th, td');
      if (cell && table.contains(cell)) {
        wrap.dataset.hoverRow = cell.dataset.row ?? '';
        wrap.dataset.hoverCol = cell.dataset.col ?? '';
      } else {
        const rh = e.target.closest && e.target.closest('.tbl-row-handle');
        if (rh) wrap.dataset.hoverRow = rh.dataset.row ?? '';
        const ch = e.target.closest && e.target.closest('.tbl-col-handle');
        if (ch) wrap.dataset.hoverCol = ch.dataset.col ?? '';
      }
    });
    wrap.addEventListener('pointermove', (e) => updateEdgeProximity(e.clientX, e.clientY));
    wrap.addEventListener('pointerleave', () => {
      if (!wrap.dataset.menuRow && !wrap.dataset.menuCol) {
        delete wrap.dataset.hoverRow;
        delete wrap.dataset.hoverCol;
      }
      wrap.classList.remove('tbl-near-bot', 'tbl-near-right');
    });

    // ── resize handles entre colunas ──────────────────────────────────────
    const resizers = document.createElement('div');
    resizers.className = 'tbl-resizers';
    resizers.setAttribute('aria-hidden', 'true');
    for (let c = 0; c < cols - 1; c++) {
      const h = document.createElement('div');
      h.className = 'tbl-resizer';
      h.dataset.after = String(c);
      h.title = 'Arrastar para redimensionar';
      placeResizer(h, table, c);
      h.addEventListener('pointerdown', (e) => startResize(e, b, c, wrap, table, ctx));
      resizers.appendChild(h);
    }
    frame.appendChild(resizers);

    // ── alças de linha: drag = reordenar; click = menu ─────────────────────
    const rowHandles = document.createElement('div');
    rowHandles.className = 'tbl-row-handles';
    b.rows.forEach((_, r) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tbl-handle tbl-row-handle';
      btn.dataset.row = String(r);
      btn.title = r === 0
        ? 'Opções da linha (cabeçalho)'
        : 'Arrastar para reordenar · clique p/ opções';
      btn.innerHTML = '<span></span><span></span><span></span>';
      btn.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (r === 0) {
          // header row: só menu (não reordena)
          e.preventDefault();
          e.stopPropagation();
          wrap.dataset.menuRow = '0';
          openTblMenu(btn, [
            {
              label: 'Linha de cabeçalho',
              switcher: true,
              on: b.headerRow !== false,
              fn: (on) => { b.headerRow = on; ctx.commit(); ctx.rerender(); },
            },
            { label: 'Inserir abaixo', fn: () => { addRow(b, 1); ctx.rerender(); } },
          ], () => { delete wrap.dataset.menuRow; });
          return;
        }
        startRowDrag(e, b, r, wrap, table, btn, ctx);
      });
      rowHandles.appendChild(btn);
    });
    frame.appendChild(rowHandles);

    // ── alças de coluna: drag = reordenar; click = menu ────────────────────
    const colHandles = document.createElement('div');
    colHandles.className = 'tbl-col-handles';
    for (let c = 0; c < cols; c++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tbl-handle tbl-col-handle';
      btn.dataset.col = String(c);
      btn.title = 'Arrastar para reordenar · clique p/ opções';
      btn.innerHTML = '<span></span><span></span><span></span>';
      btn.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        startColDrag(e, b, c, wrap, table, btn, ctx, {
          // 1ª coluna: switcher de cabeçalho no menu de click
          headerSwitcher: c === 0,
        });
      });
      colHandles.appendChild(btn);
    }
    frame.appendChild(colHandles);

    // ── “+” redondos, só perto da borda ────────────────────────────────────
    const addRowBtn = document.createElement('button');
    addRowBtn.type = 'button';
    addRowBtn.className = 'tbl-edge-add tbl-add-row';
    addRowBtn.title = 'Nova linha';
    addRowBtn.textContent = '+';
    addRowBtn.addEventListener('mousedown', (e) => e.preventDefault());
    addRowBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      addRow(b, null);
      ctx.rerender();
    });
    frame.appendChild(addRowBtn);

    const addColBtn = document.createElement('button');
    addColBtn.type = 'button';
    addColBtn.className = 'tbl-edge-add tbl-add-col';
    addColBtn.title = 'Nova coluna';
    addColBtn.textContent = '+';
    addColBtn.addEventListener('mousedown', (e) => e.preventDefault());
    addColBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      addCol(b, null);
      ctx.rerender();
    });
    frame.appendChild(addColBtn);

    // linha-guia de drop durante drag de reordenação
    const dropLine = document.createElement('div');
    dropLine.className = 'tbl-drop-line';
    dropLine.hidden = true;
    frame.appendChild(dropLine);

    requestAnimationFrame(() => {
      resizers.querySelectorAll('.tbl-resizer').forEach((h) => placeResizer(h, table, +h.dataset.after));
      layoutRowHandles(rowHandles, table);
      layoutColHandles(colHandles, table);
    });
  }

  wrap.appendChild(frame);
  return wrap;
}

function placeResizer(handle, table, afterCol) {
  const rows = table.rows;
  if (!rows.length || !rows[0].cells[afterCol]) return;
  const cell = rows[0].cells[afterCol];
  const tr = table.getBoundingClientRect();
  const cr = cell.getBoundingClientRect();
  handle.style.left = (cr.right - tr.left - 3) + 'px';
  handle.style.height = tr.height + 'px';
}

function layoutRowHandles(box, table) {
  const tr = table.getBoundingClientRect();
  box.style.height = tr.height + 'px';
  [...box.children].forEach((btn) => {
    const r = +btn.dataset.row;
    const row = table.rows[r];
    if (!row) return;
    const rr = row.getBoundingClientRect();
    // centra o botão 12px na altura da linha
    btn.style.top = (rr.top - tr.top + rr.height / 2 - 6) + 'px';
  });
}

function layoutColHandles(box, table) {
  if (!table.rows[0]) return;
  const tr = table.getBoundingClientRect();
  [...box.children].forEach((btn) => {
    const c = +btn.dataset.col;
    const cell = table.rows[0].cells[c];
    if (!cell) return;
    const cr = cell.getBoundingClientRect();
    btn.style.left = (cr.left - tr.left + cr.width / 2 - 6) + 'px';
  });
}

function startResize(e, b, afterCol, wrap, table, ctx) {
  e.preventDefault();
  e.stopPropagation();
  closeAnyTblMenu();
  const startX = e.clientX;
  const start = colWidthsOf(b);
  const wrapW = wrap.getBoundingClientRect().width || COL_FULL;
  const left = afterCol;
  const right = afterCol + 1;
  const pair = start[left] + start[right];
  wrap.classList.add('tbl-resizing');
  const onMove = (ev) => {
    const dx = (ev.clientX - startX) / wrapW;
    let l = start[left] + dx;
    let r = pair - l;
    if (l < MIN_COL_FR) { l = MIN_COL_FR; r = pair - l; }
    if (r < MIN_COL_FR) { r = MIN_COL_FR; l = pair - r; }
    const next = start.slice();
    next[left] = l;
    next[right] = r;
    setColWidths(b, next);
    const cols = table.querySelectorAll('col');
    const fr = colWidthsOf(b);
    cols.forEach((col, i) => { col.style.width = (fr[i] * 100).toFixed(3) + '%'; });
    wrap.querySelectorAll('.tbl-resizer').forEach((h) => placeResizer(h, table, +h.dataset.after));
    const ch = wrap.querySelector('.tbl-col-handles');
    if (ch) layoutColHandles(ch, table);
  };
  const onUp = () => {
    wrap.classList.remove('tbl-resizing');
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    ctx.commit();
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

const DRAG_THRESH = 4; // px — abaixo disso conta como click (menu)

function rowIndexAtY(table, clientY) {
  // só linhas de dados (pula header)
  for (let r = 1; r < table.rows.length; r++) {
    const rr = table.rows[r].getBoundingClientRect();
    if (clientY < rr.top + rr.height / 2) return r;
  }
  return Math.max(1, table.rows.length - 1);
}
function colIndexAtX(table, clientX) {
  if (!table.rows[0]) return 0;
  const cells = table.rows[0].cells;
  for (let c = 0; c < cells.length; c++) {
    const cr = cells[c].getBoundingClientRect();
    if (clientX < cr.left + cr.width / 2) return c;
  }
  return cells.length - 1;
}
// `from` = índice de origem do item arrastado. A linha marca a borda de INSERÇÃO:
// arrastando pra direita/baixo → borda direita/inferior do alvo (a coluna/linha sob o
// cursor fica “antes” do item solto); pra esquerda/cima → borda esquerda/superior.
function showDropLine(wrap, table, kind, index, from) {
  const line = wrap.querySelector('.tbl-drop-line');
  if (!line) return;
  const tr = table.getBoundingClientRect();
  line.hidden = false;
  line.className = 'tbl-drop-line tbl-drop-' + kind;
  if (kind === 'row') {
    const row = table.rows[index];
    if (!row) { line.hidden = true; return; }
    const rr = row.getBoundingClientRect();
    const atEnd = from != null && from < index; // descendo → linha embaixo do alvo
    line.style.left = '0';
    line.style.right = '0';
    line.style.top = ((atEnd ? rr.bottom : rr.top) - tr.top - 1) + 'px';
    line.style.width = '';
    line.style.height = '2px';
  } else {
    const cell = table.rows[0]?.cells[index];
    if (!cell) { line.hidden = true; return; }
    const cr = cell.getBoundingClientRect();
    // ex.: col 1 → pos 2: alvo é a col 2, linha à DIREITA dela (não entre 1 e 2)
    const atEnd = from != null && from < index;
    line.style.top = '0';
    line.style.bottom = '0';
    line.style.left = ((atEnd ? cr.right : cr.left) - tr.left - 1) + 'px';
    line.style.height = '';
    line.style.width = '2px';
  }
}
function hideDropLine(wrap) {
  const line = wrap.querySelector('.tbl-drop-line');
  if (line) line.hidden = true;
}

function startRowDrag(e, b, from, wrap, table, btn, ctx) {
  e.preventDefault();
  e.stopPropagation();
  closeAnyTblMenu();
  const startY = e.clientY;
  let dragging = false;
  let target = from;
  wrap.dataset.hoverRow = String(from);

  const onMove = (ev) => {
    if (!dragging && Math.abs(ev.clientY - startY) < DRAG_THRESH) return;
    if (!dragging) {
      dragging = true;
      wrap.classList.add('tbl-dragging-row');
      btn.classList.add('tbl-dragging');
      btn.setPointerCapture?.(ev.pointerId);
    }
    target = rowIndexAtY(table, ev.clientY);
    showDropLine(wrap, table, 'row', target, from);
    wrap.dataset.hoverRow = String(target);
  };
  const onUp = (ev) => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    hideDropLine(wrap);
    wrap.classList.remove('tbl-dragging-row');
    btn.classList.remove('tbl-dragging');
    if (!dragging) {
      // click → menu
      wrap.dataset.menuRow = String(from);
      openTblMenu(btn, [
        { label: 'Inserir acima', fn: () => { addRow(b, from); ctx.rerender(); } },
        { label: 'Inserir abaixo', fn: () => { addRow(b, from + 1); ctx.rerender(); } },
        { label: 'Apagar linha', danger: true, fn: () => { if (delRow(b, from)) ctx.rerender(); } },
      ], () => { delete wrap.dataset.menuRow; });
      return;
    }
    if (target !== from && moveRow(b, from, target)) ctx.rerender();
    else ctx.commit();
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

function startColDrag(e, b, from, wrap, table, btn, ctx, opts = {}) {
  e.preventDefault();
  e.stopPropagation();
  closeAnyTblMenu();
  const startX = e.clientX;
  let dragging = false;
  let target = from;
  wrap.dataset.hoverCol = String(from);

  const onMove = (ev) => {
    if (!dragging && Math.abs(ev.clientX - startX) < DRAG_THRESH) return;
    if (!dragging) {
      dragging = true;
      wrap.classList.add('tbl-dragging-col');
      btn.classList.add('tbl-dragging');
    }
    target = colIndexAtX(table, ev.clientX);
    showDropLine(wrap, table, 'col', target, from);
    wrap.dataset.hoverCol = String(target);
  };
  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    hideDropLine(wrap);
    wrap.classList.remove('tbl-dragging-col');
    btn.classList.remove('tbl-dragging');
    if (!dragging) {
      wrap.dataset.menuCol = String(from);
      const items = [];
      if (opts.headerSwitcher || from === 0) {
        items.push({
          label: 'Coluna de cabeçalho',
          switcher: true,
          on: !!b.headerCol,
          fn: (on) => { b.headerCol = on; ctx.commit(); ctx.rerender(); },
        });
      }
      items.push(
        { label: 'Inserir à esquerda', fn: () => { addCol(b, from); ctx.rerender(); } },
        { label: 'Inserir à direita', fn: () => { addCol(b, from + 1); ctx.rerender(); } },
        { label: 'Apagar coluna', danger: true, fn: () => { if (delCol(b, from)) ctx.rerender(); } },
      );
      openTblMenu(btn, items, () => { delete wrap.dataset.menuCol; });
      return;
    }
    if (target !== from && moveCol(b, from, target)) ctx.rerender();
    else ctx.commit();
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

function onCellKey(e, b, r, c, ctx, table) {
  if (e.key === 'Tab') {
    e.preventDefault();
    const cols = nColsOf(b);
    let nr = r, nc = c + (e.shiftKey ? -1 : 1);
    if (nc >= cols) { nc = 0; nr++; }
    if (nc < 0) { nc = cols - 1; nr--; }
    if (nr >= b.rows.length) {
      addRow(b, null);
      ctx.rerender();
      // foco na nova célula após rebuild — host re-renderiza; tenta no próximo frame
      requestAnimationFrame(() => focusCell(b.id, b.rows.length - 1, 0));
      return;
    }
    if (nr < 0) return;
    focusCell(b.id, nr, nc);
    return;
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const nr = r + 1;
    if (nr >= b.rows.length) {
      addRow(b, null);
      ctx.rerender();
      requestAnimationFrame(() => focusCell(b.id, b.rows.length - 1, c));
      return;
    }
    focusCell(b.id, nr, c);
  }
}

function focusCell(tableId, r, c) {
  const wrap = document.querySelector(`.tbl-wrap[data-id="${tableId}"]`);
  if (!wrap) return;
  const cell = wrap.querySelector(`tr[data-row="${r}"] [data-col="${c}"]`)
    || wrap.querySelectorAll('tr')[r]?.cells?.[c];
  if (!cell) return;
  cell.focus();
  const sel = getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(cell);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

// CSS — material impresso (preto/branco) + chrome flutuante de edição.
// Controles são position:absolute FORA do fluxo: zero margem no frame → a tabela
// não é empurrada pra direita nem o miolo pra baixo.
(function injectCss() {
  if (typeof document === 'undefined' || document.getElementById('tbl-css')) return;
  const s = document.createElement('style');
  s.id = 'tbl-css';
  s.textContent = `
  /* flow-root: BFC próprio — a margem do bloco seguinte (p com margin-top) não colapsa
     com nada dentro da tabela e o vão padrão da página (PARA_LH) aparece de verdade. */
  .tbl-wrap { position: relative; z-index: 2; overflow: visible; display: flow-root; }
  .tbl-frame { position: relative; overflow: visible; }
  .tbl { width: 100%; table-layout: fixed; border-collapse: collapse;
    font-size: 10px; line-height: 1.35; color: #000; }
  .tbl th, .tbl td { border: 1px solid #C9C9C9; padding: 4px 6px; text-align: left;
    vertical-align: top; word-wrap: break-word; overflow-wrap: break-word; }
  .tbl th, .tbl .tbl-head-cell { background: var(--tbl-header-bg, #F1F1F4); font-weight: 700; }
  .tbl td:empty::after, .tbl th:empty::after { content: "\\200b"; }
  .tbl.no-vlines th, .tbl.no-vlines td {
    border-left-color: transparent; border-right-color: transparent; }
  .tbl.no-vlines tr > :first-child { border-left-color: #C9C9C9; }
  .tbl.no-vlines tr > :last-child { border-right-color: #C9C9C9; }
  .tbl.alt-rows tr.alt > td:not(.tbl-head-cell) {
    background: color-mix(in srgb, var(--tbl-header-bg, #F1F1F4) 35%, #fff); }
  .page.editing .tbl th:focus, .page.editing .tbl td:focus {
    outline: 2px solid var(--violet, #4E39FF); outline-offset: -2px; }

  /* camadas de chrome: 4px mais perto da tabela (era -14 → -10) */
  .tbl-row-handles, .tbl-col-handles, .tbl-resizers {
    position: absolute; pointer-events: none; z-index: 4; }
  .tbl-row-handles { left: -10px; top: 0; width: 12px; }
  .tbl-col-handles { left: 0; top: -10px; height: 12px; right: 0; }
  .tbl-resizers { inset: 0; z-index: 3; }

  /* botões 12×12 redondos; dots 2px */
  .tbl-handle {
    position: absolute; width: 12px; height: 12px; padding: 0; border: 0;
    border-radius: 50%; background: #fff; cursor: grab;
    display: flex; align-items: center; justify-content: center; gap: 1.5px;
    pointer-events: auto; opacity: 0; transition: opacity .1s, background .1s, box-shadow .1s;
    box-shadow: 0 0 0 1px color-mix(in srgb, #000 10%, transparent);
  }
  .tbl-handle span {
    display: block; width: 2px; height: 2px; border-radius: 50%;
    background: #8a8a8a; flex: none; }
  .tbl-row-handle { left: 0; flex-direction: column; }
  .tbl-col-handle { top: 0; flex-direction: row; }
  .tbl-handle:hover, .tbl-handle:focus-visible, .tbl-handle.tbl-dragging {
    opacity: 1;
    background: #fff; box-shadow: 0 0 0 1px color-mix(in srgb, #4E39FF 45%, transparent); }
  .tbl-handle:hover span, .tbl-handle:focus-visible span,
  .tbl-handle.tbl-dragging span { background: #4E39FF; }
  .tbl-handle.tbl-dragging { cursor: grabbing; z-index: 6; }
  `;
  let hoverRules = '';
  for (let i = 0; i <= 64; i++) {
    hoverRules += `.tbl-editing[data-hover-row="${i}"] .tbl-row-handle[data-row="${i}"],`
      + `.tbl-editing[data-menu-row="${i}"] .tbl-row-handle[data-row="${i}"]{opacity:1}`;
    hoverRules += `.tbl-editing[data-hover-col="${i}"] .tbl-col-handle[data-col="${i}"],`
      + `.tbl-editing[data-menu-col="${i}"] .tbl-col-handle[data-col="${i}"]{opacity:1}`;
  }
  s.textContent += hoverRules + `
  .tbl-resizer {
    position: absolute; top: 0; width: 5px; cursor: col-resize;
    pointer-events: auto; z-index: 3; }
  .tbl-resizer::after {
    content: ''; position: absolute; inset: 0 1.5px; border-radius: 1px;
    background: transparent; transition: background .1s; }
  .tbl-resizer:hover::after,
  .tbl-resizing .tbl-resizer::after { background: #4E39FF; }
  .tbl-resizing, .tbl-resizing * { cursor: col-resize !important; user-select: none !important; }
  .tbl-dragging-row, .tbl-dragging-row * { cursor: grabbing !important; user-select: none !important; }
  .tbl-dragging-col, .tbl-dragging-col * { cursor: grabbing !important; user-select: none !important; }

  /* “+” redondo 12×12 — só perto da borda (tbl-near-bot / tbl-near-right) */
  .tbl-edge-add {
    position: absolute; width: 12px; height: 12px; padding: 0; border: 0;
    border-radius: 50%; background: #fff; color: #4E39FF;
    font-size: 11px; font-weight: 600; line-height: 1;
    display: grid; place-items: center;
    cursor: pointer; opacity: 0; transition: opacity .1s, background .1s, box-shadow .1s;
    box-shadow: 0 0 0 1px color-mix(in srgb, #4E39FF 35%, transparent);
    pointer-events: auto; z-index: 4;
  }
  .tbl-editing.tbl-near-bot .tbl-add-row,
  .tbl-editing.tbl-near-right .tbl-add-col,
  .tbl-edge-add:hover { opacity: 1; }
  .tbl-edge-add:hover { background: color-mix(in srgb, #4E39FF 10%, #fff); }
  /* metade sobre a borda da tabela — NÃO ocupa o vão de PARA_LH até o próximo bloco
     (antes bottom:-14px comia o respiro inteiro e o parágrafo parecia colado) */
  .tbl-add-row {
    left: 50%; bottom: 0; transform: translate(-50%, 50%); }
  .tbl-add-col {
    top: 50%; right: 0; transform: translate(50%, -50%); }

  /* guia de drop no reordenamento */
  .tbl-drop-line {
    position: absolute; background: #4E39FF; pointer-events: none; z-index: 5;
    border-radius: 1px; }
  .tbl-drop-line[hidden] { display: none !important; }

  .tbl-menu {
    position: fixed; z-index: 72; min-width: 10rem; display: grid; gap: 1px;
    padding: .3rem; border: 1px solid var(--hair-strong, #3a3a42); border-radius: 8px;
    background: color-mix(in srgb, var(--lilac, #a8a0ff) 10%, var(--ground, #1c1c22));
    box-shadow: 0 12px 40px -12px #000;
  }
  .tbl-menu button {
    display: block; width: 100%; text-align: left; border: 0; border-radius: 5px;
    padding: .42rem .55rem; background: transparent; color: var(--ink, #eee);
    cursor: pointer; font-size: .8rem; font-stretch: 85%;
  }
  .tbl-menu button:hover { background: color-mix(in srgb, var(--violet, #4E39FF) 16%, transparent); }
  .tbl-menu button.danger { color: #CE5249; }
  .tbl-menu button.danger:hover { background: color-mix(in srgb, #CE5249 16%, transparent); }
  .tbl-menu-sw {
    display: flex; align-items: center; justify-content: space-between; gap: .5rem;
    padding: .35rem .55rem; font-size: .8rem; font-stretch: 85%; color: var(--ink, #eee);
  }
  /* switch compacto (mesmo visual da sidebar) */
  .tbl-menu .sw {
    position: relative; width: 34px; height: 20px; border-radius: 999px; border: 0;
    cursor: pointer; background: var(--hair-strong, #555); padding: 0; flex: none;
  }
  .tbl-menu .sw::after {
    content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px;
    border-radius: 50%; background: #fff; transition: transform .12s;
  }
  .tbl-menu .sw[aria-checked="true"] { background: var(--mint, #3DE8A0); }
  .tbl-menu .sw[aria-checked="true"]::after { transform: translateX(14px); }

  @media print {
    .tbl-handle, .tbl-resizer, .tbl-edge-add, .tbl-menu, .tbl-drop-line,
    .tbl-row-handles, .tbl-col-handles, .tbl-resizers { display: none !important; }
  }`;
  document.head.appendChild(s);
})();

function demo() {
  const eq = (a, b, msg) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error('FALHOU ' + msg + ': ' + JSON.stringify(a));
  };
  eq(parseMatrix('a\tb\tc\n1\t2\t3'), [['a', 'b', 'c'], ['1', '2', '3']], 'TSV 2x3');
  eq(parseMatrix('a,b\n1,2\n3,4'), [['a', 'b'], ['1', '2'], ['3', '4']], 'CSV 3x2');
  eq(parseMatrix('"a,b",c\n1,2'), [['a,b', 'c'], ['1', '2']], 'CSV com vírgula entre aspas');
  eq(parseMatrix('x;y\n1;2'), [['x', 'y'], ['1', '2']], 'ponto-e-vírgula');
  eq(parseMatrix('a\tb\tc\n1\t2'), [['a', 'b', 'c'], ['1', '2', '']], 'retangulariza linha curta');
  const b = { rows: [['A', 'B'], ['1', '2']] };
  eq(colWidthsOf(b).map((x) => +x.toFixed(2)), [0.5, 0.5], 'widths default');
  addCol(b, 1);
  eq(b.rows[0].length, 3, 'addCol');
  eq(colWidthsOf(b).length, 3, 'widths after addCol');
  delCol(b, 1);
  eq(b.rows[0].length, 2, 'delCol');
  const br = { rows: [['H1', 'H2'], ['a', 'b'], ['c', 'd'], ['e', 'f']] };
  moveRow(br, 1, 3);
  eq(br.rows.map((r) => r[0]), ['H1', 'c', 'e', 'a'], 'moveRow');
  const bc = { rows: [['A', 'B', 'C'], ['1', '2', '3']], colWidths: [0.2, 0.3, 0.5] };
  moveCol(bc, 0, 2);
  eq(bc.rows[0], ['B', 'C', 'A'], 'moveCol header');
  eq(bc.rows[1], ['2', '3', '1'], 'moveCol body');
  console.log('bloco-tabela: todos os asserts passaram');
}
if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].endsWith('bloco-tabela.js')) demo();
