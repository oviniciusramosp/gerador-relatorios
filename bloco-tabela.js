/* Bloco Tabela — trilha B (t6).
 *
 *   buildTableEl(b, editing, ctx) → elemento DOM (full-width, como a imagem 'full')
 *     b.rows  — matriz de strings (1ª linha = cabeçalho). Semeada se faltar.
 *     ctx     — { commit(), rerender(), removeBlock(id) } (callbacks do host)
 *   parseMatrix(text) → matriz de strings a partir de TSV/CSV colado (planilha)
 *
 * O modelo é só `b.rows` (matriz de HTML inline). As células são contentEditable SEM
 * dataset.id → o handler de input global do editor as ignora (checa dataset.id) e quem
 * sincroniza é o listener próprio de cada célula. Só o envelope tem dataset.id, então
 * a tabela cai no sistema de arrasto/seleção de blocos como qualquer outro bloco.
 * A barra de ferramentas só existe com editing=true → some do PDF (exportado com
 * editing=false), sem CSS de impressão. */

import { splitRow } from './tabela.js';   // reusa o parser de linha CSV (aspas) já testado

// TSV/CSV colado → matriz de strings. Detecta o delimitador pela 1ª linha (tab > ; > ,),
// como parseTable() faz. Linhas vazias são descartadas; a matriz é retangularizada pelo
// maior nº de colunas (célula faltante = '').
export function parseMatrix(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return null;
  const delim = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const rows = lines.map((l) => splitRow(l, delim));
  const cols = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => { while (r.length < cols) r.push(''); return r; });
}

const COL_FULL = 499;   // ponytail: mesma constante do layout (diagramacao.js) — full-width = 2 colunas

const seed = () => [['Coluna 1', 'Coluna 2'], ['', '']];   // cabeçalho + 1 linha

export function buildTableEl(b, editing, ctx) {
  if (!b.rows || !b.rows.length) b.rows = seed();

  const wrap = document.createElement('div');
  wrap.className = 'tbl-wrap b';
  wrap.dataset.id = b.id;
  wrap.style.width = COL_FULL + 'px';

  const table = document.createElement('table');
  table.className = 'tbl';
  b.rows.forEach((row, r) => {
    const tr = document.createElement('tr');
    row.forEach((cell, c) => {
      const td = document.createElement(r === 0 ? 'th' : 'td');
      td.innerHTML = cell || '';
      if (editing) {
        td.contentEditable = 'true'; td.spellcheck = true; td.lang = 'pt-BR';
        td.addEventListener('input', () => { b.rows[r][c] = td.innerHTML; ctx.commit(); });
        // colar planilha (multi-célula) dentro de qualquer célula → substitui a tabela inteira
        td.addEventListener('paste', (e) => {
          const txt = e.clipboardData.getData('text/plain');
          if (!/\t|\r?\n/.test(txt)) return;                 // 1 célula só → deixa o paste normal
          const m = parseMatrix(txt);
          if (!m) return;
          e.preventDefault(); e.stopPropagation();           // impede o paste-handler do editor
          b.rows = m; ctx.rerender();
        });
      }
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
  wrap.appendChild(table);

  if (!editing) return wrap;   // PDF/medição: sem barra de ferramentas

  const bar = document.createElement('div');
  bar.className = 'tbl-bar';
  const mk = (label, title, fn) => {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.textContent = label; btn.title = title;
    btn.addEventListener('mousedown', (e) => e.preventDefault());   // não rouba o caret da célula
    btn.addEventListener('click', fn);
    return btn;
  };
  const nCols = () => b.rows[0].length;
  bar.append(
    mk('+ linha', 'Adicionar linha', () => { b.rows.push(Array(nCols()).fill('')); ctx.rerender(); }),
    mk('+ coluna', 'Adicionar coluna', () => { b.rows.forEach((r) => r.push('')); ctx.rerender(); }),
    mk('− linha', 'Remover última linha', () => { if (b.rows.length > 2) { b.rows.pop(); ctx.rerender(); } }),
    mk('− coluna', 'Remover última coluna', () => { if (nCols() > 1) { b.rows.forEach((r) => r.pop()); ctx.rerender(); } }),
    mk('excluir', 'Excluir tabela', () => ctx.removeBlock(b.id)),
  );
  wrap.appendChild(bar);
  return wrap;
}

// CSS do bloco — injetado uma vez. A tabela é material impresso (fundo branco, texto
// preto), então as cores são fixas, não os tokens do tema escuro do app.
(function injectCss() {
  if (typeof document === 'undefined' || document.getElementById('tbl-css')) return;
  const s = document.createElement('style'); s.id = 'tbl-css';
  s.textContent = `
  .tbl-wrap { position: relative; }
  .tbl { width: 100%; border-collapse: collapse; font-size: 10px; line-height: 1.35; color: #000; }
  .tbl th, .tbl td { border: 1px solid #C9C9C9; padding: 4px 6px; text-align: left; vertical-align: top; }
  .tbl th { background: #F1F1F4; font-weight: 700; }
  .tbl td:empty::after, .tbl th:empty::after { content: "\\200b"; }   /* célula vazia clicável */
  .page.editing .tbl th:focus, .page.editing .tbl td:focus { outline: 2px solid var(--violet, #4E39FF); outline-offset: -2px; }
  /* barra de ferramentas — só no editor (não renderizada com editing=false → some do PDF) */
  .tbl-bar { display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap; }
  .tbl-bar button {
    padding: 2px 7px; font-size: 10px; border: 1px solid #D0D0D6; border-radius: 5px;
    background: #fff; color: #444; cursor: pointer;
  }
  .tbl-bar button:hover { border-color: #4E39FF; color: #111; }
  @media print { .tbl-bar { display: none !important; } }`;
  document.head.appendChild(s);
})();

// ── autoteste (node): parseMatrix TSV/CSV com aspas ──────────────────────────
function demo() {
  const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error('FALHOU ' + msg + ': ' + JSON.stringify(a)); };
  eq(parseMatrix('a\tb\tc\n1\t2\t3'), [['a', 'b', 'c'], ['1', '2', '3']], 'TSV 2x3');
  eq(parseMatrix('a,b\n1,2\n3,4'), [['a', 'b'], ['1', '2'], ['3', '4']], 'CSV 3x2');
  eq(parseMatrix('"a,b",c\n1,2'), [['a,b', 'c'], ['1', '2']], 'CSV com vírgula entre aspas');
  eq(parseMatrix('x;y\n1;2'), [['x', 'y'], ['1', '2']], 'ponto-e-vírgula');
  eq(parseMatrix('a\tb\tc\n1\t2'), [['a', 'b', 'c'], ['1', '2', '']], 'retangulariza linha curta');
  console.log('bloco-tabela: todos os asserts passaram');
}
if (import.meta.url === `file://${process.argv[1]}`) demo();
