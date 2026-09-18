import { Project, clamp } from "./model";
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

function pcmWav(buffer: AudioBuffer, start: number, duration: number) {
  const channels = Math.min(2, buffer.numberOfChannels),
    sampleRate = buffer.sampleRate,
    first = Math.max(0, Math.floor(start * sampleRate)),
    frames = Math.max(
      1,
      Math.min(buffer.length - first, Math.ceil(duration * sampleRate)),
    ),
    bytesPerSample = 2,
    dataSize = frames * channels * bytesPerSample,
    out = new ArrayBuffer(44 + dataSize),
    view = new DataView(out);
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  write(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataSize, true);
  const tracks = Array.from({ length: channels }, (_, channel) =>
    buffer.getChannelData(channel),
  );
  let offset = 44;
  for (let i = 0; i < frames; i++)
    for (let channel = 0; channel < channels; channel++) {
      const sample = clamp(tracks[channel][first + i] || 0, -1, 1);
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  return new Uint8Array(out);
}
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
    const renderCanvas = document.createElement("canvas");
    const scratch = document.createElement("canvas");
    const outputContext = canvas.getContext("2d")!;
    let renderScale = 1;
    const resizeRenderSurface = (scale: number) => {
      renderScale = scale;
      // Keep the captured canvas at the requested export dimensions, while
      // allowing the expensive scene raster to run at a measured, practical
      // resolution. This is what preserves motion smoothness on 1080p scenes
      // with video, blur, particles, and reactive effects enabled together.
      renderCanvas.width = Math.max(2, Math.floor((width * scale) / 2) * 2);
      renderCanvas.height = Math.max(2, Math.floor((height * scale) / 2) * 2);
      scratch.width = renderCanvas.width;
      scratch.height = renderCanvas.height;
    };
    resizeRenderSurface(1);
    await Promise.all(
      project.layers
        .filter((l) => l.asset && media.videos.has(l.asset))
        .map((l) => media.seek(l.asset!, videoTime(l, 0, media))),
    );
    const paintFrame = (time: number) => {
      renderScene(renderCanvas, scene, media, time, analysis, scratch);
      outputContext.clearRect(0, 0, width, height);
      outputContext.drawImage(renderCanvas, 0, 0, width, height);
    };
    const measureStart = performance.now();
    paintFrame(0);
    const firstFrameCost = performance.now() - measureStart;
    if (!ffmpeg && firstFrameCost > 18) {
      const qualityCap =
        project.export.quality === "Standard"
          ? 0.65
          : project.export.quality === "High"
            ? 0.8
            : 1;
      const adaptiveScale = clamp(Math.sqrt(18 / firstFrameCost), 0.24, 1);
      const nextScale = Math.min(qualityCap, adaptiveScale);
      if (nextScale < 0.92) {
        resizeRenderSurface(nextScale);
        paintFrame(0);
      }
    }
    if (ffmpeg) {
      // The compatibility path is a deterministic offline frame renderer.
      // MediaRecorder is real-time by design: when a heavy scene misses a
      // deadline it records the same canvas frame again. That creates a file
      // which reports 30fps but visibly moves like 10fps. Encoding numbered
      // frames through FFmpeg gives every target timestamp its own frame and
      // keeps the exported composition aligned with the preview clock.
      stage = "Rendering export frames";
      const fps = project.export.fps,
        totalFrames = Math.max(1, Math.ceil(duration * fps)),
        segmentFrames = fps,
        segmentNames: string[] = [],
        encoder = ffmpeg;
      media.videos.forEach((video) => video.pause());
      const renderSegment = async (
        segment: number,
        firstFrame: number,
        count: number,
      ) => {
        const frameNames: string[] = [];
        for (let local = 0; local < count; local++) {
          check();
          const frame = firstFrame + local,
            time = frame / fps;
          await Promise.all(
            project.layers
              .filter((l) => l.asset && media.videos.has(l.asset))
              .map((l) => media.seek(l.asset!, videoTime(l, time, media))),
          );
          paintFrame(time);
          const frameBlob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (blob) => (blob ? resolve(blob) : reject(Error("Frame capture failed"))),
              "image/jpeg",
              project.export.quality === "Standard" ? 0.88 : 0.94,
            ),
          );
          const name = `frame-${String(local).padStart(3, "0")}.jpg`;
          frameNames.push(name);
          await encoder.writeFile(
            name,
            new Uint8Array(await frameBlob.arrayBuffer()),
          );
          send(
            ((frame + 1) / totalFrames) * 68,
            ((totalFrames - frame - 1) / fps) * 1.6,
          );
        }
        const segmentName = `segment-${String(segment).padStart(4, "0")}.mp4`;
        const result = await encoder.exec([
          "-framerate",
          String(fps),
          "-i",
          "frame-%03d.jpg",
          "-frames:v",
          String(count),
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
          "-pix_fmt",
          "yuv420p",
          "-an",
          segmentName,
        ]);
        for (const name of frameNames) await encoder.deleteFile(name);
        if (result !== 0) throw Error(`Frame segment ${segment + 1} failed.`);
        segmentNames.push(segmentName);
        send(68 + (segmentNames.length / Math.ceil(totalFrames / fps)) * 20);
      };
      for (let firstFrame = 0, segment = 0; firstFrame < totalFrames; ) {
        const count = Math.min(segmentFrames, totalFrames - firstFrame);
        await renderSegment(segment++, firstFrame, count);
        firstFrame += count;
      }
      const concat = segmentNames.map((name) => `file '${name}'`).join("\n");
      await encoder.writeFile("concat.txt", new TextEncoder().encode(concat));
      const muxArgs = [
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        "concat.txt",
      ];
      if (analysis) {
        await encoder.writeFile(
          "audio.wav",
          pcmWav(analysis.buffer, project.start, duration),
        );
        muxArgs.push("-i", "audio.wav");
      }
      muxArgs.push("-map", "0:v:0");
      if (analysis) muxArgs.push("-map", "1:a:0");
      muxArgs.push("-c:v", "copy");
      if (analysis) muxArgs.push("-c:a", "aac", "-b:a", "192k", "-shortest");
      muxArgs.push("-movflags", "+faststart", "out.mp4");
      const muxResult = await encoder.exec(muxArgs);
      if (muxResult !== 0) throw Error("Final MP4 muxing failed.");
      const encoded = await encoder.readFile("out.mp4");
      if (typeof encoded === "string") throw Error("Invalid encoder output");
      const offlineBlob = new Blob([new Uint8Array(encoded)], {
        type: "video/mp4",
      });
      if (offlineBlob.size < 100) throw Error("The output file is empty.");
      stage = "Ready to download";
      send(100, 0);
      return offlineBlob;
    }
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
              const paintStart = performance.now();
              paintFrame(t);
              const paintCost = performance.now() - paintStart;
              // A scene can become more expensive after the first frame when
              // a video decoder, audio-reactive effect, or particle burst is
              // active. Adapt again at runtime instead of allowing the clock
              // to skip frames and asking CFR encoding to duplicate them.
              if (paintCost > frameInterval * 0.9 && renderScale > 0.24) {
                const nextScale = Math.max(
                  0.24,
                  renderScale *
                    Math.sqrt((frameInterval * 0.68) / paintCost),
                );
                if (nextScale < renderScale * 0.92) {
                  resizeRenderSurface(nextScale);
                  paintFrame(t);
                }
              }
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
    const blob = new Blob(chunks, { type: native ? "video/mp4" : "video/webm" });
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
