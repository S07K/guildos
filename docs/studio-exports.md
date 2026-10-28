# Studio extraction and export

Select a layer in the canvas or Layers panel and open **Export Layer** at the bottom of Properties. With no selection, exports use the most recently selected screen, falling back to the first visible screen. PNG exports include the selected subtree; the Code Inspector can switch between that subtree and the entire active screen.

- PNG: 1×, 2×, or 3×; optional live 1× thumbnail. Downloads are named `layer-name@2x.png`. Export uses computed styles in an offscreen clone, embeds images, excludes editor overlays, and resets root transforms/position offsets without mutating the editor. Maximum output is 32 megapixels / 16,384 pixels per edge; oversized exports fail explicitly.
- React: `.tsx`, Tailwind utility classes, and imports from `lucide-react`.
- React Native: `.native.tsx`, `StyleSheet.create`, and `lucide-react-native`. Line/path layers additionally require `react-native-svg`.
- SwiftUI: `.swift`, SwiftUI for iOS 15+ or macOS 12+, with a private hex-color helper. Uploaded assets use UIKit/AppKit decoding. Common Lucide icons map to SF Symbols; unmapped icons use `questionmark.circle`.

Code exports preserve static appearance. Connect button actions, input state, navigation, and data in the destination application. Native platforms have different font metrics and layout engines; review the output on the target device. Uploaded images are embedded; Unsplash images retain their public URLs. Source generation is deterministic, requires no model request, and never includes other screens or hidden descendants.

## Implementation

`src/lib/exporters/codeCompiler.ts` consumes the persisted `CanvasNode` representation. The agent contract's `layoutMode`, `itemSpacing`, `padding`, sizing modes, and `properties.borderRadius` are already normalized by the design-system adapter into `layout`, `sizing`, and `radius`. Legacy world coordinates are converted to parent-local coordinates before traversal. Duplicate IDs, cyclic subtrees, missing roots, and unresolved private assets fail explicitly.

`browserExport.ts` fetches uploaded assets through the existing authenticated, project-authorized asset route. External raster assets go through `/api/studio/image-proxy`, which requires a studio session, accepts only the existing HTTPS `images.unsplash.com/photo-*` allowlist, refuses redirects, enforces a 15-second timeout and 12 MB response limit, and accepts only raster image MIME types. It never forwards user credentials upstream or caches private responses.

## Verification

- `npm test`: compiler snapshots/assertions, TSX parsing, graph failures, legacy coordinate normalization, and existing regressions.
- `npm run build`: production compilation and TypeScript checking.
- `npm run test:studio -- --grep 'export inspector'`: clipboard and code downloads, selection scope, actual PNG pixel/dimension assertions at each scale under transformed/zoomed ancestors, image proxy use, and preview.
- Generated SwiftUI was additionally typechecked with `swiftc` on macOS.
