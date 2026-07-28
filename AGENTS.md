# AGENTS.md — Claude, Grok e humanos

Contrato único do repositório. Agentes de IA e contribuidores leem **este
arquivo** antes de implementar, commitar ou refatorar. Não duplicar estas
regras em `CLAUDE.md` / `CONTRIBUTING.md` — um lugar só.

## O que é este projeto

Gerador de relatórios da Paradigma: **HTML + módulos ES**, sem build, sem
`package.json` de app. Roda no GitHub Pages como estático; `server.mjs` é
**opcional** (IA local, proxy DefiLlama, PDF headless de referência).

- Entrada local: `node --watch server.mjs` → http://localhost:5280
- Documentação de produto e decisões medidas: `README.md`
- Instruções de visão (IA): `ia-instrucoes.md`, `ia-timeline.md`

## Antes de mudar código

1. **Ler o código e os arquivos envolvidos.** Decisões com base em fatos do
   repo, não em achismo.
2. **Identificar o contrato** que a mudança toca (tabela abaixo). Se tocar
   contrato → teste de regressão no mesmo PR.
3. **Preferir aditivo.** Campo novo, default seguro, feature flag / degradação
   no Pages. Não renomear nem remover campos de arquivo sem migrator.
4. **Não introduzir build step** (Vite, bundler, TS obrigatório) sem pedido
   explícito — quebra a premissa do Pages e do README.

## Commits (obrigatório para agentes)

Só commitar quando o usuário pedir **ou** quando a feature estiver fechada e
os testes relevantes tiverem passado.

### Formato

- **Assunto** (1 linha): o *efeito* / o *porquê*, não a lista de arquivos.
  Em português, no tom do repo.
- **Corpo** (sempre que a mudança não for trivial):
  - o que mudou e o que **não** mudou (escopo);
  - contratos tocados (`.pdgm`, clipboard Figma, `/api/*`, Pages…);
  - como testar: `node tools/run-tests.mjs` e/ou `node test-<area>.mjs`.

Exemplo:

```
Aceita .pdgm antigos sem resumoOn sem perder o resumo

normalizeOpenedDoc já tratava o caso no load; o teste de fixture trava a
regressão. Não mexe no shape de blocks nem nas rotas de IA.

Teste: node test-pdgm-compat.mjs
```

### Proibições

- Não commitar `_ia/input.*`, `_ia/cache/`, `.pdftmp/`, worktrees, `.DS_Store`.
- Não force-push em `main` / branches publicadas.
- Não reescrever histórico já pushado.
- Não commitar segredos, tokens, dumps de sessão do CLI.
- Preferir **um commit por feature** (ou por camada: núcleo puro → UI →
  server), não mega-commit genérico.

## Testes

### Como rodar

```bash
node tools/run-tests.mjs          # suite inteira (CI local)
node test-<area>.mjs              # um módulo
node paste-style.test.mjs         # exceção legada de nome
```

CI: `.github/workflows/test.yml` roda a suite em todo push/PR.

### Convenções

| Regra | Detalhe |
|---|---|
| Nome | `test-<conceito>.mjs` na **raiz** (padrão majoritário). Evitar `*.test.mjs` novo. |
| Stack | `node:assert` / `node:assert/strict`. **Sem** Jest/Vitest/framework. |
| Escopo | Funções **puras** e regressões que falhariam **caladas** (layout torto, escala errada, merge que perde evento). |
| Cabeçalho | Comentar no topo *o que quebraria calado sem este teste* (ver `test-timeline.mjs`, `test-bolhas.mjs`). |
| Rede | Offline: mock HTTP local se precisar (padrão de `test-llama.mjs`, `test-ia-fila.mjs`). |
| Feature nova | Se exportar lógica pura → `test-*.mjs` no **mesmo** PR. |

### O que *não* exigir no dia a dia

- Coverage % global.
- E2E de `diagramacao.js` inteiro (~8k linhas) sem extrair núcleo testável.
- Snapshot frágil de SVG gigante (prefira asserts em trechos e propriedades).

## Retrocompatibilidade e contratos

O que quebra o workflow de alguém **de verdade**:

| Contrato | Quem depende | Regra |
|---|---|---|
| `.pdgm.json` / `.pdgm.zip` (`{ v, doc }`) | projetos salvos | Campos **novos = opcionais + default** em `seedDoc` / `normalizeOpenedDoc`. Não renomear/remover sem migração. Fixture: `fixtures/pdgm-v1-minimal.json`. |
| `localStorage` + `state.doc` | sessões abertas | Defaults no load; nunca assumir campo novo presente. |
| Clipboard SVG + `#pdgm-timeline` | plugin Figma | Plugin antigo ainda precisa parsear o plano. |
| Rotas `/api/*` | UI local | Path e shape de resposta estáveis; erro legível. |
| GitHub Pages (sem server) | uso “leve” | Feature que exige backend **degrada** (some botão / gate), não quebra o app. |
| Specs em `exemplos/` | demos / regressão visual | Não “consertar” fixtures antigas sem necessidade — são memória. |

**Additive by default.** Breaking só com:

1. `v` de envelope ou migrator em `deserializeDoc` / `normalizeOpenedDoc`;
2. teste com fixture antiga no mesmo PR;
3. nota no corpo do commit.

Compatibilidade de **arquivo e de Pages** > pureza de API interna. Código
interno pode refatorar se testes e migrator cobrirem o disco.

## Código, nomenclatura e organização

### Estilo

- Arquivos: `kebab-case.js` / `kebab-case.mjs`.
- Funções puras exportáveis no módulo de domínio; DOM/UI perto do uso (ou
  `*-ui.js` quando extrair).
- Comentários: preferir *por que / o que quebraria* a JSDoc genérico.
- Sem dependências novas sem pedido explícito.

### Onde colocar coisas

| Coisa | Onde |
|---|---|
| Módulo de domínio | raiz (`chart.js`, `timeline.js`, `doc-format.js`…) |
| Teste | `test-<mesmo-conceito>.mjs` na raiz |
| Fixture de contrato | `fixtures/` |
| Scripts de dev/CI | `tools/` |
| Plugin Figma | `figma-plugin/` |
| Demos / imagens de referência | `exemplos/` |
| Artefatos de IA (não commitar input) | `_ia/` |

### Hotspots (cuidado extra)

| Arquivo | Notas |
|---|---|
| `diagramacao.js` | ~8k linhas. Extrair **só** quando a feature tocar a região; não reorganizar a árvore por estética. |
| `graficos.js` / `chart.js` | Renderer + UI; núcleo puro em `chart.js` é o que se testa. |
| `server.mjs` | Rotas de IA medidas (effort, instruções inline). Mexer sem remedir traz bug de timeout de volta — ver README. |
| `doc-format.js` | Serialização genérica de propósito; não listar campos à mão. |

**Não** criar pastas `src/` / renomear a suite “porque escala” sem ganho de
contrato. Pasta cosméticas sem extração de funções = zero escalabilidade.

## Checklist de feature nova

- [ ] Contrato identificado (ou “nenhum — só UI/interno”).
- [ ] Mudança aditiva ou com migrator + fixture.
- [ ] Teste do que quebraria calado (`test-*.mjs` ou assert no existente).
- [ ] Pages: se não há server, o fluxo ainda funciona ou degrada limpo.
- [ ] `node tools/run-tests.mjs` verde.
- [ ] Commit no formato acima (se o usuário pediu commit).

## O que este repo deliberadamente *não* tem

- Bundler / TypeScript obrigatório / monorepo.
- Framework de teste.
- Workflow de Pages via Actions (deploy é “branch root” nas Settings).
- Duplicata de regras em vários `*CONTRIBUTING*`.
