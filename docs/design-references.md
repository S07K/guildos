# Phase 1 design direction

The latest user direction replaces the original dark developer aesthetic with a minimal agency website: white backgrounds, soft gray surfaces, slate text, and a muted blue accent. Shared colors live in `src/app/globals.css` and the Tailwind configuration.

The centered hero pairs an editorial serif accent with a crisp, angled SVG sculpture in the hero’s bottom-right corner. The pixel formation occupies the opposite, upper-left corner, creating a diagonal frame around the centered content. A process link sits below the form. Responsive sizing and dedicated corner spacing keep the artwork clear of text and controls, without masks or faded shading. The decorative artwork ignores pointer events. Forty mathematically generated contours form a fine-wire creative loop that slowly tilts, without a separate orbiting dot. Three smaller workflow illustrations repeat the same line weights and blue, sage, and terracotta palette: a Bézier sketch with moving cursor, orbiting petals, and a composed layout with a drawn approval mark.

Animation uses inline SVG and CSS, following the linked SVG skill's grouped transforms, rounded stroke paths, and normalized path lengths. Intersection observers pause scenes offscreen, and reduced-motion mode shows complete static artwork. The decorative hero sculpture and redundant workflow illustrations are hidden from screen readers. No animation library or remote asset is required. Artwork and motion are defined in `src/components/hero-backdrop.tsx`, `src/components/process-art.tsx`, and `src/app/creative-art.css`.

Below the hero, three steps explain the intended agent workflow. Five specialist roles appear in a compact list. The workflow is labeled as the GuildOS vision, not a live agent session. Form success remains tied to the real database response.

## References

- [SVG animation skill](https://github.com/supermemoryai/skills/blob/main/svg-animations/SKILL.md): native SVG geometry and CSS transforms, with reduced-motion support.
- [landing-effects](https://github.com/dhravya/landing-effects): inspected during the initial exploration and reviewed for this revision. The current minimal direction does not use ASCII or pixel effects; the earlier procedural canvas and illustrations were removed.
- [UXMagic](https://uxmagic.ai/), [UX Pilot](https://uxpilot.ai/), and [Pen](https://pen.dev/): brief-to-design generation and creative collaboration informed the product positioning.
- [Parallel design-system governance](https://www.parallelhq.com/blog/automating-design-systems-with-ai): a shared palette and consistent type, border, and spacing treatments.
- [claude-supermemory](https://github.com/supermemoryai/claude-supermemory): reviewed for future shared brand context; agent memory remains outside Phase 1.

The hero also includes an SVG-only pixel formation on the left: scattered square pixels gather into a cursor, hold, and disperse over ten seconds. Positions are deterministic for server rendering. It uses the existing offscreen pause behavior; reduced-motion mode shows the assembled cursor. Small interface and body text were increased by one pixel for readability.
