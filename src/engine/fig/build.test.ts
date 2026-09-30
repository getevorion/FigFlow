import { describe, expect, it } from "vitest";
import type { Message, NodeChange } from "./kiwi/schema";
import { DesignBuilder } from "./build";
import { RawIndex } from "./raw";
import type { DesignNode } from "../model/types";
import { renderSvg } from "../render/svg";

const g = (sessionID: number, localID: number) => ({ sessionID, localID });
const at = (x: number, y: number) => ({ m00: 1, m01: 0, m02: x, m10: 0, m11: 1, m12: y });
const solid = (r: number, gr: number, b: number) => ({ type: "SOLID", color: { r, g: gr, b, a: 1 }, opacity: 1, visible: true, blendMode: "NORMAL" });

/** A file whose component came from a library: its layers have new guids, and overrides address them by overrideKey. */
function libraryFile(): Message {
  const nodes = [
    { guid: g(0, 0), type: "DOCUMENT", name: "Document" },
    { guid: g(0, 1), type: "CANVAS", name: "Page 1", parentIndex: { guid: g(0, 0), position: "a" } },
    // The component, copied in from a library: guid 4:x here, overrideKey 51:x from the library.
    { guid: g(4, 1), overrideKey: g(51, 1), type: "SYMBOL", name: "Checkbox", size: { x: 48, y: 48 }, transform: at(500, 0), parentIndex: { guid: g(0, 1), position: "b" } },
    { guid: g(4, 2), overrideKey: g(51, 2), type: "RECTANGLE", name: "container", size: { x: 18, y: 18 }, transform: at(4, 4), fillPaints: [solid(0.4, 0.31, 0.64)], parentIndex: { guid: g(4, 1), position: "a" } },
    { guid: g(9, 1), type: "FRAME", name: "Screen", size: { x: 200, y: 100 }, transform: at(0, 0), parentIndex: { guid: g(0, 1), position: "a" } },
    {
      guid: g(9, 2),
      type: "INSTANCE",
      name: "Checkbox",
      size: { x: 69, y: 64 },
      transform: at(10, 10),
      parentIndex: { guid: g(9, 1), position: "a" },
      symbolData: { symbolID: g(4, 1), symbolOverrides: [{ guidPath: { guids: [g(51, 2)] }, fillPaints: [solid(0.22, 1, 0.03)] }] },
      // Figma's layout of the resized instance: the container re-centred.
      derivedSymbolData: [{ guidPath: { guids: [g(51, 2)] }, transform: at(25.5, 23) }],
    },
  ];
  return { nodeChanges: nodes as unknown as NodeChange[] } as Message;
}

const find = (n: DesignNode, name: string): DesignNode | undefined => (n.name === name ? n : n.children.map((c) => find(c, name)).find(Boolean));

/** A Light/Dark component set whose "Mode" is bound to a string variable, and a frame in Dark mode holding a Light instance. */
function themedFile(): Message {
  const nodes = [
    { guid: g(0, 0), type: "DOCUMENT", name: "Document" },
    { guid: g(0, 1), type: "CANVAS", name: "Page 1", parentIndex: { guid: g(0, 0), position: "a" } },
    { guid: g(7, 1), type: "VARIABLE_SET", name: "Colors", variableSetModes: [{ id: g(8, 0), sortPosition: "a" }, { id: g(8, 1), sortPosition: "b" }] },
    {
      guid: g(7, 2),
      type: "VARIABLE",
      name: "Mode",
      variableSetID: { guid: g(7, 1) },
      variableResolvedType: "STRING",
      variableDataValues: { entries: [{ modeID: g(8, 0), variableData: { value: { textValue: "Light" } } }, { modeID: g(8, 1), variableData: { value: { textValue: "Dark" } } }] },
    },
    { guid: g(5, 0), type: "FRAME", name: "BG", isStateGroup: true, size: { x: 100, y: 40 }, transform: at(400, 0), parentIndex: { guid: g(0, 1), position: "b" } },
    { guid: g(5, 1), type: "SYMBOL", name: "Mode=Light", size: { x: 40, y: 20 }, transform: at(0, 0), parentIndex: { guid: g(5, 0), position: "a" } },
    { guid: g(5, 11), type: "RECTANGLE", name: "fill", size: { x: 40, y: 20 }, transform: at(0, 0), fillPaints: [solid(1, 1, 1)], parentIndex: { guid: g(5, 1), position: "a" } },
    { guid: g(5, 2), type: "SYMBOL", name: "Mode=Dark", size: { x: 40, y: 20 }, transform: at(50, 0), parentIndex: { guid: g(5, 0), position: "b" } },
    { guid: g(5, 21), type: "RECTANGLE", name: "fill", size: { x: 40, y: 20 }, transform: at(0, 0), fillPaints: [solid(0, 0, 0)], parentIndex: { guid: g(5, 2), position: "a" } },
    {
      guid: g(9, 1),
      type: "FRAME",
      name: "Screen",
      size: { x: 200, y: 100 },
      transform: at(0, 0),
      parentIndex: { guid: g(0, 1), position: "a" },
      variableModeBySetMap: { entries: [{ variableSetID: { guid: g(7, 1) }, variableModeID: g(8, 1) }] },
    },
    {
      guid: g(9, 2),
      type: "INSTANCE",
      name: "BG",
      size: { x: 40, y: 20 },
      transform: at(10, 10),
      parentIndex: { guid: g(9, 1), position: "a" },
      symbolData: { symbolID: g(5, 1) },
      variableConsumptionMap: {
        entries: [
          {
            variableField: "VARIANT_PROPERTIES",
            variableData: { value: { expressionValue: { expressionFunction: "RESOLVE_VARIANT", expressionArguments: [{ value: { mapValue: { values: [{ key: "Mode", value: { value: { alias: { guid: g(7, 2) } } } }] } } }] } } },
          },
        ],
      },
    },
  ];
  return { nodeChanges: nodes as unknown as NodeChange[] } as Message;
}

/** A commands blob (1 M, 2 L, 0 Z, then float32 coordinates) of a closed polygon. */
function polygon(...pts: Array<[number, number]>): { bytes: Uint8Array } {
  const buf = new DataView(new ArrayBuffer(pts.length * 9 + 1));
  pts.forEach(([x, y], i) => {
    buf.setUint8(i * 9, i ? 2 : 1);
    buf.setFloat32(i * 9 + 1, x, true);
    buf.setFloat32(i * 9 + 5, y, true);
  });
  buf.setUint8(pts.length * 9, 0);
  return { bytes: new Uint8Array(buf.buffer) };
}

/** A vector network with its left half paint-bucketed red; the right half keeps the layer's blue. */
function bucketFile(): Message {
  const nodes = [
    { guid: g(0, 0), type: "DOCUMENT", name: "Document" },
    { guid: g(0, 1), type: "CANVAS", name: "Page 1", parentIndex: { guid: g(0, 0), position: "a" } },
    { guid: g(9, 1), type: "FRAME", name: "Screen", size: { x: 40, y: 20 }, transform: at(0, 0), parentIndex: { guid: g(0, 1), position: "a" } },
    {
      guid: g(9, 2),
      type: "VECTOR",
      name: "Halves",
      size: { x: 40, y: 20 },
      transform: at(0, 0),
      parentIndex: { guid: g(9, 1), position: "a" },
      fillPaints: [solid(0, 0, 1)],
      fillGeometry: [
        { windingRule: "NONZERO", commandsBlob: 0, styleID: 3 },
        { windingRule: "NONZERO", commandsBlob: 1, styleID: 0 },
      ],
      vectorData: { styleOverrideTable: [{ styleID: 1, strokeCap: "ROUND" }, { styleID: 3, fillPaints: [solid(1, 0, 0)] }] },
    },
  ];
  return { nodeChanges: nodes as unknown as NodeChange[], blobs: [polygon([0, 0], [20, 0], [20, 20], [0, 20]), polygon([20, 0], [40, 0], [40, 20], [20, 20])] } as Message;
}

describe("vector regions filled on their own", () => {
  it("keep their fills, and the other regions the layer's", () => {
    const built = new DesignBuilder(new RawIndex(bucketFile())).build("9:1");
    const halves = find(built.root, "Halves")!;
    const [left, right] = halves.fillGeometry;
    expect(left.fills?.[0].type === "SOLID" && left.fills[0].color.r).toBe(1);
    expect(right.fills).toBeUndefined();
    const svg = renderSvg(built.root, { imageHref: () => undefined, glyphs: [] });
    expect(svg).toContain(`fill="rgb(255,0,0)"`);
    expect(svg).toContain(`fill="rgb(0,0,255)"`);
  });
});

/** A component whose boolean operation (a red result) subtracts green operands, and an instance overriding an operand. */
function booleanFile(): Message {
  const nodes = [
    { guid: g(0, 0), type: "DOCUMENT", name: "Document" },
    { guid: g(0, 1), type: "CANVAS", name: "Page 1", parentIndex: { guid: g(0, 0), position: "a" } },
    { guid: g(4, 1), type: "SYMBOL", name: "Icon", size: { x: 40, y: 20 }, transform: at(100, 0), parentIndex: { guid: g(0, 1), position: "b" } },
    {
      guid: g(4, 2),
      type: "BOOLEAN_OPERATION",
      name: "Cut",
      booleanOperation: "SUBTRACT",
      size: { x: 40, y: 20 },
      transform: at(0, 0),
      fillPaints: [solid(1, 0, 0)],
      fillGeometry: [{ windingRule: "NONZERO", commandsBlob: 0 }],
      parentIndex: { guid: g(4, 1), position: "a" },
    },
    { guid: g(4, 3), type: "RECTANGLE", name: "Operand", size: { x: 40, y: 20 }, transform: at(0, 0), fillPaints: [solid(0, 1, 0)], parentIndex: { guid: g(4, 2), position: "a" } },
    { guid: g(4, 4), type: "RECTANGLE", name: "Hole", size: { x: 20, y: 20 }, transform: at(20, 0), fillPaints: [solid(0, 1, 0)], parentIndex: { guid: g(4, 2), position: "b" } },
    { guid: g(9, 1), type: "FRAME", name: "Screen", size: { x: 40, y: 20 }, transform: at(0, 0), parentIndex: { guid: g(0, 1), position: "a" } },
    {
      guid: g(9, 2),
      type: "INSTANCE",
      name: "Icon",
      size: { x: 40, y: 20 },
      transform: at(0, 0),
      parentIndex: { guid: g(9, 1), position: "a" },
      symbolData: { symbolID: g(4, 1), symbolOverrides: [{ guidPath: { guids: [g(4, 3)] }, fillPaints: [solid(0, 0, 1)] }] },
    },
  ];
  return { nodeChanges: nodes as unknown as NodeChange[], blobs: [polygon([0, 0], [20, 0], [20, 20], [0, 20])] } as Message;
}

describe("boolean operations", () => {
  it("draw their saved result in their own paints, never their operands", () => {
    const built = new DesignBuilder(new RawIndex(booleanFile())).build("9:1");
    const cut = find(built.root, "Cut")!;
    expect(cut.children).toEqual([]);
    expect(find(built.root, "Operand")).toBeUndefined();
    const svg = renderSvg(built.root, { imageHref: () => undefined, glyphs: [] });
    expect(svg).toContain(`fill="rgb(255,0,0)"`);
    expect(svg).not.toContain(`fill="rgb(0,255,0)"`);
    expect(svg).not.toContain(`fill="rgb(0,0,255)"`);
  });

  it("still take overrides addressed to their operands", () => {
    const built = new DesignBuilder(new RawIndex(booleanFile())).build("9:1");
    expect(built.unmatchedOverrides).toEqual([]);
  });
});

/** A 20x20 vector square with a 10px stroke of the given alignment, its geometry saved as Figma does. */
function strokedFile(strokeAlign: string): Message {
  const nodes = [
    { guid: g(0, 0), type: "DOCUMENT", name: "Document" },
    { guid: g(0, 1), type: "CANVAS", name: "Page 1", parentIndex: { guid: g(0, 0), position: "a" } },
    { guid: g(9, 1), type: "FRAME", name: "Screen", size: { x: 80, y: 80 }, transform: at(0, 0), parentIndex: { guid: g(0, 1), position: "a" } },
    {
      guid: g(9, 2),
      type: "VECTOR",
      name: "Square",
      size: { x: 20, y: 20 },
      transform: at(30, 30),
      parentIndex: { guid: g(9, 1), position: "a" },
      fillPaints: [solid(1, 0, 0)],
      strokePaints: [solid(0, 0, 0)],
      strokeWeight: 10,
      strokeAlign,
      fillGeometry: [{ windingRule: "NONZERO", commandsBlob: 0 }],
      // Inside and outside strokes alike: a centred stroke twice as wide.
      strokeGeometry: [{ windingRule: "NONZERO", commandsBlob: 1 }],
    },
  ];
  const ring = polygon([-10, -10], [30, -10], [30, 30], [-10, 30]);
  return { nodeChanges: nodes as unknown as NodeChange[], blobs: [polygon([0, 0], [20, 0], [20, 20], [0, 20]), ring] } as Message;
}

describe("strokes saved as geometry", () => {
  const svgOf = (align: string) => {
    const built = new DesignBuilder(new RawIndex(strokedFile(align))).build("9:1");
    return renderSvg(built.root, { imageHref: () => undefined, glyphs: [] });
  };

  it("keep an inside stroke to the fill shape", () => {
    const svg = svgOf("INSIDE");
    expect(svg).toMatch(/<clipPath id="([^"]+)"><path d="M0 0L20 0L20 20L0 20Z"\/><\/clipPath>.*<g clip-path="url\(#\1\)"><path d="M-10 -10/);
  });

  it("keep an outside stroke off the fill shape", () => {
    const svg = svgOf("OUTSIDE");
    expect(svg).toMatch(/<mask id="([^"]+)"[^>]*><rect [^>]*fill="#fff"\/><path d="M0 0L20 0L20 20L0 20Z" fill="#000"\/><\/mask>.*<g mask="url\(#\1\)"><path d="M-10 -10/);
  });

  it("draw a centred stroke as saved", () => {
    const svg = svgOf("CENTER");
    expect(svg).toContain(`fill="rgb(255,0,0)"/><path d="M-10 -10L30 -10L30 30L-10 30Z" fill="rgb(0,0,0)"/>`);
    expect(svg).not.toContain("<mask");
  });
});

describe("images the file can't draw", () => {
  const image = (hex: string) => ({ type: "IMAGE", image: { hash: Uint8Array.from(hex.match(/../g)!.map((b) => parseInt(b, 16))) }, imageScaleMode: "FILL", opacity: 1, visible: true, blendMode: "NORMAL" });
  const file = (): Message =>
    ({
      nodeChanges: [
        { guid: g(0, 0), type: "DOCUMENT", name: "Document" },
        { guid: g(0, 1), type: "CANVAS", name: "Page 1", parentIndex: { guid: g(0, 0), position: "a" } },
        { guid: g(9, 1), type: "FRAME", name: "Screen", size: { x: 100, y: 50 }, transform: at(0, 0), parentIndex: { guid: g(0, 1), position: "a" } },
        { guid: g(9, 2), type: "RECTANGLE", name: "Gone", size: { x: 40, y: 40 }, transform: at(0, 0), fillPaints: [image("aa".repeat(20))], parentIndex: { guid: g(9, 1), position: "a" } },
        { guid: g(9, 3), type: "RECTANGLE", name: "Garbage", size: { x: 40, y: 40 }, transform: at(50, 0), fillPaints: [image("bb".repeat(20))], parentIndex: { guid: g(9, 1), position: "b" } },
        { guid: g(9, 4), type: "RECTANGLE", name: "Photo", size: { x: 40, y: 40 }, transform: at(50, 0), fillPaints: [image("cc".repeat(20))], parentIndex: { guid: g(9, 1), position: "c" } },
      ] as unknown as NodeChange[],
    }) as Message;
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

  it("are reported on the layers using them", () => {
    const bytes = new Map([["bb".repeat(20), Uint8Array.from([1, 2, 3, 4, 5, 6, 7])], ["cc".repeat(20), png]]);
    const built = new DesignBuilder(new RawIndex(file()), bytes).build("9:1");
    expect(built.warnings.map((w) => [w.code, w.nodeName])).toEqual([
      ["image-missing", "Gone"],
      ["image-unreadable", "Garbage"],
    ]);
  });
});

describe("image fills turned with Rotate 90°", () => {
  const hex = "dd".repeat(20);
  /** A 40x20 layer filled with a 10x20 (portrait) image. */
  const svgOf = (paint: Record<string, unknown>) => {
    const nodes = [
      { guid: g(0, 0), type: "DOCUMENT", name: "Document" },
      { guid: g(0, 1), type: "CANVAS", name: "Page 1", parentIndex: { guid: g(0, 0), position: "a" } },
      { guid: g(9, 1), type: "FRAME", name: "Screen", size: { x: 40, y: 20 }, transform: at(0, 0), parentIndex: { guid: g(0, 1), position: "a" } },
      {
        guid: g(9, 2),
        type: "RECTANGLE",
        name: "Picture",
        size: { x: 40, y: 20 },
        transform: at(0, 0),
        parentIndex: { guid: g(9, 1), position: "a" },
        fillPaints: [{ type: "IMAGE", image: { hash: Uint8Array.from(hex.match(/../g)!.map((b) => parseInt(b, 16))) }, originalImageWidth: 10, originalImageHeight: 20, opacity: 1, visible: true, blendMode: "NORMAL", ...paint }],
      },
    ];
    const built = new DesignBuilder(new RawIndex({ nodeChanges: nodes } as unknown as Message)).build("9:1");
    return renderSvg(built.root, { imageHref: (h) => (h === hex ? "data:image/png;base64,AA==" : undefined), glyphs: [] });
  };

  it("fill the layer turned clockwise, sides swapped", () => {
    // Turned, the image is 20x10: filling 40x20 doubles it, so it's drawn 20x40 before turning.
    expect(svgOf({ imageScaleMode: "FILL", rotation: 90 })).toContain(`transform="translate(20 10) rotate(90) scale(20 40) translate(-0.5 -0.5)"`);
  });

  it("count whole turns only (Figma's rotation keeps adding up)", () => {
    expect(svgOf({ imageScaleMode: "FILL", rotation: 450 })).toContain("rotate(90)");
    expect(svgOf({ imageScaleMode: "FILL", rotation: 360 })).not.toContain("rotate(");
  });

  it("tile the turned image from the layer's corner", () => {
    const svg = svgOf({ imageScaleMode: "TILE", rotation: 270, scale: 1 });
    expect(svg).toMatch(/<pattern id="[^"]+" patternUnits="userSpaceOnUse" width="20" height="10"><use href="#/);
    expect(svg).toContain(`transform="translate(10 5) rotate(270) scale(10 20) translate(-0.5 -0.5)"`);
  });
});

describe("variant properties bound to variables", () => {
  it("pick the variant the frame's mode resolves to", () => {
    const built = new DesignBuilder(new RawIndex(themedFile())).build("9:1");
    const bg = find(built.root, "BG")!;
    expect(bg.component?.name).toBe("Mode=Dark");
    const fill = find(bg, "fill")!.fills[0];
    expect(fill.type === "SOLID" && fill.color.r).toBe(0);
  });
});

describe("instances of library components", () => {
  it("apply overrides and Figma's derived layout addressed by overrideKey", () => {
    const built = new DesignBuilder(new RawIndex(libraryFile())).build("9:1");
    const container = find(built.root, "container")!;
    expect(container.box.x).toBeCloseTo(35.5);
    expect(container.box.y).toBeCloseTo(33);
    const fill = container.fills[0];
    expect(fill.type === "SOLID" && fill.color.g).toBeCloseTo(1);
    expect(built.unmatchedOverrides).toEqual([]);
  });

  it("keep node ids spelled in guids", () => {
    const built = new DesignBuilder(new RawIndex(libraryFile())).build("9:1");
    expect(find(built.root, "container")!.id).toBe("9:2;4:2");
  });
});
