// Records film.html to an MP4, frame by frame on the page's virtual clock.
//   node record.mjs [--fps 30] [--out b300-film.mp4]
//   node record.mjs --stills 2,6,12,20      PNG stills at those seconds, for checking
// Needs playwright-core (npm i playwright-core, or PLAYWRIGHT_CORE=/path/to/playwright-core),
// Chromium (CHROME_PATH) and ffmpeg on PATH.
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const FPS = Number(arg("fps", 30));
const OUT = arg("out", join(HERE, "b300-film.mp4"));
const STILLS = arg("stills", "");

const { chromium } = await import(process.env.PLAYWRIGHT_CORE ? pathToFileURL(join(process.env.PLAYWRIGHT_CORE, "index.mjs")).href : "playwright-core");
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  headless: false,
  args: ["--headless=new", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--hide-scrollbars", "--force-color-profile=srgb", "--allow-file-access-from-files"],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
await page.goto(pathToFileURL(join(HERE, "film.html")).href);
await page.evaluate(() => document.fonts.ready);
await page.waitForFunction(() => window.__film);
// Let the figure's IntersectionObserver report in before the clock starts.
await page.waitForTimeout(300);

const duration = await page.evaluate(() => window.__film.duration);
const step = 1000 / FPS;
const frameAt = async (t) => {
  await page.evaluate(([target, ms]) => {
    do {
      window.__advance(ms);
      window.__film.render(window.__clock() / 1000);
    } while (window.__clock() + ms / 2 < target * 1000);
  }, [t, step]);
  return page.screenshot({ type: STILLS ? "png" : "jpeg", quality: STILLS ? undefined : 94 });
};

if (STILLS) {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(join(HERE, "stills"), { recursive: true });
  for (const t of STILLS.split(",").map(Number).sort((a, b) => a - b)) {
    writeFileSync(join(HERE, "stills", `t${String(t).padStart(5, "0")}.png`), await frameAt(t));
    console.log("still", t);
  }
} else {
  const ffmpeg = spawn("ffmpeg", ["-y", "-v", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", OUT], { stdio: ["pipe", "inherit", "inherit"] });
  const frames = Math.round(duration * FPS);
  const started = performance.now();
  for (let i = 0; i < frames; i++) {
    const buffer = await frameAt(i / FPS);
    if (!ffmpeg.stdin.write(buffer)) await new Promise((resolve) => ffmpeg.stdin.once("drain", resolve));
    if (i % (FPS * 5) === 0) console.log(`frame ${i}/${frames} · ${((performance.now() - started) / 1000).toFixed(0)} s`);
  }
  ffmpeg.stdin.end();
  await new Promise((resolve) => ffmpeg.on("close", resolve));
  console.log("wrote", OUT);
}
if (errors.length) console.log("page errors:\n" + errors.join("\n"));
await browser.close();
