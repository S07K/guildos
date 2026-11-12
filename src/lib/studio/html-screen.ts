/**
 * HTML screens: a screen is an ordered list of sections, each a fragment of
 * HTML styled with Tailwind utility classes. The model writes one section at a
 * time; GuildOS sanitises it, compiles the Tailwind it uses (html-screen-css.ts)
 * and renders the composed document in a script-free sandboxed iframe.
 * See docs/section-pipeline-redesign.md §6.
 */

export type HtmlDevice = 'mobile' | 'tablet' | 'desktop';
export const HTML_DEVICE_FRAME: Record<HtmlDevice, { width: number; height: number }> = { mobile: { width: 375, height: 812 }, tablet: { width: 768, height: 1024 }, desktop: { width: 1440, height: 900 } };
export const HTML_SECTION_KINDS = ['app-header', 'hero', 'category-chips', 'product-list', 'product-grid', 'feature-row', 'cta-banner', 'bottom-nav', 'footer', 'form', 'content', 'custom'] as const;
export type HtmlSectionKind = typeof HTML_SECTION_KINDS[number];
type HtmlSectionStatus = 'planned' | 'ready' | 'failed';
export type HtmlSection = { id: string; kind: HtmlSectionKind; intent?: string; html: string; status: HtmlSectionStatus; error?: string };
type HtmlScreenTokens = { colors: Record<string, string>; fontSans?: string; fontDisplay?: string };
/** Class strings every section reuses so parallel sections read as one design. */
export const STYLE_RECIPES = ['eyebrow', 'display', 'heading', 'body', 'muted', 'card', 'primary_button', 'secondary_button', 'chip', 'price', 'icon_button', 'input'] as const;
export type StyleRecipes = Record<typeof STYLE_RECIPES[number], string>;
export type ImageAspect = 'square' | 'portrait' | 'landscape';
/** A planned photo. `url` is empty until generated; `source` records where it came from. */
export type ScreenImage = { id: string; section: string; prompt: string; alt: string; aspect: ImageAspect; url: string; source: 'pending' | 'generated' | 'unsplash' | 'placeholder' };
export type ScreenArt = { direction: string; recipes: StyleRecipes; images: ScreenImage[] };
export type HtmlScreenDocument = { kind: 'html-screen'; name: string; device: HtmlDevice; background: string; tokens: HtmlScreenTokens; sections: HtmlSection[]; art?: ScreenArt };

export const MAX_SECTION_HTML_BYTES = 65536;
export const MAX_SCREEN_IMAGES = 6;
export const MAX_SCREEN_SECTIONS = 24;
const sectionId = /^[a-z][a-z0-9-]{0,63}$/;
const tokenName = /^[a-z][a-z0-9-]{0,23}$/;
const hexColor = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const fontName = /^[A-Za-z0-9 ]{1,40}$/;

export const isHtmlScreen = (value: unknown): value is HtmlScreenDocument => !!value && typeof value === 'object' && (value as { kind?: unknown }).kind === 'html-screen';

/** Structural checks for a stored or agent-built screen. Returns human-readable issues; empty means valid. */
export function validateHtmlScreen(value: unknown): string[] {
 if (!isHtmlScreen(value)) return ['Expected an html-screen document.'];
 const issues: string[] = [];
 if (!(value.device in HTML_DEVICE_FRAME)) issues.push(`Unknown device "${String(value.device)}".`);
 if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80) issues.push('Screen name must be 1–80 characters.');
 if (!hexColor.test(value.background)) issues.push('Background must be a hex colour.');
 const colors = value.tokens?.colors;
 if (!colors || typeof colors !== 'object') issues.push('tokens.colors is required.');
 else for (const [name, color] of Object.entries(colors)) {
  if (!tokenName.test(name)) issues.push(`Colour token "${name}" must be lowercase kebab-case.`);
  if (typeof color !== 'string' || !hexColor.test(color)) issues.push(`Colour token "${name}" must be a hex colour.`);
 }
 for (const key of ['fontSans', 'fontDisplay'] as const) if (value.tokens?.[key] !== undefined && !fontName.test(String(value.tokens[key]))) issues.push(`${key} must be a plain font family name.`);
 if (value.art !== undefined) issues.push(...artIssues(value.art));
 if (!Array.isArray(value.sections) || !value.sections.length) return [...issues, 'A screen needs at least one section.'];
 if (value.sections.length > MAX_SCREEN_SECTIONS) issues.push(`A screen can have at most ${MAX_SCREEN_SECTIONS} sections.`);
 const seen = new Set<string>();
 for (const section of value.sections) {
  if (!sectionId.test(section?.id ?? '')) { issues.push(`Section id "${String(section?.id)}" must be lowercase kebab-case.`); continue; }
  if (seen.has(section.id)) issues.push(`Duplicate section id "${section.id}".`);
  seen.add(section.id);
  if (!HTML_SECTION_KINDS.includes(section.kind)) issues.push(`Section "${section.id}" has unknown kind "${String(section.kind)}".`);
  if (!['planned', 'ready', 'failed'].includes(section.status)) issues.push(`Section "${section.id}" has an invalid status.`);
  if (typeof section.html !== 'string') issues.push(`Section "${section.id}" html must be a string.`);
  else if (byteLength(section.html) > MAX_SECTION_HTML_BYTES) issues.push(`Section "${section.id}" exceeds ${MAX_SECTION_HTML_BYTES} bytes.`);
  else if (section.status === 'ready' && !section.html.trim()) issues.push(`Section "${section.id}" is ready but empty.`);
 }
 return issues;
}

function artIssues(art: ScreenArt): string[] {
 const issues: string[] = [];
 if (!art || typeof art !== 'object' || typeof art.direction !== 'string' || art.direction.length > 600) return ['art.direction must be a short string.'];
 for (const name of STYLE_RECIPES) if (typeof art.recipes?.[name] !== 'string' || cleanClassList(art.recipes[name]) !== art.recipes[name]) issues.push(`Style recipe "${name}" must be a list of utility classes.`);
 if (!Array.isArray(art.images) || art.images.length > MAX_SCREEN_IMAGES) return [...issues, `A screen can plan at most ${MAX_SCREEN_IMAGES} images.`];
 for (const image of art.images) {
  if (!sectionId.test(image?.id ?? '')) issues.push(`Image id "${String(image?.id)}" must be lowercase kebab-case.`);
  else if (image.url && !ALLOWED_IMAGE_PREFIXES.some(prefix => image.url.startsWith(prefix))) issues.push(`Image "${image.id}" has an unsupported URL.`);
 }
 return issues;
}

/** Keeps only tokens that are safe as utility classes; used for model-written style recipes. */
export const cleanClassList = (value: unknown) => typeof value === 'string' ? value.split(/\s+/).filter(token => token && classToken.test(token)).join(' ').slice(0, 400) : '';

// ---------------------------------------------------------------------------
// Sanitiser. An allowlist rebuild, not a blocklist strip: we tokenise the
// fragment and re-emit only known tags and attributes. The render iframe also
// has no allow-scripts and a CSP of script-src 'none'; this is defence in depth
// and keeps exported HTML clean.

const VOID = new Set(['img', 'input', 'br', 'hr']);
const SVG_LEAF = new Set(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse']);
const ALLOWED = new Set([
 'section', 'header', 'footer', 'nav', 'main', 'article', 'aside', 'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
 'a', 'button', 'img', 'figure', 'figcaption', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 's', 'small', 'sup', 'sub', 'mark',
 'label', 'input', 'textarea', 'select', 'option', 'blockquote', 'hr', 'br', 'time', 'address',
 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'svg', 'g', ...SVG_LEAF,
]);
/** Tags whose content must be dropped along with the tag. */
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'title', 'head', 'canvas', 'video', 'audio', 'math', 'foreignobject', 'xmp', 'plaintext', 'noembed', 'noframes']);
const GLOBAL_ATTRS = new Set(['class', 'id', 'role', 'title', 'aria-label', 'aria-hidden', 'aria-current', 'aria-expanded', 'aria-pressed', 'aria-selected', 'aria-describedby', 'aria-labelledby', 'tabindex']);
const TAG_ATTRS: Record<string, Set<string>> = {
 a: new Set(['href']), img: new Set(['src', 'alt', 'width', 'height', 'loading']),
 input: new Set(['type', 'placeholder', 'value', 'checked', 'disabled', 'readonly']), textarea: new Set(['placeholder', 'rows', 'disabled', 'readonly']),
 button: new Set(['type', 'disabled']), option: new Set(['value', 'selected']), select: new Set(['disabled']), label: new Set(['for']),
 time: new Set(['datetime']), th: new Set(['colspan', 'rowspan', 'scope']), td: new Set(['colspan', 'rowspan']), ol: new Set(['start']),
 svg: new Set(['viewbox', 'width', 'height', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'xmlns']),
 g: new Set(['fill', 'stroke', 'stroke-width', 'transform']),
};
const SVG_SHAPE_ATTRS = new Set(['d', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'points', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'transform', 'opacity', 'fill-rule', 'clip-rule']);
const INPUT_TYPES = new Set(['text', 'email', 'search', 'password', 'tel', 'url', 'number', 'checkbox', 'radio', 'range', 'date']);
const SVG_ATTR_CASE: Record<string, string> = { viewbox: 'viewBox' };
/** Neutral image used when a requested photo cannot be resolved. SVG inside <img> cannot run scripts. */
export const IMAGE_PLACEHOLDER = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%204%203%22%3E%3Crect%20width%3D%224%22%20height%3D%223%22%20fill%3D%22%23e5e7eb%22%2F%3E%3C%2Fsvg%3E';
/** Image sources a section may reference. Relative /api/studio/ paths resolve to the app (project assets, icons). */
const ALLOWED_IMAGE_PREFIXES = ['https://images.unsplash.com/', '/api/studio/', IMAGE_PLACEHOLDER];
const classToken = /^[A-Za-z0-9_:\-\[\]\/.#%(),!@&*+>~=]+$/;

type SanitizeReport = { html: string; removedTags: string[]; removedAttributes: string[] };

/** CSS properties manual edits may set inline. Generated sections never carry inline styles. */
const STYLE_PROPERTIES = new Set([
 'color', 'background-color', 'opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-align', 'text-decoration', 'text-transform',
 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'gap', 'display', 'flex-direction', 'justify-content', 'align-items', 'flex-wrap', 'flex', 'object-fit',
 'border', 'border-width', 'border-style', 'border-color', 'border-radius', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
 'box-shadow', 'transform', 'list-style-type',
]);
/** Keeps allow-listed declarations with plain values; anything that could load or execute is dropped. */
export function cleanInlineStyle(value: string) {
 return value.split(';').map(part => {
  const at = part.indexOf(':');
  if (at < 1) return '';
  const property = part.slice(0, at).trim().toLowerCase(), raw = part.slice(at + 1).trim();
  if (!STYLE_PROPERTIES.has(property) || !raw || raw.length > 160) return '';
  if (/url\s*\(|expression\s*\(|javascript:|[<>{}\\@]|\/\*/i.test(raw) || !/^[#a-zA-Z0-9 .,%()'"+-]+$/.test(raw)) return '';
  return `${property}: ${raw}`;
 }).filter(Boolean).join('; ');
}

export function sanitizeSectionHtml(input: string, options: { allowStyle?: boolean } = {}): SanitizeReport {
 const removedTags = new Set<string>(), removedAttributes = new Set<string>();
 let out = '', i = 0;
 const stack: string[] = [];
 const source = String(input ?? '');
 while (i < source.length) {
  const lt = source.indexOf('<', i);
  if (lt < 0) { out += escapeText(source.slice(i)); break; }
  out += escapeText(source.slice(i, lt));
  if (source.startsWith('<!--', lt)) { const end = source.indexOf('-->', lt + 4); i = end < 0 ? source.length : end + 3; continue; }
  if (source[lt + 1] === '!' || source[lt + 1] === '?') { const end = source.indexOf('>', lt); i = end < 0 ? source.length : end + 1; continue; }
  const closing = source[lt + 1] === '/';
  const nameMatch = /^[A-Za-z][A-Za-z0-9-]*/.exec(source.slice(lt + (closing ? 2 : 1)));
  if (!nameMatch) { out += '&lt;'; i = lt + 1; continue; }
  const name = nameMatch[0].toLowerCase();
  const end = tagEnd(source, lt + (closing ? 2 : 1) + nameMatch[0].length);
  const rawAttrs = source.slice(lt + (closing ? 2 : 1) + nameMatch[0].length, end < 0 ? source.length : end);
  i = end < 0 ? source.length : end + 1;
  if (closing) {
   const at = stack.lastIndexOf(name);
   if (at >= 0) while (stack.length > at) out += `</${stack.pop()}>`;
   continue;
  }
  if (DROP_WITH_CONTENT.has(name)) {
   removedTags.add(name);
   if (!/\/\s*$/.test(rawAttrs)) { const close = new RegExp(`</${name}\\s*>`, 'i').exec(source.slice(i)); i = close ? i + close.index + close[0].length : source.length; }
   continue;
  }
  if (!ALLOWED.has(name)) { removedTags.add(name); continue; }
  const attrs = sanitizeAttributes(name, rawAttrs, removedAttributes, !!options.allowStyle);
  if (VOID.has(name)) { out += `<${name}${attrs}>`; continue; }
  if (SVG_LEAF.has(name) && /\/\s*$/.test(rawAttrs)) { out += `<${name}${attrs}/>`; continue; }
  out += `<${name}${attrs}>`;
  stack.push(name);
 }
 while (stack.length) out += `</${stack.pop()}>`;
 return { html: out.trim(), removedTags: [...removedTags].sort(), removedAttributes: [...removedAttributes].sort() };
}

/** Index of the `>` that closes a tag, honouring quoted attribute values. */
function tagEnd(source: string, from: number) {
 let quote = '';
 for (let i = from; i < source.length; i++) {
  const char = source[i];
  if (quote) { if (char === quote) quote = ''; }
  else if (char === '"' || char === "'") quote = char;
  else if (char === '>') return i;
 }
 return -1;
}

function sanitizeAttributes(tag: string, raw: string, removed: Set<string>, allowStyle: boolean) {
 const pattern = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
 const kept: string[] = [];
 const seen = new Set<string>();
 let match: RegExpExecArray | null;
 while ((match = pattern.exec(raw))) {
  const name = match[1].toLowerCase();
  const value = match[2] ?? match[3] ?? match[4] ?? '';
  if (seen.has(name)) continue;
  seen.add(name);
  if (name === 'style' && allowStyle) { const style = cleanInlineStyle(decodeEntities(value)); if (style) kept.push(` style="${escapeAttribute(style)}"`); continue; }
  const allowed = GLOBAL_ATTRS.has(name) || TAG_ATTRS[tag]?.has(name) || (SVG_LEAF.has(tag) && SVG_SHAPE_ATTRS.has(name));
  if (!allowed) { removed.add(name.startsWith('on') ? 'on*' : name); continue; }
  const clean = cleanAttribute(tag, name, value);
  if (clean === null) { removed.add(`${name}(value)`); continue; }
  kept.push(clean === '' && ['checked', 'disabled', 'readonly', 'selected'].includes(name) ? ` ${name}` : ` ${SVG_ATTR_CASE[name] ?? name}="${escapeAttribute(clean)}"`);
 }
 if (tag === 'button' && !seen.has('type')) kept.push(' type="button"');
 if (tag === 'img' && !seen.has('alt')) kept.push(' alt=""');
 return kept.join('');
}

function cleanAttribute(tag: string, name: string, value: string): string | null {
 const decoded = decodeEntities(value);
 if (name === 'class') { const tokens = decoded.split(/\s+/).filter(token => token && classToken.test(token)); return tokens.length ? tokens.join(' ') : null; }
 if (name === 'id') return /^[A-Za-z][\w-]{0,63}$/.test(decoded) ? decoded : null;
 if (name === 'href') { const url = decoded.replace(/[\u0000- ]/g, ''); return /^(https:\/\/|#|mailto:|tel:)/i.test(url) ? url : null; }
 if (name === 'src') { const url = decoded.trim(); return ALLOWED_IMAGE_PREFIXES.some(prefix => url.startsWith(prefix)) && !/[\s"'<>]/.test(url) ? url : null; }
 if (name === 'type' && tag === 'input') return INPUT_TYPES.has(decoded.toLowerCase()) ? decoded.toLowerCase() : null;
 if (name === 'type' && tag === 'button') return ['button', 'submit', 'reset'].includes(decoded.toLowerCase()) ? 'button' : null;
 if (name === 'tabindex') return /^-?\d$/.test(decoded) ? decoded : null;
 if (name === 'loading') return decoded === 'lazy' || decoded === 'eager' ? decoded : null;
 if (/url\s*\(|javascript:|expression\s*\(/i.test(decoded)) return null;
 return decoded.slice(0, 2000);
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', colon: ':', tab: '\t', newline: '\n' };
function decodeEntities(value: string) {
 return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (whole, body: string) => {
  if (body[0] === '#') { const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10); return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ''; }
  return NAMED[body.toLowerCase()] ?? whole;
 });
}
const escapeText = (text: string) => text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttribute = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const byteLength = (text: string) => new TextEncoder().encode(text).length;

/**
 * Normalise what a model returned for one section: strip markdown fences, take
 * the <body> (or the single outer <section>) if a whole document came back, then
 * sanitise. Issues are phrased so they can be sent back to the model on retry.
 */
export function parseSectionHtml(raw: string): { html: string; issues: string[]; report: SanitizeReport } {
 let text = String(raw ?? '').trim().replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/, '').trim();
 const body = /<body[^>]*>([\s\S]*?)(?:<\/body>|$)/i.exec(text);
 if (body) text = body[1];
 const report = sanitizeSectionHtml(text);
 const issues: string[] = [];
 if (!report.html) issues.push('The section is empty. Return one HTML fragment for this section.');
 if (byteLength(report.html) > MAX_SECTION_HTML_BYTES) issues.push(`The section is larger than ${MAX_SECTION_HTML_BYTES / 1024} KB. Simplify it.`);
 if (report.removedTags.length) issues.push(`Removed unsupported tags: ${report.removedTags.join(', ')}. Use plain HTML elements and inline <svg> only.`);
 if (report.removedAttributes.length) issues.push(`Removed unsupported attributes: ${report.removedAttributes.join(', ')}. Style with Tailwind classes only; request photos with src="image:<subject>".`);
 return { html: report.html, issues, report };
}

/**
 * Scoped prompt edits. The composer appends an invisible marker to the request:
 * `section` revises one section (optionally focused on an element path inside it),
 * `add` inserts a new section after it. No marker means a global edit.
 */
export type ScreenScope = { mode: 'section' | 'add'; sectionId: string; path?: string };
const SCOPE_MARKER = /\u2063guildos-scope:(section|add):([a-z][a-z0-9-]{0,63})(?::([^\u2063]{1,600}))?\u2063/;
const elementPath = /^[a-z0-9]+:nth-child\(\d+\)(?: > [a-z0-9]+:nth-child\(\d+\))*$/;
export const encodeScreenScope = (scope: ScreenScope) => `\u2063guildos-scope:${scope.mode}:${scope.sectionId}${scope.path ? `:${encodeURIComponent(scope.path)}` : ''}\u2063`;
export function parseScreenScope(text: string): ScreenScope | null {
 const match = SCOPE_MARKER.exec(text);
 if (!match) return null;
 let path: string | undefined;
 try { path = match[3] ? decodeURIComponent(match[3]) : undefined; } catch { path = undefined; }
 return { mode: match[1] as ScreenScope['mode'], sectionId: match[2], ...(path && elementPath.test(path) ? { path } : {}) };
}
export const isScreenScope = (value: unknown): value is ScreenScope => !!value && typeof value === 'object' && ['section', 'add'].includes((value as ScreenScope).mode) && sectionId.test(String((value as ScreenScope).sectionId)) && ((value as ScreenScope).path === undefined || elementPath.test(String((value as ScreenScope).path)));
/** Removes every invisible GuildOS marker (layer, scope, screen, device) from request text. */
export const stripScreenScope = (text: string) => text.replace(/\n?\u2063guildos-[a-z]+:[^\u2063]*\u2063/g, '');

/** Which screen a request is about; absent means "add a new screen to the board". */
const SCREEN_MARKER = /\u2063guildos-screen:([0-9a-f-]{36})\u2063/i;
const DEVICE_MARKER = /\u2063guildos-device:(mobile|tablet|desktop)\u2063/;
export const encodeScreenTarget = (screenId: string) => `\u2063guildos-screen:${screenId}\u2063`;
export const encodeDeviceVersion = (device: HtmlDevice) => `\u2063guildos-device:${device}\u2063`;
export const parseScreenTarget = (text: string) => SCREEN_MARKER.exec(text)?.[1]?.toLowerCase() ?? null;
export const parseDeviceVersion = (text: string) => (DEVICE_MARKER.exec(text)?.[1] as HtmlDevice | undefined) ?? null;

/**
 * Validates a screen saved from the manual editor and re-sanitises every section
 * (inline styles allowed). Throws with the first problem, phrased for the user.
 */
export function cleanHtmlScreen(value: unknown): HtmlScreenDocument {
 const issues = validateHtmlScreen(value);
 if (issues.length) throw new Error(issues[0]);
 const doc = value as HtmlScreenDocument;
 return { ...doc, sections: doc.sections.map(section => section.status === 'ready' ? { ...section, html: sanitizeSectionHtml(section.html, { allowStyle: true }).html } : section) };
}

/** Every class token used by the screen, for the Tailwind compiler. */
export function screenClassCandidates(doc: HtmlScreenDocument): string[] {
 const out = new Set<string>(SCREEN_BODY_CLASSES.split(' '));
 for (const section of doc.sections) for (const match of section.html.matchAll(/\sclass="([^"]*)"/g)) for (const token of match[1].split(/\s+/)) if (token) out.add(token.replace(/&amp;/g, '&'));
 return [...out].sort();
}

const SCREEN_BODY_CLASSES = 'font-sans antialiased';

/** Theme block for Tailwind: colour tokens become bg-*, text-*, border-* utilities; fonts become font-sans / font-display. */
export function screenThemeCss(tokens: HtmlScreenTokens) {
 const lines = Object.entries(tokens.colors).filter(([name, color]) => tokenName.test(name) && hexColor.test(color)).map(([name, color]) => `  --color-${name}: ${color};`);
 const stack = 'ui-sans-serif, system-ui, sans-serif';
 if (tokens.fontSans && fontName.test(tokens.fontSans)) lines.push(`  --font-sans: "${tokens.fontSans}", ${stack};`);
 if (tokens.fontDisplay && fontName.test(tokens.fontDisplay)) lines.push(`  --font-display: "${tokens.fontDisplay}", ${stack};`);
 return lines.length ? `@theme {\n${lines.join('\n')}\n}` : '';
}

function googleFontsHref(tokens: HtmlScreenTokens) {
 const families = [...new Set([tokens.fontSans, tokens.fontDisplay].filter((font): font is string => !!font && fontName.test(font)))];
 if (!families.length) return null;
 return `https://fonts.googleapis.com/css2?${families.map(font => `family=${encodeURIComponent(font).replace(/%20/g, '+')}:wght@400;500;600;700`).join('&')}&display=swap`;
}

const FRAME_CSS = `html,body{margin:0}body{min-height:100vh}
[data-section-id]{position:relative}
[data-section-status="planned"]{padding:16px}
.guildos-skeleton{height:96px;border-radius:12px;background:linear-gradient(90deg,#eef0f3 25%,#f6f7f9 50%,#eef0f3 75%);background-size:200% 100%;animation:guildos-shimmer 1.4s linear infinite}
@keyframes guildos-shimmer{to{background-position:-200% 0}}
@media (prefers-reduced-motion:reduce){.guildos-skeleton{animation:none}}
.guildos-section-error{margin:16px;padding:12px 14px;border:1px dashed #d14343;border-radius:10px;color:#9b2c2c;font:13px/1.4 system-ui,sans-serif;background:#fff5f5}
[data-guildos-drawing]{animation:guildos-draw 1.2s cubic-bezier(.65,0,.35,1) both}
@keyframes guildos-draw{from{clip-path:inset(0 0 100% 0)}to{clip-path:inset(0 0 0 0)}}
@media (prefers-reduced-motion:reduce){[data-guildos-drawing]{animation:none}}`;

/**
 * Compose the full srcdoc for a screen. `css` is the compiled Tailwind output for
 * this screen (compileScreenCss). Sections that are still planned render
 * a skeleton; failed sections render their error so the rest of the screen stays usable.
 */
export function composeHtmlScreen(doc: HtmlScreenDocument, css: string, options: { exportOnly?: boolean } = {}) {
 const frame = HTML_DEVICE_FRAME[doc.device] ?? HTML_DEVICE_FRAME.mobile;
 const fonts = googleFontsHref(doc.tokens);
 const background = hexColor.test(doc.background) ? doc.background : '#ffffff';
 const csp = ["default-src 'none'", "img-src 'self' https://images.unsplash.com data:", `style-src 'unsafe-inline'${fonts ? ' https://fonts.googleapis.com' : ''}`, `font-src${fonts ? ' https://fonts.gstatic.com' : " 'none'"}`, "script-src 'none'", "form-action 'none'", "base-uri 'none'"].join('; ');
 // An export contains only finished sections: no skeletons or generation errors.
 const sections = doc.sections.filter(section => !options.exportOnly || section.status === 'ready').map(section => {
  const attrs = `data-section-id="${escapeAttribute(section.id)}" data-section-kind="${escapeAttribute(section.kind)}" data-section-status="${escapeAttribute(section.status)}"`;
  if (section.status === 'ready') return `<section ${attrs}>${sanitizeSectionHtml(section.html, { allowStyle: true }).html}</section>`;
  if (section.status === 'failed') return `<section ${attrs}><p class="guildos-section-error">${escapeText(section.error || 'This section could not be generated.')}</p></section>`;
  return `<section ${attrs} aria-busy="true"><div class="guildos-skeleton"></div></section>`;
 }).join('\n');
 return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${frame.width}, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="guildos:frame" content="width=${frame.width}, height=${frame.height}, device=${doc.device}">
<title>${escapeText(doc.name)}</title>
${fonts ? `<link rel="stylesheet" href="${escapeAttribute(fonts)}">\n` : ''}<style>${css.replace(/<\/style/gi, '<\\/style')}</style>
<style>${FRAME_CSS}body{background:${background}}</style>
</head>
<body class="${SCREEN_BODY_CLASSES}">
<main data-screen="${escapeAttribute(doc.name)}">
${sections}
</main>
</body>
</html>
`;
}
