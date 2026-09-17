// Downloads licensed Google Fonts into the app; no runtime network dependency.
import { readFile, writeFile, mkdir } from "node:fs/promises";
const source = await readFile("app/studio/fonts.ts", "utf8");
const names = [...source.split("export async")[0].matchAll(/'([^']+)'/g)].map(
  (m) => m[1],
);
await mkdir("public/fonts", { recursive: true });
let css = "",
  count = 0;
async function get(url) {
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw Error(`${r.status} ${url}`);
  return r;
}
for (const name of names) {
  const slug = name.toLowerCase().replaceAll(" ", "");
  const remote = await (
    await get(
      `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name)}:wght@400&display=swap`,
    )
  ).text();
  let local = remote;
  for (const url of new Set(
    [...remote.matchAll(/url\((https[^)]+)\)/g)].map((m) => m[1]),
  )) {
    const filename = `${slug}-${count++}.${url.includes(".woff2") ? "woff2" : "ttf"}`;
    await writeFile(
      `public/fonts/${filename}`,
      Buffer.from(await (await get(url)).arrayBuffer()),
    );
    local = local.replaceAll(url, `/fonts/${filename}`);
  }
  css += local + "\n";
  for (const base of ["ofl", "apache"]) {
    const r = await fetch(
      `https://raw.githubusercontent.com/google/fonts/main/${base}/${slug}/${base === "ofl" ? "OFL.txt" : "LICENSE.txt"}`,
    );
    if (r.ok) {
      await writeFile(`public/fonts/${slug}-LICENSE.txt`, await r.text());
      break;
    }
  }
  console.log(name);
}
await writeFile("public/fonts/fonts.css", css);
console.log(`Bundled ${names.length} families`);
