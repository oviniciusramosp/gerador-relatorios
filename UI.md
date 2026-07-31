# UI.md — tokens, componentes e regra anti-retrabalho

**Contrato de UI do gerador.** Humanos e LLMs leem este arquivo **antes** de
criar ou copiar interface em Diagramador, Stories, Gráficos ou Timelines.

Catálogo vivo (storybook sem build): [`ui/catalog.html`](ui/catalog.html)  
Registry machine-readable: [`ui/registry.js`](ui/registry.js)  
Tokens/CSS base: [`paradigma.css`](paradigma.css)

---

## Regra de ouro (obrigatória)

```
Antes de escrever HTML/CSS/JS de UI:

1. Abrir ui/registry.js (ou este UI.md)
2. Se o componente está status: "ready" → IMPORTAR. Não reimplementar.
3. Se está "partial" → copiar o contrato do app canônico e, se tocar,
   extrair para módulo + registrar + demo no catálogo no MESMO PR.
4. Se não existe → criar no módulo compartilhado (não no monólito),
   registrar em ui/registry.js, demo em ui/catalog.html, link no UI.md.
```

**Proibido:**

- Reimplementar `widthSeg` / `COL_ICON` / `uiIco` / swatch / segment com paths
  ou CSS locais “parecidos”.
- `height: var(--ctrl-h)` em botão **dentro** de `.segment` (quebra a pílula:
  o container já tem `--ctrl-h` + padding 2px).
- Labels de campo em cor/tamanho de body em vez de `.field` (muted `.74rem`).
- Popover com `box-shadow`/`border` reinventados — use `.float-panel` /
  `.float-menu`.

**Por que isso existe:** o monólito `diagramacao.js` esconde pedaços de UI.
Copiar “de olho” gera drift (Stories × Diagramador). Extrair + importar é o
único caminho estável.

---

## Stack (sem Storybook npm)

| Escolha | Motivo |
|---|---|
| HTML + ES modules | Mesma premissa do Pages / AGENTS.md |
| `ui/catalog.html` | Catálogo vivo, zero build |
| `ui/registry.js` | Lista canônica para LLMs (`status`, `importHint`, `never`) |
| `paradigma.css` | Tokens + shells CSS compartilhados |

Não introduzir Vite/Storybook npm sem pedido explícito — quebra Pages.

---

## Tokens (`paradigma.css` `:root`)

| Token | Uso |
|---|---|
| `--ground` | Fundo app `#0E0C1B` |
| `--violet` | Primário / selecionado `#4E39FF` |
| `--lilac` | Secundário / ícones muted `#BAB1FF` |
| `--mint` | Sucesso / switch on `#29E899` |
| `--ink` | Texto `#FFFFFF` |
| `--hair` / `--hair-strong` | Bordas |
| `--muted` | Rótulos de campo |
| `--r` | Raio genérico (6px) |
| `--ctrl-h` | Altura de input/select/segment (2rem) |
| `--ctrl-r` | Raio de controles (9px) |
| `--ctrl-pad-x` | Padding horizontal de controles |

**Nunca** hardcodar violet/lilac se o token existe. Exceção: anel de foco no
canvas claro do miolo (`#4E39FF` no papel branco) — documentado no registry
`focus-ring`.

---

## Componentes ready (importar)

| id | Módulo / CSS | Import |
|---|---|---|
| `tokens` | `paradigma.css` | `<link href="paradigma.css">` |
| `segment` | `.segment` | HTML |
| `widthSeg` | `ui-segment.js` | `import { widthSeg, COL_ICON, ALIGN_ICON } from './ui-segment.js'` |
| `field` | `.field` | HTML |
| `fieldbtn` | `.fieldbtn` | HTML |
| `float-panel` | `.float-panel` | HTML class no popover |
| `float-menu` | `.float-menu` | HTML class no menu Baixar |
| `swatch` | `swatch.js` | `openSwatchPop` |
| `range-snap` | `range-snap.js` | `enhanceAll(root)` |
| `ui-icons` | `ui-icons.js` | `registerUiIcons(); uiIco('menu', 18)` |
| `notion-handles` | `ui-handles.js` | `createBlockHandles({ onMenuAction, … })` |
| `fmtbar` | `ui-fmtbar.js` | `ensureFmtbarChrome({ captionMode: true, withLink: false })` — Stories sem hyperlink |
| `editor-shell` | `ui-shell.js` | `bindEditorShell({ onZoomFit, onZoomPct, … })` + `body.app-editor` |
| `focus-ring` | `.focus-ring` | class no bloco selecionado |
| `app-nav` | `app-nav.js` | `initAppNav()` |
| `feedback` | `feedback.js` | `initFeedback()` |
| `icon-pop` | `icon-pop.js` | `openIconPop` |

Lista completa e demos: **ui/catalog.html**.

---

## Partial / planejado (não inventar fork)

| id | Situação | Próximo passo |
|---|---|---|
| — | Shell/handles/fmtbar **ready** | Opcional: Diagramador chamar `bindEditorShell` e apagar CSS local de header/sidebar |

---

## Padrões de implementação

### Segment de ícones (Posição / Alinhamento)

```js
import { widthSeg, COL_ICON, ALIGN_ICON } from './ui-segment.js';

slot.append(widthSeg(cur, [
  { val: 'left', label: 'Coluna Esquerda', icon: COL_ICON.left },
  { val: 'full', label: 'Largura Total', icon: COL_ICON.full },
  { val: 'right', label: 'Coluna Direita', icon: COL_ICON.right },
], (v) => { /* … */ }));
```

- 3 opções → classe `.cols-3` (automática no `widthSeg`).
- Labels de `title` no botão: usar os mesmos strings do Diagramador.
- **Não** setar `height` no botão do segment.

### Popover de bloco

```html
<div id="imgPanel" class="float-panel" hidden></div>
```

Conteúdo: `.eyebrow` + `.field` + ranges com `enhanceAll` + `.fieldbtn`.

### Ícones de chrome

```js
import { registerUiIcons, uiIco } from './ui-icons.js';
registerUiIcons();
btn.innerHTML = uiIco('menu', 18, 'outline');
```

### Anel de foco

Mesmo anel texto/imagem: `inset: -5px -7px`, `border: 2px` violet 50%,
`border-radius: 8px` via `.focus-ring` ou seletor equivalente. Sem padding
grande no bloco só para “afastar” o ring.

### Shell do editor

```js
import { bindEditorShell } from './ui-shell.js';
// body class="app-editor" + HTML com ids canônicos (ver ui-shell.js header)
const shell = bindEditorShell({
  onZoomFit() { state.zoom = 'fit'; applyZoom(); },
  onZoomPct(pct) { state.zoom = pct / 100; applyZoom(); },
  onSidebarChange() { if (state.zoom === 'fit') applyZoom(); },
});
```

- CSS: `body.app-editor` em `paradigma.css` (não recriar header/sidebar no app).
- Topbar: menu | título (app-nav) | zoom centro | undo/redo | Baixar.
- Novo/Abrir na **sidebar** Configurações, não na topbar.
- Referência migrada: `stories.html` / `stories.js`.

---

## Copy de ajuda / instruções na UI

**Não inventar textos de instrução** (`.hint`, parágrafos “como usar”,
legendas didáticas) sem pedido explícito do usuário.

- O produto prioriza UI enxuta; o usuário pede copy de ajuda quando quiser.
- Quando for necessário explicar um controle: preferir **`title` / tooltip**
  (e `aria-label` quando o botão é só ícone), **não** um parágrafo visível
  permanente na sidebar.
- Hints já existentes no repo não são licença pra criar novos “iguais”.

---

## Checklist de feature de UI (LLM)

- [ ] Consultei `ui/registry.js` / este `UI.md`?
- [ ] Componente `ready` → importei, não copiei?
- [ ] **Sem** parágrafo de instrução novo (salvo pedido); ajuda → tooltip/`title`?
- [ ] CSS novo é aditivo no `paradigma.css` (ou justificado como específico do domínio)?
- [ ] Se extraí algo do monólito: registry + demo no catálogo no mesmo PR?
- [ ] Stories/Diagramador não divergem no mesmo controle (segment, field, panel)?
- [ ] `node tools/run-tests.mjs` verde (incl. `test-ui-registry.mjs`)?

---

## Onde colocar coisas novas

| Coisa | Onde |
|---|---|
| Token / shell CSS reutilizado | `paradigma.css` |
| Lógica de UI reutilizada | raiz `ui-*.js` ou módulo existente |
| Registry + demo | `ui/registry.js` + `ui/catalog.js` |
| Domínio do editor (paginação, stories-core) | `*-core.js` / monólito com teste |
| Doc de UI | **este arquivo** (não duplicar em CLAUDE.md) |

---

## Histórico do problema (contexto para agentes)

Stories reimplementou shell/segment/handles “parecidos” com o Diagramador
em vez de importar. Sintomas: segment com height estourado, labels sem
`.field`, alças no hover errado, anéis de foco diferentes. Mitigação: este
documento + catálogo + registry + extrações (`ui-segment.js`, `ui-icons.js`,
`.float-panel`).
