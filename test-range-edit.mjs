/* Self-check do valor digitável nos sliders (node test-range-edit.mjs).
 *
 * O que quebraria calado sem este teste:
 * - digitar 37 perto de snaps 25/50 e o parse/quantize virar 25 ou 50
 * - logo/wmScale: digitar 1.25× e o range não ir pra 125 (data-edit-scale 0.01)
 * - checkedOpacity/barGap: digitar 55% e o range não ir pra 0.55 (scale 100)
 * - step 0.01 com float dust (letter-spacing)
 * - parse de sufixos (px, %, ×, em) e de string vazia/inválida
 * - isFreeSnap: sem digitação/Shift → false (ímã ligado); app usa isto p/ não
 *   re-snappar rotação digitada (3° → 0° com thresh 4)
 */
import assert from 'node:assert/strict';
import {
  parseEditNumber,
  readEditScale,
  readEditDelay,
  DEFAULT_EDIT_DELAY_MS,
  displayToRange,
  rangeToDisplay,
  decimalsOfStep,
  quantizeClamp,
  parseEditToRange,
  isFreeSnap,
} from './range-snap.js';

// ── parse do que o usuário digita ────────────────────────────────────────────
assert.equal(parseEditNumber('37'), 37);
assert.equal(parseEditNumber('37px'), 37);
assert.equal(parseEditNumber('37 px'), 37);
assert.equal(parseEditNumber('100%'), 100);
assert.equal(parseEditNumber('1.25×'), 1.25);
assert.equal(parseEditNumber('1.00×'), 1);
assert.equal(parseEditNumber('-0.05em'), -0.05);
assert.equal(parseEditNumber('0.28'), 0.28);
assert.equal(parseEditNumber('  12  '), 12);
// vírgula decimal (pt-BR) e ponto
assert.equal(parseEditNumber('37,5'), 37.5);
assert.equal(parseEditNumber('37,5%'), 37.5);
assert.equal(parseEditNumber('50.5'), 50.5);
assert.equal(parseEditNumber(',5'), 0.5);
assert.equal(parseEditNumber('.5'), 0.5);
assert.equal(parseEditNumber('1,25×'), 1.25);
// os dois separadores: o último é o decimal
assert.equal(parseEditNumber('1.234,5'), 1234.5);
assert.equal(parseEditNumber('1,234.5'), 1234.5);
assert.equal(parseEditNumber(''), null);
assert.equal(parseEditNumber('off'), null);
assert.equal(parseEditNumber('px'), null);
assert.equal(parseEditNumber('-'), null);

// ── scale display ↔ range ────────────────────────────────────────────────────
assert.equal(readEditScale(null), 1);
assert.equal(readEditScale(''), 1);
assert.equal(readEditScale('0.01'), 0.01);
assert.equal(readEditScale('100'), 100);
assert.equal(readEditScale('0'), 1); // 0 é inválido → default
assert.equal(displayToRange(1.25, 0.01), 125);
assert.equal(displayToRange(55, 100), 0.55);
assert.equal(rangeToDisplay(125, 0.01), 1.25);
assert.equal(rangeToDisplay(0.55, 100), 55);

// ── quantize / step (sem puxar pro snap — isso é outra camada) ───────────────
assert.equal(decimalsOfStep(1), 0);
assert.equal(decimalsOfStep(0.01), 2);
assert.equal(decimalsOfStep(0.05), 2);
assert.equal(quantizeClamp(37, 10, 100, 1), 37); // longe de 25/50
assert.equal(quantizeClamp(26, 10, 100, 1), 26);
assert.equal(quantizeClamp(5, 10, 100, 1), 10);  // clampa min
assert.equal(quantizeClamp(200, 10, 100, 1), 100);
assert.equal(quantizeClamp(0.123, -0.05, 0.15, 0.01), 0.12);
assert.equal(quantizeClamp(0.125, -0.05, 0.15, 0.01), 0.13);
assert.equal(quantizeClamp(0.53, 0, 1, 0.05), 0.55);

// ── pipeline completo digitado → range ───────────────────────────────────────
// escala imagem / zoom: 1:1 (agora com decimais step 0.1)
assert.equal(parseEditToRange('37%', { min: 10, max: 100, step: 1, scale: 1 }), 37);
assert.equal(parseEditToRange('5', { min: 10, max: 100, step: 1 }), 10);
assert.equal(parseEditToRange('50.5', { min: 10, max: 100, step: 0.1, scale: 1 }), 50.5);
assert.equal(parseEditToRange('50,5%', { min: 10, max: 100, step: 0.1, scale: 1 }), 50.5);
assert.equal(parseEditToRange('37,2', { min: 10, max: 100, step: 0.1, scale: 1 }), 37.2);
assert.equal(parseEditToRange('12.34', { min: 10, max: 100, step: 0.1, scale: 1 }), 12.3); // quantiza

// logo / wmScale: display × → range percent
assert.equal(parseEditToRange('1.25×', { min: 40, max: 260, step: 1, scale: 0.01 }), 125);
assert.equal(parseEditToRange('1', { min: 40, max: 260, step: 1, scale: 0.01 }), 100);
assert.equal(parseEditToRange('0.2', { min: 40, max: 260, step: 1, scale: 0.01 }), 40); // clampa

// checkedOpacity / barGap: display % → fração
assert.equal(parseEditToRange('55%', { min: 0, max: 1, step: 0.05, scale: 100 }), 0.55);
assert.equal(parseEditToRange('28', { min: 0, max: 0.8, step: 0.02, scale: 100 }), 0.28);

// inválido
assert.equal(parseEditToRange('', { min: 0, max: 100, step: 1 }), null);
assert.equal(parseEditToRange('abc', { min: 0, max: 100, step: 1 }), null);

// ── readEditScale com objeto fake de input ───────────────────────────────────
assert.equal(readEditScale({ getAttribute: (k) => k === 'data-edit-scale' ? '0.01' : null }), 0.01);
assert.equal(readEditScale({ getAttribute: () => null }), 1);

// ── delay da digitação (2 dígitos sem aplicar o "5" no meio do "50") ──────────
assert.equal(DEFAULT_EDIT_DELAY_MS, 400);
assert.equal(readEditDelay(null), DEFAULT_EDIT_DELAY_MS);
assert.equal(readEditDelay(''), DEFAULT_EDIT_DELAY_MS);
assert.equal(readEditDelay('0'), 0);
assert.equal(readEditDelay('off'), 0);
assert.equal(readEditDelay('250'), 250);
assert.equal(readEditDelay({ getAttribute: (k) => k === 'data-edit-delay' ? '500' : null }), 500);
assert.equal(readEditDelay({ getAttribute: () => null }), DEFAULT_EDIT_DELAY_MS);

// ── isFreeSnap: baseline sem digitação e sem Shift (Node não tem key events) ──
assert.equal(isFreeSnap(null), false);
assert.equal(isFreeSnap({}), false);

console.log('ok — range-edit: parse, scale, quantize (sem snap), delay, pipeline digitado→range, free-snap');
