/* Self-check da rota de IA contra o bug que mais deu dor de cabeça: matar o CLI
 * que estava só ESPERANDO na fila da API.
 *
 * Roda o server.mjs de verdade, mas com um `claude` FALSO no PATH que reproduz
 * o que foi medido no caso real: responde rápido, avisa rate_limit_event e
 * some por um tempo antes de devolver o resultado. Zero chamada de API, zero
 * custo, ~6s de execução.
 *
 *   node test-ia-fila.mjs
 */
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = 5399;

// CLI falso: os mesmos eventos, na mesma ordem do caso real (ver o comentário
// de runClaude). O silêncio é o ponto do teste — antes, o servidor matava aqui.
const SILENCIO_S = 4;
const fake = `#!/bin/bash
echo '{"type":"system","subtype":"init","session_id":"fake-123"}'
echo '{"type":"rate_limit_event","rate_limit_info":{"status":"allowed_warning","rateLimitType":"seven_day","utilization":0.9}}'
sleep ${SILENCIO_S}
echo '{"type":"result","subtype":"success","is_error":false,"duration_ms":${SILENCIO_S * 1000},"result":"{\\"type\\":\\"bar\\",\\"labels\\":[\\"a\\"],\\"series\\":[{\\"name\\":\\"s\\",\\"data\\":[1]}]}","session_id":"fake-123","total_cost_usd":0}'
`;

const bin = await mkdtemp(join(tmpdir(), 'fakecli-'));
await writeFile(join(bin, 'claude'), fake);
await chmod(join(bin, 'claude'), 0o755);
// IA_DIR próprio: a rota grava sempre em <IA_DIR>/input.png, então apontar pra
// pasta real APAGA a imagem da última conversão do usuário (e quebra o
// /api/refine, que relê essa imagem). Já apaguei uma assim — nunca mais.
const iaDir = await mkdtemp(join(tmpdir(), 'ia-'));

const srv = spawn('node', ['server.mjs', String(PORT)], {
  cwd: ROOT,
  env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, IA_DIR: iaDir },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const morreu = new Promise((_, rej) => srv.on('exit', (c) => rej(new Error(`server saiu (código ${c})`))));
await Promise.race([new Promise((r) => srv.stdout.once('data', r)), morreu]);

const png = Buffer.from('89504e470d0a1a0a', 'hex');   // não precisa ser PNG válido: quem lê é o CLI falso
try {
  const t0 = Date.now();
  const r = await fetch(`http://localhost:${PORT}/api/convert`, {
    method: 'POST', headers: { 'content-type': 'image/png' }, body: png,
  });
  const j = await r.json();
  const levou = (Date.now() - t0) / 1000;

  assert.equal(r.status, 200, `esperava 200, veio ${r.status}: ${JSON.stringify(j)}`);
  // o teste de verdade: sobreviveu ao silêncio em vez de morrer no meio dele
  assert.ok(levou >= SILENCIO_S, `respondeu rápido demais (${levou}s) — o CLI falso nem terminou`);
  assert.deepEqual(j.spec.series[0].data, [1]);
  // o silêncio foi medido e reportado, pra UI separar "espera da API" de "lentidão nossa"
  assert.ok(j.stalledMs >= SILENCIO_S * 1000 - 500, `stalledMs não mediu o silêncio: ${j.stalledMs}`);

  // 2 pedidos ao mesmo tempo: o 2º é recusado na hora, não empilha um CLI em
  // cima do outro (era isso que fazia cada retentativa ficar mais lenta)
  const [a, b] = await Promise.all([
    fetch(`http://localhost:${PORT}/api/convert`, { method: 'POST', headers: { 'content-type': 'image/png' }, body: png }),
    new Promise((r) => setTimeout(r, 300)).then(() =>
      fetch(`http://localhost:${PORT}/api/convert`, { method: 'POST', headers: { 'content-type': 'image/png' }, body: png })),
  ]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 429, 'o 2º pedido simultâneo tinha que ser recusado');

  console.log(`ok — sobreviveu a ${levou.toFixed(1)}s de silêncio, mediu ${(j.stalledMs / 1000).toFixed(1)}s dele, e barrou o pedido concorrente`);
} finally {
  srv.kill('SIGKILL');
}
