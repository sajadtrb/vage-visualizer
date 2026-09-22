"use client";
import {
  Layer,
  Settings,
  effectStyles,
  particleStyles,
  spectra,
  platforms,
} from "./model";
import { latinFonts, arabicFonts } from "./fonts";
export type Translate = (s: string) => string;
export type Spec = {
  key: string;
  label: string;
  type?: "color" | "toggle" | "select" | "number";
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
};
export function Control({
  spec: s,
  value,
  onChange,
  t,
}: {
  spec: Spec;
  value: string | number | boolean;
  onChange: (v: string | number | boolean) => void;
  t: Translate;
}) {
  const id = `control-${s.key}`;
  const accessible = { id, "aria-label": t(s.label) };
  return (
    <label
      className={`field ${s.type === "toggle" ? "toggle-field" : ""}`}
      htmlFor={id}
    >
      <span>
        {t(s.label)}
        {!s.type && (
          <output>{Number(value).toFixed((s.step || 1) < 1 ? 2 : 0)}</output>
        )}
      </span>
      {s.type === "toggle" ? (
        <input
          {...accessible}
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
        />
      ) : s.type === "select" ? (
        <select
          {...accessible}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
        >
          {s.options?.map((o) => (
            <option key={o} value={o}>
              {t(o)}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...accessible}
          type={
            s.type === "color"
              ? "color"
              : s.type === "number"
                ? "number"
                : "range"
          }
          min={s.min}
          max={s.max}
          step={s.step || 1}
          value={s.type === "color" ? String(value) : Number(value)}
          onChange={(e) => {
            if (s.type === "color") onChange(e.target.value);
            else {
              const n = Number(e.target.value);
              if (Number.isFinite(n))
                onChange(
                  Math.max(s.min ?? -Infinity, Math.min(s.max ?? Infinity, n)),
                );
            }
          }}
        />
      )}
    </label>
  );
}
export function SettingsFields({
  specs,
  settings,
  onChange,
  t,
}: {
  specs: Spec[];
  settings: Settings;
  onChange: (s: Settings) => void;
  t: Translate;
}) {
  return (
    <>
      {specs.map((s) => (
        <Control
          key={s.key}
          spec={s}
          value={
            settings[s.key] ??
            (s.type === "color"
              ? "#ffffff"
              : s.type === "select"
                ? s.options?.[0] || ""
                : s.type === "toggle"
                  ? false
                  : 0)
          }
          onChange={(v) => onChange({ [s.key]: v })}
          t={t}
        />
      ))}
    </>
  );
}
export const effectsSpecs: Spec[] = [
  { key: "enabled", label: "Enable effects", type: "toggle" },
  { key: "style", label: "Effect", type: "select", options: effectStyles },
  { key: "intensity", label: "Intensity", min: 0, max: 1, step: 0.01 },
  { key: "blend", label: "Blend amount", min: 0, max: 1, step: 0.01 },
  { key: "speed", label: "Speed", min: 0, max: 4, step: 0.05 },
  { key: "sync", label: "Sync to music", type: "toggle" },
  { key: "reaction", label: "Music reaction", min: 0, max: 4, step: 0.05 },
  { key: "band", label: "Audio band", type: "select", options: ["Energy", "Bass", "Mid", "Treble"] },
  { key: "baseline", label: "Minimum effect", min: 0, max: 1, step: 0.01 },
  { key: "threshold", label: "Audio threshold", min: 0, max: 0.9, step: 0.01 },
];
const textSpecs: Spec[] = [
  { key: "color", label: "Text color", type: "color" },
  { key: "size", label: "Font size", type: "number", min: 4, max: 400 },
  { key: "bold", label: "Bold", type: "toggle" },
  { key: "italic", label: "Italic", type: "toggle" },
  { key: "underline", label: "Underline", type: "toggle" },
  { key: "uppercase", label: "Uppercase", type: "toggle" },
  {
    key: "align",
    label: "Text alignment",
    type: "select",
    options: ["left", "center", "right"],
  },
  {
    key: "direction",
    label: "Text direction",
    type: "select",
    options: ["ltr", "rtl"],
  },
  { key: "spacing", label: "Letter spacing", min: -5, max: 40, step: 0.1 },
  { key: "lineHeight", label: "Line height", min: 0.5, max: 3, step: 0.05 },
  { key: "shadow", label: "Shadow", min: 0, max: 50 },
  { key: "glow", label: "Glow", min: 0, max: 50 },
  { key: "outline", label: "Outline width", min: 0, max: 8, step: 0.5 },
  { key: "outlineColor", label: "Outline color", type: "color" },
  { key: "background", label: "Text background", type: "toggle" },
  { key: "backgroundColor", label: "Background color", type: "color" },
  { key: "padding", label: "Padding", min: 0, max: 100 },
  {
    key: "entrance",
    label: "Entrance",
    type: "select",
    options: ["None", "Fade", "Slide up", "Zoom", "Typewriter"],
  },
  {
    key: "exit",
    label: "Exit",
    type: "select",
    options: ["None", "Fade", "Slide up", "Zoom", "Typewriter"],
  },
  { key: "duration", label: "Animation duration", min: 0.1, max: 5, step: 0.1 },
  {
    key: "easing",
    label: "Easing",
    type: "select",
    options: ["Linear", "Ease in", "Ease out"],
  },
];
const bgSpecs: Spec[] = [
  {
    key: "mode",
    label: "Fill",
    type: "select",
    options: ["Solid", "Gradient"],
  },
  { key: "color", label: "Background color", type: "color" },
  { key: "color2", label: "Gradient color", type: "color" },
  { key: "blur", label: "Blur", min: 0, max: 60 },
  { key: "brightness", label: "Brightness", min: 0, max: 200 },
  { key: "contrast", label: "Contrast", min: 0, max: 200 },
  { key: "saturation", label: "Saturation", min: 0, max: 200 },
  { key: "hue", label: "Hue", min: 0, max: 360 },
  { key: "vignette", label: "Vignette", min: 0, max: 1, step: 0.01 },
  { key: "grain", label: "Grain", min: 0, max: 1, step: 0.01 },
  { key: "overlay", label: "Overlay color", type: "color" },
  {
    key: "overlayOpacity",
    label: "Overlay opacity",
    min: 0,
    max: 1,
    step: 0.01,
  },
  { key: "dream", label: "Dream lights", type: "toggle" },
  { key: "lightColor", label: "Light color", type: "color" },
  { key: "lightColor2", label: "Second light color", type: "color" },
  {
    key: "lightIntensity",
    label: "Light intensity",
    min: 0,
    max: 1,
    step: 0.01,
  },
  { key: "lightSize", label: "Light size", min: 10, max: 150 },
  { key: "lightBlur", label: "Light softness", min: 0, max: 100 },
  { key: "speed", label: "Loop duration", min: 2, max: 60 },
  {
    key: "videoStart",
    label: "Video in (seconds)",
    type: "number",
    min: 0,
    max: 36000,
    step: 0.1,
  },
  {
    key: "videoEnd",
    label: "Video out (0 = full)",
    type: "number",
    min: 0,
    max: 36000,
    step: 0.1,
  },
  { key: "videoLoop", label: "Loop video", type: "toggle" },
];
const spectrumSpecs: Spec[] = [
  { key: "style", label: "Spectrum style", type: "select", options: spectra },
  { key: "color", label: "Spectrum color", type: "color" },
  { key: "gradient", label: "Gradient", type: "toggle" },
  { key: "color2", label: "Gradient color", type: "color" },
  { key: "gain", label: "Gain", min: 0, max: 8, step: 0.05 },
  { key: "sensitivity", label: "Sensitivity", min: 0, max: 4, step: 0.05 },
  { key: "reaction", label: "Music reaction", min: 0, max: 4, step: 0.05 },
  { key: "bass", label: "Bass response", min: 0, max: 4, step: 0.05 },
  { key: "smoothing", label: "Smoothing", min: 0, max: 1, step: 0.01 },
  { key: "count", label: "Bar count", min: 16, max: 128 },
  { key: "gap", label: "Bar gap", min: 0, max: 0.9, step: 0.01 },
  { key: "barWidth", label: "Bar width", min: 0.1, max: 1, step: 0.05 },
  { key: "thickness", label: "Line thickness", min: 0.5, max: 15, step: 0.5 },
  { key: "glow", label: "Glow", min: 0, max: 40 },
  {
    key: "minFrequency",
    label: "Low frequency (Hz)",
    type: "number",
    min: 20,
    max: 10000,
  },
  {
    key: "maxFrequency",
    label: "High frequency (Hz)",
    type: "number",
    min: 100,
    max: 20000,
  },
  { key: "mirror", label: "Mirror frequencies", type: "toggle" },
  {
    key: "blend",
    label: "Blend mode",
    type: "select",
    options: ["source-over", "screen", "lighter", "multiply"],
  },
];
const particleSpecs: Spec[] = [
  {
    key: "style",
    label: "Particle style",
    type: "select",
    options: particleStyles,
  },
  { key: "color", label: "Particle color", type: "color" },
  { key: "count", label: "Count", min: 1, max: 350 },
  { key: "minSize", label: "Minimum size", min: 0.05, max: 10, step: 0.05 },
  { key: "maxSize", label: "Maximum size", min: 0.05, max: 20, step: 0.05 },
  { key: "glow", label: "Glow enabled", type: "toggle" },
  { key: "glowIntensity", label: "Glow intensity", min: 0, max: 30 },
  { key: "blur", label: "Blur", min: 0, max: 15, step: 0.1 },
  { key: "speed", label: "Base speed", min: 0, max: 4, step: 0.05 },
  { key: "random", label: "Random movement", min: 0, max: 4, step: 0.05 },
  { key: "reaction", label: "Music reaction", min: 0, max: 5, step: 0.05 },
  { key: "bass", label: "Bass response", min: 0, max: 4, step: 0.05 },
  { key: "treble", label: "Treble response", min: 0, max: 4, step: 0.05 },
  { key: "wind", label: "Wind enabled", type: "toggle" },
  {
    key: "direction",
    label: "Wind direction",
    type: "select",
    options: ["left", "right", "up", "down", "radial", "random"],
  },
  { key: "strength", label: "Wind strength", min: 0, max: 5, step: 0.05 },
  {
    key: "windReaction",
    label: "Wind music reaction",
    min: 0,
    max: 5,
    step: 0.05,
  },
  { key: "spread", label: "Spread", min: 0.1, max: 2, step: 0.05 },
  { key: "connections", label: "Connection lines", type: "toggle" },
  { key: "distance", label: "Connection distance", min: 10, max: 400 },
  {
    key: "connectionOpacity",
    label: "Connection opacity",
    min: 0,
    max: 1,
    step: 0.01,
  },
];
export function LayerSettings({
  value,
  onChange,
  t,
}: {
  value: Layer;
  onChange: (s: Settings) => void;
  t: Translate;
}) {
  const s = value.settings;
  return (
    <section className="settings-card">
      <h3>
        {t(
          value.kind === "text"
            ? "Typography"
            : value.kind === "background"
              ? "Background studio"
              : value.kind === "particles"
                ? "Particle system"
                : value.kind === "spectrum"
                  ? "Spectrum"
                  : "Appearance",
        )}
      </h3>
      {value.kind === "text" && (
        <>
          <label className="field">
            <span>{t("Text content")}</span>
            <textarea
              aria-label="Text content"
              rows={3}
              value={String(s.text)}
              dir={String(s.direction)}
              onChange={(e) => onChange({ text: e.target.value })}
            />
          </label>
          <Control
            spec={textSpecs[0]}
            value={s.color}
            onChange={(v) => onChange({ color: v })}
            t={t}
          />
          <label className="field">
            <span>{t("Font family")}</span>
            <select
              aria-label="Font family"
              value={String(s.font)}
              style={{ fontFamily: String(s.font) }}
              onChange={(e) => onChange({ font: e.target.value })}
            >
              <optgroup label="English">
                {latinFonts.map((f) => (
                  <option style={{ fontFamily: f }} key={f}>
                    {f}
                  </option>
                ))}
              </optgroup>
              <optgroup label="فارسی / العربية">
                {arabicFonts.map((f) => (
                  <option style={{ fontFamily: f }} key={f}>
                    {f}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <div
            className="font-preview"
            style={{ fontFamily: String(s.font) }}
            dir={String(s.direction)}
          >
            {arabicFonts.includes(String(s.font))
              ? "صدای تازه، تصویر تازه"
              : "Make your sound visible."}
          </div>
          <SettingsFields
            specs={textSpecs.slice(1, 10)}
            settings={s}
            onChange={onChange}
            t={t}
          />
          <details className="advanced-settings">
            <summary>
              {t("Advanced")} · {t("Appearance")}
            </summary>
            <SettingsFields
              specs={textSpecs.slice(10, 17)}
              settings={s}
              onChange={onChange}
              t={t}
            />
          </details>
          <details className="advanced-settings">
            <summary>
              {t("Entrance")} / {t("Exit")}
            </summary>
            <SettingsFields
              specs={textSpecs.slice(17)}
              settings={s}
              onChange={onChange}
              t={t}
            />
          </details>
        </>
      )}
      {value.kind === "background" && (
        <SettingsFields
          specs={bgSpecs}
          settings={s}
          onChange={onChange}
          t={t}
        />
      )}
      {value.kind === "spectrum" && (
        <SettingsFields
          specs={spectrumSpecs}
          settings={s}
          onChange={onChange}
          t={t}
        />
      )}
      {value.kind === "particles" && (
        <>
          <SettingsFields
            specs={particleSpecs}
            settings={s}
            onChange={(patch) =>
              onChange(
                patch.style
                  ? { ...patch, connections: patch.style === "Network mesh" }
                  : patch,
              )
            }
            t={t}
          />
          <button
            onClick={() =>
              onChange({ seed: Math.floor(Math.random() * 100000) })
            }
          >
            {t("Randomize")}
          </button>
        </>
      )}
      {value.kind === "image" && (
        <SettingsFields
          specs={[
            {
              key: "fit",
              label: "Image fit",
              type: "select",
              options: ["contain", "cover"],
            },
          ]}
          settings={s}
          onChange={onChange}
          t={t}
        />
      )}
      {value.kind === "logo" && (
        <SettingsFields
          specs={[
            {
              key: "platform",
              label: "Platform",
              type: "select",
              options: platforms,
            },
            {
              key: "style",
              label: "Logo style",
              type: "select",
              options: ["Original", "Monochrome", "Badge", "Outline"],
            },
            { key: "color", label: "Logo color", type: "color" },
          ]}
          settings={s}
          onChange={onChange}
          t={t}
        />
      )}
      {value.kind === "effect" && <SettingsFields specs={effectsSpecs} settings={s} onChange={onChange} t={t} />}
    </section>
  );
}
