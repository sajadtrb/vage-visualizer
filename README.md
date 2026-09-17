# Vage Studio

Local-first music visualizer editor, built with Next.js and React. No account or cloud service is required. Media, projects and autosaves stay in IndexedDB in the browser on this device.

## Run locally

```powershell
npm install
npm run dev
```

Open http://localhost:3000. Use the same browser and port to access saved projects. Runtime fonts, icons and the fallback encoder are bundled; an internet connection is not required after installation. Keep the local server running. For production locally, use `npm run build` followed by `npm start`.

## Editing

- Import music, cover art, images and background video from Media.
- Select a layer from Layers or directly on the canvas. Drag a corner to resize; drag the round handle to rotate. Shift snaps rotation; Alt allows non-proportional resizing.
- Text content, color and font live at the top of the selected text inspector. Each text layer is independent.
- Shift-click layers to select more than one. Arrow keys nudge, Shift-arrow moves farther. Delete removes selected unlocked layers. Ctrl/Cmd-Z undoes; Shift-Ctrl/Cmd-Z redoes.
- Particle color, spectrum color and text color are separate. Particles start hidden, using Soft dots. Use the visibility button in Layers to enable them.
- Background filters only affect the background. Global effects live in the Effects tab.
- Projects autosave, including imported blobs. The project library supports open, rename, duplicate and confirmed deletion. Browser storage can still be removed by clearing site data: this is local storage, not a cloud backup.

## Export

Export uses the **same scene renderer** as preview. Modern desktop Chrome records MP4 directly with audio; browsers without MP4 recording use the bundled FFmpeg conversion fallback. Progress reports actual recording time and encoder progress, with cancellation and stage-specific errors.

Recording is real-time: a three-minute video takes approximately three minutes, plus finalization or conversion. Keep the tab visible. Supported export dimensions are even numbers from 64 to 3840 pixels, duration up to 600 seconds, and 24/30/60 requested FPS. Browser recording may drop frames under heavy load; it is not an offline frame-perfect render farm. Large 4K/60 exports depend on device resources. Preview quality and final dimensions are separate.

Video source audio is intentionally muted; imported music supplies the export audio. Video segments loop independently. All 50 font families have local files and bundled licenses; regular faces are bundled and bold/italic may be synthesized by the browser for families without those faces.

## Architecture

`app/studio/model.ts` defines the scene document. `storage.ts` persists scenes and assets separately. `audio.ts` precomputes real FFT and waveform features from the music, shared by preview and export. `renderer.ts` renders backgrounds, layers, spectra, particles and effects. `exporter.ts` owns isolated media, recording, cancellation and cleanup. React owns the entire editor UI; controls do not inject or reparent DOM nodes.

The historical editor and timeline components are retained as reference but are no longer active routes. Old HTML-only `vage-projects` snapshots are not deleted. They did not contain persistent media blobs and cannot be assumed to be complete recoverable projects; re-import original media when recreating them in the new editor.

## Verification

With the local server running and Playwright available:

```powershell
node scripts/verify-studio.cjs
node scripts/verify-workflows.cjs
node scripts/verify-render.cjs
```

Set `PLAYWRIGHT_PATH` to your installed Playwright package if not using the bundled Codex runtime. Tests use isolated browser profiles, generated fixtures and `artifacts/` (ignored by Git); they do not alter your own saved projects. `RENDER_SECONDS` adjusts the long export test; `FALLBACK=1` exercises FFmpeg conversion. See REVIEW.md for measured results and remaining limitations.
