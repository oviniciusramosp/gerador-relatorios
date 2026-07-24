/* Recrop da margem branca de imagens (trilha C · tarefa 3).
 *
 * PNG de gráfico e print de planilha quase sempre vêm com uma moldura branca
 * (padding do app de origem) que, na coluna estreita do relatório, come espaço
 * e desalinha. Aqui a gente acha a bounding box do CONTEÚDO e recorta.
 *
 * ponytail: DOM só na casca (autocropWhite recebe um <img> e usa <canvas>). O
 * núcleo — achar a caixa do conteúdo — é `contentBounds()`, puro, sobre um
 * ImageData avulso ({data,width,height}), pra rodar em node sem DOM (ver demo()).
 *
 * Tolerância, NÃO igualdade: antialiasing de PNG e ruído de JPEG fazem o branco
 * "puro" (255,255,255) quase nunca existir. Um pixel conta como branco se os 3
 * canais >= tol (250 por padrão) OU o alpha <= 8 (quase transparente).
 */

// Acha a menor caixa que contém todo pixel NÃO-branco. Retorna
// { x0, y0, x1, y1 } com x1/y1 EXCLUSIVOS (largura = x1 - x0), ou null se a
// imagem inteira for branca (nesse caso não há o que recortar — evita 0×0).
export function contentBounds({ data, width, height }, tol = 250) {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      // branco = quase-transparente OU quase-branco nos 3 canais (com tolerância)
      const white = a <= 8 || (data[i] >= tol && data[i + 1] >= tol && data[i + 2] >= tol);
      if (white) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;                      // nenhum pixel de conteúdo
  return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

// Recebe um HTMLImageElement JÁ carregado. Retorna { dataUrl, w, h } com a
// imagem recortada, ou null quando NÃO há nada a cortar (imagem toda branca,
// sem margem, ou canvas "tainted" por origem cruzada). Quem chama deve tratar
// null como "usa a imagem original".
export function autocropWhite(img, tol = 250) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  if (!w || !h) return null;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  let px;
  try { px = ctx.getImageData(0, 0, w, h); }
  catch { return null; }                        // canvas tainted (cross-origin) → sem recrop
  const bb = contentBounds(px, tol);
  if (!bb) return null;                          // toda branca
  if (bb.x0 === 0 && bb.y0 === 0 && bb.x1 === w && bb.y1 === h) return null;  // sem margem: nada a cortar
  const cw = bb.x1 - bb.x0, ch = bb.y1 - bb.y0;
  const out = document.createElement('canvas');
  out.width = cw; out.height = ch;
  out.getContext('2d').drawImage(cv, bb.x0, bb.y0, cw, ch, 0, 0, cw, ch);
  return { dataUrl: out.toDataURL('image/png'), w: cw, h: ch };
}

// self-check: `node autocrop.js` (não roda ao importar no browser — sem `process`)
function demo() {
  const W = 10, H = 10;
  const white = () => new Uint8ClampedArray(W * H * 4).fill(255);   // 10×10 branco opaco

  // 1) retângulo preto em x[3..6] y[2..5] no meio do branco → bbox = 3,2..7,6
  const d1 = white();
  for (let y = 2; y <= 5; y++) for (let x = 3; x <= 6; x++) {
    const i = (y * W + x) * 4; d1[i] = d1[i + 1] = d1[i + 2] = 0;
  }
  const bb = contentBounds({ data: d1, width: W, height: H });
  console.assert(bb && bb.x0 === 3 && bb.y0 === 2 && bb.x1 === 7 && bb.y1 === 6,
    'bbox do retângulo central', JSON.stringify(bb));

  // 2) imagem toda branca → null (não recortar, senão canvas 0×0)
  console.assert(contentBounds({ data: white(), width: W, height: H }) === null,
    'imagem toda branca → null');

  // 3) pixel preto mas quase-transparente (alpha 4) conta como branco → null
  const d3 = white(); d3[3] = 4; d3[0] = d3[1] = d3[2] = 0;
  console.assert(contentBounds({ data: d3, width: W, height: H }) === null,
    'preto transparente → tratado como branco');

  // 4) tolerância: 251,251,251 (quase-branco) é branco; 240 já é conteúdo
  const d4 = white(); const p = (0 * W + 0) * 4; d4[p] = d4[p + 1] = d4[p + 2] = 251;
  console.assert(contentBounds({ data: d4, width: W, height: H }) === null,
    'quase-branco dentro da tolerância → branco');

  console.log('autocrop: todos os asserts passaram');
}

if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].endsWith('autocrop.js')) demo();
