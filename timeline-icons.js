/* Ícones dos nós da linha do tempo — desenhados à mão em grade 24×24, stroke
 * (fill=none + stroke=currentColor), mesma linguagem visual do resto do app.
 *
 * ponytail: set curado e autoral em vez de puxar um pacote de ícones — o
 * renderer tem que sair em SVG puro (vira PNG e PDF), então fonte de ícone não
 * serve, e uma dependência npm pra ~30 paths não se paga. Quando faltar um
 * símbolo específico (S&P, ETF, HIP-3), o nó aceita `txt:S&P` e escreve o texto
 * dentro do círculo — cobre o caso "logo/sigla" sem virar biblioteca.
 *
 * Cada entrada: { label, inner }. Ordem = ordem do picker (agrupada por tema).
 */
export const ICONS = {
  // — lançamento / produto —
  rocket:   { label: 'Lançamento', inner:
    '<path d="M12 2.5c2.6 2.4 4 5.4 4 8.6 0 2-.5 3.8-1.5 5.4h-5C8.5 14.9 8 13.1 8 11.1c0-3.2 1.4-6.2 4-8.6Z"/>'
    + '<circle cx="12" cy="9.6" r="1.7"/>'
    + '<path d="M9.5 16.5 8.2 21l2.4-1.6M14.5 16.5l1.3 4.5-2.4-1.6"/>'
    + '<path d="M9 13.2 6 15.4v2.4l2.2-1.5M15 13.2l3 2.2v2.4l-2.2-1.5"/>' },
  flask:    { label: 'Testnet / lab', inner:
    '<path d="M9.2 3h5.6M10.4 3v5.4l-4.8 9A2 2 0 0 0 7.4 20.4h9.2a2 2 0 0 0 1.8-2.9l-4.8-9V3"/>'
    + '<path d="M7.7 14.2h8.6"/>' },
  code:     { label: 'Código / API', inner:
    '<path d="M9 7.5 4.2 12 9 16.5M15 7.5 19.8 12 15 16.5"/>' },
  cube:     { label: 'Rede / bloco', inner:
    '<path d="M12 2.8 20.4 7.2v9.6L12 21.2 3.6 16.8V7.2L12 2.8Z"/>'
    + '<path d="M3.6 7.2 12 11.6l8.4-4.4M12 11.6v9.6"/>' },
  gear:     { label: 'Atualização', inner:
    '<circle cx="12" cy="12" r="3.1"/>'
    + '<path d="M12 2.8v2.5M12 18.7v2.5M2.8 12h2.5M18.7 12h2.5M6.2 6.2 8 8M16 16l1.8 1.8M17.8 6.2 16 8M8 16l-1.8 1.8"/>' },
  link:     { label: 'Integração', inner:
    '<path d="M10.2 14.2a4 4 0 0 1 0-5.7l2.2-2.2a4 4 0 0 1 5.7 5.7l-1.3 1.3"/>'
    + '<path d="M13.8 9.8a4 4 0 0 1 0 5.7l-2.2 2.2a4 4 0 0 1-5.7-5.7l1.3-1.3"/>' },

  // — mercado / dinheiro —
  'chart-bar': { label: 'Volume', inner:
    '<path d="M4 20h16"/><path d="M6 17.5v-6h3.2v6M14.8 17.5v-9H18v9M10.4 17.5V6h3.2v11.5" />' },
  'trend-up':  { label: 'Alta', inner:
    '<path d="M3.5 16.8 9.2 11l3.8 3.3L20.5 7"/><path d="M15.2 7h5.3v5.3"/>' },
  'trend-down':{ label: 'Queda', inner:
    '<path d="M3.5 7.2 9.2 13l3.8-3.3 7.5 7.3"/><path d="M15.2 17h5.3v-5.3"/>' },
  coins:    { label: 'Volume acumulado', inner:
    '<path d="M19 6.6c0 1.7-3.1 3-7 3s-7-1.3-7-3 3.1-3 7-3 7 1.3 7 3Z"/>'
    + '<path d="M5 6.6v4.2c0 1.7 3.1 3 7 3s7-1.3 7-3V6.6"/>'
    + '<path d="M5 10.8v4.2c0 1.7 3.1 3 7 3s7-1.3 7-3v-4.2"/>' },
  coin:     { label: 'Token', inner:
    '<circle cx="12" cy="12" r="9"/>'
    + '<path d="M12 6.6v10.8M9.6 9.2h4.2a2 2 0 0 1 0 4H9.6h4.6a2 2 0 0 1 0 4H9.6"/>' },
  money:    { label: 'Receita', inner:
    '<rect x="2.6" y="6.6" width="18.8" height="10.8" rx="1.6"/>'
    + '<circle cx="12" cy="12" r="2.6"/><path d="M6 10.4v3.2M18 10.4v3.2"/>' },
  wallet:   { label: 'Carteira', inner:
    '<rect x="3" y="6" width="18" height="13" rx="2.4"/><path d="M3 10.2h18"/>'
    + '<path d="M16.4 14.6h.1" stroke-width="2.4"/>' },
  bank:     { label: 'Institucional', inner:
    '<path d="M3 9.6 12 4l9 5.6"/><path d="M5.4 9.6V18M9.6 9.6V18M14.4 9.6V18M18.6 9.6V18"/><path d="M3.4 18h17.2"/>' },
  balance:  { label: 'Regulação', inner:
    '<path d="M12 4v16M7 20h10"/><path d="M4 9h16"/><path d="M4 9l-2 4.6a3.4 3.4 0 0 0 4 0L4 9ZM20 9l-2 4.6a3.4 3.4 0 0 0 4 0L20 9Z"/>' },

  // — marcos / eventos —
  trophy:   { label: 'Recorde', inner:
    '<path d="M8 4h8v5.2a4 4 0 0 1-8 0V4Z"/>'
    + '<path d="M8 5.4H5.4v1.4A3.6 3.6 0 0 0 9 10.4M16 5.4h2.6v1.4A3.6 3.6 0 0 1 15 10.4"/>'
    + '<path d="M12 13.2V17M9 20.2h6M9.8 17h4.4"/>' },
  star:     { label: 'Destaque', inner:
    '<path d="m12 3.2 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.2l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3.2Z"/>' },
  target:   { label: 'Meta / mercado novo', inner:
    '<circle cx="12" cy="12" r="8.8"/><circle cx="12" cy="12" r="4.8"/>'
    + '<path d="M12 12h.1" stroke-width="3"/>' },
  flag:     { label: 'Marco', inner:
    '<path d="M6 21V3.6"/><path d="M6 4h11.4l-2.2 4.2 2.2 4.2H6"/>' },
  bolt:     { label: 'Choque / liquidação', inner:
    '<path d="M13.4 2.6 5.6 13.8h4.9L10 21.4l8.2-11.8h-5.1l.3-7Z"/>' },
  flame:    { label: 'Queima / hype', inner:
    '<path d="M12 2.6c3.9 3.9 5.9 6.5 5.9 9.9a5.9 5.9 0 0 1-11.8 0c0-2 .8-3.6 2.2-5 .3 1.4.9 2.3 1.8 2.7C10.6 7.6 10.6 5.2 12 2.6Z"/>' },
  parachute:{ label: 'Airdrop', inner:
    '<path d="M3.2 11.4a8.8 8.8 0 0 1 17.6 0"/>'
    + '<path d="M3.2 11.4c2.9 0 3.9 3.8 8.8 8.8M20.8 11.4c-2.9 0-3.9 3.8-8.8 8.8"/>'
    + '<path d="M9.3 11.4c0 3 1 6.3 2.7 8.8M14.7 11.4c0 3-1 6.3-2.7 8.8"/>' },
  gift:     { label: 'Recompensa', inner:
    '<rect x="3.6" y="8.6" width="16.8" height="11.8" rx="1.6"/><path d="M3.6 13h16.8M12 8.6v11.8"/>'
    + '<path d="M12 8.6C12 6.2 10.6 4.6 9 4.6S6.6 5.8 6.6 7c0 1 .8 1.6 2 1.6H12ZM12 8.6c0-2.4 1.4-4 3-4s2.4 1.2 2.4 2.4c0 1-.8 1.6-2 1.6H12Z"/>' },

  // — pessoas / comunicação —
  users:    { label: 'Comunidade / referral', inner:
    '<circle cx="9.2" cy="8" r="3.2"/><path d="M3.2 20c0-3.3 2.7-5.6 6-5.6s6 2.3 6 5.6"/>'
    + '<path d="M16 5.3a3.2 3.2 0 0 1 0 5.4M17.6 14.8c2 .9 3.2 2.7 3.2 5.2"/>' },
  megaphone:{ label: 'Anúncio', inner:
    '<path d="M4 10.2v3.6L15 18V6L4 10.2Z"/><path d="M15 8.6a4 4 0 0 1 0 6.8"/>'
    + '<path d="M6.6 14.6V19h3.2v-3.2"/>' },
  bulb:     { label: 'Ideia / research', inner:
    '<path d="M9 17.4a6 6 0 1 1 6 0v1.4H9v-1.4Z"/><path d="M10 21.4h4"/>' },
  doc:      { label: 'Documento / proposta', inner:
    '<path d="M14 3H7.2A2 2 0 0 0 5.2 5v14a2 2 0 0 0 2 2h9.6a2 2 0 0 0 2-2V8L14 3Z"/>'
    + '<path d="M13.8 3.2V8h4.8M8.6 13h6.8M8.6 16.6h4.4"/>' },

  // — segurança / tempo —
  shield:   { label: 'Segurança', inner:
    '<path d="M12 3.2 20 6v6c0 4.9-3.4 7.8-8 9-4.6-1.2-8-4.1-8-9V6l8-2.8Z"/>' },
  lock:     { label: 'Fechado', inner:
    '<rect x="4.6" y="10.4" width="14.8" height="10" rx="2"/>'
    + '<path d="M8.2 10.4V7.8a3.8 3.8 0 0 1 7.6 0v2.6"/><path d="M12 14.2v2.6"/>' },
  key:      { label: 'Acesso', inner:
    '<circle cx="8" cy="12" r="4"/><path d="M12 12h8.6M18 12v3.4M15.4 12v2.6"/>' },
  clock:    { label: 'Tempo', inner:
    '<circle cx="12" cy="12" r="8.8"/><path d="M12 6.8V12l3.6 2.2"/>' },
  calendar: { label: 'Data', inner:
    '<rect x="3.6" y="5.6" width="16.8" height="14.8" rx="2"/>'
    + '<path d="M3.6 10.2h16.8M8 3.4v4M16 3.4v4"/>' },
  globe:    { label: 'Global / mainnet', inner:
    '<circle cx="12" cy="12" r="8.8"/><path d="M3.4 9.4h17.2M3.4 14.6h17.2"/>'
    + '<path d="M12 3.2c-4 4.6-4 13 0 17.6 4-4.6 4-13 0-17.6Z"/>' },
  check:    { label: 'Concluído', inner:
    '<circle cx="12" cy="12" r="8.8"/><path d="M7.8 12.4 11 15.6 16.4 9"/>' },
  alert:    { label: 'Incidente', inner:
    '<path d="M12 3.6 21.4 20H2.6L12 3.6Z"/><path d="M12 9.6v4.8"/><path d="M12 17.2h.1" stroke-width="2.4"/>' },
  eye:      { label: 'Transparência', inner:
    '<path d="M2.6 12S6.2 6.6 12 6.6 21.4 12 21.4 12 17.8 17.4 12 17.4 2.6 12 2.6 12Z"/>'
    + '<circle cx="12" cy="12" r="3"/>' },
};

/** Nó com sigla em vez de ícone: `txt:S&P`. */
export const isTextIcon = (k) => typeof k === 'string' && k.startsWith('txt:');
export const textIconLabel = (k) => (isTextIcon(k) ? k.slice(4) : '');

/**
 * <svg> aninhado com o ícone, tingido gravando a cor DIRETO no stroke/fill —
 * currentColor não sobrevive à rasterização em canvas (mesmo motivo do logo em
 * chart.js). box = {x,y,w,h}.
 */
export function iconSvg(key, box, color, strokeWidth = 1.7) {
  const ic = ICONS[key];
  if (!ic) return '';
  const n = (v) => Math.round(v * 100) / 100;
  return `<svg x="${n(box.x)}" y="${n(box.y)}" width="${n(box.w)}" height="${n(box.h)}"`
    + ` viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}"`
    + ` stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`
    + ic.inner.replace(/currentColor/g, color) + '</svg>';
}
