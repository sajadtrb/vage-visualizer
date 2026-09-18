import { Project } from "./model";
import { AudioAnalysis } from "./audio";
import { MediaLibrary } from "./media";
import { renderScene, videoTime } from "./renderer";
import { loadFonts } from "./fonts";
export type Progress = {
  percent: number;
  stage: string;
  elapsed: number;
  remaining: number | null;
};
export async function exportMP4(
  project: Project,
  analysis: AudioAnalysis | undefined,
  signal: AbortSignal,
  report: (p: Progress) => void,
  forceFallback = false,
) {
  const start = performance.now();
  const duration = project.end - project.start;
  const width = project.export.width ?? project.width,
    height = project.export.height ?? project.height;
  // Keep design-space font sizes and effects consistent across output resolutions.
  const scene = { ...project, height: (project.width * height) / width };
  if (!(duration > 0 && duration <= 600))
    throw Error("Choose an export range between 0.1 and 600 seconds.");
  if (
    width % 2 ||
    height % 2 ||
    width < 64 ||
    height < 64 ||
    width > 3840 ||
    height > 3840
  )
    throw Error("Dimensions must be even numbers between 64 and 3840.");
  const media = new MediaLibrary();
  let context: AudioContext | undefined,
    stream: MediaStream | undefined,
    recorder: MediaRecorder | undefined,
    animation = 0,
    watchdog: ReturnType<typeof setTimeout> | undefined;
  let ffmpeg: import("@ffmpeg/ffmpeg").FFmpeg | undefined;
  let stage = "Preparing media";
  const send = (percent: number, remaining: number | null = null) =>
    report({
      percent,
      stage,
      elapsed: (performance.now() - start) / 1000,
      remaining,
    });
  const check = () => signal.throwIfAborted();
  async function bounded<T>(task: Promise<T>, ms: number) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: () => void = () => {};
    try {
      return await Promise.race([
        task,
        new Promise<never>((_, reject) => {
          abort = () =>
            reject(new DOMException("Export cancelled", "AbortError"));
          signal.addEventListener("abort", abort, { once: true });
          timer = setTimeout(
            () =>
              reject(
                Error(
                  `${stage} timed out. Try a lower resolution or a shorter range.`,
                ),
              ),
            ms,
          );
          if (signal.aborted) abort();
        }),
      ]);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  }
  try {
    if (project.audio && !analysis)
      throw Error(
        "Audio is not ready. Wait for analysis to finish before exporting.",
      );
    send(0);
    await bounded(
      loadFonts(
        project.layers
          .filter((l) => l.kind === "text")
          .map((l) => String(l.settings.font)),
      ),
      30000,
    );
    await bounded(
      Promise.all(
        project.layers
          .filter((l) => l.visible && l.asset)
          .map((l) => media.load(l.asset!)),
      ),
      30000,
    );
    check();
    const native = !forceFallback
      ? [
          "video/mp4;codecs=avc1.42001f,mp4a.40.2",
          "video/mp4;codecs=avc1,mp4a.40.2",
          "video/mp4",
        ].find((m) => MediaRecorder.isTypeSupported(m))
      : undefined;
    if (!native) {
      stage = "Loading local MP4 encoder";
      send(0);
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      ffmpeg = new FFmpeg();
      await bounded(
        ffmpeg.load({
          classWorkerURL: new URL("/ffmpeg/worker/worker.js", location.href)
            .href,
          coreURL: new URL("/ffmpeg/ffmpeg-core.js", location.href).href,
          wasmURL: new URL("/ffmpeg/ffmpeg-core.wasm", location.href).href,
        }),
        45000,
      );
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const scratch = document.createElement("canvas");
    await Promise.all(
      project.layers
        .filter((l) => l.asset && media.videos.has(l.asset))
        .map((l) => media.seek(l.asset!, videoTime(l, 0, media))),
    );
    renderScene(canvas, scene, media, 0, analysis, scratch);
    // Explicit frame requests prevent CanvasCaptureMediaStreamTrack from
    // inheriting the browser's best-effort paint rate. On heavy compositions
    // that otherwise becomes a variable-rate recording (for example ~6.7fps
    // even though the export was configured for 30fps).
    const explicitCapture = canvas.captureStream(0);
    const explicitTrack = explicitCapture.getVideoTracks()[0] as
      | (CanvasCaptureMediaStreamTrack & { requestFrame?: () => void })
      | undefined;
    const requestCapturedFrame = explicitTrack?.requestFrame
      ? () => explicitTrack.requestFrame!()
      : undefined;
    stream = requestCapturedFrame
      ? explicitCapture
      : canvas.captureStream(project.export.fps);
    if (!requestCapturedFrame) explicitCapture.getTracks().forEach((t) => t.stop());
    let source: AudioBufferSourceNode | undefined;
    if (analysis) {
      context = new AudioContext();
      await context.resume();
      const dest = context.createMediaStreamDestination();
      source = context.createBufferSource();
      source.buffer = analysis.buffer;
      source.connect(dest);
      dest.stream.getAudioTracks().forEach((t) => stream!.addTrack(t));
    }
    const mime =
      native ||
      ["video/webm;codecs=vp8,opus", "video/webm"].find((m) =>
        MediaRecorder.isTypeSupported(m),
      );
    if (!mime)
      throw Error("Your browser cannot record video. Use desktop Chrome.");
    recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond:
        { Standard: 5000000, High: 10000000, Master: 18000000 }[
          project.export.quality
        ] || 10000000,
      audioBitsPerSecond: 192000,
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    stage = "Rendering frames & audio";
    send(0, duration);
    await bounded(
      new Promise<void>((resolve, reject) => {
        recorder!.onerror = (e) =>
          reject(
            Error(
              `Video recorder error: ${(e as Event & { error?: Error }).error?.message || "insufficient encoding resources"}`,
            ),
          );
        recorder!.onstop = () => resolve();
        const begin = performance.now();
        const frameInterval = 1000 / project.export.fps;
        let nextFrameAt = begin;
        recorder!.start(1000);
        source?.start(
          0,
          project.start,
          Math.min(
            duration,
            Math.max(0, analysis!.buffer.duration - project.start),
          ),
        );
        for (const layer of project.layers) {
          const video = layer.asset ? media.videos.get(layer.asset) : undefined;
          if (video) {
            video.loop = layer.settings.videoLoop !== false;
            video.play().catch(reject);
          }
        }
        const tick = (now: number) => {
          try {
            check();
            const t = (now - begin) / 1000;
            if (t >= duration) {
              recorder!.stop();
              return;
            }
            if (now + 0.5 >= nextFrameAt) {
              project.layers.forEach((l) => {
                const v = l.asset ? media.videos.get(l.asset) : undefined;
                if (v) {
                  const expected = videoTime(l, t, media);
                  if (Math.abs(v.currentTime - expected) > 0.2 && !v.seeking)
                    v.currentTime = expected;
                  if (v.paused && v.loop) v.play().catch(reject);
                }
              });
              renderScene(canvas, scene, media, t, analysis, scratch);
              requestCapturedFrame?.();
              send(
                (t / duration) * (native ? 98 : 80),
                Math.max(0, duration - t),
              );
              // Keep the schedule tied to the export clock. Advancing from
              // `now` would turn every slow render into a new, slower FPS.
              do {
                nextFrameAt += frameInterval;
              } while (nextFrameAt <= now);
            }
            animation = requestAnimationFrame(tick);
          } catch (e) {
            reject(e);
          }
        };
        animation = requestAnimationFrame(tick);
        watchdog = setTimeout(
          () =>
            reject(
              Error(
                "Rendering was interrupted. Keep this tab visible while exporting.",
              ),
            ),
          duration * 1000 + 20000,
        );
      }),
      duration * 1000 + 25000,
    );
    check();
    clearTimeout(watchdog);
    cancelAnimationFrame(animation);
    stream.getTracks().forEach((t) => t.stop());
    media.videos.forEach((v) => v.pause());
    if (!chunks.length) throw Error("No video data was recorded.");
    let blob = new Blob(chunks, { type: native ? "video/mp4" : "video/webm" });
    if (ffmpeg) {
      stage = "Encoding MP4";
      send(80);
      ffmpeg.on("progress", ({ progress }) =>
        send(80 + Math.max(0, Math.min(0.99, progress)) * 19),
      );
      const logs: string[] = [];
      ffmpeg.on("log", ({ message }) => {
        logs.push(message);
        if (logs.length > 6) logs.shift();
      });
      await ffmpeg.writeFile(
        "in.webm",
        new Uint8Array(await blob.arrayBuffer()),
      );
      const result = await bounded(
        ffmpeg.exec([
          "-i",
          "in.webm",
          "-map",
          "0:v:0",
          "-map",
          "0:a?",
          "-r",
          String(project.export.fps),
          "-fps_mode",
          "cfr",
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-crf",
          project.export.quality === "Master"
            ? "18"
            : project.export.quality === "High"
              ? "21"
              : "26",
          "-c:a",
          "aac",
          "-pix_fmt",
          "yuv420p",
          "-shortest",
          "-movflags",
          "+faststart",
          "out.mp4",
        ]),
        Math.max(120000, duration * 6000),
      );
      if (result !== 0) throw Error(logs.join("\n"));
      const bytes = await ffmpeg.readFile("out.mp4");
      if (typeof bytes === "string") throw Error("Invalid encoder output");
      blob = new Blob([new Uint8Array(bytes)], { type: "video/mp4" });
    }
    if (blob.size < 100) throw Error("The output file is empty.");
    stage = "Ready to download";
    send(100, 0);
    return blob;
  } catch (error) {
    if (signal.aborted)
      throw new DOMException("Export cancelled", "AbortError");
    throw Error(
      `${stage}: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    cancelAnimationFrame(animation);
    clearTimeout(watchdog);
    if (recorder?.state === "recording") recorder.stop();
    stream?.getTracks().forEach((t) => t.stop());
    await context?.close();
    media.dispose();
    ffmpeg?.terminate();
  }
}
