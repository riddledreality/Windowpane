import { chromium } from "/workspace/glowcast-card/node_modules/playwright/index.mjs";
import fs from "fs";

const HA_URL = process.env.HA_URL.replace(/\/$/, "");
const HA_TOKEN = process.env.HA_TOKEN;

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

async function tryMethod(name, setup) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 700 }, colorScheme: "dark" });
  await setup(context);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${HA_URL}/window-pane`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(8000);
  const info = await page.evaluate(() => ({
    path: location.pathname,
    hasHass: !!(document.querySelector("home-assistant")?.hass),
    title: document.title,
    launch: !!document.querySelector("#ha-launch-screen"),
    text: document.body?.innerText?.slice(0, 200),
  }));
  console.log(name, JSON.stringify(info), "errors", errors.slice(0, 3));
  await page.screenshot({ path: `screenshots/auth-${name}.png` });
  await context.close();
}

// Method A: hassTokens with hassUrl (expires in seconds)
await tryMethod("localstorage-seconds", async (ctx) => {
  await ctx.addInitScript(({ token, url }) => {
    const expires = Date.now() / 1000 + 365 * 24 * 3600;
    localStorage.setItem("hassTokens", JSON.stringify({
      hassUrl: url,
      clientId: url + "/",
      access_token: token,
      refresh_token: token,
      expires,
      expires_in: 365 * 24 * 3600,
      token_type: "Bearer",
    }));
  }, { token: HA_TOKEN, url: HA_URL });
});

// Method B: same but expires in ms (wrong but some code uses it)
await tryMethod("localstorage-ms", async (ctx) => {
  await ctx.addInitScript(({ token, url }) => {
    localStorage.setItem("hassTokens", JSON.stringify({
      hassUrl: url,
      clientId: url + "/",
      access_token: token,
      refresh_token: token,
      expires: Date.now() + 365 * 24 * 3600 * 1000,
      expires_in: 365 * 24 * 3600,
      token_type: "Bearer",
    }));
  }, { token: HA_TOKEN, url: HA_URL });
});

// Method C: auth_callback without encodeURIComponent
await tryMethod("callback-raw", async (ctx) => {
  // override goto by using init that redirects - we'll just navigate in tryMethod differently
});

// Redo C manually
{
  const context = await browser.newContext({ viewport: { width: 1100, height: 700 }, colorScheme: "dark" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const url = `${HA_URL}/window-pane?auth_callback=1#access_token=${HA_TOKEN}&token_type=Bearer&expires_in=315360000`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(8000);
  const info = await page.evaluate(() => ({
    path: location.pathname,
    hasHass: !!(document.querySelector("home-assistant")?.hass),
    text: document.body?.innerText?.slice(0, 200),
  }));
  console.log("callback-raw", JSON.stringify(info), "errors", errors.slice(0, 3));
  await page.screenshot({ path: `screenshots/auth-callback-raw.png` });
  await context.close();
}

// Method D: use /auth/login_flow API to get a code? skip for now
await browser.close();
