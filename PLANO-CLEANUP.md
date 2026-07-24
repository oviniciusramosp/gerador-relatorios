# Plano de execução paralela — Cleanup da interface + GitHub Pages

Executores: **agentes Sonnet** em worktrees isolados (mesma mecânica do `PLANO-PARALELO.md`).
Divisão por **região de código**, não por tema — porque quase tudo toca `diagramacao.html`
e `diagramacao.js`. Duas tarefas na mesma função/bloco → mesma trilha (sequencial); regiões
disjuntas → trilhas paralelas.

## Decisões já tomadas (não reabrir)
- **Salvar/abrir = JSON** (`.pdgm.json`), sem perda: blocos + capa/contracapa + logo + índice +
  resumo + cabeçalho/rodapé + nº 1ª página + posições. Reabre idêntico (estilo export do Notion).
- **Opacidade no swatch = contrato retrocompatível**: o `pick()` devolve `#RRGGBB` quando a
  opacidade é 100% (nada quebra) e `rgba(r,g,b,a)` quando < 100%. Todos os consumidores herdam de
  graça (é só CSS/`fill` de SVG). O logo do gráfico, que **já tem** opacidade própria (`wmOpacity`,
  default centro=0.1), usa um **opt-out** pra não duplicar o controle.
- **PDF no GitHub Pages = `window.print()`**, MAS com barra de fidelidade dura: A4 exato, **sem
  margem branca**, e **links, linhas, imagens e fundos têm que renderizar**. Se não bater com o
  PDF atual (server), não passou. (Chrome do print usa o mesmo motor do `--print-to-pdf`; o risco
  são margens default e "background graphics" — resolvido com `@page{margin:0}` + `print-color-adjust:exact`.)
- **Import de gráfico no Pages = esconder** quando não houver backend (detecta ausência de server).

## Fatos do código (verificados)
- `--mint` = **#29E899** = Paradigma Aqua. Switchers hoje usam `--violet`.
- Switchers existem em **dois arquivos**: `.sw` em `diagramacao.html` (páginas especiais) e
  `.lblswitch` em `graficos.html` (mostrar título/subtítulo/fonte).
- `server.mjs` faz 5 coisas de server: `/api/pdf` (Chrome), `/api/convert` + `/api/refine` (IA
  via CLI do Claude), `/api/candles` (Binance), `/api/gdoc`. **No Pages não existe server.**
- Import de gráfico = `#chartModal` com iframe pro `graficos.html` (que depende de IA/server).
- Persistência: `localStorage` (config) + `IndexedDB` (FileSystemFileHandle) + `state.doc`.
  `seedDoc()`/`load()`/`save()` já serializam quase tudo — o Salvar-JSON deve dumpar `state.doc` inteiro.
- `swatch.js` (`openSwatchPop(anchor, pick, current)`) é usado por **5 consumidores** e por **nenhuma
  outra trilha** — dá pra ter dono próprio. `normHex` é interno ao swatch (consumidores não parseiam
  o hex de volta). Consumidores: cor de texto da capa (`diagramacao.js:1250`), cor do logo da capa
  (`:1721`), cor de texto/highlight do fmtbar (`:1826`), cor do logo do gráfico (`graficos.js:100`),
  cor de série do gráfico (`:186`). O logo do gráfico **já tem** slider de opacidade próprio.
- Estado do índice hoje é **um objeto só**: `index: { on, resumo }` — índice e resumo ligam juntos.
- Não há `.nojekyll` nem workflow. `index.html` é a landing. **`_ia/` começa com `_` → Jekyll ignora** (precisa `.nojekyll`).

---

## Fase 0 — prep (orquestrador, solo, antes de disparar as trilhas)

| # | O quê | Por quê |
|---|---|---|
| 0.1 | `git` commit baseline limpo | rollback por trilha |
| 0.2 | **Tarefa 1** — switchers em Aqua nos DOIS arquivos | 2 linhas de CSS, e as trilhas A/B tocam esses arquivos depois |
| 0.3 | Helper de ícone de logo em `logos.js` | trilhas A e B usam o MESMO helper (senão as duas editam `logos.js`) |

**0.2 — Tarefa 1 (switchers Aqua):**
- `diagramacao.html`: `.sw[aria-checked="true"]` e `.sw[aria-checked="true"]::after` → trocar
  `var(--violet)` por `var(--mint)`.
- `graficos.html`: `.lblswitch[aria-checked="true"]` → idem.
- ponytail: é literalmente trocar o token. Não criar variável nova.

**0.3 — Helper de picker de logo:** em `logos.js`, exportar algo como
`logoPickSvg(kind)` → string `<svg>` compacta do logo (`icone`/`full`/`nome`) usando
`currentColor` e viewBox do próprio `LOGOS[kind]`, dimensionada pra caber no botão do picker.
As trilhas A (diagramação) e B (gráficos) injetam esse SVG dentro de cada botão, herdando a
cor do texto (a mesma do "Nenhum" = `--muted`). Uma fonte só, sem duplicar SVG.

---

## Fase 1 — trilhas em paralelo

### Trilha A · Sidebar "Texto" + Páginas especiais  ⟵ trilha crítica (a maior)
**Owns (exclusivo):**
- `diagramacao.html`: TODO o `<div class="pane" data-pane="documento">` **do início até o fim do
  `<details>` "Páginas especiais"** (hoje ~linhas 459-571). **NÃO** o `<details>` "Cabeçalho & rodapé"
  (é da Trilha E). **NÃO** o `<header>`/`<nav>` (Trilha E).
- `diagramacao.js`: `importGdoc`, listener do `#btnGdoc`, ramo gdoc do `syncNow`; `#btnSample` +
  const `SAMPLE`; `syncSpecialUI`, `specialObj`, handler dos `.sw[data-sw]`; `seedDoc` + `load`
  (split índice/resumo); `assemblePages`/`renderIndexPage` (índice e resumo separados); handlers de
  `data-bg`/`data-rmbg`/`data-bgx`/`data-bgy` (tarefa 2.9).

**Tarefas:**
- **2.1** remover a UI de URL do Google Docs (o `<label>` inteiro, linhas ~466-471) **e** o JS:
  `importGdoc`, listener `#btnGdoc`, e o ramo `kind==='gdoc'` do `syncNow`. (A rota `/api/gdoc` do
  server é removida pela Trilha D — não mexer no `server.mjs`.)
- **2.2** `<summary>Documento</summary>` → **`Texto`**.
- **2.3** remover o `<p class="hint">O documento abre em branco…</p>` (linha ~472).
- **2.4** remover o botão `#btnSample` (linha ~475) **e** o listener + a const `SAMPLE` no JS.
- **2.5** texto do `#btnNew`: "Novo / limpar" → **"Novo Documento"** (só o rótulo; comportamento igual).
- **2.6** quebrar o `<details>` "Páginas especiais" em **três `<details>` irmãos**: **Capa**,
  **Índice + Resumo**, **Contracapa** — cada um com seus próprios controles. Cada `<details>` fecha
  seu `<summary>` + `<div class="body">`.
- **2.9** imagem de fundo (Capa e Contracapa): virar **campo de upload** (não o botão-arquivo atual);
  o "Sem fundo" vira **botão-ícone de lixeira** que só aparece **quando há imagem** (`bg != null`).
  JS: mostrar/esconder o botão conforme `state.doc[kind].bg`.
- **2.10** o texto "O índice é gerado automaticamente…" (linha ~527) vira **tooltip** disparado por
  um **ícone de info** à direita do título "Índice + Resumo". (Reusar o padrão de tooltip do app se
  existir; senão, `title=` nativo ou um popover simples — ver `[[coordination]]`.)
- **2.11** **switchers separados** pra Índice e pra Resumo. Hoje `state.doc.index = { on, resumo }`.
  Novo shape sugerido: `index: { on, resumoOn, resumo }` (ou `resumo: { on, html }` à parte —
  escolher e documentar). Ajustar `seedDoc`, `load` (migração: config antiga sem `resumoOn` → liga
  os dois, como era), `syncSpecialUI`, handler dos switchers, e `assemblePages`/`renderIndexPage`
  pra renderizar índice e resumo de forma independente.
- **3.1 (lado diagramação)** trocar o texto "Ícone/Completo/Nome" dos `.logopick` (Capa e Contracapa)
  pelos SVGs via `logoPickSvg()` (Fase 0.3), cor herdada do texto de "Nenhum". "Nenhum" continua
  texto (ou um ícone de "vazio" — manter texto "Nenhum" é aceitável).

**Aceite:** aba Documento vira "Texto"; sem Google Docs, sem hint, sem Exemplo; "Novo Documento";
Capa/Índice+Resumo/Contracapa em três expandables; índice e resumo com switchers independentes;
tooltip de info no Índice; fundo por upload com lixeira condicional; logos como ícones. Config
antiga no `localStorage` **não quebra**.

---

### Trilha B · Logo em ícones no Gráficos
**Owns:** `graficos.html` (bloco do picker de logo, linhas ~336-339) + `graficos.js` (se precisar
injetar o SVG on-load) + CSS do picker no `graficos.html`.
**Tarefa 3.1 (lado gráficos):** trocar "Ícone/Completo/Nome" pelos SVGs via `logoPickSvg()` (Fase 0.3),
cor do texto de "Nenhum" (`--muted`). Arquivo separado da Trilha A → sem colisão.
**Coordenação com a Trilha F (opacidade):** no campo de cor do logo do gráfico (`wmColor`,
`graficos.js:100`), chamar `openSwatchPop(..., { opacity:false })` — o logo já tem o slider
`wmOpacity` próprio, então o swatch NÃO deve mostrar o dele ali (evita opacidade dobrada).
**Aceite:** picker de logo do gerador de gráficos mostra os ícones dos logos, consistente com a
diagramação; a cor do logo abre o swatch SEM slider de opacidade (o logo usa o `wmOpacity`).

---

### Trilha C · Salvar/Abrir como JSON
**Owns:** `diagramacao.js` região de export/import — `toMarkdown`/`downloadMd`, `setBlocks`,
`pickFile`, `parseMarkdown` (caminho de import), o handler de **click** do `#btnMd` (o **rótulo** é
da Trilha E). Arquivo novo: `doc-format.js`.
**Tarefa 3.2:**
- `doc-format.js`: `serializeDoc(state.doc) → objeto JSON` e `deserializeDoc(json) → doc`
  (genérico: dumpa/reconstrói `state.doc` inteiro — blocos + cover + back + index + resumo +
  headText/footText/firstPage). Versão no arquivo (`{ v:1, ... }`) pra evolução.
- **"Salvar"**: baixa `<nome>.pdgm.json`. Ligar ao `#btnMd` (id mantido; rótulo "Salvar" vem da Trilha E).
- **Abrir**: no import (`#btnFile`/`pickFile`), **detectar extensão**: `.pdgm.json` → `deserializeDoc`
  + aplicar via `setBlocks`/estado; `.md`/`.txt` → caminho atual (`parseMarkdown`). Reusar a
  normalização do `load()` (migração) ao aplicar o JSON, pra não divergir.
- Não apagar `parseMarkdown` (import de .md/.txt continua). `toMarkdown` pode ficar (ou virar interno).
**Coordenação:** serialize o `state.doc` **genericamente** → sobrevive ao novo shape de índice/resumo
da Trilha A sem acoplamento. NÃO tocar `#btnMd`/`#btnPrint` no HTML (Trilha E faz os rótulos).
**Aceite:** "Salvar" gera `.pdgm.json`; reabrir esse arquivo restaura o documento inteiro (blocos +
todas as configs) e o usuário continua editando; importar `.md`/`.txt` continua funcionando.

---

### Trilha D · GitHub Pages (estático) + PDF via print + gate do gráfico
**Owns:** `server.mjs`; `diagramacao.js` `exportPdf` (→ `window.print`), gating do `#chartModal`/menu
de gráfico; o handler de **click** do `#btnPrint` (rótulo é da Trilha E); `@media print` em
`diagramacao.html`; arquivos novos de deploy (`.nojekyll`, README, workflow opcional).
**Tarefas:**
- **PDF via `window.print()`** (substitui o POST `/api/pdf`): montar o mesmo HTML auto-contido de
  `exportPagesHtml()` num container/iframe/nova janela e chamar `print()`. **Barra de fidelidade
  (dura):** `@page { size: A4; margin: 0 }`, `-webkit-print-color-adjust: exact; print-color-adjust: exact`
  nos elementos impressos, esconder todo o chrome do app, aplicar o mesmo zoom A4 (hoje `zoom:1.3333`).
  **Verificar visualmente contra o PDF atual do server** (rodar local ainda tem `/api/pdf` de
  referência): tamanho A4 igual, sem margem branca, links clicáveis, linhas (divisor/bordas de
  tabela/réguas) e imagens/fundos renderizando. Se não bater, ajustar até bater.
- **Gate do import de gráfico:** detectar ausência de backend (ex.: `fetch('/api/health')` falhou, ou
  `location.protocol === 'file:'`/host `github.io`) → esconder/desabilitar o botão de "Gráfico" e o
  `#chartModal`. Todo o resto (texto, blocos, capa, imagem, tabela, PDF) funciona no Pages.
- **`server.mjs` opcional:** o app não pode depender do server pra abrir/editar/exportar. Manter o
  server pra uso local (gráfico/IA), mas o Pages serve só os estáticos. Remover a rota `/api/gdoc`
  (a UI já saiu na Trilha A).
- **Deploy estático:** adicionar **`.nojekyll`** (senão `_ia/` sistema de underscore some no Pages),
  um **README** com o passo-a-passo (push do repo `gerador-relatorios` → Settings → Pages → branch
  `main` root), e opcionalmente um workflow `.github/workflows/pages.yml`. Conferir que **nenhum
  fetch absoluto `/api/...` roda no load** (só sob demanda, e gated).
**Aceite:** abrindo `diagramacao.html` de um host estático (sem node), dá pra criar um relatório
completo e exportar PDF pelo "Salvar como PDF" do navegador com a MESMA qualidade do PDF do server;
o import de gráfico some (não aparece quebrado); o app carrega sem erro de console por falta de server.

---

### Trilha E · Chrome global: header/rodapé (sidebar) + menu superior + zoom
**Owns (exclusivo):** `diagramacao.html` o `<details>` "Cabeçalho & rodapé" (hoje ~573-596) **e** o
`<header>`/`<nav>` inteiro. `diagramacao.js`: `applyZoom` + listener do `#zoom`.
**Tarefas:**
- **2.7** reordenar os campos do "Cabeçalho & rodapé" pra ordem do arquivo: **Texto do Cabeçalho →
  Nº da 1ª Página → Texto do Rodapé**.
- **2.8** **tirar o Zoom da sidebar** (removê-lo desse `<details>`) e **colocá-lo no `<nav>` superior**;
  reconectar o listener de `#zoom` (id mantido; agora vive no header). Um `#zoom` só no DOM.
- **Rótulos dos botões do header** (markup — dono único do header): `#btnMd` → texto **"Salvar"**
  (comportamento é da Trilha C); `#btnPrint` mantém "Baixar PDF" (comportamento é da Trilha D);
  **IDs `btnMd` e `btnPrint` NÃO mudam** (as trilhas C/D religam por id).
**Coordenação:** a Trilha E é a **dona única do `<header>` e do bloco Cabeçalho&rodapé** → C e D
tocam só o JS (religam por id), nunca o markup do header. Assim o `<nav>` tem um dono só.
**Aceite:** Zoom no menu superior funcionando; sidebar sem Zoom; campos do rodapé na ordem pedida;
"Salvar" e "Baixar PDF" no topo.

---

### Trilha F · Opacidade no color swatch
**Owns (exclusivo):** `swatch.js` inteiro. Nenhuma outra trilha toca esse arquivo → merge limpo.
**Tarefa (ponto novo):** adicionar um **controle de opacidade** (slider 0–100%) ao popover do swatch.
- **Contrato retrocompatível:** `pick()` devolve `#RRGGBB` quando opacidade = 100% (comportamento
  atual, nada quebra) e `rgba(r,g,b,a)` quando < 100%. Assim os 5 consumidores continuam funcionando
  sem alteração (todos aplicam a cor como CSS `color`/`background` ou `fill` de SVG, que aceitam rgba).
- **`current` aceita rgba:** ao abrir com uma cor que já tem alpha, o slider reflete a opacidade e a
  seleção destaca o matiz certo (parsear rgba → hex + alpha internamente; `normHex` continua só pro hex).
- **Preview + campo HEX:** o preview mostra a cor COM a opacidade (sobre um fundo xadrez/checker pra
  transparência ficar visível). O campo HEX pode seguir 6 dígitos; a opacidade é o slider separado.
- **Opt-out:** aceitar um 4º arg opcional `openSwatchPop(anchor, pick, current, { opacity:false })`
  pra ESCONDER o slider onde já existe opacidade própria (o logo do gráfico — ver Trilha B). Sem o
  arg, o slider aparece (default = com opacidade).
**Tarefa extra (tamanho dos chips):** os quadrados de **cores complementares** (`.sp-chip`) hoje são
`width:100%` (esticam na grade) — devem ficar do **mesmo tamanho** dos quadrados de cores nomeadas e
do preview HEX (`.sp-swatch` = `1.15rem`). Ajustar `.sp-chip` pra `1.15rem × 1.15rem` (sem
`aspect-ratio:1` esticando) e a grade `.sp-grid` pra não esticar (ex.: `grid-template-columns:
repeat(6, 1.15rem)` ou flex-wrap), mantendo o alinhamento.
**Coordenação:** contrato acima é a fonte da verdade; a Trilha B chama com `{opacity:false}` no campo
de cor do logo do gráfico. Arquivos diferentes (`swatch.js` × `graficos.js`) → sem conflito de merge.
Deixar UM autoteste node (parse rgba↔hex + "100% → hex6, <100% → rgba").
**Aceite:** o popover de cor tem slider de opacidade em todos os lugares (cor de texto, highlight,
cor de série, cores de capa); cor 100% sai como hex (igual antes); cor com opacidade sai/rende como
rgba (texto, highlight, séries, fundos e SVG). No logo do gráfico o slider do swatch some (usa o
próprio). Chips complementares do mesmo tamanho dos nomeados/HEX.

---

### Trilha G · Blocos & paste (aba Conteúdo)
**Owns (exclusivo):** a paleta `#blocktypes` (`diagramacao.html`, aba Conteúdo) + a lógica de
criação/inserção de bloco no `diagramacao.js` (`setActiveType`, `insertSeparatorButton`,
`addImageViaPalette`, o handler de click de `#blocktypes`, e o `onPick` do menu "/" em `slash.js`) +
a construção dos blocos (`buildBlock`/`buildText`, checklist) + o pipeline de **paste**
(`inlineHtmlOf`, `blocksFromHtml`, `paste-style.js`) + os cases de bloco do `toMarkdown`.
**NÃO** toca: sidebar/documento (A), header (E), export JSON/`doc-format` (C), server/print (D), swatch (F).

**Tarefas:**
- **Bloco Callout** (novo, estilo Notion): tipo `callout` = caixa arredondada com fundo levemente
  tingido + ícone (emoji, default 💡, editável) + texto editável. Reusar o padrão de envelope do
  checklist (`buildText`): `div.callout` com `.co-icon` (emoji, `contentEditable` de 1 char) + `.co-txt`
  (texto). Registrar em `TEXT_TYPES`/`PH`, `gapBefore` (folga de bloco normal), case no `toMarkdown`
  (ex.: `> 💡 texto`), botão na paleta `#blocktypes` e (opcional) no `#fmtbar`, CSS no fim do `<style>`
  com `/* trilha G */`. **Precisa renderizar no PDF** → o fundo tingido usa `print-color-adjust: exact`.
  ponytail: v1 com uma cor de tinta fixa e emoji editável; seletor de cor do callout = futuro.
- **Re-adicionar "Citação" (Quote) na paleta** (bug): o tipo `quote` existe e está no `#fmtbar`
  (`data-t="quote"`), mas **sumiu da paleta `#blocktypes`** — regressão introduzida quando
  Checklist/Tabela foram adicionados (o botão de Citação foi removido junto por engano). Re-inserir
  o botão `data-type="quote"` na paleta (ícone ❝, `sc` `>`), na posição lógica (perto das listas).
- **Inserção pela paleta (bug de conversão):** ao clicar em **Imagem, Tabela, Divisor ou Quebra de
  Página** com um parágrafo/título selecionado, **NÃO converter** o bloco atual — **inserir o novo
  bloco DEPOIS do selecionado e dar foco nele**. Hoje `Tabela` cai no `setActiveType()` que CONVERTE
  o bloco de texto (perde o conteúdo) — esse é o bug. Fazer um caminho `inserirBlocoDepois(tipo)`
  pros tipos estruturais (image/table/divider/pagebreak): cria o bloco, `splice` após
  `idxOf(activeId)`, e foca (tabela → 1ª célula; image → painel de imagem; divider/pagebreak → foca
  o bloco seguinte, criando um parágrafo vazio se preciso). Aplicar a MESMA correção no `onPick` do
  menu "/" (`slash.js`), que hoje também usa `setActiveType` pra tabela.
- **Bug do Checklist (3 partes):**
  1. **Sem strikethrough** no texto marcado: remover `text-decoration: line-through` de
     `.check.b.checked .ck-txt` (`diagramacao.html:435`). (Manter o texto legível; sem risco no dim.)
  2. **Ícone vazio não pode ser preto:** trocar o `<input type=checkbox>` nativo por uma caixa
     custom — **retângulo cinza, borda cinza, fundo transparente** (arredondado). O nativo renderiza
     preto e não imprime confiável.
  3. **Ícone preenchido = mesmo tamanho do vazio + renderiza no PDF:** a caixa custom (SVG ou span
     estilizado) tem o MESMO box nos dois estados; marcado = preenchido (Aqua `--mint` ou cinza) com
     check. Precisa imprimir → `print-color-adjust: exact` (ou SVG com `fill`/`stroke`, que imprime).
     Trocar no envelope do checklist em `buildText` (o clique togla `b.checked`) + CSS.
     **Coordenar com a Trilha D:** a verificação do PDF por `window.print` inclui conferir que o
     checkbox (vazio e marcado) renderiza igual à tela.
- **Paste do Figma perdendo hiperlinks (bug):** `inlineHtmlOf` (`diagramacao.js`) preserva
  negrito/itálico/cor mas **não trata `<a>`** — o texto do link sobrevive, o `href` some. Adicionar:
  se `tag === 'a'` e houver `href`, envolver o `inner` em `<a href="…">` (normalizar protocolo como
  o resto do app). Assim links copiados do Figma/Docs sobrevivem ao paste.

**Aceite:** "Citação" (Quote) volta a aparecer na paleta; Callout aparece na paleta e rende na tela e no PDF; clicar em Imagem/Tabela/Divisor/Quebra
com texto selecionado INSERE depois (não converte) e foca o novo; checklist sem strikethrough, com
caixa cinza custom (vazio/marcado do mesmo tamanho) que imprime no PDF; colar do Figma mantém os links.

---

### Trilha H · Popovers (painel de Imagem + painel de Texto da capa)
**Owns (exclusivo):** `openImgPanel`, `openCoverPanel`, `columnField` (`diagramacao.js`) + o CSS dos
popovers no `diagramacao.html` (`#imgPanel`/`#coverPanel`, `.placebtns`, `.eyebrow`, e regras
**escopadas** `#imgPanel .field`/`#coverPanel .field`). **NÃO** toca: `label.field` global em
`paradigma.css` (afeta sidebar A e gráficos), sidebar (A), blocos/paleta (G).
**Escopo:** "popovers como o de IMAGEM" → aplicar as mesmas convenções também ao painel de Texto da
capa (`#coverPanel`), que tem estrutura idêntica.

**Tarefas (do popover):**
1. **Botões "Título"/"Legenda" com o estilo dos botões de posição** (`.placebtns`: ícone + label,
   com hover/`.on`). O **"+"/"−" vira ÍCONE** (SVG de mais/menos), **não** texto na label. Estado:
   sem título/legenda → ícone "+"; com → ícone "−" (remover). Trocar o markup `.row` desses dois
   botões em `openImgPanel` pelo padrão `.placebtns`.
2. **Rótulo "Posição" com o mesmo estilo de "Cantos"** (e "Coluna" no coverPanel). Root cause:
   `paradigma.css` só estiliza `label.field`; "Posição" é `div.field` → não casa. **Fix escopado**:
   `#imgPanel .field, #coverPanel .field { display:grid; gap:.3rem; font-size:.74rem; font-stretch:85%;
   color:var(--muted); }` (ou trocar o markup pra `label`/classe própria). **Não** alterar
   `label.field` global.
3. **Valor em px à extrema direita do rótulo** do slider: no label de "Cantos (raio)" (e "Tamanho"
   no coverPanel), pôr `display:flex; justify-content:space-between; align-items:baseline` pra jogar
   o `<span data-role="radv">4px</span>` pra direita.
4. **Mini-botão de reset (ícone)** à direita do valor px, que reseta o raio ao **default (4)**
   (no coverPanel, reset análogo pro Tamanho). Ícone discreto (ex.: ↺); ao clicar, seta o valor,
   atualiza o preview e o texto, e `save()`.

**Coordenação:** a Trilha G reusa `openImgPanel()` (API inalterada) ao inserir imagem — H muda só o
INTERIOR do painel, mantém a função chamável. Regras de CSS escopadas → não colidem com A/graficos.
**Aceite:** Título/Legenda com ícone +/− e visual dos botões de posição; "Posição"/"Coluna" no mesmo
estilo muted dos outros rótulos; valor px à direita com botão de reset funcional; coverPanel idem.

---

## Fase 2 — integração (orquestrador, serial, depois das trilhas)
1. Merge em ordem de menor conflito: **F → B → H → G → E → C → D → A** (F/B isolados; H/G/E/C/D tocam
   funções distintas do `diagramacao.js`; A é a maior — sidebar inteira — por último sobre base estável).
2. Zonas de conflito previsíveis (resolver mantendo os dois lados): imports no topo do JS, fim do
   `<style>`, fim do JS (listeners), e o **`<header>`** (dono E, mas C/D religam por id no JS — não
   deve colidir no markup).
3. **Verificação no browser (serial, só o orquestrador):**
   - Carrega sem erro de console; switchers Aqua nos dois apps.
   - Aba "Texto", três expandables de página especial, índice/resumo independentes, tooltip, fundo
     com lixeira condicional, logos em ícones.
   - Zoom no topo; "Salvar" gera `.pdgm.json` e reabrir restaura tudo; `.md` ainda importa.
   - Swatch com slider de opacidade em todo lugar; 100% → hex (igual antes); <100% → rgba rende em
     texto/highlight/série/fundo/SVG; logo do gráfico SEM slider duplicado.
   - **PDF por print** batendo com o do server (A4, sem margem, links/linhas/imagens/fundos).
   - Simular ambiente "sem server" (ex.: abrir via `file://` ou host estático) → gráfico some, resto funciona.
4. `node --check` em todos os `.js`; rodar os testes puros (`doc-format` deve ganhar um autoteste node).

## Regras de coexistência (o contrato — igual ao plano anterior)
1. **Só `Edit`, nunca `Write`**, em `diagramacao.html`, `diagramacao.js`, `graficos.html`, `logos.js`.
2. **Não reformatar/reordenar de passagem.** Diff mínimo, só a região possuída.
3. **Código novo grande → arquivo novo** (`doc-format.js`). No `diagramacao.js`, só import + chamada.
4. **IDs estáveis**: `btnMd`, `btnPrint`, `zoom`, `btnNew`, `btnFile` não mudam de id.
5. **Dono único por região**: sidebar Texto+Especiais = A; header/rodapé+nav+zoom = E; gráficos = B;
   export/import JSON = C; server/Pages/print = D; `swatch.js` = F; blocos+paleta+paste (aba Conteúdo)
   = G; popovers imagem/capa = H. Ninguém invade a região do outro. **CSS compartilhado (`.field`,
   `.checkrow`, `paradigma.css`) só com regra ESCOPADA** — nunca alterar o seletor global.
6. **CSS novo no fim do `<style>`**, com comentário `/* trilha X */`.
7. **Listeners de teclado/novos**: cada trilha adiciona o SEU; não editar os dos outros.
8. **Rodar como Sonnet**, worktree isolado, `git diff <BASELINE> HEAD > scratchpad/trilha-<X>.patch`,
   `node --check` antes de commitar, e report com região tocada + roteiro de teste manual.

## Mapa de risco
| Tarefa | Risco | Onde |
|---|---|---|
| 3.3 PDF por print | **Alto** — tem que bater pixel/tamanho com o PDF do server | `exportPdf` + `@media print`/`@page` |
| 2.11 split índice/resumo | Médio — muda shape persistido + render | `seedDoc`/`load`/`assemblePages` |
| 3.2 salvar/abrir JSON | Médio — precisa capturar TUDO sem perda | `doc-format.js` + import |
| 2.6 três expandables | Médio — cirurgia grande no markup da sidebar | `data-pane="documento"` |
| 3.3 gate do gráfico | Médio — detectar "sem server" de forma confiável | `#chartModal` / fetch health |
| checklist checkbox no PDF | **Médio** — nativo não imprime; caixa custom tem que renderizar no print | `buildText` + CSS + cruza com D (print) |
| Callout no PDF | Médio — fundo tingido precisa de `print-color-adjust:exact` | `buildBlock`/CSS (G) + cruza com D |
| inserção pela paleta | Médio — não converter; inserir depois + focar (paleta E menu "/") | `setActiveType`/handler/`slash.js` (G) |
| paste do Figma (links) | Médio — `inlineHtmlOf` não trata `<a>` | `inlineHtmlOf` (G) |
| popovers `.field` escopado | Médio — `.field` é compartilhado; NÃO tocar o global | `#imgPanel .field` (H) |
| 3.1 logos em ícone | Baixo — helper compartilhado (Fase 0.3) | `logos.js` + 2 HTML |
| opacidade + chips no swatch | Baixo — arquivo isolado, contrato retrocompatível | `swatch.js` (Trilha F) + opt-out na B |
| Título/Legenda/reset (popover) | Baixo | `openImgPanel`/`openCoverPanel` (H) |
| 2.1/2.3/2.4/2.5/2.7/2.8/2.9/2.10 | Baixo | isoladas nas regiões dos donos |
| 1 switchers Aqua | Baixo (Fase 0) | 2 tokens de CSS |
