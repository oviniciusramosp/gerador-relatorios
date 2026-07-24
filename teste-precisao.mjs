/* Teste de precisão do conversor imagem -> spec, de ponta a ponta.
 *
 *   node teste-precisao.mjs            # usa metadados em cache (_ia/cache/)
 *   node teste-precisao.mjs --fresh    # re-roda o CLI (sonnet) pra cada imagem
 *
 * O gabarito são valores IMPRESSOS nas próprias imagens (tooltip "$1.4b",
 * ticks $2.51T/$688.2B/$79.7B do CoinMarketCap, os % das barras) — não a
 * nossa própria extração, senão o teste seria circular.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildSpecFromImage } from './converter.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const CACHE = join(ROOT, '_ia', 'cache');
const FRESH = process.argv.includes('--fresh');
mkdirSync(CACHE, { recursive: true });

// ── PNG -> ImageData (RGB/RGBA 8-bit, sem interlace — o que screenshot usa) ──
function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('não é PNG');
  let pos = 8, w = 0, h = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0) throw new Error('só PNG 8-bit sem interlace');
      colorType = data[9];
      if (colorType !== 2 && colorType !== 6) throw new Error('só RGB/RGBA (colortype 2/6)');
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = colorType === 6 ? 4 : 3, stride = w * bpp;
  const out = new Uint8ClampedArray(w * h * 4);
  const prev = new Uint8Array(stride);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      row[i] = (row[i] + (f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? paeth(a, b, c) : 0)) & 255;
    }
    prev.set(row);
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, s = x * bpp;
      out[o] = row[s]; out[o + 1] = row[s + 1]; out[o + 2] = row[s + 2];
      out[o + 3] = bpp === 4 ? row[s + 3] : 255;
    }
  }
  return { width: w, height: h, data: out };
}

// ── CLI (sonnet) -> metadados, com cache pra iterar barato ───────────────────
function runClaude(imgPath) {
  const prompt = `Leia o arquivo de imagem "${imgPath}" (é um gráfico) e as instruções em `
    + `"ia-instrucoes.md". Devolva SÓ o JSON minificado da spec, sem texto em volta.`;
  const env = { ...process.env };
  delete env.CLAUDECODE; delete env.CLAUDE_CODE_ENTRYPOINT; delete env.CLAUDE_CODE_SSE_PORT;
  return new Promise((resolve, reject) => {
    const cp = spawn('claude', ['-p', prompt, '--output-format', 'json', '--model', 'sonnet',
      '--tools', 'Read', '--allowedTools', 'Read', '--no-session-persistence'],
      { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    cp.stdout.on('data', (d) => (out += d));
    cp.stderr.on('data', (d) => (err += d));
    cp.on('error', reject);
    cp.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err || `código ${code}`))));
  });
}
function extractJson(text) {
  const start = text.indexOf('{');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; }
    else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error('JSON incompleto');
}
async function getMeta(slug, imgRel) {
  const cachePath = join(CACHE, slug + '.json');
  if (!FRESH && existsSync(cachePath)) return JSON.parse(readFileSync(cachePath, 'utf8'));
  process.stdout.write(`  [CLI sonnet] lendo ${imgRel}… `);
  const t0 = Date.now();
  const envl = JSON.parse(await runClaude(imgRel));
  if (envl.is_error) throw new Error(envl.result);
  const meta = extractJson(envl.result);
  console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s, ~US$ ${(envl.total_cost_usd ?? 0).toFixed(3)}`);
  writeFileSync(cachePath, JSON.stringify(meta, null, 2));
  return meta;
}

// ── asserts ──────────────────────────────────────────────────────────────────
let fails = 0;
const fmt = (v) => Math.abs(v) >= 1e12 ? (v / 1e12).toFixed(2) + 'T' : Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(2) + 'B'
  : Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(0) + 'M' : String(Math.round(v));
function check(nome, got, want, tolPct) {
  const err = Math.abs(got - want) / Math.abs(want) * 100;
  const ok = err <= tolPct;
  if (!ok) fails++;
  console.log(`  ${ok ? '✅' : '❌'} ${nome}: ${fmt(got)} (gabarito ${fmt(want)}, erro ${err.toFixed(1)}% ≤ ${tolPct}%)`);
}
function checkTrue(nome, ok, extra = '') {
  if (!ok) fails++;
  console.log(`  ${ok ? '✅' : '❌'} ${nome}${extra ? ' — ' + extra : ''}`);
}

const lastVal = (d) => [...d].reverse().find((v) => v != null);

// ── casos ────────────────────────────────────────────────────────────────────
// gabaritos = valores IMPRESSOS nas imagens
const CURVAS = [
  {
    slug: 'taxas', img: 'exemplos/taxas cumulativas.png',
    // tooltip impresso: "29 Jun 2026 · Fees $1.4b"; curva começa em $0
    verifica(spec, d) {
      check('último ponto (tooltip "$1.4b")', lastVal(d), 1.4e9, 5);
      checkTrue('começa perto de $0', d[0] < 0.05e9, fmt(d[0]));
      const up = d.filter((v, i) => i && v != null && d[i - 1] != null && v < d[i - 1] - 0.015e9).length;
      checkTrue('acumulado: nunca cai (>1.5% da escala)', up === 0, up + ' quedas');
    },
  },
  {
    slug: 'hl-volume', img: 'exemplos/volume total hyperliquid.png',
    // sem valor impresso além dos ticks; gabarito visual: fim ≈4.8T (li da imagem), início ≈0
    verifica(spec, d) {
      check('último ponto (visual ≈4.8T)', lastVal(d), 4.8e12, 8);
      checkTrue('começa perto de 0', d[0] < 0.15e12, fmt(d[0]));
      const up = d.filter((v, i) => i && v != null && d[i - 1] != null && v < d[i - 1] - 0.06e12).length;
      checkTrue('acumulado: nunca cai', up === 0, up + ' quedas');
    },
  },
  {
    slug: 'derivativos', img: 'exemplos/volume derivativos.png',
    // Os ticks $2.51T/$79.7B NÃO são máx/mín da curva DESENHADA (medido nos
    // pixels: o pico para na linha 107, entre as grades de $2.51T e $1.91T).
    // Gabarito independente: linhas de grade medidas por perfil de luminância
    // (y = 84.5, 140.5, 195.5, 250.5, 305.5 ↔ $2.51T…$79.7B) + aritmética.
    verifica(spec, d, report) {
      checkTrue('âncoras: 5/5 na grade', /5\/5.*5 grade/.test(report.calibracao.ancoras), report.calibracao.ancoras);
      const wantRows = [84.5, 140.5, 195.5, 250.5, 305.5];
      const okRows = report.calibracao.linhas.length === 5
        && report.calibracao.linhas.every((r, i) => Math.abs(r - wantRows[i]) <= 2);
      checkTrue('âncoras nas linhas medidas (±2px)', okRows, '[' + report.calibracao.linhas + ']');
      const vals = d.filter((v) => v != null);
      check('pico (linha 107 da imagem → 2.26T)', Math.max(...vals), 2.26e12, 4);
      check('último ponto (linha ~267 → ~0.50T)', lastVal(d), 0.50e12, 6);
      checkTrue('mínimo cola na grade de $79.7B (<130B)', Math.min(...vals) < 130e9, fmt(Math.min(...vals)));
    },
  },
];

console.log('══ Conversão por pixel (LLM lê texto, pixels dão os dados) ══');
for (const caso of CURVAS) {
  console.log(`\n▶ ${caso.img}`);
  const meta = await getMeta(caso.slug, caso.img);
  checkTrue('LLM escolheu modo pixels', meta.mode === 'pixels', 'mode=' + meta.mode);
  const img = decodePNG(readFileSync(join(ROOT, caso.img)));
  const { spec, report } = buildSpecFromImage(img, meta);
  const d = spec.series[0].data;
  console.log(`  calibração: ${report.calibracao.ancoras} (${report.calibracao.n} âncoras`
    + `${report.calibracao.residuoPct != null ? `, resíduo ${report.calibracao.residuoPct}%` : ''})`
    + ` · ${report.pontos} pontos · cobertura ${report.series[0].cobertura}%`);
  for (const n of report.notas) console.log('  ⚠️ ' + n);
  checkTrue('≥40 pontos', d.length >= 40, d.length + ' pontos');
  caso.verifica(spec, d, report);
  writeFileSync(join(ROOT, 'exemplos', `auto-${caso.slug}.json`), JSON.stringify(spec, null, 2));
}

// barras empilhadas: caminho "dados" (números impressos — o LLM lê direto)
console.log('\n▶ exemplos/top perp dex coingecko.png (modo dados)');
{
  const meta = await getMeta('dex-barras', 'exemplos/top perp dex coingecko.png');
  checkTrue('LLM escolheu modo dados', meta.mode === 'dados', 'mode=' + meta.mode);
  checkTrue('12 séries (12 DEXs)', meta.series?.length === 12, (meta.series?.length ?? 0) + ' séries');
  checkTrue('16 barras (jan/25–abr/26)', meta.labels?.length === 16, (meta.labels?.length ?? 0) + ' barras');
  const hl = meta.series?.find((s) => /hyperliquid/i.test(s.name));
  if (hl) {
    check('Hyperliquid jan/25 (impresso 77%)', hl.data[0], 77, 3);
    check('Hyperliquid abr/26 (impresso 39.5%)', hl.data[hl.data.length - 1], 39.5, 3);
  } else { fails++; console.log('  ❌ série Hyperliquid não encontrada'); }
  const somas = (meta.labels || []).map((_, i) => meta.series.reduce((s, se) => s + (se.data[i] || 0), 0));
  const ruins = somas.filter((s) => s < 90 || s > 110).length;
  checkTrue('cada barra soma ~100%', ruins === 0, ruins + ' barras fora de 90–110 (somas: ' + somas.map((s) => s.toFixed(0)).join(',') + ')');
  writeFileSync(join(ROOT, 'exemplos', 'auto-dex-barras.json'), JSON.stringify(meta, null, 2));
}

console.log(fails ? `\n❌ ${fails} verificação(ões) falharam` : '\n✅ tudo passou');
process.exit(fails ? 1 : 0);
