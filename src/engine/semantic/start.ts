/**
 * The frame an app starts on, so a file converts without asking. Signals,
 * strongest first:
 *   1. Figma's own prototype starting point (a flow's first frame).
 *   2. The prototype's links between top-level frames: the frame no link
 *      leads to that reaches the most others (links inside components count,
 *      through their instances).
 *   3. The app Figflow's own analysis builds from each likely frame: the one
 *      holding the most screens, popups, toasts and controls, entry-like names
 *      (login, loader, splash, main menu…) first.
 */
import { reactions } from "../fig/build";
import type { FigFile, FrameSummary } from "../fig/open";
import { guidKey } from "../fig/raw";
import type { NodeChange } from "../fig/kiwi/schema";
import { analyzeFlow, fold } from "./flow";

export type StartPick = { frame: string; reason: string };

type Candidate = { f: FrameSummary; page: number; order: number };

/** Words that name an app's first screen, folded (lowercase, no accents); Cyrillic by stem. */
const ENTRY_WORDS = new Set(["login", "log", "signin", "sign", "auth", "loader", "loading", "splash", "launch", "launcher", "start", "welcome", "intro", "home", "main", "menu", "lobby", "dashboard", "giris", "anasayfa", "inicio", "accueil"]);
const ENTRY_STEMS = ["вход", "главн", "меню", "загруз", "старт"];
const NOT_A_START = new Set(["popup", "modal", "dialog", "overlay", "toast", "notification", "tooltip", "dropdown", "component", "components", "icon", "icons", "asset", "assets", "cover", "thumbnail", "sticker", "guide"]);

function words(name: string): string[] {
  return fold(name).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** A cheap guess of how likely a frame is to start an app. */
function cheapScore(c: Candidate): number {
  const w = words(c.f.name);
  let s = 0;
  if (c.f.kind === "FRAME") s += 3;
  else if (c.f.kind !== "INSTANCE") s -= 4;
  if (w.some((x) => ENTRY_WORDS.has(x) || ENTRY_STEMS.some((stem) => x.startsWith(stem)))) s += 4;
  if (w.some((x) => NOT_A_START.has(x))) s -= 5;
  if (c.f.width < 200 || c.f.height < 150) s -= 6;
  // Designers put the first screen first: earlier pages, then left to right, top to bottom.
  return s - c.page * 0.5 - c.order * 0.05;
}

export function pickStart(fig: FigFile): StartPick | null {
  const pick = guess(fig);
  if (!pick) return null;
  // A frame that is another frame with a popup open starts on that other frame.
  try {
    const flow = analyzeFlow(fig, pick.frame);
    if (flow.start !== pick.frame) return { frame: flow.start, reason: pick.reason };
  } catch {
    // keep the guess
  }
  return pick;
}

function guess(fig: FigFile): StartPick | null {
  const pages = fig.pages();
  const candidates: Candidate[] = [];
  pages.forEach((p, page) => p.frames.forEach((f, order) => candidates.push({ f, page, order })));
  if (!candidates.length) return null;
  const byId = new Map(candidates.map((c) => [c.f.id, c]));
  const rank = [...candidates].sort((a, b) => cheapScore(b) - cheapScore(a));

  // 1. Figma's prototype starting point.
  for (const c of rank) {
    const point = fig.index.get(c.f.id)?.prototypeStartingPoint;
    if (point) return { frame: c.f.id, reason: `the design's prototype starts here${point.name ? ` ("${point.name}")` : ""}` };
  }
  for (const page of fig.index.pages()) {
    const id = page.prototypeStartNodeID ? guidKey(page.prototypeStartNodeID) : "";
    if (byId.has(id)) return { frame: id, reason: "the design's prototype starts here" };
  }

  // 2. The prototype's links between top-level frames.
  const topOf = (id: string): string | null => {
    for (let n = fig.index.get(id); n; n = fig.index.parentOf(n)) {
      const k = guidKey(n.guid);
      if (byId.has(k)) return k;
    }
    return null;
  };
  const links = new Map<string, Set<string>>();
  const into = new Map<string, number>();
  for (const c of candidates) {
    const out = new Set<string>();
    const seen = new Set<string>();
    const walk = (n: NodeChange) => {
      const id = guidKey(n.guid);
      if (seen.has(id)) return;
      seen.add(id);
      for (const r of reactions(n as never, fig.index)) {
        const a = r.action;
        if (a.kind !== "NAVIGATE" && a.kind !== "SWAP" && a.kind !== "OVERLAY") continue;
        const to = topOf(a.target);
        if (to && to !== c.f.id) out.add(to);
      }
      for (const child of fig.index.childrenOf(n)) walk(child);
      // An instance's links are its component's.
      const symbol = (n.symbolData as { symbolID?: NodeChange["guid"] } | undefined)?.symbolID;
      const main = symbol ? fig.index.get(symbol) : undefined;
      if (n.type === "INSTANCE" && main) walk(main);
    };
    const root = fig.index.get(c.f.id);
    if (root) walk(root);
    if (out.size) links.set(c.f.id, out);
    for (const to of out) into.set(to, (into.get(to) ?? 0) + 1);
  }
  if (links.size) {
    const reach = (from: string) => {
      const seen = new Set([from]);
      const queue = [from];
      while (queue.length) {
        for (const to of links.get(queue.shift()!) ?? []) {
          if (seen.has(to)) continue;
          seen.add(to);
          queue.push(to);
        }
      }
      return seen.size;
    };
    const roots = [...links.keys()].filter((id) => !into.get(id));
    const pool = roots.length ? roots : [...links.keys()];
    const best = pool
      .map((id) => ({ id, reach: reach(id), score: cheapScore(byId.get(id)!) }))
      .sort((a, b) => b.reach - a.reach || b.score - a.score)[0];
    return { frame: best.id, reason: `the prototype's links start here and reach ${best.reach} frames` };
  }

  // 3. The fullest app among the likeliest frames.
  let best: { id: string; value: number; screens: number } | null = null;
  for (const c of rank.slice(0, 6)) {
    let value = cheapScore(c);
    let screens = 1;
    try {
      const flow = analyzeFlow(fig, c.f.id);
      // The app this frame starts: what its controls lead to, not every frame the page holds.
      const own = new Set(flow.fromStart);
      screens = own.size;
      const controls = flow.screens.filter((s) => own.has(s.id)).reduce((n, s) => n + s.analysis.widgets.length, 0);
      const popups = flow.popups.filter((p) => own.has(p.screen));
      const toasts = flow.toasts.filter((t) => own.has(t.source) || popups.some((p) => p.source === t.source));
      value += screens * 4 + popups.length * 2 + toasts.length + Math.min(controls, 40) / 10;
    } catch {
      value -= 10;
    }
    if (!best || value > best.value) best = { id: c.f.id, value, screens };
  }
  if (!best) return null;
  return { frame: best.id, reason: best.screens > 1 ? `its app has the most screens (${best.screens})` : "it looks like the first screen" };
}
