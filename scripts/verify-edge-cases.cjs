const { chromium } = require(
  process.env.PLAYWRIGHT_PATH ||
    "C:/Users/SajadTRB/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const assert = require("node:assert/strict"),
  path = require("node:path");
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.route("**/*", (route) => {
    const u = new URL(route.request().url());
    return u.hostname === "localhost" || u.protocol === "blob:"
      ? route.continue()
      : route.abort();
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("http://localhost:3000");
  await page.getByRole("button", { name: "Media", exact: true }).click();
  await page
    .getByLabel("Add music", { exact: true })
    .setInputFiles(path.resolve("artifacts/music.wav"));
  await page.waitForFunction(
    () => !document.querySelector(".play-button")?.disabled,
  );
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page
    .getByRole("button", { name: "Select Song title", exact: true })
    .click();
  const fonts = await page
    .getByLabel("Font family")
    .locator("option")
    .allTextContents();
  assert.equal(fonts.length, 50);
  for (const name of fonts) {
    await page.getByLabel("Font family").selectOption(name);
    await page.evaluate(
      (font) => document.fonts.load(`400 32px "${font}"`),
      name,
    );
  }
  await page.getByRole("button", { name: "Effects", exact: true }).click();
  const styles = await page
    .getByLabel("Effect", { exact: true })
    .locator("option")
    .allTextContents();
  for (const style of styles) {
    await page.getByLabel("Effect", { exact: true }).selectOption(style);
    await page
      .getByLabel("Timeline position", { exact: true })
      .press("ArrowRight");
    await page
      .locator('canvas[aria-label="Project preview"]')
      .screenshot({ path: `artifacts/effect-${style.replace(/ /g, "-")}.png` });
  }
  assert.equal(styles.length, 27);
  await page.getByLabel("Effect", { exact: true }).selectOption("Camera shake");
  await page.getByLabel("Sync to music", { exact: true }).check();
  await page.getByLabel("Intensity", { exact: true }).press("End");
  await page.getByLabel("Music reaction", { exact: true }).press("End");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page
    .getByRole("button", { name: "Export", exact: false })
    .first()
    .click();
  await page.getByLabel("Export width").fill("640");
  await page.getByLabel("Export height").fill("360");
  await page.getByLabel("Export end").fill("15");
  await page.getByRole("button", { name: "Render MP4", exact: false }).click();
  await page
    .getByRole("button", { name: "Cancel export", exact: true })
    .click();
  await page.getByText("Export cancelled", { exact: true }).waitFor();
  await page.getByLabel("Export width").fill("641");
  await page.getByRole("button", { name: "Render MP4", exact: false }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Dimensions must be even" })
    .waitFor();
  await page.getByLabel("Export width").fill("640");
  await page.getByLabel("Export end").fill("1");
  await page.getByRole("button", { name: "Render MP4", exact: false }).click();
  await page
    .getByRole("link", { name: "Download MP4", exact: false })
    .waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Close export", exact: true }).click();
  // Validate the actual long render file through the browser's video decoder.
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.id = "verification-file";
    document.body.append(input);
  });
  await page
    .locator("#verification-file")
    .setInputFiles(path.resolve("artifacts/long-verified.mp4"));
  const video = await page.evaluate(async () => {
    const input = document.querySelector("#verification-file"),
      v = document.createElement("video");
    v.src = URL.createObjectURL(input.files[0]);
    await new Promise((r, j) => {
      v.onloadedmetadata = r;
      v.onerror = j;
    });
    return { duration: v.duration, width: v.videoWidth, height: v.videoHeight };
  });
  assert.equal(video.width, 1920);
  assert.equal(video.height, 1080);
  assert(video.duration > 180 && video.duration < 182);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      result: "PASS",
      fonts: fonts.length,
      effects: styles.length,
      offlineExternalRequestsBlocked: true,
      cancelAndRetry: true,
      longVideo: video,
      errors,
    }),
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
