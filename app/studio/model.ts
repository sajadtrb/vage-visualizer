export type Kind =
  "background" | "image" | "text" | "spectrum" | "particles" | "logo" | "effect";
export type Settings = Record<string, string | number | boolean>;
export type Transition = {
  style: string;
  duration: number;
  delay: number;
  easing: string;
  direction: string;
  distance: number;
  scale: number;
  angle: number;
  blur: number;
  opacity: number;
  strips: number;
  reveal: string;
};
export type LayerMotion = {
  start: number;
  end: number | null;
  entrance: Transition;
  exit: Transition;
};
export type Layer = {
  id: string;
  name: string;
  kind: Kind;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  asset?: string;
  settings: Settings;
  motion?: LayerMotion;
};
export type Project = {
  version: 2;
  id: string;
  name: string;
  updated: number;
  width: number;
  height: number;
  layers: Layer[];
  audio?: string;
  audioName: string;
  audioDuration: number;
  start: number;
  end: number;
  loop: boolean;
  effects: Settings;
  transitions?: { intro: Transition; outro: Transition };
  export: {
    fps: number;
    quality: string;
    width?: number;
    height?: number;
    start?: number;
    end?: number;
  };
  thumbnail?: string;
};
export const spectra = [
  "Pulse bars",
  "Circular ring",
  "Mirrored bars",
  "Waveform",
  "Oscilloscope",
  "Neon ring",
  "Liquid spectrum",
  "Side spectrum",
  "Dual bulb",
  "Arc bars",
  "Dot field",
  "Aurora wave",
  "Monstercat bars",
  "Universe mesh",
  "3D linebed",
  "Hex rings",
  "Pulse tunnel",
  "Orbital dots",
  "Radial wave",
  "Frequency landscape",
];
export const particleStyles = [
  "Soft dots",
  "Star field",
  "Network mesh",
  "Nebula",
  "Dust",
  "Fireflies",
  "Orbs",
  "Bokeh",
  "Wave particles",
  "Radial particles",
];
export const effectStyles = [
  "None",
  "Film grain",
  "Light leak",
  "Lens flare",
  "Chromatic aberration",
  "RGB split",
  "Glare",
  "Bloom",
  "Soft blur",
  "Dream blur",
  "VHS",
  "Scanlines",
  "Film burn",
  "Dust",
  "Scratches",
  "Glitch",
  "Pixel sorting",
  "Strobe",
  "Vignette",
  "Color drift",
  "Camera shake",
  "Zoom pulse",
  "Prism",
  "Bokeh",
  "Noise",
  "Retro film",
  "Analog distortion",
  "Warm wash", "Cool wash",
];
export const platforms = [
  "Spotify",
  "YouTube",
  "Apple Music",
  "SoundCloud",
  "Deezer",
  "Bandcamp",
];
export const uid = () => crypto.randomUUID();
export const num = (s: Settings, k: string, f = 0) =>
  typeof s[k] === "number" ? (s[k] as number) : f;
export const str = (s: Settings, k: string, f = "") =>
  typeof s[k] === "string" ? (s[k] as string) : f;
export const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
export const PERFORMANCE_LIMITS = {
  particleCount: 100,
  particleBlur: 8,
  particleGlow: 18,
  particleConnections: 250,
  spectrumCount: 96,
  spectrumGlow: 24,
  backgroundBlur: 30,
  textGlow: 30,
} as const;
export function layer(kind: Kind, id: string): Layer {
  const common = {
    id,
    name: kind[0].toUpperCase() + kind.slice(1),
    kind,
    x: 50,
    y: 50,
    w: 40,
    h: 40,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
  };
  const settings: Record<Kind, Settings> = {
    effect: { enabled: true, style: "Light leak", intensity: 0.3, blend: 0.6, speed: 1, sync: false, reaction: 1, baseline: 0.2, band: "Energy" },
    background: {
      mode: "Gradient",
      color: "#111726",
      color2: "#2f3653",
      blur: 0,
      brightness: 100,
      contrast: 100,
      saturation: 100,
      hue: 0,
      vignette: 0.25,
      grain: 0,
      overlay: "#677bff",
      overlayOpacity: 0,
      dream: false,
      lightColor: "#8b82ff",
      lightColor2: "#ff996e",
      lightSize: 55,
      lightBlur: 45,
      lightIntensity: 0.5,
      speed: 16,
      videoStart: 0,
      videoEnd: 0,
      videoLoop: true,
    },
    image: { fit: "contain" },
    text: {
      text: "New text",
      font: "Inter",
      size: 64,
      color: "#f8f9ff",
      bold: false,
      italic: false,
      underline: false,
      uppercase: false,
      spacing: 0,
      lineHeight: 1.2,
      align: "center",
      direction: "ltr",
      shadow: 0,
      glow: 0,
      outline: 0,
      outlineColor: "#000000",
      background: false,
      backgroundColor: "#111726",
      padding: 12,
      entrance: "None",
      exit: "None",
      duration: 1,
      easing: "Ease out",
    },
    spectrum: {
      style: "Pulse bars",
      color: "#c2ff62",
      color2: "#78dacc",
      gradient: false,
      gain: 1,
      sensitivity: 1,
      reaction: 1,
      barWidth: 1,
      bass: 1,
      smoothing: 0.7,
      minFrequency: 30,
      maxFrequency: 16000,
      count: 64,
      thickness: 2,
      gap: 0.25,
      glow: 0,
      mirror: false,
      blend: "source-over",
    },
    particles: {
      style: "Soft dots",
      color: "#ffffff",
      count: 100,
      minSize: 0.2,
      maxSize: 1.5,
      glow: false,
      glowIntensity: 6,
      blur: 0,
      speed: 0.25,
      sync: true,
      wind: false,
      direction: "right",
      strength: 0.5,
      windReaction: 1,
      random: 1,
      reaction: 1,
      bass: 1,
      treble: 1,
      spread: 1,
      connections: false,
      distance: 120,
      connectionOpacity: 0.2,
      seed: 42,
    },
    logo: { platform: "Spotify", style: "Original", color: "#ffffff" },
  };
  return {
    ...common,
    ...(kind === "background" || kind === "particles"
      ? { w: 100, h: 100 }
      : {}),
    ...(kind === "text" ? { w: 75, h: 12 } : {}),
    ...(kind === "logo" ? { w: 7, h: 7 } : {}),
    settings: settings[kind],
  };
}
export function freshProject(id: string): Project {
  const bg = layer("background", "bg");
  const spectrum = layer("spectrum", "spectrum");
  spectrum.y = 64;
  spectrum.w = 78;
  spectrum.h = 21;
  const title = layer("text", "title");
  title.name = "Song title";
  title.y = 82;
  title.settings.text = "YOUR NEXT RELEASE";
  title.settings.bold = true;
  const artist = layer("text", "artist");
  artist.name = "Artist name";
  artist.y = 91;
  artist.settings.text = "Artist name";
  artist.settings.size = 28;
  artist.settings.color = "#b4bace";
  const particles = layer("particles", "particles");
  particles.visible = false;
  return {
    version: 2,
    id,
    name: "Untitled session",
    updated: 0,
    width: 1920,
    height: 1080,
    layers: [bg, particles, spectrum, title, artist],
    audioName: "",
    audioDuration: 0,
    start: 0,
    end: 15,
    loop: true,
    effects: {
      style: "None",
      enabled: true,
      intensity: 0.3,
      speed: 1,
      blend: 0.6,
      sync: false,
      reaction: 1,
    },
    export: { fps: 30, quality: "High" },
  };
}

/**
 * Changes the project format without independently stretching the scene on
 * each axis. The scene is uniformly fitted into the new canvas, preserving
 * the proportions of every object and the pixel size of typography.
 */
export function resizeProjectCanvas(
  p: Project,
  width: number,
  height: number,
): Project {
  const nextWidth = Math.round(clamp(width, 64, 3840));
  const nextHeight = Math.round(clamp(height, 64, 3840));
  if (p.width === nextWidth && p.height === nextHeight) return p;
  const factor = Math.min(nextWidth / p.width, nextHeight / p.height);
  const offsetX = (nextWidth - p.width * factor) / 2;
  const offsetY = (nextHeight - p.height * factor) / 2;
  const layers = p.layers.map((l) => {
    // Particle simulation is intentionally canvas-wide. Backgrounds are
    // regular transformable layers so users can crop, reposition, and scale
    // an imported image/video without the model snapping it back on resize.
    if (l.kind === "particles")
      return { ...l, x: 50, y: 50, w: 100, h: 100 };
    const px = (l.x / 100) * p.width;
    const py = (l.y / 100) * p.height;
    const pw = (l.w / 100) * p.width;
    const ph = (l.h / 100) * p.height;
    const settings =
      l.kind === "text" && typeof l.settings.size === "number"
        ? { ...l.settings, size: Math.max(1, l.settings.size * factor) }
        : l.settings;
    return {
      ...l,
      x: ((px * factor + offsetX) / nextWidth) * 100,
      y: ((py * factor + offsetY) / nextHeight) * 100,
      w: (pw * factor * 100) / nextWidth,
      h: (ph * factor * 100) / nextHeight,
      settings,
    };
  });
  return { ...p, width: nextWidth, height: nextHeight, layers };
}
export function normalizeProject(p: Project): Project {
  return {
    ...p,
    version: 2,
    layers: p.layers.map((l) => {
      const finite = (value: unknown, fallback: number) =>
        typeof value === "number" && Number.isFinite(value) ? value : fallback;
      if (l.kind === "particles")
        return {
          ...l,
          x: 50,
          y: 50,
          w: 100,
          h: 100,
          settings: {
            ...l.settings,
            // Older projects had audio reactivity always enabled. Preserve that
            // behavior unless the user explicitly disables music sync.
            sync: l.settings.sync !== false,
            count: clamp(
              Math.round(finite(l.settings.count, 100)),
              1,
              PERFORMANCE_LIMITS.particleCount,
            ),
            blur: clamp(finite(l.settings.blur, 0), 0, PERFORMANCE_LIMITS.particleBlur),
            glowIntensity: clamp(
              finite(l.settings.glowIntensity, 6),
              0,
              PERFORMANCE_LIMITS.particleGlow,
            ),
            distance: clamp(
              finite(l.settings.distance, 120),
              10,
              PERFORMANCE_LIMITS.particleConnections,
            ),
          },
        };
      // Every layer is allowed to extend beyond the composition frame. The
      // canvas is a viewport, not a clipping boundary for editor transforms.
      const maxDimension = 400;
      return {
        ...l,
        x: clamp(finite(l.x, 50), -200, 300),
        y: clamp(finite(l.y, 50), -200, 300),
        w: clamp(finite(l.w, 40), 0.1, maxDimension),
        h: clamp(finite(l.h, 40), 0.1, maxDimension),
        rotation: finite(l.rotation, 0),
        opacity: clamp(finite(l.opacity, 1), 0, 1),
        settings:
          l.kind === "spectrum"
              ? {
                  ...l.settings,
                  count: clamp(
                    Math.round(finite(l.settings.count, 64)),
                    16,
                    PERFORMANCE_LIMITS.spectrumCount,
                  ),
                  glow: clamp(finite(l.settings.glow, 0), 0, PERFORMANCE_LIMITS.spectrumGlow),
                }
              : l.kind === "background"
                ? {
                    ...l.settings,
                    blur: clamp(finite(l.settings.blur, 0), 0, PERFORMANCE_LIMITS.backgroundBlur),
                  }
                : l.kind === "text"
                  ? {
                      ...l.settings,
                      glow: clamp(finite(l.settings.glow, 0), 0, PERFORMANCE_LIMITS.textGlow),
                      shadow: clamp(finite(l.settings.shadow, 0), 0, PERFORMANCE_LIMITS.textGlow),
                    }
                  : l.settings,
      };
    }),
  };
}
export function timeLabel(t: number) {
  return `${Math.floor(t / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(t % 60)
    .toString()
    .padStart(2, "0")}`;
}
