import { describe, expect, it } from "vitest";
import type { DesignNode, Rect, TextRun } from "../model/types";
import { planComponents } from "./components";
import type { ScreenOp } from "./controls";
import { Theme } from "./emit";
import type { PlanBox } from "./plan";

const IDENTITY = { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 };

function node(id: string, kind: DesignNode["kind"], name: string, box: Rect, children: DesignNode[] = [], extra: Partial<DesignNode> = {}): DesignNode {
  return {
    id,
    guid: id,
    kind,
    name,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "PASS_THROUGH",
    transform: { ...IDENTITY, m02: box.x, m12: box.y },
    size: { x: box.w, y: box.h },
    box,
    fills: [],
    strokes: [],
    stroke: null,
    effects: [],
    corners: { tl: 0, tr: 0, br: 0, bl: 0, smoothing: 0 },
    clipsContent: false,
    mask: null,
    fillGeometry: [],
    strokeGeometry: [],
    layout: null,
    layoutChild: {},
    constraints: { h: "MIN", v: "MIN" },
    text: null,
    reactions: [],
    children,
    ...extra,
  } as unknown as DesignNode;
}

const run: TextRun = {
  start: 0,
  end: 1,
  font: { family: "Inter", weight: 400, italic: false, postscript: "", style: "Regular" },
  fontSize: 14,
  letterSpacing: 0,
  lineHeight: null,
  fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 }, opacity: 1, visible: true, blendMode: "NORMAL" }],
  decoration: "NONE",
  textCase: "ORIGINAL",
} as unknown as TextRun;

const look = (r: number): PlanBox => ({ fills: [{ kind: "solid", color: { r, g: 0.2, b: 0.2, a: 1 }, opacity: 1 }], radii: [8, 8, 8, 8], stroke: null, shadows: [], opacity: 1, backdropBlur: 0 });

/** A "Card" instance at (x, y): a background box and a one-line title. */
function card(id: string, x: number, y: number, title: string, opts: { w?: number; red?: number } = {}) {
  const w = opts.w ?? 120;
  const bg = node(`${id};bg`, "RECTANGLE", "Background", { x, y, w, h: 40 });
  const text = node(`${id};title`, "TEXT", "Title", { x: x + 10, y: y + 12, w: 80, h: 16 });
  const inst = node(id, "INSTANCE", "Card", { x, y, w, h: 40 }, [bg, text], { component: { id: "card", name: "Card" }, props: { Title: title } });
  const ops: ScreenOp[] = [
    { kind: "box", node: bg, rect: bg.box, box: look(opts.red ?? 0.2), ellipse: false },
    { kind: "text", node: text, rect: text.box, segments: [{ text: title, x: x + 10, y: y + 25, run }], singleLine: true, align: "start", baseline: y + 25, truncate: false },
  ];
  return { inst, ops };
}

const ctx = () => ({ theme: new Theme([]), assetIdent: (id: string) => `img_${id}`, assetIsMask: () => false, frame: "f" });

describe("planComponents", () => {
  it("draws instances that differ only in their texts with one function", () => {
    const a = card("1:1", 0, 0, "Starter");
    const b = card("1:2", 0, 50, "Pro");
    const root = node("0:1", "FRAME", "Screen", { x: 0, y: 0, w: 200, h: 200 }, [a.inst, b.inst]);
    const plan = planComponents([{ root, ops: [...a.ops, ...b.ops] }], ctx());
    const header = plan.files.find((x) => x.path === "src/ui/components/card.h")!.contents;
    expect(header).toContain("void card(ImDrawList* dl, ImVec2 at, const char* title);");
    expect(plan.ops[0].map((op) => (op.kind === "component" ? op.call("f") : op.kind))).toEqual([
      'components::card(dl, f.at({ 0.f, 0.f }), "Starter");',
      'components::card(dl, f.at({ 0.f, 50.f }), "Pro");',
    ]);
  });

  it("passes a look the instances don't share, and keeps what they do", () => {
    const a = card("1:1", 0, 0, "Same", { red: 0.9 });
    const b = card("1:2", 0, 50, "Same", { red: 0.1 });
    const root = node("0:1", "FRAME", "Screen", { x: 0, y: 0, w: 200, h: 200 }, [a.inst, b.inst]);
    const plan = planComponents([{ root, ops: [...a.ops, ...b.ops] }], ctx());
    expect(plan.files.find((x) => x.path.endsWith("card.h"))!.contents).toContain("void card(ImDrawList* dl, ImVec2 at, const ff::Box& background);");
    expect(plan.files.find((x) => x.path.endsWith("card.cpp"))!.contents).toContain('"Same"');
  });

  it("gives instances laid out differently a function each", () => {
    const a = card("1:1", 0, 0, "A");
    const b = card("1:2", 0, 50, "B", { w: 160 });
    const root = node("0:1", "FRAME", "Screen", { x: 0, y: 0, w: 200, h: 200 }, [a.inst, b.inst]);
    const plan = planComponents([{ root, ops: [...a.ops, ...b.ops] }], ctx());
    const calls = plan.ops[0].map((op) => (op.kind === "component" ? op.call("f") : ""));
    expect(calls[0]).toMatch(/^components::card\(/);
    expect(calls[1]).toMatch(/^components::card_2\(/);
  });

  it("leaves an instance inline when something else is drawn between its layers, or it holds a control", () => {
    const a = card("1:1", 0, 0, "A");
    const b = card("1:2", 0, 50, "B");
    const other = node("2:1", "RECTANGLE", "Divider", { x: 0, y: 45, w: 200, h: 1 });
    const between: ScreenOp = { kind: "box", node: other, rect: other.box, box: look(0.5), ellipse: false };
    const control = { kind: "control", node: b.inst.children[0], control: {} } as unknown as ScreenOp;
    const root = node("0:1", "FRAME", "Screen", { x: 0, y: 0, w: 200, h: 200 }, [a.inst, other, b.inst]);
    const ops = [a.ops[0], between, a.ops[1], control, b.ops[1]];
    const plan = planComponents([{ root, ops }], ctx());
    expect(plan.files).toEqual([]);
    expect(plan.ops[0]).toEqual(ops);
  });
});
