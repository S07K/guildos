# Revision safety and semantic layout

The router reads the final `Requested changes:` payload independently of the historical task title. Revision wording or the explicit pipeline revision flag selects `SURGICAL_REVISION`. A durable active-screen marker wins; otherwise a revision selects a named existing screen or the latest screen. New-screen requests append artboards with a 64px horizontal gap.

`RevisionScope` persists the original document, root ID and targeted section ID in the private pipeline state. Proposal validation rejects root operations and edits to unrelated sections. Snapshot checks also reject reparenting, deletion, cross-screen additions and later-stage drift. These checks run through final publication, including resumed drafts. Named sections that cannot be resolved fail closed. General revisions without a section target may edit screen descendants; the root remains immutable.

Chat layer mentions keep their display name but also send a private stable node ID with the queued instruction. The router resolves that ID to its screen and locks all changes to the selected layer's subtree, even when multiple layers share a name. Stale references fail closed.

The component contract carries `properties.variant`. `visual-hierarchy.ts` applies deterministic anatomy and styling after stages and at QA. The React renderer and HTML export share the catalog's visual rules. Text and icon children take precedence over an inline parent icon slot. Null and empty style values explicitly clear old styles.

Menu cards receive copy and media columns, an 80px thumbnail and a compact Add control. Thumbnails use verified connector results or matching existing Unsplash assets. Missing photography or incomplete menu copy blocks final QA instead of inventing an image URL. The UI stage requests food imagery through the existing Unsplash connector when necessary.

Revision sanitation only touches the locked subtree. Existing issues outside that subtree do not broaden the deterministic correction scope. Screen roots dock footers within the viewport, and older flow artboards with coincident stored coordinates receive separate render positions without rewriting their saved snapshots.

Regression coverage lives in `tests/studio-surgical-revisions.test.mjs` and `tests/studio-browser/semantic-layout.spec.ts`.
