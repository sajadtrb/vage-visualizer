import { clamp, Layer, LayerMotion, num, Project, str, Transition } from "./model";

export const motionGroups: Record<string, string[]> = {
  Basic: ["None", "Fade", "Dissolve", "Blur", "Fade + Blur"],
  Movement: ["Slide", "Slide + Fade", "Drift", "Rise / Fall"],
  Transform: ["Zoom", "Pop", "Bounce", "Scale + Fade", "Rotate", "Flip horizontal", "Flip vertical"],
  Masks: ["Wipe", "Diagonal wipe", "Center reveal", "Iris", "Radial wipe", "Shutter"],
  Text: ["Text reveal"],
};
export const easings = ["Linear", "Ease", "Ease in", "Ease out", "Ease in-out", "Smooth", "Back", "Bounce"];
export const directions = ["Left", "Right", "Up", "Down", "Top left", "Top right", "Bottom left", "Bottom right"];
export const defaultTransition = (): Transition => ({ style: "None", duration: 1, delay: 0, easing: "Ease out", direction: "Left", distance: 35, scale: 0.5, angle: -45, blur: 8, opacity: 0, strips: 6, reveal: "Characters" });
export function safeTransition(value?: Partial<Transition>): Transition {
  const base = defaultTransition(), v = { ...base, ...value };
  if (!Object.values(motionGroups).some(styles => styles.includes(v.style))) v.style = "None";
  if (!directions.includes(v.direction)) v.direction = "Left";
  const finite = (n: number, fallback: number) => Number.isFinite(n) ? n : fallback;
  return { ...v, duration: clamp(finite(v.duration, 1), 0.05, 10), delay: clamp(finite(v.delay, 0), 0, 600), distance: clamp(finite(v.distance, 35), 0, 150), scale: clamp(finite(v.scale, 0.5), 0.05, 2), angle: clamp(finite(v.angle, -45), -180, 180), blur: clamp(finite(v.blur, 8), 0, 12), opacity: clamp(finite(v.opacity, 0), 0, 1), strips: Math.round(clamp(finite(v.strips, 6), 2, 12)) };
}
function legacy(style: string, duration: number, easing = "Ease out"): Transition {
  return { ...defaultTransition(), style: style === "Slide up" ? "Slide" : style === "Typewriter" ? "Text reveal" : style === "Open horizontal" || style === "Open vertical" ? "Center reveal" : style || "None", direction: style === "Slide up" ? "Down" : style === "Open vertical" ? "Up" : "Left", duration, easing };
}
const layerMotionCache = new WeakMap<Layer, LayerMotion>();
export function layerMotion(layer: Layer): LayerMotion {
  const cached = layerMotionCache.get(layer);
  if (cached) return cached;
  const m = layer.motion
    ? { start: Number.isFinite(layer.motion.start) ? Math.max(0, layer.motion.start) : 0, end: layer.motion.end != null && Number.isFinite(layer.motion.end) ? layer.motion.end : null, entrance: safeTransition(layer.motion.entrance), exit: safeTransition(layer.motion.exit) }
    : { start: 0, end: null, entrance: safeTransition(legacy(layer.kind === "text" ? str(layer.settings, "entrance", "None") : "None", num(layer.settings, "duration", 1), str(layer.settings, "easing", "Ease out"))), exit: safeTransition(legacy(layer.kind === "text" ? str(layer.settings, "exit", "None") : "None", num(layer.settings, "duration", 1), str(layer.settings, "easing", "Ease out"))) };
  layerMotionCache.set(layer, m);
  return m;
}
export function projectTransitions(p: Project) {
  return p.transitions ? { intro: safeTransition(p.transitions.intro), outro: safeTransition(p.transitions.outro) } : { intro: safeTransition(legacy(str(p.effects, "intro", "None"), num(p.effects, "transitionDuration", 1))), outro: safeTransition(legacy(str(p.effects, "outro", "None"), num(p.effects, "transitionDuration", 1))) };
}
export function motionRange(m: LayerMotion, duration: number) {
  return { start: Math.max(0, m.start), end: Math.min(duration, m.end ?? duration) };
}
export function ease(value: number, name: string) {
  const x = clamp(value, 0, 1);
  if (x === 0 || x === 1) return x;
  if (name === "Ease in") return x ** 3;
  if (name === "Ease out") return 1 - (1 - x) ** 3;
  if (name === "Ease" || name === "Ease in-out") return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
  if (name === "Smooth") return x * x * x * (x * (x * 6 - 15) + 10);
  if (name === "Back") return 1 + 1.6 * (x - 1) ** 3 + 0.6 * (x - 1) ** 2;
  if (name === "Bounce") return 1 - Math.abs(Math.cos(x * Math.PI * 2.5)) * (1 - x) ** 2;
  return x;
}
export type MotionSample = { transition: Transition; progress: number };
export function sampleMotion(m: LayerMotion, time: number, duration: number): { visible: boolean; samples: MotionSample[] } {
  const { start, end } = motionRange(m, duration);
  if (time < start || time > end || (time === end && m.end !== null) || end <= start) return { visible: false, samples: [] };
  if ((m.entrance.style !== "None" && time < start + m.entrance.delay) || (m.exit.style !== "None" && time > end - m.exit.delay)) return { visible: false, samples: [] };
  const samples: MotionSample[] = [];
  for (const [transition, elapsed] of [[m.entrance, time - start], [m.exit, end - time]] as const) {
    if (transition.style === "None") continue;
    const d = Math.min(transition.duration, end - start);
    const progress = clamp((elapsed - transition.delay) / Math.max(0.05, d), 0, 1);
    if (progress < 1) samples.push({ transition, progress });
  }
  return { visible: true, samples };
}
export function validateMotion(m: LayerMotion, duration: number): string | null {
  const end = m.end ?? duration;
  if (!Number.isFinite(m.start) || !Number.isFinite(end) || m.start < 0 || end > duration || end - m.start < 0.05) return "Choose a layer range inside the project (at least 0.05 seconds).";
  if ([m.entrance, m.exit].some(t => !Number.isFinite(t.duration) || t.duration < 0.05 || t.duration > 10 || !Number.isFinite(t.delay) || t.delay < 0 || t.delay > 600)) return "Animation duration and delay must be valid positive values.";
  const used = [m.entrance, m.exit].filter(t => t.style !== "None").reduce((sum, t) => sum + t.duration + t.delay, 0);
  if (used > end - m.start + 0.00001) return "Entrance and exit durations plus delays must fit inside the layer range.";
  return null;
}
export function directionVector(direction: string): [number, number] {
  const d = direction.toLowerCase();
  return [d.includes("left") ? -1 : d.includes("right") ? 1 : 0, d === "up" || d.includes("top") ? -1 : d === "down" || d.includes("bottom") ? 1 : 0];
}

/** Applies a bounded, deterministic transition in local box coordinates. */
export function needsIsolation(style: string) {
  return ["Fade", "Fade + Blur", "Blur", "Slide + Fade", "Scale + Fade", "Drift", "Rise / Fall"].includes(style);
}
export function applyTransition(c: CanvasRenderingContext2D, t: Transition, progress: number, w: number, h: number, mode: "all" | "geometry" | "appearance" = "all") {
  const v = ease(progress, t.easing), q = clamp(v, 0, 1), rest = 1 - v;
  const style = t.style;
  if (style === "None" || progress >= 1) return;
  if (mode !== "geometry") {
    if (["Fade", "Fade + Blur", "Slide + Fade", "Scale + Fade", "Drift", "Rise / Fall"].includes(style)) c.globalAlpha *= t.opacity + (1 - t.opacity) * q;
    if (style === "Blur" || style === "Fade + Blur") {
      const matrix = c.getTransform();
      c.filter = `blur(${t.blur * (1 - q) * Math.hypot(matrix.a, matrix.b)}px)`;
    }
  }
  if (mode === "appearance") return;
  if (["Slide", "Slide + Fade", "Drift", "Rise / Fall"].includes(style)) {
    const [dx, dy] = directionVector(t.direction);
    const distance = t.distance / 100 * (style === "Drift" ? 0.25 : 1);
    c.translate(dx * w * distance * rest, dy * h * distance * rest);
  }
  if (["Zoom", "Scale + Fade", "Pop", "Bounce"].includes(style)) {
    const e = style === "Pop" ? ease(progress, "Back") : style === "Bounce" ? ease(progress, "Bounce") : v;
    const scale = clamp(t.scale + (1 - t.scale) * e, 0.05, 2.15);
    c.translate(w / 2, h / 2); c.scale(scale, scale); c.translate(-w / 2, -h / 2);
  }
  if (style === "Rotate") {
    c.translate(w / 2, h / 2); c.rotate(t.angle * Math.PI / 180 * rest); c.translate(-w / 2, -h / 2);
  }
  if (style === "Flip horizontal" || style === "Flip vertical") {
    const flip = Math.cos(Math.PI * (1 - q));
    c.translate(w / 2, h / 2);
    c.scale(style === "Flip horizontal" ? flip : 1, style === "Flip vertical" ? flip : 1);
    c.translate(-w / 2, -h / 2);
  }
  if (!["Wipe", "Diagonal wipe", "Center reveal", "Iris", "Radial wipe", "Shutter", "Dissolve"].includes(style)) return;
  c.beginPath();
  const vertical = ["Up", "Down"].includes(t.direction);
  if (style === "Wipe") {
    if (vertical) c.rect(0, t.direction === "Down" ? h * (1 - q) : 0, w, h * q);
    else c.rect(t.direction === "Right" ? w * (1 - q) : 0, 0, w * q, h);
  } else if (style === "Center reveal") {
    c.rect(vertical ? 0 : w * (1 - q) / 2, vertical ? h * (1 - q) / 2 : 0, vertical ? w : w * q, vertical ? h * q : h);
  } else if (style === "Iris") c.arc(w / 2, h / 2, Math.hypot(w, h) / 2 * q, 0, Math.PI * 2);
  else if (style === "Radial wipe") {
    c.moveTo(w / 2, h / 2); c.arc(w / 2, h / 2, Math.hypot(w, h), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * q); c.closePath();
  } else if (style === "Diagonal wipe") {
    const x = 2 * q * w, y = 2 * q * h;
    if (t.direction === "Right") { c.moveTo(w, 0); c.lineTo(w - x, 0); c.lineTo(w, y); }
    else { c.moveTo(0, 0); c.lineTo(x, 0); c.lineTo(0, y); }
    c.closePath();
  } else if (style === "Shutter") {
    for (let i = 0; i < t.strips; i++) {
      if (vertical) {
        const stripHeight = h / t.strips;
        c.rect(0, i * stripHeight + (t.direction === "Down" ? stripHeight * (1 - q) : 0), w, stripHeight * q);
      } else {
        const stripWidth = w / t.strips;
        c.rect(i * stripWidth + (t.direction === "Right" ? stripWidth * (1 - q) : 0), 0, stripWidth * q, h);
      }
    }
  } else {
    // Fixed ordered 16x9 mosaic, no randomness, pixel reads or simulation.
    for (let y = 0; y < 9; y++) for (let x = 0; x < 16; x++) {
      const rank = ((x * 37 + y * 61) % 144) / 144;
      if (q > rank) c.rect(x * w / 16, y * h / 9, w / 16 + 0.25, h / 9 + 0.25);
    }
  }
  c.clip();
}
