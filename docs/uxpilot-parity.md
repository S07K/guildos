# Editor parity with UX Pilot: analysis and build plan

Status: analysis, 2026-11-11. Sources: REA captures of uxpilot.ai, both the public site and
the logged-in editor (`ev_55d43cf3…` holds the editor's 150 scripts), the recorded live
generation (`docs/section-pipeline-redesign.md` §2.2), and an audit of the GuildOS studio.
UX Pilot's code and assets are not copied. Only behaviour and structure are described.

## 1. How UX Pilot's app is organised

**Areas** (routes under `/a/`): `ui-design` (the canvas editor), `ui-list` / `all-designs`
(design list), `folders`, `new-design`, `design-system`, `published-sites`,
`ux-design-review`, `ux-document`, `pr-review` and `account`.

**The canvas** (`/a/ui-design?page=…`):
- **Board:** a tldraw infinite board holding many screens (desktop 1440, mobile 375,
  tablet), plus notes, diagrams, images, motion and prototype tools.
- **Screens:** each screen is an HTML document shown in a sandboxed iframe. The iframe
  never receives input directly: the board owns pan, zoom and selection, and
  hover/selection is hit-tested inside the screen.
- **Agent presence:** a cursor that targets elements inside screens while it works.
- **Chat panel:** threads, model choice ("Glide Pro"), a design-system picker and
  attachments. "Add Context", "Select element" and "Use As Context" pin a screen or an
  element to the prompt.

**Three ways to change a screen**, each with its own UI:

| Mode | Entry | What it offers |
|---|---|---|
| **Prompt edit** | Composer with context chips | `Global Edit` (whole screen), `Section Edit` (the selected element or section, sent as `{id, tagName, sectionCssPath, outerHTML}`, cheaper), `Add New Section`, `Manual Text Edit`, `Variations`, `Regenerate`. A separate "prompt editor / instructions editor" handles long prompts. |
| **Manual edit** | "Manual Edit" on a screen; leave with "Close editing mode" | A dedicated editing surface (a GrapesJS-style editor in an iframe titled "Design editor") with a **layer manager**, inline text editing, **undo/redo**, and a **selected-element style panel**: font family, size, weight and line height; text colour and colour palette; border and radius; padding and margin; width and height; align; image actions (adjust, replace, delete, download); and mixed selection. Changes are saved through `saveManualChanges-v2` and `saveTextChanges-v2`. |
| **Screen tools** | Toolbar on the selected screen | Device frame and zoom, "Desktop version" / "Mobile version" (generated), **version history** per screen, **preview mode**, **code** / source code, **export** (HTML ZIP, React, CodeSandbox, Codepen, Figma), change font, duplicate, delete, move to page and share. |

**Beyond editing:** UX review with heatmaps and gaze flow, persona review, comments,
publishing with custom domains, prototypes (HTML and React), flows ("Autoflow"),
flowcharts, motion, Figma import and export, and design-system import (Figma components
and website). These are lower priority for parity.

## 1b. Live walkthrough of every control (2026-11-11)

Observed in the user's logged-in tab through the Chrome DevTools Protocol (screenshots and
the accessibility tree). Nothing was generated, saved, published or deleted. One stray
recording prompt was cancelled.

**Top bar (canvas):**
- **Left:** logo, file name (rename), and a file switcher ▾ ("Search for file", My Files,
  + Create New File).
- **File Settings:** a dialog with a free-text instruction box applied to every
  generation, e.g. "Use dark theme colours, minimal layouts…".
- **Right:** Comments, Invite friends, What's new (changelog dialog), a credits meter,
  Upgrade, Export and Share.
- **Export sidebar:** "Export N screens" with a list of the selected screens, then
  destinations: Figma (Nodey plugin / FIG file), MCP (Claude Code, Codex, Cursor), HTML,
  React (ZIP), PDF, ZIP, Webflow, Image.
- **Share dialog:** copy link, invite by email, share with team, roles *Can view and
  comment* / *Can edit*.

**Left sidebar (collapsible; toggle at the top-left of the board):**
- **Header:** thread title, thread switcher (with search) and new thread.
- **Conversation:**
  - User messages.
  - An agent **step log**: a collapsible checklist ("Processing your request…",
    "Thinking…", "Writing Home__mobile…", "Opening the screen to review it", "Editing…",
    "Checking the screen again"), ending with "Worked for 41s".
  - Inline screen thumbnails.
  - Follow-up suggestion chips ("Add Best Sellers").
- **Composer:**
  - The selected screen is attached as a context chip, which can be removed.
  - **+ Add Context** menu: Upload files/images, Add Figma design, Search inspiration
    library, Use screen as reference, Manage MCP servers.
  - **Select element** picker.
  - **Design system** picker: tabs *Design systems* / *Themes*, search, "Add design
    system".
  - **Model** popover: a *Faster ↔ Smarter* slider with 3 tiers, a "Fast mode" toggle,
    and custom models (moved to design systems).
  - Voice input.
  - A credits banner ("Only 3 designs left").

**Board:**
- **Navigation:** zoom − / % / +, and a zoom menu (Zoom in ⌘=, out ⌘−, 100% ⇧0, fit ⇧1,
  selection ⇧2). Also a canvas map and view options.
- **Bottom tool dock:** Select ▾, Notes, Diagram, Template, Image, Import, Motion,
  Prototype.
- **Template:** opens a **Library** side panel with tabs Templates / Inspiration / Library /
  My templates, Web/Mobile, search, and categories (Blog & Content, Dashboard, Design
  Systems, E-commerce…).
- **Hover on a screen:** 👍 / 👎 feedback under the frame.
- **Selected screen:** handles plus a size label ("375 × 840").

**Floating screen toolbar** (menus open on hover):

| Control | Items |
|---|---|
| **Generate ▾** | Variations ⌥O · Flow ⌥W · Mobile version ⌥N (or Desktop version) · Prototype ⌥Q |
| **Edit ▾** | Global Edit ⌥G · Section Edit ⌥S · **Manual Edit ⌥M** · Adjust Image ⌥I · Add New Section ⌥A |
| **Review ▾** | UX Review ⌥V · Accessibility Review ⌥Y · Persona Audit ⌥T · Predictive Heatmap ⌥J · Gaze Flow ⌥⇧G |
| **Copy/Export ▾** | Copy to Figma · Copy to Webflow · Copy as HTML ⌥⇧H · Copy as Image ⌥⇧C · Convert & export as React · Export as… |
| 👁 Preview · 🌐 Publish · `</>` Code | Icon buttons |
| **⋯ More** | Prompt History ⌥H · Change Font ⌥F · Selected Context ⌥R · Create video · Duplicate ⌥D · Move to file ⌥X · Save ⌥B · Publish as Template · Share ⌥L · Remove |

**Manual Edit** is a full-screen editor that replaces the board:
- **Top bar:** ✕ Close · Undo · Redo | zoom − 53%▾ + (25/50/75/100%, fit) | device ▾
  (Mobile, Tablet, Desktop, Desktop HD) · W · H | Discard · **Save Changes**.
- **Left, Layers:** the full DOM tree (Body › Frame › Header › Navigation › …).
  - Rows are collapsible and named after their text content or tag.
  - The tree selects and scrolls in sync with the canvas.
- **Centre:** the screen at the chosen zoom.
  - Hover shows a type badge ("Text", "Section") with an outline.
  - Selection shows an element toolbar: ↑ select parent · ✥ drag to move · ⧉ duplicate · 🗑 delete.
  - Double-click edits text inline.
- **Right panel tabs:**
  - **Blocks:** a drag-in palette: Heading, Paragraph, 2 Column Grid, Section, List,
    Container, Input Field, Button, Checkbox, Text area, Card, Table, Tabs, Icon, Divider,
    Sidebar Menu.
  - **Style** (accordion sections):
    - **Breakpoint:** W and H with Fixed / Fill / Hug, plus Rotate.
    - **Typography:** align · font family · weight · size · line height · letter spacing.
    - **Position:** X, Y and mode (Static / Relative / Absolute…).
    - **Style & Appearance:** opacity slider · radius (per-corner expand) · border
      (per-side expand) · Add effect (shadow and blur).
    - **Fill:** colour, hex and opacity.
    - **Selection:** the colours used in the selection, each editable.
  - **Symbols:** saved components (Current Page / Global), Add component, Add new.

## 2. Where GuildOS is today (HTML screens)

| Capability | GuildOS now |
|---|---|
| Generate a screen (plan → photos → sections, live cursor and draw-in) | Done |
| Pan and zoom over a screen; select an element (hit-tested overlay; links cannot navigate) | Done (2026-11-11) |
| Many screens on one board | Done (2026-11-11): `studio_screens`, each with its own versions; drag titles to move |
| Prompt edit scoped to a section or element | Done: Section edit, Add section, Global edit per screen |
| Manual edit mode (layers, style panel, inline text, undo/redo) | Done |
| Save manual HTML-screen edits as a version | Done: `POST /api/studio/screens` commits a screen version |
| Screen toolbar (preview, versions, code, export, regenerate, variations, duplicate) | Done except Regenerate: preview, per-screen versions with restore, code, HTML export, Variations (⌥O), Duplicate (⌥D), rename (double-click title), remove |
| Desktop version of a screen | Done: Generate ▾ Desktop/Tablet/Mobile version, built beside the source |
| Comments, publish, review, prototype, design-system import | Missing (notes and the Guild panel exist) |

## 3. Target experience for GuildOS

```
┌ Canvas mode (default) ───────────────────────────────────────────────┐
│ Board: screens side by side; pan, pinch-zoom, select screen/element  │
│ Selected screen → floating toolbar:                                  │
│   Edit manually · Preview · Versions · Desktop/Mobile · Regenerate   │
│   · Variations · Code · Export · Duplicate · Delete                  │
│ Chat panel: Global / Section edit chips from the selection,          │
│   Add section, attachments                                           │
└──────────────────────────────────────────────────────────────────────┘
┌ Manual edit mode (separate view, "Done" to return) ──────────────────┐
│ Left: layer tree (sections → elements)  Centre: the screen at 100%   │
│ Right: style panel for the selection    Top: undo/redo, device, save │
│ Inline text editing on double-click; changes are re-sanitised and    │
│ saved as a new version ("Manual edits", 0 tokens)                    │
└──────────────────────────────────────────────────────────────────────┘
```

**Edits stay safe:**
- **Manual edits** change the DOM of the same-origin, script-free frame. On save, every
  section is serialised and passed back through `sanitizeSectionHtml`.
- **Style changes** are written as Tailwind classes where a utility exists (`text-lg`,
  `p-4`, `bg-primary`) and arbitrary values otherwise (`text-[17px]`), so the CSS stays
  compiled server-side and exports stay clean.

## 4. Build plan

0. **Done (2026-11-11): canvas fixes.**
   - A transparent interaction layer over each screen, so pinch and wheel zoom the
     board, generated links can never navigate the frame, and elements are hit-tested
     for selection.
1. **Done (2026-11-11): Manual edit** (`src/components/studio/manual-editor.tsx`). A
   full-screen editor opened from the editor header:
   - **Top bar:** Close (confirms discard), undo/redo (⌘Z / ⇧⌘Z), zoom (fit, 25–100%,
     ⌘-wheel), device (Mobile, Tablet, Desktop, Desktop HD) with W and H, Discard and
     Save Changes.
   - **Layers:** a collapsible DOM tree with hover and selection kept in sync.
   - **Selection:** hover badges, plus an element toolbar (select parent, move up/down,
     duplicate, delete). Double-click or Enter edits text inline.
   - **Blocks:** inserted using the screen's own style recipes.
   - **Style:** Size (Fixed/Fill/Hug), Typography, Spacing, Style & Appearance, Fill,
     Selection colors, and Image (alt text, fit).
   - **Saving:** goes through the versioned commit (`persistManual`). The server
     re-sanitises each section and keeps only allow-listed inline styles
     (`cleanInlineStyle`).
   - **Not yet:** drag-to-move, Symbols (saved components), Position X/Y, and per-corner
     radius and per-side border.

   The original plan for this step was:
   - A dedicated editor view with a layer tree, element selection, inline text editing
     and undo/redo.
   - A style panel covering text, font size and weight, text and background colour,
     padding, radius, align and image replace.
   - Saving through `/api/studio/versions`, which is extended to accept and sanitise
     `html-screen` documents.
2. **Done (2026-11-11): scoped prompt edits and pinch zoom.**
   - **Composer:** selecting an element on an HTML screen shows *Section edit* (the
     default), *Add section* and *Global edit*. The request carries an invisible
     `guildos-scope` marker (`encodeScreenScope`), validated in the notes route.
   - **Worker:** a scoped request starts in the build phase (`scopedSectionState`,
     migration `202611110001_studio_section_edits.sql`) with only that section pending.
     It then runs through the usual live drawing, retries and publish.
   - **Section edit:** revises from the section's current HTML, focused on the selected
     element's path. *Add section* inserts after the selection. *Global edit* re-plans the
     screen, keeping its art direction and recipes.
   - **Pinch:** `pinch-zoom.ts` cancels browser zoom across the editor and Manual Edit
     (Chrome/Firefox ctrl+wheel and Safari gestures) and zooms the board or screen
     instead.

   The original plan for this step was:
2a. **Scoped prompt edits:**
   - The composer shows `Global` or `Section` edit from the selection, plus `Add section`.
   - A worker path for section edits (rebuild one section with its HTML and the selected
     path as context), global edits (re-plan, reusing art and recipes) and add-section.
   - Pairs with the cheaper credit cost.
3. **Done (2026-11-11): floating screen toolbar** (`screen-toolbar.tsx`).
   - **Placement:** it floats centred above the screen (`useFloatingAnchor`, clamped into
     view) and its menus open on hover or click.
   - **Edit ▾:** Global Edit ⌥G · Section Edit ⌥S · Manual Edit ⌥M · Add New Section ⌥A.
     These open the chat with the scope picked; without a selection, Section Edit and
     Add Section explain what to select.
   - **Copy/Export ▾:** Copy as HTML ⌥⇧H · Download HTML. Exports are standalone: compiled
     Tailwind, only finished sections, and project images embedded as data URIs after
     the tenant check.
   - **Icons:** 👁 Preview (full-screen, Mobile/Tablet/Desktop) and `</>` Code (the
     exportable HTML, with copy and download).
   - **More ⋯:** Version history.
   - **Not yet:** Generate ▾ (variations, device versions, flow, prototype), Review ▾,
     Publish, Copy as image, Copy to Figma/Webflow, and the rest of More.
   - Also added: a composer context chip with a live thumbnail and a hover preview, and
     the logo in Manual Edit.

   The original plan for this step was:
3a. **Screen toolbar:** preview mode, per-screen version history, code view and HTML/ZIP
   export, regenerate, variations, duplicate and delete.
4. **Multi-screen board and devices (done 2026-11-11):**
   - Storage: `studio_screens` (name, device, x, y, head version, soft delete),
     `studio_screen_versions`, idempotent `commit_studio_screen`; legacy single-screen
     projects were copied into screens by the migration.
   - Routing: invisible markers on the request say where it goes. No screen → a new
     screen to the right of the board, styled like the newest screen. Screen → re-plan
     it. Screen + section/add scope → that section. Screen + device → a new screen
     beside it whose sections are adapted from the source's markup, with art and photos
     reused (no plan call).
   - Board: every screen at its position; drag a title to move it; click to select;
     toolbar, properties, layers, chat chip and Versions (with Restore) follow the
     selected screen. The board refreshes every 3 s for agent results.
   - An empty project keeps the freeform canvas tools until its first screen exists.
   - Added 2026-11-12: **Variations** (⌥O) queues two tasks; each plans only a new look
     (palette, fonts, recipes; steered "bolder" and "quieter") and rebuilds the source's
     sections with its photos, as a new screen. **Duplicate** (⌥D) copies the head version
     to a new screen without AI. Double-click a title to rename.
   - Not yet: Regenerate, flows between screens.
5. **Collaboration and reach:** comments on elements, publish/share links, UX review,
   and design-system import.
