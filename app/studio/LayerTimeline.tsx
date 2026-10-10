"use client";

import { useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import { clamp, Layer, LayerMotion } from "./model";
import { layerMotion, validateMotion } from "./motion";
import type { Translate } from "./Controls";

type Mode = "move" | "start" | "end" | "entrance-duration" | "exit-duration";
type Gesture = { id: string; mode: Mode; x: number; width: number; initial: LayerMotion; remembered: boolean };

export default function LayerTimeline({
  layers,
  duration,
  time,
  selected,
  onSelect,
  onChange,
  onSeek,
  t,
}: {
  layers: Layer[];
  duration: number;
  time: number;
  selected: string[];
  onSelect: (id: string) => void;
  onChange: (id: string, motion: LayerMotion, remember: boolean) => void;
  onSeek: (time: number) => void;
  t: Translate;
}) {
  const gesture = useRef<Gesture | null>(null);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [snap, setSnap] = useState(true);
  const [dragReadout, setDragReadout] = useState("");
  const visibleLayers = selectedOnly ? layers.filter((layer) => selected.includes(layer.id)) : layers;

  const change = (id: string, initial: LayerMotion, mode: Mode, rawDelta: number, remember: boolean, trackWidth = 0) => {
    let delta = rawDelta;
    const end = initial.end ?? duration;
    if (snap && trackWidth > 0 && (mode === "move" || mode === "start" || mode === "end")) {
      const candidates = [0, duration, time, ...layers.filter((layer) => layer.id !== id).flatMap((layer) => {
        const motion = layerMotion(layer);
        return [motion.start, motion.end ?? duration];
      })];
      const anchors = mode === "move"
        ? [initial.start + delta, end + delta]
        : [mode === "start" ? initial.start + delta : end + delta];
      const threshold = duration / Math.max(1, trackWidth) * 8;
      let adjustment: number | null = null;
      let nearest = threshold;
      for (const anchor of anchors) for (const candidate of candidates) {
        const distance = Math.abs(candidate - anchor);
        if (distance < nearest) { nearest = distance; adjustment = candidate - anchor; }
      }
      if (adjustment !== null) delta += adjustment;
    }

    const next = { ...initial };
    if (mode === "move") { next.start = initial.start + delta; next.end = end + delta; }
    else if (mode === "start") next.start = initial.start + delta;
    else if (mode === "end") next.end = end + delta;
    else if (mode === "entrance-duration") next.entrance = { ...initial.entrance, duration: initial.entrance.duration + delta };
    else next.exit = { ...initial.exit, duration: initial.exit.duration - delta };
    next.start = Math.round(next.start * 1000) / 1000;
    if (next.end !== null) next.end = Math.round(next.end * 1000) / 1000;
    const issue = validateMotion(next, duration);
    setError(issue || "");
    if (issue) return false;
    setDragReadout(`${next.start.toFixed(2)} – ${(next.end ?? duration).toFixed(2)}s`);
    onChange(id, next, remember);
    return true;
  };

  const begin = (event: PointerEvent<HTMLButtonElement>, layer: Layer, mode: Mode) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    const track = event.currentTarget.closest(".layer-time-track") as HTMLElement | null;
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      id: layer.id,
      mode,
      x: event.clientX,
      width: track?.getBoundingClientRect().width || 0,
      initial: layerMotion(layer),
      remembered: false,
    };
    onSelect(layer.id);
    setError("");
  };

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current) return;
    const delta = (event.clientX - current.x) / Math.max(1, current.width) * duration;
    if (change(current.id, current.initial, current.mode, delta, !current.remembered, current.width)) current.remembered = true;
  };

  const keyboard = (event: KeyboardEvent<HTMLButtonElement>, layer: Layer, mode: Mode) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const sign = event.key === "ArrowLeft" ? -1 : 1;
    change(layer.id, layerMotion(layer), mode, sign * (event.shiftKey ? 1 : 0.1), true, 96);
  };

  const marks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <details className="layer-timeline" open>
      <summary>
        <span>{t("Layer timing")}</span>
        <small>{dragReadout || `${duration.toFixed(2)}s · ${t("Project duration")}`}</small>
      </summary>
      <div className="layer-timeline-tools">
        <label className="timeline-toggle"><input type="checkbox" checked={selectedOnly} onChange={(event) => setSelectedOnly(event.target.checked)} />{t("Selected tracks only")}</label>
        <label className="timeline-toggle"><input type="checkbox" checked={snap} onChange={(event) => setSnap(event.target.checked)} />{t("Snap to playhead and clips")}</label>
        <div className="timeline-zoom" aria-label={t("Timeline zoom")}>
          <button type="button" title={t("Zoom out timeline")} aria-label={t("Zoom out timeline")} disabled={zoom <= 0.5} onClick={() => setZoom((value) => Math.max(0.5, Math.round((value - 0.25) * 100) / 100))}>−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" title={t("Zoom in timeline")} aria-label={t("Zoom in timeline")} disabled={zoom >= 4} onClick={() => setZoom((value) => Math.min(4, Math.round((value + 0.25) * 100) / 100))}>+</button>
          <button type="button" title={t("Fit full timeline")} onClick={() => setZoom(1)}>{t("Fit")}</button>
        </div>
      </div>
      {error && <p role="alert" className="motion-error">{t(error)}</p>}
      <div className="layer-time-scroll">
        <div className="layer-time-inner" style={{ width: `${zoom * 100}%`, minWidth: "100%" }}>
          <div className="layer-time-ruler" dir="ltr">
            <span className="layer-time-name-label">{t("Layer")}</span>
            <div className="layer-time-ruler-track">
              {marks.map((mark) => <button type="button" key={mark} style={{ left: `${mark * 100}%` }} onClick={() => onSeek(mark * duration)}>{(duration * mark).toFixed(mark === 0 || mark === 1 ? 1 : 0)}s</button>)}
            </div>
          </div>
          <div
            className="layer-time-rows"
            dir="ltr"
            onPointerMove={move}
            onPointerUp={() => { gesture.current = null; setDragReadout(""); }}
            onPointerCancel={() => {
              const current = gesture.current;
              if (current?.remembered) onChange(current.id, current.initial, false);
              gesture.current = null;
              setDragReadout("");
            }}
          >
            {visibleLayers.length === 0 ? <p className="timeline-empty">{t("Select a layer to show its track.")}</p> : [...visibleLayers].reverse().map((layer) => {
              const motion = layerMotion(layer);
              const end = motion.end ?? duration;
              const length = Math.max(0.001, end - motion.start);
              return (
                <div className={`layer-time-row ${selected.includes(layer.id) ? "selected" : ""}`} key={layer.id}>
                  <button className="layer-time-name" aria-pressed={selected.includes(layer.id)} onClick={() => onSelect(layer.id)} title={layer.name}>{layer.visible ? "" : "◌ "}{layer.name}</button>
                  <div className="layer-time-track" onPointerDown={(event) => { if (event.target === event.currentTarget) onSeek(clamp((event.clientX - event.currentTarget.getBoundingClientRect().left) / event.currentTarget.clientWidth * duration, 0, duration)); }}>
                    <div className="layer-time-clip" style={{ left: `${motion.start / duration * 100}%`, width: `${Math.max(0, length) / duration * 100}%` }}>
                      {motion.entrance.style !== "None" && <><span className="layer-time-in" title={`${t("Entrance")} · ${motion.entrance.duration.toFixed(2)}s`} style={{ left: `${motion.entrance.delay / length * 100}%`, width: `${Math.min(100, motion.entrance.duration / length * 100)}%` }} /><button className="layer-motion-handle entrance" aria-label={`${t("Resize entrance")}: ${layer.name}`} title={`${t("Entrance")}: ${motion.entrance.duration.toFixed(2)}s · ${t("Drag to resize")}`} style={{ left: `${(motion.entrance.delay + motion.entrance.duration) / length * 100}%` }} onPointerDown={(event) => begin(event, layer, "entrance-duration")} onKeyDown={(event) => keyboard(event, layer, "entrance-duration")} /></>}
                      {motion.exit.style !== "None" && <><span className="layer-time-out" title={`${t("Exit")} · ${motion.exit.duration.toFixed(2)}s`} style={{ right: `${motion.exit.delay / length * 100}%`, width: `${Math.min(100, motion.exit.duration / length * 100)}%` }} /><button className="layer-motion-handle exit" aria-label={`${t("Resize exit")}: ${layer.name}`} title={`${t("Exit")}: ${motion.exit.duration.toFixed(2)}s · ${t("Drag to resize")}`} style={{ right: `${(motion.exit.delay + motion.exit.duration) / length * 100}%` }} onPointerDown={(event) => begin(event, layer, "exit-duration")} onKeyDown={(event) => keyboard(event, layer, "exit-duration")} /></>}
                      <button className="layer-time-body" aria-label={`${t("Move timing")}: ${layer.name}`} title={`${motion.start.toFixed(2)} – ${end.toFixed(2)}s`} onPointerDown={(event) => begin(event, layer, "move")} onKeyDown={(event) => keyboard(event, layer, "move")}>{motion.start.toFixed(1)} – {end.toFixed(1)}s</button>
                      {(["start", "end"] as const).map((mode) => <button key={mode} className={`layer-time-handle ${mode}`} aria-label={`${t(mode === "start" ? "Trim start" : "Trim end")}: ${layer.name}`} onPointerDown={(event) => begin(event, layer, mode)} onKeyDown={(event) => keyboard(event, layer, mode)} />)}
                    </div>
                    <span className="layer-time-playhead" style={{ left: `${clamp(time / duration, 0, 1) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p className="hint">{t("Purple: entrance · Orange: exit · Arrow keys: 0.1s, Shift: 1s")}</p>
    </details>
  );
}
