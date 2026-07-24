/* ZIP mínimo (método STORE, sem compressão) pra empacotar o .pdgm.zip — ver doc-format.js.
 * Sem lib: o JSON já sai enxuto (a graça de extractMedia é tirar o base64 de dentro dele) e
 * imagem (PNG/JPEG) já vem comprimida — DEFLATE não pagaria o código extra. STORE basta, e o
 * resultado abre normalmente em qualquer descompactador (Finder, Explorer, 7-Zip, unzip).
 */

let crcTable;
function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(d = new Date()) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

// entries: [{ name: string, data: Uint8Array }] → Blob de um .zip válido (STORE)
export function makeZip(entries) {
  const { time, date } = dosDateTime();
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = enc.encode(name);
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);   // bit 11: nome do arquivo em UTF-8
    local.setUint16(8, 0, true);        // método 0 = STORE
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, data);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, time, true);
    cd.setUint16(14, date, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), nameBytes);

    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const centralOffset = offset;

  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, entries.length, true);
  eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, centralSize, true);
  eocd.setUint32(16, centralOffset, true);

  return new Blob([...chunks, ...central, new Uint8Array(eocd.buffer)], { type: 'application/zip' });
}

// ArrayBuffer de um .zip → [{ name, data: Uint8Array }]. Só entende STORE (o que
// makeZip acima escreve); um zip DEFLATE de outra ferramenta cai no erro abaixo.
export async function readZip(buf) {
  const bytes = new Uint8Array(buf);
  const dv = new DataView(buf);
  // procura o fim do diretório central nos últimos 64KB (tolera um comentário de
  // zip curto; nosso writer nunca grava um, então normalmente é achado logo de cara)
  const tail = Math.max(0, bytes.length - 65557);
  let eocdAt = -1;
  for (let i = bytes.length - 22; i >= tail; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocdAt = i; break; }
  }
  if (eocdAt < 0) throw new Error('arquivo .zip inválido (fim de diretório central não encontrado)');

  const count = dv.getUint16(eocdAt + 10, true);
  let p = dv.getUint32(eocdAt + 16, true);
  const out = [];
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('arquivo .zip inválido (registro central corrompido)');
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOffset = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    if (method !== 0) throw new Error(`"${name}": método de compressão ${method} não suportado (só STORE)`);

    const lNameLen = dv.getUint16(localOffset + 26, true);
    const lExtraLen = dv.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    out.push({ name, data: bytes.slice(dataStart, dataStart + compSize) });

    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

// self-check: `node zip-lite.js`
async function demo() {
  const enc = new TextEncoder();
  const entries = [
    { name: 'doc.json', data: enc.encode(JSON.stringify({ hello: 'mundo' })) },
    { name: 'media/0.bin', data: new Uint8Array([1, 2, 3, 250, 0, 255]) },
  ];
  const blob = makeZip(entries);
  const back = await readZip(await blob.arrayBuffer());
  console.assert(back.length === 2, 'lê as 2 entradas de volta');
  console.assert(back[0].name === 'doc.json', 'nome do 1º arquivo preservado');
  console.assert(new TextDecoder().decode(back[0].data) === '{"hello":"mundo"}', 'doc.json round-trip OK');
  console.assert(back[1].data.join(',') === '1,2,3,250,0,255', 'bytes binários round-trip OK (incluindo 0x00 e 0xFF)');
  console.log('zip-lite: todos os asserts passaram');
}
if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].endsWith('zip-lite.js')) demo();
