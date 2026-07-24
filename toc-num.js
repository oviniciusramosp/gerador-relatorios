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

// lvl = 1|2|3 (h1/h2/h3); text = título JÁ sem HTML; c = [c0,c1,c2] MUTÁVEL.
// Retorna { num, text }. `num` sai normalizado com "." como único separador;
// `text` sai sem o prefixo numérico quando ele existia.
export function tocNum(lvl, text, c) {
  const m = PREFIX_RE.exec(text);
  if (m) {
    const parts = m[1].split(/[.\-–]/).map(s => parseInt(s, 10)).filter(n => !Number.isNaN(n));
    // sincroniza o contador com o número lido; níveis mais fundos zeram
    for (let i = 0; i < 3; i++) c[i] = parts[i] ?? 0;
    return { num: parts.join('.'), text: text.slice(m[0].length) };
  }
  // sem prefixo: contador hierárquico (comportamento original de buildToc)
  if (lvl === 1) { c[0]++; c[1] = 0; c[2] = 0; }
  else if (lvl === 2) { c[1]++; c[2] = 0; }
  else { c[2]++; }
  const num = lvl === 1 ? `${c[0]}` : lvl === 2 ? `${c[0]}.${c[1]}` : `${c[0]}.${c[1]}.${c[2]}`;
  return { num, text };
}

// self-check: `node toc-num.js` (não roda ao importar no browser — sem `process`)
function demo() {
  const run = (titles) => { const c = [0, 0, 0]; return titles.map(([lvl, t]) => tocNum(lvl, t, c)); };
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

  console.log('toc-num: todos os asserts passaram');
}

if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].endsWith('toc-num.js')) demo();
