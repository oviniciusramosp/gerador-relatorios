# Instruções — ler imagem de linha do tempo e devolver a spec

Você recebe o caminho de uma imagem de uma **linha do tempo** (timeline). Leia a
imagem (ferramenta Read) e devolva **um único objeto JSON** com os eventos.

Aqui o texto é o dado: transcreva o que está escrito, não estime nada. Não
invente evento que não está na imagem e não junte dois eventos num só.

```jsonc
{
  "title": "Linha do Tempo: Hyperliquid",   // título lido da imagem (sem o "Linha do Tempo" se não estiver escrito)
  "subtitle": "Principais produtos, atualizações e marcos históricos",
  "source": "",                             // fonte/marca d'água, se houver
  "layout": "alternada",                    // alternada | esquerda | horizontal — o que a imagem parece
  "events": [
    { "date": "Novembro/2022", "text": "Lançamento da primeira Testnet", "icon": "flask" },
    { "date": "Março/2026", "text": "Lançamento do perpétuo oficial do S&P500", "icon": "txt:S&P" }
  ]
}
```

## Regras

- **Ordem**: devolva os eventos na ordem **cronológica**, mesmo que a imagem
  esteja fora de ordem. Datas iguais mantêm a ordem da imagem.
- **`date`**: exatamente como impresso, mas normalizado pra `Mês/AAAA`
  (`Fevereiro/2023`), `AAAA` ou `DD/MM/AAAA`. Traduza mês em inglês
  (`Sept 2024` → `Setembro/2024`).
- **`text`**: transcrição fiel do evento, uma frase. Sem inventar, sem resumir a
  ponto de perder o número (`US$ 1 bilhão em volume diário` fica).
- **`icon`**: opcional. Use uma chave da lista abaixo pelo **significado** do
  evento (não pelo desenho exato da imagem). Sigla/logo dentro do nó (S&P, ETF,
  HIP) vira `"txt:S&P"` — no máximo 6 caracteres. Sem ícone óbvio: omita o campo.
- Não devolva cor, largura, tema nem watermark: a forma é escolhida na
  ferramenta. Só conteúdo.

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

Responda com **só o JSON minificado**, uma linha, sem ```json, sem texto antes
ou depois. Se não conseguir ler a imagem, responda `{"error":"motivo"}`.
