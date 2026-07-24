# Plano de execução paralela — Diagramador de Relatórios

12 tarefas, 5 trilhas paralelas. O gargalo não é o trabalho, é que **11 das 12 tarefas
editam os mesmos 2 arquivos** (`diagramacao.js`, `diagramacao.html`). A divisão abaixo
é por **região de código**, não por tarefa: duas tarefas que tocam a mesma função vão
para a mesma trilha (sequencial), tarefas em regiões disjuntas rodam em paralelo.

---

## Fase 0 — preparação (solo, ~15 min, bloqueia tudo)

| # | O quê | Por quê |
|---|---|---|
| 0.1 | `git init` + commit baseline | Hoje **não é repo**. 5 agentes num arquivo de 85 KB sem histórico é irreversível. |
| 0.2 | **Tarefa 9** — preto e branco puro no swatch | 2 linhas em `swatch.js`, isolada, e as trilhas **A** e **D** consomem o swatch. |
| 0.3 | Ler e distribuir este documento aos agentes | O contrato de âncoras (§ Regras) é o que evita colisão. |

**Tarefa 9 em detalhe** — `swatch.js:22-24`: adicionar `'#000000'` e `'#FFFFFF'` ao array
`SWATCHES`. `hueOf()` (`swatch.js:25`) já joga cinza/preto/branco pro fim da ordenação
tonal (`d < 0.04 → 1000 + (1-mx)*100`), então preto e branco caem nas pontas sozinhos.
Nenhuma outra mudança.

---

## Fase 1 — 5 trilhas em paralelo

### Trilha A · Texto rico — tarefas 5, 2, 10
**Sequencial dentro da trilha** (as três vivem na mesma barra e no mesmo handler de paste).

- **5** — selecionar texto e aplicar **cor + highlight**
- **2** — **editor de URL** nos blocos de texto
- **10** — colar do **Figma** com formatação

**Possui (ninguém mais edita):**
- `diagramacao.html:539-552` — markup do `#fmtbar`
- `diagramacao.js:1597-1640` — listeners do fmtbar + `updateFmtbar()`
- `diagramacao.js:731-756` — handler de `paste`
- `diagramacao.js:1212-1259` — `inlineHtmlOf()` e `blocksFromHtml()`
- CSS de `.markbtn` / `#fmtbar` no `<head>` do HTML

**Notas de implementação:**
- **5**: `document.execCommand('foreColor')` e `'hiliteColor'` já funcionam em contenteditable
  e disparam `input` → o bloco sincroniza sozinho (mesmo caminho dos `.markbtn` atuais,
  `diagramacao.js:1600`). Ancorar o `openSwatchPop()` de `swatch.js` no botão novo do fmtbar.
  Cuidado: `mousedown` do fmtbar já faz `preventDefault` pra não roubar a seleção — o popover
  do swatch precisa do mesmo tratamento, senão a seleção morre ao abrir.
- **2**: hoje só existe o caminho "colar URL sobre texto selecionado" (`diagramacao.js:737-742`).
  Falta: botão de link no fmtbar, editar/remover link existente. Detectar `<a>` sob o cursor
  em `updateFmtbar()` e trocar a barra pro modo link.
- **10**: o Figma põe `text/html` na área de transferência com `<span style="...">` por run.
  `inlineHtmlOf()` precisa preservar `font-weight`, `font-style` e (depois da tarefa 5) `color`
  / `background-color`, descartando o resto. Hoje `blocksFromHtml()` só olha tags de bloco.

**Aceite:** colar um bloco do Figma preserva negrito/itálico/cor; selecionar texto → aplicar
verde Paradigma + highlight → exportar PDF e a cor sai correta.

---

### Trilha B · Novos blocos — tarefas 7, 6, 1
**Sequencial dentro da trilha** (as três mexem no registro de tipos de bloco).
Ordem: **7 → 6 → 1** (checklist é pequeno e valida o caminho; tabela é o pesado; o menu "/"
só depois que os dois tipos novos existem, pra já listá-los).

- **7** — bloco **Checklist**
- **6** — bloco **Tabela**
- **1** — comando **"/"** no início do bloco pra trocar o tipo (estilo Notion)

**Possui:**
- `diagramacao.js:62-64` — `HEAD_TYPES`, `TEXT_TYPES`, `PH`
- `diagramacao.js:53-60` — `gapBefore()` (espaçamento contextual do tipo novo)
- `diagramacao.js:208-271` — `buildText()`, `buildBlock()`
- `diagramacao.js:1294-1315` — `toMarkdown()`
- `diagramacao.html:481-494` — paleta `#blocktypes`
- Arquivos novos: `bloco-tabela.js`, `bloco-checklist.js`, `slash.js`
- `diagramacao.js:628-673` — handler de `input` (atalhos markdown) — **ver conflito com Trilha E**

**Notas de implementação:**
- **7** (checklist): é um `li` com estado. Reaproveitar `buildText()` inteiro; adicionar
  `'check'` a `TEXT_TYPES`, entrada em `PH`, regra em `gapBefore()` (mesma folga do `li`:
  `LIST_GAP`), case em `toMarkdown()` (`- [ ]` / `- [x]`), e um `<input type=checkbox>`
  não-editável antes do texto. Atalho markdown `[] ` no handler de `input`.
- **6** (tabela): o tipo mais caro. Não editar `paginate()` — `measure()` (`diagramacao.js:198`)
  já mede qualquer elemento pelo `getBoundingClientRect()`, então uma `<table>` real pagina
  sozinha **desde que caiba numa página**. Tabela que estoura `CONTENT_H` (666px) vai pra
  próxima página inteira; quebra de tabela entre páginas fica fora do escopo (documentar).
  Reaproveitar `tabela.js` (`splitRow()` e `num()`) pra colar da planilha — já existe e é testado.
- **1** (menu "/"): o handler de `input` em `diagramacao.js:628` já faz exatamente esse padrão
  pros atalhos markdown (`#`, `>`, `-`, `1.`). O "/" é o mesmo gatilho, com um popover em vez
  de conversão imediata. Reusar `setActiveType()` (`diagramacao.js:1444`) — a troca de tipo já
  está pronta, o menu só escolhe. A lista de tipos sai do mesmo array que alimenta `#blocktypes`.

**Aceite:** `/` no bloco vazio abre menu com todos os tipos incluindo Tabela e Checklist;
setas navegam, Enter aplica, Esc fecha; tabela colada de planilha vira bloco; tudo sai no PDF.

---

### Trilha C · Imagem & Índice — tarefas 3, 4
Duas tarefas pequenas, em regiões totalmente isoladas. Um agente resolve as duas.

- **3** — **recrop** automático da margem branca de imagens
- **4** — **índice não duplica número** quando o título já vem numerado

**Possui:**
- `diagramacao.js:1267-1286` — `addImageFile()`
- `diagramacao.js:380-394` — `buildToc()`
- Arquivo novo: `autocrop.js`

**Notas de implementação:**
- **3**: em `addImageFile()`, entre `img.onload` e a criação do bloco — desenhar num `<canvas>`,
  varrer o `ImageData` procurando o primeiro pixel não-branco em cada borda, recortar e trocar
  `reader.result` pelo `canvas.toDataURL()`. **Usar tolerância, não `=== 255`**: PNG de gráfico
  tem antialiasing e JPEG tem ruído, branco puro exato quase nunca existe (ex.: `>= 250` nos
  três canais, e alpha 0 conta como branco). Atualizar `nw`/`nh` pro tamanho recortado, senão
  `imgHeight()` (`diagramacao.js:224`) calcula a proporção errada.
  Deixar um jeito de desligar (checkbox no painel de imagem) — nem toda imagem quer crop.
- **4**: `buildToc()` monta `num` do zero com o contador `c[0..2]`. Basta detectar prefixo
  numérico no texto do título (`/^\s*\d+([.\-–]\s*\d+)*\s*[.\-–)]?\s*/`) e, se houver, usar o
  número do próprio título em vez do contador — cobrindo `"1 - Tese"`, `"1.2 - Informações"`,
  `"3.2. Sobre"`. Tirar o prefixo do texto exibido (senão vira "1.2 1.2 - Informações").
  **Cuidado**: o contador hierárquico precisa continuar coerente pros títulos *sem* número na
  mesma lista — sincronizar `c[]` com o número lido.

**Aceite:** subir um PNG de gráfico com moldura branca → entra sem margem, proporção correta.
Título "3.2. Sobre" aparece no índice uma vez só, como "3.2 Sobre".

---

### Trilha D · Capa: logo — tarefa 8
Um agente, região grande mas exclusiva.

- **8** — logo da Paradigma no **cabeçalho ou rodapé** da capa (esquerda / centro / direita),
  com escolha de esquema de cor e tamanho — igual ao gerador de gráficos.

**Possui:**
- `diagramacao.js:423-462` — `renderCoverPage()`, `coverColBox()`, `buildCoverItem()`
- `diagramacao.js:1089-1171` — `openCoverPanel()`, `positionCoverPanel()`, `setCoverBg()`
- `diagramacao.js:86-101` — `seedDoc()`, campos `cover` / `back` (schema)
- `diagramacao.js:103-121` — `load()` (migração de config salva)
- `diagramacao.html:415-447` — bloco "Páginas especiais" da sidebar

**Notas de implementação — reaproveitar, não reinventar:**
- `logos.js` exporta `LOGOS = { icone, full, nome }`, cada um `{ label, w, h, inner }` com todo
  fill já normalizado pra `currentColor`. **Já pronto pra tingir.**
- `chart.js:91` tem `logoSvg(logo, box, color, opacity)` — a função que monta o `<svg>` aninhado
  substituindo `currentColor` pela cor escolhida. Copiar o padrão (ou importar).
- `graficos.html:334-355` + `graficos.js:82-107` têm a **UI exata** que a tarefa pede
  (botões `data-logo`, `#wmOpts`, `#wmPos`, `#wmColor` via `openSwatchPop`). Clonar a estrutura.
- Schema sugerido: `cover.logo = { on, kind:'icone'|'full'|'nome', pos:'header'|'footer',
  align:'left'|'center'|'right', color, size }`. `load()` precisa tolerar config antiga sem o campo.
- A capa hoje usa posicionamento absoluto (`COVER_AREA_H`, `diagramacao.js:865`) e os itens têm
  `y` livre e arrastável. O logo **não** é um `coverItem` — é elemento fixo do cabeçalho/rodapé,
  fora do fluxo de arrasto, senão colide com o anti-sobreposição (`coverXOverlap`, `:822`).

**Aceite:** logo aparece na capa e na contracapa, nas 6 combinações (2 posições × 3 alinhamentos),
tinge com qualquer cor do swatch, escala com o controle de tamanho, e sai vetorial no PDF.

---

### Trilha E · Paginação & atalhos — tarefas 12, 11
**Sequencial dentro da trilha** — 12 é pesada, 11 é rápida.

- **12** — representação **visual do quebrador de página**, arrastável entre blocos,
  invisível no PDF
- **11** — **⌘↑ / ⌘↓** move o bloco

**Possui:**
- `diagramacao.js:281-312` — `paginate()`
- `diagramacao.js:317-330` — `assemblePages()`
- `diagramacao.js:345-379` — `pageShell()`, `renderContentPage()`
- `diagramacao.js:1455-1493` — `insertSeparatorButton()`
- `diagramacao.js:1541-1568` — `exportPdf()` (o `<style>` de impressão)
- Listener de teclado **novo e próprio** (não editar o de `diagramacao.js:1653`)

**Notas de implementação:**
- **12**: o tipo `pagebreak` **já existe** e `paginate()` já o consome (`diagramacao.js:288`).
  O que falta é (a) representação visual do fim de página automático — hoje a quebra por
  transbordo é invisível, e (b) arrastar essa marca pra forçar/mover a quebra. O drag de blocos
  já existe (`bhandle` / `bdrag`, `diagramacao.js:812-948`) — reusar `dropTargetAt()` / `applyDrop()`
  em vez de escrever um segundo sistema de arrasto.
  **Invisível no PDF**: `exportPagesHtml()` (`:1534`) renderiza com `editing = false`. Se a marca
  só for construída quando `editing === true`, ela some do PDF de graça — sem CSS de impressão novo.
  Esse é o caminho mais barato; usar `display:none` no `<style>` de impressão é o plano B.
- **11**: `state.doc.blocks.splice()` pra trocar de posição + `render({id, role, offset})` pra
  manter o cursor no bloco movido. `⌘↑/⌘↓` no macOS é "início/fim do documento" no
  contenteditable — precisa de `preventDefault()`.

**Aceite:** vejo onde a página quebra; arrasto a marca e o último bloco da página 2 sobe pra 1;
o PDF não mostra nenhuma marca; ⌘↓ move o bloco em foco e o cursor vai junto.

---

## Fase 2 — integração (solo, depois que as 5 trilhas fecharem)

1. **Paginação com os tipos novos**: tabela e checklist medindo certo em `measure()`, quebrando
   nas páginas certas, com o `gapBefore()` correto.
2. **PDF completo**: exportar um relatório que use *tudo* — capa com logo, índice numerado,
   tabela, checklist, texto colorido, imagem recortada, quebra manual de página.
3. **`toMarkdown()` / `.md`**: os tipos novos precisam sair no export de Markdown.
4. **`localStorage`**: `LS_KEY = 'pdgm-diagramacao-cfg-v1'` — se o schema de `cover` mudou
   (Trilha D), decidir entre migração em `load()` ou bump pra `-v2`.
5. Regressão: undo/redo (`hist`) continua funcionando com os blocos novos.

---

## Regras de coexistência (o contrato)

1. **Só `Edit`, nunca `Write`, em `diagramacao.js` e `diagramacao.html`.** Duas escritas
   completas concorrentes destroem o arquivo; dois `Edit` em âncoras diferentes não.
2. **Não reformatar, não reordenar, não "limpar de passagem".** Diff mínimo, só a região possuída.
3. **Código novo grande vai pra arquivo novo** (`bloco-tabela.js`, `autocrop.js`, `slash.js`) —
   em `diagramacao.js` fica só o `import` e a chamada.
4. **Handlers de teclado**: cada trilha adiciona o **seu próprio** `addEventListener('keydown')`.
   Ninguém edita o listener de outra trilha. (Colisão real entre Trilha B/tarefa 1 e Trilha E/tarefa 11.)
5. **CSS novo vai no fim do `<style>`**, com comentário `/* trilha X */`.
6. **Uma trilha por vez no navegador.** `server.mjs` roda em `:5180` e o preview é único —
   agentes não podem verificar em paralelo. Cada trilha entrega um roteiro de teste manual;
   a verificação no browser acontece por turno, ou toda na Fase 2.
7. **Commit ao fim de cada trilha** (por isso a Fase 0.1). Trilha quebrada = `git checkout` de
   um arquivo, não arqueologia.

---

## Mapa de risco

| Tarefa | Risco | Onde |
|---|---|---|
| 6 tabela | Alto — único tipo de bloco que pode não caber numa página | `measure()` / `paginate()` |
| 12 page break | Alto — mexe no coração do render | `paginate()` / `assemblePages()` |
| 8 logo capa | Médio — schema persistido muda | `seedDoc()` / `load()` / `LS_KEY` |
| 10 paste Figma | Médio — HTML do Figma é imprevisível | `blocksFromHtml()` |
| 1 menu "/" | Médio — concorre com os atalhos markdown já existentes | handler de `input` |
| 3 recrop | Baixo — mas tolerância errada arruína a imagem | `addImageFile()` |
| 5 cor/highlight | Baixo — `execCommand` já resolve | fmtbar |
| 2 URL, 4 índice, 7 checklist, 11 ⌘↕, 9 swatch | Baixo | isoladas |
