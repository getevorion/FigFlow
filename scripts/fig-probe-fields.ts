// Dev probe: prints the raw Kiwi fields of the first node of each interesting kind in a .fig.
// usage: tsx scripts/fig-probe-fields.ts <file.fig>
import { readFileSync } from "node:fs";
import { getBlobBytes, parseCommandsBlob, readFigFile } from "../src/engine/fig/kiwi/index";
import type { NodeChange } from "../src/engine/fig/kiwi/schema";

const file = process.argv[2];
const { message } = readFigFile(new Uint8Array(readFileSync(file)));
const nodes: NodeChange[] = message.nodeChanges ?? [];
const trim = (_k: string, v: unknown) => (v instanceof Uint8Array ? `<bytes ${v.length}>` : Array.isArray(v) && v.length > 4 ? [...v.slice(0, 4), `+${v.length - 4}`] : v);
const pick = (pred: (n: NodeChange) => unknown, label: string, fields: string[]) => {
  const n = nodes.find((x) => !!pred(x));
  if (!n) {
    console.log(label, ": none");
    return;
  }
  const raw = n as unknown as Record<string, unknown>;
  const o: Record<string, unknown> = {};
  for (const f of fields) if (raw[f] !== undefined) o[f] = raw[f];
  console.log(`\n== ${label} ${n.type} ${JSON.stringify(n.name)}`, JSON.stringify(o, trim));
};
pick((n) => n.fillPaints?.some((p) => p.type === "GRADIENT_LINEAR"), "linear gradient", ["fillPaints", "size"]);
pick((n) => n.fillPaints?.some((p) => p.type === "IMAGE"), "image paint", ["fillPaints", "size"]);
pick((n) => n.effects?.some((e) => e.type === "DROP_SHADOW"), "drop shadow", ["effects"]);
pick((n) => n.effects?.some((e) => e.type === "BACKGROUND_BLUR"), "bg blur", ["effects"]);
pick((n) => n.stackMode === "HORIZONTAL" || n.stackMode === "VERTICAL", "auto layout", ["stackMode", "stackSpacing", "stackPadding", "stackHorizontalPadding", "stackVerticalPadding", "stackPaddingRight", "stackPaddingBottom", "stackPrimaryAlignItems", "stackCounterAlignItems", "stackPrimarySizing", "stackCounterSizing", "stackWrap", "frameMaskDisabled", "resizeToFit", "size"]);
pick((n) => n.stackChildPrimaryGrow || n.stackChildAlignSelf, "layout child", ["stackChildPrimaryGrow", "stackChildAlignSelf", "stackPositioning", "horizontalConstraint", "verticalConstraint"]);
pick((n) => n.rectangleCornerRadiiIndependent, "independent corners", ["cornerRadius", "rectangleTopLeftCornerRadius", "rectangleTopRightCornerRadius", "rectangleBottomRightCornerRadius", "rectangleBottomLeftCornerRadius", "rectangleCornerRadiiIndependent", "cornerSmoothing"]);
pick((n) => n.type === "VECTOR" && n.fillGeometry?.length, "vector geom", ["fillGeometry", "strokeGeometry", "vectorData", "size", "strokeWeight", "strokeAlign"]);
pick((n) => n.prototypeInteractions?.length, "prototype", ["prototypeInteractions"]);
pick((n) => n.type === "VARIABLE", "variable", ["name", "key", "variableResolvedType", "variableDataValues", "variableSetID"]);
pick((n) => n.isStateGroup, "component set", ["isStateGroup", "stateGroupPropertyValueOrders", "componentPropDefs"]);
pick((n) => n.type === "SYMBOL" && n.variantPropSpecs?.length, "variant symbol", ["variantPropSpecs", "name"]);
pick((n) => n.styleIdForFill, "fill style ref", ["styleIdForFill", "inheritFillStyleID"]);
pick((n) => n.overrideKey, "overrideKey", ["overrideKey", "guid"]);
pick((n) => n.mask, "mask", ["mask", "maskType", "maskIsOutline"]);
pick((n) => n.borderStrokeWeightsIndependent, "border sides", ["borderTopWeight", "borderRightWeight", "borderBottomWeight", "borderLeftWeight", "strokeWeight", "strokeAlign"]);
pick((n) => n.fillPaints?.some((p) => p.colorVar), "colorVar paint", ["fillPaints"]);
// Glyph outline space.
const t = nodes.find((n) => n.type === "TEXT" && n.derivedTextData?.glyphs?.length);
const g = t?.derivedTextData?.glyphs?.find((x) => x.commandsBlob !== undefined);
if (t && g && g.commandsBlob !== undefined) {
  const cmds = parseCommandsBlob(getBlobBytes(g.commandsBlob, message)!);
  console.log("\n== glyph", JSON.stringify(t.textData?.characters?.slice(0, 20)), "fontSize", g.fontSize, "cmds:", JSON.stringify(cmds?.slice(0, 18)));
}
