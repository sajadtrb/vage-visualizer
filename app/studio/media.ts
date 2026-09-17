import { getAsset } from "./storage";
export class MediaLibrary {
  images = new Map<string, HTMLImageElement>();
  videos = new Map<string, HTMLVideoElement>();
  urls = new Map<string, string>();
  private pending = new Map<string, Promise<void>>();
  private generation = 0;
  load(id: string): Promise<void> {
    if (this.images.has(id) || this.videos.has(id)) return Promise.resolve();
    const existing = this.pending.get(id);
    if (existing) return existing;
    const generation = this.generation;
    const task = this.decode(id, generation).finally(() => {
      if (generation === this.generation) this.pending.delete(id);
    });
    this.pending.set(id, task);
    return task;
  }
  private async decode(id: string, generation: number) {
    const a = await getAsset(id);
    if (generation !== this.generation) return;
    if (!a) throw new Error("A saved media file is missing. Import it again.");
    const url = URL.createObjectURL(a.blob);
    this.urls.set(id, url);
    if (a.type.startsWith("video")) {
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => finish(new Error("Video loading timed out")),
          15000,
        );
        const finish = (error?: Error) => {
          clearTimeout(timer);
          v.onloadeddata = null;
          v.onerror = null;
          error ? reject(error) : resolve();
        };
        v.onloadeddata = () => finish();
        v.onerror = () => finish(new Error("Unsupported video file"));
        v.src = url;
      });
      // MediaRecorder WebM files may omit a duration. Seek to the end once
      // so the browser indexes it before applying trim/loop calculations.
      if (!Number.isFinite(v.duration))
        await new Promise<void>((resolve) => {
          const finish = () => {
            clearTimeout(timer);
            v.removeEventListener("durationchange", check);
            v.removeEventListener("timeupdate", check);
            resolve();
          };
          const check = () => {
            if (Number.isFinite(v.duration) && v.duration > 0) finish();
          };
          const timer = setTimeout(finish, 3000);
          v.addEventListener("durationchange", check);
          v.addEventListener("timeupdate", check);
          v.currentTime = 1e10;
        });
      if (generation === this.generation) {
        this.videos.set(id, v);
        await this.seek(id, 0);
      } else {
        v.removeAttribute("src");
        v.load();
      }
    } else if (a.type.startsWith("image")) {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (generation === this.generation) this.images.set(id, image);
    }
  }
  async seek(id: string, time: number) {
    const v = this.videos.get(id);
    if (!v || !Number.isFinite(v.duration)) return;
    const t = Math.max(0, Math.min(v.duration - 0.01, time));
    if (Math.abs(v.currentTime - t) < 0.015) return;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Video seeking timed out"));
      }, 10000);
      const cleanup = () => {
        clearTimeout(timeout);
        v.removeEventListener("seeked", done);
        v.removeEventListener("error", fail);
      };
      const done = () => {
        cleanup();
        resolve();
      };
      const fail = () => {
        cleanup();
        reject(new Error("Cannot decode video frame"));
      };
      v.addEventListener("seeked", done);
      v.addEventListener("error", fail);
      v.currentTime = t;
    });
  }
  retain(ids: Set<string>) {
    for (const [id, url] of this.urls) {
      if (ids.has(id) || this.pending.has(id)) continue;
      const v = this.videos.get(id);
      if (v) {
        v.pause();
        v.removeAttribute("src");
        v.load();
      }
      URL.revokeObjectURL(url);
      this.urls.delete(id);
      this.images.delete(id);
      this.videos.delete(id);
    }
  }
  dispose() {
    this.generation++;
    this.videos.forEach((v) => {
      v.pause();
      v.removeAttribute("src");
      v.load();
    });
    this.urls.forEach((u) => URL.revokeObjectURL(u));
    this.images.clear();
    this.videos.clear();
    this.urls.clear();
    this.pending.clear();
  }
}
