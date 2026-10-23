# Local graphics and real-material image workflow — development checkpoint

Base test: a949e6e6e77af2f9fe12f021e8dfdeced72f65c6. This development branch is not yet deployed. Do not modify main.

## Confirmed existing behavior
The app already offers image-native generation and PNG snapshots. Reuse that delivery mode rather than adding a second image mode. A generated image is a raster reference, not proof of source preservation or editable reconstruction.

## Local implementation tested
A unified read-only graphics utility now uses pinned Rough.js 4.6.6, Paper.js 0.12.18 and existing perfect-freehand 1.2.3. Operations: rough, smooth, simplify, flatten, boolean, stroke, measure. Shared geometry/place/style/size vocabulary; output is an SVG and ordinary group.compose/graphic.add drafts. Only check/apply changes Scene. Browser worker and bounded Node subprocess isolate computation. Offline geometry bundle has no network/image/SVG-URL importer and requires no npm install for graphics itself.

Thirteen focused tests currently pass, including actual exported ZIP graphics -> check -> apply -> Node Canvas preview, seed determinism, editable output, source immutability, geometric validation and empty results. Full suite and browser checks remain pending.

## Image workflow being implemented
Two transports: export to webpage GPT (no API key) and optional existing configured image model. Preserve explicit source reference manifest and original PNG. Reconstruction must create a separate candidate using real source assets, editable text and graphics through existing Commands. No claim of lossless automatic unflattening. Confidence/unresolved content stays visible, and source/stock rules remain authoritative. No new universal Scene update protocol or external vector-generation service.

No private images, generated personal work, API keys or font binaries are committed. Subsequent checkpoints will record exact tests and release status.
