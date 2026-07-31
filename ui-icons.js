/* Ícones de UI Ionicons — helper compartilhado (Diagramador, Stories, Gráficos).
 *
 *   import { registerUiIcons, uiIco, menuIco } from './ui-icons.js';
 *   registerUiIcons(); // uma vez no boot do app
 *   el.innerHTML = uiIco('menu', 18, 'outline');
 *
 * NÃO copiar paths SVG à mão nos apps. Catálogo: ui/catalog.html → “Ícones”.
 */

import { registerIcons, iconSvg } from './timeline-icons.js';
import { IONICONS_LIB, IONICONS_LIB_SOLID } from './ionicons-lib.js';

let registered = false;

/** Registra libs outline + solid (idempotente). Chamar no boot do app. */
export function registerUiIcons() {
  if (registered) return;
  registerIcons(IONICONS_LIB);
  registerIcons(IONICONS_LIB_SOLID, { style: 'solid' });
  registered = true;
}

/**
 * SVG Ionicons em currentColor, viewBox 512.
 * @param {string} key nome sem sufixo -outline (ex.: 'menu', 'arrow-undo')
 * @param {number} [size=12]
 * @param {'outline'|'solid'} [style='outline']
 */
export function uiIco(key, size = 12, style = 'outline') {
  return iconSvg(key, { x: 0, y: 0, w: size, h: size }, 'currentColor', 1.8, style, true)
    .replace(/ x="0" y="0"/, '');
}

/** Ícone 16×16 outline para menus (Duplicar / Remover). */
export function menuIco(key) {
  return uiIco(key, 16, 'outline');
}
