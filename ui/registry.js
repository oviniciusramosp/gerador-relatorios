/* Registry canônico de UI — legível por humanos e por LLMs.
 *
 * Antes de criar botão, segment, popover, alça, swatch, etc.:
 *   1. ler este arquivo (ou UI.md)
 *   2. importar o módulo listado
 *   3. se não existir → extrair do monólito + registrar aqui + demo no catálogo
 *
 * NUNCA reimplementar um id já listado com status "ready".
 */

/**
 * @typedef {'ready'|'partial'|'planned'} UiStatus
 * @typedef {{
 *   id: string,
 *   title: string,
 *   status: UiStatus,
 *   module: string|null,
 *   css: string[],
 *   when: string,
 *   never: string,
 *   importHint: string,
 *   apps: string[],
 *   demo?: string,
 * }} UiComponent
 */

/** @type {UiComponent[]} */
export const UI_REGISTRY = [
  {
    id: 'tokens',
    title: 'Design tokens',
    status: 'ready',
    module: null,
    css: ['paradigma.css :root'],
    when: 'Qualquer cor, raio, altura de controle, tipografia de UI',
    never: 'Hex solto (#4E39FF) ou rem solto onde existe token (--violet, --ctrl-h)',
    importHint: 'link rel=stylesheet href=paradigma.css',
    apps: ['todos'],
    demo: 'tokens',
  },
  {
    id: 'segment',
    title: 'Segment control (texto)',
    status: 'ready',
    module: null,
    css: ['.segment', '.segment.cols-3', 'paradigma.css'],
    when: '2–3 opções exclusivas com rótulo (Configurações/Conteúdo, modos)',
    never: 'Recriar grid de botões com border própria; altura diferente de --ctrl-h',
    importHint: 'HTML: <div class="segment">…</div>',
    apps: ['diagramacao', 'stories', 'graficos'],
    demo: 'segment',
  },
  {
    id: 'widthSeg',
    title: 'Segment de ícones (Posição / Alinhamento)',
    status: 'ready',
    module: 'ui-segment.js',
    css: ['.segment.iconseg', '.segment.cols-3', 'paradigma.css'],
    when: 'Posição de coluna, alinhamento de texto, logo pos — só ícone',
    never: 'Copiar COL_ICON/ALIGN_ICON/widthSeg no app; height:var(--ctrl-h) no botão',
    importHint: "import { widthSeg, COL_ICON, ALIGN_ICON } from './ui-segment.js'",
    apps: ['diagramacao', 'stories'],
    demo: 'widthSeg',
  },
  {
    id: 'field',
    title: 'Field (rótulo + controle)',
    status: 'ready',
    module: null,
    css: ['.field', 'label.field', 'paradigma.css'],
    when: 'Qualquer controle em formulário/sidebar/popover (rótulo muted .74rem)',
    never: 'div sem .field com label em cor ink/tamanho de body',
    importHint: '<div class="field">Posição …</div> ou <label class="field">',
    apps: ['todos'],
    demo: 'field',
  },
  {
    id: 'fieldbtn',
    title: 'Field button',
    status: 'ready',
    module: null,
    css: ['.fieldbtn', '.fieldbtn.danger', 'paradigma.css'],
    when: 'Ação em painel (Substituir, Remover, Em Branco…)',
    never: 'button genérico com estilos one-off no HTML do app',
    importHint: '<button type="button" class="fieldbtn">…</button>',
    apps: ['diagramacao', 'stories'],
    demo: 'fieldbtn',
  },
  {
    id: 'float-panel',
    title: 'Painel flutuante (popover de bloco)',
    status: 'ready',
    module: null,
    css: ['.float-panel', 'paradigma.css'],
    when: 'Popover ancorado no bloco (imagem, texto, capa, estilo de tipo…)',
    never: 'Redefinir box-shadow/borda/width em #imgPanel local — use class float-panel',
    importHint: '<div id="imgPanel" class="float-panel" hidden>',
    apps: ['diagramacao', 'stories'],
    demo: 'float-panel',
  },
  {
    id: 'float-menu',
    title: 'Menu flutuante (Baixar / +)',
    status: 'ready',
    module: null,
    css: ['.float-menu', 'paradigma.css'],
    when: 'Menu de ações curtas (PDF/ZIP, Texto|Imagem)',
    never: 'Copiar CSS de #downloadMenu em cada HTML',
    importHint: '<div id="downloadMenu" class="float-menu" hidden>',
    apps: ['diagramacao', 'stories'],
    demo: 'float-menu',
  },
  {
    id: 'swatch',
    title: 'Swatch de cor',
    status: 'ready',
    module: 'swatch.js',
    css: ['injetado por swatch.js'],
    when: 'Qualquer escolha de cor (página, texto, logo, marca…)',
    never: 'input[type=color] cru ou picker próprio',
    importHint: "import { openSwatchPop, parseColor } from './swatch.js'",
    apps: ['todos'],
    demo: 'swatch',
  },
  {
    id: 'range-snap',
    title: 'Range com snap + valor editável',
    status: 'ready',
    module: 'range-snap.js',
    css: ['.range-snap', '.field-edit', 'paradigma.css'],
    when: 'Slider numérico (zoom, escala, raio, tamanho…)',
    never: 'range sem data-snaps / enhanceAll; valor solto sem .field-row',
    importHint: "import { enhanceAll } from './range-snap.js'; enhanceAll(root)",
    apps: ['todos'],
    demo: 'range-snap',
  },
  {
    id: 'ui-icons',
    title: 'Ícones Ionicons (uiIco)',
    status: 'ready',
    module: 'ui-icons.js',
    css: [],
    when: 'Ícone de chrome (menu, undo, expand, trash, reorder…)',
    never: 'Path SVG inventado no HTML do app para o mesmo conceito Ionicons',
    importHint: "import { registerUiIcons, uiIco } from './ui-icons.js'; registerUiIcons()",
    apps: ['diagramacao', 'stories', 'graficos'],
    demo: 'ui-icons',
  },
  {
    id: 'focus-ring',
    title: 'Anel de foco de bloco',
    status: 'ready',
    module: null,
    css: ['.focus-ring', 'paradigma.css'],
    when: 'Bloco selecionado (texto/imagem) — outline arredondado fora do box',
    never: 'outline:1.5px no texto e 2px na imagem; padding grande pra “afastar” o ring',
    importHint: 'class="… focus-ring" ou ::after com inset -5px -7px (mesmo token)',
    apps: ['diagramacao', 'stories'],
    demo: 'focus-ring',
  },
  {
    id: 'app-nav',
    title: 'Nav entre ferramentas',
    status: 'ready',
    module: 'app-nav.js',
    css: ['injetado por app-nav.js'],
    when: 'Header de qualquer ferramenta do gerador',
    never: 'Menu de apps reinventado por página',
    importHint: "import { initAppNav } from './app-nav.js'; initAppNav()",
    apps: ['todos'],
  },
  {
    id: 'feedback',
    title: 'Feedback / report',
    status: 'ready',
    module: 'feedback.js',
    css: ['injetado por feedback.js'],
    when: 'Botão de reportar problema',
    never: 'Form de feedback one-off',
    importHint: "import { initFeedback } from './feedback.js'; initFeedback()",
    apps: ['todos'],
  },
  {
    id: 'icon-pop',
    title: 'Picker de ícone',
    status: 'ready',
    module: 'icon-pop.js',
    css: ['.icon-pop', 'paradigma.css'],
    when: 'Escolher ícone Ionicons (timeline, bolhas, callout)',
    never: 'Lista de ícones inline no app',
    importHint: "import { openIconPop, paintIconBtn } from './icon-pop.js'",
    apps: ['timelines', 'graficos', 'diagramacao'],
  },
  {
    id: 'notion-handles',
    title: 'Alças Notion (+ / ⠿)',
    status: 'ready',
    module: 'ui-handles.js',
    css: ['#bhandle', '#badd', '#bmenu', 'paradigma.css'],
    when: 'Reorder/menu de bloco no editor WYSIWYG',
    never: 'Criar #bhandle no app; SVG caseiro; CSS local de alças',
    importHint: "import { createBlockHandles, HANDLE_GEOM } from './ui-handles.js'",
    apps: ['diagramacao', 'stories'],
    demo: 'notion-handles',
  },
  {
    id: 'fmtbar',
    title: 'Barra de formatação de texto',
    status: 'ready',
    module: 'ui-fmtbar.js',
    css: ['#fmtbar', '#linkedit', 'paradigma.css'],
    when: 'Marcas B/I/U/S, link (opcional), cor em contenteditable',
    never: 'Copiar markup/CSS de #fmtbar no HTML do app',
    importHint: "import { ensureFmtbarChrome } from './ui-fmtbar.js'; // Stories: withLink: false",
    apps: ['diagramacao', 'stories'],
    demo: 'fmtbar',
  },
  {
    id: 'editor-shell',
    title: 'Shell do editor (header + sidebar + zoom + segment)',
    status: 'ready',
    module: 'ui-shell.js',
    css: ['body.app-editor', 'paradigma.css'],
    when: 'Ferramenta com topbar + sidebar 320 + zoom + segment Configurações/Conteúdo',
    never: 'Reimplementar CSS de header/sidebar/zoom; inventar topbar com Novo/Abrir; grid 300px collapse abrupto',
    importHint: "import { bindEditorShell } from './ui-shell.js'; bindEditorShell({ onZoomFit, onZoomPct, onSidebarChange })",
    apps: ['stories', 'diagramacao (contrato HTML; wiring parcial)'],
    demo: 'editor-shell',
  },
];

export function uiById(id) {
  return UI_REGISTRY.find((c) => c.id === id) || null;
}

export function uiReady() {
  return UI_REGISTRY.filter((c) => c.status === 'ready');
}

export function uiPartialOrPlanned() {
  return UI_REGISTRY.filter((c) => c.status !== 'ready');
}
