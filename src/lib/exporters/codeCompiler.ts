import type { CanvasNode } from '../studio/canvas.ts';
import { normalizeCanvasPositions, positionMode } from '../studio/canvas-position.ts';
import { normalizeIconName } from '../studio/icon-names.ts';

export type CodeTarget = 'react' | 'react-native' | 'swiftui';
const quote = (value: string) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
const swiftString = (value: string) => '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, c => `\\u{${c.charCodeAt(0).toString(16)}}`) + '"';
const indent = (value: string, depth = 1) => value.split('\n').map(line => '  '.repeat(depth) + line).join('\n');
const symbols: Record<string, string> = { Search:'magnifyingglass', MapPin:'mappin.and.ellipse', ShoppingCart:'cart', Heart:'heart', ChevronLeft:'chevron.left', ChevronRight:'chevron.right', ChevronDown:'chevron.down', ChevronUp:'chevron.up', Plus:'plus', Minus:'minus', HelpCircle:'questionmark.circle', CircleHelp:'questionmark.circle', House:'house', Home:'house', User:'person', Bell:'bell', Settings:'gearshape', Menu:'line.3.horizontal', X:'xmark', Check:'checkmark', Star:'star', ArrowLeft:'arrow.left', ArrowRight:'arrow.right', Mail:'envelope', Phone:'phone', Calendar:'calendar', Trash2:'trash', Share:'square.and.arrow.up' };

/** Pure compiler for the persisted CanvasNode AST (layout/sizing/radius are normalized upstream). */
export function compileNodeToCode(rootNodeId: string, allNodes: CanvasNode[], target: CodeTarget): string {
  const nodes = normalizeCanvasPositions({kind:'canvas', width:1, height:1, background:'#ffffff', nodes:allNodes}).nodes;
  const byId = new Map(nodes.map(node => [node.id, node]));
  if (byId.size !== nodes.length) throw new Error('Duplicate layer IDs cannot be exported.');
  const root = byId.get(rootNodeId);
  if (!root) throw new Error('The export layer no longer exists.');
  const children = new Map<string, CanvasNode[]>();
  for (const node of nodes) if (node.parentId) children.set(node.parentId, [...(children.get(node.parentId) || []), node]);
  const subtree: CanvasNode[] = [], visiting = new Set<string>();
  const walk = (node: CanvasNode) => {
    if (visiting.has(node.id)) throw new Error('A cyclic layer hierarchy cannot be exported.');
    if (node.hidden) return;
    if (visiting.size > 200) throw new Error('Layer hierarchy is too deep to export.');
    visiting.add(node.id); subtree.push(node);
    for (const child of children.get(node.id) || []) walk(child);
    visiting.delete(node.id);
  };
  walk(root);
  const visible = new Set(subtree.map(node => node.id));
  const kids = (node: CanvasNode) => (children.get(node.id) || []).filter(child => visible.has(child.id));
  const icon = (node: CanvasNode) => normalizeIconName(node.iconName);
  const inlineIcon = (node: CanvasNode) => icon(node) && !kids(node).some(child => child.type === 'icon');
  const icons = [...new Set(subtree.filter(node => node.type === 'icon' || inlineIcon(node)).map(icon).filter((name): name is string => !!name))].sort();
  const names = new Map(subtree.map((node, index) => [node.id, `node_${node.id.replace(/[^a-zA-Z0-9_]/g, '_')}_${index}`]));
  const absolute = (node: CanvasNode) => node.id !== root.id && positionMode(node) === 'absolute';
  const imageUrl = (node: CanvasNode) => {
    if (!node.imageUrl && node.assetId) throw new Error('Resolve uploaded images before compiling source code.');
    return node.imageUrl || node.imageSource?.imageUrl || '';
  };
  const color = (node: CanvasNode) => ['text','icon'].includes(node.type) ? node.fill : node.textColor || '#202b38';
  const background = (node: CanvasNode) => ['text','icon','image','line','path'].includes(node.type) ? undefined : node.fill;
  const size = (node: CanvasNode, axis: 'width'|'height') => positionMode(node) === 'absolute' || node.screen ? 'fixed' : node.sizing?.[axis] || 'fixed';
  const points = (node: CanvasNode) => node.type === 'line' ? [0,0,node.width,node.height] : node.points || [];
  const iconImports = (native: boolean) => icons.length ? `import { ${icons.map(name => `${name} as Icon${name}`).join(', ')} } from '${native ? 'lucide-react-native' : 'lucide-react'}';\n` : '';

  if (target === 'react') {
    const render = (node: CanvasNode): string => {
      const classes = ['box-border', absolute(node) ? 'absolute' : 'relative'];
      if (absolute(node)) classes.push(`left-[${node.x}px]`, `top-[${node.y}px]`);
      if (node.layout) classes.push('flex', node.layout.direction === 'row' ? 'flex-row' : 'flex-col', `gap-[${node.layout.gap}px]`, `p-[${node.layout.padding}px]`);
      else if (node.contentPadding) classes.push(`p-[${node.contentPadding}px]`);
      for (const axis of ['width','height'] as const) {
        const prefix = axis === 'width' ? 'w' : 'h', mode = size(node, axis);
        classes.push(mode === 'fixed' ? `${prefix}-[${node[axis]}px]` : mode === 'hug-contents' ? `${prefix}-fit` : `${prefix}-full`);
        if (mode === 'fill-container') classes.push('flex-1');
      }
      classes.push(node.type === 'ellipse' ? 'rounded-full' : `rounded-[${node.radius}px]`);
      if (node.type === 'image') classes.push(node.imageFit === 'contain' ? 'object-contain' : 'object-cover');
      const style = {backgroundColor:background(node), color:color(node), opacity:node.opacity, border:node.strokeWidth && node.type !== 'icon' ? `${node.strokeWidth}px solid ${node.stroke}` : undefined, fontSize:node.fontSize, fontWeight:node.fontWeight, lineHeight:node.lineHeight ?? 1.2, letterSpacing:node.letterSpacing, textAlign:node.textAlign, whiteSpace:node.type === 'text' ? 'pre-wrap' : undefined, alignItems:node.layout?.alignItems === 'start' ? 'flex-start' : node.layout?.alignItems === 'end' ? 'flex-end' : node.layout?.alignItems, justifyContent:node.layout?.justifyContent === 'start' ? 'flex-start' : node.layout?.justifyContent === 'end' ? 'flex-end' : node.layout?.justifyContent};
      const attrs = `className=${quote([...new Set(classes)].join(' '))} style={${JSON.stringify(style)}}`;
      if (node.type === 'image') return `<img src={${quote(imageUrl(node))}} alt={${quote(node.imageSource?.alt || node.name)}} crossOrigin="anonymous" ${attrs} />`;
      if (node.type === 'input') return `<div ${attrs}>${inlineIcon(node) ? `<Icon${icon(node)} size={${node.fontSize}} />` : ''}<input aria-label={${quote(node.name)}} placeholder={${quote(node.text)}} className="w-full bg-transparent" /></div>`;
      if (node.type === 'icon') return icon(node) ? `<Icon${icon(node)} ${attrs} strokeWidth={${node.strokeWidth}} />` : `<span ${attrs} />`;
      if (['line','path'].includes(node.type)) return `<svg ${attrs} viewBox="0 0 ${node.width} ${node.height}"><polyline points="${points(node).join(' ')}" fill="none" stroke=${quote(node.stroke)} strokeWidth={${node.strokeWidth}} /></svg>`;
      const tag = node.type === 'text' ? (node.fontSize >= 24 ? 'h2' : node.fontSize <= 12 ? 'span' : 'p') : node.type === 'button' ? 'button' : 'div';
      const content = [inlineIcon(node) ? `<Icon${icon(node)} size={${node.fontSize}} />` : '', node.text ? `{${quote(node.text)}}` : '', ...kids(node).map(render)].filter(Boolean).join('\n');
      return `<${tag}${tag === 'button' ? ' type="button"' : ''} ${attrs}>\n${indent(content)}\n</${tag}>`;
    };
    return `import React from 'react';\n${iconImports(false)}\nexport default function ExportedView() {\n  return (\n${indent(root.hidden ? '<></>' : render(root), 2)}\n  );\n}\n`;
  }

  if (target === 'react-native') {
    const styles: Record<string, Record<string, unknown>> = {};
    const render = (node: CanvasNode): string => {
      const key = names.get(node.id)!;
      const style: Record<string, unknown> = {position:absolute(node) ? 'absolute' : 'relative', ...(absolute(node) ? {left:node.x,top:node.y} : {}), opacity:node.opacity, backgroundColor:background(node), borderRadius:node.type === 'ellipse' ? Math.max(node.width,node.height)/2 : node.radius, borderColor:node.stroke, borderWidth:node.type === 'icon' ? 0 : node.strokeWidth};
      for (const axis of ['width','height'] as const) {
        const mode = size(node, axis);
        if (mode === 'fixed') style[axis] = node[axis];
        else if (mode === 'fill-container') {style[axis] = '100%'; style.flexGrow = 1;}
      }
      if (node.layout) Object.assign(style, {flexDirection:node.layout.direction, gap:node.layout.gap, padding:node.layout.padding, alignItems:node.layout.alignItems.replace(/^(start|end)$/, 'flex-$1'), justifyContent:node.layout.justifyContent.replace(/^(start|end)$/, 'flex-$1')});
      else if (node.contentPadding) style.padding = node.contentPadding;
      const textStyle = {color:color(node), fontSize:node.fontSize, fontWeight:String(node.fontWeight), lineHeight:node.fontSize*(node.lineHeight ?? 1.2), letterSpacing:node.letterSpacing, textAlign:node.textAlign};
      styles[key] = ['text','input'].includes(node.type) ? {...style,...textStyle} : style;
      const attr = `style={styles.${key}}`;
      if (node.type === 'image') return `<Image source={{ uri: ${quote(imageUrl(node))} }} ${attr} resizeMode="${node.imageFit || 'cover'}" accessibilityLabel={${quote(node.imageSource?.alt || node.name)}} />`;
      if (node.type === 'input') return `<TextInput ${attr} placeholder={${quote(node.text)}} accessibilityLabel={${quote(node.name)}} />`;
      if (node.type === 'icon') return icon(node) ? `<Icon${icon(node)} ${attr} color=${quote(color(node))} size={${node.width}} strokeWidth={${node.strokeWidth}} />` : `<View ${attr} />`;
      if (['line','path'].includes(node.type)) return `<Svg ${attr} viewBox="0 0 ${node.width} ${node.height}"><Polyline points="${points(node).join(' ')}" fill="none" stroke=${quote(node.stroke)} strokeWidth={${node.strokeWidth}} /></Svg>`;
      if (node.type === 'text') return `<Text ${attr}>{${quote(node.text)}}</Text>`;
      const tag = node.type === 'button' ? 'TouchableOpacity' : 'View';
      if (node.text) styles[`${key}_text`] = textStyle;
      const content = [inlineIcon(node) ? `<Icon${icon(node)} size={${node.fontSize}} color=${quote(color(node))} />` : '', node.text ? `<Text style={styles.${key}_text}>{${quote(node.text)}}</Text>` : '', ...kids(node).map(render)].filter(Boolean).join('\n');
      return `<${tag} ${attr}>\n${indent(content)}\n</${tag}>`;
    };
    const body = root.hidden ? '<View />' : render(root);
    return `import React from 'react';\nimport { View, Text, Image, TouchableOpacity, TextInput, StyleSheet } from 'react-native';\n${iconImports(true)}${subtree.some(n => ['line','path'].includes(n.type)) ? "import Svg, { Polyline } from 'react-native-svg';\n" : ''}\nexport default function ExportedView() {\n  return (\n${indent(body,2)}\n  );\n}\n\nconst styles = StyleSheet.create(${JSON.stringify(styles,null,2)});\n`;
  }

  const swiftColor = (value: string) => value === 'transparent' ? 'Color.clear' : `Color(hex: ${swiftString(value)})`;
  const weight = (node: CanvasNode) => node.fontWeight >= 700 ? '.bold' : node.fontWeight >= 600 ? '.semibold' : node.fontWeight >= 500 ? '.medium' : '.regular';
  const sfIcon = (node: CanvasNode) => `Image(systemName: ${swiftString(symbols[icon(node) || ''] || 'questionmark.circle')})`;
  const renderSwift = (node: CanvasNode): string => {
    let view: string;
    const stack = (items: string[]) => `${node.layout?.direction === 'row' ? 'HStack(alignment: .center' : 'VStack(alignment: .leading'}, spacing: CGFloat(${node.layout?.gap || 0})) {\n${indent(items.join('\n'))}\n}`;
    if (node.type === 'text') view = `Text(verbatim: ${swiftString(node.text)})`;
    else if (node.type === 'input') view = `TextField(${swiftString(node.text)}, text: .constant(""))`;
    else if (node.type === 'icon') view = sfIcon(node);
    else if (node.type === 'image') {
      const url = imageUrl(node);
      view = url.startsWith('data:') ? `EmbeddedExportImage(base64: ${swiftString(url.split(',')[1] || '')})` : `AsyncImage(url: URL(string: ${swiftString(url)})) { image in\n  image.resizable().scaledTo${node.imageFit === 'contain' ? 'Fit' : 'Fill'}()\n} placeholder: {\n  Color.gray.opacity(0.2)\n}`;
    } else if (['line','path'].includes(node.type)) {
      const p = points(node), commands: string[] = [];
      for (let i=0;i+1<p.length;i+=2) commands.push(`path.${i ? 'addLine(to:' : 'move(to:'} CGPoint(x: ${p[i]}, y: ${p[i+1]}))`);
      view = `Path { path in\n${indent(commands.join('\n'))}\n}\n.stroke(${swiftColor(node.stroke)}, lineWidth: CGFloat(${node.strokeWidth}))`;
    } else {
      const auto = kids(node).filter(child => !absolute(child));
      const positioned = kids(node).filter(absolute);
      const content = [inlineIcon(node) ? sfIcon(node) : '', node.text ? `Text(verbatim: ${swiftString(node.text)})` : '', ...auto.map(renderSwift)].filter(Boolean);
      view = content.length ? stack(content) : 'Color.clear';
      if (positioned.length) view = `ZStack(alignment: .topLeading) {\n${indent([view,...positioned.map(renderSwift)].join('\n'))}\n}`;
      if (node.type === 'button') view = `Button(action: {}) {\n${indent(view)}\n}`;
    }
    if (node.layout?.padding || node.contentPadding) view += `\n.padding(CGFloat(${node.layout?.padding || node.contentPadding}))`;
    const fixed = (['width','height'] as const).filter(axis => size(node,axis) === 'fixed').map(axis => `${axis}: CGFloat(${node[axis]})`);
    if (fixed.length) view += `\n.frame(${fixed.join(', ')}, alignment: .topLeading)`;
    const fill = (['width','height'] as const).filter(axis => size(node,axis) === 'fill-container').map(axis => `${axis === 'width' ? 'maxWidth' : 'maxHeight'}: .infinity`);
    if (fill.length) view += `\n.frame(${fill.join(', ')}, alignment: .leading)`;
    view += `\n.font(.system(size: CGFloat(${node.fontSize}), weight: ${weight(node)}))\n.foregroundStyle(${swiftColor(color(node))})`;
    if (background(node)) view += `\n.background(${swiftColor(background(node)!)})`;
    view += `\n.clipShape(${node.type === 'ellipse' ? 'Ellipse()' : `RoundedRectangle(cornerRadius: CGFloat(${node.radius}))`})`;
    if (node.strokeWidth && !['icon','line','path'].includes(node.type)) view += `\n.overlay(RoundedRectangle(cornerRadius: CGFloat(${node.radius})).stroke(${swiftColor(node.stroke)}, lineWidth: CGFloat(${node.strokeWidth})))`;
    view += `\n.opacity(${node.opacity})`;
    if (absolute(node)) view += `\n.offset(x: CGFloat(${node.x}), y: CGFloat(${node.y}))`;
    return view;
  };
  const embedded = subtree.some(node => node.type === 'image' && imageUrl(node).startsWith('data:'));
  return `import SwiftUI\n${embedded ? '#if canImport(UIKit)\nimport UIKit\n#elseif canImport(AppKit)\nimport AppKit\n#endif\n' : ''}\nstruct ExportedView: View {\n  var body: some View {\n${indent(root.hidden ? 'EmptyView()' : renderSwift(root),2)}\n  }\n}\n\nprivate extension Color {\n  init(hex: String) {\n    let raw = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))\n    let value = UInt64(raw, radix: 16) ?? 0\n    self.init(.sRGB, red: Double((value >> 16) & 255) / 255, green: Double((value >> 8) & 255) / 255, blue: Double(value & 255) / 255, opacity: 1)\n  }\n}\n${embedded ? embeddedSwift : ''}`;
}

const embeddedSwift = `
private struct EmbeddedExportImage: View {
  let base64: String
  var body: some View {
    if let data = Data(base64Encoded: base64) {
      #if canImport(UIKit)
      if let image = UIImage(data: data) { Image(uiImage: image).resizable().scaledToFill() }
      #elseif canImport(AppKit)
      if let image = NSImage(data: data) { Image(nsImage: image).resizable().scaledToFill() }
      #endif
    }
  }
}
`;
