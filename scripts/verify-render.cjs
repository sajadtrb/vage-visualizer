const { chromium } = require(
  process.env.PLAYWRIGHT_PATH ||
    "C:/Users/SajadTRB/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const duration = Number(process.env.RENDER_SECONDS || 181),
  fallback = process.env.FALLBACK === "1";
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  page.on("pageerror", (e) => console.error("PAGE ERROR", e));
  const rate = 22050,
    pcm = Buffer.alloc(44 + rate * (duration + 1) * 2);
  pcm.write("RIFF");
  pcm.writeUInt32LE(pcm.length - 8, 4);
  pcm.write("WAVEfmt ", 8);
  pcm.writeUInt32LE(16, 16);
  pcm.writeUInt16LE(1, 20);
  pcm.writeUInt16LE(1, 22);
  pcm.writeUInt32LE(rate, 24);
  pcm.writeUInt32LE(rate * 2, 28);
  pcm.writeUInt16LE(2, 32);
  pcm.writeUInt16LE(16, 34);
  pcm.write("data", 36);
  pcm.writeUInt32LE(pcm.length - 44, 40);
  for (let i = 0; i < rate * (duration + 1); i++)
    pcm.writeInt16LE(
      Math.round(
        Math.sin((i / rate) * Math.PI * 2 * 120) *
          12000 *
          (0.15 + 0.85 * Math.max(0, Math.sin((i / rate) * 8)) ** 4),
      ),
      44 + i * 2,
    );
  const fixture = `artifacts/render-${fallback ? "fallback" : "long"}.wav`;
  fs.writeFileSync(fixture, pcm);
  await page.goto("http://localhost:3000");
  await page.getByRole("button", { name: "Media", exact: true }).click();
  await page
    .getByLabel("Add music", { exact: true })
    .setInputFiles(path.resolve(fixture));
  await page
    .getByLabel("Import cover", { exact: true })
    .setInputFiles(path.resolve("artifacts/cover.png"));
  await page
    .getByLabel("Background video", { exact: true })
    .setInputFiles(path.resolve("artifacts/background.webm"));
  await page.waitForFunction(
    () => !document.querySelector(".play-button")?.disabled,
    { timeout: 90000 },
  );
  await page
    .getByRole("button", { name: "Export", exact: false })
    .first()
    .click();
  await page.getByLabel("Export width").fill(fallback ? "320" : "1920");
  await page.getByLabel("Export height").fill(fallback ? "180" : "1080");
  await page.getByLabel("Export end").fill(String(duration));
  if (fallback)
    await page.getByLabel("Compatibility encoder", { exact: true }).check();
  await page.getByRole("button", { name: "Render MP4", exact: false }).click();
  let last = -1;
  const monitor = setInterval(async () => {
    try {
      const p = await page.getByLabel("Export progress").getAttribute("value");
      const n = Math.floor(Number(p) / 10) * 10;
      if (n !== last) {
        last = n;
        console.log(`Render ${duration}s progress ${n}%`);
      }
    } catch {}
  }, 5000);
  try {
    await page
      .getByRole("link", { name: "Download MP4", exact: false })
      .waitFor({ timeout: duration * 1000 + 180000 });
    const pending = page.waitForEvent("download");
    await page
      .getByRole("link", { name: "Download MP4", exact: false })
      .click();
    const output = path.resolve(
      `artifacts/${fallback ? "fallback" : "long"}-verified.mp4`,
    );
    await (await pending).saveAs(output);
    assert(fs.statSync(output).size > 1000);
    console.log(
      JSON.stringify({
        result: "PASS",
        duration,
        fallback,
        bytes: fs.statSync(output).size,
      }),
    );
  } finally {
    clearInterval(monitor);
    await page.screenshot({
      path: `artifacts/${fallback ? "fallback" : "long"}-result.png`,
    });
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
