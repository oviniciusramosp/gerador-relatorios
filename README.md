# Gerador de Relatórios — Paradigma

Ferramenta web local pra produzir PDF com a estética da casa. Sem build, sem
dependência externa: HTML + módulos ES + um servidor Node de ~90 linhas.

```bash
node gerador-relatorios/server.mjs        # porta 5180
```

Depois abra <http://localhost:5180>. Precisa ser `http://`, não `file://` — a
fonte, o export PNG e o **Converter com IA** dependem de `fetch` de mesma origem.

> Só pra ver os gráficos, sem a IA, qualquer estático serve
> (`python3 -m http.server 5180 --directory gerador-relatorios`). O botão
> **Converter com IA** só funciona com o `server.mjs`, que roda o CLI do Claude.

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

## Converter com IA — usa o CLI, não a API

O botão **Converter com IA…** manda a imagem pro `server.mjs`, que roda o **CLI
do Claude Code** (`claude -p … --tools Read`) na sua máquina, com a **sua
assinatura** — sem chave de API, sem nada no navegador. O CLI lê o eixo e os
dados da imagem (seguindo `ia-instrucoes.md`) e devolve a spec; a UI carrega o
gráfico e sobrepõe a original pra você conferir.

- Precisa do `claude` no PATH (`which claude`). Custa tokens da sua assinatura.
- Leva ~20-60s por imagem (o CLI abre uma sessão, lê a imagem, responde).
- Só concede a ferramenta **Read** ao CLI — ele lê a imagem e as instruções, nada
  além disso (sem Bash, sem escrita, sem rede).
- A imagem enviada fica em `_ia/input.png` (sobrescrita a cada conversão).

## Arquitetura

Três ferramentas, **uma base compartilhada**. É a base que garante que texto,
gráfico e diagramação saiam com a mesma cara.

```
paradigma.css      tokens da marca (cor, fonte, escala) — usado pelas 3
chart.js           spec JSON -> string SVG. Puro: sem DOM, sem browser.
extrair.js         imagem (pixels) -> série numérica. Puro. Sem LLM, sem rede.
extrair-ui.js      interface do extrator (canvas, seleção de área e cor)
tabela.js          tabela colada (planilha) <-> spec. Puro. Lê pt-BR e en-US.
fonts/             IBM Plex Sans variável (.ttf)

index.html         porta de entrada
graficos.html      [2] editor de gráficos          ← pronto
graficos.js        controles do editor
teste.html         checagem: extração + eixo X + número + 13 gráficos
exemplos/*.json    specs de exemplo
```

| # | Ferramenta | Estado | Como pluga na base |
|---|---|---|---|
| 1 | Texto | a fazer | Edita `.md` do vault direto, via File System Access API (`showOpenFilePicker` + handle persistido no IndexedDB). Sincronia real, sem botão. |
| 2 | Gráficos | **pronto** | `renderChart(spec)` → SVG; `extrair.js` faz imagem → série |
| 3 | Diagramação | a fazer | Importa `renderChart` e embute o SVG entre os blocos de texto. PDF pelo `window.print()` + `@page` — o navegador já é o motor de PDF. |

O ponto de junção é o `chart.js`: a diagramação não vai reimplementar gráfico,
ela chama a mesma função e recebe SVG pronto pra colar no fluxo do documento.

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
  "type": "line",          // line | area | bar | hbar | stacked | stacked100 | donut
  "theme": "dark",         // dark | light
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
    "ticks": 5, "zero": true             // zero: força a base no zero
  },
  "x": { "title": "", "every": 1 },      // every: 1 rótulo a cada N

  "grid": "y",             // y | x | both | none
  "legend": "top",         // top | bottom | none  (some sozinha com 1 série)
  "labelMode": "ends",     // none | ends | max | all
  "smooth": false, "strokeWidth": 2.5, "dotSize": 0,
  "barGap": 0.28, "fontScale": 1, "transparent": false,
  "annotations": [{ "at": "2021", "text": "Halving" }]   // at: índice ou rótulo
}
```

`data` aceita `null` pra buraco na série. O editor também lê tabela colada da
planilha (1ª coluna = rótulos, 1ª linha = nomes), em pt-BR ou en-US.

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
