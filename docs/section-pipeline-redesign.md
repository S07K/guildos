# Section pipeline redesign (proposal)

Status: proposal, 2026-11-10. Replaces the five-stage whole-screen pipeline in
`src/lib/studio/agents/pipeline.ts` and `worker.ts`.

## 1. Why the current pipeline fails

Evidence from the cloth-app runs on 2026-11-10:

| Failure seen | Root cause in the architecture |
|---|---|
| Groq `json_validate_failed` on `screenPreset` | Agents emit low-level node JSON (axis sizing, 8px grid, nullable style fields). Every field is a new way to be wrong. |
| "Direction may style existing containers only: shop-chip-all" | Stages are split by discipline (structure, colour, components, copy) but each stage sees the whole screen, so agents step outside their remit. |
| UI Designer spent 8 actions polishing chip borders | No definition of done per stage; agents keep tweaking until a cap. |
| "Could not save the private pipeline checkpoint" after a full design existed | All-or-nothing private draft, plus app/DB invariants drifting apart (15 vs 8 actions). One late error discards everything. |
| Blank canvas while agents work | Live preview only rendered once a saved version existed. |
| ~26k input tokens per call, up to ~40 calls per screen | Every action re-sends the whole screen and the full rulebook. |
| Mobile only | One 375px root; the header's desktop/mobile toggle has no canvas meaning. |

Short-term fixes for the last four are already in place (checkpoint cap, live
render, per-stage schemas, screenPreset). They stop the bleeding but do not change
the shape of the problem: **one model call edits the whole screen at node level.**

## 2. What the benchmarks do

- **Figma Make Designs / First Draft**: the model does not lay out pixels. It picks
  and fills small composable templates from a curated design system, with separate
  mobile and desktop libraries plus example compositions; images come from a
  separate model. Quality came from governing that template library.
- **UX Pilot**: choose device (mobile or desktop) first, generate a screen, then
  regenerate *individual sections* when one part is off; desktop and mobile
  variants of the same screen; several looks at once. Teardown in §2.1.

Common pattern: **plan → generate per screen → scoped regenerate**. The two
benchmarks differ on *what the model writes*: Figma fills templates, UX Pilot
writes free HTML + Tailwind.

### 2.1 UX Pilot teardown (2026-11-10)

Method: REA (`rea-agents@6.8.0`) captured the public site (64 first-party
scripts) and, read-only, one logged-in editor tab at
`/a/ui-design` (149 scripts, accessibility tree, network metadata; no clicks,
no generations). The scripts were searched statically. Identifiers below are quoted
from their minified bundles as evidence; no code or assets were copied. The
logged-in file was empty, so we saw no live generation. Streaming and edit
behaviour are inferred from code paths, not watched.

| Question | Finding | Evidence |
|---|---|---|
| Output format | Each screen is a **complete HTML document styled with Tailwind** (CDN), plus Font Awesome 6.4 and Google Fonts. There is no node tree. A validator rejects a screen that is missing the Tailwind script, doctype, `<head>` or `<body>`. | Constant `https://cdn.tailwindcss.com` in the canvas asset loader. Validator issues `"Missing Tailwind CSS script"` and `"Missing head element"`. Field `wireframeOutputHtml` (81 refs). The `/evaluate-html` endpoint. A 5 MB per-screen save cap (`"This screen is too large to save (maximum 5 MB)"`). |
| Rendering | Screens render in **sandboxed `<iframe srcDoc>`** elements placed on a **tldraw** infinite canvas. The host and iframe talk through `postMessage`. Manual edits use a GrapesJS-style editor. | The a11y tree has `application: tldraw`. Iframe attributes `data-uxp-canvas-editor` and `data-uxp-canvas-view`. Messages `uxp:canvas-ready`, `uxp:canvas-painted`, `uxp:canvas-snapshot` and others. Style tag `data-grapesjs-styles`. Endpoints `/crud/saveTextChanges-v2` and `/crud/saveManualChanges-v2`. |
| Unit of generation | The unit is the **screen**, not a section. Screens are generated per page or flow (`/generate-wireframes-v3`, `/generate-ui-v4`, `/generate-by-flow`), with up to 5 concurrent generation threads by default. | API constants `GENERATE_WIREFRAMES`, `GENERATE_HIFI`, `GENERATE_BY_FLOW`. `maxConcurrentThreads ?? <default>`, where the default 5 is exported beside `/api/agentic/stream`. |
| Plan step | An agentic chat produces a **markdown plan** and can ask clarifying questions with choices. The user clicks **Approve Plan** before screens are generated. | Event types `plan_question`, `plan_ready`, `plan_revised`, `plan_approved`. An "Approve Plan" button. Plan rendered as markdown. A "Plan your design" button on the empty canvas. |
| Two-pass fidelity | First a wireframe, then a "Transform to HiFi" pass that is told to keep the structure. | Prompt constant: "Transform the provided wireframe into … high-fidelity … while strictly preserving the wireframe's structure, layout, and all existing elements". `canTransformToHifi`. |
| Live streaming | **Partial HTML streams into the screen** while its status is `generating`. Head, html attributes and body attributes stream separately, so the iframe can paint early. Transport is SSE/NDJSON from `POST /api/agentic/stream`, read with `getReader()`. A repair prompt fixes truncated HTML. | Fields `streamingPreviewHtml`, `streamingHeadHtml`, `streamingHtmlAttrs`, `streamingBodyAttrs` (from `uiPreviewHtml`, `uiHeadHtml`), gated on `status === "generating"`. Header `Accept: text/event-stream`. Repair prompt: "The provided code is truncated … may contain unclosed tags, incomplete sections … Complete and repair the file". |
| Section editing | A "section" is **any DOM element the user clicks** in crosshair mode; it is not a typed block. The request carries `{id, tagName, method:"edit", sectionCssPath, element: outerHTML}`. The outerHTML is capped at 256 KB, with the warning "Selected section was too large; attached HTML was truncated". Section edit is a Pro feature. | The section picker builds an `nth-child` CSS path from `body`. Style injected: `body * { cursor: crosshair }`. Classes `highlighted-section` and `selected-section`. `selectedSectionInfo` (37 refs). Upsell text: "Section editing is a premium feature…". |
| Edit scopes and cost | There are four edit types: `section`, `global`, `add_section` and `variation`, plus direct text edit. A section edit costs 6 credits, versus 10 for a global, add-section or variation edit and 6 for a new screen. | Credit function: `c = "section"===editType \|\| !!selectedSection?.id`, then `SECTION_EDIT:6`, `ITERATION:10`, `BASE_GENERATION:6`, `DEEP_DESIGN:24`, `MAX_DESIGN:48`. Events `SECTION_EDIT_CLICKED`, `SECTION_ADD_CLICKED`, `GLOBAL_EDIT_CLICKED`, `TEXT_EDIT_CLICKED`. |
| Variations | Variations are **whole pages, not sections**: "Create N distinct full-page … variations", N ∈ {2, 3, 4} (default 3), with the same content but a different layout, hierarchy or style. The homepage advertises "Explore 4 looks at once". | Prompt-builder constants `_R=[2,3,4]`, `_I=3`, `"distinct full-page"`. Endpoints `/generate-variations`, `/generate-by-variation-flow`. |
| Desktop / mobile | **Separate screens.** The device comes from the `useCase` and is stamped into the HTML as `<meta name="uxpilot:frame" content="width=…, height=…, device=mobile\|tablet\|desktop">`. The other device is a new generation, **"Generate Mobile Version" / "Generate Desktop Version"**, and costs credits (`deviceVersionCreditCost`). | Toolbar props `handleGenerateMobileVersion`, `handleGenerateDesktopVersion`, `isDesktop`, `isMobile`, `deviceVersionCreditCost`. The frame-meta builder. |
| Failure isolation | One screen can fail without losing the others. A retry regenerates only that screen, and bulk runs can end in a partial success. | Retry prompt: "The … screen failed. Please retry generating only this {mobile\|tablet\|desktop} {HiFi\|Wireframe} screen … Keep the other screens unchanged." Events `screen_retry_attempted`, `bulk_regeneration_partial_success`, `screen_too_large_for_ai`. Endpoints `/generate-ui-v4/retry`, `/generate-wireframes-v3/retry`. |
| Design systems | Figma components are imported and turned into a "custom model". The generator receives the design system as context; there is no fixed template compiler. | Endpoints `/figma-design-system/figma-ds-import`, `ds-catalog`, `figma-ds-react-components`, `ds-styling`. Homepage copy: "Import Components → Save as custom models → Style consistency check". |

### 2.2 Live run (2026-11-10, logged-in account)

One real generation was run in the user's account. The prompt was: "Mobile home screen
for Threadline, a small clothing shop selling linen and wool basics: greeting header
with bag icon, autumn-edit hero with a shop button, category chips, new-in product list
with prices, picked-for-you product grid, free delivery and returns row, newsletter
sign-up, bottom navigation."

How it was observed: REA listed the tab (`ev_2e41b127…`) and ran a passive capture over
the same window (`ev_33c5fd8c…`, request metadata only). The stream events were saved by
a small read-only Chrome DevTools recorder attached to the same tab (no headers or
cookies). The finished screen's `srcdoc` was read from the DOM. Their code and assets
were not copied into GuildOS.

**Request.** `POST stream.uxpilot.ai/api/agentic/stream` carries only
`{message, conversationId, pageId, metadata:{dsSourceSelections, attachedImageUrls},
uiSettings:{modelTier:"glide-pro", modelVariant:"max", deepDesign, useMaxLimit}}`. All
prompting happens on the server.

**Timeline** (SSE / NDJSON events, `currentToolCall` per step, 73 s in total):

| t | Event | Meaning |
|---|---|---|
| 1.6 s | `status` "Thinking about your request…" (`openai_completion`) | plan |
| 4.3 s | `status` "Generating images for your design…" (`image_generation`) | **5 photos generated before any markup** (about 32 s) |
| 35.8 s | `status` "Writing Home__mobile…" (`write_file`) | one file per screen, named `<Screen>__<device>` |
| 36.3 s | `ui_created` `{selectedType:"mobile (375x840)", designMode:"hifi", screenTitle, appName}` | frame placed on the canvas |
| 37.8 s | `ui_head_ready` `{headHtml}` | `<head>` sent first so the frame can load fonts and Tailwind |
| 37.8–56 s | 45 × `ui_preview` `{previewHtml, bodyAttrs, status:"streaming"}` about every 0.4 s | **cumulative** body HTML, re-rendered live |
| 57.9 s | `status` "Editing Home__mobile…" (`edit_file`) | targeted patch after the first write |
| 58–72 s | `status` "Opening the screen to review it" (`review_screen`) | **renders the screen and reviews it** before replying |
| 72.8 s | `complete` | final message, honest about limits ("the bag count is a fixed 2, buttons don't do anything yet") |
| 73.0 s | `credits_used` `{credits:26, breakdown:{tokens:13, media:13, items:{image:{count:5}}}}` | images cost as much as all the text |

Afterwards the client saves frame geometry (`/crud/updateWireframe-v2`
`{position, dimensions:{width:375,height:2068}}`) and offers chips for adding a
section ("Add Texture Swatches", "Add Best Sellers", "Add Material Care").

**The output.** One HTML document of about 30 KB:
- **Tailwind:** the CDN plus a one-line `tailwind.config` that only sets a serif/sans font pair.
- **Body:** `<body class="bg-[#F5EFE6] text-stone-900 font-sans">`, with Font Awesome icons.
- **Sections:** top-level `header#header`, `section#hero`, `#chips`, `#newin`, `#picked`,
  `#perks`, `#newsletter` and `nav#bottom-nav`, with about 125 distinct utility classes.
- **Colour:** only three hex values (oatmeal, sand, rust); everything else uses Tailwind's
  `stone` scale.
- **House style:** the earlier desktop "Linea" page in the same file uses the identical
  skeleton.
- **Photos:** 8 in total, 5 newly generated and 3 **reused** from the earlier screen
  in the file, which keeps the art direction consistent across screens.

**Why it looks good.** In order of impact:
1. **Generated, art-directed photography.** Every product is shot on the same warm
   backdrop in one style. Stock photos cannot match this, and it is the largest visual
   difference from GuildOS today.
2. **Restraint.** A three-colour palette on a neutral scale, one serif display face,
   generous radii, white cards on a tinted page and one accent colour.
3. **Specific copy.** "Flax Linen Shirt · 100% European linen · $84", "Good morning, Maya".
4. **One coherent pass, then a check.** One call writes the whole screen, a targeted
   edit fixes it, and a visual review runs before the reply.

**What this means for GuildOS (live-run additions)**

- **Add an art-direction and image-generation step to the plan.** The plan should
  return an art-direction line (for example "warm beige studio backdrop, soft daylight,
  centred product") with one image prompt per photo slot. Images are generated in
  parallel before sections are built and reused across screens in a project. Unsplash
  stays as the fallback. This is the biggest quality lever.
- **Make parallel sections coherent.** UX Pilot gets coherence for free from one call.
  Our per-section calls need the plan to also return *style recipes*: exact class
  strings for the eyebrow, display heading, card, primary and secondary button, chip and
  price. Every section receives them. Keep the palette to about three hex tokens plus
  one neutral scale.
- **Add a review pass on the rendered screen.** Render the composed screen, then run a
  QA call (screenshot-capable model where available) that can patch individual
  sections. This matches their `edit_file` + `review_screen` steps and fits §5 step 5.
- **Stream the HTML.** `ui_head_ready` followed by cumulative `ui_preview` events makes
  the screen visibly build itself. Our checkpoint-per-section is coarser; streaming
  partial section HTML into the live preview is a later polish.
- **Suggest the next sections** after a screen is built ("Add Best Sellers"), which
  pairs with the planned "add section" edit type.
- **Report cost honestly.** Their image spend equals their token spend. Show image
  versus model cost in our usage dashboard.

**What this means for GuildOS**

1. **UX Pilot avoids our failure class by writing a format models already know
   well (HTML + Tailwind), not a template library.** Our `json_validate_failed`
   and out-of-scope errors come from a bespoke node JSON. Both benchmarks remove
   that JSON: Figma uses templates, UX Pilot uses HTML. Either way the model never
   writes a custom low-level schema. A third option is therefore listed in §6.
2. **Their sections are emergent. Ours can be typed.** Picking any DOM element and
   sending its outerHTML plus a CSS path works for HTML, but it gives no
   per-section schema, no QA tickets per section and no deterministic desktop
   layout. Typed sections (§3.1) are a real advantage over UX Pilot, as long as
   the library covers enough layouts.
3. **Desktop and mobile:** UX Pilot treats the other device as a separate, paid
   regeneration, and the two screens can drift apart. A template compiler gives us
   both frames from one SectionSpec at no extra model cost, which is a
   differentiator. Mobile-first with "Add desktop" is still the proven UX if we
   ever drop templates.
4. **Copy directly:** plan approval before generating (§3, step 1); streaming
   partial output into the frame while it is `generating`; per-unit retry with
   "keep the others unchanged"; a cheaper scoped edit than a global one; a
   truncation-repair pass; a format validator before saving.
5. **Don't copy:** whole-page variations as the only variation unit. Per-section
   "Try another variant" (§3.5) is cheaper and fits our typed sections.

## 3. Proposed architecture

```
Brief ──► 1. PLAN (1 call)          ScreenSpec: tokens + ordered sections
            Creative Director + UX    { id, kind, intent, content notes }
              │  outline appears on canvas immediately as section placeholders
              ▼
         2. BUILD SECTIONS (N calls, parallel, one per section)
            UI Designer + Copywriter  SectionSpec: template kind + variant + slot content
              │  server compiles template → nodes for mobile AND desktop
              │  each finished section is committed and shown live
              ▼
         3. REVIEW (deterministic checks + 1 QA call)
            QA Critic                 tickets per section → rebuild only those sections (≤2 rounds)
```

### 3.1 Section templates instead of free node JSON

- A section library (`src/lib/studio/sections/`): `app-header`, `hero`,
  `category-chips`, `product-list`, `product-grid`, `feature-row`, `cta-banner`,
  `bottom-nav`, `footer`, … each with 2–4 variants. This grows out of the
  existing semantic variants in `visual-hierarchy.ts` (`nav-tab`,
  `filter-chip`, `menu-item-card`, `primary-cta`, …).
- Each template declares **slots** (title, body, items[], image query, icon, CTA)
  and a **compiler** that emits auto-layout nodes for `mobile` and `desktop`.
- The model only fills a small schema per section, e.g.
  `{kind:'product-list', variant:'card-row', items:[{title,price,meta,image_query}]}`.
  Spacing, grid, icon boxes and layout rules live in compilers, so the class of
  errors we hit today cannot be produced.
- An `custom` escape hatch keeps today's node contract for one section when no
  template fits, validated in isolation.

### 3.2 Shared context, section-scoped work

Every section call receives: brief summary, ScreenSpec (tokens + all section
intents), the neighbouring sections' compiled summaries, and its own previous
version. It returns only its section. Input drops from the whole screen to roughly
2–4k tokens per call; sections run in parallel within the workspace's
generation slot.

### 3.3 Mobile and desktop as two frames of one screen

- One ScreenSpec drives two root frames: `<screen>-mobile` (375) and
  `<screen>-desktop` (1440). Same section IDs, same content, layout per viewport
  from the template compiler.
- The header toggle switches which frame the canvas shows and edits.
  Content edits apply to both; layout overrides are per viewport.

### 3.4 Incremental, never all-or-nothing

- Sections are committed as they finish; the live canvas shows them appear in
  order. A failed section shows as a placeholder with its error and a Retry
  button; the rest of the screen is kept.
- Publishing a version no longer waits for every agent; review tickets become
  follow-up section tasks.

### 3.5 Editing a section

Select a section on the canvas (or `#section` in chat) → prompt → a single
section task with the same shared context. Also "Regenerate section" and
"Try another variant" buttons, as in UX Pilot.

### 3.6 Personas

The five personas stay visible in chat but map to phases: Creative Director and
UX Architect co-author the plan, UI Designer and Copywriter build sections (one
call), QA Critic reviews. Fewer calls, same story for the user.

## 4. Data model changes

- `studio_screens`: id, project, name, spec (tokens + section list), status.
- `studio_sections`: id, screen, order, kind, variant, spec, compiled nodes per
  viewport, status (`planned|building|ready|failed`), version.
- Section tasks are child tasks of a screen task; the checkpoint RPC validates
  one section at a time, removing the global stage/action/round invariants.
- Canvas versions are composed from sections when published.

## 5. Delivery plan (HTML sections, per §6)

1. **Done (2026-11-10): HTML section core.** Files:
   `src/lib/studio/html-screen.ts`, which holds the `html-screen` document type, an
   allowlist sanitiser, `parseSectionHtml` (strips fences, unwraps whole documents,
   returns issues ready for a retry), validation, and `composeHtmlScreen` (CSP with
   `script-src 'none'`, plus skeleton and error states for each section). And
   `src/lib/studio/html-screen-css.ts`, which compiles the screen's Tailwind v4 on the
   server. There is no CDN script, and each screen gets a fresh compiler, so one
   tenant's classes never leak into another's CSS. Tests and snapshots for the 8
   common sections are in `tests/studio-html-screen.test.mjs`, with fixtures in
   `tests/fixtures/html-sections/`.
2. **Done (2026-11-10): plan, section tasks and rendering on the canvas.** New
   projects, blank canvases and existing `html-screen` projects use the section
   pipeline (`usesSectionPipeline`). Node canvases that already hold work keep the
   five-stage pipeline until cutover. Each worker lease does one step
   (`runSectionStep` in `agents/worker.ts`). The Creative Director plans the
   screen: tokens, fonts, and an ordered list of section kinds and intents
   (`agents/section-agents.ts`). The UI Designer then builds up to 3 sections in
   parallel, checkpointing each as it finishes. A section gets one automatic repair
   round when the sanitiser had to intervene, and two attempts across leases before
   it is marked failed. The screen publishes once nothing is left to build, keeping
   any failed sections visible as such. Photos come from `src="image:<query>"`,
   resolved through Unsplash, with a neutral placeholder as fallback. The database
   side is `202611100003_studio_section_pipeline.sql`: `init_studio_sections`,
   `checkpoint_studio_sections` (lease, previous-state and phase-transition checks,
   with per-call usage and agent messages), and `finish_studio_task`, which also
   publishes a finished section draft. On the editor side, `/api/studio/pipeline/live`
   returns section drafts, `POST /api/studio/screen` composes the srcdoc (the
   session must be able to read the project), and the editor shows it in
   `HtmlScreenFrame`, with a layers list of sections and a screen summary panel.
   Plan approval before building (as in UX Pilot) is not built yet; the plan goes
   straight to building.
2b. **Done (2026-11-10): art direction, generated photos, style recipes and the
   live cursor** (following §2.2).
   - **Plan:** the plan now also returns an `art_direction`, `style_recipes` (exact
     class strings for the eyebrow, display, heading, body, card, buttons, chip, price,
     icon button and input) and up to 6 image slots tied to sections. These are stored
     as `HtmlScreenDocument.art`, and new screens in the project inherit the art
     direction and recipes.
   - **Photos:** in the same lease as the plan, `agents/screen-images.ts` generates
     every photo in parallel with the art direction appended. It uses the workspace's
     OpenAI key (`STUDIO_IMAGE_MODEL`, default `gpt-image-2`) or OpenRouter key
     (`STUDIO_OPENROUTER_IMAGE_MODEL`). Photos are stored privately in `studio-assets`
     (`project-assets.ts`, shared with uploads) and served from `/api/studio/assets`.
     A failed photo falls back to Unsplash, then the placeholder. Image tokens are
     accounted to the task.
   - **Sections:** each section receives the recipes and only its own photos, and
     writes `src="asset:<id>"`.
   - **Editor:** `HtmlScreenFrame` patches the open document in place on every poll
     (compiled CSS plus changed sections, with no reload). A section that just finished
     draws in top to bottom (`data-guildos-drawing`, a clip-path reveal). The shared
     `AgentCursor` (also used by the node canvas) glides between the sections in
     progress ("Mira · Building hero") and rides the drawing edge ("Drawing hero"). It
     respects reduced motion. Covered by `tests/studio-browser/html-screen.spec.ts`.
   - **Not yet:** true token streaming of partial section HTML (UX Pilot's
     `ui_preview`). The draw-in replays each finished section rather than streaming
     its tokens.
3. **Section edit / regenerate / try another variant.** Requests are scoped to one
   section id and send that section's HTML as context.
4. **"Add desktop".** Regenerate the same section plan at 1440 as a second screen.
5. **Review loop on sections** (contrast and token checks on the composed DOM,
   plus a QA call, with tickets per section).
6. **Cutover: delete the node pipeline.** Remove the five-stage pipeline (most of
   `agents/pipeline.ts`, `agents/proposal.ts`, and the agent path through
   `design-system.ts`, `canvas-layout.ts`, `visual-hierarchy.ts`, `canvas-quality.ts`,
   `screen-scope.ts`, `revision-scope.ts`), the legacy landing-page `Design` document
   (`design.mjs`), their tests, and the checkpoint RPC. Decide first whether
   existing node-canvas versions are migrated or shown read-only.

## 6. Decisions

Decided 2026-11-10:

- **Section format: HTML + Tailwind per section** (option c below), as UX Pilot
  does. This replaces §3.1's template slots as the model contract. Typed section
  *kinds* are still kept in the plan (ScreenSpec), so QA tickets, regenerate and
  variants stay section-scoped.
- **Devices: mobile first, with "Add desktop"** as a separate generation of the
  same sections.
- **Render HTML on canvas** in sandboxed iframes, as UX Pilot does. There is no
  HTML → node importer. Generated screens are `html-screen` documents, not
  `CanvasDocument`s.
- **Step 1 is done**, re-scoped to the HTML contract (§5).

Options that were considered:

- What the model writes per section:
  (a) template kind + slots, with a `custom` escape hatch (Figma-style; recommended);
  (b) free node JSON per section (today's contract, today's failure modes);
  (c) HTML + Tailwind per section (UX Pilot-style; fluent for models, but the
      canvas is a node tree, so it needs an HTML → node importer and gives up
      deterministic desktop layout).
- Generate desktop and mobile together by default (cheap with a template
  compiler), or mobile first with "Add desktop" on demand (UX Pilot's model,
  where the second device is a separate paid generation).
- How many variants per generation (UX Pilot offers several looks); start with
  one, add "Try another variant" per section.

Sources: Figma, "Inside Figma: a retrospective on Make Designs"; Figma Help,
"Best practices to help Figma AI understand your design system"; uxpilot.ai product
pages; third-party UX Pilot reviews (unite.ai, aiindigo.com); REA static and passive
capture of uxpilot.ai and its logged-in editor, 2026-11-10 (§2.1; REA evidence ids
`ev_af95348…` for the template page and `ev_200bf40…` for the editor tab list).
