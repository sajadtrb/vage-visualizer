"use client";
import { useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import { clamp, Layer, LayerMotion } from "./model";
import { layerMotion, validateMotion } from "./motion";
import type { Translate } from "./Controls";
type Mode = "move" | "start" | "end" | "entrance-duration" | "exit-duration";
type Gesture = { id: string; mode: Mode; x: number; width: number; initial: LayerMotion; remembered: boolean };
export default function LayerTimeline({ layers, duration, time, selected, onSelect, onChange, onSeek, t }: { layers: Layer[]; duration: number; time: number; selected: string[]; onSelect: (id: string) => void; onChange: (id: string, motion: LayerMotion, remember: boolean) => void; onSeek: (time: number) => void; t: Translate }) {
  const gesture = useRef<Gesture | null>(null), [error, setError] = useState("");
  const change = (id: string, initial: LayerMotion, mode: Mode, delta: number, remember: boolean) => {
    const end = initial.end ?? duration;
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
    onChange(id, next, remember); return true;
  };
  const begin = (e: PointerEvent<HTMLButtonElement>, layer: Layer, mode: Mode) => {
    e.stopPropagation(); if (e.button !== 0) return;
    const track = e.currentTarget.closest(".layer-time-track") as HTMLElement;
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { id: layer.id, mode, x: e.clientX, width: track.getBoundingClientRect().width, initial: layerMotion(layer), remembered: false };
    onSelect(layer.id); setError("");
  };
  const move = (e: PointerEvent) => {
    const g = gesture.current; if (!g) return;
    const delta = (e.clientX - g.x) / Math.max(1, g.width) * duration;
    if (change(g.id, g.initial, g.mode, delta, !g.remembered)) g.remembered = true;
  };
  const keyboard = (e: KeyboardEvent, layer: Layer, mode: Mode) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation();
    const sign = e.key === "ArrowLeft" ? -1 : 1;
    change(layer.id, layerMotion(layer), mode, sign * (e.shiftKey ? 1 : 0.1), true);
  };
  return <details className="layer-timeline" open>
    <summary>{t("Layer timing")} <small>{duration.toFixed(2)}s · {t("Drag to move; drag edges to trim")}</small></summary>
    {error && <p role="alert" className="motion-error">{t(error)}</p>}
    <div className="layer-time-rows" dir="ltr" onPointerMove={move} onPointerUp={() => { gesture.current = null; }} onPointerCancel={() => { const g = gesture.current; if (g?.remembered) onChange(g.id, g.initial, false); gesture.current = null; }}>
      {[...layers].reverse().map(layer => {
        const m = layerMotion(layer), end = m.end ?? duration, length = end - m.start;
        return <div className={`layer-time-row ${selected.includes(layer.id) ? "selected" : ""}`} key={layer.id}>
          <button className="layer-time-name" aria-pressed={selected.includes(layer.id)} onClick={() => onSelect(layer.id)} title={layer.name}>{layer.visible ? "" : "◌ "}{layer.name}</button>
          <div className="layer-time-track" onPointerDown={e => { if (e.target === e.currentTarget) onSeek(clamp((e.clientX - e.currentTarget.getBoundingClientRect().left) / e.currentTarget.clientWidth * duration, 0, duration)); }}>
            <div className="layer-time-clip" style={{ left: `${m.start / duration * 100}%`, width: `${Math.max(0, length) / duration * 100}%` }}>
              {m.entrance.style !== "None" && <><span className="layer-time-in" title={`${t("Entrance")} · ${m.entrance.duration.toFixed(2)}s`} style={{ left: `${m.entrance.delay / length * 100}%`, width: `${Math.min(100, m.entrance.duration / length * 100)}%` }} /><button className="layer-motion-handle entrance" aria-label={`${t("Resize entrance")}: ${layer.name}`} title={`${t("Entrance")}: ${m.entrance.duration.toFixed(2)}s · ${t("Drag to resize")}`} style={{ left: `${(m.entrance.delay + m.entrance.duration) / length * 100}%` }} onPointerDown={e => begin(e, layer, "entrance-duration")} onKeyDown={e => keyboard(e, layer, "entrance-duration")} /></>}
              {m.exit.style !== "None" && <><span className="layer-time-out" title={`${t("Exit")} · ${m.exit.duration.toFixed(2)}s`} style={{ right: `${m.exit.delay / length * 100}%`, width: `${Math.min(100, m.exit.duration / length * 100)}%` }} /><button className="layer-motion-handle exit" aria-label={`${t("Resize exit")}: ${layer.name}`} title={`${t("Exit")}: ${m.exit.duration.toFixed(2)}s · ${t("Drag to resize")}`} style={{ right: `${(m.exit.delay + m.exit.duration) / length * 100}%` }} onPointerDown={e => begin(e, layer, "exit-duration")} onKeyDown={e => keyboard(e, layer, "exit-duration")} /></>}
              <button className="layer-time-body" aria-label={`${t("Move timing")}: ${layer.name}`} title={`${m.start.toFixed(2)} – ${end.toFixed(2)}s`} onPointerDown={e => begin(e, layer, "move")} onKeyDown={e => keyboard(e, layer, "move")}>{m.start.toFixed(1)} – {end.toFixed(1)}s</button>
              {(["start", "end"] as const).map(mode => <button key={mode} className={`layer-time-handle ${mode}`} aria-label={`${t(mode === "start" ? "Trim start" : "Trim end")}: ${layer.name}`} onPointerDown={e => begin(e, layer, mode)} onKeyDown={e => keyboard(e, layer, mode)} />)}
            </div>
            <span className="layer-time-playhead" style={{ left: `${clamp(time / duration, 0, 1) * 100}%` }} />
          </div>
        </div>;
      })}
    </div>
    <p className="hint">{t("Purple: entrance · Orange: exit · Arrow keys: 0.1s, Shift: 1s")}</p>
  </details>;
}
