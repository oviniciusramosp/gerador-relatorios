/* Swatch de cor — COMPONENTE ÚNICO, reutilizável pelo app inteiro (gráficos + diagramação).
 *
 *   openSwatchPop(anchor, pick, current, opts)
 *     anchor  — elemento que ancora o popover (o botão de cor)
 *     pick    — callback(cor) chamado ao escolher/ajustar opacidade; o popover fecha sozinho
 *               ao ESCOLHER uma cor (chip/nomeada/hex+Enter). Contrato retrocompatível: `cor`
 *               sai como "#RRGGBB" quando opacidade = 100% (igual sempre foi — nada quebra nos
 *               consumidores atuais) e como "rgba(r,g,b,a)" quando < 100%. Nunca outro formato.
 *     current — cor atual (destaca o chip/nomeada certos). Aceita "#RRGGBB"/"#RGB" (opacidade
 *               assumida 100%) OU "rgba(r,g,b,a)"/"rgb(r,g,b)" de entrada — nesse caso o hex vira
 *               o destaque e o alpha inicializa o slider.
 *     opts    — { opacity:false } esconde a seção de Opacidade inteira (pra host que já tem seu
 *               próprio controle, ex. o watermark do gráfico).
 *               { paper:true } preview/HEX com base branca sob a cor com alpha (como o papel
 *               do PDF) em vez do xadrez — use no fundo do Callout. Default: opacity=true.
 *
 * Quatro seções: (1) cores nomeadas da marca, (2) complementares por tom, (3) HEX manual,
 * (4) opacidade (opcional). O CSS é injetado uma vez pelo próprio módulo — nenhum host precisa
 * declarar nada. */

import { enhanceRange } from './range-snap.js';

export const NAMED_COLORS = [
  { name: 'Paradigma Aqua', hex: '#29E899' },
  { name: 'Bitcoin Orange', hex: '#F7931A' },
  { name: 'Strategy Orange', hex: '#FF6A00' },
  { name: 'ETH Purple', hex: '#627EEA' },
  { name: 'SOL Purple', hex: '#9945FF' },
  { name: 'HYPE Green', hex: '#97FCE4' },
  { name: 'XRP Grey', hex: '#23292F' },
];
// complementares: 11 famílias × (clara, padrão, escura). Ordem fixa no arco
// (não sort por matiz) — a grade tem 9 colunas = 3 famílias por linha
// (clara|padrão|escura × 3), ocupando a largura do popover.
const SWATCH_VARIANTS = ['clara', 'padrão', 'escura'];
const SWATCH_FAMILIES = [
  { name: 'Vermelha',     colors: ['#FCA5A5', '#EF4444', '#9F1239'] },
  { name: 'Laranja',      colors: ['#FDBA74', '#F97316', '#9A3412'] },
  { name: 'Amarela',      colors: ['#FDE68A', '#EAB308', '#A16207'] },
  { name: 'Verde limão',  colors: ['#D9F99D', '#84CC16', '#3F6212'] },
  { name: 'Verde',        colors: ['#86EFAC', '#16A34A', '#14532D'] },
  { name: 'Azul',         colors: ['#93C5FD', '#2563EB', '#1E3A8A'] },
  { name: 'Roxo',         colors: ['#C4B5FD', '#7C3AED', '#4C1D95'] },
  { name: 'Lilás',        colors: ['#E9D5FF', '#C084FC', '#86198F'] },
  { name: 'Rosa',         colors: ['#FBCFE8', '#EC4899', '#9D174D'] },
  { name: 'Cinza',        colors: ['#E2E8F0', '#94A3B8', '#334155'] },
  { name: 'Preto/branco', colors: ['#FFFFFF', '#1F2937', '#000000'] },
];

export const normHex = (v) => {
  let s = String(v).trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(s)) s = s.split('').map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/i.test(s) ? '#' + s.toUpperCase() : null;
};

// Parser de cor pra opacidade — lógica pura (string→número), sem `document`, testável em node puro.
// Aceita hex ("#RRGGBB"/"#RGB", com ou sem "#") OU "rgb(r,g,b)"/"rgba(r,g,b,a)". Retorna
// { hex, alpha } (alpha 0..1) pra inicializar o popover (destaque do chip + valor do slider),
// ou null se `v` não for uma cor reconhecível (mesmo caso em que normHex já retornava null).
const RGBA_RE = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/i;
export function parseColor(v) {
  const s = String(v ?? '').trim();
  const m = RGBA_RE.exec(s);
  if (m) {
    const [r, g, b] = [m[1], m[2], m[3]].map((n) => Math.max(0, Math.min(255, +n)));
    const hex = '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase();
    const alpha = m[4] === undefined ? 1 : Math.max(0, Math.min(1, +m[4]));
    return { hex, alpha };
  }
  const hex = normHex(s);
  return hex ? { hex, alpha: 1 } : null;
}

// Monta o retorno de pick(): hex puro em 100% (contrato antigo intacto — nenhum consumidor
// quebra), "rgba(r,g,b,a)" abaixo disso. `alpha` em 0..1; arredonda pra 2 casas só pra manter
// a string limpa (o slider já entrega múltiplos de 0.01, isso só protege contra `current` externo
// com mais casas).
export function withAlpha(hex, alpha) {
  const h = normHex(hex) || '#000000';
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 100) / 100;
  if (a >= 1) return h;
  const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

let swatchPop = null;
export function openSwatchPop(anchor, pick, current, opts) {
  closeSwatchPop();
  const showOpacity = !(opts && opts.opacity === false);
  const paperBase = !!(opts && opts.paper); // base branca sob alpha (papel do PDF)
  const parsed = parseColor(current);
  const cur = parsed ? parsed.hex : null;
  let alpha = parsed ? parsed.alpha : 1;   // 0..1 — só o slider de Opacidade muda isso depois
  // escolher um chip/nomeada/hex aplica com a opacidade ATUAL do slider e fecha (comportamento
  // de sempre); a opacidade em si é um eixo independente do matiz, por isso não reseta ao trocar de cor.
  const choose = (hex) => { pick(withAlpha(hex, alpha)); closeSwatchPop(); };
  swatchPop = document.createElement('div');
  swatchPop.className = 'swatch-pop' + (paperBase ? ' paper-base' : '');

  const section = (label) => { const h = document.createElement('div'); h.className = 'sp-label'; h.textContent = label; swatchPop.append(h); };
  const chip = (hex) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'sp-chip'; b.style.background = hex;
    if (cur === normHex(hex)) b.classList.add('on');
    return b;
  };

  section('Cores nomeadas');
  const named = document.createElement('div'); named.className = 'sp-named';
  NAMED_COLORS.forEach(({ name, hex }) => {
    const row = document.createElement('button');
    row.type = 'button'; row.className = 'sp-namerow'; row.title = hex;
    if (cur === normHex(hex)) row.classList.add('on');
    const c = document.createElement('span'); c.className = 'sp-swatch'; c.style.background = hex;
    const t = document.createElement('span'); t.textContent = name;
    row.append(c, t);
    row.onclick = () => choose(hex);
    named.append(row);
  });
  swatchPop.append(named);

  section('Complementares');
  const grid = document.createElement('div'); grid.className = 'sp-grid';
  SWATCH_FAMILIES.forEach(({ name, colors }) => {
    colors.forEach((hex, i) => {
      const b = chip(hex);
      b.title = `${name} ${SWATCH_VARIANTS[i]} · ${hex}`;
      b.onclick = () => choose(hex);
      grid.append(b);
    });
  });
  swatchPop.append(grid);

  section('HEX');
  const row = document.createElement('div'); row.className = 'sp-hex';
  const inp = document.createElement('input');
  inp.type = 'text'; inp.placeholder = '#RRGGBB'; inp.value = cur || '';
  inp.spellcheck = false; inp.setAttribute('aria-label', 'Cor em HEX');
  const preview = document.createElement('span'); preview.className = 'sp-swatch';
  // pinta o preview com o hex do campo + a opacidade atual do slider.
  // <100%: xadrez (default) OU base branca (opts.paper) — no callout a base branca
  // mostra como a tinta a 10% fica no papel do PDF.
  const paintPreview = () => {
    const h = normHex(inp.value);
    preview.classList.remove('checker', 'paper');
    if (h && alpha < 1) {
      const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
      preview.style.background = '';
      preview.style.setProperty('--sp-ov', `rgba(${r},${g},${b},${alpha})`);
      preview.classList.add(paperBase ? 'paper' : 'checker');
    } else {
      preview.style.background = h || 'transparent';
    }
  };
  const apply = () => { const h = normHex(inp.value); if (h) choose(h); else inp.classList.add('bad'); };
  inp.oninput = () => { const h = normHex(inp.value); inp.classList.toggle('bad', inp.value.trim() !== '' && !h); paintPreview(); };
  inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } };
  paintPreview();
  row.append(preview, inp);
  swatchPop.append(row);

  if (showOpacity) {
    section('Opacidade');
    const oprow = document.createElement('div'); oprow.className = 'sp-op';
    const slider = document.createElement('input');
    slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.step = '1';
    slider.value = String(Math.round(alpha * 100));
    slider.setAttribute('aria-label', 'Opacidade');
    slider.setAttribute('data-snaps', '0,10,25,50,75,100');
    const val = document.createElement('span'); val.className = 'sp-opval'; val.textContent = slider.value + '%';
    // decisão: aplica em tempo real no 'input' (sem fechar o popover) — diferente de choose(),
    // que aplica+fecha. Fechar a cada tick do slider tornaria o ajuste inutilizável; manter
    // aberto deixa ver o preview mudando ao vivo, como um color picker moderno. Modula a cor
    // ATUAL (`cur`), já que trocar de matiz aqui dentro (chip/nomeada/hex) fecha o popover.
    // enhanceRange usa capture: o ímã roda antes deste handler e o value já vem snappado.
    slider.oninput = () => {
      alpha = +slider.value / 100;
      val.textContent = slider.value + '%';
      paintPreview();
      pick(withAlpha(cur || '#000000', alpha));
    };
    oprow.append(slider, val);
    swatchPop.append(oprow);
    enhanceRange(slider);
  }

  document.body.append(swatchPop);
  const r = anchor.getBoundingClientRect(), pw = swatchPop.offsetWidth, ph = swatchPop.offsetHeight;
  swatchPop.style.left = Math.max(6, Math.min(r.left, innerWidth - pw - 6)) + 'px';
  swatchPop.style.top = (r.bottom + 4 + ph > innerHeight ? Math.max(6, r.top - 4 - ph) : r.bottom + 4) + 'px';
  setTimeout(() => addEventListener('pointerdown', outsideSwatch), 0);
}
function outsideSwatch(e) { if (swatchPop && !swatchPop.contains(e.target)) closeSwatchPop(); }
export function closeSwatchPop() {
  if (!swatchPop) return;
  removeEventListener('pointerdown', outsideSwatch);
  swatchPop.remove(); swatchPop = null;
}

// CSS do componente — injetado uma vez (anchors .swatch/.colorfield + popover .sp-*)
// guard `typeof document` pra o módulo importar sem crashar em node (self-check no fim do arquivo)
(function injectCss() {
  if (typeof document === 'undefined' || document.getElementById('swatch-css')) return;
  const s = document.createElement('style'); s.id = 'swatch-css';
  s.textContent = `
  .swatch { flex: 0 0 auto; width: 1.5rem; height: 1.5rem; padding: 0; border-radius: 5px; border: 1px solid var(--hair-strong); cursor: pointer; background: transparent; }
  .colorfield { width: 100%; height: var(--ctrl-h, 2rem); padding: 0; border-radius: var(--ctrl-r, var(--r)); border: 1px solid var(--hair-strong); cursor: pointer; }
  .colorfield:hover, .swatch:hover { outline: 2px solid var(--violet); outline-offset: 1px; }
  .swatch-pop {
    position: fixed; z-index: 70; width: 15rem; max-height: 80vh; overflow-y: auto;
    display: flex; flex-direction: column; gap: .3rem;
    padding: .6rem; border: 1px solid var(--hair-strong); border-radius: 8px;
    background: color-mix(in srgb, var(--lilac) 8%, var(--ground)); box-shadow: 0 18px 50px -20px #000;
  }
  .swatch-pop .sp-label { font-size: .6rem; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: .25rem 0 .05rem; }
  .sp-named { display: flex; flex-direction: column; gap: .1rem; }
  .sp-namerow { display: flex; align-items: center; gap: .5rem; padding: .28rem .35rem; border: 1px solid transparent; border-radius: 6px; background: transparent; color: var(--ink); cursor: pointer; font-size: .78rem; text-align: left; }
  .sp-namerow:hover { background: color-mix(in srgb, var(--violet) 14%, transparent); }
  .sp-namerow.on { border-color: var(--violet); }
  .sp-swatch { width: 1.15rem; height: 1.15rem; flex: 0 0 auto; border-radius: 4px; border: 1px solid var(--hair-strong); }
  /* trilha F: xadrez (checker) por trás do preview quando a opacidade < 100% — sem ele uma
     cor bem transparente fica visualmente idêntica a "sem cor" no fundo escuro do popover.
     --sp-ov (setado via JS) é a cor com alpha, layer de CIMA; o xadrez fica embaixo aparecendo
     através dela. Em 100%/sem cor a classe não é aplicada e cai no background-color normal. */
  .sp-swatch.checker {
    background-image: linear-gradient(var(--sp-ov, transparent), var(--sp-ov, transparent)),
      repeating-conic-gradient(#6b6b6b 0% 25%, #3a3a3a 0% 50%);
    background-size: auto, 8px 8px;
  }
  /* base branca (papel) + cor com alpha por cima — preview fiel ao PDF
     (.colorfield = botões grandes da sidebar; .swatch = chips pequenos) */
  .sp-swatch.paper, .swatch.paper, .colorfield.paper {
    background-image: linear-gradient(var(--sp-ov, transparent), var(--sp-ov, transparent)),
      linear-gradient(#ffffff, #ffffff);
    background-color: #fff;
  }
  /* complementares: 9 colunas fixas (3 famílias × clara|padrão|escura por linha).
     justify-content: space-between espalha as colunas na largura do popover
     (antes sobrava faixa vazia à direita com 6 colunas). Chip mantém o mesmo
     tamanho de .sp-swatch (nomeadas/preview HEX). */
  .sp-grid { display: grid; grid-template-columns: repeat(9, 1.15rem); row-gap: .3rem; column-gap: .3rem; justify-content: space-between; }
  /* borda forte: sem ela o chip preto some no fundo do popover (que é quase preto) */
  .sp-chip { width: 1.15rem; height: 1.15rem; padding: 0; border-radius: 5px; border: 1px solid var(--hair-strong); cursor: pointer; }
  .sp-chip:hover { outline: 2px solid var(--violet); outline-offset: 1px; }
  .sp-chip.on { outline: 2px solid var(--ink); outline-offset: 1px; }
  .sp-hex { display: flex; align-items: center; gap: .4rem; }
  .sp-hex input { flex: 1; min-width: 0; padding: .35rem .5rem; border: 1px solid var(--hair-strong); border-radius: 6px; background: var(--ground); color: var(--ink); font-family: ui-monospace, monospace; font-size: .8rem; text-transform: uppercase; }
  .sp-hex input.bad { border-color: var(--coral, #CE5249); }
  /* trilha F: slider de opacidade — valor em % alinhado à direita, largura tabular pra não
     "pular" o slider ao lado quando o número muda de dígito (9% → 10%). */
  .sp-op { display: flex; align-items: center; gap: .5rem; }
  .sp-op .range-snap { flex: 1; min-width: 0; }
  .sp-op input[type="range"] { flex: 1; width: 100%; accent-color: var(--violet); }
  .sp-opval { flex: 0 0 auto; min-width: 2.4em; text-align: right; font-size: .78rem; color: var(--muted); font-variant-numeric: tabular-nums; }`;
  document.head.append(s);
})();

// self-check: `node swatch.js` (não roda ao importar no browser — sem `process`). Cobre só o
// parser de cor (hex↔rgba), que é a única lógica não-DOM do arquivo — o resto (popover, CSS)
// exige `document` de verdade e não vale a pena mockar aqui.
function demo() {
  const eq = (got, want, msg) => console.assert(JSON.stringify(got) === JSON.stringify(want), msg, JSON.stringify(got));

  // 1) hex puro a 100% → sai como hex do pick (contrato retrocompatível intacto)
  eq(withAlpha('#29E899', 1), '#29E899', 'hex a 100% sai como hex, não rgba');

  // 2) current em rgba (entrada) → extrai o hex certo (destaca o chip) + a opacidade certa (slider)
  eq(parseColor('rgba(41,232,153,0.5)'), { hex: '#29E899', alpha: 0.5 }, 'rgba de entrada → hex + alpha');
  eq(parseColor('rgb(0,0,0)'), { hex: '#000000', alpha: 1 }, 'rgb sem alpha → opacidade 100%');
  eq(parseColor('#F7931A'), { hex: '#F7931A', alpha: 1 }, 'hex puro de entrada → alpha 100% (default)');
  eq(parseColor(''), null, 'string vazia → null (sem cor, como normHex)');

  // 3) opacidade < 100% aplicada no slider → pick recebe rgba(r,g,b,a) com os componentes certos
  eq(withAlpha('#29E899', 0.5), 'rgba(41,232,153,0.5)', '50% → rgba com os componentes certos');
  eq(withAlpha('#000000', 0), 'rgba(0,0,0,0)', '0% → rgba com alpha 0 (não hex)');

  console.log('swatch: todos os asserts passaram');
}

if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].endsWith('swatch.js')) demo();
