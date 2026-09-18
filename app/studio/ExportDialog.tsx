"use client";
import { useEffect, useRef, useState } from "react";
import { Project } from "./model";
import { AudioAnalysis } from "./audio";
import { exportMP4, Progress } from "./exporter";
import { Translate } from "./Controls";
export default function ExportDialog({
  project,
  analysis,
  onClose,
  onSettings,
  t,
}: {
  project: Project;
  analysis?: AudioAnalysis;
  onClose: () => void;
  onSettings: (p: Project["export"]) => void;
  t: Translate;
}) {
  const [width, setWidth] = useState(project.export.width ?? project.width),
    [height, setHeight] = useState(project.export.height ?? project.height),
    [fps, setFps] = useState(project.export.fps),
    [quality, setQuality] = useState(project.export.quality),
    [start, setStart] = useState(project.export.start ?? project.start),
    [end, setEnd] = useState(project.export.end ?? project.end),
    [progress, setProgress] = useState<Progress | null>(null),
    [busy, setBusy] = useState(false),
    // The browser-native recorder can silently produce a variable/very low
    // frame-rate MP4 when a scene is expensive to render. Keep the constant
    // frame-rate encoder enabled by default so downloaded files match the
    // selected FPS instead of the browser's rendering throughput.
    [compatibility, setCompatibility] = useState(true),
    [error, setError] = useState(""),
    [url, setUrl] = useState("");
  const abort = useRef<AbortController | null>(null),
    urlRef = useRef("");
  const box = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    box.current?.showModal();
    return () => {
      abort.current?.abort();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);
  const render = async () => {
    if (busy) return;
    setError("");
    setUrl("");
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    try {
      onSettings({ fps, quality, width, height, start, end });
      const blob = await exportMP4(
        { ...project, start, end, export: { fps, quality, width, height } },
        analysis,
        controller.signal,
        setProgress,
        compatibility,
      );
      urlRef.current = URL.createObjectURL(blob);
      setUrl(urlRef.current);
    } catch (e) {
      setError(
        controller.signal.aborted
          ? t("Export cancelled")
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };
  return (
    <dialog
      ref={box}
      className="studio-dialog export-dialog"
      onCancel={(e) => {
        if (busy) {
          e.preventDefault();
          abort.current?.abort();
        } else onClose();
      }}
    >
      <div className="dialog-heading">
        <div>
          <span className="eyebrow">DELIVER YOUR RELEASE</span>
          <h2>{t("Export video")}</h2>
        </div>
        <button aria-label="Close export" disabled={busy} onClick={onClose}>
          ×
        </button>
      </div>
      <p className="muted">
        {t("Your composition, rendered locally. Media stays on this device.")}
      </p>
      <fieldset disabled={busy}>
        <label className="field">
          <span>{t("Format")}</span>
          <select
            aria-label="Export format"
            value={
              ["1920x1080", "1080x1920", "1080x1080", "3840x2160"].includes(
                `${width}x${height}`,
              )
                ? `${width}x${height}`
                : "custom"
            }
            onChange={(e) => {
              if (e.target.value === "custom") return;
              const [w, h] = e.target.value.split("x").map(Number);
              setWidth(w);
              setHeight(h);
            }}
          >
            <option value="1920x1080">YouTube · 1920 × 1080</option>
            <option value="1080x1920">
              Reel / Story / Spotify · 1080 × 1920
            </option>
            <option value="1080x1080">Square · 1080 × 1080</option>
            <option value="3840x2160">YouTube 4K · 3840 × 2160</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <div className="field-grid">
          <label className="field">
            <span>{t("Width")}</span>
            <input
              aria-label="Export width"
              type="number"
              min={64}
              max={3840}
              step={2}
              value={width}
              onChange={(e) => setWidth(+e.target.value)}
            />
          </label>
          <label className="field">
            <span>{t("Height")}</span>
            <input
              aria-label="Export height"
              type="number"
              min={64}
              max={3840}
              step={2}
              value={height}
              onChange={(e) => setHeight(+e.target.value)}
            />
          </label>
          <label className="field">
            <span>{t("Frame rate")}</span>
            <select
              aria-label="Frame rate"
              value={fps}
              onChange={(e) => setFps(+e.target.value)}
            >
              {[24, 30, 60].map((n) => (
                <option key={n} value={n}>
                  {n} fps
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t("Quality")}</span>
            <select
              aria-label="Quality"
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
            >
              {["Standard", "High", "Master"].map((q) => (
                <option key={q}>{q}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t("Start (seconds)")}</span>
            <input
              aria-label="Export start"
              type="number"
              min={0}
              step={0.1}
              value={start}
              onChange={(e) => setStart(+e.target.value)}
            />
          </label>
          <label className="field">
            <span>{t("End (seconds)")}</span>
            <input
              aria-label="Export end"
              type="number"
              min={0.1}
              step={0.1}
              value={end}
              onChange={(e) => setEnd(+e.target.value)}
            />
          </label>
        </div>
        <button
          disabled={!analysis}
          onClick={() => {
            setStart(0);
            setEnd(analysis!.buffer.duration);
          }}
        >
          {t("Use full music duration")}
        </button>
      </fieldset>
      <label className="toggle-field field">
        <span>{t("Constant frame-rate encoder (recommended)")}</span>
        <input
          aria-label="Compatibility encoder"
          type="checkbox"
          disabled={busy}
          checked={compatibility}
          onChange={(e) => setCompatibility(e.target.checked)}
        />
      </label>
      <div className="export-summary">
        <strong>{Math.max(0, end - start).toFixed(1)}s</strong>
        <span>
          MP4 · {width} × {height} · {fps} fps
        </span>
      </div>
      <p className="hint">
        {t(
          "Keep this tab visible. Recording takes the selected duration; conversion may take additional time.",
        )}
      </p>
      {progress && (
        <div className="progress-card" role="status">
          <div>
            <strong>{t(progress.stage)}</strong>
            <b>{Math.round(progress.percent)}%</b>
          </div>
          <progress
            aria-label="Export progress"
            value={progress.percent}
            max={100}
          />
          <small>
            {t("Elapsed")}: {Math.floor(progress.elapsed)}s ·{" "}
            {progress.remaining === null
              ? t("Estimating remaining time")
              : t("Remaining") + `: ~${Math.ceil(progress.remaining)}s`}
          </small>
        </div>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {url ? (
        <a
          className="primary-button download-button"
          href={url}
          download={`${project.name.replace(/[^\p{L}\p{N}_ -]/gu, "") || "vage"}.mp4`}
        >
          {t("Download MP4")} ↓
        </a>
      ) : (
        <button className="primary-button" disabled={busy} onClick={render}>
          {busy ? t("Rendering…") : t("Render MP4")} ↗
        </button>
      )}
      {busy && (
        <button
          className="cancel-button"
          onClick={() => abort.current?.abort()}
        >
          {t("Cancel export")}
        </button>
      )}
    </dialog>
  );
}
