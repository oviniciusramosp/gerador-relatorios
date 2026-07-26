/* Self-check do import por URL do DefiLlama (node test-llama.mjs).
 *
 * A parte que quebraria calada é o ALINHAMENTO: as métricas vêm de endpoints
 * diferentes, com contagens e horários diferentes (TVL 1243 pontos com hora
 * cheia, open interest 555 à meia-noite). Casar por índice mistura datas na
 * mesma coluna — e o gráfico fica errado sem dar erro nenhum.
 *
 * A API do DefiLlama é falsificada por um servidor local: o teste roda offline,
 * não depende de rede nem de o protocolo continuar existindo lá.
 */
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = 5398, FAKE = 5397;
const DIA = 86400;
const t0 = Date.UTC(2025, 0, 1) / 1000;   // fixo: o teste não pode depender de "hoje"

// TVL diário com hora cheia (como o real), open interest à meia-noite e
// começando DEPOIS — é exatamente o desencontro que o alinhamento tem que tratar
const tvl = Array.from({ length: 6 }, (_, i) => ({ date: t0 + i * DIA + 43200, totalLiquidityUSD: 100 + i }));
const oi = Array.from({ length: 3 }, (_, i) => [t0 + (i + 3) * DIA, 900 + i]);

const fake = createServer((req, res) => {
  const manda = (obj, code = 200) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(obj));
  };
  if (req.url.startsWith('/protocol/')) return manda({ tvl });
  if (req.url.startsWith('/summary/open-interest/')) return manda({ totalDataChart: oi });
  manda({}, 404);   // fees: protocolo sem essa métrica, como acontece de verdade
});
await new Promise((r) => fake.listen(FAKE, r));

const srv = spawn('node', ['server.mjs', String(PORT)], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, LLAMA_BASE: `http://localhost:${FAKE}` },
});
const morreu = new Promise((_, rej) => srv.on('exit', (c) => rej(new Error(`server saiu (${c})`))));
await Promise.race([new Promise((r) => srv.stdout.once('data', r)), morreu]);

try {
  const r = await fetch(`http://localhost:${PORT}/api/llama?slug=teste&tvl=1&openInterest=1`);
  const j = await r.json();
  assert.equal(r.status, 200, `HTTP ${r.status}: ${JSON.stringify(j)}`);

  // eixo = união dos dias, em ordem, sem repetir
  assert.equal(j.dias.length, 6, `esperava 6 dias, veio ${j.dias.length}: ${j.dias}`);
  assert.deepEqual([...j.dias].sort(), j.dias, 'dias fora de ordem');
  assert.equal(new Set(j.dias).size, 6, 'dia repetido no eixo');
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(j.dias[0]), `dia devia vir ISO cru, veio "${j.dias[0]}"`);

  const [T, O] = j.series;
  assert.equal(T.name, 'TVL'); assert.equal(O.name, 'Open Interest');
  // toda série tem o comprimento do eixo — sem isso o renderer desalinha calado
  assert.equal(T.data.length, 6); assert.equal(O.data.length, 6);

  // o TVL cobre tudo; o open interest só existe do 4º dia em diante e os
  // primeiros dias ficam null (buraco), NUNCA deslocados pro começo
  assert.deepEqual(T.data, [100, 101, 102, 103, 104, 105]);
  assert.deepEqual(O.data, [null, null, null, 900, 901, 902],
    'open interest desalinhado — foi casado por índice em vez de por data');

  // métrica que o protocolo não tem não pode derrubar as outras
  const r2 = await fetch(`http://localhost:${PORT}/api/llama?slug=teste&tvl=1&fees=1`);
  const j2 = await r2.json();
  assert.equal(r2.status, 200);
  assert.equal(j2.series.length, 1, 'fees inexistente deveria ser ignorada, não somada');

  // entrada inválida não vira chamada externa
  assert.equal((await fetch(`http://localhost:${PORT}/api/llama?slug=../etc&tvl=1`)).status, 400);
  assert.equal((await fetch(`http://localhost:${PORT}/api/llama?slug=teste`)).status, 400);

  console.log('ok — DefiLlama: séries de endpoints diferentes alinhadas por DATA, buraco vira null, métrica ausente ignorada');
} finally {
  srv.kill('SIGKILL'); fake.close();
}
