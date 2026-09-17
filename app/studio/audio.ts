export type Features = {
  bins: Float32Array;
  wave: Float32Array;
  bass: number;
  mid: number;
  treble: number;
  energy: number;
  travel: number;
};
export const silence = (): Features => ({
  bins: new Float32Array(1024),
  wave: new Float32Array(256),
  bass: 0,
  mid: 0,
  treble: 0,
  energy: 0,
  travel: 0,
});
// Radix-2 FFT with a Hann window. Analysis is shared by preview and export.
export function fft(samples: Float32Array, start: number) {
  const n = 2048,
    re = new Float64Array(n),
    im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let j = 0,
      k = i;
    for (let b = 0; b < 11; b++) {
      j = (j << 1) | (k & 1);
      k >>= 1;
    }
    re[j] =
      (samples[start + i] || 0) *
      (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  for (let size = 2; size <= n; size *= 2) {
    const half = size / 2;
    for (let j = 0; j < n; j += size)
      for (let k = 0; k < half; k++) {
        const a = (-2 * Math.PI * k) / size,
          c = Math.cos(a),
          s = Math.sin(a),
          x = j + k,
          y = x + half,
          tr = c * re[y] - s * im[y],
          ti = s * re[y] + c * im[y];
        re[y] = re[x] - tr;
        im[y] = im[x] - ti;
        re[x] += tr;
        im[x] += ti;
      }
  }
  return Float32Array.from({ length: n / 2 }, (_, i) =>
    Math.min(1, (Math.hypot(re[i], im[i]) * 8) / n),
  );
}
export class AudioAnalysis {
  frames: Features[] = [];
  rate = 30;
  sampleRate: number;
  constructor(public buffer: AudioBuffer) {
    this.sampleRate = buffer.sampleRate;
  }
  async prepare() {
    const samples = this.buffer.getChannelData(0);
    let travel = 0;
    for (let frame = 0; frame <= this.buffer.duration * this.rate; frame++) {
      const start = Math.floor((frame / this.rate) * this.sampleRate);
      const bins = fft(samples, start);
      const band = (low: number, high: number) => {
        let sum = 0,
          n = 0;
        for (
          let i = Math.ceil((low / this.sampleRate) * 2048);
          i < Math.min(1024, (high / this.sampleRate) * 2048);
          i++
        ) {
          sum += bins[i];
          n++;
        }
        return n ? Math.min(1, (sum / n) * 4) : 0;
      };
      const bass = band(25, 250),
        mid = band(250, 2500),
        treble = band(2500, 16000),
        energy = (bass + mid + treble) / 3;
      travel += energy / this.rate;
      this.frames.push({
        bins,
        wave: Float32Array.from(
          { length: 256 },
          (_, i) => samples[start + i * 4] || 0,
        ),
        bass,
        mid,
        treble,
        energy,
        travel,
      });
      if (frame % 120 === 0) await new Promise((r) => setTimeout(r, 0));
    }
  }
  at(time: number): Features {
    return (
      this.frames[
        Math.max(
          0,
          Math.min(this.frames.length - 1, Math.floor(time * this.rate)),
        )
      ] || silence()
    );
  }
}
