/* Diagramação — miolo do relatório Paradigma.
 *
 * Um documento é uma lista linear de blocos (h1/h2/p/li/quote/pagebreak/image).
 * A coluna de texto (esquerda, 258px) "flui" página a página; a paginação é um
 * empacotamento guloso por altura MEDIDA de cada bloco, respeitando quebras
 * manuais. Imagens vão na coluna direita (posição livre no eixo Y, arrastável),
 * em largura total (as 2 colunas) ou entre parágrafos (coluna esquerda).
 *
 * Edição é WYSIWYG: cada bloco é um contenteditable dentro da própria página,
 * estilo Notion (atalhos "# ", "- ", "> ", Enter cria bloco, ⌘⏎ quebra página).
 *
 * ponytail: sem framework, sem lib de PDF — DOM + measurement + window.print().
 * A quebra de linha DENTRO de um parágrafo entre páginas não é feita (bloco
 * inteiro sobe pra próxima); a quebra manual dá o controle fino. Upgrade: cortar
 * parágrafos por linha via Range.getClientRects() quando precisar de fluxo denso.
 */

import { openSwatchPop } from './swatch.js';   // swatch de cor compartilhado (idêntico ao dos gráficos)
import { autocropWhite } from './autocrop.js'; // trilha C (t3): recrop da margem branca de imagens
import { tocNum } from './toc-num.js';         // trilha C (t4): numeração do índice sem duplicar prefixo
import { LOGOS } from './logos.js';            // trilha D (t8): logos tingíveis (currentColor) — mesma fonte dos gráficos
import { marksFromStyle } from './paste-style.js';   // trilha A (t10): parser puro de estilo inline colado
import { buildTableEl } from './bloco-tabela.js';    // trilha B (t6): DOM do bloco Tabela
import { initSlashMenu } from './slash.js';          // trilha B (t1): menu "/" de tipos

// ─────────────────────────── geometria (px, 1:1 com a página) ───────────────
const PAGE_W = 595, PAGE_H = 842;
const CONTENT_TOP = 88, CONTENT_H = 666;          // [88 .. 754]

// seletor de coluna reutilizável (o MESMO do popover de Imagem e da Capa): 3 botões ícone+label
const COL_ICON = {
  left: '<svg viewBox="0 0 16 16"><rect x="1.5" y="2" width="13" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="3" y="4" width="4.5" height="8" fill="currentColor"/></svg>',
  full: '<svg viewBox="0 0 16 16"><rect x="1.5" y="2" width="13" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="3" y="4" width="10" height="8" fill="currentColor"/></svg>',
  right: '<svg viewBox="0 0 16 16"><rect x="1.5" y="2" width="13" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="8.5" y="4" width="4.5" height="8" fill="currentColor"/></svg>',
};
// cur = valor atual; vals = { left, full, right } valores emitidos; onPick(v)
function columnField(cur, vals, onPick) {
  const wrap = document.createElement('div'); wrap.className = 'placebtns';
  const opt = (v, label, icon) => {
    const b = document.createElement('button'); b.type = 'button';
    b.innerHTML = icon + `<span>${label}</span>`;
    if (cur === v) b.classList.add('on');
    b.onclick = () => onPick(v);
    wrap.append(b);
  };
  opt(vals.left, 'Coluna Esquerda', COL_ICON.left);
  opt(vals.full, 'Largura Total', COL_ICON.full);
  opt(vals.right, 'Coluna Direita', COL_ICON.right);
  return wrap;
}
const COL_L = 258, GAP = 24, COL_R = 217;
const COL_FULL = COL_L + GAP + COL_R;             // 499 — largura das 2 colunas

// Espaçamento vertical ANTES de um bloco — depende do tipo do bloco de cima (prev).
// Calculado no JS (não em CSS) porque é contextual; a paginação e o render usam o
// mesmo valor (b._gap), então a quebra de página bate com o que aparece na tela.
const PARA_LH = 14;   // line-height do p.b — a "altura da linha de um parágrafo"
const LIST_GAP = 6;   // distância atual entre itens da MESMA lista (compacta)
function gapBefore(b, prev) {
  const pt = prev && prev.type;
  if (b.type === 'h1') return 48;                                      // = padding da página
  if (b.type === 'h2') return pt === 'h1' ? PARA_LH : 32;              // colado no H1, senão 32
  if (b.type === 'h3') return (pt === 'h1' || pt === 'h2') ? PARA_LH : 24;
  // itens consecutivos da MESMA lista (pontos/numérica/checklist) ficam compactos
  if ((b.type === 'li' && pt === 'li') || (b.type === 'ol' && pt === 'ol') || (b.type === 'check' && pt === 'check')) return LIST_GAP;
  return PARA_LH;                                                       // demais blocos: 1 linha
}

const HEAD_TYPES = new Set(['h1', 'h2', 'h3', 'h4']);
// 'check' (checklist, trilha B t7) é editável e reusa buildText; 'table' NÃO é text (célula própria)
const TEXT_TYPES = new Set(['h1', 'h2', 'h3', 'h4', 'p', 'li', 'ol', 'quote', 'check']);  // blocos editáveis
const PH = { h1: 'Título', h2: 'Subtítulo', h3: 'Título 3', h4: 'Título 4', p: 'Escreva…', li: 'Item', ol: 'Item', quote: 'Citação', check: 'Item' };
const URL_RE = /^(https?:\/\/|www\.)[^\s]+$/i;

// ─────────────────────────── estado ─────────────────────────────────────────
// O conteúdo NÃO persiste: o documento sempre abre em branco. O que persiste é
// a configuração (rodapé, nº inicial) e a ORIGEM vinculada (arquivo/Google Docs),
// que permite Sincronizar e reimportar o conteúdo a qualquer momento.
const LS_KEY = 'pdgm-diagramacao-cfg-v1';
let uidN = 0;
const uid = () => 'b' + (Date.now().toString(36)) + (uidN++).toString(36);

const state = {
  doc: null,          // { blocks:[], footText, firstPage, source }
  sel: null,          // id da imagem selecionada
  zoom: 1,
  autocrop: true,     // trilha C (t3): recortar margem branca ao inserir imagem (não persiste)
};

const mkBlock = (type, html = '') => ({ id: uid(), type, html });
// item de capa/contracapa: texto livre — tamanho, coluna (esq/dir/ambas), alinhamento, cor
// e posição Y livre (arrastável, como as imagens da coluna direita).
const coverItem = (html, size, span, align, color = null, y = 0) => ({ id: uid(), html, size, span, align, color, y });
// logo da Paradigma FIXO no cabeçalho/rodapé da capa/contracapa — NÃO é coverItem
// arrastável: mora fora do fluxo de itens e do anti-sobreposição. Tingido via
// currentColor (como nos gráficos), escalado por size. defaultLogo() serve o seed
// E a migração de config antiga (LS salvo antes deste campo existir).
const defaultLogo = () => ({ on: false, kind: 'icone', pos: 'header', align: 'left', color: '#FFFFFF', size: 1 });

function seedDoc() {
  return {
    blocks: [mkBlock('p', '')],
    footText: 'paradigma.education', headText: '', firstPage: 1, source: null,
    // páginas especiais — ligadas por padrão via switcher no painel Documento.
    // bgX/bgY = posição do fundo (Fill) em %; itens posicionados por coluna (x) + y livre.
    cover: { on: true, bg: null, bgX: 50, bgY: 50, logo: defaultLogo(), items: [
      coverItem('Título do relatório', 40, 'full', 'left', null, 330),
      coverItem('Subtítulo · Paradigma Education', 15, 'full', 'left', null, 392),
    ] },
    back: { on: true, bg: null, bgX: 50, bgY: 50, logo: defaultLogo(), items: [
      coverItem('paradigma.education', 18, 'full', 'center', null, 360),
    ] },
    index: { on: true, resumo: '<p>Escreva aqui o resumo do relatório.</p>' },
  };
}

function load() {
  state.doc = seedDoc();                     // o MIOLO sempre abre em branco; capa/índice/resumo persistem
  try {
    const cfg = JSON.parse(localStorage.getItem(LS_KEY)) || {};
    if (cfg.footText != null) state.doc.footText = cfg.footText;
    if (cfg.headText != null) state.doc.headText = cfg.headText;
    if (cfg.firstPage != null) state.doc.firstPage = +cfg.firstPage || 0;
    if (cfg.source) state.doc.source = cfg.source;
    if (cfg.cover) state.doc.cover = cfg.cover;
    if (cfg.back) state.doc.back = cfg.back;
    if (cfg.index) state.doc.index = cfg.index;
    // migração: capas salvas antes do Y livre não têm item.y → empilha;
    // capas salvas antes do logo não têm cov.logo → default (não quebra LS antigo)
    [state.doc.cover, state.doc.back].forEach(cov => {
      if (!cov) return;
      if (!cov.logo) cov.logo = defaultLogo();
      if (!cov.items) return;
      let yy = 40;
      cov.items.forEach(it => { if (typeof it.y !== 'number') { it.y = yy; yy += 60; } });
    });
  } catch {}
}
let saveT;
function save() { clearTimeout(saveT); saveT = setTimeout(() => {
  const cfg = {
    footText: state.doc.footText, headText: state.doc.headText, firstPage: state.doc.firstPage,
    source: state.doc.source || null, cover: state.doc.cover, back: state.doc.back, index: state.doc.index,
  };
  try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); }
  catch {                                    // quota (imagem de fundo grande) → salva sem os bg
    try {
      const light = JSON.parse(JSON.stringify(cfg));
      if (light.cover) light.cover.bg = null;
      if (light.back) light.back.bg = null;
      localStorage.setItem(LS_KEY, JSON.stringify(light));
    } catch {}
  }
}, 250); }

// ─────────────────────────── histórico (undo/redo) ──────────────────────────
// Snapshot do documento inteiro em JSON. Coalesce rajadas de digitação num só
// passo (commit debounced ao fim do render). ponytail: teto de 60 estados —
// imagens são data URLs pesadas; se precisar de mais, guardar delta em vez do doc.
const hist = { past: [], future: [], last: null };
const snap = () => JSON.stringify({ blocks: state.doc.blocks, footText: state.doc.footText, firstPage: state.doc.firstPage });
let commitT;
function scheduleCommit() { clearTimeout(commitT); commitT = setTimeout(commit, 500); }
function commit() {
  const s = snap();
  if (hist.last === null) { hist.last = s; return; }   // 1ª chamada: só marca a base
  if (s === hist.last) return;
  hist.past.push(hist.last);
  if (hist.past.length > 60) hist.past.shift();
  hist.last = s; hist.future.length = 0;
  updateHistBtns();
}
function restoreSnap(s) {
  const o = JSON.parse(s);
  state.doc.blocks = o.blocks; state.doc.footText = o.footText; state.doc.firstPage = o.firstPage;
  document.getElementById('footText').value = o.footText;
  document.getElementById('firstPage').value = o.firstPage;
  state.activeId = state.doc.blocks[0]?.id; state.sel = null; closeImgPanel();
  render();
}
function undo() {
  clearTimeout(commitT); commit();               // fecha a rajada pendente antes de voltar
  if (!hist.past.length) return;
  hist.future.push(hist.last);
  hist.last = hist.past.pop();
  restoreSnap(hist.last); updateHistBtns();
}
function redo() {
  if (!hist.future.length) return;
  hist.past.push(hist.last);
  hist.last = hist.future.pop();
  restoreSnap(hist.last); updateHistBtns();
}
function updateHistBtns() {
  const u = document.getElementById('btnUndo'), r = document.getElementById('btnRedo');
  if (u) u.disabled = !hist.past.length;
  if (r) r.disabled = !hist.future.length;
}

// índice de um bloco por id
const idxOf = (id) => state.doc.blocks.findIndex(b => b.id === id);
const blockOf = (id) => state.doc.blocks.find(b => b.id === id);

// ─────────────────────────── medição ────────────────────────────────────────
const measurer = document.createElement('div');
measurer.className = 'page';
measurer.setAttribute('aria-hidden', 'true');
measurer.style.cssText = 'position:absolute;left:-99999px;top:0;height:auto;overflow:visible;box-shadow:none;';
measurer.innerHTML = `<div class="mcol l" style="width:${COL_L}px"></div>`
  + `<div class="mcol f" style="width:${COL_FULL}px"></div>`;
document.body.appendChild(measurer);
const mL = measurer.querySelector('.mcol.l');
const mF = measurer.querySelector('.mcol.f');

function measure(b) {
  const el = buildBlock(b, /*editing*/ false);
  // tabela (trilha B t6) é full-width como a imagem 'full' → mede na coluna cheia, senão a
  // altura (e a paginação) sai errada por medir num container estreito demais.
  const col = ((b.type === 'image' && b.placement === 'full') || b.type === 'table') ? mF : mL;
  col.appendChild(el);
  const h = el.getBoundingClientRect().height;
  col.removeChild(el);
  return h;
}

// ─────────────────────────── construção de elementos ────────────────────────
function buildText(b, editing) {
  const isCheck = b.type === 'check';                                   // trilha B (t7)
  const tag = HEAD_TYPES.has(b.type) ? b.type
    : b.type === 'quote' ? 'blockquote' : (b.type === 'li' || b.type === 'ol' || isCheck) ? 'div' : 'p';
  const el = document.createElement(tag);
  // o texto do checklist é '.ck-txt' (SEM a classe 'b' — a moldura/hover/outline vai no envelope)
  el.className = isCheck ? 'ck-txt' : 'b ' + (b.type === 'li' ? 'li' : b.type === 'ol' ? 'ol' : b.type === 'quote' ? 'quote' : b.type);
  el.dataset.id = b.id;
  el.dataset.ph = PH[b.type] || '';
  if (b.type === 'ol') el.dataset.num = (b._num || 1) + '.';   // número calculado por numberLists()
  el.innerHTML = b.html || '';
  if (editing) {
    el.contentEditable = 'true'; el.spellcheck = true; el.lang = 'pt-BR';  // corretor nativo PT-BR
    if (b.id === state.activeId) el.classList.add('active-block');
  }
  if (!isCheck) return el;
  // trilha B (t7): checklist = envelope [checkbox][texto]. O checkbox é irmão NÃO-editável
  // (contentEditable=false, FORA do .ck-txt), então b.html continua sendo só o texto — o
  // sync do input, o toMarkdown e o measure ficam limpos, sem o markup do <input> no html.
  const wrap = document.createElement('div');
  wrap.className = 'b check' + (b.checked ? ' checked' : '');
  wrap.dataset.id = b.id;                        // '.col-left > [data-id]' (alça/drag) acha o envelope
  const box = document.createElement('input');
  box.type = 'checkbox'; box.className = 'ck-box'; box.checked = !!b.checked;
  box.contentEditable = 'false'; box.tabIndex = -1;
  if (editing) box.addEventListener('change', () => {   // togglar só a classe — sem rebuild no meio do clique
    b.checked = box.checked; wrap.classList.toggle('checked', box.checked); save(); scheduleCommit();
  });
  wrap.append(box, el);
  return wrap;
}

function imgHeight(b, colW) { return b.nw ? colW * (b.nh / b.nw) : colW * 0.6; }

function buildFigure(b, colW, editing) {
  const fig = document.createElement('figure');
  fig.className = 'fig b ' + (b.placement === 'full' ? 'fig-full' : b.placement === 'inline' ? 'fig-inline' : 'fig-right');
  fig.dataset.id = b.id;
  if (b.placement === 'full') fig.style.width = COL_FULL + 'px';
  if (state.sel === b.id) fig.classList.add('imgsel');

  if (b.title != null) {
    const t = document.createElement('div');
    t.className = 'figtitle'; t.dataset.role = 'title'; t.dataset.id = b.id;
    t.dataset.ph = 'Título da imagem'; t.innerHTML = b.title || '';
    if (editing) { t.contentEditable = 'true'; t.spellcheck = true; t.lang = 'pt-BR'; }
    fig.appendChild(t);
  }
  const img = document.createElement('img');
  img.src = b.src; img.draggable = false;
  img.style.height = imgHeight(b, colW) + 'px';
  img.style.borderRadius = (b.radius ?? 4) + 'px';
  fig.appendChild(img);

  if (b.caption != null) {
    const c = document.createElement('figcaption');
    c.dataset.role = 'caption'; c.dataset.id = b.id;
    c.dataset.ph = 'Legenda'; c.innerHTML = b.caption || '';
    if (editing) { c.contentEditable = 'true'; c.spellcheck = true; c.lang = 'pt-BR'; }
    fig.appendChild(c);
  }
  return fig;
}

// trilha B (t6): callbacks que o bloco Tabela usa — commit (edição de célula, sem rebuild),
// rerender (mudou a estrutura da tabela) e removeBlock (apagar a tabela inteira).
const tableCtx = {
  commit: () => { save(); scheduleCommit(); },
  rerender: () => render(),
  removeBlock: (id) => { const i = idxOf(id); if (i >= 0) state.doc.blocks.splice(i, 1); state.sel = null; render(); },
};

// bloco genérico (usado na medição e no fluxo da coluna esquerda / largura total)
function buildBlock(b, editing) {
  if (b.type === 'image') {
    const colW = b.placement === 'full' ? COL_FULL : COL_L;
    return buildFigure(b, colW, editing);
  }
  if (b.type === 'divider') {
    const d = document.createElement('div');
    d.className = 'divider b' + (state.sel === b.id ? ' divsel' : '');   // reaplica seleção pós-render
    d.dataset.id = b.id;
    return d;
  }
  if (b.type === 'pagebreak') {                    // trilha E: barra da quebra MANUAL
    // data-id → cai no mesmo sistema de arrasto de blocos (bhandle/dropTargetAt/applyDrop):
    // arrastar a barra move o pagebreak no array e reposiciona onde a página corta.
    const d = document.createElement('div');
    d.className = 'e-pbreak b'; d.dataset.id = b.id;
    d.innerHTML = '<span class="e-pbreak-lbl">— quebra de página · arraste —</span>';
    return d;
  }
  if (b.type === 'table') return buildTableEl(b, editing, tableCtx);   // trilha B (t6)
  return buildText(b, editing);
}

// numera as listas numéricas (runs consecutivos de 'ol'); imagens não quebram a run
function numberLists() {
  let n = 0;
  for (const b of state.doc.blocks) {
    if (b.type === 'ol') b._num = ++n;
    else if (b.type !== 'image') n = 0;
  }
}

// ─────────────────────────── paginação ──────────────────────────────────────
function paginate() {
  numberLists();
  const pages = [{ left: [], right: [] }];
  let used = 0;
  const stream = state.doc.blocks.filter(b => !(b.type === 'image' && b.placement === 'right'));
  const rights = state.doc.blocks.filter(b => b.type === 'image' && b.placement === 'right');

  for (const b of stream) {
    if (b.type === 'pagebreak') {
      // trilha E: no editor a quebra MANUAL vira uma barra arrastável no fim da página que
      // ela corta — só quando editing. No PDF (exportPagesHtml roda editing=false) a barra
      // some sozinha, mas a QUEBRA continua: empurramos a página nova nos dois modos.
      if (editing) { b._gap = 8; pages[pages.length - 1].left.push(b); }
      pages.push({ left: [], right: [] }); used = 0; continue;
    }
    const cur = pages[pages.length - 1];
    const h = measure(b);
    const prev = cur.left.length ? cur.left[cur.left.length - 1] : null;
    const gap = prev ? gapBefore(b, prev) : 0;
    if (cur.left.length && used + gap + h > CONTENT_H) {
      pages.push({ left: [b], right: [] });
      used = h;
      b._gap = 0;                       // vira o 1º bloco da nova página → sem gap acima
    } else {
      cur.left.push(b);
      used += gap + h;
      b._gap = gap;
    }
  }
  // imagens da coluna direita: ancoradas a uma página (clamp) + y livre
  for (const r of rights) {
    const pi = Math.min(Math.max(r.page | 0, 0), pages.length - 1);
    pages[pi].right.push(r);
  }
  return pages;
}

// ─────────────────────────── render ─────────────────────────────────────────
const pagesEl = document.getElementById('pages');
let editing = true;

// monta as páginas (capa/índice/miolo/contracapa) num container, numerando em sequência
function assemblePages(container) {
  const content = paginate();          // páginas do miolo (fluxo)
  const toc = buildToc(content);
  const cov = state.doc.cover, bk = state.doc.back, idx = state.doc.index;
  const coverN = cov && cov.on ? 1 : 0;
  const idxN = idx && idx.on ? 1 : 0;                       // v1: índice ocupa 1 página
  const contentStart = state.doc.firstPage + coverN + idxN; // nº impresso da 1ª pág. do miolo
  let n = state.doc.firstPage;
  if (cov && cov.on) { container.appendChild(renderCoverPage('cover', cov)); n++; }
  if (idx && idx.on) { container.appendChild(renderIndexPage(toc, contentStart, n)); n++; }
  content.forEach((pg, ci) => { container.appendChild(renderContentPage(pg, ci, n, ci < content.length - 1)); n++; });
  if (bk && bk.on) { container.appendChild(renderCoverPage('back', bk)); n++; }
}

function render(caret /* optional {id,offset,role} */) {
  const keep = caret || captureCaret();
  const scrollTop = stage.scrollTop;   // replaceChildren zera o scroll do palco → salva/restaura
  pagesEl.replaceChildren();
  assemblePages(pagesEl);

  applyZoom();
  stage.scrollTop = scrollTop;         // restaura a posição antes de mexer no caret
  if (keep) restoreCaret(keep);
  save();
  scheduleCommit();
}

// chrome comum das páginas do miolo/índice: molduras, cabeçalho corrido e rodapé
function pageShell(number) {
  const page = document.createElement('div');
  page.className = 'page' + (editing ? ' editing' : '');
  page.insertAdjacentHTML('beforeend', '<div class="rule top"></div><div class="rule bot"></div>');
  if (state.doc.headText) {
    const h = document.createElement('div'); h.className = 'runhead'; h.textContent = state.doc.headText;
    page.appendChild(h);
  }
  const foot = document.createElement('div'); foot.className = 'foot';
  const pnum = document.createElement('span'); pnum.className = 'pnum';
  pnum.textContent = String(number).padStart(2, '0');   // 2 dígitos; 3º a partir de 100
  const site = document.createElement('span'); site.className = 'site'; site.textContent = state.doc.footText;
  foot.append(pnum, site);
  page.appendChild(foot);
  return page;
}

function renderContentPage(pg, contentIdx, number, moreAfter) {
  const page = pageShell(number);
  page.dataset.page = contentIdx;                 // índice DENTRO do miolo (âncora de imagem da direita)
  const content = document.createElement('div'); content.className = 'content';
  const colL = document.createElement('div'); colL.className = 'col-left';
  const colR = document.createElement('div'); colR.className = 'col-right';
  for (const b of pg.left) {
    const el = buildBlock(b, editing);
    el.style.marginTop = (b._gap || 0) + 'px';
    colL.appendChild(el);
  }
  for (const r of pg.right) colR.appendChild(buildRight(r));
  content.append(colL, colR);
  // trilha E: no editor, marca o fim de página por TRANSBORDO (quebra AUTOMÁTICA, só informa).
  // Se a página já termina numa quebra MANUAL (barra arrastável), não duplica a marca.
  const endsInBreak = pg.left.length && pg.left[pg.left.length - 1].type === 'pagebreak';
  if (editing && moreAfter && !endsInBreak) {
    const mk = document.createElement('div'); mk.className = 'e-autobreak';
    mk.dataset.label = 'fim da página ' + String(number).padStart(2, '0');
    content.appendChild(mk);
  }
  page.appendChild(content);
  return page;
}

// índice automático: 1 linha por H1/H2/H3, numeração hierárquica, nº da página à direita
function buildToc(content) {
  const rows = []; const c = [0, 0, 0];
  content.forEach((pg, ci) => {
    for (const b of pg.left) {
      const lvl = b.type === 'h1' ? 1 : b.type === 'h2' ? 2 : b.type === 'h3' ? 3 : 0;
      if (!lvl) continue;
      // trilha C (t4): se o título já vem numerado ("1.2 - X"), usa o número lido
      // e remove o prefixo do texto; senão, contador hierárquico. tocNum muta c[].
      const { num, text } = tocNum(lvl, stripHtml(b.html), c);
      rows.push({ num, level: lvl, text, pageIdx: ci });
    }
  });
  return rows;
}

function renderIndexPage(toc, contentStart, number) {
  const page = pageShell(number);
  const wrap = document.createElement('div'); wrap.className = 'idx-content';
  const h1 = document.createElement('div'); h1.className = 'idx-title'; h1.textContent = 'Índice'; wrap.appendChild(h1);
  const list = document.createElement('div'); list.className = 'toc';
  if (!toc.length) {
    const empty = document.createElement('div'); empty.className = 'toc-empty';
    empty.textContent = 'O índice aparece aqui conforme você adiciona títulos (H1/H2/H3) ao miolo.';
    list.appendChild(empty);
  }
  for (const r of toc) {
    const row = document.createElement('div'); row.className = 'toc-row lvl' + r.level;
    row.innerHTML = `<span class="toc-label"><span class="toc-num">${r.num}</span><span class="toc-txt">${escapeHtml(r.text)}</span></span>`
      + `<span class="toc-pg">${String(contentStart + r.pageIdx).padStart(2, '0')}</span>`;
    list.appendChild(row);
  }
  wrap.appendChild(list);
  const h2 = document.createElement('div'); h2.className = 'idx-title'; h2.textContent = 'Resumo'; wrap.appendChild(h2);
  const res = document.createElement('div'); res.className = 'idx-resumo b'; res.dataset.role = 'resumo';
  res.dataset.ph = 'Escreva o resumo…'; res.innerHTML = state.doc.index.resumo || '';
  if (editing) { res.contentEditable = 'true'; res.spellcheck = true; res.lang = 'pt-BR'; }
  wrap.appendChild(res);
  page.appendChild(wrap);
  return page;
}

// capa / contracapa: fundo full-bleed (Fill, reposicionável) + itens numa grade de 2 colunas
function renderCoverPage(kind, cov) {
  const page = document.createElement('div');
  page.className = 'page cover-page' + (editing ? ' editing' : '');
  page.dataset.cover = kind;
  if (cov.bg) {
    const bg = document.createElement('div'); bg.className = 'cover-bg';
    bg.style.backgroundImage = `url("${cov.bg}")`;
    bg.style.backgroundPosition = `${cov.bgX ?? 50}% ${cov.bgY ?? 50}%`;   // reposicionável
    page.appendChild(bg);
  }
  const area = document.createElement('div'); area.className = 'cover-area';
  cov.items.forEach(it => area.appendChild(buildCoverItem(kind, it)));   // absolutos: coluna (x) + y livre
  page.appendChild(area);
  if (cov.logo && cov.logo.on) page.appendChild(buildCoverLogo(cov.logo));   // faixa fixa topo/base
  return page;
}

const LOGO_BASE_H = 30;   // altura-base (px) do logo em size=1; o slider (40–260%) escala em cima
// <svg> do logo tingido — mesma montagem do logoSvg() dos gráficos (currentColor→cor),
// mas aqui vira DOM (innerHTML). preserveAspectRatio mantém a proporção w/h do logo.
function coverLogoSvg(lg) {
  const L = LOGOS[lg.kind]; if (!L) return '';
  const h = LOGO_BASE_H * (lg.size || 1), w = h * (L.w / L.h);
  const inner = L.inner.replace(/currentColor/g, lg.color || '#FFFFFF');
  return `<svg width="${+w.toFixed(1)}" height="${+h.toFixed(1)}" viewBox="0 0 ${L.w} ${L.h}"`
    + ` preserveAspectRatio="xMidYMid meet" aria-hidden="true">${inner}</svg>`;
}
// faixa fixa (cabeçalho topo / rodapé base) com o logo alinhado esq/centro/dir. Fora
// do cover-area e do arrasto/anti-sobreposição; render sempre (mesmo !editing) → sai
// vetorial no PDF automaticamente via exportPagesHtml.
function buildCoverLogo(lg) {
  const el = document.createElement('div');
  el.className = 'cover-logo ' + (lg.pos === 'footer' ? 'lg-footer' : 'lg-header');
  el.style.justifyContent = lg.align === 'center' ? 'center' : lg.align === 'right' ? 'flex-end' : 'flex-start';
  el.innerHTML = coverLogoSvg(lg);
  return el;
}
// larguras das colunas na capa (iguais às do miolo): esq 258 · dir 217 · gap 24 → x=282
function coverColBox(span) {
  if (span === 'left') return { left: 0, width: 258 };
  if (span === 'right') return { left: 282, width: 217 };
  return { left: 0, width: COL_FULL };   // full = as duas colunas
}
function buildCoverItem(kind, it) {
  const el = document.createElement('div');
  el.className = 'cover-item' + (state.sel === it.id ? ' cover-sel' : '');
  el.dataset.cid = it.id; el.dataset.cover = kind;
  el.dataset.ph = 'Texto…';
  const box = coverColBox(it.span || 'full');
  el.style.position = 'absolute';
  el.style.top = (it.y || 0) + 'px';
  el.style.left = box.left + 'px';
  el.style.width = box.width + 'px';
  el.style.fontSize = (it.size || 24) + 'px';
  el.style.textAlign = it.align || 'left';
  if (it.color) el.style.color = it.color;
  el.innerHTML = it.html || '';
  if (editing) { el.contentEditable = 'true'; el.spellcheck = true; el.lang = 'pt-BR'; }
  return el;
}

// imagem da coluna direita: wrapper absoluto arrastável no eixo Y
function buildRight(b) {
  const wrap = document.createElement('div');
  wrap.className = 'rimg' + (state.sel === b.id ? ' imgsel' : '');
  wrap.dataset.id = b.id;
  const maxY = CONTENT_H - imgHeight(b, COL_R) - (b.title != null ? 18 : 0) - (b.caption != null ? 22 : 0);
  wrap.style.top = Math.min(Math.max(b.y | 0, 0), Math.max(0, maxY)) + 'px';
  const badge = document.createElement('span'); badge.className = 'drag-badge'; badge.textContent = '↕ arraste';
  wrap.appendChild(buildFigure(b, COL_R, editing));
  wrap.appendChild(badge);
  return wrap;
}

// ─────────────────────────── zoom ───────────────────────────────────────────
const stage = document.getElementById('stage');
function applyZoom() {
  let z = state.zoom;
  if (z === 'fit') z = Math.min(1, (stage.clientWidth - 64) / PAGE_W);
  pagesEl.style.transform = `scale(${z})`;
  // compensa a altura “perdida” pelo scale pra o scroll bater certo
  pagesEl.style.marginBottom = `-${(1 - z) * pagesEl.offsetHeight}px`;
}

// ─────────────────── caret/seleção (offsets em caracteres) ──────────────────
function captureCaret() {
  const sel = getSelection();
  if (!sel || !sel.rangeCount) return null;
  let el = sel.anchorNode;
  while (el && el.nodeType === 3) el = el.parentNode;
  const host = el && el.closest && el.closest('[contenteditable]');
  if (!host || !host.dataset.id) return null;
  const r = sel.getRangeAt(0);
  const pre = r.cloneRange();
  pre.selectNodeContents(host); pre.setEnd(r.startContainer, r.startOffset);
  const start = pre.toString().length;
  // guarda a SELEÇÃO inteira (start..end) — o re-render devolve o range, não só
  // um caret colapsado; é o que deixa formatar em sequência (B, depois I…)
  return { id: host.dataset.id, role: host.dataset.role || 'block', offset: start, end: start + r.toString().length };
}

function findEditable(keep) {
  const sel = keep.role === 'block' ? `[data-id="${keep.id}"][contenteditable]`
    : `[data-role="${keep.role}"][data-id="${keep.id}"]`;
  return pagesEl.querySelector(sel);
}

function restoreCaret(keep) {
  const el = findEditable(keep);
  if (!el) return;
  const a = boundaryAt(el, keep.offset);
  const b = keep.end != null && keep.end !== keep.offset ? boundaryAt(el, keep.end) : a;
  const r = document.createRange();
  r.setStart(a.node, a.off); r.setEnd(b.node, b.off);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  el.focus({ preventScroll: true });
}

// divide o HTML de um elemento no offset de caractere → [antes, depois]
function splitHtmlAt(el, offset) {
  const bound = boundaryAt(el, offset);
  const before = document.createRange();
  before.selectNodeContents(el); before.setEnd(bound.node, bound.off);
  const after = document.createRange();
  after.selectNodeContents(el); after.setStart(bound.node, bound.off);
  return [htmlOf(before.cloneContents()), htmlOf(after.cloneContents())];
}
function boundaryAt(el, offset) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n, count = 0, last = null;
  while ((n = walker.nextNode())) {
    last = n;
    const len = n.nodeValue.length;
    if (count + len >= offset) return { node: n, off: offset - count };
    count += len;
  }
  return last ? { node: last, off: last.nodeValue.length } : { node: el, off: 0 };
}
function htmlOf(frag) { const d = document.createElement('div'); d.appendChild(frag); return d.innerHTML; }

// ─────────────────────────── edição: teclado ────────────────────────────────
pagesEl.addEventListener('keydown', (e) => {
  const host = e.target.closest && e.target.closest('[contenteditable]');
  if (!host || !host.dataset.id) return;
  const role = host.dataset.role || 'block';

  if (role !== 'block') {
    // título/legenda de imagem: Enter só confirma (sem criar bloco)
    if (e.key === 'Enter') { e.preventDefault(); host.blur(); }
    return;
  }

  const id = host.dataset.id, b = blockOf(id);
  if (!b) return;

  // ⌘⏎ / Ctrl+⏎ → quebra de página no cursor
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); breakAtCaret(host, b); return; }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault(); enterAtCaret(host, b); return;
  }

  if (e.key === 'Backspace') {
    const c = captureCaret();
    if (c && c.offset === 0 && getSelection().isCollapsed) { e.preventDefault(); mergeBackwards(b); }
  }
});

function enterAtCaret(host, b) {
  const s0 = getSelection();
  if (s0 && !s0.isCollapsed) s0.deleteFromDocument();   // Enter sobre seleção apaga (Notion)
  const c = captureCaret();
  const [before, after] = splitHtmlAt(host, c ? c.offset : (host.textContent.length));

  // lista/citação/checklist vazia + Enter → vira parágrafo (sai da lista) — trilha B (t7) incluiu 'check'
  if ((b.type === 'li' || b.type === 'ol' || b.type === 'quote' || b.type === 'check') && !before.trim() && !after.trim()) {
    b.type = 'p'; b.html = '';
    render({ id: b.id, role: 'block', offset: 0 });
    return;
  }
  b.html = before;
  const newType = HEAD_TYPES.has(b.type) ? 'p' : b.type;   // título não continua; lista/citação sim
  const nb = mkBlock(newType, after);
  state.doc.blocks.splice(idxOf(b.id) + 1, 0, nb);
  render({ id: nb.id, role: 'block', offset: 0 });
}

function mergeBackwards(b) {
  const i = idxOf(b.id);
  if (i <= 0) return;
  const prev = state.doc.blocks[i - 1];
  if (prev.type === 'pagebreak' || prev.type === 'divider') {   // apaga a quebra/divisor
    state.doc.blocks.splice(i - 1, 1);
    render({ id: b.id, role: 'block', offset: 0 });
    return;
  }
  if (!TEXT_TYPES.has(prev.type)) return;     // imagem antes: não mescla
  const at = (new DOMParser().parseFromString('<x>' + (prev.html || '') + '</x>', 'text/html'))
    .querySelector('x').textContent.length;
  prev.html = (prev.html || '') + (b.html || '');
  state.doc.blocks.splice(i, 1);
  render({ id: prev.id, role: 'block', offset: at });
}

// insere um separador (pagebreak | divider) no cursor, quebrando o bloco atual
function breakAtCaret(host, b, sepType = 'pagebreak') {
  const s0 = getSelection();
  if (s0 && !s0.isCollapsed) s0.collapseToStart();
  const c = captureCaret();
  const [before, after] = splitHtmlAt(host, c ? c.offset : host.textContent.length);
  const i = idxOf(b.id);
  if (!before.trim()) {
    // no início do bloco → separador acima, bloco intacto continua
    state.doc.blocks.splice(i, 0, mkBlock(sepType, ''));
    render({ id: b.id, role: 'block', offset: 0 });
    return;
  }
  b.html = before;
  const sep = mkBlock(sepType, '');
  // fim do bloco: começa parágrafo vazio; meio: mantém o tipo com o resto
  const nb = after.trim() ? mkBlock(b.type, after) : mkBlock('p', '');
  state.doc.blocks.splice(i + 1, 0, sep, nb);
  render({ id: nb.id, role: 'block', offset: 0 });
}

// ─────────────────────────── edição: input (sync + atalhos md) ──────────────
let inputT;
pagesEl.addEventListener('input', (e) => {
  const host = e.target.closest && e.target.closest('[contenteditable]');
  if (!host || !host.dataset.id) return;
  const role = host.dataset.role || 'block';
  const b = blockOf(host.dataset.id);
  if (!b) return;

  if (role === 'title') { b.title = host.innerHTML; save(); return; }
  if (role === 'caption') { b.caption = host.innerHTML; save(); return; }

  // ── atalhos markdown ──────────────────────────────────────────────────────
  const t = host.textContent;
  const mkType = (tk) => tk === '#' ? 'h1' : tk === '##' ? 'h2' : tk === '###' ? 'h3' : tk === '####' ? 'h4'
    : tk === '>' ? 'quote' : /^\d+\.$/.test(tk) ? 'ol' : 'li';
  let m;
  // trilha B (t1): "/" no INÍCIO do bloco → menu popover de tipos (estilo Notion). Só dispara
  // com "/" seguido de não-espaços (o filtro); um espaço fecha, como no Notion. Não colide com
  // os atalhos "#/>/-/1./---" (nenhum começa com "/") nem com "/" no meio de uma frase (t[0]≠'/').
  if (TEXT_TYPES.has(b.type) && t[0] === '/' && /^\/(\S*)$/.test(t)) {
    b.html = host.innerHTML; save();            // mantém o "/filtro" e o caret; o menu só escolhe
    slash.open(b.id, t.slice(1));
    return;
  }
  if (slash.isOpen()) slash.close();            // deixou de ser "/…" → fecha o menu
  // trilha B (t7): "[] " / "[ ] " / "[x] " no início de um p → checklist (segue os atalhos md abaixo)
  if (b.type === 'p' && (m = t.match(/^\[([ xX]?)\] ([\s\S]*)$/))) {
    b.type = 'check'; b.checked = /[xX]/.test(m[1]); b.html = escapeHtml(m[2]);
    render({ id: b.id, role: 'block', offset: 0 }); syncTypeUI('check');
    return;
  }
  // (1) commit: "marcador + espaço" → vira o tipo e CONSOME o marcador
  if ((b.type === 'p' || b._auto) && (m = t.match(/^(#{1,4}|>|[-*]|\d+\.) ([\s\S]*)$/))) {
    b.type = mkType(m[1]); b.html = escapeHtml(m[2]); delete b._auto;
    render({ id: b.id, role: 'block', offset: 0 }); syncTypeUI(b.type);
    return;
  }
  // (2) preview AO VIVO do título: só "#".."####" (sem espaço) já muda o estilo, mantendo o texto
  if ((b.type === 'p' || b._auto) && (m = t.match(/^#{1,4}$/))) {
    const nt = mkType(m[0]);
    b._auto = true; b.html = host.innerHTML;
    if (b.type !== nt) { b.type = nt; render({ id: b.id, role: 'block', offset: t.length }); syncTypeUI(nt); return; }
    save(); scheduleCommit(); return;
  }
  // (3) revert: título aplicado ao vivo que deixou de ser "#…" (apagou o #) → volta a parágrafo
  if (b._auto) {
    b.type = 'p'; delete b._auto; b.html = host.innerHTML;
    render({ id: b.id, role: 'block', offset: t.length }); syncTypeUI('p');
    return;
  }
  // (4) divisor
  if (b.type === 'p' && (t === '---' || t === '***' || t === '___')) {
    const nb = mkBlock('p', '');
    state.doc.blocks.splice(idxOf(b.id), 1, mkBlock('divider', ''), nb);
    render({ id: nb.id, role: 'block', offset: 0 });
    return;
  }
  b.html = host.innerHTML;
  syncTypeUI(b.type);
  // reflow depois de pausar de digitar (evita rebuild a cada tecla)
  clearTimeout(inputT); inputT = setTimeout(() => render(), 180);
});

// trilha B (t1): menu "/" — a lista de tipos sai da MESMA paleta #blocktypes (rótulo+ícone),
// sem duplicar nada. Aplicar reusa setActiveType()/insertSeparatorButton()/addImageViaPalette().
const slash = initSlashMenu({
  defs: [...document.querySelectorAll('#blocktypes button')].map(btn => ({
    type: btn.dataset.type,
    label: (btn.querySelector('.lbl') || {}).textContent || btn.dataset.type,
    icon: (btn.querySelector('.ico') || {}).innerHTML || '',
  })),
  onPick: (def, id) => {
    const b = id && blockOf(id); if (!b) return;
    state.activeId = b.id;
    b.html = '';                                // tira o "/filtro" digitado do bloco
    if (def.type === 'pagebreak' || def.type === 'divider' || def.type === 'image') {
      render({ id: b.id, role: 'block', offset: 0 });   // limpa o DOM e devolve o caret ao bloco vazio
      if (def.type === 'image') addImageViaPalette(); else insertSeparatorButton(def.type);
    } else {
      setActiveType(def.type);                  // reusa a troca de tipo (já renderiza + foca)
    }
  },
});

pagesEl.addEventListener('focusin', (e) => {
  const host = e.target.closest && e.target.closest('[contenteditable]');
  if (host && (host.dataset.role || 'block') === 'block') {
    const b = blockOf(host.dataset.id);
    if (b) {
      state.activeId = b.id; syncTypeUI(b.type);
      setSegment('conteudo');                  // clicar num bloco → aba Conteúdo
      // borda no bloco ativo: mostra a quem o menu lateral se refere
      pagesEl.querySelectorAll('.active-block').forEach(el => el.classList.remove('active-block'));
      host.classList.add('active-block');
      showHandleAtFocused();                   // alça fica acessível enquanto o bloco está em foco
    }
  }
});

// seleciona/desseleciona imagem SEM re-render (um rebuild no meio do gesto de
// arraste destruía o elemento com pointer capture — era isso que fazia a imagem
// "pular" em vez de acompanhar o mouse)
function setImgSel(id) {
  state.sel = id;
  pagesEl.querySelectorAll('.imgsel, .divsel, .cover-sel').forEach(el => el.classList.remove('imgsel', 'divsel', 'cover-sel'));
  closeCoverPanel();
  const b = id && blockOf(id);
  if (!b) { closeImgPanel(); return; }
  if (b.type === 'divider') {                    // divisor: borda roxa, sem painel
    const el = pagesEl.querySelector(`.divider[data-id="${id}"]`);
    if (el) el.classList.add('divsel');
    closeImgPanel();
    return;
  }
  const el = pagesEl.querySelector(`.rimg[data-id="${id}"]`) || pagesEl.querySelector(`figure[data-id="${id}"]`);
  if (el) el.classList.add('imgsel');
  openImgPanel();
}

// clicar numa figura/divisor/item de capa seleciona
pagesEl.addEventListener('mousedown', (e) => {
  if (e.target.closest && e.target.closest('.rimg')) return;   // o pointerdown do drag cuida
  const coverIt = e.target.closest && e.target.closest('.cover-item');
  const fig = e.target.closest && e.target.closest('figure.fig');
  const divider = e.target.closest && e.target.closest('.divider.b');
  const editable = e.target.closest && e.target.closest('[contenteditable]');
  if (coverIt) selectCoverItem(coverIt.dataset.cid);
  else if (fig && !editable) setImgSel(fig.dataset.id);
  else if (divider) setImgSel(divider.dataset.id);
  else if (state.sel && !e.target.closest('#imgPanel') && !e.target.closest('#coverPanel')) setImgSel(null);
});

// clicar na área vazia da coluna direita → menu flutuante pra adicionar imagem
pagesEl.addEventListener('click', (e) => {
  const colR = e.target.closest && e.target.closest('.col-right');
  const onImg = e.target.closest('.rimg') || e.target.closest('figure.fig');
  if (colR && !onImg) openAddImgMenu(e, colR);
});

// ─────────────────────────── paste (Google Docs / Word / md) ────────────────
pagesEl.addEventListener('paste', (e) => {
  const host = e.target.closest && e.target.closest('[contenteditable]');
  if (!host || !host.dataset.id || (host.dataset.role || 'block') !== 'block') return;  // só blocos do miolo
  const html = e.clipboardData.getData('text/html');
  const text = e.clipboardData.getData('text/plain');
  // URL colada sobre um texto selecionado → vira link clicável (sublinhado via CSS)
  const url = text.trim();
  if (!getSelection().isCollapsed && URL_RE.test(url)) {
    e.preventDefault();
    document.execCommand('createLink', false, /^www\./i.test(url) ? 'https://' + url : url);
    return;                                    // o evento 'input' do execCommand sincroniza o bloco
  }
  const blocks = html ? blocksFromHtml(html) : parseMarkdown(text);
  if (!blocks.length) return;
  e.preventDefault();
  const b = blockOf(host.dataset.id);
  const c = captureCaret();
  const [before, after] = splitHtmlAt(host, c ? c.offset : host.textContent.length);
  // 1º bloco colado emenda no texto antes do cursor; resto entra como blocos
  b.html = before + (blocks[0].type === 'p' ? blocks[0].html : '');
  const insert = blocks.slice(blocks[0].type === 'p' ? 1 : 0);
  if (after.trim()) insert.push(mkBlock('p', after));
  state.doc.blocks.splice(idxOf(b.id) + 1, 0, ...insert);
  const last = insert[insert.length - 1] || b;
  render({ id: last.id, role: 'block', offset: last === b ? before.length : (last.textLen ?? 99999) });
});

// ─────────────────────────── imagens: arrastar (coluna direita) ─────────────
let drag = null;
const SNAP = 6;                              // px de tolerância pro snap
pagesEl.addEventListener('pointerdown', (e) => {
  const wrap = e.target.closest && e.target.closest('.rimg');
  if (!wrap || e.target.closest('[contenteditable]')) return;
  e.preventDefault();                        // não vira seleção de texto nem mousedown
  const b = blockOf(wrap.dataset.id);
  const content = wrap.closest('.content');
  const colLeft = content && content.querySelector('.col-left');
  // alvos de snap = topo de cada bloco da coluna esquerda (mesma página) + 0
  const snaps = colLeft ? [0, ...[...colLeft.children].map(c => c.offsetTop)] : [0];
  drag = { b, wrap, content, snaps, startY: e.clientY, startTop: parseFloat(wrap.style.top) || 0, z: currentZoom(), _y: null };
  wrap.classList.add('dragging'); wrap.setPointerCapture(e.pointerId);
  setImgSel(b.id);                           // seleção por classe — nada de render() aqui
});
pagesEl.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dy = (e.clientY - drag.startY) / drag.z;
  let y = drag.startTop + dy;
  const maxY = CONTENT_H - drag.wrap.offsetHeight;
  y = Math.min(Math.max(y, 0), Math.max(0, maxY));
  // snap: alinha ao topo do bloco mais próximo da coluna esquerda
  let hit = null, best = SNAP;
  for (const s of drag.snaps) { const d = Math.abs(s - y); if (d < best) { best = d; hit = s; } }
  if (hit != null) y = hit;
  showSnapGuide(drag.content, hit);
  drag.wrap.style.top = y + 'px';
  drag._y = y;
});
pagesEl.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const d = drag, wrap = d.wrap, b = d.b;
  wrap.classList.remove('dragging'); showSnapGuide(d.content, null);
  // solto sobre a coluna esquerda? → sai da direita e entra no fluxo como imagem
  wrap.style.pointerEvents = 'none';
  const under = document.elementFromPoint(e.clientX, e.clientY);
  wrap.style.pointerEvents = '';
  drag = null;
  if (under && under.closest && under.closest('.col-left')) { applyDrop(b.id, dropTargetAt(e.clientX, e.clientY)); return; }
  if (d._y != null) b.y = Math.round(d._y);
  save(); scheduleCommit();
});

// linha-guia do snap (some quando hit é null)
function showSnapGuide(content, y) {
  if (!content) return;
  let g = content.querySelector('.snap-guide');
  if (y == null) { if (g) g.style.display = 'none'; return; }
  if (!g) { g = document.createElement('div'); g.className = 'snap-guide'; content.appendChild(g); }
  g.style.top = y + 'px'; g.style.display = 'block';
}

// ── reordenar blocos (alça estilo Notion) + mover imagem entre as colunas ─────
const bhandle = document.createElement('div');
bhandle.id = 'bhandle'; bhandle.textContent = '⠿'; bhandle.hidden = true; bhandle.title = 'Arraste para mover';
document.body.appendChild(bhandle);
const dropLine = document.createElement('div');
dropLine.id = 'dropline'; dropLine.hidden = true;
document.body.appendChild(dropLine);
let handleFor = null, bdrag = null, cdrag = null;   // handleFor: {kind:'miolo'|'cover', id}

const GAP_CV = 10;   // folga mínima entre blocos da capa (anti-sobreposição)
// blocos da capa colidem se as faixas X (colunas) se cruzam
function coverXOverlap(a, b) {
  const A = coverColBox(a.span || 'full'), B = coverColBox(b.span || 'full');
  return A.left < B.left + B.width && B.left < A.left + A.width;
}
// bloco que a alça ancora quando nada está sob o mouse: o que está EM FOCO
function focusedHandleTarget() {
  if (state.sel) { const c = pagesEl.querySelector(`.cover-item[data-cid="${state.sel}"]`); if (c) return { el: c, kind: 'cover', id: state.sel }; }
  if (state.activeId) { const b = pagesEl.querySelector(`.col-left > [data-id="${state.activeId}"]`); if (b) return { el: b, kind: 'miolo', id: state.activeId }; }
  return null;
}
function placeHandle(t) {
  if (!t) { bhandle.hidden = true; handleFor = null; return; }
  handleFor = { kind: t.kind, id: t.id };
  const r = t.el.getBoundingClientRect();
  bhandle.style.left = (r.left - 22) + 'px'; bhandle.style.top = (r.top + 1) + 'px';
  bhandle.hidden = false;
}
const showHandleAtFocused = () => { if (!bdrag && !cdrag && !drag) placeHandle(focusedHandleTarget()); };

// a alça ⠿ serve o miolo (reordenar) E a capa (reposicionar no Y). Fica visível no
// hover E enquanto o bloco está em foco (pra dar pra alcançá-la sem ela sumir).
pagesEl.addEventListener('mousemove', (e) => {
  if (bdrag || drag || cdrag) return;
  if (e.target.closest && e.target.closest('#bhandle')) return;   // sobre a alça: mantém
  const cov = e.target.closest && e.target.closest('.cover-item');
  const blk = e.target.closest && e.target.closest('.col-left > [data-id]');
  const hov = cov ? { el: cov, kind: 'cover', id: cov.dataset.cid } : blk ? { el: blk, kind: 'miolo', id: blk.dataset.id } : null;
  placeHandle(hov || focusedHandleTarget());     // fora de bloco → volta pro bloco em foco
});
pagesEl.addEventListener('mouseleave', () => showHandleAtFocused());

bhandle.addEventListener('pointerdown', (e) => {
  if (!handleFor) return;
  e.preventDefault();
  bhandle.style.pointerEvents = 'none'; document.body.classList.add('grabbing');
  if (handleFor.kind === 'cover') {              // capa/contracapa: arrasta no eixo Y (como as imagens)
    const f = findCoverItem(handleFor.id); if (!f) return;
    cdrag = { id: handleFor.id, item: f.item, startY: e.clientY, startTop: f.item.y || 0, z: currentZoom() };
    selectCoverItem(handleFor.id);
  } else {
    bdrag = { id: handleFor.id, target: null };
  }
});
// trilha E: a própria barra de quebra inicia o MESMO bdrag do #bhandle — mirar a alça ⠿
// fininha numa barra larga é ruim. O pointermove/pointerup globais já cuidam do resto.
pagesEl.addEventListener('pointerdown', (e) => {
  const bar = e.target.closest && e.target.closest('.e-pbreak');
  if (!bar || !bar.dataset.id) return;
  e.preventDefault();
  document.body.classList.add('grabbing');
  bdrag = { id: bar.dataset.id, target: null };
});
const COVER_AREA_H = PAGE_H - 40 - 40;            // capa: área com padding vertical 40px
document.addEventListener('pointermove', (e) => {
  if (cdrag) {
    const node = pagesEl.querySelector(`.cover-item[data-cid="${cdrag.id}"]`);
    const h = node ? node.offsetHeight : 0;
    const dy = (e.clientY - cdrag.startY) / (cdrag.z || 1);
    let y = Math.min(Math.max(0, cdrag.startTop + dy), Math.max(0, COVER_AREA_H - h));
    // snap anti-sobreposição: não cruza blocos da mesma faixa X; encosta com folga
    const cov = findCoverItem(cdrag.id)?.cov;
    if (cov) {
      const others = cov.items.filter(it => it.id !== cdrag.id && coverXOverlap(it, cdrag.item))
        .map(it => { const n = pagesEl.querySelector(`.cover-item[data-cid="${it.id}"]`); return { top: it.y || 0, h: n ? n.offsetHeight : 0 }; });
      for (const o of others) {
        if (y < o.top + o.h + GAP_CV && y + h > o.top - GAP_CV) {   // sobreposição → encosta no vizinho
          const above = o.top - GAP_CV - h, below = o.top + o.h + GAP_CV;
          y = Math.abs(y - above) <= Math.abs(y - below) ? above : below;
        }
      }
      y = Math.min(Math.max(0, y), Math.max(0, COVER_AREA_H - h));
    }
    cdrag.item.y = Math.round(y);
    if (node) node.style.top = cdrag.item.y + 'px';
    return;
  }
  if (!bdrag) return;
  bdrag.target = dropTargetAt(e.clientX, e.clientY);
  showDrop(bdrag.target);
});
document.addEventListener('pointerup', () => {
  if (cdrag) { cdrag = null; bhandle.style.pointerEvents = ''; bhandle.hidden = true; document.body.classList.remove('grabbing'); save(); scheduleCommit(); return; }
});
document.addEventListener('pointerup', () => {
  if (!bdrag) return;
  const { id, target } = bdrag; bdrag = null;
  bhandle.style.pointerEvents = ''; bhandle.hidden = true; dropLine.hidden = true;
  document.body.classList.remove('grabbing');
  if (target) applyDrop(id, target);
});

// onde soltar? sobre a coluna direita → imagem à direita; senão, antes/depois do bloco mais próximo
function dropTargetAt(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el || !el.closest) return null;
  const colR = el.closest('.col-right');
  if (colR) { const p = colR.closest('.page'); return p && p.dataset.page != null ? { kind: 'right', page: +p.dataset.page } : null; }
  const page = el.closest('.page');
  if (!page || page.dataset.cover || page.querySelector('.idx-content')) return null;   // só miolo
  const blocks = [...pagesEl.querySelectorAll('.col-left > [data-id]')];
  if (!blocks.length) return null;
  let ref = null, before = true, bestD = Infinity;
  for (const bl of blocks) {
    const r = bl.getBoundingClientRect();
    const mid = r.top + r.height / 2, d = Math.abs(y - mid);
    if (d < bestD) { bestD = d; ref = bl; before = y < mid; }
  }
  return ref ? { kind: 'left', refId: ref.dataset.id, before } : null;
}
function showDrop(t) {
  if (!t || t.kind !== 'left') { dropLine.hidden = true; return; }
  const el = pagesEl.querySelector(`.col-left > [data-id="${t.refId}"]`);
  if (!el) { dropLine.hidden = true; return; }
  const r = el.getBoundingClientRect();
  dropLine.style.left = r.left + 'px'; dropLine.style.width = r.width + 'px';
  dropLine.style.top = (t.before ? r.top : r.bottom) + 'px';
  dropLine.hidden = false;
}
// move o bloco `id` para o alvo (reordena no fluxo ou joga pra coluna direita)
function applyDrop(id, t) {
  const b = blockOf(id); if (!b || !t) return;
  if (t.kind === 'right') {
    if (b.type !== 'image') return;               // só imagem vai pra coluna direita
    b.placement = 'right'; if (b.y == null) b.y = 0; b.page = t.page;
    render(); return;
  }
  if (t.refId === id) return;                      // soltou em si mesmo
  const from = idxOf(id);
  if (b.type === 'image' && b.placement === 'right') { b.placement = 'inline'; delete b.y; delete b.page; }
  const [moved] = state.doc.blocks.splice(from, 1);
  const ri = idxOf(t.refId);
  const at = ri < 0 ? state.doc.blocks.length : (t.before ? ri : ri + 1);
  state.doc.blocks.splice(at, 0, moved);
  render();
}

function currentZoom() {
  const m = /scale\(([\d.]+)\)/.exec(pagesEl.style.transform);
  return m ? +m[1] : 1;
}

// ─────────────────────────── painel flutuante da imagem selecionada ─────────
// ícones +/− dos botões Título/Legenda (16×16, currentColor — mesmo padrão fino
// dos SVGs de #blocktypes): "+" quando ainda não existe, "−" quando já existe
// (o botão vira "remover"). Texto do label fica só "Título"/"Legenda" (t1).
const PLUS_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>';
const MINUS_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 8h10"/></svg>';
let imgPanel;
function openImgPanel() {
  const b = blockOf(state.sel);
  if (!b || b.type !== 'image') return;
  if (!imgPanel) {
    imgPanel = document.createElement('div');
    imgPanel.id = 'imgPanel';
    document.body.appendChild(imgPanel);
  }
  const radius = b.radius ?? 4;
  imgPanel.innerHTML = `
    <div class="eyebrow" style="margin:0">Imagem</div>
    <div class="row" style="gap:.4rem">
      <button type="button" class="fieldbtn" data-a="title">${b.title != null ? MINUS_SVG : PLUS_SVG}<span>Título</span></button>
      <button type="button" class="fieldbtn" data-a="caption">${b.caption != null ? MINUS_SVG : PLUS_SVG}<span>Legenda</span></button>
    </div>
    <div class="field">Posição<div data-slot="col"></div></div>
    <label class="field"><span class="field-row">Cantos (raio) <span class="field-val"><span data-role="radv">${radius}px</span><button type="button" class="resetbtn" data-a="radiusreset" title="Redefinir para 4px">↺</button></span></span>
      <input type="range" data-a="radius" min="0" max="24" step="1" value="${radius}">
    </label>
    <label class="checkrow"><input type="checkbox" data-a="autocrop" ${state.autocrop !== false ? 'checked' : ''}>Cortar margem branca <span style="color:var(--muted)">(próxima imagem)</span></label>
    <button data-a="del" style="color:#CE5249">Remover imagem</button>`;
  imgPanel.hidden = false;
  // seletor de coluna (MESMO componente da capa): imagem usa 'inline'/'full'/'right'
  imgPanel.querySelector('[data-slot="col"]').append(
    columnField(b.placement, { left: 'inline', full: 'full', right: 'right' }, (v) => {
      b.placement = v; if (v === 'right' && b.y == null) b.y = 0;
      render(); if (state.sel) openImgPanel();
    }));
  // reset (t4) não pode roubar foco/seleção no mousedown — mesmo padrão do resto do app (ex. fmtbar)
  imgPanel.querySelector('[data-a="radiusreset"]').addEventListener('mousedown', (e) => e.preventDefault());
  positionImgPanel();

  imgPanel.querySelectorAll('button[data-a],select[data-a],input[data-a]').forEach(el => {
    const ev = el.tagName === 'SELECT' ? 'change' : el.type === 'range' ? 'input' : 'click';
    el.addEventListener(ev, () => {
      const a = el.dataset.a;
      if (a === 'radius' || a === 'radiusreset') {   // sem re-render: mantém o arraste do slider fluido
        b.radius = a === 'radiusreset' ? 4 : +el.value;   // 4 = mesmo default de `b.radius ?? 4` (t4)
        if (a === 'radiusreset') imgPanel.querySelector('input[data-a="radius"]').value = b.radius;
        const img = pagesEl.querySelector(`figure[data-id="${b.id}"] img`);
        if (img) img.style.borderRadius = b.radius + 'px';
        imgPanel.querySelector('[data-role="radv"]').textContent = b.radius + 'px';
        save(); scheduleCommit();
        return;
      }
      if (a === 'autocrop') { state.autocrop = el.checked; return; }   // só o padrão da próxima imagem; sem re-render
      if (a === 'title') b.title = b.title != null ? null : '';
      else if (a === 'caption') b.caption = b.caption != null ? null : '';
      else if (a === 'del') { state.doc.blocks.splice(idxOf(b.id), 1); state.sel = null; closeImgPanel(); }
      render(); if (state.sel) openImgPanel();
    });
  });
}
function positionImgPanel() {
  if (!imgPanel || imgPanel.hidden) return;
  const el = pagesEl.querySelector(`.rimg[data-id="${state.sel}"]`) || pagesEl.querySelector(`figure[data-id="${state.sel}"]`);
  if (!el) return;
  const r = el.getBoundingClientRect();
  const pw = imgPanel.offsetWidth || 220, ph = imgPanel.offsetHeight || 200;
  let x = r.right + 10; if (x + pw > innerWidth - 8) x = Math.max(8, r.left - pw - 10);
  const y = Math.min(Math.max(8, r.top), innerHeight - ph - 8);
  imgPanel.style.left = x + 'px'; imgPanel.style.top = y + 'px';
}
function closeImgPanel() { if (imgPanel) imgPanel.hidden = true; }

// ─────────────────────────── menu flutuante: Imagem | Gráfico ────────────────
const addImgMenu = document.getElementById('addImgMenu');
const amChoices = addImgMenu.querySelector('.am-choices');
const amImage = addImgMenu.querySelector('.am-image');
function openAddImgMenu(e, colR) {
  state.addPage = +colR.closest('.page').dataset.page || 0;   // imagem/gráfico nasce nessa página
  amChoices.hidden = false; amImage.hidden = true;            // sempre abre na tela de escolha
  addImgMenu.hidden = false;
  const mw = addImgMenu.offsetWidth || 240, mh = addImgMenu.offsetHeight || 160;
  const x = Math.min(e.clientX, innerWidth - mw - 8);
  const y = Math.min(e.clientY, innerHeight - mh - 8);
  addImgMenu.style.left = Math.max(8, x) + 'px';
  addImgMenu.style.top = Math.max(8, y) + 'px';
}
function closeAddImgMenu() { if (addImgMenu) addImgMenu.hidden = true; }
addImgMenu.querySelector('[data-opt="image"]').addEventListener('click', () => {
  amChoices.hidden = true; amImage.hidden = false;            // experiência atual (arquivo + posição)
});
addImgMenu.querySelector('[data-opt="chart"]').addEventListener('click', () => {
  chartTargetPage = state.addPage; closeAddImgMenu(); openChartModal();
});
document.addEventListener('mousedown', (e) => {                // fecha ao clicar fora
  if (addImgMenu.hidden) return;
  if (e.target.closest('#addImgMenu') || e.target.closest('.col-right')) return;
  closeAddImgMenu();
}, true);

// ─────────────────────────── modal do gráfico (iframe embed) ─────────────────
let chartTargetPage = 0;
const chartModal = document.getElementById('chartModal');
const cmFrame = document.getElementById('cmFrame');
function openChartModal() {
  if (!cmFrame.getAttribute('src')) cmFrame.src = 'graficos.html?embed=1';   // carrega 1×
  chartModal.hidden = false;
}
function closeChartModal() { chartModal.hidden = true; }
document.getElementById('cmClose').addEventListener('click', closeChartModal);
chartModal.querySelector('.cm-backdrop').addEventListener('click', closeChartModal);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !chartModal.hidden) closeChartModal(); });

// recebe o SVG do gráfico (postMessage do iframe) → vira imagem na coluna direita
addEventListener('message', (e) => {
  if (e.origin !== location.origin) return;
  const d = e.data;
  if (!d || d.type !== 'pdgm-chart-svg' || !d.svg) return;
  const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(d.svg);
  const b = { id: uid(), type: 'image', src, placement: 'right', radius: 4,
    nw: d.w || 640, nh: d.h || 400, y: 0, page: chartTargetPage };
  const at = state.activeId ? idxOf(state.activeId) + 1 : state.doc.blocks.length;
  state.doc.blocks.splice(at, 0, b);
  state.sel = b.id;
  closeChartModal();
  render(); openImgPanel();
});

// ─────────────────────────── capa/contracapa + resumo: edição ────────────────
// sync do texto (contenteditable simples — sem o motor de blocos do miolo)
pagesEl.addEventListener('input', (e) => {
  const host = e.target.closest && e.target.closest('[contenteditable]');
  if (!host) return;
  if (host.dataset.cid) { const f = findCoverItem(host.dataset.cid); if (f) { f.item.html = host.innerHTML; save(); scheduleCommit(); } return; }
  if (host.dataset.role === 'resumo') { state.doc.index.resumo = host.innerHTML; save(); scheduleCommit(); }
});

function selectCoverItem(cid) {
  state.sel = cid;
  pagesEl.querySelectorAll('.imgsel,.divsel,.cover-sel').forEach(el => el.classList.remove('imgsel', 'divsel', 'cover-sel'));
  closeImgPanel();
  const el = pagesEl.querySelector(`.cover-item[data-cid="${cid}"]`);
  if (el) el.classList.add('cover-sel');
  openCoverPanel();
  showHandleAtFocused();                   // alça de arraste fica visível no bloco selecionado
}

let coverPanel;
function openCoverPanel() {
  const f = findCoverItem(state.sel); if (!f) return;
  const it = f.item;
  if (!coverPanel) { coverPanel = document.createElement('div'); coverPanel.id = 'coverPanel'; document.body.appendChild(coverPanel); }
  coverPanel.innerHTML = `
    <div class="eyebrow" style="margin:0">Texto</div>
    <label class="field"><span class="field-row">Tamanho <span class="field-val"><span data-role="szv">${it.size}px</span><button type="button" class="resetbtn" data-a="sizereset" title="Redefinir para 18px">↺</button></span></span>
      <input type="range" data-a="size" min="8" max="120" step="1" value="${it.size}"></label>
    <label class="field">Cor <button type="button" class="colorfield" data-cf style="background:${it.color || '#000000'}"></button></label>
    <div class="field">Coluna<div data-slot="col"></div></div>
    <label class="field">Alinhamento
      <select data-a="align">
        <option value="left"${it.align === 'left' ? ' selected' : ''}>Esquerda</option>
        <option value="center"${it.align === 'center' ? ' selected' : ''}>Centro</option>
        <option value="right"${it.align === 'right' ? ' selected' : ''}>Direita</option>
      </select></label>
    <button data-a="del" style="color:#CE5249">Remover texto</button>`;
  coverPanel.hidden = false;
  // seletor de coluna (mesmo componente do popover de Imagem)
  coverPanel.querySelector('[data-slot="col"]').append(
    columnField(it.span || 'full', { left: 'left', full: 'full', right: 'right' }, (v) => {
      const cur = findCoverItem(state.sel); if (!cur) return;
      cur.item.span = v; render(); openCoverPanel();
    }));
  // cor (mesmo swatch dos gráficos)
  const cf = coverPanel.querySelector('[data-cf]');
  cf.addEventListener('click', () => openSwatchPop(cf, (hex) => {
    const cur = findCoverItem(state.sel); if (!cur) return;
    cur.item.color = hex; cf.style.background = hex;
    const node = pagesEl.querySelector(`.cover-item[data-cid="${cur.item.id}"]`);
    if (node) node.style.color = hex;
    save(); scheduleCommit();
  }, it.color || '#000000'));
  // reset (t4) não pode roubar foco/seleção no mousedown — mesmo padrão do resto do app (ex. fmtbar)
  coverPanel.querySelector('[data-a="sizereset"]').addEventListener('mousedown', (e) => e.preventDefault());
  positionCoverPanel();
  coverPanel.querySelectorAll('[data-a]').forEach(el => {
    const ev = el.tagName === 'SELECT' ? 'change' : el.type === 'range' ? 'input' : 'click';
    el.addEventListener(ev, () => {
      const cur = findCoverItem(state.sel); if (!cur) return;
      const a = el.dataset.a, node = pagesEl.querySelector(`.cover-item[data-cid="${cur.item.id}"]`);
      if (a === 'size' || a === 'sizereset') {      // sem re-render: slider fluido + push/pull
        const oldH = node ? node.offsetHeight : 0;
        cur.item.size = a === 'sizereset' ? 18 : +el.value;   // 18 = mesmo default de addCoverText() (t4)
        if (a === 'sizereset') coverPanel.querySelector('input[data-a="size"]').value = cur.item.size;
        if (node) node.style.fontSize = cur.item.size + 'px';
        coverPushPull(cur.cov, cur.item, (node ? node.offsetHeight : 0) - oldH);   // empurra/puxa os de baixo
        coverPanel.querySelector('[data-role="szv"]').textContent = cur.item.size + 'px';
        save(); scheduleCommit(); return;
      }
      if (a === 'del') { cur.list.splice(cur.idx, 1); state.sel = null; closeCoverPanel(); render(); return; }
      if (a === 'align') cur.item.align = el.value;
      render(); openCoverPanel();
    });
  });
}
function positionCoverPanel() {
  if (!coverPanel || coverPanel.hidden) return;
  const el = pagesEl.querySelector(`.cover-item[data-cid="${state.sel}"]`);
  if (!el) return;
  const r = el.getBoundingClientRect();
  const pw = coverPanel.offsetWidth || 220, ph = coverPanel.offsetHeight || 240;
  let x = r.right + 10; if (x + pw > innerWidth - 8) x = Math.max(8, r.left - pw - 10);
  const y = Math.min(Math.max(8, r.top), innerHeight - ph - 8);
  coverPanel.style.left = x + 'px'; coverPanel.style.top = y + 'px';
}
function closeCoverPanel() { if (coverPanel) coverPanel.hidden = true; }

// adiciona um texto novo à capa/contracapa e o seleciona
function addCoverText(kind) {
  const cov = kind === 'back' ? state.doc.back : state.doc.cover;
  const y = Math.min(cov.items.reduce((m, i) => Math.max(m, i.y || 0), 0) + 46, 700);  // empilha abaixo
  const it = coverItem('Novo texto', 18, 'full', 'left', null, y);
  cov.items.push(it);
  state.sel = it.id;
  render(); selectCoverItem(it.id);
}
// imagem de fundo (data URL) — respeita o padding via CSS
function setCoverBg(kind, file) {
  const r = new FileReader();
  r.onload = () => { (kind === 'back' ? state.doc.back : state.doc.cover).bg = r.result; render(); };
  r.readAsDataURL(file);
}

// ─────────────────────────── import / parsing ───────────────────────────────
const escapeHtml = (s) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const stripHtml = (h) => { const d = document.createElement('div'); d.innerHTML = h || ''; return d.textContent; };
// acha um item de capa/contracapa por id → { cov, list, idx, item }
function findCoverItem(id) {
  for (const cov of [state.doc.cover, state.doc.back]) {
    if (!cov) continue;
    const i = cov.items.findIndex(it => it.id === id);
    if (i >= 0) return { cov, list: cov.items, idx: i, item: cov.items[i] };
  }
  return null;
}
const inlineMd = (s) => escapeHtml(s)
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  .replace(/(^|\W)\*(.+?)\*(?=\W|$)/g, '$1<i>$2</i>')
  .replace(/(^|\W)_(.+?)_(?=\W|$)/g, '$1<i>$2</i>');

function parseMarkdown(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const out = []; let para = [];
  const flush = () => { if (para.length) { out.push(mkBlock('p', inlineMd(para.join(' ')))); para = []; } };
  for (const line of lines) {
    let m;
    if (/^\s*$/.test(line)) flush();
    else if ((m = line.match(/^#\s+(.*)/))) { flush(); out.push(mkBlock('h1', inlineMd(m[1]))); }
    else if ((m = line.match(/^##\s+(.*)/))) { flush(); out.push(mkBlock('h2', inlineMd(m[1]))); }
    else if ((m = line.match(/^###\s+(.*)/))) { flush(); out.push(mkBlock('h3', inlineMd(m[1]))); }
    else if ((m = line.match(/^#{4,6}\s+(.*)/))) { flush(); out.push(mkBlock('h4', inlineMd(m[1]))); }
    else if ((m = line.match(/^\s*\d+\.\s+(.*)/))) { flush(); out.push(mkBlock('ol', inlineMd(m[1]))); }
    else if ((m = line.match(/^\s*[-*]\s+(.*)/))) { flush(); out.push(mkBlock('li', inlineMd(m[1]))); }
    else if ((m = line.match(/^>\s?(.*)/))) { flush(); out.push(mkBlock('quote', inlineMd(m[1]))); }
    else if (/^(-{3,}|_{3,}|\*{3,})\s*$/.test(line)) { flush(); out.push(mkBlock('divider', '')); }
    else para.push(line.trim());
  }
  flush();
  return out.length ? out : [mkBlock('p', '')];
}

// Serializa o conteúdo inline de um nó preservando <b>/<i>/<u>/<s> e <br> —
// inclusive quando as marcas vêm como <span style="font-weight:700"> etc.
// (é assim que o Google Docs e o Word põem negrito/itálico no clipboard).
function inlineHtmlOf(node) {
  let out = '';
  for (const n of node.childNodes) {
    if (n.nodeType === 3) { out += escapeHtml(n.nodeValue); continue; }
    if (n.nodeType !== 1) continue;
    const tag = n.tagName.toLowerCase();
    if (tag === 'br') { out += '<br>'; continue; }
    let inner = inlineHtmlOf(n);
    if (!inner.trim() && !inner.includes('<br>')) continue;
    // decisão de marcas centralizada no parser puro (paste-style.js) — negrito/itálico/
    // sublinhado/tachado viram tag; cor/fundo (Figma, tarefa 10) viram <span style> enxuto,
    // os mesmos atributos que o foreColor/hiliteColor da tarefa 5 geram.
    const { bold, italic, underline, strike, color, bg } = marksFromStyle(n.style, tag);
    if (bold) inner = '<b>' + inner + '</b>';
    if (italic) inner = '<i>' + inner + '</i>';
    if (underline) inner = '<u>' + inner + '</u>';
    if (strike) inner = '<s>' + inner + '</s>';
    if (color || bg) {
      const s = (color ? 'color:' + color + ';' : '') + (bg ? 'background-color:' + bg + ';' : '');
      inner = '<span style="' + s + '">' + inner + '</span>';
    }
    out += inner;
  }
  return out;
}

function blocksFromHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const nodes = doc.body.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,hr,img');
  const out = [];
  nodes.forEach(n => {
    const tag = n.tagName.toLowerCase();
    if (tag === 'img') { if (n.src) out.push({ id: uid(), type: 'image', src: n.src, placement: 'full', nw: n.naturalWidth || n.width || 600, nh: n.naturalHeight || n.height || 360 }); return; }
    if (tag === 'hr') { out.push(mkBlock('divider', '')); return; }
    if (tag !== 'li' && n.closest('li')) return;                    // p dentro de li: o li resolve
    if (tag === 'p' && n.closest('blockquote')) return;             // p dentro de quote: idem
    const h = inlineHtmlOf(n).trim();
    if (tag === 'h1') { if (h) out.push(mkBlock('h1', h)); }
    else if (tag === 'h2') { if (h) out.push(mkBlock('h2', h)); }
    else if (tag === 'h3') { if (h) out.push(mkBlock('h3', h)); }
    else if (/^h[4-6]$/.test(tag)) { if (h) out.push(mkBlock('h4', h)); }
    else if (tag === 'li') { if (h) out.push(mkBlock(n.closest('ol') ? 'ol' : 'li', h)); }
    else if (tag === 'blockquote') { if (h) out.push(mkBlock('quote', h)); }
    else out.push(mkBlock('p', h));   // p vazio fica: parágrafo em branco é intencional
  });
  // trilha A (t10): Figma copia SEM tags de bloco — só <span>/texto com estilo inline.
  // querySelectorAll acima não achou nada; preserva a formatação inline (inlineHtmlOf já
  // mantém negrito/itálico/cor) e separa parágrafos por <br> ou quebra de linha (o Figma
  // usa \n dentro de spans white-space:pre-wrap).
  // ponytail: variante rara de "uma <div> por linha" junta as linhas num parágrafo só;
  //           só resolvo se aparecer — o formato comum (pre-wrap/<br>) está coberto.
  if (!out.length) {
    inlineHtmlOf(doc.body).split(/<br\s*\/?>|\n/).forEach(p => { const h = p.trim(); if (h) out.push(mkBlock('p', h)); });
  }
  return out.length ? out : parseMarkdown(doc.body.textContent || '');
}

// dispara o seletor de arquivo pra inserir uma imagem na COLUNA ESQUERDA (inline)
let pendingImgPlacement = null;
function addImageViaPalette() {
  pendingImgPlacement = 'inline';
  document.getElementById('imgfile').click();
}

// arquivo -> imagem (captura dimensões naturais). placementOverride vem da paleta de blocos.
function addImageFile(file, placementOverride) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const placement = placementOverride || document.getElementById('imgPlacement').value;
      // trilha C (t3): recorta a margem branca ANTES de montar o bloco. nw/nh têm
      // que virar o tamanho recortado, senão imgHeight() erra a proporção. O crop
      // roda no ADD (antes do painel existir p/ esta imagem); o checkbox do painel
      // controla o PADRÃO da PRÓXIMA imagem — comportamento aceito pelo plano.
      let src = reader.result, nw = img.naturalWidth, nh = img.naturalHeight;
      if (state.autocrop !== false) {
        const cropped = autocropWhite(img);
        if (cropped) { src = cropped.dataUrl; nw = cropped.w; nh = cropped.h; }
      }
      const b = { id: uid(), type: 'image', src, placement, radius: 4, nw, nh };
      if (placement === 'right') { b.y = 0; b.page = state.addPage ?? lastEditedPage(); }
      state.addPage = null;
      closeAddImgMenu();
      // insere logo após o bloco em foco (ou no fim)
      const at = state.activeId ? idxOf(state.activeId) + 1 : state.doc.blocks.length;
      state.doc.blocks.splice(at, 0, b);
      state.sel = b.id;
      render(); openImgPanel();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}
function lastEditedPage() {
  const el = state.activeId && pagesEl.querySelector(`[data-id="${state.activeId}"]`);
  const page = el && el.closest('.page');
  return page ? +page.dataset.page : 0;
}

// ─────────────────────────── export markdown ────────────────────────────────
// trilha B (t6): tabela em markdown pipe (| a | b |\n| --- | --- |\n| 1 | 2 |)
function tableMd(rows, strip) {
  if (!rows || !rows.length) return '';
  const line = (r) => '| ' + r.map(c => strip(c) || '').join(' | ') + ' |';
  const sep = '| ' + rows[0].map(() => '---').join(' | ') + ' |';
  return [line(rows[0]), sep, ...rows.slice(1).map(line)].join('\n');
}
function toMarkdown() {
  const strip = (h) => { const d = document.createElement('div'); d.innerHTML = h || ''; return d.textContent; };
  return state.doc.blocks.map(b => {
    switch (b.type) {
      case 'h1': return '# ' + strip(b.html);
      case 'h2': return '## ' + strip(b.html);
      case 'h3': return '### ' + strip(b.html);
      case 'h4': return '#### ' + strip(b.html);
      case 'li': return '- ' + strip(b.html);
      case 'ol': return (b._num || 1) + '. ' + strip(b.html);
      case 'check': return (b.checked ? '- [x] ' : '- [ ] ') + strip(b.html);   // trilha B (t7)
      case 'table': return tableMd(b.rows, strip);                              // trilha B (t6)
      case 'quote': return '> ' + strip(b.html);
      case 'divider': return '\n---\n';
      case 'pagebreak': return '\n<!-- quebra de página -->\n';
      case 'image': return `![${strip(b.title) || ''}](imagem)` + (b.caption ? `\n*${strip(b.caption)}*` : '');
      default: return strip(b.html);
    }
  }).join('\n\n');
}

// ─────────────────────────── origem vinculada + sincronização ───────────────
// kv mínimo em IndexedDB só pro FileSystemFileHandle (não serializa em JSON;
// com ele o "Sincronizar" relê o MESMO arquivo local mesmo depois de recarregar)
const idb = {
  open() { return new Promise((res, rej) => { const r = indexedDB.open('pdgm-diag', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async get(k) { try { const db = await this.open(); return await new Promise(res => {
    const g = db.transaction('kv').objectStore('kv').get(k);
    g.onsuccess = () => res(g.result); g.onerror = () => res(null); }); } catch { return null; } },
  async set(k, v) { try { const db = await this.open(); db.transaction('kv', 'readwrite').objectStore('kv').put(v, k); } catch {} },
  async del(k) { try { const db = await this.open(); db.transaction('kv', 'readwrite').objectStore('kv').delete(k); } catch {} },
};

let fileHandle = null;   // FileSystemFileHandle da origem (quando o browser suporta)

function setBlocks(blocks) {
  state.doc.blocks = blocks.length ? blocks : [mkBlock('p', '')];
  state.activeId = state.doc.blocks[0].id; state.sel = null;
  closeImgPanel(); renderSourceChip(); render();
}

async function pickFile() {
  if (!window.showOpenFilePicker) { document.getElementById('file').click(); return; }
  let h;
  try {
    [h] = await showOpenFilePicker({ types: [{ description: 'Texto', accept: { 'text/plain': ['.md', '.markdown', '.txt'] } }] });
  } catch { return; }                        // usuário cancelou
  fileHandle = h;
  state.doc.source = { kind: 'file', label: h.name };
  idb.set('fh', h);
  const f = await h.getFile();
  setBlocks(parseMarkdown(await f.text()));
}

function importGdoc(url) {
  const m = /\/document\/d\/([\w-]+)/.exec(url) || /^([\w-]{20,})$/.exec(String(url).trim());
  if (!m) { alert('URL do Google Docs inválida — cole o link do documento.'); return; }
  fileHandle = null; idb.del('fh');
  state.doc.source = { kind: 'gdoc', id: m[1], label: 'Google Docs' };
  syncNow(/*fresh*/ true);
}

async function syncNow(fresh = false) {
  const s = state.doc.source;
  if (!s) return;
  const dirty = state.doc.blocks.some(b => (b.html && b.html.trim()) || b.type === 'image');
  if (!fresh && dirty && !confirm('Sincronizar substitui o conteúdo atual pelo do documento de origem. Continuar?')) return;
  try {
    if (s.kind === 'gdoc') {
      const r = await fetch('/api/gdoc?id=' + s.id);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'HTTP ' + r.status);
      const html = await r.text();
      const t = /<title>(.*?)<\/title>/.exec(html);
      if (t && t[1]) s.label = 'Google Docs · ' + t[1].replace(/\s*-\s*(Google\s*)?(Docs|Documentos).*$/i, '');
      setBlocks(blocksFromHtml(html));
    } else {
      if (!fileHandle) { await pickFile(); return; }   // handle perdido → escolher de novo
      if (await fileHandle.queryPermission() !== 'granted'
        && await fileHandle.requestPermission() !== 'granted') throw new Error('permissão de leitura negada');
      const f = await fileHandle.getFile();
      setBlocks(parseMarkdown(await f.text()));
    }
  } catch (e) { alert('Sincronização falhou: ' + (e.message || e)); }
}

// grava o documento atual (como markdown) de volta no arquivo de origem
async function saveToSource() {
  const s = state.doc.source;
  if (!s || s.kind !== 'file') return;
  if (!fileHandle) { downloadMd(); return; }        // sem File System Access API: baixa o .md
  try {
    if (await fileHandle.queryPermission({ mode: 'readwrite' }) !== 'granted'
      && await fileHandle.requestPermission({ mode: 'readwrite' }) !== 'granted')
      throw new Error('permissão de escrita negada');
    const w = await fileHandle.createWritable();
    await w.write(toMarkdown());
    await w.close();
    flashSaved();
  } catch (e) { alert('Não foi possível salvar no arquivo: ' + (e.message || e)); }
}
function flashSaved() {
  const b = srcRow.querySelector('#btnSave');
  if (!b) return;
  const t = b.textContent; b.textContent = 'Salvo ✓'; b.disabled = true;
  setTimeout(() => { b.textContent = t; b.disabled = false; }, 1500);
}

const srcRow = document.getElementById('srcRow');
function renderSourceChip() {
  const s = state.doc.source;
  if (!s) { srcRow.hidden = true; return; }
  srcRow.hidden = false;
  // arquivo local → Salvar (grava as edições de volta); Google Docs é leitura → Sincronizar (reimporta)
  const action = s.kind === 'gdoc'
    ? `<button id="btnSync" class="primary" title="Reimportar o conteúdo do Google Docs">Sincronizar</button>`
    : `<button id="btnSave" class="primary" title="Salvar as alterações no arquivo original">Salvar no arquivo</button>`;
  srcRow.innerHTML = `<span class="src-label">${s.kind === 'gdoc' ? '🌐' : '📄'} ${escapeHtml(s.label || '')}</span>
    ${action}
    <button id="btnUnlink" title="Desvincular origem">✕</button>`;
  const sync = srcRow.querySelector('#btnSync'); if (sync) sync.addEventListener('click', () => syncNow());
  const savebtn = srcRow.querySelector('#btnSave'); if (savebtn) savebtn.addEventListener('click', saveToSource);
  srcRow.querySelector('#btnUnlink').addEventListener('click', () => {
    state.doc.source = null; fileHandle = null; idb.del('fh'); save(); renderSourceChip();
  });
}

// ─────────────────────────── UI: segment control (Documento / Conteúdo) ─────
const segBtns = [...document.querySelectorAll('#segment button')];
function setSegment(name) {
  segBtns.forEach(b => b.setAttribute('aria-selected', String(b.dataset.seg === name)));
  document.querySelectorAll('.pane').forEach(p => { p.hidden = p.dataset.pane !== name; });
}
segBtns.forEach(b => b.addEventListener('click', () => setSegment(b.dataset.seg)));

// ─────────────────────────── UI: sidebar / controles ────────────────────────
const btByType = {};
document.querySelectorAll('#blocktypes button').forEach(btn => {
  btByType[btn.dataset.type] = btn;
  btn.addEventListener('mousedown', (e) => e.preventDefault());   // não rouba o caret/seleção do bloco
  btn.addEventListener('click', () => {
    const t = btn.dataset.type;
    if (t === 'pagebreak') return insertSeparatorButton('pagebreak');
    if (t === 'divider') return insertSeparatorButton('divider');
    if (t === 'image') return addImageViaPalette();
    setActiveType(t);
  });
});
function syncTypeUI(type) {
  Object.entries(btByType).forEach(([t, b]) => b.setAttribute('aria-pressed', String(t === type)));
}
function setActiveType(t) {
  const id = state.activeId;
  const b = id && blockOf(id);
  if (b && TEXT_TYPES.has(b.type)) {
    const keep = captureCaret();             // preserva a SELEÇÃO (não só o caret)
    b.type = t;
    render(keep && keep.id === b.id ? keep : { id: b.id, role: 'block', offset: 0 });
    syncTypeUI(t);
  }
  else { const nb = mkBlock(t, ''); state.doc.blocks.push(nb); state.activeId = nb.id; render({ id: nb.id, role: 'block', offset: 0 }); syncTypeUI(t); }
}
function insertSeparatorButton(sepType) {
  const id = state.activeId, host = id && pagesEl.querySelector(`[data-id="${id}"][contenteditable]`);
  const b = id && blockOf(id);
  if (host && b) breakAtCaret(host, b, sepType);
  else { state.doc.blocks.push(mkBlock(sepType, ''), mkBlock('p', '')); render(); }
}

document.getElementById('btnFile').addEventListener('click', pickFile);
// fallback sem File System Access API (Safari/Firefox): importa, mas o
// Sincronizar reabre o seletor em vez de reler o mesmo arquivo sozinho
document.getElementById('file').addEventListener('change', (e) => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { fileHandle = null; state.doc.source = { kind: 'file', label: f.name }; setBlocks(parseMarkdown(r.result)); };
  r.readAsText(f); e.target.value = '';
});
document.getElementById('btnGdoc').addEventListener('click', () => importGdoc(document.getElementById('gdocUrl').value));
document.getElementById('gdocUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') importGdoc(e.target.value); });
document.getElementById('imgfile').addEventListener('change', (e) => {
  const f = e.target.files[0]; if (f) addImageFile(f, pendingImgPlacement);
  pendingImgPlacement = null; e.target.value = '';
});
document.getElementById('btnNew').addEventListener('click', () => {
  if (!confirm('Limpar o documento atual e desvincular a origem?')) return;
  state.doc = seedDoc(); fileHandle = null; idb.del('fh');
  document.getElementById('footText').value = state.doc.footText;
  document.getElementById('headText').value = state.doc.headText || '';
  document.getElementById('firstPage').value = state.doc.firstPage;
  syncSpecialUI();
  setBlocks(state.doc.blocks);
});
document.getElementById('btnSample').addEventListener('click', () => {
  state.doc.blocks = parseMarkdown(SAMPLE); state.activeId = state.doc.blocks[0].id; render();
});
document.getElementById('footText').addEventListener('input', (e) => { state.doc.footText = e.target.value; render(); });
document.getElementById('headText').addEventListener('input', (e) => { state.doc.headText = e.target.value; render(); });
document.getElementById('firstPage').addEventListener('input', (e) => { state.doc.firstPage = +e.target.value || 0; render(); });

// ── páginas especiais: switches + controles de capa/contracapa ──
const specialObj = (key) => key === 'cover' ? state.doc.cover : key === 'back' ? state.doc.back : state.doc.index;
function syncSubCtrl() {
  document.querySelectorAll('.subctrl[data-sub]').forEach(el => { el.hidden = !specialObj(el.dataset.sub).on; });
}
function syncSpecialUI() {
  document.querySelectorAll('.sw[data-sw]').forEach(sw => sw.setAttribute('aria-checked', String(specialObj(sw.dataset.sw).on)));
  document.querySelectorAll('[data-bgx]').forEach(s => { s.value = specialObj(s.dataset.bgx).bgX ?? 50; });
  document.querySelectorAll('[data-bgy]').forEach(s => { s.value = specialObj(s.dataset.bgy).bgY ?? 50; });
  syncSubCtrl();
  syncLogoUI();
}
// espelha o campo logo (de cada capa) na sidebar. "none" = logo desligado; os opts
// (posição/alinhamento/cor/tamanho) só aparecem com o logo ligado.
function syncLogoUI() {
  document.querySelectorAll('[data-logopick]').forEach(pick => {
    const lg = specialObj(pick.dataset.logopick).logo;
    const active = lg.on ? lg.kind : 'none';
    pick.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.logokind === active)));
  });
  document.querySelectorAll('[data-logoopts]').forEach(o => { o.hidden = !specialObj(o.dataset.logoopts).logo.on; });
  document.querySelectorAll('[data-logopos]').forEach(s => { s.value = specialObj(s.dataset.logopos).logo.pos; });
  document.querySelectorAll('[data-logoalign]').forEach(s => { s.value = specialObj(s.dataset.logoalign).logo.align; });
  document.querySelectorAll('[data-logocolor]').forEach(b => { b.style.background = specialObj(b.dataset.logocolor).logo.color; });
  document.querySelectorAll('[data-logosize]').forEach(s => { s.value = Math.round((specialObj(s.dataset.logosize).logo.size || 1) * 100); });
  document.querySelectorAll('[data-logosizev]').forEach(sp => { sp.textContent = (+(specialObj(sp.dataset.logosizev).logo.size || 1).toFixed(2)) + '×'; });
}
// escala ao vivo (sem re-render, como os sliders de fundo) — só redimensiona o <svg> já montado
function applyCoverLogoLive(kind) {
  const lg = specialObj(kind).logo;
  const svg = pagesEl.querySelector(`.page[data-cover="${kind}"] .cover-logo svg`);
  if (!svg) { if (lg.on) render(); return; }        // logo ainda não existe no DOM → render normal
  const L = LOGOS[lg.kind]; if (!L) return;
  const h = LOGO_BASE_H * (lg.size || 1);
  svg.setAttribute('height', +h.toFixed(1)); svg.setAttribute('width', +(h * (L.w / L.h)).toFixed(1));
}
// reposiciona o fundo ao vivo (sem re-render) — Fill com controle X/Y
function applyCoverBgPos(kind) {
  const cov = specialObj(kind);
  const bg = pagesEl.querySelector(`.page[data-cover="${kind}"] .cover-bg`);
  if (bg) bg.style.backgroundPosition = `${cov.bgX ?? 50}% ${cov.bgY ?? 50}%`;
}
document.querySelectorAll('.sw[data-sw]').forEach(sw => sw.addEventListener('click', () => {
  const obj = specialObj(sw.dataset.sw);
  obj.on = !obj.on; sw.setAttribute('aria-checked', String(obj.on));
  syncSubCtrl(); render();
}));
document.querySelectorAll('[data-bg]').forEach(inp => inp.addEventListener('change', (e) => {
  const f = e.target.files[0]; if (f) setCoverBg(inp.dataset.bg, f); e.target.value = '';
}));
document.querySelectorAll('[data-rmbg]').forEach(btn => btn.addEventListener('click', () => { specialObj(btn.dataset.rmbg).bg = null; render(); }));
document.querySelectorAll('[data-addtxt]').forEach(btn => btn.addEventListener('click', () => addCoverText(btn.dataset.addtxt)));
document.querySelectorAll('[data-bgx]').forEach(s => s.addEventListener('input', (e) => { specialObj(s.dataset.bgx).bgX = +e.target.value; applyCoverBgPos(s.dataset.bgx); save(); scheduleCommit(); }));
document.querySelectorAll('[data-bgy]').forEach(s => s.addEventListener('input', (e) => { specialObj(s.dataset.bgy).bgY = +e.target.value; applyCoverBgPos(s.dataset.bgy); save(); scheduleCommit(); }));
// ── logo da Paradigma na capa/contracapa (trilha D) — picker + posição/alinhamento/cor/tamanho ──
document.querySelectorAll('[data-logopick]').forEach(pick => pick.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-logokind]'); if (!b) return;
  const lg = specialObj(pick.dataset.logopick).logo;
  if (b.dataset.logokind === 'none') lg.on = false;          // "none" desliga; demais ligam e trocam o kind
  else { lg.on = true; lg.kind = b.dataset.logokind; }
  syncLogoUI(); render();
}));
document.querySelectorAll('[data-logopos]').forEach(s => s.addEventListener('change', (e) => { specialObj(s.dataset.logopos).logo.pos = e.target.value; render(); }));
document.querySelectorAll('[data-logoalign]').forEach(s => s.addEventListener('change', (e) => { specialObj(s.dataset.logoalign).logo.align = e.target.value; render(); }));
document.querySelectorAll('[data-logocolor]').forEach(b => b.addEventListener('click', () => {
  const lg = specialObj(b.dataset.logocolor).logo;
  openSwatchPop(b, (hex) => { lg.color = hex; b.style.background = hex; render(); }, lg.color);
}));
document.querySelectorAll('[data-logosize]').forEach(s => s.addEventListener('input', (e) => {
  const kind = s.dataset.logosize, lg = specialObj(kind).logo;
  lg.size = +e.target.value / 100;
  const sp = document.querySelector(`[data-logosizev="${kind}"]`); if (sp) sp.textContent = (+lg.size.toFixed(2)) + '×';
  applyCoverLogoLive(kind); save(); scheduleCommit();
}));
document.getElementById('zoom').addEventListener('change', (e) => { state.zoom = e.target.value === 'fit' ? 'fit' : +e.target.value; applyZoom(); });

// ── exportar PDF (WYSIWYG, vetorial, com links) — sem o diálogo de imprimir ──
let _fontUri;
async function plexFontFace() {
  if (!_fontUri) {
    const b = await (await fetch('fonts/IBMPlexSans-Var.ttf')).blob();
    _fontUri = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
  }
  return `@font-face{font-family:"Plex";src:url("${_fontUri}") format("truetype-variations");font-weight:100 700;font-stretch:62% 100%;font-display:block;}`;
}
// monta o HTML auto-contido das páginas (edição desligada → sem alças/contornos)
function exportPagesHtml() {
  const prev = editing; editing = false;
  const tmp = document.createElement('div'); tmp.id = 'pages';
  assemblePages(tmp);
  editing = prev;
  return tmp.outerHTML;
}
async function exportPdf() {
  const btn = document.getElementById('btnPrint');
  const label = btn.textContent; btn.disabled = true; btn.textContent = 'Gerando PDF…';
  try {
    const [css, fontFace] = await Promise.all([fetch('paradigma.css').then(r => r.text()), plexFontFace()]);
    const diagStyle = [...document.querySelectorAll('head style')].map(s => s.textContent).join('\n');
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>${fontFace}</style><style>${css}</style><style>${diagStyle}</style>
<style>
  /* A4 real: as páginas são desenhadas em 595×842 "px" que representam pt (A4) →
     zoom 96/72 escala o design pra preencher a folha A4 exata, vetorial. */
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  header, aside, .stage { display: none !important; }
  #pages { display: block; transform: none !important; margin: 0 !important; }
  .page { box-shadow: none !important; margin: 0 !important; zoom: 1.3333333; break-after: page; }
  .page:last-child { break-after: auto; }
</style></head><body>${exportPagesHtml()}</body></html>`;
    const r = await fetch('/api/pdf', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ html }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'HTTP ' + r.status);
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (state.doc.source?.label || 'relatorio').replace(/\.[^.]+$/, '') + '.pdf';
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch (e) { alert('Falha ao gerar PDF: ' + (e.message || e)); }
  finally { btn.disabled = false; btn.textContent = label; }
}
document.getElementById('btnPrint').addEventListener('click', exportPdf);
function downloadMd() {
  const blob = new Blob([toMarkdown()], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (state.doc.source?.label || 'diagramacao').replace(/\.[^.]+$/, '') + '.md';
  a.click();
  URL.revokeObjectURL(a.href);
}
document.getElementById('btnMd').addEventListener('click', downloadMd);
addEventListener('resize', () => { if (state.zoom === 'fit') applyZoom(); });

const SAMPLE = `# Relatório de mercado
## Perpétuos on-chain

A Paradigma acompanha a migração da liquidez de derivativos para as DEXs de perpétuos. O volume nos últimos trimestres mostra uma casa de pesquisa atenta ao que o mercado sinaliza, não ao ruído.

- Volume total cresce trimestre a trimestre
- A participação das DEXs sobe de forma consistente
- Taxas acumuladas seguem o mesmo sentido

> A tese continua a mesma: acompanhar o dado, publicar a ideia.

## Próximos passos

O próximo bloco de conteúdo detalha a leitura por protocolo, com os gráficos gerados na ferramenta de Gráficos deste mesmo gerador.`;

// ──────────────── barra flutuante de formatação (estilo Notion) ─────────────
const fmtbar = document.getElementById('fmtbar');
// mousedown na barra NÃO pode roubar o foco/seleção do texto
fmtbar.addEventListener('mousedown', (e) => e.preventDefault());

fmtbar.querySelectorAll('.markbtn').forEach(btn => btn.addEventListener('click', () => {
  document.execCommand(btn.dataset.cmd);   // dispara 'input' → sincroniza o bloco
  updateFmtbar();
}));
fmtbar.querySelectorAll('.typebtn').forEach(btn => btn.addEventListener('click', () => {
  setActiveType(btn.dataset.t);
  updateFmtbar();
}));

// trilha A (t5): cor do texto / destaque. ARMADILHA — o swatch (openSwatchPop) vive no
// <body>, FORA do fmtbar, então NÃO herda o preventDefault do mousedown da barra. Clicar
// num chip tira o foco do contenteditable e colapsa a seleção. Por isso guardamos o Range
// AQUI (a barra ainda segura a seleção) e o restauramos antes do execCommand.
fmtbar.querySelectorAll('.colorbtn').forEach(btn => btn.addEventListener('click', () => {
  const sel = getSelection();
  if (!sel || !sel.rangeCount) return;
  const saved = sel.getRangeAt(0).cloneRange();
  const host = editableHostOfRange(saved);
  openSwatchPop(btn, (hex) => {
    if (host) host.focus();
    const s = getSelection(); s.removeAllRanges(); s.addRange(saved);
    // foreColor sai como <font color>; hiliteColor como <span style="background-color">
    // — ambos disparam 'input' e sincronizam o bloco (mesmo caminho dos .markbtn).
    const ok = document.execCommand(btn.dataset.cmd, false, hex);
    if (btn.dataset.cmd === 'hiliteColor' && !ok) document.execCommand('backColor', false, hex);
    updateFmtbar();
  });
}));

// trilha A (t2): abre o mini-editor de URL (aplica createLink / edita / remove <a>)
fmtbar.querySelector('.linkbtn').addEventListener('click', openLinkEdit);

// sobe de um nó até o contenteditable do miolo que o contém (ou null)
function editableHostOfRange(range) {
  let n = range && range.commonAncestorContainer;
  while (n && n.nodeType === 3) n = n.parentNode;
  return (n && n.closest && n.closest('#pages [contenteditable]')) || null;
}
// <a> sob a seleção/cursor (ou null)
function anchorInSelection(sel) {
  let n = sel && sel.anchorNode;
  while (n && n.nodeType === 3) n = n.parentNode;
  return (n && n.closest && n.closest('#pages [contenteditable] a')) || null;
}

function updateFmtbar() {
  const sel = getSelection();
  const r = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
  let host = null;
  if (r && !sel.isCollapsed) {
    let n = sel.anchorNode;
    while (n && n.nodeType === 3) n = n.parentNode;
    host = n && n.closest && n.closest('#pages [contenteditable]');
  }
  if (!host) { fmtbar.hidden = true; return; }
  const role = host.dataset.role || 'block';
  const isMiolo = !!host.dataset.id && role === 'block';   // capa/legenda/resumo → só marcas, sem tipos
  fmtbar.classList.toggle('caption-mode', !isMiolo);
  fmtbar.querySelectorAll('.markbtn').forEach(b =>
    b.classList.toggle('on', document.queryCommandState(b.dataset.cmd)));
  // trilha A (t2): reflete se a seleção está sobre um link existente
  fmtbar.querySelector('.linkbtn').classList.toggle('on', !!anchorInSelection(sel));
  const blk = isMiolo ? blockOf(host.dataset.id) : null;
  fmtbar.querySelectorAll('.typebtn').forEach(b =>
    b.classList.toggle('on', !!blk && blk.type === b.dataset.t));
  // acima da seleção, centrada; se não couber, abaixo
  fmtbar.hidden = false;
  const rect = r.getBoundingClientRect();
  const bw = fmtbar.offsetWidth, bh = fmtbar.offsetHeight;
  const x = Math.max(8, Math.min(rect.left + rect.width / 2 - bw / 2, innerWidth - bw - 8));
  const y = rect.top - bh - 8 >= 8 ? rect.top - bh - 8 : rect.bottom + 8;
  fmtbar.style.left = x + 'px'; fmtbar.style.top = y + 'px';
}

// ── trilha A (t2): mini-editor de URL ────────────────────────────────────────
// createLink exige seleção não-colapsada; o fmtbar só aparece com seleção, então
// "criar link" sempre tem texto. "Editar/remover" seleciona o <a> inteiro. Mesma
// armadilha da cor: digitar no input tira o foco do texto e colapsa a seleção →
// guardamos o Range ao abrir e o restauramos antes do execCommand.
const linkedit = document.getElementById('linkedit');
const linkUrl = document.getElementById('linkUrl');
let linkSavedRange = null, linkHost = null, linkEl = null;
function openLinkEdit() {
  const sel = getSelection();
  if (!sel || !sel.rangeCount) return;
  linkSavedRange = sel.getRangeAt(0).cloneRange();
  linkHost = editableHostOfRange(linkSavedRange);
  if (!linkHost) return;
  linkEl = anchorInSelection(sel);
  linkUrl.value = linkEl ? (linkEl.getAttribute('href') || '') : '';
  document.getElementById('linkRemove').hidden = !linkEl;
  fmtbar.hidden = true;
  linkedit.hidden = false;
  // posiciona sobre a seleção (ou o link), como o fmtbar
  const rect = (linkEl || linkSavedRange).getBoundingClientRect();
  const bw = linkedit.offsetWidth, bh = linkedit.offsetHeight;
  linkedit.style.left = Math.max(8, Math.min(rect.left, innerWidth - bw - 8)) + 'px';
  linkedit.style.top = (rect.top - bh - 8 >= 8 ? rect.top - bh - 8 : rect.bottom + 8) + 'px';
  linkUrl.focus(); linkUrl.select();
  setTimeout(() => addEventListener('pointerdown', outsideLinkEdit), 0);
}
function closeLinkEdit() {
  removeEventListener('pointerdown', outsideLinkEdit);
  linkedit.hidden = true; linkSavedRange = linkHost = linkEl = null;
}
function outsideLinkEdit(e) { if (!linkedit.contains(e.target)) closeLinkEdit(); }
function applyLink() {
  if (!linkHost) return closeLinkEdit();
  const raw = linkUrl.value.trim();
  linkHost.focus();
  const s = getSelection(); s.removeAllRanges();
  if (linkEl) { const r = document.createRange(); r.selectNode(linkEl); s.addRange(r); }
  else s.addRange(linkSavedRange);
  if (!raw) { if (linkEl) document.execCommand('unlink'); }          // apagou a URL editando → remove
  // sem esquema (e não âncora/relativo/mailto) → prefixa https:// pra não virar link relativo quebrado no PDF
  else document.execCommand('createLink', false, /^([a-z][a-z0-9+.-]*:|\/|#)/i.test(raw) ? raw : 'https://' + raw);
  closeLinkEdit(); updateFmtbar();
}
function removeLink() {
  if (linkEl && linkHost) {
    linkHost.focus();
    const s = getSelection(); s.removeAllRanges();
    const r = document.createRange(); r.selectNode(linkEl); s.addRange(r);
    document.execCommand('unlink');
  }
  closeLinkEdit(); updateFmtbar();
}
linkedit.addEventListener('mousedown', (e) => { if (e.target === linkedit) e.preventDefault(); });
document.getElementById('linkApply').addEventListener('click', applyLink);
document.getElementById('linkRemove').addEventListener('click', removeLink);
linkUrl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
  else if (e.key === 'Escape') { e.preventDefault(); closeLinkEdit(); }
});

document.addEventListener('selectionchange', () => {
  clearTimeout(updateFmtbar._t);
  updateFmtbar._t = setTimeout(updateFmtbar, 80);
});
stage.addEventListener('scroll', () => {
  if (!fmtbar.hidden) updateFmtbar();
  if (imgPanel && !imgPanel.hidden) positionImgPanel();
  if (coverPanel && !coverPanel.hidden) positionCoverPanel();
  bhandle.hidden = true;                        // alça é fixed → esconde ao rolar
  closeAddImgMenu();
}, { passive: true });
addEventListener('resize', () => { if (imgPanel && !imgPanel.hidden) positionImgPanel(); if (coverPanel && !coverPanel.hidden) positionCoverPanel(); });

// ─────────────────────────── undo / redo ────────────────────────────────────
// captura no document (fase de captura) pra vencer o undo nativo do contenteditable.
// Em campos do sidebar (INPUT/TEXTAREA) deixa o undo nativo do campo agir.
document.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey)) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
}, true);
// Backspace/Delete com um divisor (ou imagem) selecionado e sem foco em texto → remove
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Backspace' && e.key !== 'Delete') return;
  if (!state.sel) return;
  const ae = document.activeElement;
  if (ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
  const b = blockOf(state.sel); if (!b) return;
  e.preventDefault();
  state.doc.blocks.splice(idxOf(b.id), 1);
  state.sel = null; closeImgPanel(); render();
});
// trilha E: ⌘↑/⌘↓ (Ctrl no Win/Linux) move o bloco em foco uma posição no fluxo.
// No macOS esse atalho em contenteditable é "ir pro início/fim do documento" → preventDefault.
// Só age com um bloco de MIOLO em foco (contenteditable, role=block); não colide com o
// undo/redo (Cmd+Z/Y) nem com o Backspace/Delete de imagem — cada um filtra outras teclas.
document.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey)) return;
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  const host = document.activeElement;
  if (!host || !host.isContentEditable || !host.dataset.id) return;
  if ((host.dataset.role || 'block') !== 'block') return;   // não move título/legenda de imagem
  const i = idxOf(host.dataset.id);
  const j = i + (e.key === 'ArrowUp' ? -1 : 1);
  if (i < 0 || j < 0 || j >= state.doc.blocks.length) return;   // nas pontas: não faz nada
  e.preventDefault();
  const keep = captureCaret();                                  // guarda offset/seleção no bloco movido
  const [moved] = state.doc.blocks.splice(i, 1);
  state.doc.blocks.splice(j, 0, moved);
  render(keep && keep.id === moved.id ? keep : { id: moved.id, role: 'block', offset: 0 });
}, true);
document.getElementById('btnUndo').addEventListener('click', undo);
document.getElementById('btnRedo').addEventListener('click', redo);
document.getElementById('btnUndo').addEventListener('mousedown', (e) => e.preventDefault()); // não rouba o foco do texto
document.getElementById('btnRedo').addEventListener('mousedown', (e) => e.preventDefault());

// ─────────────────────────── init ───────────────────────────────────────────
load();
state.zoom = 1;
state.activeId = state.doc.blocks[0]?.id;
document.getElementById('footText').value = state.doc.footText;
document.getElementById('headText').value = state.doc.headText || '';
document.getElementById('firstPage').value = state.doc.firstPage;
idb.get('fh').then(h => { if (h) fileHandle = h; });
renderSourceChip();
syncSpecialUI();
setSegment('documento');
render();
updateHistBtns();
