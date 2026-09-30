#!/usr/bin/env node
/**
 * DEV ONLY — capture PNG screenshots of the running app with headless
 * Chromium over the DevTools protocol (no extra dependencies).
 *
 *   node scripts/screenshot.mjs --base http://localhost:3100 --out .data/shots \
 *     home=/ "pricing=/pricing" --full
 *
 * Each target is name=path, optionally followed by actions:
 *   "|click:<text>"  "|scroll:<px>"  "|wait:<ms>"  "|hover:<css selector>"
 *   "|eval:<js expression>" (prints the JSON result), --reduced-motion
 *   (emulates the OS setting),
 *   --scrollbars (keeps the real scrollbars visible).
 * --size 1440x900, --scale 1, --full (whole page; scrolls through first so
 * reveal-on-scroll content is shown), --browser <exe>.
 * Uses a throwaway browser profile, never your own. Adapted from Certware.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
};
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const full = flag("full");
const reducedMotion = flag("reduced-motion");
const showScrollbars = flag("scrollbars");
const out = opt("out", ".data/screenshots");
const [width, height] = opt("size", "1440x900").split("x").map(Number);
const scale = Number(opt("scale", "1"));
const base = opt("base", "http://localhost:3100");
const browserPath =
  opt("browser", null) ??
  [
    process.env.BROWSER_PATH,
    "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].find((c) => c && existsSync(c));
if (!browserPath) throw new Error("No Chromium browser found; pass --browser <path>.");

const targets = args.map((arg) => {
  const cut = arg.indexOf("=");
  const [name, rest] = [arg.slice(0, cut), arg.slice(cut + 1)];
  const [urlPath, ...actions] = rest.split("|");
  return { name, urlPath, actions };
});

const profile = mkdtempSync(path.join(os.tmpdir(), "ff-shot-"));
const port = 9300 + Math.floor(Math.random() * 500);
const browser = spawn(
  browserPath,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    ...(showScrollbars ? [] : ["--hide-scrollbars"]),
    "--enable-unsafe-swiftshader",
    `--window-size=${width},${height}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pageSocket() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((e) => e.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error("browser did not start");
}

try {
  const ws = new WebSocket(await pageSocket());
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let nextId = 1;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (event) => {
    const m = JSON.parse(String(event.data));
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    } else if (m.method) for (const l of listeners) l(m);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
      ws.send(JSON.stringify({ id, method, params }));
    });
  const waitFor = (method, timeout = 20000) =>
    new Promise((resolve) => {
      const timer = setTimeout(resolve, timeout);
      listeners.push((m) => {
        if (m.method === method) {
          clearTimeout(timer);
          resolve(m);
        }
      });
    });
  const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.value;

  await send("Page.enable");
  await send("Runtime.enable");
  listeners.push((m) => {
    if (m.method === "Runtime.exceptionThrown") {
      const d = m.params.exceptionDetails;
      console.warn(`[page exception] ${d.exception?.description?.split("\n")[0] ?? d.text}`);
    } else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
      console.warn(`[console.error] ${m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 600)}`);
    }
  });
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: width < 768 });
  if (reducedMotion) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });

  mkdirSync(out, { recursive: true });
  for (const target of targets) {
    const loaded = waitFor("Page.loadEventFired", 60000);
    await send("Page.navigate", { url: `${base}${target.urlPath}` });
    await loaded;
    await sleep(1500);
    for (const action of target.actions) {
      if (action.startsWith("click:")) {
        const text = action.slice(6);
        const ok = await evaluate(`(async () => {
          const pause = (ms) => new Promise((r) => setTimeout(r, ms));
          const wanted = ${JSON.stringify(text)};
          for (const end = Date.now() + 20000; Date.now() < end; await pause(200)) {
            const el = [...document.querySelectorAll('button, a, [role=tab], [role=switch]')].find((b) => b.getClientRects().length && b.textContent.trim().startsWith(wanted));
            if (el && Object.keys(el).some((k) => k.startsWith('__reactProps'))) { el.click(); return true; }
          }
          return false;
        })()`);
        if (!ok) console.warn(`[screenshot] ${target.name}: no "${text}" control`);
        await sleep(700);
      } else if (action.startsWith("scroll:")) {
        await evaluate(`window.scrollBy(0, ${Number(action.slice(7))})`);
        await sleep(600);
      } else if (action.startsWith("wait:")) {
        await sleep(Math.min(60000, Number(action.slice(5)) || 0));
      } else if (action.startsWith("eval:")) {
        console.log(`[eval] ${target.name}: ${JSON.stringify(await evaluate(action.slice(5)))}`);
      } else if (action.startsWith("hover:")) {
        const box = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(action.slice(6))})?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`);
        if (box) await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y });
        await sleep(500);
      }
    }
    let clip;
    if (full) {
      // Walk down the page so in-view reveals run, then return to the top.
      const total = await evaluate("document.documentElement.scrollHeight");
      for (let y = 0; y < total; y += Math.round(height * 0.7)) {
        await evaluate(`window.scrollTo(0, ${y})`);
        await sleep(260);
      }
      await evaluate("window.scrollTo(0, 0)");
      await sleep(900);
      const h = await evaluate("document.documentElement.scrollHeight");
      clip = { x: 0, y: 0, width, height: h, scale: 1 };
    }
    const shot = await send("Page.captureScreenshot", { format: "png", ...(clip ? { clip, captureBeyondViewport: true } : {}) });
    const file = path.join(out, `${target.name}.png`);
    writeFileSync(file, Buffer.from(shot.data, "base64"));
    console.log(file);
  }
  ws.close();
} finally {
  browser.kill();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true });
}
