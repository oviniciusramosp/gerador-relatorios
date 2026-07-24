/* Servidor local do Gerador de Relatórios.
 *
 * Serve os arquivos estáticos E expõe POST /api/convert, que roda o CLI do
 * Claude Code (sua assinatura, sem chave de API) sobre a imagem enviada e
 * devolve a spec do gráfico. É o "usar o LLM pela UI" sem API.
 *
 *   node server.mjs           # porta 5180
 *   node server.mjs 5999      # outra porta
 *
 * ponytail: sem framework — http/fs/child_process bastam pra um servidor local.
 */
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, unlink, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = +process.argv[2] || +process.env.PORT || 5180;
const IA_DIR = join(ROOT, '_ia');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ttf': 'font/ttf', '.ico': 'image/x-icon',
};

// ── converte imagem -> spec via CLI ──────────────────────────────────────────
const MODEL = 'sonnet';   // só lê texto da imagem (ticks, título) — não precisa de mais

// Roda o CLU com um prompt. `extraArgs` permite `--resume <id>` pra CONTINUAR a
// mesma sessão (o "chat com a IA da extração"). Sem --no-session-persistence: a
// sessão fica gravada e pode ser retomada (cada conversão gera um id único).
function runClaude(prompt, extraArgs = []) {
  const args = ['-p', prompt, '--output-format', 'json', '--model', MODEL,
    '--tools', 'Read', '--allowedTools', 'Read', ...extraArgs];
  // limpa flags de "estou dentro do Claude Code" — senão o CLI recusa rodar
  // aninhado. Só relevante quando o server é iniciado de dentro de uma sessão.
  const env = { ...process.env };
  delete env.CLAUDECODE; delete env.CLAUDE_CODE_ENTRYPOINT; delete env.CLAUDE_CODE_SSE_PORT;
  return new Promise((resolve, reject) => {
    // stdin 'ignore' (=/dev/null): sem isso, claude -p espera EOF de um pipe
    // aberto e trava pra sempre.
    const cp = spawn('claude', args, { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '', done = false;
    const finish = (fn, arg) => { if (done) return; done = true; clearTimeout(kill); fn(arg); };
    // teto de 4 min: se o CLI travar, mata o processo e devolve erro (não deixa
    // a requisição — nem o "pensando…" do cliente — pendurada pra sempre)
    const kill = setTimeout(() => { cp.kill('SIGKILL'); finish(reject, new Error('o CLI travou (timeout 4 min)')); }, 240000);
    cp.stdout.on('data', (d) => (out += d));
    cp.stderr.on('data', (d) => (err += d));
    cp.on('error', (e) => finish(reject, e));   // claude não encontrado etc.
    const settle = (code) => finish(code === 0 ? resolve : reject,
      code === 0 ? out : new Error(err || `claude saiu com código ${code}`));
    // 'close' = processo E pipes fecharam (caminho normal). MAS o CLI às vezes
    // deixa um daemon herdado (MCP/plugin) segurando o stdout — aí o 'close'
    // nunca vem e o request penduraria pra sempre. 'exit' + dreno de 400ms
    // cobre isso: processo morreu, usa o que já chegou no pipe.
    cp.on('close', settle);
    cp.on('exit', (code) => setTimeout(() => settle(code), 400));
  });
}
const convertPrompt = (imgPath) =>
  `Leia o arquivo de imagem "${imgPath}" (é um gráfico) e as instruções em `
  + `"ia-instrucoes.md". Devolva SÓ o JSON minificado da spec, sem texto em volta.`;

// tira ```json, pega o primeiro objeto {...} balanceado
function extractJson(text) {
  const start = text.indexOf('{');
  if (start < 0) throw new Error('nenhum JSON na resposta');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; }
    else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error('JSON incompleto na resposta');
}

async function handleConvert(req, res) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const buf = Buffer.concat(chunks);
  if (!buf.length) return json(res, 400, { error: 'imagem vazia' });

  const ext = (req.headers['content-type'] || '').includes('jpeg') ? '.jpg' : '.png';
  const imgPath = join(IA_DIR, 'input' + ext);
  await mkdir(IA_DIR, { recursive: true });
  await writeFile(imgPath, buf);

  try {
    const raw = await runClaude(convertPrompt('_ia/input' + ext));
    // envelope do --output-format json: { type:'result', result, session_id, ... }
    const env = JSON.parse(raw);
    if (env.is_error) throw new Error(env.result || 'CLI retornou erro');
    const spec = extractJson(env.result ?? raw);
    if (spec.error) throw new Error(spec.error);
    // session_id volta pro cliente pra ele CONVERSAR com a mesma sessão depois
    json(res, 200, { spec, sessionId: env.session_id, cost: env.total_cost_usd, ms: env.duration_ms });
  } catch (e) {
    json(res, 502, { error: String(e.message || e) });
  }
}

// Continua a sessão da extração pra corrigir um dado ("o valor de março é 55 mil").
// A IA ainda tem a imagem no contexto, então pode reexaminá-la.
async function handleRefine(req, res) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { return json(res, 400, { error: 'JSON inválido' }); }
  const { sessionId, spec, message } = body;
  if (!sessionId || !message) return json(res, 400, { error: 'faltou sessionId ou message' });

  const prompt = `O usuário quer ajustar o gráfico que você extraiu da imagem desta sessão.\n`
    + `Spec atual (JSON):\n${JSON.stringify(spec)}\n\n`
    + `Pedido: ${message}\n\n`
    + `Reveja a imagem se precisar e devolva SÓ o JSON da spec corrigida, mesmo schema `
    + `(type, title, subtitle, source, labels, series:[{name,data}], y). Mude apenas o `
    + `necessário e mantenha o resto igual. Sem texto fora do JSON.`;
  try {
    const raw = await runClaude(prompt, ['--resume', sessionId]);
    const env = JSON.parse(raw);
    if (env.is_error) throw new Error(env.result || 'CLI retornou erro');
    const out = extractJson(env.result ?? raw);
    if (out.error) throw new Error(out.error);
    json(res, 200, { spec: out, sessionId: env.session_id || sessionId, cost: env.total_cost_usd, ms: env.duration_ms });
  } catch (e) {
    json(res, 502, { error: String(e.message || e) });
  }
}

// Candles por API pública (sem chave): Binance klines ou Hyperliquid info.
// Proxy no server evita CORS e mantém o browser sem rede externa.
async function handleCandles(req, res) {
  const q = new URL(req.url, 'http://x').searchParams;
  const venue = q.get('venue') || 'binance';
  const symbol = (q.get('symbol') || '').trim();
  const interval = q.get('interval') || '1d';
  const start = +q.get('start'), end = +q.get('end');
  if (!symbol || !start || !end) return json(res, 400, { error: 'faltou symbol/start/end' });
  try {
    let rows;   // normaliza pra [{t, o, h, l, c, v}]
    if (venue === 'hyperliquid') {
      const r = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'candleSnapshot', req: { coin: symbol.toUpperCase(), interval, startTime: start, endTime: end } }),
      });
      if (!r.ok) throw new Error(`Hyperliquid HTTP ${r.status}`);
      const data = await r.json();
      if (!Array.isArray(data) || !data.length) throw new Error('sem candles — confira o ativo (ex.: HYPE, BTC) e as datas');
      rows = data.map((k) => ({ t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v }));
    } else {
      const u = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol.toUpperCase())}`
        + `&interval=${encodeURIComponent(interval)}&startTime=${start}&endTime=${end}&limit=1000`;
      const r = await fetch(u);
      if (!r.ok) throw new Error(`Binance HTTP ${r.status} — confira o par (ex.: BTCUSDT)`);
      const data = await r.json();
      if (!Array.isArray(data) || !data.length) throw new Error('sem candles — confira o par (ex.: BTCUSDT) e as datas');
      rows = data.map((k) => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));
    }
    json(res, 200, { rows });
  } catch (e) {
    json(res, 502, { error: String(e.message || e) });
  }
}

const json = (res, code, obj) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
};

// ── PDF via Chrome headless (vetorial, com links e tamanho de página exato) ───
// O cliente manda o HTML auto-contido das páginas; o Chrome imprime em PDF.
// Reusa o Chrome do sistema — sem dependência npm, no espírito do resto do server.
const CHROME = process.env.CHROME_PATH || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(p => { try { return existsSync(p); } catch { return false; } });

async function handlePdf(req, res) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { return json(res, 400, { error: 'JSON inválido' }); }
  if (!body.html) return json(res, 400, { error: 'html vazio' });
  if (!CHROME) return json(res, 501, { error: 'Chrome não encontrado — instale o Chrome ou defina CHROME_PATH' });

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const dir = join(ROOT, '.pdftmp');
  const htmlPath = join(dir, id + '.html');
  const pdfPath = join(dir, id + '.pdf');
  const profile = join(dir, 'p-' + id);
  await mkdir(dir, { recursive: true });
  await writeFile(htmlPath, body.html);
  // O HTML é auto-contido (fonte + imagens embutidas), então o Chrome imprime assim
  // que carrega. flags "compositor/virtual-time" TRAVAM o headless=new (v150), então
  // ficamos no mínimo e detectamos o fim vendo o arquivo PDF estabilizar — o Chrome
  // headless às vezes não encerra sozinho depois de --print-to-pdf.
  const args = [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profile}`, '--no-pdf-header-footer',
    `--print-to-pdf=${pdfPath}`,
    `http://127.0.0.1:${PORT}/.pdftmp/${id}.html`,
  ];
  try {
    const pdf = await new Promise((resolve, reject) => {
      const cp = spawn(CHROME, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '', last = -1, stable = 0, waited = 0;
      cp.on('error', (e) => { clearInterval(iv); reject(e); });
      cp.stderr.on('data', (d) => (err += d));
      const iv = setInterval(async () => {
        waited += 300;
        let sz = 0; try { sz = (await stat(pdfPath)).size; } catch {}
        stable = (sz > 0 && sz === last) ? stable + 1 : 0;
        last = sz;
        if (sz > 0 && stable >= 2) {                    // tamanho estável ~600ms → pronto
          clearInterval(iv); cp.kill('SIGKILL');
          readFile(pdfPath).then(resolve, reject);
        } else if (waited >= 25000) {
          clearInterval(iv); cp.kill('SIGKILL');
          reject(new Error('Chrome não gerou o PDF a tempo' + (err ? ': ' + err.slice(0, 200) : '')));
        }
      }, 300);
    });
    res.writeHead(200, { 'content-type': 'application/pdf', 'content-length': pdf.length });
    res.end(pdf);
  } catch (e) {
    json(res, 502, { error: String(e.message || e) });
  } finally {
    unlink(htmlPath).catch(() => {});
    unlink(pdfPath).catch(() => {});
    rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

// ── estático ─────────────────────────────────────────────────────────────────
async function serveStatic(req, res) {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/') path = '/index.html';
  const full = normalize(join(ROOT, path));
  if (!full.startsWith(ROOT)) return json(res, 403, { error: 'fora da raiz' });  // path traversal
  try {
    const body = await readFile(full);
    res.writeHead(200, { 'content-type': MIME[extname(full)] || 'application/octet-stream' });
    res.end(body);
  } catch { json(res, 404, { error: 'não encontrado' }); }
}

createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/convert') return handleConvert(req, res);
  if (req.method === 'POST' && req.url === '/api/pdf') return handlePdf(req, res);
  if (req.method === 'POST' && req.url === '/api/refine') return handleRefine(req, res);
  if (req.method === 'GET' && req.url.startsWith('/api/candles')) return handleCandles(req, res);
  // trilha D: o client faz um GET rápido (timeout curto) nessa rota pra decidir se
  // esconde o import de gráfico (que depende de /api/convert + /api/refine, só
  // existem com este server rodando — no GitHub Pages estático não existe).
  if (req.method === 'GET' && req.url === '/api/health') return json(res, 200, { ok: true });
  if (req.method === 'GET') return serveStatic(req, res);
  json(res, 405, { error: 'método' });
}).listen(PORT, () => console.log(`Gerador em http://localhost:${PORT}  (IA via CLI do Claude)`));
