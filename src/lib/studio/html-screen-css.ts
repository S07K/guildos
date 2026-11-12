/**
 * Server-side Tailwind v4 compile for HTML screens. The render iframe runs no
 * scripts, so instead of the Tailwind CDN we compile exactly the utilities a
 * screen uses, with its colour and font tokens as the theme.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { compile } from 'tailwindcss';
import { screenClassCandidates, screenThemeCss, type HtmlScreenDocument } from './html-screen.ts';

// A plain path, not require.resolve: the route is bundled, and next.config traces this file into it.
const TAILWIND_CSS = join(process.cwd(), 'node_modules', 'tailwindcss', 'index.css');
let stylesheet: Promise<string> | null = null;

async function loadStylesheet(id: string) {
 if (id !== 'tailwindcss') throw new Error(`Unsupported stylesheet import: ${id}`);
 if (!stylesheet) { stylesheet = readFile(TAILWIND_CSS, 'utf8'); stylesheet.catch(() => { stylesheet = null; }); }
 return { path: TAILWIND_CSS, base: dirname(TAILWIND_CSS), content: await stylesheet };
}

/**
 * Compiled CSS (preflight + theme variables + used utilities) for one screen.
 * A compiler accumulates every candidate it has built, so each call gets a fresh
 * one: output depends only on this screen, never on another project's classes.
 */
export async function compileScreenCss(doc: HtmlScreenDocument): Promise<string> {
 const compiler = await compile(`@import "tailwindcss";\n${screenThemeCss(doc.tokens)}\n`, { base: process.cwd(), loadStylesheet });
 return compiler.build(screenClassCandidates(doc));
}
