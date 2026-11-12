/**
 * Section pipeline state: plan → build sections in batches → done. Each worker
 * lease performs one step and checkpoints through checkpoint_studio_sections;
 * finished sections are kept even if a later section fails.
 */
import { isCanvas } from '../canvas.ts';
import { isHtmlScreen, type HtmlScreenDocument, type HtmlSection, type ScreenScope } from '../html-screen.ts';

type SectionPhase = 'plan' | 'build' | 'done';
/** A scoped edit: the section being revised (with its previous markup) or the section being added. */
export type SectionEdit =
 | { mode: ScreenScope['mode']; sectionId: string; path?: string; previousHtml?: string }
 | { mode: 'device'; sourceScreenId: string; sourceDevice: HtmlScreenDocument['device']; sources: Record<string, string> }
 | { mode: 'variation'; sourceScreenId: string; sourceVersionId: string; index: number };
/**
 * screenId: the board screen this draft updates; null creates a new screen at `position`.
 * baseVersionId: that screen's head version when the work started (null for new screens).
 */
export type SectionPipelineState = { kind: 'sections'; phase: SectionPhase; screenId: string | null; position?: { x: number; y: number }; baseVersionId: string | null; document: HtmlScreenDocument | null; attempts: Record<string, number>; edit?: SectionEdit };
/** Sections built concurrently in one lease. */
const SECTION_BATCH = 3;
const MAX_SECTION_ATTEMPTS = 2;

export const isSectionState = (value: unknown): value is SectionPipelineState => !!value && typeof value === 'object' && (value as { kind?: unknown }).kind === 'sections';

/**
 * New projects, blank canvases and HTML screens use the section pipeline;
 * node canvases that already hold work keep the five-stage pipeline until cutover.
 */
export function usesSectionPipeline(latest: unknown, draft: unknown) {
 if (draft) return isSectionState(draft);
 return !latest || isHtmlScreen(latest) || (isCanvas(latest) && latest.nodes.length === 0);
}

export const initialSectionState = (screenId: string | null, baseVersionId: string | null): SectionPipelineState => ({ kind: 'sections', phase: 'plan', screenId, baseVersionId, document: null, attempts: {} });

/** A device version: a new screen with the source's sections, art and photos, rebuilt for another width. */
export function deviceVersionState(source: { id: string; x: number; y: number; document: HtmlScreenDocument }, device: HtmlScreenDocument['device']): SectionPipelineState {
 if (source.document.device === device) throw new Error(`This screen is already a ${device} screen.`);
 const label = device === 'desktop' ? 'Desktop' : device === 'tablet' ? 'Tablet' : 'Mobile';
 const ready = source.document.sections.filter(section => section.status === 'ready');
 if (!ready.length) throw new Error('This screen has no finished sections to adapt yet.');
 const width = { mobile: 375, tablet: 768, desktop: 1440 }[source.document.device];
 return {
  kind: 'sections', phase: 'build', screenId: null, baseVersionId: null, attempts: {}, position: { x: source.x + width + 160, y: source.y },
  edit: { mode: 'device', sourceScreenId: source.id, sourceDevice: source.document.device, sources: Object.fromEntries(ready.map(section => [section.id, section.html])) },
  document: { ...source.document, name: `${source.document.name.replace(/ · (Mobile|Tablet|Desktop)$/, '').slice(0, 68)} · ${label}`, device, sections: ready.map(section => ({ ...section, html: '', status: 'planned', error: undefined })) },
 };
}

/**
 * A variation: a new screen planned afresh for its look only. It keeps the source's sections
 * and photos (applied after the plan), so the variation differs in style, not in content.
 */
export function variationState(source: { id: string; headVersionId: string; document: HtmlScreenDocument }, index: number): SectionPipelineState {
 if (!source.document.sections.some(section => section.status === 'ready')) throw new Error('This screen has no finished sections to vary yet.');
 return { kind: 'sections', phase: 'plan', screenId: null, baseVersionId: null, document: null, attempts: {}, edit: { mode: 'variation', sourceScreenId: source.id, sourceVersionId: source.headVersionId, index } };
}

/** Puts a variation's new look on the source's sections and photos. */
export function applyVariationLook(source: HtmlScreenDocument, look: HtmlScreenDocument, index: number): HtmlScreenDocument {
 return {
  ...look,
  name: `${source.name.replace(/ · Variation \d+$/, '').slice(0, 64)} · Variation ${index}`,
  device: source.device,
  sections: source.sections.filter(section => section.status === 'ready').map(section => ({ ...section, html: '', status: 'planned', error: undefined })),
  art: { direction: source.art?.direction ?? look.art?.direction ?? '', recipes: look.art?.recipes ?? source.art!.recipes, images: source.art?.images ?? [] },
 };
}

/**
 * Section Edit and Add Section start straight in the build phase with only the target
 * pending: every other section is kept as it is in the saved screen.
 */
export function scopedSectionState(screenId: string, baseVersionId: string, screen: HtmlScreenDocument, scope: ScreenScope, request: string): SectionPipelineState {
 const index = screen.sections.findIndex(section => section.id === scope.sectionId);
 if (index < 0) throw new Error('The selected section is no longer on this screen. Select it again before sending the request.');
 if (scope.mode === 'section') {
  const target = screen.sections[index];
  return { kind: 'sections', phase: 'build', screenId, baseVersionId, attempts: {}, edit: { mode: 'section', sectionId: target.id, path: scope.path, previousHtml: target.html },
   document: { ...screen, sections: screen.sections.map(section => section.id === target.id ? { ...section, status: 'planned', html: '', error: undefined } : section) } };
 }
 const taken = new Set(screen.sections.map(section => section.id));
 let id = 'new-section';
 for (let n = 2; taken.has(id); n++) id = `new-section-${n}`;
 const added: HtmlSection = { id, kind: 'custom', intent: request.slice(0, 600), html: '', status: 'planned' };
 return { kind: 'sections', phase: 'build', screenId, baseVersionId, attempts: {}, edit: { mode: 'add', sectionId: id },
  document: { ...screen, sections: [...screen.sections.slice(0, index + 1), added, ...screen.sections.slice(index + 1)] } };
}

export function applyPlan(state: SectionPipelineState, screen: HtmlScreenDocument): SectionPipelineState {
 if (state.phase !== 'plan') throw new Error('The screen is already planned.');
 return { ...state, phase: 'build', document: screen };
}

/** Sections the worker builds next (or is building now), in screen order, at most one batch. */
export const sectionsInProgress = (screen: HtmlScreenDocument | null): HtmlSection[] => (screen?.sections || []).filter(section => section.status === 'planned').slice(0, SECTION_BATCH);
export const nextBatch = (state: SectionPipelineState): HtmlSection[] => sectionsInProgress(state.document);

const withSection = (state: SectionPipelineState, id: string, change: Partial<HtmlSection>): SectionPipelineState => {
 if (state.phase !== 'build' || !state.document) throw new Error('Sections are built only after planning.');
 if (!state.document.sections.some(section => section.id === id)) throw new Error(`Unknown section ${id}.`);
 return { ...state, document: { ...state.document, sections: state.document.sections.map(section => section.id === id ? { ...section, ...change } : section) } };
};

export const completeSection = (state: SectionPipelineState, id: string, html: string) => withSection(state, id, { html, status: 'ready', error: undefined });

/** A failed attempt goes back to planned until the attempt budget is spent, then stays failed on the screen. */
export function failSection(state: SectionPipelineState, id: string, message: string): SectionPipelineState {
 const attempts = (state.attempts[id] || 0) + 1;
 const next = withSection(state, id, attempts >= MAX_SECTION_ATTEMPTS ? { status: 'failed', error: message.slice(0, 300) } : { status: 'planned' });
 return { ...next, attempts: { ...state.attempts, [id]: attempts } };
}

/** Moves to done once nothing is left to build. A screen with no successful section cannot be published. */
export function settle(state: SectionPipelineState): SectionPipelineState {
 if (state.phase !== 'build' || !state.document || nextBatch(state).length) return state;
 if (!state.document.sections.some(section => section.status === 'ready')) throw new Error('No section of this screen could be generated. Check the model connection and retry.');
 return { ...state, phase: 'done' };
}
