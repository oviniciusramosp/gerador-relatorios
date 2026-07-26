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

import { makeZip, readZip, listZipEntries } from './zip-lite.js';

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
// Chunked: `bin += fromCharCode(byte)` byte-a-byte é O(n²) e trava o main thread
// em zips grandes (vários SVG de ~1 MB) — o open parecia "não fazer nada".
function bytesToBase64(bytes) {
  const CHUNK = 0x8000;
  let bin = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
  }
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

// Gráfico/linha do tempo colocado no relatório carrega, além do SVG, o SPEC que
// o gerou (bloco.chart = { kind, spec }) — é ele que permite reabrir o editor e
// mudar os dados depois. No zip o spec vira um ARQUIVO de verdade
// (charts/N-chart.json), não um campo enterrado no doc.json: assim dá pra
// descompactar, arrastar o .json direto pro gerador de gráficos e editar por
// fora. Mesma mecânica de extractMedia — referência "@charts/N.json" no lugar.
function extractCharts(doc) {
  let n = 0;
  const files = [];
  const walk = (v) => {
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) v[i] = walk(v[i]); return v; }
    if (v && typeof v === 'object') {
      if (v.chart && typeof v.chart === 'object' && v.chart.spec && typeof v.chart.spec === 'object') {
        const kind = v.chart.kind === 'timeline' ? 'timeline' : 'chart';
        const name = `charts/${n++}-${kind}.json`;
        files.push({ name, data: new TextEncoder().encode(JSON.stringify(v.chart.spec, null, 2)) });
        v.chart = { kind, spec: `@${name}` };
      }
      for (const k in v) v[k] = walk(v[k]);
      return v;
    }
    return v;
  };
  return { doc: walk(JSON.parse(JSON.stringify(doc))), files };
}

// doc (mutado in-place) + arquivos do zip → mesmo doc com "@media/N.ext" de volta
// a data: URL e "@charts/N.json" de volta ao spec do gráfico
function injectMedia(doc, mediaFiles) {
  const byName = new Map(mediaFiles.map((f) => [f.name, f.data]));
  const walk = (v) => {
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) v[i] = walk(v[i]); return v; }
    if (v && typeof v === 'object') { for (const k in v) v[k] = walk(v[k]); return v; }
    if (typeof v !== 'string' || !v.startsWith('@')) return v;
    const name = v.slice(1);
    const bytes = byName.get(name);
    if (!bytes) return v;   // arquivo faltando no zip → mantém a referência (perda visível, não silenciosa)
    if (name.startsWith('charts/')) {
      try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { return v; }
    }
    if (!name.startsWith('media/')) return v;
    return `data:${mimeForExt(name.split('.').pop())};base64,${bytesToBase64(bytes)}`;
  };
  return walk(doc);
}

// state.doc → Blob de um .pdgm.zip (doc.json sem imagens inline + media/* + charts/*)
export async function serializeDocZip(doc) {
  const { doc: noCharts, files: charts } = extractCharts(doc);
  const { doc: light, media } = extractMedia(noCharts);
  const docJson = new TextEncoder().encode(JSON.stringify({ v: 1, doc: light }));
  return makeZip([{ name: 'doc.json', data: docJson }, ...media, ...charts]);
}

const IMG_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|heic|tiff?)$/i;
const isDocJsonName = (n) => {
  const base = String(n).replace(/\\/g, '/').split('/').pop();
  return base === 'doc.json';
};

function sampleNames(names, n = 8) {
  const list = names.filter((x) => x && !x.endsWith('/'));
  if (!list.length) return '';
  const head = list.slice(0, n).map((x) => `• ${x}`).join('\n');
  const more = list.length > n ? `\n… e mais ${list.length - n}` : '';
  return head + more;
}

function looksLikeImagePack(names) {
  const files = names.filter((n) => n && !n.endsWith('/'));
  if (!files.length) return false;
  const imgs = files.filter((n) => IMG_EXT.test(n));
  return imgs.length >= Math.max(1, Math.floor(files.length * 0.6));
}

/** Motivo legível a partir do listing do zip (sem extrair). */
function diagnoseZipListing(listing, fileLabel) {
  const names = listing.map((e) => e.name);
  const hasDoc = names.some(isDocJsonName);
  const deflated = listing.filter((e) => e.method !== 0);
  const store = listing.filter((e) => e.method === 0);
  const label = fileLabel ? ` (\`${fileLabel}\`)` : '';

  if (!hasDoc) {
    if (looksLikeImagePack(names)) {
      return {
        code: 'NOT_PDGM_IMAGES',
        title: 'Este ZIP não é um projeto do diagramador',
        detail: [
          `O arquivo${label} é um pacote de imagens, não o projeto editável (.pdgm.zip).`,
          '',
          'Não há `doc.json` dentro — só arquivos de mídia (comum em download do Google Drive ou pasta “Comprimir” do Finder).',
          '',
          'Como abrir o relatório de verdade:',
          '1. No diagramador, use Baixar → ZIP (projeto editável)',
          '2. Abra esse .pdgm.zip aqui (ele contém doc.json + media/)',
          '',
          `Conteúdo detectado (${names.length} itens):`,
          sampleNames(names),
        ].join('\n'),
      };
    }
    return {
      code: 'NO_DOC_JSON',
      title: 'ZIP sem doc.json',
      detail: [
        `Não encontrei \`doc.json\` no arquivo${label}.`,
        '',
        'O projeto do diagramador precisa de um ZIP gerado por Baixar → ZIP, com:',
        '• doc.json — o documento',
        '• media/ — imagens (opcional)',
        '• charts/ — specs de gráficos (opcional)',
        '',
        names.length
          ? `Arquivos neste zip (${names.length}):\n${sampleNames(names)}`
          : 'O zip parece vazio.',
      ].join('\n'),
    };
  }

  if (deflated.length) {
    const ex = deflated[0].name;
    return {
      code: 'ZIP_DEFLATE',
      title: 'ZIP com compressão DEFLATE',
      detail: [
        `O arquivo${label} tem doc.json, mas usa compressão DEFLATE (método 8) em ${deflated.length} entrada(s).`,
        `Exemplo: “${ex}”.`,
        '',
        'O diagramador só lê ZIP em STORE (sem compressão) — o formato que Baixar → ZIP gera.',
        'Recompactar no Finder, 7-Zip ou baixar pasta zipada do Drive costuma virar DEFLATE e quebra a abertura.',
        '',
        `Entradas: ${store.length} STORE · ${deflated.length} DEFLATE.`,
        'Solução: abra o .pdgm.zip original baixado pelo app, sem recompactar.',
      ].join('\n'),
    };
  }

  return null; // listing ok — falha será na extração/parse
}

/**
 * Abre um .pdgm.zip com diagnóstico.
 * @returns {Promise<{ok:true, doc:object}|{ok:false, code:string, title:string, detail:string}>}
 */
export async function loadDocZip(buf, fileLabel) {
  if (!buf || (buf.byteLength !== undefined && buf.byteLength < 4)
      || (buf.length !== undefined && buf.length < 4)) {
    return {
      ok: false,
      code: 'EMPTY',
      title: 'Arquivo vazio ou incompleto',
      detail: 'O arquivo tem poucos bytes — o download pode ter falhado. Baixe de novo o .pdgm.zip.',
    };
  }

  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (!(u8[0] === 0x50 && u8[1] === 0x4b)) {
    return {
      ok: false,
      code: 'NOT_ZIP',
      title: 'Isso não parece um arquivo ZIP',
      detail: [
        fileLabel ? `“${fileLabel}” ` : '',
        'não começa com a assinatura PK de um .zip.',
        '',
        'Se for um .pdgm.json, use Abrir e escolha o JSON. Se for o projeto, use o .pdgm.zip de Baixar → ZIP.',
      ].join(''),
    };
  }

  let listing;
  try {
    listing = listZipEntries(u8);
  } catch (e) {
    const code = e && e.code;
    if (code === 'ZIP_NO_EOCD') {
      return {
        ok: false,
        code: 'ZIP_NO_EOCD',
        title: 'ZIP corrompido ou incompleto',
        detail: [
          'Não achei o diretório central do ZIP (fim do arquivo).',
          '',
          'Costuma acontecer com download interrompido ou arquivo truncado.',
          'Baixe de novo o .pdgm.zip (Baixar → ZIP no diagramador).',
        ].join('\n'),
      };
    }
    return {
      ok: false,
      code: code || 'ZIP_READ',
      title: 'Não consegui ler o ZIP',
      detail: (e && e.message) || String(e),
    };
  }

  if (!listing.length) {
    return {
      ok: false,
      code: 'ZIP_EMPTY',
      title: 'ZIP vazio',
      detail: 'O arquivo é um ZIP válido, mas não contém nenhum arquivo dentro.',
    };
  }

  const early = diagnoseZipListing(listing, fileLabel);
  if (early) return { ok: false, ...early };

  let files;
  try {
    files = await readZip(u8);
  } catch (e) {
    if (e && e.code === 'ZIP_DEFLATE') {
      const d = diagnoseZipListing(e.listing || listing, fileLabel);
      return { ok: false, ...(d || {
        code: 'ZIP_DEFLATE',
        title: 'ZIP com compressão DEFLATE',
        detail: `Entrada comprimida: “${e.entry || '?'}”. Use o ZIP gerado por Baixar → ZIP (STORE).`,
      }) };
    }
    return {
      ok: false,
      code: 'ZIP_EXTRACT',
      title: 'Falha ao extrair o ZIP',
      detail: (e && e.message) || String(e),
    };
  }

  const docFile = files.find((f) => isDocJsonName(f.name));
  if (!docFile) {
    // listing tinha doc.json mas extract não? path estranho
    return {
      ok: false,
      code: 'NO_DOC_JSON',
      title: 'ZIP sem doc.json legível',
      detail: 'O índice do zip mencionava doc.json, mas não consegui extrair o conteúdo.',
    };
  }

  let envelope;
  try {
    envelope = JSON.parse(new TextDecoder().decode(docFile.data));
  } catch (e) {
    return {
      ok: false,
      code: 'DOC_JSON_PARSE',
      title: 'doc.json inválido',
      detail: [
        'Achei `doc.json`, mas o JSON está corrompido ou truncado.',
        (e && e.message) ? `Parse: ${e.message}` : '',
      ].filter(Boolean).join('\n'),
    };
  }

  const doc = deserializeDoc(envelope);
  if (!doc) {
    return {
      ok: false,
      code: 'DOC_ENVELOPE',
      title: 'Formato de projeto desconhecido',
      detail: [
        'O doc.json não tem o envelope esperado `{ "v": 1, "doc": { … } }`.',
        envelope && typeof envelope === 'object'
          ? `Chaves no arquivo: ${Object.keys(envelope).join(', ') || '(nenhuma)'}.`
          : '',
        '',
        'Abra um .pdgm.zip gerado por este diagramador (Baixar → ZIP).',
      ].filter(Boolean).join('\n'),
    };
  }

  // injectMedia tolera @media faltando e docs antigos sem charts/
  const full = injectMedia(doc, files.filter((f) => f !== docFile));
  return { ok: true, doc: full };
}

// Compat: devolve o doc ou null (sem detalhe). Prefira loadDocZip na UI.
export async function deserializeDocZip(buf) {
  const r = await loadDocZip(buf);
  if (!r.ok) {
    console.warn('[pdgm.zip]', r.code, r.title, r.detail);
    return null;
  }
  return r.doc;
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

  // gráfico e linha do tempo: o spec vira arquivo no zip e volta igual ao abrir
  const chartSpec = { type: 'line', title: 'Preço', labels: ['jan'], series: [{ name: 'btc', data: [1] }] };
  const tlSpec = { layout: 'vertical', title: 'Marcos', events: [{ date: 'Jan/26', text: 'a', icon: 'star' }] };
  const withCharts = { ...original, blocks: [
    { id: 'b4', type: 'image', src: svg, chart: { kind: 'chart', spec: chartSpec } },
    { id: 'b5', type: 'image', src: svg, chart: { kind: 'timeline', spec: tlSpec } },
  ] };
  const cZip = await serializeDocZip(withCharts);
  const cFiles = await readZip(await cZip.arrayBuffer());
  console.assert(cFiles.some((f) => f.name === 'charts/0-chart.json'), 'spec do gráfico sai como arquivo no zip', cFiles.map((f) => f.name).join());
  console.assert(cFiles.some((f) => f.name === 'charts/1-timeline.json'), 'spec da timeline sai como arquivo no zip', cFiles.map((f) => f.name).join());
  const soltoNoZip = JSON.parse(new TextDecoder().decode(cFiles.find((f) => f.name === 'charts/0-chart.json').data));
  console.assert(JSON.stringify(soltoNoZip) === JSON.stringify(chartSpec), 'o .json solto no zip é o spec exato (abre direto no gerador)');
  const cBack = await deserializeDocZip(await cZip.arrayBuffer());
  console.assert(JSON.stringify(cBack.blocks[0].chart) === JSON.stringify({ kind: 'chart', spec: chartSpec }), 'spec do gráfico volta inteiro ao abrir', JSON.stringify(cBack.blocks[0].chart));
  console.assert(JSON.stringify(cBack.blocks[1].chart) === JSON.stringify({ kind: 'timeline', spec: tlSpec }), 'spec da timeline volta inteiro ao abrir', JSON.stringify(cBack.blocks[1].chart));
  console.assert(cBack.blocks[0].src.startsWith('data:image/svg+xml;base64,'), 'a arte do gráfico continua vindo por media/');
  // imagem comum (sem .chart) não pode ganhar campo nenhum
  const semChart = await deserializeDocZip(await (await serializeDocZip(withMedia)).arrayBuffer());
  console.assert(semChart.blocks[2].chart === undefined, 'imagem sem gráfico continua sem b.chart');

  console.log('doc-format: todos os asserts passaram');
}

if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].endsWith('doc-format.js')) demo();
