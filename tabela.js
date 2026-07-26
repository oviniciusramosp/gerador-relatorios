/* Tabela colada (planilha) ⇄ spec. Puro, sem DOM — usado pelo editor de
 * gráficos e testado em teste.html. */

import { SERIES_NAMES } from './chart.js';

// Aceita número em pt-BR (1.234,5) e en-US (1,234.5), com R$/US$/%/espaço junto
// e negativo entre parênteses, como sai de planilha.
export function num(raw) {
  let s = String(raw).trim().replace(/[R$US\s%]/gi, '');
  if (!s || s === '-' || s === '—') return null;
  const neg = /^\(.*\)$/.test(s);
  if (neg) s = s.slice(1, -1);
  const c = s.lastIndexOf(','), d = s.lastIndexOf('.');
  if (c >= 0 && d >= 0) {
    // com os dois separadores, o último é sempre o decimal
    s = c > d ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (c >= 0) {
    // só vírgula: decimal — salvo se houver mais de uma (milhar en-US)
    s = s.split(',').length > 2 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (d >= 0) {
    // só ponto: é milhar se houver mais de um, ou se sobrarem exatamente 3
    // dígitos depois dele ("1.240" = mil duzentos e quarenta, em pt-BR).
    // "0.500" escapa da regra: ninguém agrupa milhar começando em zero.
    const p = s.split('.');
    if (p.length > 2 || (/^\d{3}$/.test(p[1]) && p[0] !== '0' && p[0] !== '')) s = p.join('');
  }
  const v = Number(s);
  return Number.isFinite(v) ? (neg ? -v : v) : null;
}

// quebra uma linha respeitando aspas de CSV ("a,b" vira um campo só; "" = aspa)
export function splitRow(line, delim) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// 1ª coluna = rótulos, 1ª linha = nomes das séries. Aceita CSV (vírgula), TSV
// (tab) ou ponto-e-vírgula — detecta pelo cabeçalho. Devolve null se não der.
export function parseTable(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;
  const delim = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const rows = lines.map((l) => splitRow(l, delim));
  const head = rows[0], body = rows.slice(1);
  return {
    labels: body.map((r) => r[0]),
    series: head.slice(1).map((name, k) => ({
      name: name || SERIES_NAMES[k],
      data: body.map((r) => num(r[k + 1])),
    })),
  };
}

// campo CSV: entre aspas se tiver vírgula, aspas ou quebra (aspas duplicadas)
const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
// saída em CSV — formato comum, abre no Excel/Sheets. Números com ponto decimal
// (nossos dados são numéricos), então a vírgula separa colunas sem ambiguidade.
/* Sankey não tem série nem rótulo: o dado são LIGAÇÕES, então a caixa de texto
 * vira "origem,destino,valor" — uma por linha. É o formato mais direto de
 * digitar à mão e o mesmo que sai de qualquer planilha de fluxo. */
export const linksToTable = (sp) => [
  'origem,destino,valor',
  ...(sp.links || []).map((l) => [csvCell(l.from), csvCell(l.to), l.value ?? ''].join(',')),
].join('\n');

// "origem,destino,valor" -> [{from,to,value}]. Ignora cabeçalho e linha torta,
// pra digitação em andamento não apagar o gráfico a cada tecla.
export function parseLinks(texto) {
  const linhas = String(texto).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const links = [];
  for (const linha of linhas) {
    const c = linha.split(/[,;\t]/).map((x) => x.trim().replace(/^"|"$/g, ''));
    if (c.length < 3) continue;
    const v = num(c[2]);
    if (!c[0] || !c[1] || v == null) continue;   // cabeçalho cai aqui, sem alarde
    links.push({ from: c[0], to: c[1], value: v });
  }
  return links;
}

/* Bolhas: "rótulo,valor,ícone,grupo,categoria". Ícone e categoria também são
 * escolhíveis na lista lateral (picker e swatch) — aqui é o caminho de digitar
 * ou colar tudo de uma vez. */
export const bubblesToTable = (sp) => [
  'rótulo,valor,ícone,grupo,categoria',
  ...(sp.bubbles || []).map((b) => [csvCell(b.label), b.value ?? '', b.icon || '', csvCell(b.group || ''), csvCell(b.cat || '')].join(',')),
].join('\n');

export function parseBubbles(texto) {
  const linhas = String(texto).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = [];
  for (const linha of linhas) {
    const c = linha.split(/[,;\t]/).map((x) => x.trim().replace(/^"|"$/g, ''));
    const v = num(c[1]);
    if (!c[0] || v == null) continue;              // cabeçalho e linha torta caem aqui
    out.push({ label: c[0], value: v, icon: c[2] || '', group: c[3] || '', cat: c[4] || '' });
  }
  return out;
}

export const toTable = (sp) => (sp.type === 'bubble' ? bubblesToTable(sp) : sp.type === 'sankey' ? linksToTable(sp) : [
  ['', ...sp.series.map((s) => csvCell(s.name))].join(','),
  ...sp.labels.map((l, i) => [csvCell(l), ...sp.series.map((s) => s.data[i] ?? '')].join(',')),
].join('\n'));
