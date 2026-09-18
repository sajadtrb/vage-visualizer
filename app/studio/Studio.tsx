"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import dynamic from "next/dynamic";
import {
  Project,
  Layer,
  Kind,
  Settings,
  clamp,
  freshProject,
  layer,
  resizeProjectCanvas,
  timeLabel,
  uid,
} from "./model";
import {
  allProjects,
  deleteProject,
  getActive,
  getAsset,
  getProject,
  putAsset,
  saveProject,
  setActive,
} from "./storage";
import { AudioAnalysis } from "./audio";
import { MediaLibrary } from "./media";
import { renderScene, videoTime } from "./renderer";
import { logos } from "./logos";
import {
  Control,
  LayerSettings,
  SettingsFields,
  effectsSpecs,
} from "./Controls";
import { loadFonts } from "./fonts";
import { fa } from "./i18n";
import LegacyBackup from "./LegacyBackup";
const ExportDialog = dynamic(() => import("./ExportDialog"), { ssr: false });
const icons: Record<Kind, string> = {
  background: "▧",
  image: "▣",
  text: "T",
  spectrum: "▥",
  particles: "✦",
  logo: "◈",
};
const presets = [
  {
    name: "Midnight signal",
    color: "#9bf3cf",
    bg: "#11192c",
    bg2: "#273950",
    spectrum: "Monstercat bars",
  },
  {
    name: "Afterglow",
    color: "#ffc49f",
    bg: "#261825",
    bg2: "#754355",
    spectrum: "Circular ring",
  },
  {
    name: "Neon frequency",
    color: "#c2ff62",
    bg: "#0c181a",
    bg2: "#29453f",
    spectrum: "Pulse bars",
  },
  {
    name: "Orbit",
    color: "#b8abff",
    bg: "#17152b",
    bg2: "#3d3266",
    spectrum: "Orbital dots",
  },
  {
    name: "Paper waves",
    color: "#ebebdc",
    bg: "#252723",
    bg2: "#464b41",
    spectrum: "3D linebed",
  },
  {
    name: "Solar mesh",
    color: "#ffbd61",
    bg: "#201318",
    bg2: "#62333c",
    spectrum: "Universe mesh",
  },
];
type Drag = {
  mode: "move" | "scale" | "rotate";
  initial: Layer;
  snapshot: Project;
  px: number;
  py: number;
  bounds: DOMRect;
  corner: number;
};
export default function Studio() {
  const [project, setProject] = useState<Project>(() =>
    freshProject("initial"),
  );
  const [ready, setReady] = useState(false),
    [lang, setLang] = useState("en"),
    [tab, setTab] = useState("Layers"),
    [selected, setSelected] = useState<string[]>(["title"]),
    [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false),
    [analysis, setAnalysis] = useState<AudioAnalysis>(),
    [status, setStatus] = useState("Saved locally"),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(""),
    [zoom, setZoom] = useState(1),
    [showProjects, setShowProjects] = useState(false),
    [projects, setProjects] = useState<Project[]>([]),
    [showExport, setShowExport] = useState(false),
    [inspectorTab, setInspectorTab] = useState("Layer"),
    [customCanvas, setCustomCanvas] = useState({
      width: "1280",
      height: "720",
    });
  const canvas = useRef<HTMLCanvasElement>(null),
    surface = useRef<HTMLDivElement>(null),
    scratch = useRef<HTMLCanvasElement | null>(null),
    media = useRef(new MediaLibrary()),
    live = useRef(project),
    clock = useRef(0),
    analysisRef = useRef<AudioAnalysis | undefined>(undefined),
    playingRef = useRef(false),
    audioContext = useRef<AudioContext | null>(null),
    audioNode = useRef<AudioBufferSourceNode | null>(null),
    audioStart = useRef(0),
    audioOffset = useRef(0),
    drag = useRef<Drag | null>(null),
    history = useRef<Project[]>([]),
    future = useRef<Project[]>([]),
    saveQueue = useRef(Promise.resolve()),
    exporting = useRef(false),
    loadGeneration = useRef(0);
  live.current = project;
  clock.current = time;
  analysisRef.current = analysis;
  exporting.current = showExport;
  const t = useCallback(
    (s: string) => (lang === "fa" ? fa[s] || s : s),
    [lang],
  );
  const selectedLayer = project.layers.find((l) => l.id === selected[0]);
  const canvasIsPreset = ["1920x1080", "1080x1920", "1080x1080"].includes(
    `${project.width}x${project.height}`,
  );
  const update = (fn: (p: Project) => Project, remember = true) => {
    const previous = live.current;
    if (remember) {
      history.current.push(previous);
      if (history.current.length > 80) history.current.shift();
      future.current = [];
    }
    const next = { ...fn(previous), updated: Date.now() };
    next.layers = [
      ...next.layers.filter((l) => l.kind === "background"),
      ...next.layers.filter((l) => l.kind !== "background"),
    ];
    live.current = next;
    setProject(next);
    setStatus("Unsaved changes");
  };
  const patchLayer = (id: string, patch: Partial<Layer>, remember = true) =>
    update(
      (p) => ({
        ...p,
        layers: p.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
      }),
      remember,
    );
  const settings = (patch: Settings) => {
    if (selectedLayer)
      patchLayer(selectedLayer.id, {
        settings: { ...selectedLayer.settings, ...patch },
      });
  };
  const pause = useCallback(() => {
    playingRef.current = false;
    audioNode.current?.stop();
    audioNode.current = null;
    media.current.videos.forEach((v) => v.pause());
    setPlaying(false);
  }, []);
  const persist = useCallback(async (p: Project) => {
    const thumbnail = canvas.current?.toDataURL("image/jpeg", 0.5);
    const saved = { ...p, thumbnail };
    saveQueue.current = saveQueue.current
      .catch(() => {})
      .then(async () => {
        await saveProject(saved);
        await setActive(saved.id);
      });
    await saveQueue.current;
    if (live.current === p) setStatus("Saved locally");
  }, []);
  const safely = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const id = await getActive();
        const stored = id ? await getProject(id) : undefined;
        if (active)
          setProject(stored?.version === 2 ? stored : freshProject(uid()));
      } catch (e) {
        if (active) {
          setProject(freshProject(uid()));
          setNotice(`Local storage: ${String(e)}`);
        }
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "fa" ? "rtl" : "ltr";
  }, [lang]);
  useEffect(() => {
    if (!canvasIsPreset)
      setCustomCanvas({
        width: String(project.width),
        height: String(project.height),
      });
  }, [canvasIsPreset, project.width, project.height]);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      setStatus("Saving…");
      persist(project).catch((e) => {
        setStatus("Unsaved changes");
        setNotice(`Save failed: ${String(e)}`);
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [project, ready, persist]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (status !== "Saved locally") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [status]);
  const assetIds = project.layers
    .map((l) => l.asset)
    .filter(Boolean)
    .join("|");
  useEffect(() => {
    let stopped = false;
    const ids = new Set(assetIds.split("|").filter(Boolean));
    Promise.all([...ids].map((id) => media.current.load(id)))
      .then(() => {
        if (!stopped) media.current.retain(ids);
      })
      .catch((e) => {
        if (!stopped) setNotice(String(e));
      });
    return () => {
      stopped = true;
    };
  }, [assetIds]);
  useEffect(() => {
    const fonts = project.layers
      .filter((l) => l.kind === "text")
      .map((l) => String(l.settings.font));
    loadFonts(fonts).catch((e) => setNotice(String(e)));
  }, [
    project.layers
      .filter((l) => l.kind === "text")
      .map((l) => l.settings.font)
      .join("|"),
  ]);
  useEffect(() => {
    const generation = ++loadGeneration.current;
    pause();
    setAnalysis(undefined);
    if (!project.audio) return;
    setLoading("Analyzing music…");
    (async () => {
      let ctx: AudioContext | undefined;
      try {
        const asset = await getAsset(project.audio!);
        if (!asset) throw Error("Saved audio is missing");
        ctx = new AudioContext();
        const buffer = await ctx.decodeAudioData(
          await asset.blob.arrayBuffer(),
        );
        await ctx.close();
        ctx = undefined;
        const a = new AudioAnalysis(buffer);
        await a.prepare();
        if (generation === loadGeneration.current) setAnalysis(a);
      } catch (e) {
        if (generation === loadGeneration.current) setNotice(String(e));
      } finally {
        await ctx?.close();
        if (generation === loadGeneration.current) setLoading("");
      }
    })();
  }, [project.audio, pause]);
  useEffect(() => {
    let frame = 0;
    let lastUI = 0;
    scratch.current = document.createElement("canvas");
    const draw = (now: number) => {
      const p = live.current;
      let current = clock.current;
      if (playingRef.current && audioContext.current) {
        current =
          audioOffset.current +
          audioContext.current.currentTime -
          audioStart.current;
        if (current >= p.end - p.start) {
          if (p.loop) {
            startPlayback(0);
            current = 0;
          } else {
            pause();
            current = p.end - p.start;
          }
        }
        clock.current = current;
        if (now - lastUI > 80) {
          lastUI = now;
          setTime(current);
        }
      }
      if (playingRef.current)
        for (const l of p.layers) {
          const video = l.asset ? media.current.videos.get(l.asset) : undefined;
          if (video && !video.seeking) {
            video.loop = l.settings.videoLoop !== false;
            const expected = videoTime(l, current, media.current);
            if (Math.abs(video.currentTime - expected) > 0.2)
              video.currentTime = expected;
            if (video.paused && (video.loop || !video.ended))
              video.play().catch(() => {});
          }
        }
      if (canvas.current && surface.current) {
        const width = Math.min(
          p.width,
          Math.max(
            1,
            Math.round(surface.current.clientWidth * devicePixelRatio),
          ),
        );
        const height = Math.round((width * p.height) / p.width);
        if (
          canvas.current.width !== width ||
          canvas.current.height !== height
        ) {
          canvas.current.width = width;
          canvas.current.height = height;
        }
        try {
          renderScene(
            canvas.current,
            p,
            media.current,
            current,
            analysisRef.current,
            scratch.current!,
          );
        } catch (e) {
          setNotice(`Preview: ${String(e)}`);
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [pause]);
  useEffect(
    () => () => {
      pause();
      media.current.dispose();
      audioContext.current?.close();
    },
    [pause],
  );
  const startPlayback = async (offset: number) => {
    const a = analysisRef.current;
    if (!a) return;
    audioNode.current?.stop();
    audioNode.current = null;
    if (!audioContext.current) audioContext.current = new AudioContext();
    await audioContext.current.resume();
    const ctx = audioContext.current;
    const node = ctx.createBufferSource();
    node.buffer = a.buffer;
    node.connect(ctx.destination);
    const p = live.current;
    offset = clamp(offset, 0, Math.max(0, p.end - p.start - 0.01));
    node.start(
      0,
      p.start + offset,
      Math.min(p.end - p.start - offset, a.buffer.duration - p.start - offset),
    );
    audioNode.current = node;
    audioStart.current = ctx.currentTime;
    audioOffset.current = offset;
    clock.current = offset;
    playingRef.current = true;
    setPlaying(true);
    for (const l of p.layers) {
      if (l.asset && media.current.videos.has(l.asset)) {
        await media.current.seek(l.asset, videoTime(l, offset, media.current));
        media.current.videos
          .get(l.asset)!
          .play()
          .catch((e) => setNotice(String(e)));
      }
    }
  };
  const seek = (value: number) => {
    clock.current = value;
    setTime(value);
    if (playingRef.current) safely(() => startPlayback(value));
    else
      live.current.layers.forEach((l) => {
        if (l.asset)
          safely(() =>
            media.current.seek(l.asset!, videoTime(l, value, media.current)),
          );
      });
  };
  const add = (kind: Kind, patch: Partial<Layer> = {}) => {
    const item = { ...layer(kind, uid()), ...patch };
    update((p) => ({
      ...p,
      layers: kind === "background" ? [item, ...p.layers] : [...p.layers, item],
    }));
    setSelected([item.id]);
    setInspectorTab("Layer");
    return item;
  };
  const importFile = async (
    file: File,
    kind: "audio" | "cover" | "image" | "background" | "video",
  ) => {
    setLoading("Importing media…");
    try {
      const id = uid();
      await putAsset({ id, name: file.name, type: file.type, blob: file });
      if (kind === "audio") {
        const ctx = new AudioContext();
        try {
          const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
          pause();
          setTime(0);
          update((p) => ({
            ...p,
            audio: id,
            audioName: file.name,
            audioDuration: decoded.duration,
            start: 0,
            end: decoded.duration,
          }));
        } finally {
          await ctx.close();
        }
      } else {
        await media.current.load(id);
        if (kind === "background" || kind === "video") {
          const bg = live.current.layers.find((l) => l.kind === "background");
          if (bg) {
            patchLayer(bg.id, { asset: id });
            setSelected([bg.id]);
          } else add("background", { asset: id });
        } else {
          const img = media.current.images.get(id)!;
          const w = kind === "cover" ? 35 : 25;
          const h =
            (((w * live.current.width) / live.current.height) *
              img.naturalHeight) /
            img.naturalWidth;
          add("image", {
            name: kind === "cover" ? "Cover art" : file.name,
            asset: id,
            w: w * Math.min(1, 80 / h),
            h: Math.min(80, h),
            y: kind === "cover" ? 34 : 50,
          });
        }
      }
    } catch (e) {
      setNotice(`Import failed: ${String(e)}`);
    } finally {
      setLoading("");
    }
  };
  const remove = () => {
    update((p) => ({
      ...p,
      layers: p.layers.filter((l) => !selected.includes(l.id) || l.locked),
    }));
    setSelected([]);
  };
  const duplicate = () => {
    const copies = project.layers
      .filter((l) => selected.includes(l.id))
      .map((l) => ({
        ...structuredClone(l),
        id: uid(),
        name: l.name + " copy",
        x: l.x + 2,
        y: l.y + 2,
      }));
    update((p) => ({ ...p, layers: [...p.layers, ...copies] }));
    setSelected(copies.map((l) => l.id));
  };
  const order = (where: string) => {
    if (!selectedLayer) return;
    update((p) => {
      const next = [...p.layers];
      const i = next.findIndex((l) => l.id === selectedLayer.id);
      const [entry] = next.splice(i, 1);
      const firstNonBackground = next.findIndex((l) => l.kind !== "background");
      const floor =
        entry.kind === "background" ? 0 : Math.max(0, firstNonBackground);
      let at =
        where === "front"
          ? next.length
          : where === "back"
            ? floor
            : where === "up"
              ? Math.min(next.length, i + 1)
              : Math.max(floor, i - 1);
      if (entry.kind === "background") at = 0;
      next.splice(at, 0, entry);
      return { ...p, layers: next };
    });
  };
  const align = (direction: string) => {
    update((p) => {
      const chosen = p.layers.filter(
        (l) => selected.includes(l.id) && !l.locked,
      );
      const bounds =
        chosen.length > 1
          ? {
              left: Math.min(...chosen.map((l) => l.x - l.w / 2)),
              right: Math.max(...chosen.map((l) => l.x + l.w / 2)),
              top: Math.min(...chosen.map((l) => l.y - l.h / 2)),
              bottom: Math.max(...chosen.map((l) => l.y + l.h / 2)),
            }
          : { left: 0, right: 100, top: 0, bottom: 100 };
      return {
        ...p,
        layers: p.layers.map((l) =>
          !selected.includes(l.id) || l.locked
            ? l
            : {
                ...l,
                ...(direction === "left"
                  ? { x: bounds.left + l.w / 2 }
                  : direction === "right"
                    ? { x: bounds.right - l.w / 2 }
                    : direction === "top"
                      ? { y: bounds.top + l.h / 2 }
                      : direction === "bottom"
                        ? { y: bounds.bottom - l.h / 2 }
                        : direction === "centerX"
                          ? { x: (bounds.left + bounds.right) / 2 }
                          : { y: (bounds.top + bounds.bottom) / 2 }),
              },
        ),
      };
    });
  };
  const undo = () => {
    const prev = history.current.pop();
    if (prev) {
      future.current.push(live.current);
      setProject(prev);
      setStatus("Unsaved changes");
    }
  };
  const redo = () => {
    const next = future.current.pop();
    if (next) {
      history.current.push(live.current);
      setProject(next);
      setStatus("Unsaved changes");
    }
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        document.querySelector("dialog[open]")
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        safely(() => persist(live.current));
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        remove();
      }
      if (e.code === "Space") {
        e.preventDefault();
        playingRef.current
          ? pause()
          : safely(() => startPlayback(clock.current));
      }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        const delta = e.shiftKey ? 1 : 0.1;
        update((p) => ({
          ...p,
          layers: p.layers.map((l) =>
            selected.includes(l.id) && !l.locked
              ? {
                  ...l,
                  x:
                    l.x +
                    (e.key === "ArrowLeft"
                      ? -delta
                      : e.key === "ArrowRight"
                        ? delta
                        : 0),
                  y:
                    l.y +
                    (e.key === "ArrowUp"
                      ? -delta
                      : e.key === "ArrowDown"
                        ? delta
                        : 0),
                }
              : l,
          ),
        }));
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [selected, project, persist, pause]);
  const begin = (
    e: ReactPointerEvent,
    id: string,
    mode: Drag["mode"],
    corner = 0,
  ) => {
    if (showExport) return;
    const l = project.layers.find((l) => l.id === id);
    if (!l) return;
    e.stopPropagation();
    if (e.shiftKey && mode === "move") {
      setSelected((ids) =>
        ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
      );
      return;
    }
    setSelected([id]);
    setInspectorTab("Layer");
    if (l.locked) return;
    history.current.push(project);
    future.current = [];
    drag.current = {
      mode,
      initial: structuredClone(l),
      snapshot: project,
      px: e.clientX,
      py: e.clientY,
      bounds: surface.current!.getBoundingClientRect(),
      corner,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const l = d.initial;
    let patch: Partial<Layer> = {};
    if (d.mode === "move")
      patch = {
        x: l.x + ((e.clientX - d.px) / d.bounds.width) * 100,
        y: l.y + ((e.clientY - d.py) / d.bounds.height) * 100,
      };
    else if (d.mode === "rotate") {
      const cx = d.bounds.left + (d.bounds.width * l.x) / 100,
        cy = d.bounds.top + (d.bounds.height * l.y) / 100;
      const angle =
        ((Math.atan2(e.clientY - cy, e.clientX - cx) -
          Math.atan2(d.py - cy, d.px - cx)) *
          180) /
        Math.PI;
      patch = {
        rotation: e.shiftKey
          ? Math.round((l.rotation + angle) / 15) * 15
          : l.rotation + angle,
      };
    } else {
      const dx = ((e.clientX - d.px) / d.bounds.width) * project.width,
        dy = ((e.clientY - d.py) / d.bounds.height) * project.height,
        a = (-l.rotation * Math.PI) / 180,
        lx = dx * Math.cos(a) - dy * Math.sin(a),
        ly = dx * Math.sin(a) + dy * Math.cos(a);
      const sx = d.corner === 0 || d.corner === 3 ? -1 : 1,
        sy = d.corner < 2 ? -1 : 1;
      const nw = Math.max(1, l.w + ((2 * lx) / project.width) * 100 * sx),
        nh = Math.max(1, l.h + ((2 * ly) / project.height) * 100 * sy);
      if (e.altKey) patch = { w: nw, h: nh };
      else {
        const factor = Math.max(
          0.05,
          Math.abs(nw - l.w) > Math.abs(nh - l.h) ? nw / l.w : nh / l.h,
        );
        patch = { w: l.w * factor, h: l.h * factor };
      }
    }
    if (d.mode === "scale" && l.kind === "text" && patch.w)
      patch.settings = {
        ...l.settings,
        size: (Number(l.settings.size) * patch.w) / l.w,
      };
    patchLayer(l.id, patch, false);
  };
  const finish = () => {
    drag.current = null;
  };
  const openLibrary = () =>
    safely(async () => {
      await persist(live.current);
      setProjects((await allProjects()).sort((a, b) => b.updated - a.updated));
      setShowProjects(true);
    });
  const openProject = async (p: Project) => {
    await persist(live.current);
    pause();
    setProject(p);
    setSelected([]);
    setTime(0);
    history.current = [];
    future.current = [];
    setShowProjects(false);
    await setActive(p.id);
  };
  const newProject = async () => {
    await persist(live.current);
    pause();
    const p = freshProject(uid());
    setProject(p);
    setTime(0);
    setSelected(["title"]);
    history.current = [];
    future.current = [];
    setShowProjects(false);
  };
  const template = (index: number) => {
    const v = presets[index];
    const radial = index === 1 || index === 3;
    update((p) => ({
      ...p,
      layers: p.layers.map((l) =>
        l.kind === "background"
          ? {
              ...l,
              settings: {
                ...l.settings,
                color: v.bg,
                color2: v.bg2,
                mode: "Gradient",
              },
            }
          : l.kind === "spectrum"
            ? {
                ...l,
                x: 50,
                y: radial ? 44 : index >= 4 ? 50 : 65,
                w: radial ? 60 : 82,
                h: radial ? 65 : index >= 4 ? 52 : 23,
                rotation: 0,
                settings: {
                  ...l.settings,
                  style: v.spectrum,
                  color: v.color,
                  glow: index === 2 ? 12 : 0,
                },
              }
            : l,
      ),
      effects: { ...p.effects, style: "None" },
    }));
    setTab("Layers");
  };
  const changeCanvas = (width: number, height: number) => {
    update((p) => resizeProjectCanvas(p, width, height));
  };
  const logoRow = () => {
    const list = Object.keys(logos)
      .slice(0, 5)
      .map((name, i) => {
        const l = layer("logo", uid());
        return {
          ...l,
          name,
          w: 4,
          h: (4 * project.width) / project.height,
          x: 34 + i * 8,
          y: 95,
          settings: { ...l.settings, platform: name },
        };
      });
    update((p) => ({ ...p, layers: [...p.layers, ...list] }));
    setSelected(list.map((l) => l.id));
  };
  if (!ready)
    return (
      <main className="studio-loading">
        VAGE / STUDIO <span>Opening your workspace…</span>
      </main>
    );
  return (
    <main className="studio-app" dir={lang === "fa" ? "rtl" : "ltr"}>
      <header className="studio-top">
        <a className="studio-brand" href="/" aria-label="Vage Studio">
          <b>V</b>
          <span>
            VAGE <small>STUDIO</small>
          </span>
        </a>
        <div className="session-name">
          <input
            aria-label="Project name"
            value={project.name}
            onChange={(e) => update((p) => ({ ...p, name: e.target.value }))}
          />
          <small className={status === "Saved locally" ? "saved" : ""}>
            ● {t(status)}
          </small>
        </div>
        <div className="top-tools">
          <button title={t("Undo")} aria-label="Undo" onClick={undo}>
            ↶
          </button>
          <button title={t("Redo")} aria-label="Redo" onClick={redo}>
            ↷
          </button>
          <button onClick={openLibrary}>{t("Projects")}</button>
          <button onClick={() => safely(() => persist(project))}>
            {t("Save")}
          </button>
          <button
            aria-label="Switch language"
            onClick={() => setLang(lang === "en" ? "fa" : "en")}
          >
            {lang === "en" ? "فارسی" : "EN"}
          </button>
          <button
            className="primary-button"
            onClick={() => {
              pause();
              setShowExport(true);
            }}
          >
            {t("Export")} ↗
          </button>
        </div>
      </header>
      {notice && (
        <div className="notice" role="alert">
          <span>{notice}</span>
          <button aria-label="Dismiss message" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}
      <div className="studio-workspace">
        <aside className="library-panel">
          <div className="library-tabs">
            {["Layers", "Media", "Templates"].map((name) => (
              <button
                key={name}
                className={tab === name ? "active" : ""}
                onClick={() => setTab(name)}
              >
                {t(name)}
              </button>
            ))}
          </div>
          {tab === "Layers" && (
            <>
              <div className="panel-heading">
                <h2>{t("Layers")}</h2>
                <span>{project.layers.length.toString().padStart(2, "0")}</span>
              </div>
              <div className="layer-stack">
                {[...project.layers].reverse().map((l) => (
                  <div
                    key={l.id}
                    className={`layer-row ${selected.includes(l.id) ? "selected" : ""}`}
                  >
                    <button
                      className="layer-select"
                      aria-label={`Select ${l.name}`}
                      onClick={(e) => {
                        setSelected((ids) =>
                          e.shiftKey ? [...new Set([...ids, l.id])] : [l.id],
                        );
                        setInspectorTab("Layer");
                      }}
                    >
                      <i>{icons[l.kind]}</i>
                      <span>
                        {l.name}
                        <small>{l.kind}</small>
                      </span>
                    </button>
                    <button
                      aria-label={`Toggle ${l.name} visibility`}
                      title={t("Visible")}
                      onClick={() => patchLayer(l.id, { visible: !l.visible })}
                    >
                      {l.visible ? "◉" : "○"}
                    </button>
                    <button
                      aria-label={`Lock ${l.name}`}
                      title={t("Locked")}
                      onClick={() => patchLayer(l.id, { locked: !l.locked })}
                    >
                      {l.locked ? "▣" : "▫"}
                    </button>
                  </div>
                ))}
              </div>
              <div className="add-layer-grid">
                {(
                  ["text", "spectrum", "particles", "background"] as Kind[]
                ).map((k) => (
                  <button key={k} onClick={() => add(k)}>
                    {icons[k]} {t("Add " + k)}
                  </button>
                ))}
              </div>
              <div className="library-note">
                <b>{t("Select all")}</b>
                <p>
                  {lang === "fa"
                    ? "با Shift چند لایه انتخاب کن. از کلیدهای جهت برای حرکت دقیق استفاده کن."
                    : "Shift-click to select multiple layers. Arrow keys nudge; Shift moves faster."}
                </p>
              </div>
            </>
          )}
          {tab === "Media" && (
            <>
              <div className="panel-heading">
                <h2>{t("Media")}</h2>
                <span>LOCAL</span>
              </div>
              <div className="upload-grid">
                {(
                  [
                    ["audio", "Add music", "audio/*"],
                    ["cover", "Import cover", "image/*"],
                    ["image", "Import image", "image/*"],
                    ["background", "Background image", "image/*"],
                    ["video", "Background video", "video/*"],
                  ] as const
                ).map(([kind, label, accept]) => (
                  <label key={kind} className="upload-tile">
                    <span>＋</span>
                    {t(label)}
                    <input
                      aria-label={label}
                      type="file"
                      accept={accept}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) safely(() => importFile(file, kind));
                        e.target.value = "";
                      }}
                    />
                  </label>
                ))}
              </div>
              <h3>{t("Platform logos")}</h3>
              <div className="logo-library">
                {Object.entries(logos).map(([name, icon]) => (
                  <button
                    key={name}
                    title={name}
                    aria-label={`Add ${name} logo`}
                    onClick={() => {
                      const l = layer("logo", uid());
                      add("logo", {
                        name,
                        w: 6,
                        h: (6 * project.width) / project.height,
                        settings: { ...l.settings, platform: name },
                      });
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill={"#" + icon.hex}>
                      <path d={icon.path} />
                    </svg>
                    <small>{name}</small>
                  </button>
                ))}
              </div>
              <button className="wide-button" onClick={logoRow}>
                {t("Add 5-logo row")}
              </button>
            </>
          )}
          {tab === "Templates" && (
            <>
              <div className="panel-heading">
                <h2>{t("Templates")}</h2>
                <span>06</span>
              </div>
              <p className="hint">
                {lang === "fa"
                  ? "سبک دلخواهت را انتخاب کن؛ همهٔ اجزا قابل ویرایش‌اند."
                  : "A starting point for your next release. Every detail is yours to change."}
              </p>
              <div className="template-list">
                {presets.map((v, i) => (
                  <button
                    key={v.name}
                    className="template-card"
                    onClick={() => template(i)}
                  >
                    <div
                      style={{
                        background: `linear-gradient(135deg,${v.bg},${v.bg2})`,
                        color: v.color,
                      }}
                    >
                      <span
                        className={i % 2 ? "template-ring" : "template-wave"}
                      >
                        ╱╲╱╲╱╲
                      </span>
                      <b>{v.name}</b>
                    </div>
                    <small>{v.spectrum} ↗</small>
                  </button>
                ))}
              </div>
            </>
          )}
        </aside>
        <section className="center-panel">
          <div className="stage-toolbar">
            <div>
              <span className="eyebrow">{t("Canvas")}</span>
              <select
                aria-label="Canvas format"
                value={
                  canvasIsPreset
                    ? `${project.width}x${project.height}`
                    : "custom"
                }
                onChange={(e) => {
                  if (e.target.value === "custom") {
                    // Enter custom mode with a useful editable starting size.
                    setCustomCanvas({ width: "1280", height: "720" });
                    changeCanvas(1280, 720);
                    return;
                  }
                  const [w, h] = e.target.value.split("x").map(Number);
                  changeCanvas(w, h);
                }}
              >
                <option value="1920x1080">YouTube · 16:9</option>
                <option value="1080x1920">Reel / Story · 9:16</option>
                <option value="1080x1080">Square · 1:1</option>
                <option value="custom">Custom canvas…</option>
              </select>
              {!canvasIsPreset && (
                <div
                  className="custom-canvas-fields"
                  aria-label="Custom canvas size"
                >
                  <label>
                    W
                    <input
                      aria-label="Canvas width"
                      type="number"
                      min={64}
                      max={3840}
                      step={2}
                      value={customCanvas.width}
                      onChange={(e) =>
                        setCustomCanvas((v) => ({
                          ...v,
                          width: e.target.value,
                        }))
                      }
                      onBlur={() => {
                        const width = Number(customCanvas.width);
                        if (Number.isFinite(width))
                          changeCanvas(width, project.height);
                      }}
                    />
                  </label>
                  <span>×</span>
                  <label>
                    H
                    <input
                      aria-label="Canvas height"
                      type="number"
                      min={64}
                      max={3840}
                      step={2}
                      value={customCanvas.height}
                      onChange={(e) =>
                        setCustomCanvas((v) => ({
                          ...v,
                          height: e.target.value,
                        }))
                      }
                      onBlur={() => {
                        const height = Number(customCanvas.height);
                        if (Number.isFinite(height))
                          changeCanvas(project.width, height);
                      }}
                    />
                  </label>
                </div>
              )}
            </div>
            <div className="zoom-tools">
              <button
                aria-label="Zoom out"
                onClick={() => setZoom((z) => Math.max(0.25, z - 0.1))}
              >
                −
              </button>
              <button onClick={() => setZoom(1)}>
                {Math.round(zoom * 100)}% · {t("Fit")}
              </button>
              <button
                aria-label="Zoom in"
                onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
              >
                +
              </button>
            </div>
          </div>
          <div className="stage-scroll">
            <div
              className="stage-frame"
              style={{
                aspectRatio: `${project.width}/${project.height}`,
                width: `min(${project.width / project.height < 1 ? "42" : "92"}%, ${project.width / project.height < 1 ? "360" : "1080"}px)`,
                transform: `scale(${zoom})`,
              }}
              ref={surface}
              onPointerMove={move}
              onPointerUp={finish}
              onPointerCancel={finish}
              onLostPointerCapture={finish}
            >
              <canvas
                ref={canvas}
                aria-label="Project preview"
                onPointerDown={() => setSelected([])}
              />
              <div className="selection-overlay">
                {project.layers
                  .filter((l) => l.visible)
                  .map((l) => (
                    <div
                      key={l.id}
                      data-layer-id={l.id}
                      className={`layer-hit ${selected.includes(l.id) ? "is-selected" : ""}`}
                      aria-label={l.name}
                      style={{
                        left: `${l.x}%`,
                        top: `${l.y}%`,
                        width: `${l.w}%`,
                        height: `${l.h}%`,
                        transform: `translate(-50%,-50%) rotate(${l.rotation}deg)`,
                        pointerEvents:
                          l.kind === "background" || l.kind === "particles"
                            ? selected.includes(l.id)
                              ? "auto"
                              : "none"
                            : "auto",
                      }}
                      onPointerDown={(e) => begin(e, l.id, "move")}
                    >
                      {selected.includes(l.id) && !l.locked && (
                        <>
                          <span className="selection-label">{l.name}</span>
                          {[0, 1, 2, 3].map((c) => (
                            <button
                              key={c}
                              aria-label={`Resize ${l.name} corner ${c}`}
                              className={`resize-handle corner-${c}`}
                              onPointerDown={(e) => begin(e, l.id, "scale", c)}
                            />
                          ))}
                          <button
                            className="rotation-handle"
                            aria-label={`Rotate ${l.name}`}
                            onPointerDown={(e) => begin(e, l.id, "rotate")}
                          >
                            ↻
                          </button>
                        </>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          </div>
          <div className="stage-caption">
            <span>
              {project.width} × {project.height}
            </span>
            <span>{t("Import music to bring your spectrum to life.")}</span>
            <span>VAGE / STUDIO</span>
          </div>
          <section className="timeline-bar">
            <div className="playback-row">
              <button
                className="play-button"
                aria-label={playing ? "Pause" : "Play"}
                disabled={!analysis || !!loading}
                onClick={() =>
                  playing ? pause() : safely(() => startPlayback(time))
                }
              >
                {playing ? "Ⅱ" : "▶"}
              </button>
              <span className="time-readout">
                {timeLabel(time)}{" "}
                <small>/ {timeLabel(project.end - project.start)}</small>
              </span>
              <span className="track-name">
                ♫ {project.audioName || t("No music imported")}
              </span>
              <label className="loop-check">
                <input
                  type="checkbox"
                  checked={project.loop}
                  onChange={(e) =>
                    update((p) => ({ ...p, loop: e.target.checked }))
                  }
                />
                {t("Loop preview")}
              </label>
            </div>
            <div className="wave-timeline">
              <svg
                viewBox="0 0 600 36"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {Array.from({ length: 150 }, (_, i) => {
                  const e =
                    analysis?.at(
                      project.start + (i / 150) * (project.end - project.start),
                    ).energy || 0;
                  return (
                    <rect
                      key={i}
                      x={i * 4}
                      y={18 - Math.max(1, e * 50)}
                      width={2}
                      height={Math.max(2, e * 100)}
                      rx={1}
                    />
                  );
                })}
              </svg>
              <input
                aria-label="Timeline position"
                type="range"
                min={0}
                max={project.end - project.start}
                step={0.01}
                value={time}
                onChange={(e) => seek(+e.target.value)}
              />
              <div
                className="playhead"
                style={{
                  left: `${(time / (project.end - project.start)) * 100}%`,
                }}
              />
            </div>
            <div className="trim-row">
              <label>
                {t("Start")}
                <input
                  aria-label="Music start"
                  type="number"
                  min={0}
                  max={Math.max(0, project.end - 0.1)}
                  step={0.1}
                  value={project.start}
                  onChange={(e) => {
                    pause();
                    setTime(0);
                    update((p) => ({
                      ...p,
                      start: clamp(+e.target.value, 0, p.end - 0.1),
                    }));
                  }}
                />
              </label>
              <label>
                {t("End")}
                <input
                  aria-label="Music end"
                  type="number"
                  min={project.start + 0.1}
                  step={0.1}
                  value={project.end}
                  onChange={(e) => {
                    pause();
                    setTime(0);
                    update((p) => ({
                      ...p,
                      end: clamp(
                        +e.target.value,
                        p.start + 0.1,
                        p.audioDuration || 600,
                      ),
                    }));
                  }}
                />
              </label>
              <button
                disabled={!analysis}
                onClick={() => {
                  pause();
                  setTime(0);
                  update((p) => ({ ...p, start: 0, end: p.audioDuration }));
                }}
              >
                {t("Full music")}
              </button>
              <small>{project.export.fps} FPS</small>
            </div>
          </section>
        </section>
        <aside className="properties-panel">
          <div className="library-tabs">
            <button
              className={inspectorTab === "Layer" ? "active" : ""}
              onClick={() => setInspectorTab("Layer")}
            >
              {t("Inspector")}
            </button>
            <button
              className={inspectorTab === "Effects" ? "active" : ""}
              onClick={() => setInspectorTab("Effects")}
            >
              {t("Effects")}
            </button>
          </div>
          {inspectorTab === "Effects" ? (
            <section className="settings-card">
              <h3>{t("Effects")}</h3>
              {project.effects.style === "Strobe" && (
                <p className="hint" role="note">
                  {lang === "fa"
                    ? "این افکت شامل نور چشمک‌زن است. با احتیاط استفاده کن."
                    : "Flashing-light effect. Use cautiously for photosensitive audiences."}
                </p>
              )}
              <SettingsFields
                specs={effectsSpecs}
                settings={project.effects}
                onChange={(s) =>
                  update((p) => ({ ...p, effects: { ...p.effects, ...s } }))
                }
                t={t}
              />
            </section>
          ) : selectedLayer ? (
            <>
              <div className="selected-heading">
                <span>{icons[selectedLayer.kind]}</span>
                <div>
                  <small>{t("Selected layer")}</small>
                  <input
                    aria-label="Layer name"
                    value={selectedLayer.name}
                    onChange={(e) =>
                      patchLayer(selectedLayer.id, { name: e.target.value })
                    }
                  />
                </div>
              </div>
              <LayerSettings value={selectedLayer} onChange={settings} t={t} />
              {selectedLayer.asset && (
                <button
                  className="wide-button"
                  onClick={() =>
                    patchLayer(selectedLayer.id, { asset: undefined })
                  }
                >
                  {lang === "fa" ? "حذف رسانهٔ این لایه" : "Clear layer media"}
                </button>
              )}
              <section className="settings-card">
                <h3>{t("Transform")}</h3>
                <div className="field-grid">
                  {(["x", "y", "w", "h", "rotation"] as const).map((key) => (
                    <label className="field" key={key}>
                      <span>
                        {t(
                          {
                            x: "X (%)",
                            y: "Y (%)",
                            w: "Width",
                            h: "Height",
                            rotation: "Rotation",
                          }[key],
                        )}
                      </span>
                      <input
                        aria-label={`Layer ${key}`}
                        type="number"
                        step={0.1}
                        value={Math.round(selectedLayer[key] * 100) / 100}
                        onChange={(e) =>
                          patchLayer(selectedLayer.id, {
                            [key]:
                              key === "w" || key === "h"
                                ? clamp(+e.target.value, 0.1, 400)
                                : +e.target.value,
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
                <Control
                  spec={{
                    key: "opacity",
                    label: "Opacity",
                    min: 0,
                    max: 1,
                    step: 0.01,
                  }}
                  value={selectedLayer.opacity}
                  onChange={(v) =>
                    patchLayer(selectedLayer.id, { opacity: Number(v) })
                  }
                  t={t}
                />
                <button
                  onClick={() => {
                    const d = layer(selectedLayer.kind, selectedLayer.id);
                    patchLayer(selectedLayer.id, {
                      x: 50,
                      y: 50,
                      w: d.w,
                      h: d.h,
                      rotation: 0,
                      opacity: 1,
                    });
                  }}
                >
                  {t("Reset transform")}
                </button>
              </section>
              <section className="settings-card">
                <h3>
                  {t("Alignment")}{" "}
                  {selected.length > 1 && `(${selected.length})`}
                </h3>
                <div className="button-grid">
                  {[
                    ["left", "Left"],
                    ["centerX", "Center X"],
                    ["right", "Right"],
                    ["top", "Top"],
                    ["centerY", "Center Y"],
                    ["bottom", "Bottom"],
                  ].map(([key, label]) => (
                    <button key={key} onClick={() => align(key)}>
                      {t(label)}
                    </button>
                  ))}
                </div>
                <div className="button-grid">
                  {[
                    ["up", "Forward"],
                    ["down", "Backward"],
                    ["front", "To front"],
                    ["back", "To back"],
                  ].map(([key, label]) => (
                    <button key={key} onClick={() => order(key)}>
                      {t(label)}
                    </button>
                  ))}
                </div>
              </section>
              <div className="layer-actions">
                <button onClick={duplicate}>{t("Duplicate")}</button>
                <button
                  className="danger-button"
                  disabled={selectedLayer.locked}
                  onClick={remove}
                >
                  {t("Delete")}
                </button>
              </div>
            </>
          ) : (
            <div className="inspector-empty">
              <span>⌖</span>
              <h3>{t("Inspector")}</h3>
              <p>{t("Select a layer to edit its properties.")}</p>
            </div>
          )}
        </aside>
      </div>
      {loading && (
        <div className="loading-toast" role="status">
          ◌ {loading}
        </div>
      )}
      {showProjects && (
        <ProjectLibrary
          projects={projects}
          current={project.id}
          t={t}
          onClose={() => setShowProjects(false)}
          onOpen={(p) => safely(() => openProject(p))}
          onNew={() => safely(newProject)}
          onDelete={(p) =>
            safely(async () => {
              if (!window.confirm(`Delete “${p.name}”?`)) return;
              await deleteProject(p.id);
              setProjects(await allProjects());
            })
          }
          onRename={(p) =>
            safely(async () => {
              const name = window.prompt(t("Name"), p.name);
              if (!name?.trim()) return;
              const next = { ...p, name: name.trim(), updated: Date.now() };
              await saveProject(next);
              if (p.id === project.id) setProject(next);
              setProjects(await allProjects());
            })
          }
          onDuplicate={(p) =>
            safely(async () => {
              await saveProject({
                ...structuredClone(p),
                id: uid(),
                name: p.name + " copy",
                updated: Date.now(),
              });
              setProjects(await allProjects());
            })
          }
        />
      )}
      {showExport && (
        <ExportDialog
          project={project}
          analysis={analysis}
          onClose={() => setShowExport(false)}
          onSettings={(s) => update((p) => ({ ...p, export: s }))}
          t={t}
        />
      )}
    </main>
  );
}
function ProjectLibrary({
  projects,
  current,
  t,
  onClose,
  onOpen,
  onNew,
  onDelete,
  onRename,
  onDuplicate,
}: {
  projects: Project[];
  current: string;
  t: (s: string) => string;
  onClose: () => void;
  onOpen: (p: Project) => void;
  onNew: () => void;
  onDelete: (p: Project) => void;
  onRename: (p: Project) => void;
  onDuplicate: (p: Project) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="studio-dialog projects-dialog"
      onCancel={onClose}
    >
      <div className="dialog-heading">
        <h2>{t("Project library")}</h2>
        <button aria-label="Close projects" onClick={onClose}>
          ×
        </button>
      </div>
      <p className="hint">
        {t("Your composition, rendered locally. Media stays on this device.")}
      </p>
      <button className="primary-button" onClick={onNew}>
        ＋ {t("New project")}
      </button>
      <LegacyBackup />
      <div className="saved-project-grid">
        {projects.map((p) => (
          <article key={p.id} className="saved-project">
            {p.thumbnail && <img src={p.thumbnail} alt={p.name} />}
            <strong>{p.name}</strong>
            <small>
              {new Date(p.updated).toLocaleString()} · {p.layers.length} layers
            </small>
            <div className="button-grid">
              <button onClick={() => onOpen(p)}>{t("Open")}</button>
              <button onClick={() => onRename(p)}>{t("Rename")}</button>
              <button onClick={() => onDuplicate(p)}>{t("Duplicate")}</button>
              <button disabled={p.id === current} onClick={() => onDelete(p)}>
                {t("Delete")}
              </button>
            </div>
          </article>
        ))}
      </div>
      {!projects.length && <p>{t("No saved projects yet.")}</p>}
    </dialog>
  );
}
