import { describe, expect, it } from "vitest";
import type { DesignNode, Paint, Rect, RGBA, TextData } from "../model/types";
import { detectWidgets } from "./detect";

const IDENTITY = { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 };
let seq = 0;

function node(kind: DesignNode["kind"], name: string, box: Rect, extra: Partial<DesignNode> = {}, children: DesignNode[] = []): DesignNode {
  const id = `n${++seq}`;
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

const rgb = (hex: string, a = 1): RGBA => ({ r: parseInt(hex.slice(0, 2), 16) / 255, g: parseInt(hex.slice(2, 4), 16) / 255, b: parseInt(hex.slice(4, 6), 16) / 255, a });
const solid = (hex: string, a = 1): Paint => ({ type: "SOLID", color: rgb(hex, a), opacity: 1, visible: true, blendMode: "NORMAL" }) as Paint;
const rect = (name: string, box: Rect, hex: string, extra: Partial<DesignNode> = {}) => node("RECTANGLE", name, box, { fills: [solid(hex)], ...extra });
const ring = (name: string, box: Rect, hex: string) =>
  node("ELLIPSE", name, box, { strokes: [solid(hex)], stroke: { weight: 1, align: "INSIDE", cap: "NONE", join: "MITER", miterLimit: 4 } as DesignNode["stroke"] });
const dot = (name: string, box: Rect, hex: string) => node("ELLIPSE", name, box, { fills: [solid(hex)] });
function text(chars: string, box: Rect, hex: string, size = 14): DesignNode {
  const data = {
    characters: chars,
    runs: [{ start: 0, end: chars.length, font: { family: "Inter", style: "Regular", postscript: "", weight: 400, italic: false }, fontSize: size, letterSpacing: 0, lineHeight: null, fills: [solid(hex)], decoration: "NONE", textCase: "ORIGINAL" }],
    alignH: "LEFT",
    alignV: "TOP",
    autoResize: "WIDTH_AND_HEIGHT",
    paragraphSpacing: 0,
    truncated: false,
    lines: [],
    glyphs: [],
    hasLayout: false,
  } as unknown as TextData;
  return node("TEXT", chars, box, { text: data, fills: [solid(hex)] });
}
const frame = (children: DesignNode[], w = 900, h = 675) => node("FRAME", "Frame", { x: 0, y: 0, w, h }, { fills: [solid("121923")] }, children);
const detect = (children: DesignNode[]) => detectWidgets(frame(children));

describe("tab bars of plain words", () => {
  it("finds the words as tabs, the one on a plate and coloured apart selected", () => {
    const plate = node("GROUP", "Group 1", { x: 109, y: 0, w: 88, h: 70 }, {}, [
      rect("Rectangle 126", { x: 109, y: 0, w: 88, h: 70 }, "1a2a44"),
      text("Aimbot", { x: 123, y: 25, w: 61, h: 21 }, "137cff", 17),
    ]);
    const r = detect([
      plate,
      text("Triggerbot", { x: 232, y: 25, w: 87, h: 21 }, "4e4f63", 17),
      text("Weapon", { x: 354, y: 25, w: 68, h: 21 }, "4e4f63", 17),
      text("Semirage", { x: 457, y: 25, w: 81, h: 21 }, "4e4f63", 17),
      text("Other", { x: 573, y: 25, w: 49, h: 21 }, "4e4f63", 17),
    ]);
    expect(r.navs).toHaveLength(1);
    const nav = r.navs[0];
    expect(nav.axis).toBe("horizontal");
    expect(nav.items.map((w) => w.label?.text)).toEqual(["Aimbot", "Triggerbot", "Weapon", "Semirage", "Other"]);
    expect(nav.selected).toBe(0);
    // Every tab is as tall as the selected one's plate.
    for (const item of nav.items) expect(item.rect.h).toBe(70);
  });
});

describe("key binds", () => {
  it("reads a wide box with a mouse button under a key caption as a key bind", () => {
    const r = detect([
      text("Aim key", { x: 102, y: 200, w: 51, h: 19 }, "828a9e"),
      rect("Rectangle 173", { x: 102, y: 250, w: 145, h: 35 }, "1e2537"),
      text("Mouse 1", { x: 148, y: 258, w: 53, h: 19 }, "747c93"),
    ]);
    expect(r.widgets.map((w) => w.kind)).toEqual(["keybind"]);
    expect(r.widgets[0].value).toBe("Mouse 1");
  });

  it("doesn't take a feature tag's word for a key", () => {
    const r = detect([rect("Rectangle 37", { x: 340, y: 601, w: 79, h: 22 }, "1d1e26"), text("FOV", { x: 370, y: 604, w: 19, h: 14 }, "ffffff", 10)]);
    expect(r.widgets.some((w) => w.kind === "keybind")).toBe(false);
  });
});

describe("checkboxes and radios", () => {
  it("doesn't take a status light for a radio", () => {
    const r = detect([dot("Ellipse 3", { x: 530, y: 128, w: 13, h: 13 }, "66709c"), text("Undetected", { x: 553, y: 125, w: 119, h: 19 }, "65709c")]);
    expect(r.widgets.filter((w) => w.kind === "radio" || w.kind === "checkbox")).toHaveLength(0);
  });

  it("finds a radio's dot painted under its ring (so it's checked)", () => {
    const r = detect([dot("Ellipse 17", { x: 109, y: 169, w: 8, h: 8 }, "2e9bfc"), ring("Ellipse 18", { x: 105, y: 165, w: 16, h: 16 }, "2e9bfc"), text("Enable", { x: 131, y: 165, w: 48, h: 15 }, "2e9bfc")]);
    const radio = r.widgets.find((w) => w.kind === "radio");
    expect(radio?.value).toBe(true);
    expect(radio?.label?.text).toBe("Enable");
  });

  it("doesn't take a picture next to a title for a checkbox", () => {
    const logo = node("RECTANGLE", "logo", { x: 181, y: 400, w: 25, h: 27 }, { fills: [{ type: "IMAGE", hash: "x", scaleMode: "FILL", opacity: 1, visible: true, blendMode: "NORMAL" } as Paint] });
    const r = detect([logo, text("Warface Lite", { x: 222, y: 405, w: 144, h: 13 }, "ffffff", 15)]);
    expect(r.widgets.filter((w) => w.kind === "checkbox" || w.kind === "radio")).toHaveLength(0);
  });
});

describe("sliders", () => {
  it("spans a fill that starts before the track, and takes its heading and number", () => {
    const r = detect([
      text("Settings", { x: 13, y: 525, w: 48, h: 24 }, "73799c", 12),
      text("Auto Pistol Interval", { x: 103, y: 497, w: 123, h: 24 }, "828a9e"),
      text("Interval between shots for automatic mode", { x: 103, y: 525, w: 231, h: 11 }, "4f5669", 11),
      rect("Rectangle 153", { x: 124, y: 550, w: 320, h: 9 }, "242f43", { corners: { tl: 5, tr: 5, br: 5, bl: 5, smoothing: 0 } }),
      rect("Rectangle 154", { x: 103, y: 550, w: 193, h: 9 }, "2e9bfc", { corners: { tl: 5, tr: 5, br: 5, bl: 5, smoothing: 0 } }),
      dot("Ellipse 16", { x: 278, y: 546, w: 18, h: 18 }, "d8def0"),
      text("3 ms", { x: 274, y: 567, w: 24, h: 11 }, "939ba8", 11),
    ]);
    const s = r.widgets.find((w) => w.kind === "slider")!;
    expect(s.label?.text).toBe("Auto Pistol Interval");
    expect(s.parts.value?.name).toBe("3 ms");
    expect(s.value as number).toBeCloseTo((287 - 103) / 341, 2);
  });
});

describe("text fields", () => {
  const input = (y: number, placeholder: string) =>
    node(
      "FRAME",
      "Input",
      { x: 24, y, w: 272, h: 40 },
      { fills: [solid("ffffff")], strokes: [solid("d9d9d9")], stroke: { weight: 1, align: "INSIDE", cap: "NONE", join: "MITER", miterLimit: 4 } as DesignNode["stroke"], corners: { tl: 8, tr: 8, br: 8, bl: 8, smoothing: 0 } },
      [text(placeholder, { x: 40, y: y + 9, w: 40, h: 22 }, "8a8a8a", 16)],
    );

  it("names a field after the label above it, and masks one labelled Password", () => {
    const r = detectWidgets(
      node("FRAME", "Form Log In", { x: 0, y: 0, w: 320, h: 322 }, { fills: [solid("ffffff")] }, [
        text("Email", { x: 24, y: 24, w: 40, h: 22 }, "1e1e1e", 16),
        input(54, "Value"),
        text("Password", { x: 24, y: 118, w: 70, h: 22 }, "1e1e1e", 16),
        input(148, "Value"),
      ]),
    );
    const fields = r.widgets.filter((w) => w.kind === "text_field");
    expect(fields.map((w) => w.label?.text)).toEqual(["Email", "Password"]);
    expect(fields.map((w) => w.value)).toEqual(["text", "password"]);
  });

  it("doesn't take the tab beside a search box for its label", () => {
    const search = node("FRAME", "Search", { x: 650, y: 15, w: 235, h: 40 }, { fills: [solid("121923")], strokes: [solid("272f3c")], stroke: { weight: 1, align: "INSIDE", cap: "NONE", join: "MITER", miterLimit: 4 } as DesignNode["stroke"] }, [
      text("Search", { x: 690, y: 25, w: 50, h: 20 }, "4e4f63", 14),
    ]);
    const r = detect([text("Other", { x: 573, y: 25, w: 49, h: 21 }, "4e4f63", 17), search]);
    const field = r.widgets.find((w) => w.kind === "text_field");
    expect(field).toBeDefined();
    expect(field?.label).toBeUndefined();
  });
});

describe("buttons", () => {
  it("makes a hexagon plate with an icon and a caption under it one captioned button", () => {
    const icon = node("VECTOR", "Vector", { x: 30, y: 111, w: 14, h: 18 }, { fills: [solid("2e9bfc")] });
    const plate = node("POLYGON", "плашка", { x: 12, y: 95, w: 50, h: 50 }, { fills: [{ ...solid("255582"), opacity: 0.5 } as Paint] });
    const r = detect([plate, icon, text("Legitbot", { x: 13, y: 145, w: 49, h: 24 }, "2e9bfc", 12)]);
    const b = r.widgets.find((w) => w.kind === "button");
    expect(b?.label?.text).toBe("Legitbot");
    expect(b?.rect.h).toBeGreaterThan(50);
  });

  it("doesn't take a sentence on a plate for a button", () => {
    const r = detect([
      rect("Rectangle 30", { x: 276, y: 526, w: 920, h: 66 }, "16171e"),
      text("Ne yazık ki, şüpheli faaliyetleriniz nedeniyle kara listeye alındınız.", { x: 293, y: 543, w: 899, h: 30 }, "ffffff", 24),
    ]);
    expect(r.widgets).toHaveLength(0);
  });

  it("doesn't count 'Rectangle' as a layer named like a button", () => {
    const r = detect([rect("Rectangle 5", { x: 100, y: 100, w: 120, h: 40 }, "3355ff"), text("Play", { x: 145, y: 110, w: 30, h: 20 }, "ffffff")]);
    expect(r.widgets[0]?.evidence.score).toBe(0.7);
  });
});

const card = (name: string, box: Rect) => rect(name, box, "15171c", { corners: { tl: 18, tr: 18, br: 18, bl: 18, smoothing: 0 } });
const icon = (name: string, box: Rect) => node("FRAME", name, box, {}, [node("VECTOR", "Vector", { x: box.x + 2, y: box.y + 2, w: box.w - 4, h: box.h - 4 }, { fills: [solid("a3a6af")] })]);
function toggleAt(x: number, y: number): DesignNode[] {
  return [
    rect("Toggle", { x, y, w: 38, h: 22 }, "ff615c", { corners: { tl: 11, tr: 11, br: 11, bl: 11, smoothing: 0 } }),
    dot("Thumb", { x: x + 18, y: y + 2, w: 18, h: 18 }, "ffffff"),
  ];
}

describe("labels", () => {
  it("come from the control's own card, not the card beside it however close", () => {
    const r = detect([
      card("Security", { x: 20, y: 20, w: 370, h: 200 }),
      text("Stateful firewall", { x: 40, y: 50, w: 100, h: 15 }, "a3a6af", 12),
      ...toggleAt(330, 46),
      card("Device", { x: 408, y: 20, w: 370, h: 200 }),
      text("Model", { x: 428, y: 50, w: 40, h: 15 }, "686c76", 12),
    ]);
    const t = r.widgets.find((w) => w.kind === "toggle");
    expect(t?.label?.text).toBe("Stateful firewall");
  });
});

describe("what isn't a control", () => {
  it("grey words on a box you can't see aren't a text field", () => {
    const clear = { ...solid("000000"), opacity: 0 } as Paint;
    const r = detect([
      node("FRAME", "Navigation item", { x: 16, y: 196, w: 204, h: 42 }, { fills: [clear] }, [icon("radio", { x: 26, y: 207, w: 20, h: 20 }), text("Network", { x: 57, y: 209, w: 60, h: 16 }, "8a8d96", 13)]),
    ]);
    expect(r.widgets.some((w) => w.kind === "text_field")).toBe(false);
  });

  it("an icon tile leading a heading is neither a checkbox nor a button", () => {
    const r = detect([
      card("Card", { x: 20, y: 20, w: 370, h: 200 }),
      rect("Icon tile", { x: 40, y: 40, w: 34, h: 34 }, "21242a", { corners: { tl: 10, tr: 10, br: 10, bl: 10, smoothing: 0 } }),
      icon("shield-check", { x: 49, y: 49, w: 16, h: 16 }),
      text("Security", { x: 86, y: 40, w: 80, h: 19 }, "f5f5f7", 16),
      text("Traffic and device protection", { x: 86, y: 61, w: 180, h: 13 }, "686c76", 11),
    ]);
    expect(r.widgets.filter((w) => w.kind === "checkbox" || w.kind === "button" || w.kind === "icon_button")).toEqual([]);
  });

  it("an icon named in kebab case isn't a tagged control", () => {
    const r = detect([icon("radio-tower", { x: 40, y: 40, w: 16, h: 16 })]);
    expect(r.widgets.some((w) => w.kind === "radio")).toBe(false);
  });

  it("a dot on a card near the top right isn't a window button", () => {
    const r = detectWidgets(
      frame([card("Live signal", { x: 988, y: 94, w: 422, h: 244 }), icon("activity", { x: 1021, y: 127, w: 16, h: 16 }), dot("Signal pulse", { x: 1378, y: 129, w: 8, h: 8 }, "ff615c")], 1440, 1024),
    );
    expect(r.widgets.some((w) => w.kind === "window_button")).toBe(false);
  });

  it("a big dial showing a number is a readout, not a button", () => {
    const r = detect([
      card("Card", { x: 20, y: 20, w: 400, h: 200 }),
      ring("Gauge track", { x: 40, y: 40, w: 104, h: 104 }, "21242a"),
      text("−67", { x: 70, y: 72, w: 43, h: 27 }, "f5f5f7", 22),
      text("dBm", { x: 81, y: 100, w: 22, h: 12 }, "686c76", 10),
    ]);
    expect(r.widgets.some((w) => w.kind === "button")).toBe(false);
  });
});

describe("controls named by their component", () => {
  it("an instance of a checkbox component drawn as one picture is a checkbox, checked as its variant says", () => {
    const tick = node("INSTANCE", "check_small", { x: 479, y: 103, w: 24, h: 24 }, {}, [node("VECTOR", "icon", { x: 485, y: 110, w: 12, h: 9 }, { fills: [solid("ffffff")] })]);
    const layer = node("FRAME", "state-layer", { x: 471, y: 95, w: 40, h: 40 }, {}, [rect("container", { x: 482, y: 106, w: 18, h: 18 }, "39ff07"), tick]);
    const instance = node("INSTANCE", "Checkboxes", { x: 456, y: 83, w: 69, h: 64 }, { component: { id: "c", name: "Type=Selected, State=Enabled", set: { id: "s", name: "Checkboxes" } } } as Partial<DesignNode>, [layer]);
    const r = detect([card("Panel", { x: 215, y: 73, w: 292, h: 533 }), text("Aimbot", { x: 221, y: 108, w: 60, h: 20 }, "ffffff", 16), instance]);
    const c = r.widgets.find((w) => w.kind === "checkbox");
    expect(c?.label?.text).toBe("Aimbot");
    expect(c?.value).toBe(true);
    expect(c?.parts.box?.name).toBe("container");
    expect(c?.parts.mark?.name).toBe("icon");
  });
});
