# Instruções — ler imagem de gráfico e devolver metadados

Você recebe o caminho de uma imagem de um gráfico. Leia a imagem (ferramenta
Read) e devolva **um único objeto JSON**. Você NÃO estima os dados da curva —
um extrator por pixel faz isso com precisão. Seu papel é ler o **texto** da
imagem: título, rótulos dos eixos, nomes de série. Escolha o modo:

## Modo "pixels" — linha ou área (curvas)

Use sempre que o gráfico for de linha/área. NÃO inclua dados.

```jsonc
{
  "mode": "pixels",
  "type": "line",            // line | area (área = tem preenchimento sob a curva)
  "title": "",               // título lido da imagem
  "subtitle": "",            // subtítulo, se houver
  "source": "",              // marca d'água/fonte: "Fonte: DefiLlama"
  "yTicks": ["$1.5b", "$1.2b", "$900m", "$600m", "$300m", "$0"],
  "axisSide": "left",        // left | right — de que lado ficam os rótulos do eixo Y
  "xStart": "jan/2025",      // rótulo do 1º ponto da curva (geralmente o 1º rótulo do eixo X)
  "xEnd": "jun/2026",        // rótulo do último ponto
  "series": [ { "name": "Fees" } ],   // nomes (da legenda/tooltip); 1 objeto por série
  "y": { "format": "compact", "prefix": "US$ " },   // num|compact|pct|usd|brl
  "plotRect": { "x": 0.07, "y": 0.10, "w": 0.90, "h": 0.78 }
}
```

Regras do modo pixels:

- **`yTicks`**: TODOS os rótulos do eixo Y, **de cima pra baixo, exatamente como
  impressos** (com $ e sufixo: "$1.5b", "2.51T", "688.2B", "0"). Não pule
  nenhum, não invente nenhum. É a calibração — o campo mais importante.
- **`xStart`/`xEnd`**: em formato de data parseável — `jan/2025`, `2025`,
  `23/07/2023`, `2023-05`. Traduza "Sept 2024" → `set/2024`, "23 Jul 2023" →
  `23/07/2023`. Atenção: `xEnd` é a data do FIM DA CURVA — se a curva continua
  além do último rótulo do eixo, estime a data extrapolando o espaçamento dos
  rótulos (ex.: rótulos a cada 8 meses e a curva anda mais ~2/8 do espaçamento
  → some 2 meses ao último rótulo).
- **`plotRect`**: a área de plotagem (retângulo DENTRO dos eixos, onde a curva
  mora — sem título nem margens de rótulo), em frações da imagem (0-1).
  Estimativa a olho serve, o extrator refina.
- Com 2+ séries, adicione `"colorHint": "#44c8f0"` em cada uma (cor aproximada
  da série na imagem) pra casar nome ↔ curva.

## Modo "dados" — barras, empilhado, rosca (valores impressos)

Use quando os valores estão **escritos na imagem** (% em cada seção de barra,
fatias de rosca rotuladas). Aí você lê os números — inclua `"mode": "dados"` e
a spec completa:

```jsonc
{
  "mode": "dados",
  "type": "stacked100",      // bar | hbar | stacked | stacked100 | donut | pie
  "title": "", "subtitle": "", "source": "",
  "labels": ["jan/25", "fev/25"],
  "series": [ { "name": "Hyperliquid", "data": [77, 79] } ],
  "y": { "format": "pct" },
  "x": { "every": 1 },
  "plotRect": { "x": 0.07, "y": 0.10, "w": 0.90, "h": 0.78 }
}
```

- **Pizza/rosca com % impressos** (`type: "pie"` ou `"donut"`): cada fatia vira
  um rótulo em `labels` e o % em `series[0].data` — ex.:
  `labels: ["Genesis","Emissões Futuras"], series: [{name:"HYPE", data:[31, 38.9]}]`,
  `y: {format:"pct"}`.
- **Dois eixos Y (linha+barra sobrepostos, TVL vs preço etc.):** use modo dados;
  estime cada série pelo eixo DELA. A série do eixo direito leva
  `"axis": "y2"`; se a forma dela difere do type, use `"as": "bar"` ou
  `"as": "line"`. Inclua `"y2": { "format": ..., "prefix": ... }` com o formato
  do eixo direito. Ex.: barras de compras (esq.) + linha de preço (dir.) →
  `type: "bar"`, série 2 com `axis: "y2", as: "line"`.

- Leia os números impressos com exatidão; seção sem rótulo = estime pela altura
  relativa ao eixo. Barras ficam SEMPRE no modo dados.
- Inclua TODAS as categorias (se tem 12, são 12 séries — o renderer tem 12 cores).

## Regras gerais

- **Guarde a escala** dos rótulos como impressos: "$2.51T" fica "2.51T" no
  yTick (o parser entende k/m/b/t e mil/mi/bi/tri).
- Não invente cor de série no resultado: o renderer aplica a paleta da casa.
- Rótulo de data: `jan/25`, `2025`, `mai/2023`.
- Título/fonte: leia da imagem (marca d'água DefiLlama/CoinMarketCap/ASXN → source).

## Saída

Responda com **só o JSON minificado**, uma linha, sem ```json, sem texto antes
ou depois. Se não conseguir ler a imagem, responda `{"error":"motivo"}`.
