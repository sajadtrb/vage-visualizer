import { Layer, Project, num, str, clamp, PERFORMANCE_LIMITS } from "./model";
import { Features, silence, AudioAnalysis } from "./audio";
import { MediaLibrary } from "./media";
import { applyTransition, ease, layerMotion, needsIsolation, projectTransitions, sampleMotion } from "./motion";
export const rand = (i: number, seed = 42) => {
  const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const tau = Math.PI * 2;
const effectBuffers = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
const motionBuffers = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
const textUnits = new Map<string, string[]>();
function revealUnits(text: string, words: boolean) {
  const boundedText = text.slice(0, 4096);
  const key = `${words}:${boundedText}`;
  let units = textUnits.get(key);
  if (!units) {
    if (typeof Intl.Segmenter === "function") {
      units = Array.from(new Intl.Segmenter(undefined, { granularity: words ? "word" : "grapheme" }).segment(boundedText), s => s.segment).slice(0, 512);
    } else {
      units = (words ? (boundedText.match(/\S+\s*/g) || []) : Array.from(boundedText)).slice(0, 512);
    }
    if (textUnits.size >= 64) textUnits.delete(textUnits.keys().next().value!);
    textUnits.set(key, units);
  }
  return units;
}
function motionBuffer(canvas: HTMLCanvasElement) {
  let buffer = motionBuffers.get(canvas);
  if (!buffer) { buffer = document.createElement("canvas"); motionBuffers.set(canvas, buffer); }
  if (buffer.width !== canvas.width || buffer.height !== canvas.height) { buffer.width = canvas.width; buffer.height = canvas.height; }
  return buffer;
}
function path(c: CanvasRenderingContext2D, p: number[][], close = false) {
  c.beginPath();
  p.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  if (close) c.closePath();
  c.stroke();
}
function dot(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.beginPath();
  c.arc(x, y, Math.max(0.01, r), 0, tau);
  c.fill();
}
function glow(c: CanvasRenderingContext2D, color: string, size: number) {
  c.shadowColor = color;
  c.shadowBlur = size;
}
function spectrum(
  c: CanvasRenderingContext2D,
  l: Layer,
  w: number,
  h: number,
  f: Features,
  sampleRate: number,
  analysis?: AudioAnalysis,
  time = 0,
) {
  const s = l.settings,
    style = str(s, "style"),
    count = clamp(Math.round(num(s, "count", 64)), 16, PERFORMANCE_LIMITS.spectrumCount),
    gain = num(s, "gain", 1) * num(s, "sensitivity", 1) * num(s, "reaction", 1),
    min = num(s, "minFrequency", 30),
    max = Math.max(min + 10, num(s, "maxFrequency", 16000));
  const values = Array.from({ length: count }, (_, i) => {
    const index = s.mirror ? Math.abs(count / 2 - i) * 2 : i;
    let v = 0;
    const lo = Math.floor(
        ((min * Math.pow(max / min, index / count)) / sampleRate) * 2048,
      ),
      hi = Math.ceil(
        ((min * Math.pow(max / min, (index + 1) / count)) / sampleRate) * 2048,
      );
    for (let j = lo; j <= Math.min(1023, hi); j++)
      v = Math.max(v, f.bins[j] || 0);
    return clamp(v * gain * (i < count * 0.15 ? num(s, "bass", 1) : 1), 0, 1);
  });
  const smooth = num(s, "smoothing", 0.7);
  if (analysis && smooth > 0) {
    const prev = analysis.at(Math.max(0, time - 0.07 * smooth));
    for (let i = 0; i < count; i++) {
      const bin = Math.floor(
        ((min * Math.pow(max / min, i / count)) / sampleRate) * 2048,
      );
      values[i] =
        values[i] * (1 - smooth * 0.5) +
        (prev.bins[bin] || 0) * gain * smooth * 0.5;
    }
  }
  const color = str(s, "color", "#c2ff62");
  c.fillStyle = color;
  c.strokeStyle = color;
  c.lineWidth = num(s, "thickness", 2);
  glow(c, color, clamp(num(s, "glow"), 0, PERFORMANCE_LIMITS.spectrumGlow));
  if (s.gradient) {
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, color);
    g.addColorStop(1, str(s, "color2", "#78dacc"));
    c.fillStyle = c.strokeStyle = g;
  }
  c.globalCompositeOperation = str(
    s,
    "blend",
    "source-over",
  ) as GlobalCompositeOperation;
  const energy = f.energy * gain;
  if (
    ["Waveform", "Oscilloscope", "Aurora wave", "Liquid spectrum"].includes(
      style,
    )
  ) {
    const waves = style === "Aurora wave" ? 5 : 1;
    for (let j = 0; j < waves; j++) {
      c.globalAlpha = l.opacity * (1 - j * 0.16);
      const pts = Array.from({ length: 256 }, (_, i) => {
        if (style === "Oscilloscope")
          return [
            w / 2 + f.wave[i] * w * 0.45 * gain,
            h / 2 + f.wave[(i + 19) % 256] * h * 0.45 * gain,
          ];
        const v =
          style === "Liquid spectrum"
            ? (values[Math.floor((i / 256) * count)] || 0) *
              Math.sin((i / 255) * Math.PI)
            : f.wave[i] * gain;
        return [(i / 255) * w, h / 2 + v * h * (0.42 - j * 0.05) + j * 5];
      });
      if (style === "Liquid spectrum") {
        c.beginPath();
        c.moveTo(0, h / 2);
        pts.forEach((p) => c.lineTo(p[0], p[1]));
        c.lineTo(w, h / 2);
        c.fill();
      } else path(c, pts);
    }
    return;
  }
  if (
    [
      "Circular ring",
      "Neon ring",
      "Dual bulb",
      "Arc bars",
      "Hex rings",
      "Pulse tunnel",
      "Orbital dots",
      "Radial wave",
    ].includes(style)
  ) {
    const rings =
      style === "Pulse tunnel"
        ? 6
        : style === "Hex rings"
          ? 4
          : style === "Dual bulb"
            ? 2
            : 1;
    for (let ring = 0; ring < rings; ring++) {
      const cx = style === "Dual bulb" ? w * (ring ? 0.72 : 0.28) : w / 2,
        cy = h / 2,
        r =
          Math.min(w, h) *
          (0.24 + f.bass * 0.02) *
          (style === "Pulse tunnel" ? 0.35 + ring * 0.21 : 1 + ring * 0.2);
      c.globalAlpha = l.opacity * (1 - ring * 0.1);
      const points: number[][] = [];
      for (let i = 0; i < count; i++) {
        const a =
            (i / count) * (style === "Arc bars" ? Math.PI : tau) - Math.PI / 2,
          v = values[i],
          hex =
            style === "Hex rings"
              ? Math.cos(Math.PI / 6) /
                Math.cos(((a + tau) % (Math.PI / 3)) - Math.PI / 6)
              : 1;
        const rr = r * hex,
          vv = v * Math.min(w, h) * 0.18;
        const x = cx + Math.cos(a) * rr,
          y = cy + Math.sin(a) * rr;
        if (style === "Orbital dots") dot(c, x, y, 1 + v * 7);
        else if (
          ["Neon ring", "Radial wave", "Hex rings", "Pulse tunnel"].includes(
            style,
          )
        )
          points.push([
            cx + Math.cos(a) * (rr + vv),
            cy + Math.sin(a) * (rr + vv),
          ]);
        else
          path(c, [
            [x, y],
            [cx + Math.cos(a) * (rr + vv), cy + Math.sin(a) * (rr + vv)],
          ]);
      }
      if (points.length) path(c, points, true);
    }
    return;
  }
  if (style === "3D linebed" || style === "Frequency landscape") {
    for (let row = 23; row >= 0; row--) {
      const depth = 1 - row / 32;
      const old = analysis?.at(Math.max(0, time - row * 0.04)) || f;
      c.globalAlpha = l.opacity * depth * 0.8;
      path(
        c,
        values.map((v, i) => {
          const bin = Math.floor(
            ((min * Math.pow(max / min, i / count)) / sampleRate) * 2048,
          );
          return [
            w / 2 + (i / (count - 1) - 0.5) * w * depth,
            h * (0.96 - row * 0.025) -
              (old.bins[bin] || v) * gain * h * 0.35 * depth,
          ];
        }),
      );
      if (style === "Frequency landscape" && row % 3 === 0)
        for (let i = 0; i < count; i += 4)
          path(c, [
            [
              w / 2 + (i / (count - 1) - 0.5) * w * depth,
              h * (0.96 - row * 0.025),
            ],
            [
              w / 2 + (i / (count - 1) - 0.5) * w * (depth + 0.03),
              h * (0.985 - row * 0.025),
            ],
          ]);
    }
    return;
  }
  if (style === "Universe mesh") {
    const points = values.map((v, i) => [
      rand(i) * w + (rand(i + 1) - 0.5) * v * 40,
      rand(i + 9) * h + (rand(i + 3) - 0.5) * v * 40,
    ]);
    points.forEach((p, i) => {
      dot(c, p[0], p[1], 1 + values[i] * 4);
      points.slice(i + 1).forEach((q) => {
        if (Math.hypot(p[0] - q[0], p[1] - q[1]) < w * 0.16) {
          c.globalAlpha = l.opacity * (0.12 + energy);
          path(c, [p, q]);
        }
      });
    });
    return;
  }
  for (let i = 0; i < count; i++) {
    const v = values[i],
      bw = (w / count) * (1 - num(s, "gap", 0.25)) * num(s, "barWidth", 1),
      bh = v * h * 0.95,
      x = (i * w) / count;
    if (style === "Dot field") {
      for (let j = 0; j < Math.floor(v * 14); j++)
        dot(c, x + bw / 2, h - (j * h) / 14, bw * 0.25);
    } else if (style === "Side spectrum") {
      c.fillRect(0, (i * h) / count, v * w * 0.47, (h / count) * 0.7);
      c.fillRect(
        w - v * w * 0.47,
        (i * h) / count,
        v * w * 0.47,
        (h / count) * 0.7,
      );
    } else if (style === "Mirrored bars") c.fillRect(x, h / 2 - bh / 2, bw, bh);
    else if (style === "Monstercat bars") {
      const unit = Math.max(3, h / 30);
      for (let y = 0; y < bh; y += unit)
        c.fillRect(x, h - y - unit, bw, unit * 0.75);
    } else c.fillRect(x, h - bh, bw, bh);
  }
}
function particles(
  c: CanvasRenderingContext2D,
  l: Layer,
  w: number,
  h: number,
  time: number,
  f: Features,
) {
  const s = l.settings,
    n = clamp(Math.round(num(s, "count", 100)), 1, PERFORMANCE_LIMITS.particleCount),
    seed = num(s, "seed", 42),
    style = str(s, "style"),
    speed = num(s, "speed", 0.25),
    reaction = num(s, "reaction", 1),
    audioTravel = s.sync === false ? 0 : f.travel,
    bass = s.sync === false ? 0 : f.bass,
    mid = s.sync === false ? 0 : f.mid,
    treble = s.sync === false ? 0 : f.treble,
    color = str(s, "color", "#fff"),
    travel = time * speed + audioTravel * reaction * 4;
  const wind = s.wind
      ? num(s, "strength", 0.5) *
        (time + audioTravel * num(s, "windReaction", 1) * 5)
      : 0,
    dir = str(s, "direction", "right"),
    r = num(s, "random", 1),
    spread = num(s, "spread", 1);
  c.fillStyle = c.strokeStyle = color;
  c.filter = `blur(${clamp(num(s, "blur"), 0, PERFORMANCE_LIMITS.particleBlur)}px)`;
  glow(c, color, s.glow ? clamp(num(s, "glowIntensity", 6), 0, PERFORMANCE_LIMITS.particleGlow) : 0);
  const points = Array.from({ length: n }, (_, i) => {
    const a = rand(i + 4, seed) * tau;
    let x = (rand(i, seed) - 0.5) * spread * w,
      y = (rand(i + 200, seed) - 0.5) * spread * h;
    const vx = Math.cos(a) * travel * 30 * r,
      vy = Math.sin(a) * travel * 30 * r;
    x +=
      vx +
      (dir === "right"
        ? wind * 40
        : dir === "left"
          ? -wind * 40
          : dir === "radial"
            ? Math.cos(a) * wind * 40
            : dir === "random"
              ? Math.sin(a * 4) * wind * 40
              : 0);
    y +=
      vy +
      (dir === "down"
        ? wind * 40
        : dir === "up"
          ? -wind * 40
          : dir === "radial"
            ? Math.sin(a) * wind * 40
            : dir === "random"
              ? Math.cos(a * 3) * wind * 40
              : 0);
    if (style === "Wave particles")
      y += Math.sin((x / w) * tau + travel) * mid * reaction * h * 0.15;
    if (style === "Radial particles" || style === "Star field") {
      x *= 1 + bass * num(s, "bass", 1) * reaction;
      y *= 1 + bass * reaction;
    }
    return [
      (((x + w / 2) % w) + w) % w,
      (((y + h / 2) % h) + h) % h,
      num(s, "minSize", 0.2) +
        rand(i + 600, seed) *
          (Math.max(num(s, "minSize", 0.2), num(s, "maxSize", 1.5)) -
            num(s, "minSize", 0.2)),
    ];
  });
  if (s.connections) {
    c.shadowBlur = 0;
    const d = clamp(num(s, "distance", 120), 10, PERFORMANCE_LIMITS.particleConnections);
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const dist = Math.hypot(
          points[i][0] - points[j][0],
          points[i][1] - points[j][1],
        );
        if (dist < d) {
          c.globalAlpha =
            l.opacity * num(s, "connectionOpacity", 0.2) * (1 - dist / d);
          path(c, [points[i], points[j]]);
        }
      }
  }
  for (let i = 0; i < n; i++) {
    const [x, y, size] = points[i];
    c.globalAlpha =
      l.opacity *
      (0.35 + rand(i + 10, seed) * 0.5) *
      (1 + treble * num(s, "treble", 1) * reaction);
    let radius = size * (1 + bass * num(s, "bass", 1) * reaction * 0.3);
    if (style === "Bokeh" || style === "Orbs" || style === "Nebula") {
      radius *= style === "Nebula" ? 20 : style === "Bokeh" ? 6 : 3;
      const g = c.createRadialGradient(x, y, 0, x, y, Math.max(0.1, radius));
      g.addColorStop(0, color);
      g.addColorStop(1, "transparent");
      c.fillStyle = g;
      c.globalAlpha *= 0.4;
    } else c.fillStyle = color;
    if (style === "Fireflies")
      c.globalAlpha *= 0.4 + 0.6 * Math.sin(i + travel) ** 2;
    if (style === "Dust") c.fillRect(x, y, radius, radius * 0.5);
    else dot(c, x, y, radius);
  }
}
function text(
  c: CanvasRenderingContext2D,
  l: Layer,
  w: number,
  h: number,
  time: number,
  duration: number,
) {
  const s = l.settings,
    fs = num(s, "size", 64);
  let t = str(s, "text");
  if (s.uppercase) t = t.toUpperCase();
  const reveal = sampleMotion(layerMotion(l), time, duration).samples.find(a => a.transition.style === "Text reveal");
  c.font = `${s.italic ? "italic " : ""}${s.bold ? "700" : "400"} ${fs}px "${str(s, "font", "Inter")}"`;
  c.textBaseline = "middle";
  c.textAlign = str(s, "align", "center") as CanvasTextAlign;
  c.direction = str(s, "direction", "ltr") as CanvasDirection;
  c.letterSpacing = `${num(s, "spacing")}px`;
  const pad = num(s, "padding", 12);
  const x =
    c.textAlign === "center" ? w / 2 : c.textAlign === "right" ? w - pad : pad;
  const lines = t.split("\n"),
    line = fs * num(s, "lineHeight", 1.2);
  if (s.background) {
    c.fillStyle = str(s, "backgroundColor", "#111726");
    c.fillRect(0, 0, w, h);
  }
  glow(c, str(s, "color", "#fff"), num(s, "glow"));
  if (num(s, "shadow")) {
    c.shadowColor = "#000";
    c.shadowBlur = num(s, "shadow");
    c.shadowOffsetY = 3;
  }
  c.fillStyle = str(s, "color", "#fff");
  lines.forEach((lineText, i) => {
    const y = h / 2 + (i - (lines.length - 1) / 2) * line;
    c.save();
    if (reveal) {
      const units = revealUnits(lineText, reveal.transition.reveal === "Words");
      const amount = clamp(ease(reveal.progress, reveal.transition.easing), 0, 1);
      const count = Math.ceil(units.length * amount);
      const reverse = reveal.transition.direction === "Right";
      const visible = (reverse ? units.slice(units.length - count) : units.slice(0, count)).join("");
      const fullWidth = c.measureText(lineText).width;
      const shownWidth = count === 0 ? 0 : c.measureText(visible).width;
      const left = c.textAlign === "center" ? x - fullWidth / 2 : c.textAlign === "right" ? x - fullWidth : x;
      c.beginPath(); c.rect(reverse !== (c.direction === "rtl") ? left + fullWidth - shownWidth : left, y - line / 2, shownWidth, line); c.clip();
    }
    if (num(s, "outline")) {
      c.strokeStyle = str(s, "outlineColor", "#000");
      c.lineWidth = num(s, "outline");
      c.strokeText(lineText, x, y);
    }
    c.fillText(lineText, x, y);
    if (s.underline) {
      const width = c.measureText(lineText).width;
      const left =
        c.textAlign === "center"
          ? x - width / 2
          : c.textAlign === "right"
            ? x - width
            : x;
      c.fillRect(left, y + fs * 0.5, width, Math.max(1, fs / 25));
    }
    c.restore();
  });
}
export type LogoData = { path: string; hex: string };
export const logos: Record<string, LogoData> = {};
function logo(c: CanvasRenderingContext2D, l: Layer, w: number, h: number) {
  const s = l.settings,
    entry = logos[str(s, "platform")];
  if (!entry) return;
  const size = Math.min(w, h);
  c.translate((w - size) / 2, (h - size) / 2);
  const style = str(s, "style");
  if (style === "Badge") {
    c.fillStyle = "#ffffff";
    dot(c, size / 2, size / 2, size / 2);
    c.translate(size * 0.17, size * 0.17);
    c.scale(0.66, 0.66);
  }
  c.scale(size / 24, size / 24);
  c.fillStyle =
    style === "Original"
      ? "#" + entry.hex
      : style === "Badge"
        ? "#121722"
        : str(s, "color", "#fff");
  if (style === "Outline") {
    c.strokeStyle = c.fillStyle;
    c.lineWidth = 0.5;
    c.stroke(new Path2D(entry.path));
  } else c.fill(new Path2D(entry.path));
}
function background(
  c: CanvasRenderingContext2D,
  l: Layer,
  w: number,
  h: number,
  t: number,
  media: MediaLibrary,
) {
  const s = l.settings;
  const blur = clamp(num(s, "blur"), 0, PERFORMANCE_LIMITS.backgroundBlur);
  c.filter = `blur(${blur}px) brightness(${num(s, "brightness", 100)}%) contrast(${num(s, "contrast", 100)}%) saturate(${num(s, "saturation", 100)}%) hue-rotate(${num(s, "hue")}deg)`;
  c.fillStyle = str(s, "color", "#111726");
  if (str(s, "mode") === "Gradient") {
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, str(s, "color"));
    g.addColorStop(1, str(s, "color2"));
    c.fillStyle = g;
  }
  c.fillRect(
    -blur * 3,
    -blur * 3,
    w + blur * 6,
    h + blur * 6,
  );
  if (l.asset) {
    const img = media.images.get(l.asset) || media.videos.get(l.asset);
    if (img) {
      const iw =
          img instanceof HTMLVideoElement ? img.videoWidth : img.naturalWidth,
        ih =
          img instanceof HTMLVideoElement ? img.videoHeight : img.naturalHeight,
        scale = Math.max(w / iw, h / ih) * (1 + blur / 80);
      c.drawImage(
        img,
        (w - iw * scale) / 2,
        (h - ih * scale) / 2,
        iw * scale,
        ih * scale,
      );
    }
  }
  c.filter = "none";
  if (s.dream) {
    const phase = (t / num(s, "speed", 16)) * tau;
    c.save();
    c.globalCompositeOperation = "screen";
    c.globalAlpha *= num(s, "lightIntensity", 0.5);
    for (let i = 0; i < 3; i++) {
      const x = w * (0.5 + Math.sin(phase + i * 2) * 0.36),
        y = h * (0.5 + Math.cos(phase + i * 2) * 0.35),
        r = (Math.max(w, h) * num(s, "lightSize", 55)) / 100;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(
        0,
        str(s, i % 2 ? "lightColor2" : "lightColor", "#8b82ff"),
      );
      g.addColorStop(
        clamp(1 - num(s, "lightBlur", 45) / 100, 0.05, 0.95),
        "transparent",
      );
      g.addColorStop(1, "transparent");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }
    c.restore();
  }
  c.save();
  c.globalAlpha *= num(s, "overlayOpacity");
  c.fillStyle = str(s, "overlay");
  c.fillRect(0, 0, w, h);
  c.restore();
  const g = c.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.2,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.7,
  );
  g.addColorStop(0, "transparent");
  g.addColorStop(1, `rgba(0,0,0,${num(s, "vignette", 0.25)})`);
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  if (num(s, "grain")) {
    c.save();
    c.globalAlpha *= num(s, "grain");
    c.fillStyle = "#fff";
    for (let i = 0; i < 300; i++)
      c.fillRect(rand(i, t) * w, rand(i + 500, t) * h, 1, 1);
    c.restore();
  }
}
function effects(
  c: CanvasRenderingContext2D,
  p: Project,
  t: number,
  f: Features,
  scratch: HTMLCanvasElement,
) {
  const s = p.effects,
    style = str(s, "style");
  if (!s.enabled || style === "None") return;
  const w = p.width,
    h = p.height,
    k = clamp(
      num(s, "intensity", 0.3) *
        num(s, "blend", 0.6) *
        (s.sync ? num(s, "baseline", 0.2) + Math.max(0, (str(s, "band") === "Bass" ? f.bass : str(s, "band") === "Mid" ? f.mid : str(s, "band") === "Treble" ? f.treble : f.energy) - num(s, "threshold")) * num(s, "reaction", 1) * 2 : 1),
      0,
      1,
    ),
    time = t * num(s, "speed", 1);
  if (k <= 0) return;
  c.save();
  c.globalAlpha = Math.min(1, k);
  c.fillStyle = "#fff";
  if (
    ["Film grain", "Noise", "Dust", "Scratches", "Retro film"].includes(style)
  ) {
    for (let i = 0; i < (style === "Dust" ? 100 : 900); i++) {
      c.fillStyle = rand(i, Math.floor(time * 24)) > 0.5 ? "#fff" : "#000";
      const x = rand(i + 10, Math.floor(time * 24)) * w,
        y = rand(i + 20, Math.floor(time * 24)) * h;
      c.fillRect(
        x,
        y,
        style === "Scratches" ? 1 : 2,
        style === "Scratches" ? h * 0.2 : 2,
      );
    }
    if (style === "Retro film") {
      c.globalCompositeOperation = "color";
      c.fillStyle = "#ce9364";
      c.fillRect(0, 0, w, h);
    }
  } else if (["Scanlines", "VHS", "Analog distortion"].includes(style)) {
    c.fillStyle = "#000";
    for (let y = 0; y < h; y += 5) c.fillRect(0, y, w, 1);
    if (style !== "Scanlines") {
      c.globalAlpha = k * 0.5;
      c.fillStyle = "#fff";
      c.fillRect(0, (time * 60) % h, w, 8);
    }
  } else if (
    [
      "Vignette",
      "Light leak",
      "Lens flare",
      "Glare",
      "Film burn",
      "Bokeh",
    ].includes(style)
  ) {
    const x = w * (0.5 + 0.4 * Math.sin(time * 0.3)),
      y = h * (0.5 + 0.4 * Math.cos(time * 0.4));
    if (style === "Vignette") {
      const g = c.createRadialGradient(
        w / 2,
        h / 2,
        h * 0.2,
        w / 2,
        h / 2,
        w * 0.65,
      );
      g.addColorStop(0, "transparent");
      g.addColorStop(1, "#000");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    } else {
      c.globalCompositeOperation = "screen";
      for (let i = 0; i < (style === "Bokeh" ? 18 : 3); i++) {
        const xx =
            style === "Bokeh"
              ? (rand(i) + Math.sin(time * 0.2 + i) * 0.06) * w
              : x + i * w * 0.12,
          yy =
            style === "Bokeh"
              ? (rand(i + 5) + Math.cos(time * 0.15 + i) * 0.06) * h
              : y - i * h * 0.08,
          r =
            style === "Lens flare"
              ? h * 0.12
              : style === "Bokeh"
                ? h * 0.06
                : h * 0.8;
        const g = c.createRadialGradient(xx, yy, 0, xx, yy, r);
        g.addColorStop(
          0,
          style === "Film burn" ? "#ff522a" : i % 2 ? "#ffa462" : "#bedcff",
        );
        g.addColorStop(1, "transparent");
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
      }
    }
  } else if (style === "Strobe") {
    c.globalAlpha = k * (Math.sin(time * 18) > 0.8 ? 1 : 0);
    c.fillRect(0, 0, w, h);
  } else if (style === "Warm wash" || style === "Cool wash") {
    c.globalCompositeOperation = "soft-light";
    c.fillStyle = style === "Warm wash" ? "#ff945b" : "#679dff";
    c.fillRect(0, 0, w, h);
  } else if (style === "Color drift") {
    c.globalCompositeOperation = "color";
    c.fillStyle = `hsl(${(time * 20) % 360} 65% 55%)`;
    c.fillRect(0, 0, w, h);
  } else {
    scratch.width = w;
    scratch.height = h;
    const sc = scratch.getContext("2d")!;
    sc.drawImage(c.canvas, 0, 0, w, h);
    if (["Soft blur", "Dream blur", "Bloom"].includes(style)) {
      c.filter = `blur(${2 + k * 18}px)`;
      if (style === "Bloom") c.globalCompositeOperation = "screen";
      c.drawImage(scratch, -20, -20, w + 40, h + 40);
    } else if (style === "Pixel sorting") {
      // Sort real source pixels by luminance in selected bands, rather than
      // relabeling the displacement effect as pixel sorting.
      for (let i = 0; i < 8; i++) {
        const y = Math.floor(
          rand(i, Math.floor(time * 5)) * Math.max(1, h - 2),
        );
        const row = sc.getImageData(0, y, Math.floor(w), 1),
          pixels = row.data;
        const order = Array.from({ length: Math.floor(w) }, (_, x) => x).sort(
          (a, b) =>
            pixels[a * 4] * 0.2126 +
            pixels[a * 4 + 1] * 0.7152 +
            pixels[a * 4 + 2] * 0.0722 -
            (pixels[b * 4] * 0.2126 +
              pixels[b * 4 + 1] * 0.7152 +
              pixels[b * 4 + 2] * 0.0722),
        );
        const sorted = new Uint8ClampedArray(pixels.length);
        order.forEach((source, x) =>
          sorted.set(pixels.subarray(source * 4, source * 4 + 4), x * 4),
        );
        pixels.set(sorted);
        sc.putImageData(row, 0, y);
        c.drawImage(
          scratch,
          0,
          y,
          w,
          1,
          0,
          y,
          w,
          3 + rand(i + 20) * h * 0.045 * k,
        );
      }
    } else if (style === "Glitch") {
      for (let i = 0; i < 10; i++) {
        const y = rand(i, Math.floor(time * 10)) * h,
          hh = 5 + rand(i + 4) * h * 0.1,
          dx = (rand(i + 8, Math.floor(time * 10)) - 0.5) * k * 100;
        c.drawImage(scratch, 0, y, w, hh, dx, y, w, hh);
      }
    } else if (style === "Camera shake" || style === "Zoom pulse") {
      c.globalAlpha = 1;
      const scale =
          1.04 +
          k *
            0.08 *
            (style === "Zoom pulse" ? 0.5 + 0.5 * Math.sin(time * 3) : 1),
        dx = style === "Camera shake" ? Math.sin(time * 33) * k * 10 : 0,
        dy = style === "Camera shake" ? Math.cos(time * 27) * k * 10 : 0;
      c.drawImage(
        scratch,
        (w - w * scale) / 2 + dx,
        (h - h * scale) / 2 + dy,
        w * scale,
        h * scale,
      );
    } else if (style === "RGB split" || style === "Chromatic aberration") {
      let channel = effectBuffers.get(scratch);
      if (!channel) {
        channel = document.createElement("canvas");
        effectBuffers.set(scratch, channel);
      }
      if (channel.width !== Math.floor(w) || channel.height !== Math.floor(h)) {
        channel.width = w;
        channel.height = h;
      }
      const cc = channel.getContext("2d")!;
      c.globalCompositeOperation = "screen";
      c.globalAlpha = k * 0.65;
      ["#ff0000", "#00ff00", "#0000ff"].forEach((color, i) => {
        cc.globalCompositeOperation = "copy";
        cc.drawImage(scratch, 0, 0);
        cc.globalCompositeOperation = "multiply";
        cc.fillStyle = color;
        cc.fillRect(0, 0, w, h);
        const offset = (i - 1) * k * (8 + Math.sin(time * 2) * 4);
        const expand =
          style === "Chromatic aberration" ? Math.abs(offset) * 2 : 0;
        c.drawImage(
          channel,
          offset - expand,
          -expand,
          w + expand * 2,
          h + expand * 2,
        );
      });
    } else {
      c.globalCompositeOperation = "screen";
      c.globalAlpha = k * 0.35;
      for (let i = 0; i < 3; i++) {
        c.filter = `sepia(1) saturate(5) hue-rotate(${i * 120}deg)`;
        const shift = (i - 1) * k * 20;
        c.drawImage(scratch, shift, style === "Prism" ? shift : 0, w, h);
      }
    }
  }
  c.restore();
}
export function videoTime(l: Layer, t: number, media: MediaLibrary) {
  const v = l.asset ? media.videos.get(l.asset) : undefined;
  if (!v) return 0;
  const duration = Number.isFinite(v.duration)
    ? v.duration
    : v.seekable.length
      ? v.seekable.end(v.seekable.length - 1)
      : 0;
  if (!duration) return 0;
  const start = clamp(
      num(l.settings, "videoStart"),
      0,
      Math.max(0, duration - 0.05),
    ),
    end = clamp(
      num(l.settings, "videoEnd") || duration,
      start + 0.01,
      duration,
    );
  const length = Math.max(0.05, end - start);
  return (
    start +
    (l.settings.videoLoop === false ? Math.min(t, length - 0.01) : t % length)
  );
}
export function renderScene(
  canvas: HTMLCanvasElement,
  p: Project,
  media: MediaLibrary,
  time: number,
  analysis?: AudioAnalysis,
  scratch?: HTMLCanvasElement,
) {
  const c = canvas.getContext("2d")!;
  c.save();
  c.setTransform(canvas.width / p.width, 0, 0, canvas.height / p.height, 0, 0);
  c.clearRect(0, 0, p.width, p.height);
  c.fillStyle = "#080b10";
  c.fillRect(0, 0, p.width, p.height);
  c.beginPath();
  c.rect(0, 0, p.width, p.height);
  c.clip();
  const f = analysis?.at(time + p.start) || silence();
  const main = c;
  for (const l of [
    ...p.layers.filter((l) => l.kind === "background"),
    ...p.layers.filter((l) => l.kind !== "background"),
  ]) {
    if (!l.visible || l.opacity <= 0) continue;
    const motion = sampleMotion(layerMotion(l), time, p.end - p.start);
    if (!motion.visible) continue;
    if (l.kind === "effect") {
      const alpha = motion.samples.reduce((a, s) => a * (s.transition.opacity + (1 - s.transition.opacity) * clamp(ease(s.progress, s.transition.easing), 0, 1)), 1);
      if (scratch) effects(main, { ...p, effects: { ...l.settings, blend: num(l.settings, "blend", 0.6) * l.opacity * alpha } }, time, f, scratch);
      continue;
    }
    const animated = motion.samples.some(s => needsIsolation(s.transition.style));
    const buffer = animated ? motionBuffer(canvas) : null;
    const c = buffer ? buffer.getContext("2d")! : main;
    if (buffer) { c.setTransform(canvas.width / p.width, 0, 0, canvas.height / p.height, 0, 0); c.clearRect(0, 0, p.width, p.height); }
    // Particles are a canvas-wide simulation. Backgrounds use their own
    // transform, just like every other visual layer, so imported media can be
    // moved and resized without being silently stretched to the canvas.
    const fullBleed = l.kind === "particles";
    const w = fullBleed ? p.width : (l.w / 100) * p.width,
      h = fullBleed ? p.height : (l.h / 100) * p.height;
    c.save();
    c.globalAlpha = l.opacity;
    c.translate(
      fullBleed ? p.width / 2 : (l.x / 100) * p.width,
      fullBleed ? p.height / 2 : (l.y / 100) * p.height,
    );
    c.rotate((l.rotation * Math.PI) / 180);
    c.translate(-w / 2, -h / 2);
    for (const sample of motion.samples) applyTransition(c, sample.transition, sample.progress, w, h, "geometry");
    if (l.kind === "background") background(c, l, w, h, time, media);
    else if (l.kind === "image" && l.asset) {
      const img = media.images.get(l.asset);
      if (img) {
        const scale =
          str(l.settings, "fit") === "cover"
            ? Math.max(w / img.naturalWidth, h / img.naturalHeight)
            : Math.min(w / img.naturalWidth, h / img.naturalHeight);
        c.beginPath();
        c.rect(0, 0, w, h);
        c.clip();
        c.drawImage(
          img,
          (w - img.naturalWidth * scale) / 2,
          (h - img.naturalHeight * scale) / 2,
          img.naturalWidth * scale,
          img.naturalHeight * scale,
        );
      }
    } else if (l.kind === "text") text(c, l, w, h, time, p.end - p.start);
    else if (l.kind === "spectrum")
      spectrum(
        c,
        l,
        w,
        h,
        f,
        analysis?.sampleRate || 44100,
        analysis,
        time + p.start,
      );
    else if (l.kind === "particles") particles(c, l, w, h, time, f);
    else if (l.kind === "logo") logo(c, l, w, h);
    c.restore();
    if (buffer) {
      main.save();
      if (l.kind === "spectrum") main.globalCompositeOperation = str(l.settings, "blend", "source-over") as GlobalCompositeOperation;
      for (const sample of motion.samples) applyTransition(main, sample.transition, sample.progress, w, h, "appearance");
      main.drawImage(buffer, 0, 0, p.width, p.height);
      main.restore();
    }
  }
  if (scratch) effects(c, p, time, f, scratch);
  const transitions = projectTransitions(p);
  const motion = sampleMotion({ start: 0, end: null, entrance: transitions.intro, exit: transitions.outro }, time, p.end - p.start);
  if (motion.samples.length) {
    const buffer = motionBuffer(canvas), bc = buffer.getContext("2d")!;
    bc.setTransform(1, 0, 0, 1, 0, 0); bc.clearRect(0, 0, buffer.width, buffer.height); bc.drawImage(canvas, 0, 0);
    c.fillStyle = "#000"; c.fillRect(0, 0, p.width, p.height);
    c.save();
    for (const sample of motion.samples) applyTransition(c, sample.transition, sample.progress, p.width, p.height);
    c.drawImage(buffer, 0, 0, p.width, p.height); c.restore();
  }
  c.restore();
}
