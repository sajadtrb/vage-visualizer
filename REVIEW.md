# Studio review

## Baseline (2026-09-17)

- Editor controls inject/reparent DOM nodes outside React, lose settings on rerender, and contain detached event listeners.
- Project manager stores outerHTML and dispatches an open event without a consumer. Blob URLs cannot survive a reload.
- Export reconstructs DOM bounding boxes, losing rotation, effects and stacking; video and audio clocks differ.
- Spectrum variants reuse the same drawing paths; fonts are names rather than bundled assets; CSS has several competing editor definitions.
- Standalone timeline is disconnected from editor/export and does not apply video trim.
- Local dev server started successfully; working tree was clean before this task.

## Implementation approach

Keep the Next.js project and historical components, introduce a typed scene document, one canvas renderer for preview/export, IndexedDB media/project persistence, and declarative React controls. Replace the active editor entry point only after its replacement compiles. Local-only workflow, no deployment.

## Verification story

Import media -> edit typed layers -> preview using the shared renderer -> persist blobs and scene in IndexedDB -> reopen -> render/download/play MP4 with matching dimensions and audio. Test cancellation, independent typography, selection and transforms, responsive layouts and offline operation.

## Results

- TypeScript check and production build pass. Next.js was updated within major version 16 to 16.3.5 after the package audit reported critical/high vulnerabilities; the subsequent installation audit reported zero vulnerabilities. Windows uses the working WASM compiler fallback on this machine (native compiler warning is non-fatal).
- Chrome interactive tests pass: continuous typing, independent text font selection, importing PNG/WAV/WebM, dragging/resizing/rotating/deleting a logo, particle minimum size 0.05, wind controls, all 20 spectrum choices, playback, save/reload with media, and project duplicate/rename/delete/open.
- 50 bundled font families loaded successfully with external network requests blocked. Every one of the 27 effect menu choices (including None) rendered without a browser exception. Selected effects were also visually inspected.
- Responsive screenshots verified at 1440 × 1000 and 390 × 844, with no horizontal page overflow. Persian direction/layout screenshot captured.
- Native MP4 with background video and music: 640 × 360, measured 3.025633 seconds; decoded audio RMS 0.15055 (not silent). Exported frames sampled at 1.6 and 2.5 seconds differ after the 1.2-second source video ends, verifying that the background continues looping rather than freezing.
- Full 181-second native export repeated on the final production build: 129,233,677 bytes. Browser-decoded duration 180.934333 seconds and dimensions 1920 × 1080. Real-time recorder timing is approximate, as noted below.
- Compatibility MP4: the initial test found webpack rewriting the encoder worker's dynamic core import. Serving the upstream worker as a local ESM asset fixed it. Re-tested using the actual Compatibility encoder checkbox against the final production build: two-second MP4 downloaded successfully (119,334 bytes).
- Export cancellation, invalid-dimension error, correction, and retry pass. Errors remain visible inside the dialog. No application page errors in the final workflow and edge-case test runs.
- Canvas resizing now applies one uniform fit transform to layer geometry and text size; full-canvas background/particle layers remain full bleed. Browser verification confirmed editable Custom canvas dimensions (1280 × 720) with no page errors.

## Important boundaries

- This is browser-based, real-time recording, not guaranteed frame-perfect offline encoding. Heavy scenes, 4K/60, background-tab throttling and memory constraints remain device-dependent. Export is limited to 600 seconds; keep the tab visible.
- Effects are procedural canvas effects, not licensed photographic footage overlays. A single global motion effect can be selected at a time; background filters can be combined independently.
- Old projects saved only HTML and temporary blob URLs. They are preserved and can be backed up, but missing original media cannot be reconstructed. New projects persist actual media blobs in IndexedDB.
- Clearing browser site data removes local projects. There is no cloud backup. Browser storage quota errors are shown rather than silently discarded.
- Fonts bundle regular faces; synthesized bold/italic is used when a matching face is not bundled. Text formatting is per layer, not rich-text formatting within a line.
- No deployment or remote repository push was performed.
