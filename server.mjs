/* Servidor local do Gerador de Relatórios.
 *
 * Serve os arquivos estáticos E expõe POST /api/convert, que roda o CLI do
 * Claude Code (sua assinatura, sem chave de API) sobre a imagem enviada e
 * devolve a spec do gráfico. É o "usar o LLM pela UI" sem API.
 *
 *   node --watch server.mjs   # porta 5280 — SEMPRE com --watch (ver abaixo)
 *   node --watch server.mjs 5999
 *
 * Porta 5280, não 5180: a 5180 é a padrão do MCP do Figma e vivia ocupada.
 *
 * ponytail: sem framework — http/fs/child_process bastam pra um servidor local.
 */
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, unlink, rm, stat } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = +process.argv[2] || +process.env.PORT || 5280;
// IA_DIR por env pra o teste automatizado poder apontar pra um tmp: a rota
// grava SEMPRE no mesmo caminho fixo (_ia/input.png), então um teste rodando
// contra a pasta real apaga a imagem da última conversão do usuário — e o
// /api/refine, que relê essa imagem, passa a falhar. Aconteceu.
const IA_DIR = process.env.IA_DIR || join(ROOT, '_ia');

/* Guarda contra o pior bug de todos: o servidor rodando código que não existe
 * mais. Node carrega o módulo UMA vez — editar este arquivo não muda nada num
 * processo já no ar, e o sintoma engana (mensagem de erro de uma versão
 * antiga, "corrigida" há horas, apontando pra causa errada). Aconteceu de
 * verdade: 4 servidores no ar ao mesmo tempo, 3 com código velho, cada um
 * numa porta.
 *
 * O arquivo em disco é a verdade; a memória, não. Se divergirem, as rotas de
 * IA recusam com o motivo exato em vez de rodar a versão velha calada.
 * `node --watch` (launch.json) reinicia sozinho e nem chega aqui — isto é a
 * rede pra quem subiu na mão. */
const SELF = fileURLToPath(import.meta.url);
const BOOT_MTIME = statSync(SELF).mtimeMs;
const staleMsg = () => {
  let disk;
  try { disk = statSync(SELF).mtimeMs; } catch { return null; }   // arquivo sumiu: não é o meu caso de uso
  if (disk <= BOOT_MTIME) return null;
  const hhmm = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `este servidor está rodando código de ${hhmm(BOOT_MTIME)}, mas o server.mjs mudou às ${hhmm(disk)}. `
    + `Reinicie com "node --watch server.mjs" (mate este processo: PID ${process.pid}).`;
};

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ttf': 'font/ttf', '.ico': 'image/x-icon',
};

// ── converte imagem -> spec via CLI ──────────────────────────────────────────
const MODEL_CONVERT = 'sonnet';   // lê a imagem do zero (eixo, ticks, título) — precisa de visão forte
// o ajuste ("o valor de março é 55 mil") PARECE edição de texto, mas não é:
// a extração original pode ter errado, então cada pedido tem que reconferir
// contra a imagem antes de aceitar o pedido do usuário (ou a spec atual) como
// verdade — mesma exigência de leitura visual do convert, mesmo modelo.
const MODEL_REFINE = MODEL_CONVERT;

// Roda o CLI com um prompt. `extraArgs` permite `--resume <id>` pra CONTINUAR a
// mesma sessão (o "chat com a IA da extração"). Sem --no-session-persistence: a
// sessão fica gravada e pode ser retomada (cada conversão gera um id único).
//
// --strict-mcp-config (sem --mcp-config): ZERO servidor MCP carregado. Sem essa
// flag o CLI sobe com TODA a config global do usuário — conectores de conta
// (Notion/Gmail/Calendar/dados financeiros/etc.), plugins com hook de
// SessionStart (claude-mem, ponytail)... nada disso tem a ver com "ler uma
// imagem e devolver JSON", e é exatamente o "daemon herdado segurando o
// stdout" do comentário abaixo: um MCP que não sobe limpo trava o processo
// inteiro. --setting-sources sem 'user': não lê ~/.claude/settings.json (mesmo
// motivo). Isso é a causa raiz do timeout de 3min em pedido simples, não só
// paliativo — sem essas flags o CLI perde a maior parte do tempo conectando
// coisa que a tarefa nunca usa.
//
// --effort: MEDIDO com a timeline de 21 eventos (862×1825), mesmo prompt:
//   effort default (=high) → passou de 5min30 sem terminar (era ISSO que batia no
//                            timeout, não os MCP)
//   effort medium          → 17s a 28s, transcrição exata quando a imagem chega em
//                            resolução legível
// Transcrever texto de imagem não se beneficia de raciocínio profundo, então quem
// chama passa `--effort medium` em extraArgs. Nunca deixe herdar o default: o
// tempo explode e o resultado não melhora.
/* Teto por INATIVIDADE, não por relógio de parede. MEDIDO com stream-json e
 * timestamp por evento: o CLI lia a imagem em ~20s e depois passava MINUTOS
 * mudo — não travado, escrevendo/raciocinando. O teto de wall-clock (2, 3, 4
 * min) matava trabalho legítimo bem no meio, sempre perto do fim, e o usuário
 * via "o CLI travou" numa chamada que ia terminar.
 *
 * O que indica processo morto é PARAR DE DAR SINAL, não demorar — então cada
 * byte no stdout rearma o relógio. Quem cancela de verdade é o usuário:
 * fechar a aba aborta o processo na hora (ver `signal`).
 *
 * O `rate_limit_event` sobe o teto por precaução, mas ATENÇÃO: ele aparece em
 * praticamente toda chamada como aviso (`allowed_warning`) mesmo com a conta
 * em 36% de uso — não é sinal de fila, e culpá-lo pela demora foi um
 * diagnóstico errado que custou horas. A causa real do tempo era `--effort` e
 * o `Read` das instruções (ver a rota /api/convert e o README). */
const IDLE_MS = 240000;          // 4 min sem UM byte = morreu de verdade
const IDLE_QUEUED_MS = 900000;   // 15 min quando a API avisou que estamos na fila

/* Progresso da chamada em andamento, pro cliente perguntar "e aí, tá vivo?".
 * Global sem medo: `cliBusy` garante UMA chamada por vez. O que o usuário vê
 * na tela sai daqui — e o motivo de existir é concreto: uma extração de 12
 * séries passa MINUTOS só escrevendo o JSON, e sem isso a tela fica com um
 * cronômetro subindo que parece travamento. */
let progress = null;   // { fase, chars, desde }
const setProgress = (p) => { progress = p ? { ...progress, ...p } : null; };

function runClaude(prompt, extraArgs = [], model = MODEL_CONVERT, signal, idleMs = IDLE_MS) {
  // stream-json (não json): o resultado vem no ÚLTIMO evento, mas os eventos
  // intermediários são o sinal de vida que alimenta o teto de inatividade — com
  // --output-format json o stdout fica mudo até o fim e não dá pra distinguir
  // "pensando" de "morto".
  // --include-partial-messages: os deltas de texto/raciocínio chegam token a
  // token. É o que permite dizer "escrevendo, 4.200 caracteres" em vez de um
  // contador mudo — numa extração de 12 séries a resposta leva MINUTOS sendo
  // escrita, e sem isso o silêncio é indistinguível de travamento.
  const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--model', model, '--tools', 'Read', '--allowedTools', 'Read',
    '--strict-mcp-config', '--setting-sources', 'project,local', '--disable-slash-commands',
    ...extraArgs];
  // limpa flags de "estou dentro do Claude Code" — senão o CLI recusa rodar
  // aninhado. Só relevante quando o server é iniciado de dentro de uma sessão.
  const env = { ...process.env };
  delete env.CLAUDECODE; delete env.CLAUDE_CODE_ENTRYPOINT; delete env.CLAUDE_CODE_SSE_PORT;
  return new Promise((resolve, reject) => {
    // stdin 'ignore' (=/dev/null): sem isso, claude -p espera EOF de um pipe
    // aberto e trava pra sempre. `signal`: aborta o processo se o CLIENTE
    // desistir (fetch cancelado) — sem isso o CLI ficava rodando órfão até o
    // teto, e um "tenta de novo" empilhava um 2º processo pesado em cima do
    // 1º ainda vivo, piorando cada tentativa seguinte.
    const cp = spawn('claude', args, { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], signal });
    let buf = '', err = '', done = false, resultEv = null, idleT = null;
    let throttled = false, lastByte = Date.now(), stalledMs = 0;
    const finish = (fn, arg) => { if (done) return; done = true; clearTimeout(idleT); fn(arg); };
    const armIdle = () => {
      clearTimeout(idleT);
      const limit = throttled ? IDLE_QUEUED_MS : idleMs;
      idleT = setTimeout(() => {
        cp.kill('SIGKILL');
        finish(reject, new Error(throttled
          ? `a API não respondeu em ${Math.round(limit / 60000)} min na fila do limite de uso da conta — tente daqui a pouco`
          : `o CLI ficou ${Math.round(limit / 60000)} min sem dar sinal de vida (não é fila da API: travou mesmo)`));
      }, limit);
    };
    armIdle();
    cp.stdout.on('data', (d) => {
      // maior SILÊNCIO observado — métrica honesta de "quanto esperamos por
      // fora". Contar do primeiro rate_limit_event até o fim media quase o
      // request inteiro (o evento costuma vir logo no começo) e fazia a UI
      // dizer "3s na fila" num trabalho de 6s, o que não quer dizer nada.
      stalledMs = Math.max(stalledMs, Date.now() - lastByte);
      lastByte = Date.now();
      armIdle();                       // sinal de vida: reinicia o relógio
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        let ev; try { ev = JSON.parse(line); } catch { continue; }   // linha não-JSON: ignora
        // deltas token a token → progresso real na tela
        if (ev.type === 'stream_event') {
          const d = ev.event?.delta;
          if (d?.type === 'text_delta') setProgress({ fase: 'escrevendo', chars: (progress?.chars || 0) + d.text.length });
          else if (d?.type === 'thinking_delta') setProgress({ fase: 'analisando a imagem' });
        }
        if (ev.type === 'user') setProgress({ fase: 'leu a imagem' });
        // a API avisando que a conta está perto/no limite: a espera que pode
        // vir a seguir é externa, então o teto de inatividade passa a ser o
        // generoso (status 'allowed' puro é informativo, não muda nada)
        if (ev.type === 'rate_limit_event' && ev.rate_limit_info?.status !== 'allowed' && !throttled) {
          throttled = true;
          armIdle();
        }
        if (ev.type === 'result') resultEv = { ...ev, _stalledMs: stalledMs, _throttled: throttled };
      }
    });
    cp.stderr.on('data', (d) => (err += d));
    cp.on('error', (e) => finish(reject, e.name === 'AbortError' ? new Error('cancelado') : e));   // claude não encontrado, abort, etc.
    // devolve o envelope do evento `result` já em JSON — mesma forma do
    // --output-format json de antes, então quem chama não muda
    const settle = (code) => finish(
      resultEv ? resolve : reject,
      resultEv ? JSON.stringify(resultEv) : new Error(err.trim() || `claude saiu com código ${code} sem resultado`));
    // 'close' = processo E pipes fecharam (caminho normal). MAS o CLI às vezes
    // deixa um daemon herdado (MCP/plugin) segurando o stdout — aí o 'close'
    // nunca vem e o request penduraria pra sempre. 'exit' + dreno de 400ms
    // cobre isso: processo morreu, usa o que já chegou no pipe.
    cp.on('close', settle);
    cp.on('exit', (code) => setTimeout(() => settle(code), 400));
  });
}
// Instruções INLINE, não "abra ia-instrucoes.md com o Read": o Read custa uma
// volta de API inteira (3 turnos em vez de 2). Mesma decisão já medida na
// timeline. Continua lendo o .md a cada pedido, então editar o guia vale na
// hora, sem reiniciar o server.
const convertPrompt = async (imgPath) => {
  const guia = await readFile(join(ROOT, 'ia-instrucoes.md'), 'utf8');
  return `${guia}\n\n---\n\nImagem a ler: "${imgPath}"\n\n`
    + `Devolva SÓ o JSON minificado da spec, sem texto em volta.`;
};

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

// Só 1 CLI do Claude por vez. Sem isso, um timeout do cliente + "tenta de
// novo" empilhava um 2º processo pesado em cima do 1º (que continuava rodando
// órfão no servidor) — cada retentativa ficava mais lenta que a anterior. Com
// o lock, a 2ª tentativa recebe erro claro na hora em vez de competir por CPU.
let cliBusy = false;

// Grava a imagem recebida e roda o CLI com o prompt de `promptFor(caminhoRel)`.
// `base` separa os arquivos por ferramenta ('input' = gráfico, 'timeline' = linha
// do tempo) — senão uma conversão sobrescreve a imagem que a outra ainda usa no
// /api/refine.
async function handleImage(req, res, base, promptFor, { effort, timeoutMs, raw: rawMode } = {}) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const buf = Buffer.concat(chunks);
  if (!buf.length) return json(res, 400, { error: 'imagem vazia' });
  const stale = staleMsg();
  if (stale) return json(res, 503, { error: stale });
  if (cliBusy) return json(res, 429, { error: 'já tem uma extração rodando — espera terminar' });
  cliBusy = true;   // trava ANTES do await: senão dois pedidos passam pelo if acima
  setProgress(null); setProgress({ fase: 'abrindo a sessão', chars: 0, desde: Date.now() });

  // ?part=1&parts=3 → a imagem é a fatia 1 de 3 da mesma linha do tempo. Uma
  // chamada de CLI POR FATIA (o cliente manda em sequência) porque juntar tudo
  // numa sessão só estoura o teto: MEDIDO com 21 eventos — 1 fatia sozinha 28s,
  // as 2 fatias na mesma sessão passaram de 2 min. Quem junta as listas é o
  // cliente, com regra determinística (mergeEvents), não o modelo.
  const q = new URL(req.url, 'http://x').searchParams;
  const parts = Math.max(1, +q.get('parts') || 1);
  const part = Math.min(parts, Math.max(1, +q.get('part') || 1));
  const ext = (req.headers['content-type'] || '').includes('jpeg') ? '.jpg' : '.png';
  const name = parts > 1 ? `${base}-${part}` : base;
  await mkdir(IA_DIR, { recursive: true });
  await writeFile(join(IA_DIR, name + ext), buf);

  // se o cliente desistir (fetch abortado/aba fechada), mata o CLI na hora em
  // vez de deixar rodando até o teto de 2 min — ver runClaude() pro porquê
  const ctrl = new AbortController();
  res.on('close', () => ctrl.abort());
  try {
    const extra = effort ? ['--effort', effort] : [];
    const raw = await runClaude(await promptFor(`_ia/${name}${ext}`, { part, parts }), extra, MODEL_CONVERT, ctrl.signal, timeoutMs);
    // envelope do --output-format json: { type:'result', result, session_id, ... }
    const env = JSON.parse(raw);
    if (env.is_error) throw new Error(env.result || 'CLI retornou erro');
    // rawMode: a resposta é TEXTO (linhas `data | texto | ícone`), não JSON —
    // quem parseia é o cliente (parseSliceText). Ver ia-timeline.md: aspas dentro
    // do texto quebravam o JSON e derrubavam a transcrição inteira.
    let body;
    if (rawMode) {
      const text = String(env.result ?? '');
      const erro = /^\s*ERRO:\s*(.+)$/im.exec(text);
      if (erro) throw new Error(erro[1].trim());
      body = { text };
    } else {
      const spec = extractJson(env.result ?? raw);
      if (spec.error) throw new Error(spec.error);
      body = { spec };
    }
    // session_id volta pro cliente pra ele CONVERSAR com a mesma sessão depois
    if (!res.writableEnded) json(res, 200, { ...body, sessionId: env.session_id, cost: env.total_cost_usd, ms: env.duration_ms, stalledMs: env._stalledMs });
  } catch (e) {
    if (!res.writableEnded) json(res, 502, { error: String(e.message || e) });
  } finally {
    cliBusy = false; setProgress(null);
  }
}

// Instruções INLINE (lidas do md a cada pedido, então editar o md continua valendo
// na hora, sem reiniciar o server): mandar o CLI abrir ia-timeline.md com o Read
// custa uma volta de API a mais — 3 turnos em vez de 2 — e não melhora nada.
const timelinePrompt = async (imgPath, { part, parts } = {}) => {
  const guia = await readFile(join(ROOT, 'ia-timeline.md'), 'utf8');
  const fatia = parts > 1
    ? `\n\nATENÇÃO: esta imagem é a FATIA ${part} de ${parts} de uma linha do tempo maior — ela mostra `
      + `só um trecho, e fatias vizinhas se sobrepõem. Transcreva os eventos DESTA fatia (inclusive os `
      + `cortados pela borda, com o texto que estiver visível); quem junta as fatias e remove repetição `
      + `é a ferramenta, não você. Título/subtítulo: só se aparecerem aqui.`
    : '';
  return `${guia}\n\n---\n\nImagem a ler: "${imgPath}"${fatia}\n\n`
    + `Devolva SÓ o JSON minificado da spec, sem texto em volta.`;
};

// Corrige um dado ("o valor de março é 55 mil", "remove o ponto de junho") —
// SEMPRE relendo a imagem original, nunca confiando cegamente na spec atual
// (que veio de uma extração automática e pode ter errado) nem no pedido do
// usuário como fato. Chamada nova a cada pedido (sem --resume): contexto
// previsível e do mesmo tamanho não importa quantas correções já rolaram na
// sessão, e a leitura da imagem fica OBRIGATÓRIA (instrução, não memória de
// sessão que o modelo pode decidir pular).
async function handleRefine(req, res) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { return json(res, 400, { error: 'JSON inválido' }); }
  const { sessionId, spec, message } = body;
  if (!sessionId || !message) return json(res, 400, { error: 'faltou sessionId ou message' });
  const stale = staleMsg();
  if (stale) return json(res, 503, { error: stale });
  if (cliBusy) return json(res, 429, { error: 'já tem uma extração rodando — espera terminar' });

  const imgRel = ['_ia/input.png', '_ia/input.jpg'].find((p) => existsSync(join(ROOT, p)));
  if (!imgRel) return json(res, 400, { error: 'imagem original não encontrada — converta de novo' });

  const prompt = `Leia a imagem "${imgRel}" (ferramenta Read) ANTES de responder — sempre, mesmo que o `
    + `pedido pareça simples ou a spec pareça óbvia. A spec abaixo veio de uma extração automática e `
    + `PODE ter erro; não aceite ela nem o pedido do usuário como verdade sem conferir contra a imagem.\n\n`
    + `Spec atual (JSON):\n${JSON.stringify(spec)}\n\n`
    + `Pedido do usuário: ${message}\n\n`
    + `Corrija o que foi pedido E qualquer outro valor/rótulo que você notar que não bate com a imagem `
    + `enquanto estiver conferindo. Devolva SÓ o JSON da spec corrigida, mesmo schema (type, title, `
    + `subtitle, source, labels, series:[{name,data}], y). Mude apenas o necessário e mantenha o resto `
    + `igual. Sem texto fora do JSON.`;
  const ctrl = new AbortController();
  res.on('close', () => ctrl.abort());
  cliBusy = true;
  setProgress(null); setProgress({ fase: 'abrindo a sessão', chars: 0, desde: Date.now() });
  try {
    // mesmo motivo do convert: conferir números contra a imagem é leitura, não
    // raciocínio profundo — o effort default multiplica o tempo sem melhorar
    const raw = await runClaude(prompt, ['--effort', 'low'], MODEL_REFINE, ctrl.signal);
    const env = JSON.parse(raw);
    if (env.is_error) throw new Error(env.result || 'CLI retornou erro');
    const out = extractJson(env.result ?? raw);
    if (out.error) throw new Error(out.error);
    if (!res.writableEnded) json(res, 200, { spec: out, sessionId: env.session_id || sessionId, cost: env.total_cost_usd, ms: env.duration_ms, stalledMs: env._stalledMs });
  } catch (e) {
    if (!res.writableEnded) json(res, 502, { error: String(e.message || e) });
  } finally {
    cliBusy = false; setProgress(null);
  }
}

/* DefiLlama por URL. O gráfico do site é ECharts em <canvas>: o dado mora em
 * PIXEL, não no DOM, então colar o HTML não traz nada — diferente do recharts,
 * que guarda a curva no `d` do <path>. Mas o DefiLlama publica os mesmos
 * números em API aberta, e o próprio embed carrega o slug e as métricas na
 * URL (…/chart/protocol/lighter?openInterest=true). Então: em vez de tentar
 * ler o canvas, lê a fonte — e o dado sai EXATO, não estimado.
 *
 * Métricas separadas em endpoints diferentes (medido: derivatives responde 402,
 * é pago; open-interest e fees são abertos). */
// base trocável só pro self-check apontar pra uma API falsa e rodar offline
const LLAMA_BASE = process.env.LLAMA_BASE || 'https://api.llama.fi';
const LLAMA = {
  tvl: { url: (s) => `${LLAMA_BASE}/protocol/${s}`,
    pontos: (d) => (d.tvl || []).map((p) => [p.date, p.totalLiquidityUSD]), nome: 'TVL' },
  openInterest: { url: (s) => `${LLAMA_BASE}/summary/open-interest/${s}`,
    pontos: (d) => d.totalDataChart || [], nome: 'Open Interest' },
  fees: { url: (s) => `${LLAMA_BASE}/summary/fees/${s}`,
    pontos: (d) => d.totalDataChart || [], nome: 'Fees' },
};
const MAX_PONTOS = 400;   // mesmo teto do import por HTML

async function handleLlama(req, res) {
  const q = new URL(req.url, 'http://x').searchParams;
  const slug = (q.get('slug') || '').trim().toLowerCase();
  if (!/^[\w.-]+$/.test(slug)) return json(res, 400, { error: 'slug inválido' });
  const quer = Object.keys(LLAMA).filter((k) => q.get(k) === '1');
  if (!quer.length) return json(res, 400, { error: 'nenhuma métrica pedida' });

  try {
    const series = [];
    for (const k of quer) {
      const r = await fetch(LLAMA[k].url(slug));
      // uma métrica que o protocolo não tem não derruba as outras: o gráfico
      // do site também some com a linha nesse caso
      if (!r.ok) { if (k === quer[0]) throw new Error(`DefiLlama HTTP ${r.status} em ${k}`); continue; }
      const pts = LLAMA[k].pontos(await r.json()).filter((p) => p && p[1] != null);
      if (pts.length) series.push({ nome: LLAMA[k].nome, pts });
    }
    if (!series.length) throw new Error('a API do DefiLlama não devolveu dado pra esse protocolo');

    /* Alinhamento por DIA. As séries vêm com contagens e horários diferentes
     * (TVL 1243 pontos com hora cheia, open interest 555 à meia-noite): casar
     * por índice misturaria datas diferentes na mesma coluna. O eixo é a união
     * dos dias, e a série que não tem aquele dia fica com null (buraco), que o
     * renderer já sabe desenhar. */
    const dia = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);
    const porDia = series.map((s) => {
      const m = new Map();
      for (const [ts, v] of s.pts) m.set(dia(ts), v);   // último do dia vence
      return m;
    });
    let dias = [...new Set(porDia.flatMap((m) => [...m.keys()]))].sort();
    if (dias.length > MAX_PONTOS) {
      const passo = (dias.length - 1) / (MAX_PONTOS - 1);
      dias = Array.from({ length: MAX_PONTOS }, (_, i) => dias[Math.round(i * passo)]);
    }
    // devolve a data CRUA (ISO): quem sabe se cabe "12/Mar/23" ou só "Mar/23"
    // no eixo é o cliente, que conhece a largura e a fonte do gráfico
    json(res, 200, {
      dias,
      series: series.map((s, i) => ({ name: s.nome, data: dias.map((d) => porDia[i].get(d) ?? null) })),
    });
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
      // o prefixo do dex HIP-3 é minúsculo e a moeda é maiúscula ("xyz:CL").
      // Passar tudo em maiúscula ("XYZ:CL") derruba a API com HTTP 500 —
      // era isso que quebrava TODO mercado HIP-3 aqui.
      const coin = symbol.includes(':')
        ? symbol.replace(/^([^:]+):(.*)$/, (_, dex, c) => `${dex.toLowerCase()}:${c.toUpperCase()}`)
        : symbol.toUpperCase();
      const snap = async (a, b) => {
        const r = await fetch('https://api.hyperliquid.xyz/info', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type: 'candleSnapshot', req: { coin, interval, startTime: a, endTime: b } }),
        });
        if (!r.ok) throw new Error(`Hyperliquid HTTP ${r.status}`);
        return r.json();
      };
      const data = await snap(start, end);
      // vazio pode ser ativo errado OU mercado que parou de negociar (acontece
      // em HIP-3: o oráculo segue publicando preço mas não há mais candle).
      // Uma sondagem larga separa os dois casos e diz o período que existe.
      if (!Array.isArray(data) || !data.length) {
        const wide = await snap(Date.now() - 5 * 365 * 86400e3, Date.now()).catch(() => null);
        if (!Array.isArray(wide) || !wide.length) throw new Error('sem candles — confira o ativo (ex.: HYPE, BTC) e as datas');
        const dia = (ms) => new Date(ms).toISOString().slice(0, 10).split('-').reverse().join('/');
        throw new Error(`sem candles nesse período — ${coin} só tem de ${dia(wide[0].t)} a ${dia(wide.at(-1).t)}`);
      }
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

// Lista de ativos por corretora, pra autocomplete no campo "Ativo" (evita
// erro de digitação). Cache em memória — a lista de pares/moedas quase não
// muda, então "tempo real" aqui é "busca uma vez por sessão do servidor e
// reusa por 5min", não polling de verdade.
const symbolsCache = new Map();   // venue -> { at, list }
const SYMBOLS_TTL = 5 * 60 * 1000;

const hlInfo = async (body) => {
  const r = await fetch('https://api.hyperliquid.xyz/info', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Hyperliquid HTTP ${r.status}`);
  return r.json();
};

async function handleSymbols(req, res) {
  const venue = new URL(req.url, 'http://x').searchParams.get('venue') || 'binance';
  const hit = symbolsCache.get(venue);
  if (hit && Date.now() - hit.at < SYMBOLS_TTL) return json(res, 200, { symbols: hit.list });
  try {
    let list;
    if (venue === 'hyperliquid') {
      // universo principal + TODOS os dexs HIP-3 (builder-deployed). Sem isso o
      // autocomplete não conhece nomes como "xyz:CL" ou "cash:WTI", e o campo
      // aceita um ativo inexistente que só falha lá na frente com HTTP 500.
      const [main, dexs] = await Promise.all([hlInfo({ type: 'meta' }), hlInfo({ type: 'perpDexs' })]);
      const names = (dexs || []).filter(Boolean).map((d) => d.name);
      const unis = await Promise.all(names.map((dex) => hlInfo({ type: 'meta', dex }).catch(() => null)));
      list = [
        ...(main.universe || []).map((u) => u.name),
        ...unis.filter(Boolean).flatMap((u) => (u.universe || []).map((a) => a.name)),
      ];
    } else {
      const r = await fetch('https://api.binance.com/api/v3/exchangeInfo');
      if (!r.ok) throw new Error(`Binance HTTP ${r.status}`);
      const data = await r.json();
      list = (data.symbols || []).filter((s) => s.status === 'TRADING').map((s) => s.symbol);
    }
    symbolsCache.set(venue, { at: Date.now(), list });
    json(res, 200, { symbols: list });
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
        } else if (waited >= 90000) {
          // 90s: PDF Gratuito com dezenas de páginas + imagens embutidas demora mais
          // que o miolo “leve” de 25s; sem isso o client caía no print Quartz (sem links).
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
  // effort low no gráfico: MEDIDO na mesma imagem (stacked100, 12 séries, 16
  // meses) — default >6min40 sem terminar · medium 6min00 · low 2min32, com o
  // mesmo resultado (12 séries, 16 rótulos, título certo). Ler gráfico é
  // transcrição, não análise: o raciocínio profundo só queima tempo. Opus low
  // foi testado e é PIOR aqui (3min45 e US$ 0,38 por leitura).
  if (req.method === 'POST' && req.url === '/api/convert') return handleImage(req, res, 'input', convertPrompt, { effort: 'low' });
  // effort medium na timeline: é transcrição de texto, não análise — ver runClaude()
  // pros números (default/high passou de 5min sem terminar; medium fecha em ~30s)
  // startsWith, não ===: a rota recebe ?part=1&parts=2 (uma chamada por fatia)
  if (req.method === 'POST' && req.url.startsWith('/api/timeline')) return handleImage(req, res, 'timeline', timelinePrompt, { effort: 'medium', timeoutMs: 180000, raw: true });
  if (req.method === 'POST' && req.url === '/api/pdf') return handlePdf(req, res);
  if (req.method === 'POST' && req.url === '/api/refine') return handleRefine(req, res);
  if (req.method === 'GET' && req.url.startsWith('/api/llama')) return handleLlama(req, res);
  if (req.method === 'GET' && req.url.startsWith('/api/candles')) return handleCandles(req, res);
  if (req.method === 'GET' && req.url.startsWith('/api/symbols')) return handleSymbols(req, res);
  // trilha D: o client faz um GET rápido (timeout curto) nessa rota pra decidir se
  // esconde o import de gráfico (que depende de /api/convert + /api/refine, só
  // existem com este server rodando — no GitHub Pages estático não existe).
  if (req.method === 'GET' && req.url === '/api/health') return json(res, 200, { ok: true, pid: process.pid, stale: staleMsg() });
  // "ainda está viva?" — o cliente pergunta enquanto espera, pra mostrar
  // progresso de verdade em vez de um cronômetro mudo
  if (req.method === 'GET' && req.url === '/api/progress') return json(res, 200, { rodando: cliBusy, ...(progress || {}) });
  if (req.method === 'GET') return serveStatic(req, res);
  json(res, 405, { error: 'método' });
}).listen(PORT, () => console.log(`Gerador em http://localhost:${PORT}  (IA via CLI do Claude)`));
