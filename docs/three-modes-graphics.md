# Three modes + local graphics

Product creationMode has exactly edit/draw/hybrid. Provider wire format (native tools / JSON) and manual pen selection are independent. Default edit. Current package exports use only current mode IDs; there are no legacy tools/json/image product aliases.

## Actual flows
- edit: Commands/Scene -> actual render -> editable project.
- draw: original asset images + task -> host image generation -> separate immutable raster snapshot. The model may redraw print, scale or texture. It is not an exact source-pixel collage.
- hybrid: preserve a source-bound image snapshot; feed that image AND original sources to the existing vision-capable GPT agent; produce a new editable candidate and retain the original independently. Failures do not replace the snapshot with an empty success. This is GPT reconstruction, not lossless image unflattening, pixel segmentation or measured confidence.

Matching controls select the three modes for both in-app generation and web-GPT export. The former needs configured image/text providers and a vision-capable reconstruction model. The latter needs no API key: export ZIP -> GPT -> import image/JSON. A provenance-bearing snapshot can export a reconstruction task with its actual reference image. Unsupported environments report inability instead of substituting a Scene screenshot as model output. Fonts/textures in the model image are not guaranteed recoverable.

## JSON boundaries
TASK.sourceContext.creationMode is hashed with the task. `image-request.json` (version 1) references authoritative taskId/page/contentPolicy/textMode/processing/requiredAssetIDs, actual per-material alias/assetID/image/sha256/physicalWidthMM/physicalHeightMM, an optional hash-bound reference, and raster or editable-candidate output. Image bytes are separate from JSON. Sources retain existing physical restrictions. No second Scene or direct raw-Scene mutation protocol is introduced.

Snapshot.imageCreation stores only page/brief/source revision metadata, never credentials. A reconstructed project has sourceSnapshotID and reconstruction {status:candidate, review:pending, limitations}. Reference images are not material inventory. PNG imports lacking the original task cannot infer provenance and are not offered automatic source reconstruction. Explicit source changes reject stale reconstruction.

## Unified graphics utility
Rough.js 4.6.6 + Paper.js 0.12.18 + existing perfect-freehand 1.2.3 are pinned local libraries, not external AI services. Operations rough/smooth/simplify/flatten/boolean/stroke/measure are read-only. Shared GraphicGeometry/Place/Style types. Fixed millimetre computation; placement only goes into ordinary group.compose/graphic.add drafts. Only check/apply edits Scene. Original image bytes, inventory and original pressure points are not modified.

The exported `runtime/graphics.cjs` is self-contained (no npm or Canvas needed for geometry). A bounded Node subprocess handles 10s/128MB/3MB output limits. Input and output node/path budgets are checked. Browser clients use an isolated terminable Worker with the same bundled implementation. SVG handling accepts path data only, no arbitrary XML, external image references or scripts. Paper offset-path/semantic segmentation are not claimed. Headless Paper adapters exclude only DOM/canvas wiring; its actual path algorithms run.

Documentation is on-demand: one small entry in START_HERE and GRAPHICS_TOOL.md, not engine schemas in the first-read route. No private tutorial imagery, source assets or font binaries are added.

## Verification
Focused tests cover current mode exports, source and reference hashes, original snapshot retention, candidate separation, stale-source/account guards, actual library geometry and actual ZIP graphics/check/apply/Node Canvas preview/pack/reopen. Browser fixture tests the production mode picker and actual Worker + shared render. Image/provider calls are mocked in automated flow tests: no paid-model artistic quality claim.
