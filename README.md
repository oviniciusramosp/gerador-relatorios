# Gerador de Relatórios — Paradigma

Ferramenta web local pra produzir PDF com a estética da casa. Sem build, sem
dependência externa: HTML + módulos ES + um servidor Node de ~90 linhas.

```bash
node --watch gerador-relatorios/server.mjs        # porta 5280
```

Depois abra <http://localhost:5280>. Precisa ser `http://`, não `file://` — a
fonte, o export PNG e o **Converter com IA** dependem de `fetch` de mesma origem.

> **Sempre com `--watch`.** Sem ele, o Node segue rodando o código carregado no
> boot: você corrige o `server.mjs`, o processo antigo continua no ar e a tela
> mostra o erro de uma versão que não existe mais no disco. Se subir sem
> `--watch`, o próprio servidor detecta que ficou velho e recusa as rotas de IA
> dizendo o PID pra matar (em vez de rodar código morto calado).
>
> **Um servidor só, na 5280.** A 5180 é a porta padrão do MCP do Figma — por
> isso a troca. Antes de subir, confira que não há outro no ar:
> `pkill -f server.mjs`.

> Só pra ver os gráficos, sem a IA, qualquer estático serve
> (`python3 -m http.server 5280 --directory gerador-relatorios`). O botão
> **Converter com IA** só funciona com o `server.mjs`, que roda o CLI do Claude.

## UI compartilhada (anti-retrabalho)

Tokens, shells e componentes de interface vivem em:

| Recurso | Path |
|---|---|
| Contrato (LLM + humanos) | [`UI.md`](UI.md) |
| Registry machine-readable | [`ui/registry.js`](ui/registry.js) |
| Catálogo vivo (storybook estático) | [`ui/catalog.html`](ui/catalog.html) |
| CSS / tokens | [`paradigma.css`](paradigma.css) |

**Regra:** antes de criar UI, consulte o registry. Status `ready` → importar.
Não reimplementar. Detalhes em `UI.md` e `AGENTS.md`.

## Deploy no GitHub Pages

O app é **100% estático** — HTML + módulos ES, sem build. O `server.mjs` é
**opcional**: só serve pra rodar local e ganhar o import de gráfico com IA
(`/api/convert`, `/api/refine`) e o PDF pelo Chrome headless do server
(`/api/pdf`, mantido como referência — o fluxo principal do botão **Baixar
PDF** agora usa o `window.print()` do próprio navegador, sem depender de
servidor nenhum; ver `printPdf()` em `diagramacao.js`).

**Passo a passo:**
1. Push do repo `gerador-relatorios` pro GitHub.
2. No repo: **Settings → Pages**.
3. **Source: Deploy from a branch** → branch `main`, pasta **/ (root)** → Save.
4. A URL fica em `https://<usuário-ou-org>.github.io/<repo>/` (leva uns
   minutos pra propagar na primeira vez; cada push depois já republica
   sozinho, sem passo manual extra).

Esse modo ("Deploy from a branch") já redeploya a cada push — não criei
`.github/workflows/pages.yml` porque seria infra redundante com o passo 3
acima; só faz sentido se um dia você trocar o Source pra **GitHub Actions**.

O `.nojekyll` (vazio, na raiz) é necessário: sem ele o Pages roda Jekyll por
padrão, que **ignora** qualquer pasta/arquivo começando com `_` (ex.: `_ia/`).

**O que funciona sem servidor:** `diagramacao.html` e `graficos.html` abrem
direto como estáticos — texto, blocos, capa/contracapa, imagem comum, tabela,
checklist, callout, export/import `.pdgm.json` e **PDF** (Baixar PDF via
print nativo). **O que exige o `server.mjs` local:** só o import de gráfico
com IA — o botão "Gráfico" do menu de Adicionar Imagem some sozinho quando
não detecta backend (`GET /api/health` com timeout curto; ver
`gateChartByBackend()` em `diagramacao.js`), sem quebrar o resto do app.

## Testes

Self-checks em Node puro (`node:assert`), sem framework e sem build:

```bash
node tools/run-tests.mjs          # suite inteira (mesmo comando do CI)
node test-timeline.mjs            # um módulo
```

Arquivos: `test-*.mjs` na raiz (+ `paste-style.test.mjs`, nome legado). Cada
teste documenta no cabeçalho **o que quebraria calado** sem ele (layout torto,
escala errada, merge que perde evento — não só “lançou exceção”).

CI: `.github/workflows/test.yml` roda `node tools/run-tests.mjs` em push/PR
na `main`. Não substitui o deploy do Pages (continua “Deploy from a branch”).

## Contratos e retrocompatibilidade

O app é usado com projetos salvos e no Pages sem server. Mudanças **aditivas**
por padrão:

| Contrato | Regra |
|---|---|
| `.pdgm.json` / `.pdgm.zip` (`{ v, doc }`) | Campo novo = opcional + default no open (`seedDoc` / `normalizeOpenedDoc`). Não renomear/remover sem migração. |
| Fixture legada | `fixtures/pdgm-v1-minimal.json` + `node test-pdgm-compat.mjs` — shape antigo (sem `resumoOn`, `reviewed`, `freePdf`…) ainda abre. A migração de defaults no open vive em **`doc-migrate.js`** (UI e teste importam o mesmo módulo). |
| GitHub Pages | Feature que precisa de backend **degrada** (some UI), não quebra o fluxo estático. |
| Clipboard → Figma | Metadata `#pdgm-timeline` e o plugin em `figma-plugin/` precisam continuar parseando. |
| `/api/*` | Path e shape estáveis; erros legíveis. |

Serialização de projeto é **genérica de propósito** (`doc-format.js` dumpa o
objeto inteiro) — sobrevive a campos novos sem lista hardcodeada. Detalhes e
checklist de feature: **`AGENTS.md`**.

## Agentes (Claude / Grok)

Regras de commit, testes, nomenclatura e hotspots ficam em **`AGENTS.md`**
(um arquivo só — não duplicar em `CLAUDE.md` / `CONTRIBUTING.md`). Resumo:

- Commits com assunto = efeito/porquê e corpo com escopo + como testar.
- Feature com lógica pura → `test-*.mjs` no mesmo PR.
- Não commitar `_ia/input.*`, cache, `.pdftmp`.
- Não introduzir bundler/framework de teste sem pedido explícito.

## Converter com IA — usa o CLI, não a API

O botão **Converter com IA…** manda a imagem pro `server.mjs`, que roda o **CLI
do Claude Code** (`claude -p … --tools Read`) na sua máquina, com a **sua
assinatura** — sem chave de API, sem nada no navegador. O CLI lê o eixo e os
dados da imagem (seguindo `ia-instrucoes.md`) e devolve a spec; a UI carrega o
gráfico e sobrepõe a original pra você conferir.

- Precisa do `claude` no PATH (`which claude`). Custa tokens da sua assinatura.
- Leva ~15-30s por imagem (o CLI abre uma sessão, lê a imagem, responde).

**Duas decisões vieram de medição — a MESMA imagem (stacked100, 12 séries, 16
meses) em cada configuração. Mexer sem remedir traz o bug de volta:**

| configuração | tempo |
|---|---|
| sonnet, effort default, instruções via `Read` | **>6min40, sem terminar** |
| sonnet, effort medium, instruções via `Read` | 6min00 |
| sonnet, effort **low**, instruções via `Read` | 2min32 |
| opus, effort low, instruções via `Read` | 3min45 · US$ 0,38 |
| **sonnet, effort low, instruções INLINE** | **16s** ✅ |

1. **`--effort low`.** Ler gráfico é transcrição, não análise — o raciocínio
   profundo só queima tempo. Medido no progresso ao vivo: no effort default o
   modelo passava **6 minutos em `thinking`, com zero caractere escrito**.
2. **Instruções inline, não `Read` do `.md`.** O `Read` custa uma volta de API
   inteira (3 turnos em vez de 2) — sozinho, foi o que levou 2min32 → 16s.

> **"E se o Opus fizesse a leitura pesada?"** Testado na mesma imagem: **pior**
> nos dois eixos — 3min45 (48% mais lento que o sonnet no effort low) e US$ 0,38
> por leitura. O gargalo nunca foi capacidade de visão (o sonnet lê a imagem em
> ~20s), foi quanto raciocínio o modelo gasta antes de escrever. Sonnet low
> devolveu exatamente os mesmos valores que o Opus.

Durante a espera a UI mostra progresso REAL vindo de `GET /api/progress`
(`leu a imagem` → `analisando` → `escrevendo os dados (N caracteres)`), porque
um cronômetro mudo em cima de uma resposta longa é indistinguível de travamento.
- Só concede a ferramenta **Read** ao CLI — ele lê a imagem e as instruções, nada
  além disso (sem Bash, sem escrita, sem rede).
- A imagem enviada fica em `_ia/input.png` (sobrescrita a cada conversão).

A **linha do tempo** usa o mesmo caminho, com outra rota e outras instruções:
`POST /api/timeline` + `ia-timeline.md` → imagem em `_ia/timeline.png`. Aqui o
LLM faz o trabalho inteiro (o dado É o texto: datas, descrições e a escolha do
ícone), então não há extrator por pixel envolvido. Três decisões vieram de
medição, não de gosto — mexer nelas sem remedir volta o bug:

1. **`--effort medium`, explícito.** Com o effort default (high), a mesma imagem
   passou de 5min30 sem terminar — era isso que estourava o timeout, não os MCP.
   Transcrever texto não se beneficia de raciocínio profundo.
2. **Fatias de 950 px, no cliente.** A ferramenta Read reduz imagem com lado
   maior acima de ~1568 px; num infográfico de 862×1825 o texto de 12 px fica
   ilegível e o modelo TROCA datas e valores (21 eventos, ~40% errados — "HLP
   *perde* US$ 40 milhões"). Em resolução nativa sai exato. Uma chamada de CLI
   **por fatia** (as 3 juntas numa sessão estouram o teto), e quem junta as
   listas é `mergeEvents()` — regra determinística, não o modelo.

   > **"Não seria mais simples mandar 1 imagem reduzida?"** Foi testado: 741×1568
   > com reamostragem de alta qualidade **estourou o teto de 180 s** sem terminar.
   > O gargalo é quanto conteúdo entra em UMA requisição, não o peso do arquivo —
   > reduzir piora nos dois eixos (menos legível *e* mais lento). Fatiar: 35 s e
   > 21/21. Não troque um pelo outro sem remedir.
3. **Resposta em texto puro** (`data | texto | ícone`), não JSON: aspas dentro do
   texto (`Incidente "Jelly Jelly"`) quebravam o JSON e derrubavam a transcrição
   inteira. Ver `parseSliceText()`.

Resultado medido nessa imagem: 21/21 eventos corretos em ~35 s.

Importar uma imagem **começa uma timeline do zero**: eventos, título, subtítulo e
fonte anteriores saem inteiros (inclusive os que a imagem nova não tem). O
formato — tema, layout, cores, logo, medidas — fica, porque é o padrão da casa
que você ajustou, não conteúdo importado.

> O `/api/convert` (gráfico) sofria do MESMO problema e foi corrigido igual —
> ver a tabela de medição na seção "Converter com IA" acima.

## Copiar para o Figma (e o auto-layout)

O botão **Copiar para o Figma** joga no clipboard **um texto só**, que serve a dois
caminhos:

| Onde você cola | O que vira |
|---|---|
| Direto no Figma (⌘V) | camadas vetoriais + texto editável — **sem** auto-layout |
| No plugin `figma-plugin/` | **frames com auto-layout**, texto editável, ícone vetorial |

Por que precisa de plugin: **auto-layout não existe em nenhum formato de clipboard
público**. O formato nativo do Figma é binário proprietário (kiwi), e SVG não tem
como expressar `layoutMode`/`itemSpacing`. A única API que cria auto-layout é a de
plugin. Então o SVG copiado carrega o "plano" (`figmaPlan()` em `timeline.js`) num
`<metadata id="pdgm-timeline">` — elemento padrão de SVG, ignorado por qualquer
renderer — e o plugin monta os frames a partir dele. Um clipboard, dois caminhos.

O plano vai **completo** (cores em rgba 0-1, medidas em px, SVG de cada ícone já
tingido) de propósito: o plugin não conhece tema, paleta nem a biblioteca de
ícones — ele só empilha nós. Toda decisão de design continua no renderer.

**Instalar o plugin** (uma vez): Figma → menu **Plugins → Development → Import
plugin from manifest…** → escolha `gerador-relatorios/figma-plugin/manifest.json`.
Depois: **Plugins → Development → Paradigma — Linha do Tempo**, ⌘V na caixa,
**Gerar timeline**.

Estrutura que o plugin monta (tudo auto-layout, menos o eixo):

```
Linha do Tempo         VERTICAL, padding pad, gap gap
├─ Cabeçalho           VERTICAL, centralizado (tarja, título, subtítulo, régua)
└─ Eventos             VERTICAL, gap gap        ← o Eixo mora aqui, ABSOLUTE
   └─ Evento N         HORIZONTAL, centro, gap conn
      ├─ Card / —      card de um lado, espaçador do outro (mantém o eixo no centro)
      ├─ Nó            elipse + ícone (ou sigla)
      └─ — / Card
```

`test-figma-plugin.mjs` roda o plugin contra um **mock** da API do Figma e checa a
árvore (aninhamento, lado do card, flags de auto-layout, parse do plano, erros).
Isso **não** valida que a API real aceita cada propriedade — pra isso, rodar no
Figma de verdade.

## Ícones

Duas fontes, na mesma busca do picker:

- **36 da casa** (`timeline-icons.js`) — desenhados em 24×24, stroke, com rótulo
  em português pelo *significado* ("Airdrop", "Choque / liquidação").
- **515 do Ionicons** (`ionicons-lib.js`, 238 KB, MIT) — as 421 `outline` mais os
  94 `logo-*` (bitcoin, github, apple…), que só existem na variante cheia e por
  isso entram marcados como `solid` (pintados com `fill`; com `fill="none"`
  simplesmente não apareceriam).

Chave que existe nos dois (`star`, `rocket`, `flame`, `code`…) fica com **o
desenho da casa** — `findIcon()` e `allIcons()` respeitam a mesma ordem, senão o
picker mostrava um ícone e o SVG exportado saía com outro.

Regenerar depois de atualizar o pacote:

```bash
node tools/gen-ionicons.mjs <caminho>/node_modules/ionicons/dist/svg
```

## Arquitetura

Quatro ferramentas, **uma base compartilhada**. É a base que garante que texto,
gráfico, diagramação e linha do tempo saiam com a mesma cara.

```
paradigma.css      tokens da marca (cor, fonte, escala) — usado por todas
chart.js           spec JSON -> string SVG. Puro: sem DOM, sem browser.
timeline.js        spec de eventos -> string SVG. Puro. Reusa THEMES/logoSvg do chart.js
timeline-icons.js  36 ícones da casa (stroke, 24×24) + nó de sigla (txt:S&P) + registro
ionicons-lib.js    515 ícones do Ionicons (GERADO por tools/gen-ionicons.mjs)
figma-plugin/      plugin que transforma o plano copiado em frames com auto-layout
extrair.js         imagem (pixels) -> série numérica. Puro. Sem LLM, sem rede.
extrair-ui.js      interface do extrator (canvas, seleção de área e cor)
tabela.js          tabela colada (planilha) <-> spec. Puro. Lê pt-BR e en-US.
fonts/             IBM Plex Sans variável (.ttf)

index.html         porta de entrada
graficos.html      [2] editor de gráficos          ← pronto
graficos.js        controles do editor
timelines.html     [4] editor de linhas do tempo   ← pronto
timelines.js       controles do editor
teste.html         checagem: extração + eixo X + número + 13 gráficos
test-timeline.mjs  auto-checagem do renderer de linha do tempo (node)
test-figma-plugin.mjs  auto-checagem do plugin contra mock da API do Figma (node)
exemplos/*.json    specs de exemplo
```

| # | Ferramenta | Estado | Como pluga na base |
|---|---|---|---|
| 1 | Texto | a fazer | Edita `.md` do vault direto, via File System Access API (`showOpenFilePicker` + handle persistido no IndexedDB). Sincronia real, sem botão. |
| 2 | Gráficos | **pronto** | `renderChart(spec)` → SVG; `extrair.js` faz imagem → série |
| 3 | Diagramação | a fazer | Importa `renderChart` e embute o SVG entre os blocos de texto. PDF pelo `window.print()` + `@page` — o navegador já é o motor de PDF. |
| 4 | Linhas do tempo | **pronto** | `renderTimeline(spec)` → SVG, reusando `THEMES`/`logoSvg` do `chart.js`. Eventos à mão, colados em texto (`data \| texto \| ícone`) ou lidos de uma imagem de referência (`/api/timeline`). |

O ponto de junção é o `chart.js`: a diagramação não vai reimplementar gráfico,
ela chama a mesma função e recebe SVG pronto pra colar no fluxo do documento.

## Importar gráfico de um site (aba **HTML**)

Três caminhos, em ordem de fidelidade — o primeiro que servir é o melhor:

| o site desenha em | o que fazer | resultado |
|---|---|---|
| **SVG** (recharts e afins) | colar o HTML do elemento | valores reconstruídos do `d` do `<path>` — exato, sem IA |
| **`<canvas>`** e é DefiLlama | colar a **URL** (ou o `<iframe>` do *Embed Chart*) | números **da API deles**, exatos |
| **`<canvas>`** e é sankey | **Converter imagem** com um print | a IA lê as fitas → `links` (ver Sankey) |
| **`<canvas>`** e não é nenhum dos dois | baixar o `.csv` do site → colar em **CSV**; ou **Converter imagem** | exato / aproximado |

**Por que o canvas muda tudo:** num SVG a curva está no atributo `d` do
`<path>` e dá pra reconstruir número por número. Num `<canvas>` (ECharts,
Chart.js, TradingView) o dado virou **pixel** no ato de desenhar e não existe
no DOM — nenhum parser de HTML tira número de lá. Colar aquele HTML devolve
uma mensagem explicando isso e apontando as saídas, em vez do genérico "não
achei gráfico".

**DefiLlama** ganhou caminho próprio porque o gráfico é ECharts, mas a URL
carrega tudo que é preciso e a API é aberta:

```
https://defillama.com/chart/protocol/lighter?fees=false&openInterest=true
                                     └ slug ┘        └ métricas ligadas ┘
```

Daí saem `slug` e quais séries trazer (`/api/llama` no server faz o proxy —
`api.llama.fi` não libera CORS pro browser). TVL vem do endpoint do protocolo;
open interest e fees, de `summary/*`. Medido: `summary/derivatives` responde
**402** (é pago) e fica de fora.

O alinhamento é **por data, nunca por índice**: as métricas vêm de endpoints
diferentes com contagens e horários diferentes (TVL 1243 pontos com hora cheia,
open interest 555 à meia-noite). O eixo é a união dos dias, e o dia que uma
série não tem vira `null` — buraco que o renderer já sabe desenhar. Casar por
índice misturaria datas na mesma coluna e o gráfico sairia errado **sem dar
erro nenhum**; é o que `test-llama.mjs` trava (com a API falsificada, então
roda offline).

Rótulo do eixo escolhido pelo alcance: acima de ~1,5 ano vira `Mar/23`, senão
`12/Mar` — com 3 anos de história, `02/03/23` repetido 12 vezes encavala.

## Como converter um gráfico de imagem

**Caminho principal — o Claude lê a imagem.** Os valores do eixo (`$1.5b`, `0`,
`2025`…) estão escritos na própria imagem; o Claude lê o eixo *e* os dados e
devolve o `.json` pronto. Você não digita calibração nenhuma.

1. Mande a imagem no chat do Claude.
2. Ele devolve um `.json` (salvo em `exemplos/` ou colável em **Spec JSON**).
3. **Abrir spec .json…** carrega o gráfico já no padrão Paradigma.
4. **Comparar com imagem…** sobrepõe a original (opacidade regulável) pra você
   conferir; ajuste cor/legenda e baixe PNG.

Serve pra praticamente tudo: curva suave, barra empilhada com rótulos, gráfico
com números escritos. O único caso onde perde é **curva densa cheia de picos**
(muitos pontos que o olho não lê) — aí use o extrator por pixel abaixo.

### Extrator por pixel (curvas densas)

Traça a curva pixel a pixel (~800 pontos). Arraste a imagem pra janela (ou
**Extrair de imagem…**) e o extrator abre:

1. **Área de plotagem** — o retângulo já vem chutado; arraste sobre o canvas pra
   ajustar. As 4 bordas são a régua da calibração, então precisa ser exato.
2. **Cor da série** — as cores mais prováveis viram botões; clique numa, ou
   marque "clicar no canvas escolhe a cor" e clique na própria linha. A linha
   branca sobreposta mostra o que virou dado — se ela seguir a curva, deu certo.
3. **Calibração** — informe o valor no topo e na base do eixo Y, e o X inicial/
   final (aceita `jan/2025`, `2025`, `23/07/2023`…). A prévia mostra
   primeiro/último/máximo pra você conferir a escala.
4. **Usar como gráfico** (substitui) ou **Adicionar série** (sobrepõe outra
   curva na mesma imagem). Depois é só ajustar cor/legenda/traço e baixar.

Como funciona: acha os pixels da cor, agrupa em componentes conectadas (isso
separa a curva do tooltip/legenda/marca d'água), segue a curva coluna a coluna
e interpola vãos curtos onde o tooltip tapa. Testado contra um gráfico sintético
de geometria conhecida — erro médio 0,2%.

### Duas verificações automáticas

**Nível 1 — aderência do traço** (`assessTrace`): roda sozinho a cada ajuste e
dá um veredito colorido. Mede cobertura (% de colunas com dado real), quanto foi
interpolado, e o maior salto entre colunas vizinhas. Pega **cor errada**, **área
mal posicionada** e **traço pulando pro tooltip/2ª série**. Não valida os valores
em si — isso é a calibração.

**Nível 2 — calibração pelas grades** (`detectGridlines` + `checkCalibration`):
o botão "Conferir pelas linhas de grade" acha as linhas horizontais e mostra o
**valor que cai em cada uma**. Você compara com os rótulos do eixo da imagem: se
sair `1.488` onde a imagem diz `1.500`, a área de plotagem está torta. Também
avisa se as grades não estão igualmente espaçadas (**eixo log** ou rect torto).

O que **nenhum dos dois** cobre: ler o número do eixo automaticamente (OCR). O
navegador não tem OCR nativo bom e Tesseract.js custaria ~13 MB — fora do
princípio de zero-dependência. Então a leitura do rótulo continua sendo sua (ou
minha, no chat); as duas verificações garantem que o **traço** é fiel e que a
**calibração é consistente**, que é o grosso do erro.

**O que o extrator NÃO resolve** (é caso de LLM — me manda no chat):
- **Barra empilhada com rótulos** (ex.: ranking de DEXs): a cor sozinha não diz
  a ordem das categorias, e os números já estão impressos. Leio os rótulos e
  devolvo o `.json`.
- Imagem borrada, com muitas séries sobrepostas da mesma cor, ou sem eixo legível.

**Comparar na mão:** depois de gerar o gráfico, marque **Sobrepor original** na
barra inferior — a imagem carregada aparece por cima do gráfico com opacidade
regulável (slider ao lado). As duas curvas devem se encaixar; se a sua fugir da
original, ajuste os dados. (A imagem é esticada pra caixa do gráfico, então pra
alinhamento apertado deixe a proporção largura×altura parecida com a da imagem.)

Em lote: **Lote → Converter em lote…**, selecione vários `.json`. Cada um sai
como PNG, herdando tema/escala/fundo do editor no momento.

## Formato da spec

Todo campo é opcional menos `series`. Os defaults estão em `DEFAULTS`
(`chart.js`).

```jsonc
{
  "type": "line",          // line | area | bar | hbar | stacked | stacked100 | donut | pie | candle | sankey
  "theme": "dark",         // dark | light
  // sankey: o dado são LIGAÇÕES, não séries (ver a seção Sankey abaixo)
  "links": [{ "from": "Receita Total", "to": "Lucro Líquido", "value": 745.51 }],
  "nodeColors": { "Lucro Líquido": "#01AD6F" },
  "width": 1200, "height": 675,
  "title": "", "subtitle": "", "source": "Fonte: … • jul/2026",

  "labels": ["2024", "2025"],            // eixo de categoria
  "series": [
    { "name": "bitcoin", "data": [1, 2], "color": "#554FFE", "dashed": false, "area": false }
  ],

  "y": {
    "format": "compact",   // num | compact (mil/mi/bi) | pct | usd | brl
    "prefix": "", "suffix": "", "title": "",
    "min": null, "max": null,            // null = automático
    "ticks": 5, "zero": true,            // zero: força a base no zero
    "scale": "linear"                    // linear | log (ver abaixo)
  },
  "x": { "title": "", "every": 1,        // every: 1 rótulo a cada N
    "hidden": [3, 7],                    // índices SEM texto de rótulo (o ponto/barra continua)
    "offsets": { "3": 10 } },            // desloca o TEXTO do rótulo N px na horizontal, nunca o dado

  "grid": "y",             // y | x | both | none
  "legend": "top",         // top | bottom | none  (some sozinha com 1 série)
  "labelMode": "none",     // none | ends | max | all — default none
  "smooth": false, "strokeWidth": 8, "dotSize": 0,        // default do traço: 8px
  "barGap": 0.28, "fontScale": 1.6, "transparent": false, // default da fonte: 1.6×
  "annotations": [{ "at": "2021", "text": "Halving" }]   // at: índice ou rótulo
}
```

`data` aceita `null` pra buraco na série. O editor também lê tabela colada da
planilha (1ª coluna = rótulos, 1ª linha = nomes), em pt-BR ou en-US.

### Bolhas (tamanho de mercado, com ícone)

Cada item vira um círculo com **área** proporcional ao valor e um ícone dentro.
É o formato de "tamanho de mercado": comparação de grandeza entre coisas que
não estão numa série temporal.

```
rótulo,valor,ícone,grupo,categoria
Taxas de Juros,7.9e12,percent,TRADFI,Derivativos
Forex Spot,2.6e12,money,TRADFI,Spot
Derivativos,200e9,trend-up,CRYPTO,Derivativos
```

- **`grupo`** quebra em blocos com título, subtítulo e separador (TRADFI |
  CRYPTO). O subtítulo padrão é a **soma do que está desenhado** — o número que
  o gráfico pode garantir. Para outra métrica (a referência trazia
  "Derivatives: 44%", que não sai da soma das bolhas), escreva o texto em
  `spec.bubbleGroups` em vez de inventar uma fórmula.
- **`categoria`** dá a cor e monta a legenda; a cor mora em `spec.bubbleCats`,
  **por categoria**, não por bolha — é o que faz a legenda significar algo.
  Trocar no painel repinta todas as bolhas daquele tipo.
- **`ícone`**: o MESMO picker e o mesmo set do criador de timelines — 36 da
  casa + 421 Ionicons, com busca, mais a sigla `txt:S&P` como alternativa. O
  popover virou `icon-pop.js`, compartilhado pelas duas ferramentas: duplicar
  80 linhas garantiria que divergissem no primeiro ajuste (mesma razão de
  `swatch.js` existir).

**Área, não raio.** O olho lê área. Com raio proporcional ao valor, algo 4×
maior viraria uma bolha **16×** maior — o gráfico exagerando por um fator igual
ao próprio valor. Daí `r ∝ √valor`. `test-bolhas.mjs` trava isso: trocando
para raio proporcional, ele acusa `3,04× onde devia ser √3,04 = 1,74×`.

Dois detalhes de layout que o formato obriga:

- **A faixa de cada bolha é o maior entre o diâmetro e o rótulo.** Reservar só
  o diâmetro fazia "Derivativos US$ 200 bi" (bolha de 6px) escrever por cima da
  vizinha.
- **A imagem alarga sozinha** (`meta.minWidth`), porque quem manda na largura é
  o texto, e texto não encolhe com a escala. O número é calculado com a escala
  da **altura**: as duas se perseguem — alargar aumenta as bolhas, que pedem
  mais largura —, e medindo pela largura em uso o valor nunca convergia (uma
  bolha saía em `cx=1438` numa imagem de 1396).

Bolhas alinhadas pelo **topo**.

**Rótulo a distância constante da borda** — não numa base comum. Com base
comum, a bolha pequena ficava com o texto longe dela e o par se perdia; a
distância fixa mantém os dois colados em qualquer tamanho (e é o que dá o
efeito de degrau da referência). Posição em `bubbleLabel`:

| valor | onde fica |
|---|---|
| `below` (padrão) | abaixo da bolha, centrado |
| `above` | acima — a folga é reservada antes das bolhas, senão o texto subiria por cima do cabeçalho do grupo |
| `right` | à direita, no meio vertical; aqui o texto **soma** ao diâmetro na faixa, em vez de ser o maior dos dois |

**Piso e teto, todos ajustáveis no painel:**

- **`bubbleMinR`** (padrão 9px) — valor miúdo ao lado de um gigante vira um
  ponto de 1px: existe no dado e some no desenho. O piso entra depois da
  proporção, então só levanta quem sumiria, e é cortado pelo raio da maior
  bolha (num conjunto todo pequeno, viraria o tamanho de todas).
- **`bubbleIcon.max`** (56px) — sem teto, na bolha gigante o ícone vira um
  desenho enorme que rouba a leitura do **tamanho**, que é o dado.
- **`bubbleIcon.min`** (13px) — abaixo disso o traço vira borrão; melhor bolha
  limpa que ícone ilegível. No painel, o piso é limitado pelo teto: sem isso,
  arrastar o mínimo acima do máximo escondia todos os ícones e parecia defeito.
- A **sigla `txt:`** é dimensionada pelo mesmo `lado` do ícone, então tem o peso
  visual dos ícones vizinhos em vez de virar um texto solto.

> Ícone inexistente sai **vazio, sem erro** (`iconSvg` devolve string vazia).
> Os 421 Ionicons só existem depois de `registerIcons(IONICONS_LIB)`, que a UI
> faz — `percent` e `swap`, por exemplo, não existem; os nomes certos são
> `stats-chart` e `swap-horizontal`. Use a busca do picker em vez de adivinhar.

### Sankey (diagrama de fluxo)

O tipo `sankey` responde "de onde veio e pra onde foi": nós em colunas, ligados
por fluxos cuja **espessura é o valor**. É o formato certo pra receita por
fonte → agregações → total → lucro/custo.

O dado **não são séries** — são ligações. A caixa de texto vira
`origem,destino,valor`, uma por linha, e vira `spec.links`:

```
origem,destino,valor
Receita Padrão da Corretora,Receita Perpétuos,656.04
HIP-3,Receita Perpétuos,22.41
Receita Perpétuos,Receita HyperCore,678.44
Receita Total,Lucro Líquido,745.51
Receita Total,Custos,7.17
```

Nenhuma coluna é digitada: a topologia sai das próprias ligações. Cor por nó em
`spec.nodeColors` (`{"Lucro Líquido": "#01AD6F", "Custos": "#CE5249"}`); o resto
segue a paleta.

**De um print, via IA.** Sankey de site é sempre `<canvas>` (ECharts) — o HTML
não carrega número nenhum, e o tooltip que fica no DOM guarda **um** fluxo só,
o que estava sob o mouse. Então o caminho é **Converter imagem**: o
`ia-instrucoes.md` tem um modo `sankey` que manda ler fita por fita e devolver
`links`. Medido num print de 7 fluxos: **8s, os 7 corretos** com origem,
destino, valores e título. Colar o HTML de um sankey em canvas devolve uma
mensagem que já cita o fluxo do tooltip e aponta esse caminho.

Duas regras que o guia da IA impõe e importam: **escala uniforme** (`$921.02K`
no meio de milhões vira `0.92`, com a unidade em `y.prefix`) e **não inventar
caixa nem total** — só o que está desenhado. Diferente dos outros tipos, a
sobreposição da imagem original fica **desligada** aqui: o layout é recalculado
do zero (colunas, ordem, altura), então a original nunca alinha e só atrapalha.

Quatro decisões do layout, todas com motivo concreto:

1. **Coluna = maior caminho** desde uma origem, não o menor. Com o menor, um
   atalho "fonte → total" puxaria o Total pra 2ª coluna e as etapas do meio
   ficariam depois dele — o fluxo andaria pra trás.
2. **Altura do nó = max(entrada, saída)**, senão os fluxos não caberiam na
   própria caixa em nó que junta ou vaza.
3. **Ordem por baricentro** dos vizinhos, algumas passadas: é o que desembaraça
   os cruzamentos. Sem isso vira novelo, mesmo com todos os valores certos.
4. **Rótulo no topo do nó, quebrado em 2 linhas** quando não cabe até a coluna
   seguinte, com anti-colisão de **duas passadas** (desce quem sobrepõe, sobe
   quem passou do fim). Empurrar a coluna inteira em bloco jogava o primeiro
   rótulo pra fora da imagem — medido, `y = -163`.
5. **Faixa reservada à direita** pros rótulos da última coluna. Sem ela não
   havia espaço à direita, o rótulo era escrito à esquerda do nó e caía **em
   cima do nó anterior** — 3 colisões medidas. Encolhendo o grafo, todo rótulo
   escreve à direita e nenhum invade o desenho.

**Zero sobreposição é requisito, não estética** — `test-sankey.mjs` calcula a
caixa de cada rótulo (as linhas de um mesmo rótulo contam como um bloco só) e
falha se qualquer bloco cruzar outro bloco ou um nó.

**Ajuste manual (modo Editar).** O nó inteiro é a alça: arraste pra cima ou
pra baixo e o rótulo e os fluxos acompanham. Só vertical de propósito — o
horizontal é a etapa do fluxo, e mover mudaria o significado do gráfico. Grava
em `spec.nodeOffsets` **por nome** (`{"Custos": 60}`), não por índice, pra o
ajuste sobreviver quando uma ligação entra ou sai do dado. O deslocamento é
aplicado **depois** do layout automático, então o baricentro continua
trabalhando sobre o desenho limpo. Pra zerar, apague o campo na spec.

Nó movido à mão vira **âncora**: o rótulo dele não cede no anti-colisão, quem
desvia são os automáticos dos dois lados. Sem isso o anti-colisão puxava o
rótulo de volta pro lugar "certo", ele descolava do nó recém-arrastado e o
movimento parecia não ter pegado.

**Nenhum retângulo sai da imagem — nunca.** O corte mora no RENDERER, não só no
editor: a spec chega de qualquer lugar (JSON colado, arquivo salvo, extração
por IA) e o desenho tem que se defender sozinho. Três frentes, porque são três
jeitos diferentes de escapar:

| como escapava | medido antes | defesa |
|---|---|---|
| arraste longo demais | nó em `y=1381` numa imagem de 600 | corte na posição |
| coluna cheia / piso alto | nó em `-15` e outro em `615` | respiro aperta antes de vazar |
| nó maior que a área | nó em `54–854` (piso × nº de fitas) | teto na altura do nó |

No terceiro caso o **piso é quem cede** — "nada fora da imagem" vale mais que a
espessura mínima —, e o piso da fita cede junto, senão as fitas somariam mais
que a caixa e vazariam por baixo dela. Antes disso, a imagem tenta CRESCER
(`meta.minHeight` já conta os pisos), então o teto só morde quando não há mais
para onde crescer.

O editor regrava o deslocamento **efetivamente aplicado**, não o pedido: sem
isso um arraste de 3000px deixava `nodeOffsets: 2163` guardado, o nó parava na
borda e voltar exigia desfazer todo o excesso antes de ver movimento. Agora
grava 254 — e arrastar 150px de volta move 150px. (O `sync()` vem antes da
leitura: durante o arraste o desenho é atualizado em `requestAnimationFrame`,
então no "soltar" o `chartMeta` ainda pode ser o do quadro anterior — medido,
gravava `0` e o nó não saía do lugar.)

### Sankey: quando a barra pequena some

Dois controles pro mesmo aperto — fluxo de US$ 2,26M ao lado de US$ 699M fica
com **1,5px**: existe no dado e some no desenho.

**`y.scale: "log"`** (o mesmo seletor **Escala** do eixo). A espessura passa a
ser `log10(1 + v/menor)`: a razão de 233× vira **9×** e o miúdo sai de 1,5px
pra 12,3px. A fórmula passa pela origem (valor 0 → espessura 0) e não explode
com valor menor que 1, o que log puro faria.

> Comprimir é **mentir sobre a proporção** — que é a única coisa que um sankey
> existe pra mostrar. Por isso não é o padrão, e vale dizer na legenda que a
> escala é logarítmica. É a troca consciente entre "proporção fiel" e "dá pra
> ver o que é pequeno".

**`sankeyScale`** (slider *Espessura das barras*, 15–100%). A espessura era uma
fração da altura, então esticar a imagem pra caber o texto **engordava as
barras junto** e o texto continuava apertado. Com o fator, altura da imagem e
espessura da barra viram controles separados: cresce a imagem, encolhe a barra,
e o que sobra vira respiro pro rótulo. **É o caminho preferido** — mexe no
tamanho, não na verdade do gráfico.

**`sankeyMinLink`** (px, padrão **2**). Piso de espessura pra nó e fita. Sem
ele o fluxo miúdo sai com fração de pixel e some no antialiasing: some do
DESENHO, não do dado — o gráfico passando a mostrar menos do que sabe. E o
slider de espessura piorava (metade de 1,5px é 0,75px). O piso entra **depois**
da proporção, então só levanta quem sumiria; o resto continua fiel.

Duas consequências que o piso obriga a tratar:

- **O nó reserva espaço pros pisos dele.** Um nó com 5 saídas miúdas precisa de
  5 pisos de altura, senão as fitas vazam pra fora da caixa.
- **A escala sai por iteração, não por fórmula.** Quem já está no piso não
  responde mais à escala, então o espaço que sobra pros outros muda a cada
  ajuste — 6 passadas convergem e mantêm a coluna dentro da área.

`test-sankey.mjs` mede a espessura real de cada fita em quatro configurações
(padrão, 50%, 15% e log) e falha se alguma cair abaixo de 1px — com o piso
removido, uma fita cai pra **0,62px** e o teste acusa.

**Consequência técnica do log:** `log a + log b ≠ log(a+b)`, então a soma das
partes deixa de ser o todo e as fitas parariam de encaixar nos nós. Cada ponta
da fita é dimensionada em relação ao **nó daquela ponta**
(`valor_da_fita / valor_do_nó × altura_do_nó`), então tudo continua preenchendo
a caixa sem sobrar nem faltar — a fita afina ou engorda no caminho, que é a
cara honesta de uma escala que não conserva soma. Em linear a conta dá
exatamente no mesmo de antes. `test-sankey.mjs` verifica que **toda fita nasce
dentro do seu nó**, nas duas escalas (com o bug reintroduzido, uma fita voa
pra `y=57036`).

**A imagem cresce pra caber os rótulos.** A coluna mais cheia empilha
nome + valor de cada nó; quando não cabe, espremer texto seria o pior dos dois
mundos. O renderer devolve `meta.minHeight` e o editor sobe `spec.height` (só
cresce, e re-renderiza uma vez — medido: 10 nós numa coluna pedem 636px onde
havia 400). A largura das colunas de cor por nó sai do painel de séries.

### Pizza/rosca: cor por fatia e "Outros"

O painel de séries lista **uma linha por fatia** (pizza/rosca) ou **por nó**
(sankey), cada uma com seu swatch — antes a lista vinha vazia nesses tipos e a
única saída era editar a spec à mão. A cor grava em `spec.sliceColors` /
`spec.nodeColors`, **por nome**. O nome em si é só leitura: ele vem do dado,
edita-se no CSV.

**Juntar fatias pequenas em "Outros"** (`spec.groupSmall`): numa distribuição
real a cauda longa vira um punhado de fatias de 0,3% — invisíveis no desenho,
mas cada uma gastando um card e uma cor da paleta e empurrando as que importam
pra fora do olho. É o que a paleta da casa já pressupõe ("a 7ª série vira
Outros, não uma cor nova"). Desligado por padrão; ligado, junta tudo abaixo de
`pct` numa fatia só, na cor neutra do tema.

Só agrupa a partir de **duas** fatias: virar "Outros" com uma fatia só trocaria
um nome informativo por um genérico sem ganhar espaço nenhum.

### Escala do eixo de valor (`y.scale`)

`"log"` serve pra série que anda por ordem de grandeza (TVL, market cap, preço,
PnL) — no linear os anos iniciais viram uma reta colada no zero. **Uma opção só
na UI**, mas o renderer escolhe a variante pelo DADO:

| dado | escala usada | por quê |
|---|---|---|
| tudo positivo | **log** puro | cada década ocupa a mesma altura |
| tem negativo ou zero | **symlog** | `log(-5)` não existe e `log(0)` é −infinito |

**symlog** (a mesma do matplotlib) é linear numa faixa `[-T, T]` em volta do
zero e log fora dela, espelhada nos dois lados: `|v| ≤ T → v/T`,
`|v| > T → ±(1 + log10(|v|/T))`. As duas metades se encontram exatamente em
`±1`, então não há degrau na curva. É isso que permite o **zero existir no
eixo** — e ele nunca falta nos ticks, porque é onde o dado troca de sinal.

`T` sai do dado: a menor magnitude não-zero, com piso de 5 décadas abaixo do
maior valor absoluto (senão um único `0,0001` no meio de milhões geraria 10
décadas e espremeria o resto). Vai em `meta.scale.T`, porque o editor precisa
da inversa **exata** pra converter o arraste de volta em valor — por isso
`symlog`/`symlogInv` são exportadas de `chart.js` em vez de reimplementadas.

Detalhes que o log força:
- **`zero: true` é ignorado** — em log o zero fica infinitamente longe; em
  symlog ele já está garantido por construção.
- **`stacked100` nunca vira log**: ali a soma É a escala, e segmento empilhado
  em log não soma visualmente — o gráfico mentiria.
- **Casas decimais do rótulo** saem do menor tick, não do valor: com as 2 casas
  padrão, um eixo de funding (`0,001 · 0,01 · 0,1`) imprimia `0`, `-0` e `0`.
- **Valor fora do domínio** encosta no piso em vez de virar `NaN` e sumir com a
  série inteira do SVG.

`node test-escala-log.mjs` cobre tudo isso (simetria, ida-e-volta, zero no
eixo, densidade de tick e o linear intacto).

## Paleta

As três cores da marca não formam uma paleta categórica utilizável: `mint` e
`lilac` estão claras demais pra faixa de luminosidade do fundo escuro, e
`violet`/`lilac` são o mesmo matiz. Os slots abaixo são as **mesmas cores
reposicionadas em OKLCH** por modo, mais 3 matizes de extensão.

| Slot | | Escuro | Claro |
|---|---|---|---|
| 1 | violeta (marca) | `#554FFE` | `#4626F1` |
| 2 | verde (marca) | `#01AD6F` | `#038756` |
| 3 | âmbar | `#C08600` | `#B88000` |
| 4 | lilás (marca) | `#9283E3` | `#7F6FCE` |
| 5 | coral | `#CE5249` | `#BA3E38` |
| 6 | azul | `#0092C6` | `#007FAD` |
| 7 | magenta | `#C15AA7` | `#AA4591` |
| 8 | oliva | `#6F9D17` | `#659003` |
| 9 | teal | `#0695B5` | `#0085A2` |
| 10 | rosa | `#CC4F6E` | `#B3385A` |
| 11 | roxo | `#9B61C9` | `#8349AE` |
| 12 | laranja | `#DC701C` | `#DC701C` |

Os 6 primeiros são a paleta base; 7–12 são extensão pra empilhados densos
(ex.: ranking de DEXs). A **ordem** foi escolhida por busca (2-opt) pra manter
pares **vizinhos** distinguíveis — o que importa em empilhado, onde segmentos
se tocam (mais o respiro de 2px entre eles).

Validado com o validador do skill `dataviz`. Até 6 slots passa limpo. Com os
12, no escuro tudo passa (1 par vizinho em faixa CVD 6–8, legal com o respiro);
no claro sobra 1 par roxo↔azul confundível sob daltonismo. Isso é **limite
inerente**: o método diz que acima de ~8 categorias não dá pra passar todos os
gates de CVD. Em empilhado isso é mitigado por legenda + **posição fixa** (cada
DEX sempre na mesma faixa) + o respiro entre segmentos. Se precisar de >6 séries
num gráfico **sem** essas âncoras (ex.: linhas soltas), dobre pra "Outros".

`#4E39FF` puro e `#29E899` puro continuam sendo a cor da marca pra tudo que não
é série de dado (fundo, título, destaque).

## Decisões que valem revisitar

- **Curva suave usa interpolação monótona**, não Catmull-Rom: a versão curta
  dá overshoot e faz a linha passar acima do topo real da série.
- **Sem tooltip/hover.** O destino é PDF impresso; interação não sobrevive à
  exportação. Se a ferramenta 3 ganhar saída web, o hover entra lá.
- **Largura de texto é estimada por contagem de caractere**, não medida no DOM
  — é o que mantém o `chart.js` puro. Erra ~5%; se margem apertar em rótulo
  longo, medir de verdade.
- **PNG embute a fonte no SVG** (~700 KB por export). Sem isso o canvas
  renderiza com fonte do sistema, porque o SVG desenhado roda isolado.
