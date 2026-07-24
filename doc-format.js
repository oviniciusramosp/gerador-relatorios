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
 */

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
function demo() {
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

  console.log('doc-format: todos os asserts passaram');
}

if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].endsWith('doc-format.js')) demo();
