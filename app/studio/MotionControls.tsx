"use client";
import { useEffect, useId, useState } from "react";
import { Layer, LayerMotion, Project, Transition } from "./model";
import { defaultTransition, directions, easings, layerMotion, motionGroups, projectTransitions, validateMotion } from "./motion";
import { Translate } from "./Controls";

export function MotionNumber({ label, value, onChange, min = 0, max = 600, step = 0.05 }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number }) {
  const [draft, setDraft] = useState(String(value)), [error, setError] = useState(false);
  const id = useId();
  useEffect(() => { setDraft(String(Math.round(value * 1000) / 1000)); setError(false); }, [value]);
  const commit = () => {
    const n = Number(draft);
    if (!draft.trim() || !Number.isFinite(n) || n < min || n > max) { setError(true); return; }
    setError(false); onChange(n);
  };
  return <label className="field" htmlFor={id}><span>{label}</span><input id={id} aria-invalid={error} type="number" value={draft} min={min} max={max} step={step} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setDraft(String(value)); setError(false); } }} />{error && <small role="alert">{min} – {max}</small>}</label>;
}
function TransitionEditor({ title, value, onChange, t, text = false, effect = false, composition = false, maxDuration }: { title: string; value: Transition; onChange: (v: Transition) => void; t: Translate; text?: boolean; effect?: boolean; composition?: boolean; maxDuration: number }) {
  const [search, setSearch] = useState(""), [expanded, setExpanded] = useState(value.style !== "None");
  const patch = (v: Partial<Transition>) => onChange({ ...value, ...v });
  const moving = ["Slide", "Slide + Fade", "Drift", "Rise / Fall"].includes(value.style);
  const scaling = ["Zoom", "Pop", "Bounce", "Scale + Fade"].includes(value.style);
  const directionOptions = value.style === "Rise / Fall" ? ["Up", "Down"]
    : value.style === "Center reveal" ? ["Left", "Up"]
      : value.style === "Diagonal wipe" || value.style === "Text reveal" ? ["Left", "Right"]
        : ["Wipe", "Shutter"].includes(value.style) || moving ? directions.slice(0, moving && value.style !== "Rise / Fall" ? 8 : 4)
          : [];
  const opacity = ["Fade", "Fade + Blur", "Slide + Fade", "Scale + Fade", "Drift", "Rise / Fall"].includes(value.style);
  return <details className="advanced-settings motion-transition" open={expanded} onToggle={e => setExpanded(e.currentTarget.open)}>
    <summary>{title} · {t(value.style)}</summary>
    {!effect && <label className="field"><span>{t("Search animations")}</span><input type="search" value={search} onChange={e => setSearch(e.target.value)} /></label>}
    <label className="field"><span>{t("Animation")}</span><select value={value.style} onChange={e => patch({ style: e.target.value, duration: Math.min(value.duration, Math.max(0.05, maxDuration / 2)), ...(composition && e.target.value.startsWith("Slide") ? { distance: 100 } : {}), ...(e.target.value === "Rise / Fall" ? { direction: "Up" } : {}) })}>
      {Object.entries(motionGroups).map(([group, styles]) => {
        const filtered = styles.filter(s => (!effect || ["None", "Fade"].includes(s)) && (text || group !== "Text") && (s === value.style || s === "None" || t(s).toLowerCase().includes(search.toLowerCase())));
        return filtered.length ? <optgroup key={group} label={t(group)}>{filtered.map(s => <option key={s}>{s}</option>)}</optgroup> : null;
      })}
    </select></label>
    {value.style !== "None" && <>
      <MotionNumber label={t("Animation duration")} value={value.duration} min={0.05} max={Math.max(0.05, Math.min(10, maxDuration))} onChange={duration => patch({ duration })} />
      {!composition && <MotionNumber label={t("Delay inside layer range")} value={value.delay} max={maxDuration} onChange={delay => patch({ delay })} />}
      <label className="field"><span>{t("Easing")}</span><select value={value.easing} onChange={e => patch({ easing: e.target.value })}>{easings.map(s => <option key={s} value={s}>{t(s)}</option>)}</select></label>
      {directionOptions.length > 0 && <label className="field"><span>{t("Direction")}</span><select value={value.direction} onChange={e => patch({ direction: e.target.value })}>{directionOptions.map(s => <option key={s} value={s}>{t(s)}</option>)}</select></label>}
      {moving && <MotionNumber label={t("Travel distance (%)")} value={value.distance} max={150} step={1} onChange={distance => patch({ distance })} />}
      {scaling && <MotionNumber label={t("Hidden-state scale")} value={value.scale} min={0.05} max={2} onChange={scale => patch({ scale })} />}
      {value.style === "Rotate" && <MotionNumber label={t("Hidden-state rotation")} value={value.angle} min={-180} max={180} step={1} onChange={angle => patch({ angle })} />}
      {value.style.includes("Blur") && <MotionNumber label={t("Maximum blur")} value={value.blur} max={12} step={1} onChange={blur => patch({ blur })} />}
      {opacity && <MotionNumber label={t("Hidden-state opacity")} value={value.opacity} max={1} onChange={opacity => patch({ opacity })} />}
      {value.style === "Shutter" && <MotionNumber label={t("Shutter strips")} value={value.strips} min={2} max={12} step={1} onChange={strips => patch({ strips: Math.round(strips) })} />}
      {text && value.style === "Text reveal" && <label className="field"><span>{t("Reveal units")}</span><select value={value.reveal} onChange={e => patch({ reveal: e.target.value })}>{["Characters", "Words"].map(s => <option key={s} value={s}>{t(s)}</option>)}</select></label>}
    </>}
  </details>;
}
export function LayerMotionControls({ layer, duration, onChange, t }: { layer: Layer; duration: number; onChange: (m: LayerMotion) => void; t: Translate }) {
  const m = layerMotion(layer), end = m.end ?? duration;
  const [error, setError] = useState("");
  const commit = (next: LayerMotion) => { const error = validateMotion(next, duration); setError(error || ""); if (!error) onChange(next); };
  return <section className="settings-card motion-controls"><h3>{t("Timing & animation")}</h3>
    <div className="motion-numbers">
      <MotionNumber label={t("Layer start (seconds)")} value={m.start} max={duration} onChange={start => commit({ ...m, start })} />
      <MotionNumber label={t("Layer end (seconds)")} value={end} max={duration} onChange={end => commit({ ...m, end })} />
      <MotionNumber label={t("Layer duration")} value={end - m.start} min={0.05} max={duration} onChange={length => commit({ ...m, end: m.start + length })} />
    </div>
    <button onClick={() => commit({ ...m, start: 0, end: null })}>{t("Use full project range")}</button>
    {(error || validateMotion(m, duration)) && <p className="motion-error" role="alert">{t(error || validateMotion(m, duration)!)}</p>}
    {layer.kind === "effect" && <p className="hint">{t("Effect layers animate their blend amount.")}</p>}
    <TransitionEditor title={t("Entrance")} value={m.entrance} onChange={entrance => commit({ ...m, entrance })} text={layer.kind === "text"} effect={layer.kind === "effect"} maxDuration={end - m.start} t={t} />
    <TransitionEditor title={t("Exit")} value={m.exit} onChange={exit => commit({ ...m, exit })} text={layer.kind === "text"} effect={layer.kind === "effect"} maxDuration={end - m.start} t={t} />
    <button onClick={() => commit({ ...m, exit: { ...m.entrance } })}>{t("Use entrance as reversed exit")}</button>
    <button onClick={() => commit({ ...m, entrance: defaultTransition(), exit: defaultTransition() })}>{t("Disable layer animations")}</button>
  </section>;
}
export function CompositionMotionControls({ project, onChange, t }: { project: Project; onChange: (v: NonNullable<Project["transitions"]>) => void; t: Translate }) {
  const value = projectTransitions(project), duration = project.end - project.start;
  const [error, setError] = useState("");
  const commit = (next: typeof value) => { const error = validateMotion({ start: 0, end: null, entrance: next.intro, exit: next.outro }, duration); setError(error || ""); if (!error) onChange(next); };
  return <section className="composition-motion"><h3>{t("Video intro / outro")}</h3><p className="hint">{t("Transitions use the existing project duration. Cropped exports preserve project timing.")}</p>
    <TransitionEditor title={t("Intro")} value={value.intro} onChange={intro => commit({ ...value, intro })} composition maxDuration={duration} t={t} />
    <TransitionEditor title={t("Outro")} value={value.outro} onChange={outro => commit({ ...value, outro })} composition maxDuration={duration} t={t} />
    {error && <p role="alert" className="motion-error">{t(error)}</p>}
  </section>;
}
