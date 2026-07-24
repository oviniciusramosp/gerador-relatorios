/* Subconjunto curado de Ionicons (MIT) — variante "outline", que já é stroke-based
 * (fill=none + stroke), igual à linguagem visual dos outros ícones do app. Paths
 * copiados verbatim de github.com/ionic-team/ionicons (src/svg/*-outline.svg,
 * viewBox 0 0 512 512), só com a cor trocada pra currentColor e os atributos de
 * stroke comuns (linecap/linejoin/width) subidos pro <svg> raiz — visualmente
 * idêntico ao arquivo original (os poucos elementos com miter/sem round são só
 * círculos/curvas, onde miter vs round não muda nada visível).
 *
 * Usado hoje só pelo Callout (buildText, diagramacao.js) — 1 ícone por chave,
 * mais um "emoji" de fallback pro toMarkdown (onde SVG não existe, vira texto). */

export const IONICONS = {
  bulb: { label: 'Dica', emoji: '💡', inner:
    '<path d="M304,384V360c0-29,31.54-56.43,52-76,28.84-27.57,44-64.61,44-108,0-80-63.73-144-144-144A143.6,143.6,0,0,0,112,176c0,41.84,15.81,81.39,44,108,20.35,19.21,52,46.7,52,76v24"/>' +
    '<line x1="224" y1="480" x2="288" y2="480"/><line x1="208" y1="432" x2="304" y2="432"/><line x1="256" y1="384" x2="256" y2="256"/>' +
    '<path d="M294,240s-21.51,16-38,16-38-16-38-16"/>' },
  info: { label: 'Info', emoji: 'ℹ️', inner:
    '<path d="M248,64C146.39,64,64,146.39,64,248s82.39,184,184,184,184-82.39,184-184S349.61,64,248,64Z"/>' +
    '<polyline points="220 220 252 220 252 336"/><line x1="208" y1="340" x2="296" y2="340"/>' +
    '<path d="M248,130a26,26,0,1,0,26,26A26,26,0,0,0,248,130Z" fill="currentColor"/>' },
  warning: { label: 'Aviso', emoji: '⚠️', inner:
    '<path d="M85.57,446.25H426.43a32,32,0,0,0,28.17-47.17L284.18,82.58c-12.09-22.44-44.27-22.44-56.36,0L57.4,399.08A32,32,0,0,0,85.57,446.25Z"/>' +
    '<path d="M250.26,195.39l5.74,122,5.73-121.95a5.74,5.74,0,0,0-5.79-6h0A5.74,5.74,0,0,0,250.26,195.39Z"/>' +
    '<path d="M256,397.25a20,20,0,1,1,20-20A20,20,0,0,1,256,397.25Z" fill="currentColor"/>' },
  success: { label: 'Sucesso', emoji: '✅', inner:
    '<path d="M448,256c0-106-86-192-192-192S64,150,64,256s86,192,192,192S448,362,448,256Z"/>' +
    '<polyline points="352 176 217.6 336 160 272"/>' },
  danger: { label: 'Erro', emoji: '❌', inner:
    '<path d="M448,256c0-106-86-192-192-192S64,150,64,256s86,192,192,192S448,362,448,256Z"/>' +
    '<line x1="320" y1="320" x2="192" y2="192"/><line x1="192" y1="320" x2="320" y2="192"/>' },
  star: { label: 'Destaque', emoji: '⭐', inner:
    '<path d="M480,208H308L256,48,204,208H32l140,96L118,464,256,364,394,464,340,304Z"/>' },
};

export function ioniconSvg(key, size = 14) {
  const ic = IONICONS[key];
  if (!ic) return '';
  return `<svg viewBox="0 0 512 512" width="${size}" height="${size}" fill="none" stroke="currentColor"`
    + ` stroke-width="32" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ic.inner}</svg>`;
}
