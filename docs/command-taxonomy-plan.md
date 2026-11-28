# Command taxonomy and richer composition — implementation plan

Base: e800697110e33526b900ba2268afad0a2edff940 (test). This branch preserves incremental work; merge only after final tests. No main changes.

## Design rule
Avoid both duplicate endpoints and one overly complex universal command. Share property types and units; keep distinct structural and physical-material semantics separate. Reject removed public commands rather than maintaining aliases. Saved Scene projects are not command payloads and must not lose editability.

## Requested scope
- P0: layer.update becomes the only ordinary property/position/order update; remove layer.update, layer.update, layer.update.
- P1: a single non-destructive layer.mask with explicit region/mode, including material source/local mapping; real cuts remain separate.
- P1: unify real keep/remove cutting region/mode in material.cut, replace crop/trim/diagonal public overlaps, preserve splits, named windows, source occupancy and offcuts.
- P1: graph appearance matches supported shared text outline/gradient style semantics; ensure native Canvas/Fabric/import/export parity.
- P2: explicit linked size with directed dependency validation, deterministic reflow and rollback; no physical material scaling or circular layout.
- P2: safe ordinary digital duplication, explicit source remapping for material-containing groups; avoid duplicate repeat/reuse public operations.
- P2: editable artistic-title reflow with stable identities and retained per-letter overrides; not raw arbitrary group replacement.

## Creation guidance
Be generous with meaningful detail. Text, graphics, small materials, paper strips, available tape, lettering and ink can all contribute. Default to a rich finished page rather than reflexive minimalism: establish primary structure, then actively explore multiple local embellishment opportunities, inspect actual PNG, and remove only what obscures content or weakens hierarchy. Sparse materials should be complemented by typography and graphics, not unmotivated blank regions. No decoration command, fixed counts, fake inventory, or coverage score as aesthetic acceptance.

## Verification
Shared create/update behavior; removed-entry rejection; mask and cut physical semantics; effect pixel tests; linked-size graph cycles, nested references and locked/manual-protected followers; copy/remap failures and identity; title content/gap/per-letter reflow; exported examples and compact help; full unit/UI plus actual Chromium workflows; merge to test then verify exact public CloudBase revision.

Status: implementation checkpoint complete. Local full suite has 1,406 passing tests and built UI checks passed; actual-page Chromium verification is assigned to final PR CI because local navigation is administratively blocked. Exact final source/CI/deployment identity is recorded in the PR. See command-taxonomy.md for the implemented boundaries.
