/* Numeração do índice (trilha C · tarefa 4).
 *
 * buildToc() (diagramacao.js) montava o número de cada linha do zero, com um
 * contador hierárquico c=[0,0,0]. Problema: se o título JÁ vem numerado
 * ("1 - Tese", "1.2 - Informações", "3.2. Sobre"), o índice mostrava o número
 * duas vezes — o contador + o que já estava no texto.
 *
 * Regra: detecta prefixo numérico no título; se houver, usa o número LIDO e
 * remove o prefixo do texto exibido (senão vira "1.2 1.2 - Informações"); se não,
 * contador hierárquico normal. Em ambos os casos o contador é sincronizado, pra
 * que um título SEM número depois de um numerado continue a sequência certa
 * (depois de "3 - X", o próximo H1 sem número vira 4, não retoma do contador).
 *
 * ponytail: extraído pra cá (e não deixado inline em buildToc) porque buildToc
 * depende de stripHtml/document e não roda em node — aqui a lógica é pura e tem
 * demo() com assert (rode `node toc-num.js`).
 */

// Prefixo numérico + separador opcional no começo do título. Cobre:
//   "1 - Tese"   "1.2 - Informações"   "3.2. Sobre"   "3.2.1) Detalhe"
// ponytail: teto conhecido — "10 coisas" também casa (número solto ≠ seção).
// Título de relatório raramente começa por número que não seja de seção; se um
// dia incomodar, exigir separador de pontuação [.\-–)] e aceitar perder "1 Intro".
const PREFIX_RE = /^\s*(\d+(?:[.\-–]\s*\d+)*)\s*[.\-–)]?\s*/;

// lvl = 1..N (h1..h4); text = título JÁ sem HTML; c = contador MUTÁVEL, um slot por nível
// ([0,0,0,0] pro h1..h4). Retorna { num, text }. `num` sai normalizado com "." como único
// separador; `text` sai sem o prefixo numérico quando ele existia.
// A profundidade sai do tamanho de `c` — hardcodar 3 níveis fazia o h4 cair no contador do h3
// (dois títulos de níveis diferentes disputando o mesmo slot).
export function tocNum(lvl, text, c) {
  const m = PREFIX_RE.exec(text);
  if (m) {
    const parts = m[1].split(/[.\-–]/).map(s => parseInt(s, 10)).filter(n => !Number.isNaN(n));
    // sincroniza o contador com o número lido; níveis mais fundos zeram
    for (let i = 0; i < c.length; i++) c[i] = parts[i] ?? 0;
    return { num: parts.join('.'), text: text.slice(m[0].length) };
  }
  // sem prefixo: contador hierárquico (comportamento original de buildToc)
  c[lvl - 1]++;
  for (let i = lvl; i < c.length; i++) c[i] = 0;   // entrou num nível → os mais fundos reiniciam
  return { num: c.slice(0, lvl).join('.'), text };
}

// self-check: `node toc-num.js` (não roda ao importar no browser — sem `process`)
function demo() {
  const run = (titles) => { const c = [0, 0, 0, 0]; return titles.map(([lvl, t]) => tocNum(lvl, t, c)); };
  const eq = (got, want, msg) => console.assert(JSON.stringify(got) === JSON.stringify(want), msg, JSON.stringify(got));

  // 1) sem número → contador hierárquico (comportamento antigo, intacto)
  eq(run([[1, 'Tese'], [2, 'Contexto'], [2, 'Riscos'], [1, 'Fechamento']]),
    [{ num: '1', text: 'Tese' }, { num: '1.1', text: 'Contexto' }, { num: '1.2', text: 'Riscos' }, { num: '2', text: 'Fechamento' }],
    'sem número');

  // 2) já numerado → usa o número lido, tira o prefixo, normaliza o separador pra "."
  eq(run([[1, '1 - Tese'], [2, '1.2 - Informações'], [2, '3.2. Sobre']]),
    [{ num: '1', text: 'Tese' }, { num: '1.2', text: 'Informações' }, { num: '3.2', text: 'Sobre' }],
    'numerado (inclui "3.2. Sobre")');

  // 3) mistura: numerado sincroniza o contador pros títulos sem número seguintes
  eq(run([[1, '3 - Mercado'], [1, 'Conclusão'], [2, 'Extra']]),
    [{ num: '3', text: 'Mercado' }, { num: '4', text: 'Conclusão' }, { num: '4.1', text: 'Extra' }],
    'mistura sincroniza o contador');

  // 4) h4 tem contador PRÓPRIO (não divide slot com o h3) e volta a zero a cada h3 novo
  eq(run([[1, 'Tese'], [2, 'Contexto'], [3, 'Método'], [4, 'Amostra'], [4, 'Filtro'], [3, 'Limites'], [4, 'Prazo']]),
    [{ num: '1', text: 'Tese' }, { num: '1.1', text: 'Contexto' }, { num: '1.1.1', text: 'Método' },
     { num: '1.1.1.1', text: 'Amostra' }, { num: '1.1.1.2', text: 'Filtro' },
     { num: '1.1.2', text: 'Limites' }, { num: '1.1.2.1', text: 'Prazo' }],
    'h4 com contador próprio');

  // 5) subir de nível zera os mais fundos (h1 novo depois de um h4)
  eq(run([[1, 'A'], [2, 'B'], [3, 'C'], [4, 'D'], [1, 'E'], [2, 'F']]),
    [{ num: '1', text: 'A' }, { num: '1.1', text: 'B' }, { num: '1.1.1', text: 'C' },
     { num: '1.1.1.1', text: 'D' }, { num: '2', text: 'E' }, { num: '2.1', text: 'F' }],
    'h1 novo reinicia os níveis fundos');

  console.log('toc-num: todos os asserts passaram');
}

if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].endsWith('toc-num.js')) demo();
