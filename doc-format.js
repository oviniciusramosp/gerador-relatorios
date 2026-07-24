/* Formato de arquivo do documento completo (trilha C · tarefa 3.2).
 *
 * "Salvar" trocava o .md (só o TEXTO) por um .pdgm.json que carrega o state.doc
 * INTEIRO — blocos + capa/contracapa + logo + índice/resumo + cabeçalho/rodapé +
 * nº da 1ª página + origem vinculada. "Abrir" reconstrói o documento idêntico a
 * partir desse arquivo (como o export/import de página do Notion).
 *
 * Serialização GENÉRICA de propósito — JSON.parse(JSON.stringify(doc)) captura
 * o objeto INTEIRO em vez de listar cover/back/index campo por campo. As trilhas
 * A e G mudam o SHAPE de cover/back/index e adicionam tipos de bloco novos EM
 * PARALELO a este arquivo; se a serialização fosse campo-a-campo, ficaria
 * desatualizada assim que a integração juntasse tudo. Dumpando o objeto inteiro,
 * este módulo sobrevive a qualquer shape novo sem precisar conhecer os detalhes.
 *
 * Envelope { v, doc } com versão pra evolução futura. Hoje só existe v1 → sem
 * migração entre versões ainda, só validação de formato (ver deserializeDoc).
 *
 * serializeDocZip/deserializeDocZip (mesma tarefa, extensão pedida depois): imagem
 * de fundo/bloco vira `data:...;base64,...` inline em b.src/cover.bg/etc — dentro
 * de um .pdgm.json isso infla ~33% (overhead do base64) e produz um JSON gigante e
 * ilegível. extractMedia tira cada data: URL do objeto (troca por uma referência
 * "@media/N.ext") e devolve os bytes crus pra virar arquivo dentro de um .pdgm.zip
 * (ver zip-lite.js); injectMedia faz o caminho inverso ao abrir. Percorre o doc
 * INTEIRO igual serializeDoc — mesmo motivo: não hardcodear onde imagem mora.
 */

import { makeZip, readZip } from './zip-lite.js';

const MIME_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
const extFor = (mime) => MIME_EXT[mime] || 'bin';
const mimeForExt = (ext) => Object.entries(MIME_EXT).find(([, e]) => e === ext)?.[0] || 'application/octet-stream';

// "data:image/svg+xml;charset=utf-8,%3C..." → { mime, base64, body } (null se não for data: URL).
// Parseado por vírgula, não regex fixo — parâmetro do meio (;charset=...) varia (chart svg
// usa um, upload de arquivo usa só ";base64"), só o ";base64" bem antes da vírgula importa.
function parseDataUrl(v) {
  if (typeof v !== 'string' || !v.startsWith('data:')) return null;
  const comma = v.indexOf(',');
  if (comma < 0) return null;
  const header = v.slice(5, comma);
  return { mime: header.split(';')[0] || 'application/octet-stream', base64: /(^|;)base64$/.test(header), body: v.slice(comma + 1) };
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// doc → { doc: CÓPIA com toda data: URL trocada por "@media/N.ext", media: [{name, data}] }
function extractMedia(doc) {
  let n = 0;
  const media = [];
  const walk = (v) => {
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) v[i] = walk(v[i]); return v; }
    if (v && typeof v === 'object') { for (const k in v) v[k] = walk(v[k]); return v; }
    const parsed = parseDataUrl(v);
    if (!parsed) return v;
    const bytes = parsed.base64 ? base64ToBytes(parsed.body) : new TextEncoder().encode(decodeURIComponent(parsed.body));
    const name = `media/${n++}.${extFor(parsed.mime)}`;
    media.push({ name, data: bytes });
    return `@${name}`;
  };
  return { doc: walk(JSON.parse(JSON.stringify(doc))), media };
}

// doc (mutado in-place) + arquivos do zip → mesmo doc com "@media/N.ext" de volta a data: URL
function injectMedia(doc, mediaFiles) {
  const byName = new Map(mediaFiles.map((f) => [f.name, f.data]));
  const walk = (v) => {
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) v[i] = walk(v[i]); return v; }
    if (v && typeof v === 'object') { for (const k in v) v[k] = walk(v[k]); return v; }
    if (typeof v !== 'string' || !v.startsWith('@media/')) return v;
    const name = v.slice(1);
    const bytes = byName.get(name);
    if (!bytes) return v;   // mídia faltando no zip → mantém a referência (perda visível, não silenciosa)
    return `data:${mimeForExt(name.split('.').pop())};base64,${bytesToBase64(bytes)}`;
  };
  return walk(doc);
}

// state.doc → Blob de um .pdgm.zip (doc.json sem imagens inline + media/*)
export async function serializeDocZip(doc) {
  const { doc: light, media } = extractMedia(doc);
  const docJson = new TextEncoder().encode(JSON.stringify({ v: 1, doc: light }));
  return makeZip([{ name: 'doc.json', data: docJson }, ...media]);
}

// ArrayBuffer de um .pdgm.zip → doc pronto pra virar o novo state.doc (ou null)
export async function deserializeDocZip(buf) {
  let files;
  try { files = await readZip(buf); } catch { return null; }
  const docFile = files.find((f) => f.name === 'doc.json');
  if (!docFile) return null;
  let envelope;
  try { envelope = JSON.parse(new TextDecoder().decode(docFile.data)); } catch { return null; }
  const doc = deserializeDoc(envelope);
  if (!doc) return null;
  return injectMedia(doc, files.filter((f) => f !== docFile));
}

// state.doc → objeto JSON serializável, dentro do envelope versionado.
export function serializeDoc(doc) {
  return { v: 1, doc: JSON.parse(JSON.stringify(doc)) };
}

// JSON já parseado ({v, doc}) → objeto doc pronto pra virar o novo state.doc.
// v1: só valida o ENVELOPE (v presente, doc é objeto) — não migra entre versões
// (só existe v1 ainda). Formato inválido/corrompido → null; quem chama decide
// como avisar o usuário (não lança, pra não precisar de try/catch no call site).
export function deserializeDoc(json) {
  if (!json || json.v == null || typeof json.doc !== 'object' || json.doc === null) return null;
  return json.doc;
}

// self-check: `node doc-format.js` (não roda ao importar no browser — sem `process`)
async function demo() {
  // doc de exemplo com um pouco de tudo (blocos + capa + logo + índice) — não
  // precisa bater 100% com o shape real de state.doc (o ponto é o round-trip
  // genérico, não validar o shape — essa é a graça de serializar sem hardcode).
  const original = {
    blocks: [
      { id: 'b1', type: 'h1', html: 'Relatório' },
      { id: 'b2', type: 'p', html: 'Texto <b>rico</b>' },
    ],
    footText: 'paradigma.education', headText: '', firstPage: 1,
    source: { kind: 'file', label: 'relatorio.md' },
    cover: {
      on: true, bg: null, bgX: 50, bgY: 50,
      logo: { on: false, kind: 'icone', pos: 'header', align: 'left', color: '#FFFFFF', size: 1 },
      items: [{ id: 'c1', html: 'Título', size: 40, span: 'full', align: 'left', color: null, y: 330 }],
    },
    back: {
      on: true, bg: null, bgX: 50, bgY: 50,
      logo: { on: false, kind: 'icone', pos: 'header', align: 'left', color: '#FFFFFF', size: 1 },
      items: [],
    },
    index: { on: true, resumo: '<p>Resumo do relatório.</p>' },
  };

  const wire = serializeDoc(original);
  console.assert(wire.v === 1, 'envelope sai com v:1');

  const back = deserializeDoc(wire);
  console.assert(JSON.stringify(back) === JSON.stringify(original), 'round-trip preserva o doc inteiro', JSON.stringify(back));
  console.assert(back !== original, 'round-trip devolve uma cópia, não a mesma referência');

  console.assert(deserializeDoc({}) === null, 'envelope sem v/doc → null');
  console.assert(deserializeDoc({ v: 1, doc: 'nope' }) === null, 'doc que não é objeto → null');
  console.assert(deserializeDoc(null) === null, 'json nulo → null (não lança)');

  // pdgm.zip: doc com uma imagem (1x1 PNG em base64) e um SVG percent-encoded — cobre
  // as duas formas de data: URL que aparecem no app (upload de arquivo e chart exportado)
  const png1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const svg = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg><rect/></svg>');
  const withMedia = { ...original, cover: { ...original.cover, bg: png1x1 }, blocks: [...original.blocks, { id: 'b3', type: 'image', src: svg }] };

  const zipBlob = await serializeDocZip(withMedia);
  const zipDoc = await deserializeDocZip(await zipBlob.arrayBuffer());
  console.assert(zipDoc.cover.bg === png1x1, 'imagem base64 sobrevive ao round-trip via .pdgm.zip', zipDoc.cover.bg);
  console.assert(zipDoc.blocks[2].src.startsWith('data:image/svg+xml;base64,'), 'svg percent-encoded volta como data: URL (agora em base64)', zipDoc.blocks[2].src);
  const decodedSvg = new TextDecoder().decode(base64ToBytes(zipDoc.blocks[2].src.split(',')[1]));
  console.assert(decodedSvg === '<svg><rect/></svg>', 'conteúdo do svg é idêntico ao original', decodedSvg);
  console.assert(JSON.stringify({ ...zipDoc, cover: { ...zipDoc.cover, bg: null }, blocks: zipDoc.blocks.slice(0, 2) })
    === JSON.stringify({ ...original, cover: { ...original.cover, bg: null } }), 'resto do doc (sem mídia) sai idêntico do .pdgm.zip');
  console.assert(await deserializeDocZip(new Uint8Array([1, 2, 3]).buffer) === null, '.zip corrompido → null (não lança)');

  console.log('doc-format: todos os asserts passaram');
}

if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].endsWith('doc-format.js')) demo();
