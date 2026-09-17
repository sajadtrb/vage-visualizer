const { chromium } = require(
  process.env.PLAYWRIGHT_PATH ||
    "C:/Users/SajadTRB/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const fs = require("node:fs");
const path = require("node:path");
(async () => {
  fs.mkdirSync("artifacts", { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("http://localhost:3000");
  await page
    .getByRole("button", { name: "Select Song title", exact: true })
    .waitFor({ timeout: 60000 });
  await page.screenshot({
    path: "artifacts/studio-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Select Song title", exact: true })
    .click();
  await page.getByLabel("Text content", { exact: true }).fill("A new release");
  await page
    .getByLabel("Text content", { exact: true })
    .pressSequentially(" — continuous typing");
  if (
    (await page.getByLabel("Text content", { exact: true }).inputValue()) !==
    "A new release — continuous typing"
  )
    throw Error("Typing lost focus");
  await page.getByLabel("Font family").selectOption("Montserrat");
  await page
    .getByRole("button", { name: "Select Artist name", exact: true })
    .click();
  if ((await page.getByLabel("Font family").inputValue()) === "Montserrat")
    throw Error("Font leaked across layers");
  const rate = 44100,
    duration = 4,
    pcm = Buffer.alloc(44 + rate * duration * 2);
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
  for (let i = 0; i < rate * duration; i++)
    pcm.writeInt16LE(
      Math.round(
        Math.sin((i / rate) * Math.PI * 2 * 220) *
          16000 *
          (0.2 +
            0.8 * Math.pow(Math.max(0, Math.sin((i / rate) * Math.PI * 4)), 4)),
      ),
      44 + i * 2,
    );
  fs.writeFileSync("artifacts/music.wav", pcm);
  await page.getByRole("button", { name: "Media", exact: true }).click();
  await page
    .getByLabel("Add music", { exact: true })
    .setInputFiles(path.resolve("artifacts/music.wav"));
  await page.getByRole("button", { name: "Play", exact: true }).waitFor();
  await page.waitForFunction(
    () => !document.querySelector(".play-button")?.disabled,
    { timeout: 60000 },
  );
  await page
    .getByRole("button", { name: "Export", exact: false })
    .first()
    .click();
  await page.getByLabel("Export width").fill("640");
  await page.getByLabel("Export height").fill("360");
  await page.getByLabel("Export end").fill("2");
  await page.getByRole("button", { name: "Render MP4", exact: false }).click();
  await page
    .getByRole("link", { name: "Download MP4", exact: false })
    .waitFor({ timeout: 120000 });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download MP4", exact: false }).click();
  const download = await downloadPromise;
  await download.saveAs(path.resolve("artifacts/verified.mp4"));
  await page.screenshot({ path: "artifacts/export-success.png" });
  console.log(
    JSON.stringify({
      result: "PASS",
      bytes: fs.statSync("artifacts/verified.mp4").size,
      errors,
    }),
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
