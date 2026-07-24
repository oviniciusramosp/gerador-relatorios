/* Swatch de cor — COMPONENTE ÚNICO, reutilizável pelo app inteiro (gráficos + diagramação).
 *
 *   openSwatchPop(anchor, pick, current)
 *     anchor  — elemento que ancora o popover (o botão de cor)
 *     pick    — callback(hex) chamado ao escolher; o popover fecha sozinho
 *     current — cor atual (destacada nas seções)
 *
 * Três seções: (1) cores nomeadas da marca, (2) complementares por tom, (3) HEX manual.
 * O CSS é injetado uma vez pelo próprio módulo — nenhum host precisa declarar nada. */

export const NAMED_COLORS = [
  { name: 'Paradigma Aqua', hex: '#29E899' },
  { name: 'Bitcoin Orange', hex: '#F7931A' },
  { name: 'Strategy Orange', hex: '#FF6A00' },
  { name: 'ETH Purple', hex: '#627EEA' },
  { name: 'SOL Purple', hex: '#9945FF' },
  { name: 'HYPE Green', hex: '#97FCE4' },
  { name: 'XRP Grey', hex: '#23292F' },
];
// complementares: 12 slots da marca + 8 extras + preto/branco puros, exibidas por
// tom (matiz; quase-cinzas no fim — hueOf joga branco e preto pras duas últimas casas)
const SWATCHES = ['#554FFE', '#01AD6F', '#C08600', '#9283E3', '#CE5249', '#0092C6',
  '#C15AA7', '#6F9D17', '#0695B5', '#CC4F6E', '#9B61C9', '#DC701C',
  '#4E39FF', '#29E899', '#BAB1FF', '#E8B029', '#22B279', '#7FD1F5', '#94A3B8', '#0E0C1B',
  '#FFFFFF', '#000000'];
const hueOf = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.04) return 1000 + (1 - mx) * 100;           // cinza/preto/branco no fim, por lightness
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const TONAL = [...SWATCHES].sort((a, b) => hueOf(a) - hueOf(b));

export const normHex = (v) => {
  let s = String(v).trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(s)) s = s.split('').map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/i.test(s) ? '#' + s.toUpperCase() : null;
};

let swatchPop = null;
export function openSwatchPop(anchor, pick, current) {
  closeSwatchPop();
  const cur = normHex(current || '');
  const choose = (hex) => { pick(hex); closeSwatchPop(); };
  swatchPop = document.createElement('div');
  swatchPop.className = 'swatch-pop';

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
  TONAL.forEach((hex) => { const b = chip(hex); b.title = hex; b.onclick = () => choose(hex); grid.append(b); });
  swatchPop.append(grid);

  section('HEX');
  const row = document.createElement('div'); row.className = 'sp-hex';
  const inp = document.createElement('input');
  inp.type = 'text'; inp.placeholder = '#RRGGBB'; inp.value = cur || '';
  inp.spellcheck = false; inp.setAttribute('aria-label', 'Cor em HEX');
  const preview = document.createElement('span'); preview.className = 'sp-swatch'; preview.style.background = cur || 'transparent';
  const apply = () => { const h = normHex(inp.value); if (h) choose(h); else inp.classList.add('bad'); };
  inp.oninput = () => { const h = normHex(inp.value); inp.classList.toggle('bad', inp.value.trim() !== '' && !h); preview.style.background = h || 'transparent'; };
  inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } };
  row.append(preview, inp);
  swatchPop.append(row);

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
(function injectCss() {
  if (document.getElementById('swatch-css')) return;
  const s = document.createElement('style'); s.id = 'swatch-css';
  s.textContent = `
  .swatch { flex: 0 0 auto; width: 1.5rem; height: 1.5rem; padding: 0; border-radius: 5px; border: 1px solid var(--hair-strong); cursor: pointer; background: transparent; }
  .colorfield { width: 100%; height: 2rem; padding: 0; border-radius: var(--r); border: 1px solid var(--hair-strong); cursor: pointer; }
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
  .sp-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: .3rem; }
  /* borda forte: sem ela o chip preto some no fundo do popover (que é quase preto) */
  .sp-chip { width: 100%; aspect-ratio: 1; padding: 0; border-radius: 5px; border: 1px solid var(--hair-strong); cursor: pointer; }
  .sp-chip:hover { outline: 2px solid var(--violet); outline-offset: 1px; }
  .sp-chip.on { outline: 2px solid var(--ink); outline-offset: 1px; }
  .sp-hex { display: flex; align-items: center; gap: .4rem; }
  .sp-hex input { flex: 1; min-width: 0; padding: .35rem .5rem; border: 1px solid var(--hair-strong); border-radius: 6px; background: var(--ground); color: var(--ink); font-family: ui-monospace, monospace; font-size: .8rem; text-transform: uppercase; }
  .sp-hex input.bad { border-color: var(--coral, #CE5249); }`;
  document.head.append(s);
})();
