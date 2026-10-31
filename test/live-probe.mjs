import { chromium, devices } from "/workspace/glowcast-card/node_modules/playwright/index.mjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "screenshots");
fs.mkdirSync(OUT, { recursive: true });
const HA_URL = process.env.HA_URL.replace(/\/$/, "");
const HA_TOKEN = process.env.HA_TOKEN;

async function probe(label, options = {}) {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext({
    viewport: options.viewport || { width: 1280, height: 800 },
    deviceScaleFactor: options.deviceScaleFactor || 1,
    userAgent: options.userAgent,
    colorScheme: "dark",
    reducedMotion: options.reducedMotion || "no-preference",
  });
  await context.addInitScript(({ token, url }) => {
    const expires = Date.now() / 1000 + 365 * 24 * 3600;
    localStorage.setItem("hassTokens", JSON.stringify({
      hassUrl: url, clientId: url + "/", access_token: token, refresh_token: token,
      expires, expires_in: 365 * 24 * 3600, token_type: "Bearer",
    }));
    localStorage.removeItem("windowpane.config.v1");
  }, { token: HA_TOKEN, url: HA_URL });

  const page = await context.newPage();
  if (options.reducedMotion === "reduce") await page.emulateMedia({ reducedMotion: "reduce" });
  const logs = [], errors = [];
  page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("response", (r) => { if (r.url().includes("windowpane")) logs.push(`[net ${r.status()}] ${r.url()}`); });

  console.log("\n===", label, "===");
  await page.goto(`${HA_URL}/window-pane`, { waitUntil: "domcontentloaded", timeout: 90000 });
  for (let i = 0; i < 40; i++) {
    const ok = await page.evaluate(() => !!(document.querySelector("home-assistant")?.hass));
    if (ok) break;
    await page.waitForTimeout(1000);
  }
  // wait for module
  for (let i = 0; i < 30; i++) {
    const v = await page.evaluate(() => window.windowpane?.BRAND?.version || null);
    if (v) { console.log("loaded version", v); break; }
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(3500);

  const diag = await page.evaluate(() => {
    const canvas = document.getElementById("windowpane-canvas");
    const wp = window.windowpane;
    let nonZero = 0, bright = 0;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      for (let y = 0; y < canvas.height; y += 5)
        for (let x = 0; x < canvas.width; x += 5) {
          const d = ctx.getImageData(x, y, 1, 1).data;
          if (d[3] > 8) {
            nonZero++;
            if (d[0] + d[1] + d[2] > 60) bright++;
          }
        }
    }
    return {
      path: location.pathname,
      href: location.href.slice(0, 100),
      hasHass: !!(document.querySelector("home-assistant")?.hass),
      version: wp?.BRAND?.version,
      diagnose: wp?.diagnose?.(),
      nonZero, bright,
      canvasZ: canvas && getComputedStyle(canvas).zIndex,
      canvasParent: canvas?.parentElement?.tagName,
    };
  });
  console.log(JSON.stringify(diag, null, 2));
  console.log("errors", errors.slice(0, 5));
  logs.filter(l => /windowpane|net /i.test(l)).slice(0, 20).forEach(l => console.log(l));
  await page.screenshot({ path: path.join(OUT, `${label}.png`) });

  if (label === "desktop" && diag.diagnose) {
    await page.goto(`${HA_URL}/glow-cast`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2500);
    await page.goto(`${HA_URL}/window-pane`, { waitUntil: "domcontentloaded", timeout: 60000 });
    for (let i = 0; i < 30; i++) {
      if (await page.evaluate(() => !!(document.querySelector("home-assistant")?.hass && window.windowpane))) break;
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(3000);
    const after = await page.evaluate(() => window.windowpane?.diagnose?.());
    console.log("after-nav", JSON.stringify(after));
    await page.screenshot({ path: path.join(OUT, `${label}-after-nav.png`) });
  }

  await browser.close();
  return diag;
}

const results = {};
results.desktop = await probe("desktop");
results.iphone = await probe("iphone", {
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
  userAgent: devices["iPhone 14"].userAgent,
});
results.iphone_reduced = await probe("iphone-reduced", {
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
  userAgent: devices["iPhone 14"].userAgent,
  reducedMotion: "reduce",
});
fs.writeFileSync(path.join(OUT, "probe-results.json"), JSON.stringify(results, null, 2));
console.log("SUMMARY", JSON.stringify({
  desktop: { nz: results.desktop?.nonZero, bright: results.desktop?.bright, d: results.desktop?.diagnose },
  iphone: { nz: results.iphone?.nonZero, bright: results.iphone?.bright, d: results.iphone?.diagnose },
  reduced: { nz: results.iphone_reduced?.nonZero, bright: results.iphone_reduced?.bright, d: results.iphone_reduced?.diagnose },
}, null, 2));
