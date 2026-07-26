# Instruções — ler imagem de linha do tempo e transcrever os eventos

Você recebe o caminho de uma imagem de uma **linha do tempo** (timeline). Leia a
imagem (ferramenta Read) e devolva os eventos em **texto puro, um por linha**:

```
TITULO: Linha do Tempo: Hyperliquid
SUBTITULO: Principais produtos, atualizações e marcos históricos
FONTE:
LAYOUT: alternada
Novembro/2022 | Lançamento da primeira Testnet | flask
Março/2025 | Incidente "Jelly Jelly" | alert
Março/2026 | Lançamento do perpétuo oficial do S&P500 | txt:S&P
```

Formato de cada evento: `data | texto | ícone` (ícone opcional, `|` como
separador). **Não devolva JSON** — aspas dentro do texto (`Incidente "Jelly
Jelly"`) quebram o JSON e a transcrição inteira se perde; em texto puro, não.

Aqui o texto é o dado: transcreva o que está escrito, não estime nada. Não
invente evento que não está na imagem e não junte dois eventos num só.

## Regras

- **Ordem**: cronológica, mesmo que a imagem esteja fora de ordem. Datas iguais
  mantêm a ordem da imagem.
- **data**: exatamente como impressa, mas normalizada pra `Mês/AAAA`
  (`Fevereiro/2023`), `AAAA` ou `DD/MM/AAAA`. Traduza mês em inglês
  (`Sept 2024` → `Setembro/2024`).
- **texto**: transcrição fiel do evento, uma frase, **sem `|` dentro**. Sem
  inventar, sem resumir a ponto de perder o número (`US$ 1 bilhão em volume
  diário` fica).
- **ícone**: opcional. Use uma chave da lista abaixo pelo **significado** do
  evento (não pelo desenho exato da imagem). Sigla/logo dentro do nó (S&P, ETF,
  HIP) vira `txt:S&P` — no máximo 6 caracteres. Sem ícone óbvio: deixe vazio.
- **TITULO/SUBTITULO/FONTE/LAYOUT**: uma linha cada, no começo, só se existirem
  na imagem. LAYOUT é `alternada`, `esquerda` ou `horizontal` (o que a imagem
  parece). Cor, largura, tema e logo NÃO são sua escolha — a ferramenta decide.
- **Sem marcador nenhum no lugar de texto**: nada de `(texto cortado)`,
  `(ilegível)`, `...`. Transcreva o que se lê; se não se lê nada de um evento,
  simplesmente não inclua ele.

## Chaves de ícone válidas

`rocket` (lançamento) · `flask` (testnet/lab) · `code` (código/API) · `cube`
(rede/bloco) · `update` (atualização) · `link` (integração) · `chart-bar`
(volume) · `trend-up` (alta) · `trend-down` (queda) · `coins` (volume
acumulado) · `coin` (token) · `money` (receita) · `wallet` (carteira) · `bank`
(institucional) · `balance` (regulação) · `trophy` (recorde) · `star`
(destaque) · `target` (meta/mercado novo) · `flag` (marco) · `bolt`
(choque/liquidação) · `flame` (queima/hype) · `parachute` (airdrop) · `gift`
(recompensa) · `users` (comunidade/referral) · `megaphone` (anúncio) · `bulb`
(ideia/research) · `doc` (documento/proposta) · `shield` (segurança) · `lock`
(fechado) · `key` (acesso) · `clock` (tempo) · `calendar` (data) · `globe`
(global/mainnet) · `check` (concluído) · `alert` (incidente) · `eye`
(transparência)

## Saída

Responda com **só as linhas** descritas acima — sem JSON, sem ```, sem texto
antes ou depois. Se não conseguir ler a imagem, responda `ERRO: motivo`.
