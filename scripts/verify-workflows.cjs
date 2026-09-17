const { chromium } = require(
  process.env.PLAYWRIGHT_PATH ||
    "C:/Users/SajadTRB/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  fs.mkdirSync("artifacts", { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  await page.goto("http://localhost:3000");
  await page
    .getByLabel("Project name", { exact: true })
    .fill("Workflow verification");
  const assets = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const x = c.getContext("2d");
    x.fillStyle = "#fe3131";
    x.fillRect(0, 0, 256, 256);
    x.fillStyle = "white";
    x.fillRect(60, 60, 136, 136);
    const image = c.toDataURL("image/png").split(",")[1];
    const stream = c.captureStream(24),
      rec = new MediaRecorder(stream, { mimeType: "video/webm" }),
      chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const done = new Promise((resolve) => (rec.onstop = resolve));
    rec.start();
    let n = 0;
    const timer = setInterval(() => {
      x.fillStyle = `hsl(${n++ * 10},80%,40%)`;
      x.fillRect(0, 0, 256, 256);
    }, 40);
    await new Promise((r) => setTimeout(r, 1200));
    rec.stop();
    await done;
    clearInterval(timer);
    stream.getTracks().forEach((t) => t.stop());
    const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
    let raw = "";
    for (const b of bytes) raw += String.fromCharCode(b);
    return { image, video: btoa(raw) };
  });
  fs.writeFileSync("artifacts/cover.png", Buffer.from(assets.image, "base64"));
  fs.writeFileSync(
    "artifacts/background.webm",
    Buffer.from(assets.video, "base64"),
  );
  await page.getByRole("button", { name: "Media", exact: true }).click();
  await page
    .getByLabel("Import cover", { exact: true })
    .setInputFiles(path.resolve("artifacts/cover.png"));
  await page.getByLabel("Layer name", { exact: true }).waitFor();
  await page
    .getByLabel("Background video", { exact: true })
    .setInputFiles(path.resolve("artifacts/background.webm"));
  await page
    .getByLabel("Add music", { exact: true })
    .setInputFiles(path.resolve("artifacts/music.wav"));
  await page.waitForFunction(
    () => !document.querySelector(".play-button")?.disabled,
  );
  await page
    .getByRole("button", { name: "Add Spotify logo", exact: true })
    .click();
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page
    .getByRole("button", { name: "Select Spotify", exact: true })
    .click();
  const hit = page.locator(".layer-hit.is-selected");
  let box = await hit.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 45,
    box.y + box.height / 2 - 30,
    { steps: 12 },
  );
  await page.mouse.up();
  assert.notEqual(
    await page.getByLabel("Layer x", { exact: true }).inputValue(),
    "50",
  );
  const oldWidth = Number(
    await page.getByLabel("Layer w", { exact: true }).inputValue(),
  );
  const corner = await page
    .getByLabel("Resize Spotify corner 2", { exact: true })
    .boundingBox();
  await page.mouse.move(corner.x + 4, corner.y + 4);
  await page.mouse.down();
  await page.mouse.move(corner.x + 24, corner.y + 24, { steps: 10 });
  await page.mouse.up();
  assert(
    Number(await page.getByLabel("Layer w", { exact: true }).inputValue()) >
      oldWidth,
  );
  const rotate = await page
    .getByLabel("Rotate Spotify", { exact: true })
    .boundingBox();
  await page.mouse.move(rotate.x + 12, rotate.y + 12);
  await page.mouse.down();
  await page.mouse.move(rotate.x + 55, rotate.y + 45, { steps: 10 });
  await page.mouse.up();
  assert.notEqual(
    await page.getByLabel("Layer rotation", { exact: true }).inputValue(),
    "0",
  );
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("button", { name: "Select Spotify", exact: true })
    .waitFor({ state: "detached" });
  await page
    .getByRole("button", { name: "Select Particles", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Toggle Particles visibility", exact: true })
    .click();
  await page
    .getByLabel("Particle style", { exact: true })
    .selectOption("Soft dots");
  await page.getByLabel("Minimum size", { exact: true }).press("Home");
  assert.equal(
    await page.getByLabel("Minimum size", { exact: true }).inputValue(),
    "0.05",
  );
  await page.getByLabel("Wind enabled", { exact: true }).check();
  await page.getByLabel("Wind direction", { exact: true }).selectOption("left");
  await page
    .getByRole("button", { name: "Toggle Particles visibility", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Select Spectrum", exact: true })
    .click();
  for (const option of await page
    .getByLabel("Spectrum style", { exact: true })
    .locator("option")
    .allTextContents())
    await page
      .getByLabel("Spectrum style", { exact: true })
      .selectOption(option);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Select Cover art", exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("Project name", { exact: true }).inputValue(),
    "Workflow verification",
  );
  await page.waitForFunction(
    () => !document.querySelector(".play-button")?.disabled,
  );
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page
    .locator(".projects-dialog")
    .getByRole("button", { name: "Duplicate", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".saved-project").length === 2,
  );
  page.once("dialog", (d) => d.accept("Renamed project"));
  await page
    .locator(".saved-project")
    .filter({ hasText: "Workflow verification copy" })
    .getByRole("button", { name: "Rename", exact: true })
    .click();
  await page.getByText("Renamed project", { exact: true }).waitFor();
  page.once("dialog", (d) => d.accept());
  await page
    .locator(".saved-project")
    .filter({ has: page.getByText("Renamed project", { exact: true }) })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".saved-project").length === 1,
  );
  await page
    .locator(".projects-dialog")
    .getByRole("button", { name: "Open", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Export", exact: false })
    .first()
    .click();
  await page.getByLabel("Export width").fill("640");
  await page.getByLabel("Export height").fill("360");
  await page.getByLabel("Export end").fill("3");
  await page.getByRole("button", { name: "Render MP4", exact: false }).click();
  await page
    .getByRole("link", { name: "Download MP4", exact: false })
    .waitFor({ timeout: 120000 });
  const url = await page
    .getByRole("link", { name: "Download MP4", exact: false })
    .getAttribute("href");
  const metadata = await page.evaluate(async (url) => {
    const v = document.createElement("video");
    v.src = url;
    await new Promise((r, j) => {
      v.onloadedmetadata = r;
      v.onerror = j;
    });
    const ctx = new AudioContext();
    const audio = await ctx.decodeAudioData(
      await (await fetch(url)).arrayBuffer(),
    );
    const samples = audio.getChannelData(0);
    let energy = 0;
    for (const s of samples) energy += s * s;
    await ctx.close();
    const canvas=document.createElement('canvas');canvas.width=canvas.height=8;const paint=canvas.getContext('2d');const loopSamples=[];
    for(const time of [1.6,2.5]){await new Promise(resolve=>{v.onseeked=resolve;v.currentTime=time});paint.drawImage(v,0,0,8,8);loopSamples.push([...paint.getImageData(0,0,1,1).data])}
    return {
      width: v.videoWidth,
      height: v.videoHeight,
      duration: v.duration,
      audioRms: Math.sqrt(energy / samples.length),
      loopSamples,
    };
  }, url);
  assert.equal(metadata.width, 640);
  assert.equal(metadata.height, 360);
  assert(metadata.duration > 2.5 && metadata.duration < 3.5);
  assert(metadata.audioRms > 0.01);
  assert.notDeepEqual(metadata.loopSamples[0],metadata.loopSamples[1],'Background video froze after its first loop');
  const wait = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download MP4", exact: false }).click();
  await (await wait).saveAs(path.resolve("artifacts/media-verified.mp4"));
  await page.getByRole("button", { name: "Close export", exact: true }).click();
  await page
    .getByRole("button", { name: "Switch language", exact: true })
    .click();
  await page.screenshot({ path: "artifacts/studio-persian.png" });
  await page
    .getByRole("button", { name: "Switch language", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "artifacts/studio-mobile.png",
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  console.log(JSON.stringify({ result: "PASS", metadata, errors }));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
