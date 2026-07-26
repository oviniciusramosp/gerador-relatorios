/* Plugin da Paradigma: plano da timeline (JSON) -> frames com AUTO-LAYOUT.
 *
 * Por que existe: auto-layout não cabe em SVG nem em nenhum formato de clipboard
 * público — o formato nativo do Figma é binário proprietário. Colar o SVG dá
 * camadas vetoriais; só a API de plugin (layoutMode) dá auto-layout de verdade.
 *
 * O plano vem do gerador (timeline.js → figmaPlan), embutido num <metadata> do
 * próprio SVG copiado. Aqui não há regra de design nenhuma: cor, medida e o SVG
 * de cada ícone chegam prontos, este arquivo só empilha nós.
 *
 * Estrutura montada (tudo auto-layout, menos o eixo):
 *   Linha do Tempo            VERTICAL, padding pad, gap gap
 *     ├─ Cabeçalho            VERTICAL, itens centralizados
 *     └─ Eventos              VERTICAL, gap gap   ← o eixo mora aqui, ABSOLUTE
 *          └─ Evento N        HORIZONTAL, centro, gap conn
 *               ├─ col. esq.  (card ou espaçador)
 *               ├─ nó         elipse + ícone
 *               └─ col. dir.  (card ou espaçador)
 */
figma.showUI(__html__, { width: 380, height: 320 });

const solid = (c) => [{ type: 'SOLID', color: { r: c.r, g: c.g, b: c.b }, opacity: c.a }];

async function fonts() {
  // IBM Plex Sans é a fonte da casa; se não estiver instalada no Figma, cai pra
  // Inter (sempre presente) em vez de estourar o plugin.
  const tries = [
    { family: 'IBM Plex Sans', styles: ['Regular', 'SemiBold'] },
    { family: 'Inter', styles: ['Regular', 'Semi Bold'] },
  ];
  for (const t of tries) {
    try {
      await Promise.all(t.styles.map((style) => figma.loadFontAsync({ family: t.family, style })));
      return { family: t.family, regular: t.styles[0], bold: t.styles[1] };
    } catch (e) { /* tenta a próxima */ }
  }
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  return { family: 'Inter', regular: 'Regular', bold: 'Regular' };
}

function textNode(F, str, { size, color, bold, spacing, align, width }) {
  const t = figma.createText();
  t.fontName = { family: F.family, style: bold ? F.bold : F.regular };
  t.fontSize = size;
  t.characters = str;
  t.fills = solid(color);
  if (spacing) t.letterSpacing = { unit: 'PIXELS', value: spacing };
  if (align) t.textAlignHorizontal = align;
  if (width) { t.resize(width, t.height); t.textAutoResize = 'HEIGHT'; }
  else t.textAutoResize = 'WIDTH_AND_HEIGHT';
  return t;
}

function frame(name, mode, opts = {}) {
  const f = figma.createFrame();
  f.name = name;
  f.layoutMode = mode;                       // 'VERTICAL' | 'HORIZONTAL' | 'NONE'
  f.fills = opts.fill ? solid(opts.fill) : [];
  f.clipsContent = false;
  if (mode !== 'NONE') {
    f.primaryAxisSizingMode = opts.primary || 'AUTO';     // AUTO = hug
    f.counterAxisSizingMode = opts.counter || 'AUTO';
    f.itemSpacing = opts.gap || 0;
    f.paddingTop = f.paddingBottom = opts.padY || 0;
    f.paddingLeft = f.paddingRight = opts.padX || 0;
    f.counterAxisAlignItems = opts.crossAlign || 'MIN';   // MIN | CENTER | MAX
    f.primaryAxisAlignItems = opts.mainAlign || 'MIN';
  }
  if (opts.radius) f.cornerRadius = opts.radius;
  if (opts.stroke) { f.strokes = solid(opts.stroke); f.strokeWeight = 1; }
  return f;
}

function build(plan) {
  return fonts().then((F) => {
    const { cor, med, txt, op } = plan;
    const horiz = plan.layout === 'horizontal';

    const root = frame('Linha do Tempo', 'VERTICAL', {
      fill: cor.surface || undefined, gap: med.pad * 0.7,
      padX: med.pad, padY: med.pad, crossAlign: 'CENTER',
    });

    // — cabeçalho —
    if (txt.range || txt.title || txt.subtitle) {
      const head = frame('Cabeçalho', 'VERTICAL', { gap: 6, crossAlign: 'CENTER' });
      if (txt.range) head.appendChild(textNode(F, txt.range, { size: med.fs.eyebrow, color: cor.accent, bold: true, spacing: med.fs.eyebrow * 0.22, align: 'CENTER' }));
      if (txt.title) head.appendChild(textNode(F, txt.title, { size: med.fs.title, color: cor.ink, bold: true, align: 'CENTER' }));
      if (txt.subtitle) head.appendChild(textNode(F, txt.subtitle, { size: med.fs.sub, color: cor.muted, align: 'CENTER' }));
      const rule = figma.createRectangle();
      rule.name = 'Régua'; rule.resize(52, 1.5); rule.fills = solid(cor.accent); rule.opacity = 0.55;
      head.appendChild(rule);
      root.appendChild(head);
    }

    // — eventos —
    const corpo = frame('Eventos', horiz ? 'HORIZONTAL' : 'VERTICAL', {
      gap: horiz ? 20 : med.gap, crossAlign: horiz ? 'CENTER' : 'CENTER',
    });

    const cardOf = (ev, align) => {
      const card = frame('Card', 'VERTICAL', {
        gap: med.dateGap, padX: med.cardPad, padY: med.cardPad,
        fill: op.card ? cor.card : undefined, stroke: op.card ? cor.cardStroke : undefined,
        radius: med.radius, counter: 'FIXED', crossAlign: align === 'RIGHT' ? 'MAX' : 'MIN',
      });
      card.resize(med.cardW, card.height);
      if (ev.date) card.appendChild(textNode(F, ev.date, { size: med.fs.date, color: cor.accent, bold: true, spacing: med.fs.date * 0.14, align, width: med.cardW - 2 * med.cardPad }));
      if (ev.text) card.appendChild(textNode(F, ev.text, { size: med.fs.text, color: cor.ink, align, width: med.cardW - 2 * med.cardPad }));
      return card;
    };

    const nodeOf = (ev) => {
      const cell = frame('Nó', 'NONE');
      cell.resize(med.node, med.node);
      const ring = figma.createEllipse();
      ring.name = 'Anel'; ring.resize(med.node, med.node);
      ring.fills = cor.surface ? solid(cor.surface) : [];
      ring.strokes = solid(cor.accent); ring.strokeWeight = 1.6;
      cell.appendChild(ring);
      if (ev.svg) {
        const g = figma.createNodeFromSvg(ev.svg);
        g.name = 'Ícone';
        g.x = (med.node - g.width) / 2; g.y = (med.node - g.height) / 2;
        cell.appendChild(g);
      } else if (ev.badge) {
        const b = textNode(F, ev.badge, { size: med.fs.badge, color: cor.accent, bold: true });
        b.x = (med.node - b.width) / 2; b.y = (med.node - b.height) / 2;
        cell.appendChild(b);
      } else {
        const dot = figma.createEllipse();
        dot.resize(med.node * 0.3, med.node * 0.3);
        dot.x = med.node * 0.35; dot.y = med.node * 0.35;
        dot.fills = solid(cor.accent);
        cell.appendChild(dot);
      }
      return cell;
    };

    for (const ev of plan.events) {
      const row = frame('Evento', horiz ? 'VERTICAL' : 'HORIZONTAL', {
        gap: med.conn, crossAlign: 'CENTER',
      });
      const vazio = () => {
        // espaçador do lado sem card: mantém o eixo no centro sem posição absoluta
        const s = frame('—', 'NONE');
        s.resize(horiz ? med.cardW : med.cardW, horiz ? 1 : 1);
        s.fills = [];
        return s;
      };
      if (horiz) {
        if (ev.side === 'above') { row.appendChild(cardOf(ev, 'LEFT')); row.appendChild(nodeOf(ev)); }
        else { row.appendChild(nodeOf(ev)); row.appendChild(cardOf(ev, 'LEFT')); }
      } else if (ev.side === 'right') {
        row.appendChild(vazio()); row.appendChild(nodeOf(ev)); row.appendChild(cardOf(ev, 'LEFT'));
      } else {
        row.appendChild(cardOf(ev, 'RIGHT')); row.appendChild(nodeOf(ev)); row.appendChild(vazio());
      }
      corpo.appendChild(row);
    }
    root.appendChild(corpo);

    // — eixo — (o único elemento fora do fluxo: atravessa todas as linhas)
    if (plan.events.length) {
      const eixo = figma.createRectangle();
      eixo.name = 'Eixo';
      if (horiz) eixo.resize(Math.max(1, corpo.width - med.cardW), 1.6);
      else eixo.resize(1.6, Math.max(1, corpo.height - med.node));
      eixo.fills = solid(cor.accent); eixo.opacity = 0.45;
      corpo.appendChild(eixo);
      eixo.layoutPositioning = 'ABSOLUTE';
      if (horiz) { eixo.x = med.cardW / 2; eixo.y = corpo.height / 2; }
      else { eixo.x = corpo.width / 2 - 0.8; eixo.y = med.node / 2; }
      corpo.insertChild(0, eixo);
    }

    if (txt.source) root.appendChild(textNode(F, txt.source, { size: med.fs.src, color: cor.faint, align: 'CENTER' }));

    // centro da viewport, selecionado — o usuário já vê onde caiu
    root.x = Math.round(figma.viewport.center.x - root.width / 2);
    root.y = Math.round(figma.viewport.center.y - root.height / 2);
    figma.currentPage.appendChild(root);
    figma.currentPage.selection = [root];
    figma.viewport.scrollAndZoomIntoView([root]);
    return root;
  });
}

// Aceita o SVG copiado do gerador (plano no <metadata>) ou o JSON do plano cru.
function extractPlan(raw) {
  const s = String(raw || '').trim();
  if (!s) throw new Error('cole o conteúdo copiado do gerador');
  const md = /<metadata id="pdgm-timeline">([\s\S]*?)<\/metadata>/.exec(s);
  const json = md
    ? md[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    : s;
  let plan;
  try { plan = JSON.parse(json); } catch (e) {
    throw new Error(md ? 'metadata inválido no SVG' : 'não achei o plano — copie de novo com "Copiar para o Figma"');
  }
  if (!plan || plan.v !== 1 || !Array.isArray(plan.events)) throw new Error('formato de plano desconhecido');
  return plan;
}

figma.ui.onmessage = (msg) => {
  if (msg.type !== 'build') return;
  let plan;
  try { plan = extractPlan(msg.raw); }
  catch (e) { figma.ui.postMessage({ type: 'erro', msg: String(e.message || e) }); return; }
  build(plan).then(
    (root) => figma.ui.postMessage({ type: 'ok', msg: `${plan.events.length} eventos · ${Math.round(root.width)}×${Math.round(root.height)} px` }),
    (e) => figma.ui.postMessage({ type: 'erro', msg: String((e && e.message) || e) }),
  );
};
