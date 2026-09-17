import { mkdir, copyFile } from "node:fs/promises";
// Serve the upstream ESM worker without webpack rewriting its runtime import.
await mkdir("public/ffmpeg/worker", { recursive: true });
for (const name of ["worker.js", "const.js", "errors.js"])
  await copyFile(
    `node_modules/@ffmpeg/ffmpeg/dist/esm/${name}`,
    `public/ffmpeg/worker/${name}`,
  );
for (const name of ["ffmpeg-core.js", "ffmpeg-core.wasm"])
  await copyFile(
    `node_modules/@ffmpeg/core/dist/esm/${name}`,
    `public/ffmpeg/${name}`,
  );
