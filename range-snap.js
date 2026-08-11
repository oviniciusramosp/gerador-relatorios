/* Snap points + valor digitável em input[type=range]:
 * - data-snaps="0,25,50,75,100"  → marcas DENTRO da trilha + ímã nesses valores
 * - no máx. 6 marcas (lista maior é amostrada, extremos preservados)
 * - o usuário ainda pode parar em valores livres (ímã só perto do ponto)
 * - Shift no arraste = sem ímã (ajuste fino livre) — espelha a alça de rotação dos Stories
 * - não altera o valor inicial; só intervém em input do usuário
 * - label numérico ao lado (se existir) vira digitável: sem ímã, clampa min/max/step
 * - data-edit-scale: displayNum = rangeVal * scale (ex.: 0.01 para ×, 100 para % de 0–1)
 * - data-edit="off": não liga digitação (ex.: raio de imagem, max > max do slider)
 * - data-edit-delay: ms de espera após parar de digitar antes de aplicar (default 400;
 *   "0"/"off" = ao vivo). Evita aplicar o "5" no meio de digitar "50".
 */
const ATTR = 'data-snaps';
const DONE = 'data-snap-ready';
const EDIT_DONE = 'data-edit-ready';
const MAX_SNAPS = 6;
/** Pausa padrão entre o último digito e a aplicação (2 dígitos sem glitch). */
export const DEFAULT_EDIT_DELAY_MS = 400;
// fração do span (max−min) em que o ímã puxa — sem piso absoluto (ranges 0–0.8 quebram)
const THRESH_FRAC = 0.035;

/** input → true enquanto o valor veio da digitação (ímã não deve puxar). */
const skipSnap = new WeakSet();

/** Shift pressionado = ajuste fino sem ímã (keydown/keyup em capture no window). */
let shiftHeld = false;
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Shift') shiftHeld = true;
  }, true);
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') shiftHeld = false;
  }, true);
  // perde o estado se a janela perde foco com Shift ainda baixo
  window.addEventListener('blur', () => { shiftHeld = false; });
}

/**
 * true quando o valor do range NÃO deve receber ímã:
 * digitação (skipSnap) ou Shift no arraste (ajuste fino).
 * App que re-aplica snap no handler (ex.: paintRotate) deve consultar isto.
 */
export function isFreeSnap(input) {
  if (shiftHeld) return true;
  return !!(input && skipSnap.has(input));
}

function parseSnaps(raw) {
  if (!raw) return [];
  return String(raw).split(',')
    .map((s) => +s.trim())
    .filter((n) => Number.isFinite(n));
}

/** Ordena, filtra no range e limita a MAX_SNAPS (extremos + amostra uniforme). */
function resolveSnaps(raw, min, max) {
  const sorted = [...new Set(parseSnaps(raw))]
    .filter((s) => s >= min && s <= max)
    .sort((a, b) => a - b);
  if (sorted.length <= MAX_SNAPS) return sorted;
  const out = [];
  for (let i = 0; i < MAX_SNAPS; i++) {
    const idx = Math.round(i * (sorted.length - 1) / (MAX_SNAPS - 1));
    out.push(sorted[idx]);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

function nearestSnap(v, snaps) {
  let best = null, bestD = Infinity;
  for (const s of snaps) {
    const d = Math.abs(v - s);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best == null ? null : { value: best, dist: bestD };
}

function threshold(min, max, snaps) {
  const span = Math.max(1e-9, max - min);
  let gap = span;
  for (let i = 1; i < snaps.length; i++) gap = Math.min(gap, snaps[i] - snaps[i - 1]);
  return Math.min(span * THRESH_FRAC, Math.max(gap * 0.4, span * 0.01));
}

function tickLeft(snap, min, max) {
  if (max === min) return 0;
  return ((snap - min) / (max - min)) * 100;
}

function readMin(input) {
  return input.min === '' ? 0 : +input.min;
}
function readMax(input) {
  return input.max === '' ? 100 : +input.max;
}
function readStep(input) {
  if (input.step === '' || input.step === 'any') return null;
  const s = +input.step;
  return Number.isFinite(s) && s > 0 ? s : null;
}

// ── valor digitável (puro — testável sem DOM) ────────────────────────────────

/**
 * Extrai o primeiro número de um label (`12px`, `1.00×`, `55%`, `-0.05em`, `37,5`).
 * Aceita decimal com "." ou "," (pt-BR). Se os dois aparecem, o último é o decimal
 * (ex.: "1.234,5" → 1234.5; "1,234.5" → 1234.5). Separador de milhar some.
 */
export function parseEditNumber(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return null;
  // isola o trecho numérico (sinal + dígitos + . ou ,)
  const m = s.match(/-?[\d.,]+/);
  if (!m) return null;
  s = m[0];
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // os dois: o que vem por último é o decimal; o outro é milhar
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    // só vírgula → decimal pt-BR (`37,5` / `,5`)
    s = s.replace(',', '.');
  }
  // só ponto: já está em forma JS (`37.5`)
  if (s === '-' || s === '.' || s === '-.') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** data-edit-scale no range; default 1 (display = value do input). */
export function readEditScale(inputOrRaw) {
  const raw = inputOrRaw == null
    ? null
    : (typeof inputOrRaw === 'string' || typeof inputOrRaw === 'number')
      ? inputOrRaw
      : inputOrRaw.getAttribute?.('data-edit-scale');
  if (raw == null || raw === '') return 1;
  const n = +raw;
  return Number.isFinite(n) && n !== 0 ? n : 1;
}

/** data-edit-delay no range; default DEFAULT_EDIT_DELAY_MS; 0/off = aplica a cada tecla. */
export function readEditDelay(inputOrRaw) {
  const raw = inputOrRaw == null
    ? null
    : (typeof inputOrRaw === 'string' || typeof inputOrRaw === 'number')
      ? inputOrRaw
      : inputOrRaw.getAttribute?.('data-edit-delay');
  if (raw === '0' || raw === 'off') return 0;
  if (raw == null || raw === '') return DEFAULT_EDIT_DELAY_MS;
  const n = +raw;
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_EDIT_DELAY_MS;
}

/** Limpa pó de float (0.55*100 → 55.00000000000001). */
function cleanFloat(n) {
  if (!Number.isFinite(n)) return n;
  return +n.toFixed(10);
}

export function displayToRange(displayNum, scale = 1) {
  const s = Number.isFinite(scale) && scale !== 0 ? scale : 1;
  return cleanFloat(displayNum / s);
}

export function rangeToDisplay(rangeVal, scale = 1) {
  const s = Number.isFinite(scale) && scale !== 0 ? scale : 1;
  return cleanFloat(rangeVal * s);
}

/** Casas decimais “úteis” do step (0.01 → 2; 1 → 0). */
export function decimalsOfStep(step) {
  if (!Number.isFinite(step) || step <= 0) return 0;
  const s = String(step);
  if (s.includes('e') || s.includes('E')) {
    // 1e-2 etc.
    const n = Math.abs(Math.floor(Math.log10(step)));
    return Number.isFinite(n) ? Math.min(8, n) : 0;
  }
  const i = s.indexOf('.');
  return i < 0 ? 0 : Math.min(8, s.length - i - 1);
}

/** Quantiza ao step a partir do min e clampa em [min, max]. */
export function quantizeClamp(val, min, max, step) {
  if (!Number.isFinite(val)) return null;
  let v = val;
  if (Number.isFinite(step) && step > 0) {
    const n = Math.round((val - min) / step);
    v = min + n * step;
    v = +v.toFixed(decimalsOfStep(step));
  }
  if (v < min) v = min;
  if (v > max) v = max;
  return v;
}

/** Converte texto digitado → valor de range (ou null se inválido). */
export function parseEditToRange(raw, { min, max, step, scale = 1 } = {}) {
  const display = parseEditNumber(raw);
  if (display == null) return null;
  const rangeVal = displayToRange(display, scale);
  return quantizeClamp(rangeVal, min, max, step);
}

// ── achar label de valor no mesmo .field ─────────────────────────────────────

function isValueSpan(sp) {
  if (!sp || sp.tagName !== 'SPAN') return false;
  if (sp.closest('.range-snap')) return false;
  if (sp.classList.contains('resetbtn') || sp.closest('button')) return false;
  if (sp.classList.contains('field-row') || sp.classList.contains('det-chev')) return false;
  // id explícito (fsVal, wmScaleVal, …) vence class=hint — timelines usa .hint no valor
  if (sp.id) return true;
  if (sp.hasAttribute('data-role') || sp.hasAttribute('data-logosizev')
    || sp.hasAttribute('data-bgscalev') || sp.hasAttribute('data-range-val')) return true;
  if (sp.classList.contains('hint')) return false;
  return true;
}

/** Localiza o span de valor ligado ao range (ou null). */
export function findValueEl(input) {
  if (!input || input.dataset.edit === 'off') return null;
  const field = input.closest('.field, label.field, .sp-op');
  if (!field) return null;

  if (input.dataset.val) {
    try {
      const bySel = field.querySelector(input.dataset.val) || document.querySelector(input.dataset.val);
      if (bySel) return bySel;
    } catch { /* seletor inválido */ }
  }

  const explicit = field.querySelector('[data-range-val], .field-edit');
  if (explicit && !explicit.closest('.range-snap')) return explicit;

  const fv = field.querySelector('.field-val');
  if (fv) {
    for (const c of fv.children) {
      if (c.tagName === 'SPAN' && isValueSpan(c)) return c;
    }
    // #zoomPopVal: o próprio .field-val é o valor
    if (fv.id || fv.hasAttribute('data-role') || fv.hasAttribute('data-logosizev')
      || fv.hasAttribute('data-bgscalev') || fv.hasAttribute('data-range-val')) {
      return fv;
    }
  }

  for (const sp of field.querySelectorAll('span')) {
    if (!isValueSpan(sp)) continue;
    if (sp.classList.contains('field-val')) continue; // container, não o número
    return sp;
  }

  return field.querySelector('.sp-opval');
}

function placeCaretEnd(el) {
  try {
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  } catch { /* selection pode falhar off-DOM */ }
}

function selectAll(el) {
  try {
    const r = document.createRange();
    r.selectNodeContents(el);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  } catch { /* */ }
}

/** Liga label digitável ↔ range. Idempotente. */
function bindRangeEdit(input) {
  if (!input || input.type !== 'range') return;
  if (input.dataset.edit === 'off') return;
  if (input.hasAttribute(EDIT_DONE)) return;

  const display = findValueEl(input);
  if (!display) return;

  input.setAttribute(EDIT_DONE, '');
  display.classList.add('field-edit');
  display.setAttribute('contenteditable', 'true');
  display.setAttribute('spellcheck', 'false');
  // decimal quando o step tem casas (escala 0.1, letter-spacing 0.01…); senão teclado numérico
  const step0 = readStep(input);
  const dec0 = decimalsOfStep(step0 == null ? 1 : step0);
  display.setAttribute('inputmode', dec0 > 0 ? 'decimal' : 'numeric');
  if (!display.getAttribute('title')) {
    display.setAttribute('title', dec0 > 0 ? 'Clique para digitar (use . ou ,)' : 'Clique para digitar');
  }

  const scaleOf = () => readEditScale(input);
  const bounds = () => ({
    min: readMin(input),
    max: readMax(input),
    step: readStep(input),
    scale: scaleOf(),
  });

  let delayTimer = null;
  let valueOnFocus = input.value;

  const clearDelay = () => {
    if (delayTimer != null) { clearTimeout(delayTimer); delayTimer = null; }
  };

  /** Aplica texto digitado no range. `change:true` = “terminou” (reflow/paginação no app). */
  const applyFromRaw = (raw, { restoreText = true, change = false } = {}) => {
    const next = parseEditToRange(raw, bounds());
    if (next == null) {
      // rascunho inválido/vazio: no commit final, re-dispara pra o app reformatar o label
      if (change) {
        skipSnap.add(input);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        skipSnap.delete(input);
      }
      return false;
    }
    skipSnap.add(input);
    const asStr = String(next);
    if (input.value !== asStr) input.value = asStr;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    if (change) input.dispatchEvent(new Event('change', { bubbles: true }));
    skipSnap.delete(input);
    if (restoreText && document.activeElement === display && display.textContent !== raw) {
      display.textContent = raw;
      placeCaretEnd(display);
    }
    return true;
  };

  const scheduleApply = (raw) => {
    clearDelay();
    const ms = readEditDelay(input);
    if (ms <= 0) {
      // ao vivo: só input (arraste do thumb já tem change no pointerup nativo)
      applyFromRaw(raw, { restoreText: true, change: false });
      return;
    }
    delayTimer = setTimeout(() => {
      delayTimer = null;
      // usa o texto ATUAL (não o do keystroke antigo) + change p/ reflow/página
      applyFromRaw(display.textContent, { restoreText: true, change: true });
    }, ms);
  };

  display.addEventListener('mousedown', (e) => {
    // <label> roubaria o foco pro range
    e.preventDefault();
    e.stopPropagation();
    display.focus();
    selectAll(display);
  });

  display.addEventListener('focus', () => {
    valueOnFocus = input.value;
  });

  // Enter = aplicar (não quebra linha no contenteditable). beforeinput pega
  // insertParagraph/insertLineBreak que o keydown sozinho às vezes não barra.
  display.addEventListener('beforeinput', (e) => {
    if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') {
      e.preventDefault();
    }
  });

  display.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      clearDelay();
      // aplica na hora e formata o label (blur faria o mesmo; chamar direto evita race)
      applyFromRaw(display.textContent, { restoreText: false, change: true });
      display.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      clearDelay();
      // volta ao valor de quando entrou no campo
      skipSnap.add(input);
      input.value = valueOnFocus;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      skipSnap.delete(input);
      display.blur();
    }
  });

  display.addEventListener('input', (e) => {
    if (e.isComposing) return;
    // strip acidental de <br>/<div> se o browser inserir quebra
    if (display.querySelector('br, div, p')) {
      const plain = display.textContent;
      if (display.textContent !== plain || display.childNodes.length > 1) {
        display.textContent = plain.replace(/\n/g, '');
        placeCaretEnd(display);
      }
    }
    scheduleApply(display.textContent);
  });

  display.addEventListener('blur', () => {
    clearDelay();
    // commit imediato ao sair (Enter ou clique fora) — formata o label
    applyFromRaw(display.textContent, { restoreText: false, change: true });
  });
}

/**
 * Clique → foco; Enter → commit (sem quebrar linha); Escape → cancel.
 * Para labels contenteditable com data-edit="off" no range (ex.: raio de imagem
 * com max digitável > max do slider). Idempotente.
 *
 * @param {HTMLElement} display
 * @param {{
 *   onCommit?: (raw: string) => void,
 *   onCancel?: () => void,
 *   onInput?: (raw: string) => void,
 * }} [opts]
 */
export function wireFieldEditKeys(display, opts = {}) {
  if (!display || display.dataset.editKeysReady) return display;
  display.dataset.editKeysReady = '1';
  display.classList.add('field-edit');
  if (display.getAttribute('contenteditable') !== 'true') {
    display.setAttribute('contenteditable', 'true');
  }
  display.setAttribute('spellcheck', 'false');
  if (!display.getAttribute('inputmode')) display.setAttribute('inputmode', 'numeric');
  if (!display.getAttribute('title')) display.setAttribute('title', 'Clique para digitar');

  let rawOnFocus = display.textContent || '';

  display.addEventListener('mousedown', (e) => {
    // <label> roubaria o foco pro range
    e.preventDefault();
    e.stopPropagation();
    display.focus();
    selectAll(display);
  });

  display.addEventListener('focus', () => {
    rawOnFocus = display.textContent || '';
  });

  display.addEventListener('beforeinput', (e) => {
    if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') {
      e.preventDefault();
    }
  });

  display.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      opts.onCommit?.(display.textContent || '');
      display.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      display.textContent = rawOnFocus;
      opts.onCancel?.();
      display.blur();
    }
  });

  display.addEventListener('input', (e) => {
    if (e.isComposing) return;
    if (display.querySelector('br, div, p')) {
      const plain = (display.textContent || '').replace(/\n/g, '');
      display.textContent = plain;
      placeCaretEnd(display);
    }
    opts.onInput?.(display.textContent || '');
  });

  display.addEventListener('blur', () => {
    opts.onCommit?.(display.textContent || '');
  });

  return display;
}

/** Decora um <input type=range data-snaps="…"> com ticks, ímã e valor digitável. Idempotente. */
export function enhanceRange(input) {
  if (!input || input.type !== 'range') return input;

  const raw = input.getAttribute(ATTR);
  const hasSnaps = parseSnaps(raw).length > 0;

  if (hasSnaps && !input.hasAttribute(DONE)) {
    const min = () => readMin(input);
    const max = () => readMax(input);
    let snaps = resolveSnaps(raw, min(), max());
    if (snaps.length) {
      // wrapper: ticks sobrepostos na trilha (dentro do slider), pointer-events:none
      const wrap = document.createElement('div');
      wrap.className = 'range-snap';
      const ticks = document.createElement('div');
      ticks.className = 'range-snap-ticks';
      ticks.setAttribute('aria-hidden', 'true');

      const paintTicks = () => {
        const a = min(), b = max();
        snaps = resolveSnaps(input.getAttribute(ATTR), a, b);
        ticks.replaceChildren();
        for (const s of snaps) {
          const t = document.createElement('span');
          t.style.left = tickLeft(s, a, b) + '%';
          ticks.append(t);
        }
      };
      paintTicks();

      if (input.parentNode) {
        input.parentNode.insertBefore(wrap, input);
        wrap.append(input, ticks);
      }
      input.setAttribute(DONE, '');

      // capture: ímã antes dos handlers do app (que leem e.target.value no bubble).
      // digitação e Shift = livre (isFreeSnap).
      input.addEventListener('input', () => {
        if (isFreeSnap(input)) return;
        const a = min(), b = max();
        const hit = nearestSnap(+input.value, snaps);
        if (hit && hit.dist <= threshold(a, b, snaps) && String(hit.value) !== input.value) {
          input.value = String(hit.value);
        }
      }, true);

      new MutationObserver(paintTicks)
        .observe(input, { attributes: true, attributeFilter: ['min', 'max', ATTR] });
    }
  }

  bindRangeEdit(input);
  return input;
}

/** Aplica em todos os ranges com data-snaps dentro de `root` (default: document). */
export function enhanceAll(root = document) {
  root.querySelectorAll(`input[type="range"][${ATTR}]`).forEach(enhanceRange);
}
