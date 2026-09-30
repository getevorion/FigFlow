/**
 * Builds normalized DesignNode trees from the raw Kiwi index.
 *
 * Instances store no children in the file: each is expanded from its main
 * component (SYMBOL), then, in increasing precedence,
 *   1. component property assignments (text, visibility, instance swap),
 *   2. the nested instance's own overrides (defined inside the outer master),
 *   3. the outer instance's symbolOverrides for that guidPath,
 *   4. the outermost instance's derivedSymbolData (Figma's re-flowed sizes,
 *      transforms, text layout and geometry after overrides and auto layout).
 * guidPaths address master descendants by GUID from the outermost instance
 * down, e.g. "18:9047/34:12128" = node 34:12128 inside nested instance 18:9047.
 */
import type { NodeChange } from "./kiwi/schema";
import { RawIndex, guidKey, isNoneGuid, type GUID, type VariableModes, type VariableRefData } from "./raw";
import { GlyphTable, resolvePaths, vectorNetworkToPaths, type RegionFills } from "./geometry";
import { resolveCorners, resolveEffects, resolvePaints, resolveStroke } from "./style";
import { resolveText } from "./text";
import { IDENTITY, mul, transformedBounds } from "../model/math";
import { drawnFills } from "../model/paint";
import { isDrawableImage } from "../util/mime";
import type {
  AutoLayout,
  Constraint,
  DesignNode,
  DesignWarning,
  ImagePaint,
  LayoutChild,
  Mat,
  NodeKind,
  Paint,
  Reaction,
  Vec2,
} from "../model/types";

type AnyRec = Record<string, unknown>;
type Partial = AnyRec & Partial_;
type Partial_ = { [K in keyof NodeChange]?: NodeChange[K] };

const MAX_INSTANCE_DEPTH = 24;

/** Fields an override or derived entry may carry that are not visual/structural data. */
const META_FIELDS = new Set(["guidPath", "guid", "parentIndex", "phase", "type", "guidTag", "parentIndexTag", "typeTag"]);

type ExpandCtx = {
  /**
   * Path key prefix inside the outermost instance ("" at the outermost master level), spelled in
   * override keys: guidPaths address master descendants by `overrideKey`, which a component copied
   * in from a library keeps from the library while its guids are new.
   */
  prefix: string;
  /** The same path spelled in guids, for node ids. */
  idPrefix: string;
  /** Override and derived path keys that landed on a node, for the outermost instance being expanded. */
  used: Set<string>;
  /** Overrides by full path key; the first entry of each list has the highest precedence. */
  overrides: Map<string, Partial[]>;
  /** Derived data by full path key (outermost instance wins). */
  derived: Map<string, Partial>;
  /** Component property values by prop def key, for the master currently being expanded. */
  props: Map<string, PropValue>;
  /** Id prefix that makes clone ids unique ("instanceId;"). */
  idBase: string;
  depth: number;
  stack: string[];
  /** Resize of this master relative to its instance, for constraint fallback. */
  resize?: { from: Vec2; to: Vec2 };
  /** Variable modes in effect (explicit modes set on this node's ancestors). */
  modes: VariableModes;
};

type PropValue = { text?: string; bool?: boolean; swap?: GUID; variant?: string };

export type BuildResult = {
  root: DesignNode;
  glyphs: string[];
  images: Set<string>;
  fonts: Map<string, { family: string; style: string; postscript: string; weight: number; italic: boolean; layers: number }>;
  /** Main components referenced by instances in this tree, by guid. */
  components: Map<string, { id: string; name: string; setId?: string; setName?: string; uses: number }>;
  warnings: DesignWarning[];
  /** Instance overrides and derived data whose guidPath matched no layer (so they weren't applied). */
  unmatchedOverrides: Array<{ instance: string; id: string; keys: string[] }>;
};

export class DesignBuilder {
  private glyphs: GlyphTable;
  private images = new Set<string>();
  private fonts: BuildResult["fonts"] = new Map();
  private components: BuildResult["components"] = new Map();
  private warnings: DesignWarning[] = [];
  private warned = new Set<string>();
  private unmatched: BuildResult["unmatchedOverrides"] = [];
  /**
   * Above zero while expanding a boolean operation's operands: they are built only so overrides
   * addressed to them count as landed, and register no fonts, images, components or warnings.
   */
  private inert = 0;

  /** `images`: the file's image bytes by hash, to report images a layer uses that the file can't draw. */
  constructor(
    private index: RawIndex,
    private imageBytes?: ReadonlyMap<string, Uint8Array>,
  ) {
    this.glyphs = new GlyphTable(index);
  }

  private noteImage(p: ImagePaint, node: { id: string; name: string }) {
    if (this.inert) return;
    this.images.add(p.hash);
    if (p.visible && p.filters && Object.values(p.filters).some((v) => v)) {
      this.warn("image-adjustments", "Image adjustments (exposure, contrast, saturation, temperature, tint, highlights, shadows) aren't reproduced; the image is drawn unadjusted.", node);
    }
    if (!this.imageBytes) return;
    const bytes = this.imageBytes.get(p.hash);
    if (!bytes) this.warn("image-missing", "This image isn't in the file; it's drawn as a grey placeholder.", node);
    else if (!isDrawableImage(bytes)) this.warn("image-unreadable", "This image's data isn't a PNG, JPEG, GIF or WebP image; it's drawn as a grey placeholder.", node);
  }

  /** Builds the full tree under one node (a frame, component, or any layer). */
  build(guid: string): BuildResult {
    const raw = this.index.get(guid);
    if (!raw) throw new Error(`No node ${guid} in this file.`);
    // Modes chosen above the root (on its page or parent frames) apply inside it.
    const chain: NodeChange[] = [];
    for (let p = this.index.parentOf(raw); p; p = this.index.parentOf(p)) chain.unshift(p);
    let modes: VariableModes = new Map();
    for (const p of chain) modes = this.index.modesOf(p, modes);
    const root = this.node(raw, raw as Partial, {
      prefix: "",
      idPrefix: "",
      used: new Set(),
      overrides: new Map(),
      derived: new Map(),
      props: new Map(),
      idBase: "",
      depth: 0,
      stack: [],
      modes,
    }, false);
    resolveBoxes(root, IDENTITY);
    return {
      root,
      glyphs: this.glyphs.paths,
      images: this.images,
      fonts: this.fonts,
      components: this.components,
      warnings: this.warnings,
      unmatchedOverrides: this.unmatched,
    };
  }

  private warn(code: string, message: string, node?: { id: string; name: string }) {
    if (this.inert) return;
    const k = `${code}|${node?.id ?? ""}`;
    if (this.warned.has(k)) return;
    this.warned.add(k);
    this.warnings.push({ code, message, nodeId: node?.id, nodeName: node?.name });
  }

  /**
   * Converts `raw` (possibly a master descendant being cloned) into a DesignNode.
   * `source` is the unmerged master node (its guid addresses overrides).
   */
  private node(source: NodeChange, raw: Partial, ctx: ExpandCtx, isClone: boolean): DesignNode {
    const guid = guidKey(source.guid);
    const overrideKey = (source as { overrideKey?: GUID }).overrideKey;
    const key = overrideKey && !isNoneGuid(overrideKey) ? guidKey(overrideKey) : guid;
    const pathKey = isClone ? (ctx.prefix ? `${ctx.prefix}/${key}` : key) : "";
    const idPath = isClone ? (ctx.idPrefix ? `${ctx.idPrefix}/${guid}` : guid) : "";
    let merged: Partial = raw;

    if (isClone) {
      merged = this.applyProps(source, merged, ctx);
      const ovs = ctx.overrides.get(pathKey);
      if (ovs) {
        ctx.used.add(pathKey);
        for (let i = ovs.length - 1; i >= 0; i--) merged = mergeOverride(merged, ovs[i], true);
      }
      const der = ctx.derived.get(pathKey);
      if (der) {
        ctx.used.add(pathKey);
        merged = mergeOverride(merged, der, false);
      } else if (ctx.resize) merged = applyConstraints(merged, ctx.resize);
    }
    if (merged.type === "INSTANCE") {
      // Before anything is taken from the main component: a variable may pick another variant of it.
      const bound = this.boundVariant(merged, this.index.modesOf(merged as { variableModeBySetMap?: unknown }, ctx.modes));
      if (bound) merged = { ...merged, overriddenSymbolID: bound };
      merged = this.inheritFromMaster(merged);
    }
    // Variable modes this node selects apply to it and everything inside it.
    const modes = this.index.modesOf(merged as { variableModeBySetMap?: unknown }, ctx.modes);
    if (modes !== ctx.modes) ctx = { ...ctx, modes };

    const id = isClone ? `${ctx.idBase}${idPath}` : guid;
    const kind = nodeKind(merged, this.index);
    const size: Vec2 = { x: (merged.size as Vec2 | undefined)?.x ?? 0, y: (merged.size as Vec2 | undefined)?.y ?? 0 };
    const name = (merged.name as string) ?? "";

    const node: DesignNode = {
      id,
      guid,
      kind,
      name,
      visible: merged.visible !== false,
      locked: merged.locked === true,
      opacity: (merged.opacity as number | undefined) ?? 1,
      blendMode: ((merged.blendMode as string) ?? "PASS_THROUGH") as DesignNode["blendMode"],
      transform: toMat(merged.transform as never),
      size,
      box: { x: 0, y: 0, w: size.x, h: size.y },
      fills: [],
      strokes: [],
      stroke: null,
      effects: resolveEffects(merged.effects as never, this.index, modes),
      corners: resolveCorners(merged as NodeChange),
      clipsContent: false,
      mask: merged.mask ? { type: ((merged.maskType as string) ?? "ALPHA") as "ALPHA" | "VECTOR" | "LUMINANCE", outline: merged.maskIsOutline === true } : null,
      fillGeometry: [],
      strokeGeometry: [],
      layout: autoLayout(merged),
      layoutChild: layoutChild(merged),
      constraints: {
        h: constraint(merged.horizontalConstraint as string),
        v: constraint(merged.verticalConstraint as string),
      },
      minSize: optVec(merged.minSize),
      maxSize: optVec(merged.maxSize),
      scroll: scrollDir(merged.scrollDirection as string | undefined),
      text: null,
      reactions: reactions(merged, this.index),
      children: [],
    };

    // Paints. Text fills live on the runs; the node-level list mirrors run 0.
    node.fills = resolvePaints(this.index, merged.fillPaints as never, size, modes);
    node.strokes = resolvePaints(this.index, merged.strokePaints as never, size, modes);
    node.stroke = resolveStroke(merged as NodeChange, node.strokes.some((p) => p.visible));
    for (const p of [...node.fills, ...node.strokes]) if (p.type === "IMAGE") this.noteImage(p, node);
    for (const p of [...((merged.fillPaints as AnyRec[] | undefined) ?? []), ...((merged.strokePaints as AnyRec[] | undefined) ?? [])]) {
      if (p.visible !== false && !["SOLID", "GRADIENT_LINEAR", "GRADIENT_RADIAL", "GRADIENT_ANGULAR", "GRADIENT_DIAMOND", "IMAGE"].includes(p.type as string)) {
        this.warn("paint-unsupported", `${p.type} paints are approximated.`, node);
      }
    }

    const styleNames: DesignNode["styleNames"] = {};
    const fillStyle = this.index.style(merged.styleIdForFill as never);
    if (fillStyle) styleNames.fill = fillStyle.name;
    const strokeStyle = this.index.style(merged.styleIdForStrokeFill as never);
    if (strokeStyle) styleNames.stroke = strokeStyle.name;
    const textStyle = this.index.style(merged.styleIdForText as never);
    if (textStyle) styleNames.text = textStyle.name;
    const effectStyle = this.index.style(merged.styleIdForEffect as never);
    if (effectStyle) styleNames.effect = effectStyle.name;
    if (Object.keys(styleNames).length) node.styleNames = styleNames;

    // Containers clip unless "Clip content" is off; groups never clip.
    if (kind === "FRAME" || kind === "COMPONENT" || kind === "COMPONENT_SET" || kind === "INSTANCE" || kind === "SECTION") {
      node.clipsContent = merged.frameMaskDisabled !== true && kind !== "SECTION";
    }

    // Geometry for anything that isn't a plain box.
    if (kind === "VECTOR" || kind === "BOOLEAN" || kind === "STAR" || kind === "POLYGON" || kind === "LINE" || kind === "ELLIPSE") {
      const regionFills = this.regionFills(merged, size, modes, node);
      node.fillGeometry = resolvePaths(this.index, merged.fillGeometry as never, regionFills);
      node.strokeGeometry = resolvePaths(this.index, merged.strokeGeometry as never);
      if (!node.fillGeometry.length && kind === "VECTOR") {
        const vd = merged.vectorData as { vectorNetworkBlob?: number; normalizedSize?: Vec2 } | undefined;
        const bytes = this.index.blob(vd?.vectorNetworkBlob);
        if (bytes) {
          const ns = vd?.normalizedSize;
          node.fillGeometry = vectorNetworkToPaths(bytes, ns?.x ? size.x / ns.x : 1, ns?.y ? size.y / ns.y : 1, regionFills);
        }
      }
    } else if (kind === "RECTANGLE" || kind === "FRAME" || kind === "INSTANCE" || kind === "COMPONENT") {
      // Rounded boxes are drawn natively from size + corners; keep stroke geometry for dashed/odd strokes.
      if (node.stroke?.dashes) node.strokeGeometry = resolvePaths(this.index, merged.strokeGeometry as never);
    }

    if (kind === "TEXT") {
      node.text = resolveText(this.index, merged as NodeChange, this.glyphs, modes);
      if (!this.inert) for (const r of node.text.runs) {
        const fk = `${r.font.family}|${r.font.style}`;
        const f = this.fonts.get(fk);
        if (f) f.layers++;
        else this.fonts.set(fk, { ...r.font, layers: 1 });
      }
      if (!node.text.hasLayout && node.text.characters.trim()) {
        this.warn("text-no-layout", "This text has no saved layout from Figma; it is laid out from font metrics instead.", node);
      }
      if (node.fills.length === 0 && node.text.runs[0]) node.fills = node.text.runs[0].fills;
    }

    // Components: variant keys.
    if (kind === "COMPONENT") {
      const set = this.index.componentSetOf(source);
      if (set) node.variant = parseVariantName(name);
    }

    // Children. A boolean operation draws its result, the fill geometry Figma saves for it, in its
    // own paints; its operands never draw, so they aren't children.
    if (kind === "INSTANCE") {
      this.expandInstance(source, merged, node, ctx, isClone, pathKey, idPath);
    } else if (kind === "BOOLEAN") {
      this.inert++;
      try {
        for (const child of this.index.childrenOf(source)) this.node(child, child as Partial, ctx, isClone);
      } finally {
        this.inert--;
      }
      if (!node.fillGeometry.length && drawnFills(node).some((p) => p.visible)) {
        this.warn("boolean-no-geometry", "This boolean operation has no saved result shape from Figma; it is left out.", node);
      }
    } else {
      const kids = this.index.childrenOf(source);
      for (const child of kids) {
        node.children.push(this.node(child, child as Partial, ctx, isClone));
      }
    }
    return node;
  }

  /**
   * Instances store the container props they override (fills, radius, auto
   * layout…) but may omit the rest; those come from the main component.
   */
  private inheritFromMaster(merged: Partial): Partial {
    const swap = merged.overriddenSymbolID as GUID | undefined;
    const symbolId = swap && !isNoneGuid(swap) ? guidKey(swap) : guidKey((merged.symbolData as { symbolID?: GUID } | undefined)?.symbolID);
    const master = this.index.get(symbolId);
    if (!master) return merged;
    const out: AnyRec = { ...merged };
    for (const [k, v] of Object.entries(master)) {
      if (INSTANCE_OWN_FIELDS.has(k) || out[k] !== undefined) continue;
      out[k] = v;
    }
    return out as Partial;
  }

  /**
   * Variant properties bound to variables (Figma's RESOLVE_VARIANT, e.g. "Mode" following a Light/Dark
   * collection): the variant of the instance's component set they pick under `modes`, when that isn't
   * the one the instance points at. Undefined when nothing is bound, the variable isn't in the file
   * (Figma's saved variant stays), or no variant matches.
   */
  /**
   * A vector's regions filled on their own (Figma's paint bucket): each path's styleID picks an
   * entry of `vectorData.styleOverrideTable`, and an entry with fillPaints (even none) replaces the
   * layer's fills there. Entries without them style vertices or segments (caps, corners).
   */
  private regionFills(merged: Partial, size: Vec2, modes: VariableModes, node: DesignNode): RegionFills | undefined {
    const table = (merged.vectorData as { styleOverrideTable?: AnyRec[] } | undefined)?.styleOverrideTable;
    const byStyle = new Map<number, Paint[]>();
    for (const e of table ?? []) {
      if (typeof e.styleID !== "number" || !Array.isArray(e.fillPaints)) continue;
      const fills = resolvePaints(this.index, e.fillPaints as never, size, modes);
      for (const p of fills) if (p.type === "IMAGE") this.noteImage(p, node);
      byStyle.set(e.styleID, fills);
    }
    return byStyle.size ? (id) => byStyle.get(id) : undefined;
  }

  private boundVariant(merged: Partial, modes: VariableModes): GUID | undefined {
    type Binding = { variableField?: string; variableData?: { value?: { expressionValue?: { expressionFunction?: string; expressionArguments?: Array<{ value?: { mapValue?: { values?: Array<{ key?: string; value?: VariableRefData }> } } }> } } } };
    const entries = [
      ...(((merged.variableConsumptionMap as { entries?: Binding[] } | undefined)?.entries) ?? []),
      ...(((merged.parameterConsumptionMap as { entries?: Binding[] } | undefined)?.entries) ?? []),
    ];
    const expr = entries.find((e) => e.variableField === "VARIANT_PROPERTIES")?.variableData?.value?.expressionValue;
    if (expr?.expressionFunction !== "RESOLVE_VARIANT") return undefined;
    const swap = merged.overriddenSymbolID as GUID | undefined;
    const current = this.index.get(swap && !isNoneGuid(swap) ? guidKey(swap) : guidKey((merged.symbolData as { symbolID?: GUID } | undefined)?.symbolID));
    const set = current && this.index.componentSetOf(current);
    if (!current || !set) return undefined;
    const want = parseVariantName(current.name ?? "");
    let changed = false;
    for (const b of expr.expressionArguments?.[0]?.value?.mapValue?.values ?? []) {
      const v = b.key ? (this.index.resolveBound(b.value, modes) as { textValue?: unknown; boolValue?: unknown } | undefined) : undefined;
      const text = typeof v?.textValue === "string" ? v.textValue : typeof v?.boolValue === "boolean" ? (v.boolValue ? "True" : "False") : undefined;
      if (!b.key || text === undefined || want[b.key]?.toLowerCase() === text.toLowerCase()) continue;
      want[b.key] = text;
      changed = true;
    }
    if (!changed) return undefined;
    const same = (a: Record<string, string>) => Object.keys(want).every((k) => a[k]?.toLowerCase() === want[k].toLowerCase());
    return this.index.childrenOf(set).find((c) => c.type === "SYMBOL" && same(parseVariantName(c.name ?? "")))?.guid;
  }

  /** Applies component property references on a master descendant. */
  private applyProps(source: NodeChange, raw: Partial, ctx: ExpandCtx): Partial {
    const refs = source.componentPropRefs as Array<{ defID?: GUID; componentPropNodeField?: string; isDeleted?: boolean }> | undefined;
    if (!refs?.length || !ctx.props.size) return raw;
    let out = raw;
    for (const ref of refs) {
      if (ref.isDeleted || !ref.defID) continue;
      const v = ctx.props.get(guidKey(ref.defID));
      if (!v) continue;
      switch (ref.componentPropNodeField) {
        case "TEXT_DATA":
          if (v.text !== undefined && v.text !== (out.textData as AnyRec | undefined)?.characters) {
            const td = { ...((out.textData as AnyRec | undefined) ?? {}), characters: v.text, characterStyleIDs: [] };
            // The master's glyph layout no longer matches; derived data restores it when Figma saved one.
            out = { ...out, textData: td as never, derivedTextData: undefined };
          }
          break;
        case "VISIBLE":
          if (v.bool !== undefined) out = { ...out, visible: v.bool };
          break;
        case "OVERRIDDEN_SYMBOL_ID":
          if (v.swap) out = { ...out, overriddenSymbolID: v.swap };
          break;
        default:
          break;
      }
    }
    return out;
  }

  private expandInstance(source: NodeChange, merged: Partial, node: DesignNode, ctx: ExpandCtx, isClone: boolean, pathKey: string, idPath: string) {
    const swap = merged.overriddenSymbolID as GUID | undefined;
    const symbolId = swap && !isNoneGuid(swap) ? guidKey(swap) : guidKey((merged.symbolData as { symbolID?: GUID } | undefined)?.symbolID);
    const master = this.index.get(symbolId);
    if (!master) {
      this.warn("instance-missing-component", "The main component of this instance is not in the file; it is drawn as an empty frame.", node);
      return;
    }
    if (ctx.stack.includes(symbolId) || ctx.depth >= MAX_INSTANCE_DEPTH) {
      this.warn("instance-recursion", "This instance nests its own component; the inner copy is skipped.", node);
      return;
    }

    const set = this.index.componentSetOf(master);
    node.component = {
      id: symbolId,
      name: master.name ?? "",
      set: set ? { id: guidKey(set.guid), name: set.name ?? "" } : undefined,
    };
    // An operand of a boolean operation isn't drawn, so it isn't a use of the component.
    if (!this.inert) {
      const rec = this.components.get(symbolId);
      if (rec) rec.uses++;
      else this.components.set(symbolId, { id: symbolId, name: master.name ?? "", setId: set ? guidKey(set.guid) : undefined, setName: set?.name, uses: 1 });
    }

    // Resolved props: variant values + assignments.
    const props = new Map<string, PropValue>();
    const nodeProps: Record<string, string | boolean> = {};
    const defs = new Map<string, { name: string; type: string; initial?: PropValue }>();
    for (const holder of [set, master]) {
      for (const d of (holder?.componentPropDefs as Array<AnyRec> | undefined) ?? []) {
        const id = guidKey(d.id as GUID);
        defs.set(id, { name: (d.name as string) ?? "", type: (d.type as string) ?? "", initial: propValue(d.initialValue as AnyRec, d.varValue as AnyRec) });
      }
    }
    for (const [id, d] of defs) if (d.initial) props.set(id, d.initial);
    const assignments = [
      ...(((merged as AnyRec).componentPropAssignments as AnyRec[] | undefined) ?? []),
    ];
    for (const a of assignments) {
      const v = propValue(a.value as AnyRec, a.varValue as AnyRec);
      if (v) props.set(guidKey(a.defID as GUID), v);
    }
    for (const [id, v] of props) {
      const d = defs.get(id);
      if (!d || d.type === "VARIANT") continue;
      if (v.text !== undefined) nodeProps[d.name] = v.text;
      else if (v.bool !== undefined) nodeProps[d.name] = v.bool;
      else if (v.swap) nodeProps[d.name] = this.index.get(v.swap)?.name ?? guidKey(v.swap);
    }
    Object.assign(nodeProps, parseVariantName(master.name ?? ""));
    if (Object.keys(nodeProps).length) node.props = nodeProps;

    // Overrides and derived data for this level, keyed by full path.
    const overrides = new Map(ctx.overrides);
    const derived = new Map(ctx.derived);
    const levelPrefix = isClone ? pathKey : "";
    const mine: string[] = [];
    const add = (list: Partial[] | undefined, into: "o" | "d", lowPrecedence: boolean) => {
      for (const o of list ?? []) {
        const segs = (o.guidPath as { guids?: GUID[] } | undefined)?.guids;
        if (!segs?.length) continue;
        const key = (levelPrefix ? levelPrefix + "/" : "") + segs.map(guidKey).join("/");
        // Only this instance's own changes count as lost when unmatched: a nested instance's saved
        // data can still describe a variant it no longer uses, and Figma ignores that too.
        if (!lowPrecedence) mine.push(key);
        if (into === "o") {
          const arr = overrides.get(key) ?? [];
          if (lowPrecedence) arr.push(o);
          else arr.unshift(o);
          overrides.set(key, arr);
        } else if (!derived.has(key) || !lowPrecedence) {
          derived.set(key, o);
        }
      }
    };
    // The outermost instance's data wins; nested instances contribute defaults.
    const symbolData = merged.symbolData as { symbolOverrides?: Partial[] } | undefined;
    add(symbolData?.symbolOverrides, "o", isClone);
    add(merged.derivedSymbolData as Partial[] | undefined, "d", isClone);

    const masterSize = { x: master.size?.x ?? node.size.x, y: master.size?.y ?? node.size.y };
    const resized = Math.abs(masterSize.x - node.size.x) > 0.01 || Math.abs(masterSize.y - node.size.y) > 0.01;
    const uniform = (merged.symbolData as { uniformScaleFactor?: number } | undefined)?.uniformScaleFactor;

    const child: ExpandCtx = {
      prefix: levelPrefix,
      idPrefix: isClone ? idPath : "",
      used: isClone ? ctx.used : new Set(),
      overrides,
      derived,
      props,
      idBase: isClone ? ctx.idBase : `${node.id};`,
      depth: ctx.depth + 1,
      stack: [...ctx.stack, symbolId],
      resize: resized && !node.layout ? { from: masterSize, to: node.size } : undefined,
      modes: ctx.modes,
    };
    for (const c of this.index.childrenOf(master)) {
      node.children.push(this.node(c, c as Partial, child, true));
    }
    // Overrides that found no layer: the designer's changes that would be lost. Entries for the
    // component's own root describe the instance itself, which carries them already.
    const masterKey = (master as { overrideKey?: GUID }).overrideKey;
    const rootPath = (levelPrefix ? levelPrefix + "/" : "") + (masterKey && !isNoneGuid(masterKey) ? guidKey(masterKey) : symbolId);
    // A path through layers the file no longer has is an override the designer's edits left behind:
    // Figma ignores it too. Only paths whose layers all exist, yet matched nothing, are lost.
    const exists = (seg: string) => this.index.overrideKeys.has(seg) || !!this.index.get(seg);
    const lost = [...new Set(mine)].filter((k) => k !== rootPath && !child.used.has(k) && k.split("/").every(exists));
    if (lost.length) this.unmatched.push({ instance: node.name, id: node.id, keys: lost });
    if (uniform && uniform !== 1) {
      this.warn("instance-scaled", "Scaled instances (K tool) are drawn at their component size.", node);
    }
  }
}

// --- helpers -------------------------------------------------------------

/** Fields an instance never takes from its main component. */
const INSTANCE_OWN_FIELDS = new Set([
  "guid",
  "parentIndex",
  "name",
  "type",
  "symbolData",
  "derivedSymbolData",
  "componentPropAssignments",
  "transform",
  "size",
  "visible",
  "opacity",
  "overrideKey",
  "componentPropDefs",
  "variantPropSpecs",
  "isSymbolPublishable",
  "sharedSymbolVersion",
  "publishedVersion",
  "componentKey",
  "prototypeInteractions",
  "stackChildPrimaryGrow",
  "stackChildAlignSelf",
  "stackPositioning",
  "horizontalConstraint",
  "verticalConstraint",
]);

/**
 * Applies an override or derived entry. Overrides that change a text layer's
 * characters invalidate the inherited glyph layout (a derived entry, applied
 * afterwards, restores Figma's own layout for the new text).
 */
function mergeOverride(base: Partial, o: Partial, isOverride: boolean): Partial {
  const out: AnyRec = { ...base };
  for (const [k, v] of Object.entries(o)) {
    if (META_FIELDS.has(k) || v === undefined) continue;
    if (k === "textData" && base.textData && v && typeof v === "object") {
      const next = { ...(base.textData as AnyRec), ...(v as AnyRec) };
      if (isOverride && next.characters !== (base.textData as AnyRec).characters && o.derivedTextData === undefined) {
        out.derivedTextData = undefined;
      }
      out.textData = next;
      continue;
    }
    out[k] = v;
  }
  return out as Partial;
}

/** Figma's constraint behaviour when an instance is resized and no derived layout was saved. */
function applyConstraints(raw: Partial, resize: { from: Vec2; to: Vec2 }): Partial {
  const t = toMat(raw.transform as never);
  const size = raw.size as Vec2 | undefined;
  if (!size) return raw;
  const dx = resize.to.x - resize.from.x;
  const dy = resize.to.y - resize.from.y;
  let { x, y } = { x: t.m02, y: t.m12 };
  let w = size.x;
  let h = size.y;
  switch (constraint(raw.horizontalConstraint as string)) {
    case "MAX":
      x += dx;
      break;
    case "CENTER":
      x += dx / 2;
      break;
    case "STRETCH":
      w += dx;
      break;
    case "SCALE": {
      const s = resize.to.x / Math.max(1e-6, resize.from.x);
      x *= s;
      w *= s;
      break;
    }
    default:
      break;
  }
  switch (constraint(raw.verticalConstraint as string)) {
    case "MAX":
      y += dy;
      break;
    case "CENTER":
      y += dy / 2;
      break;
    case "STRETCH":
      h += dy;
      break;
    case "SCALE": {
      const s = resize.to.y / Math.max(1e-6, resize.from.y);
      y *= s;
      h *= s;
      break;
    }
    default:
      break;
  }
  return { ...raw, transform: { ...t, m02: x, m12: y } as never, size: { x: Math.max(0, w), y: Math.max(0, h) } as never };
}

function propValue(value: AnyRec | undefined, varValue: AnyRec | undefined): PropValue | undefined {
  const v = value ?? {};
  if (v.textValue && typeof v.textValue === "object") return { text: ((v.textValue as AnyRec).characters as string) ?? "" };
  if (typeof v.boolValue === "boolean") return { bool: v.boolValue };
  if (v.guidValue) return { swap: v.guidValue as GUID };
  const vv = (varValue?.value as AnyRec | undefined) ?? {};
  if (vv.textDataValue) return { text: ((vv.textDataValue as AnyRec).characters as string) ?? "" };
  if (typeof vv.boolValue === "boolean") return { bool: vv.boolValue };
  if ((vv.symbolIdValue as AnyRec | undefined)?.guid) return { swap: (vv.symbolIdValue as AnyRec).guid as GUID };
  if (typeof vv.textValue === "string" && vv.textValue) return { variant: vv.textValue };
  return undefined;
}

export function parseVariantName(name: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of name.split(",")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function toMat(m: Partial_["transform"] | undefined): Mat {
  if (!m) return { ...IDENTITY };
  return { m00: m.m00 ?? 1, m01: m.m01 ?? 0, m02: m.m02 ?? 0, m10: m.m10 ?? 0, m11: m.m11 ?? 1, m12: m.m12 ?? 0 };
}

function optVec(v: unknown): Vec2 | undefined {
  const o = v as { value?: { x?: number; y?: number } } | undefined;
  if (!o?.value) return undefined;
  return { x: o.value.x ?? 0, y: o.value.y ?? 0 };
}

function nodeKind(n: Partial, index: RawIndex): NodeKind {
  switch (n.type) {
    case "FRAME":
      if (n.isStateGroup) return "COMPONENT_SET";
      return n.resizeToFit ? "GROUP" : "FRAME";
    case "GROUP":
      return "GROUP";
    case "SECTION":
      return "SECTION";
    case "SYMBOL":
      return "COMPONENT";
    case "INSTANCE":
      return "INSTANCE";
    case "RECTANGLE":
    case "ROUNDED_RECTANGLE":
      return "RECTANGLE";
    case "ELLIPSE":
      return "ELLIPSE";
    case "LINE":
      return "LINE";
    case "STAR":
      return "STAR";
    case "REGULAR_POLYGON":
      return "POLYGON";
    case "VECTOR":
      return "VECTOR";
    case "BOOLEAN_OPERATION":
      return "BOOLEAN";
    case "TEXT":
      return "TEXT";
    case "SLICE":
      return "SLICE";
    default:
      void index;
      return "FRAME";
  }
}

function constraint(c: string | undefined): Constraint {
  switch (c) {
    case "MAX":
    case "RIGHT":
    case "BOTTOM":
      return "MAX";
    case "CENTER":
      return "CENTER";
    case "STRETCH":
    case "LEFT_RIGHT":
    case "TOP_BOTTOM":
      return "STRETCH";
    case "SCALE":
      return "SCALE";
    default:
      return "MIN";
  }
}

function scrollDir(s: string | undefined): DesignNode["scroll"] {
  if (s === "HORIZONTAL" || s === "VERTICAL" || s === "BOTH") return s;
  return undefined;
}

function autoLayout(n: Partial): AutoLayout | null {
  const mode = n.stackMode as string | undefined;
  if (mode !== "HORIZONTAL" && mode !== "VERTICAL" && mode !== "GRID") return null;
  const pl = (n.stackHorizontalPadding as number | undefined) ?? (n.stackPadding as number | undefined) ?? 0;
  const pt = (n.stackVerticalPadding as number | undefined) ?? (n.stackPadding as number | undefined) ?? 0;
  const pr = (n.stackPaddingRight as number | undefined) ?? pl;
  const pb = (n.stackPaddingBottom as number | undefined) ?? pt;
  const justify = (() => {
    switch (n.stackPrimaryAlignItems as string | undefined) {
      case "CENTER":
        return "CENTER" as const;
      case "MAX":
        return "END" as const;
      case "SPACE_EVENLY":
      case "SPACE_BETWEEN":
        return "SPACE_BETWEEN" as const;
      default:
        return "START" as const;
    }
  })();
  const align = (() => {
    switch (n.stackCounterAlignItems as string | undefined) {
      case "CENTER":
        return "CENTER" as const;
      case "MAX":
        return "END" as const;
      case "BASELINE":
        return "BASELINE" as const;
      case "STRETCH":
        return "STRETCH" as const;
      default:
        return "START" as const;
    }
  })();
  const sizing = (s: unknown) => (s === "RESIZE_TO_FIT" || s === "RESIZE_TO_FIT_WITH_IMPLICIT_SIZE" ? "HUG" : "FIXED") as "HUG" | "FIXED";
  return {
    mode,
    wrap: n.stackWrap === "WRAP",
    gap: (n.stackSpacing as number | undefined) ?? 0,
    counterGap: (n.stackCounterSpacing as number | undefined) ?? (n.stackSpacing as number | undefined) ?? 0,
    padding: { top: pt, right: pr, bottom: pb, left: pl },
    justify,
    align,
    primarySizing: sizing(n.stackPrimarySizing),
    counterSizing: sizing(n.stackCounterSizing),
    reverseZ: n.stackReverseZIndex === true,
    strokesIncludedInLayout: n.bordersTakeSpace === true,
  };
}

function layoutChild(n: Partial): LayoutChild {
  const self = n.stackChildAlignSelf as string | undefined;
  return {
    absolute: n.stackPositioning === "ABSOLUTE",
    grow: (n.stackChildPrimaryGrow as number | undefined) ?? 0,
    alignSelf: self === "STRETCH" ? "STRETCH" : self === "CENTER" ? "CENTER" : self === "MAX" ? "END" : self === "MIN" ? "START" : "AUTO",
  };
}

/** A node's prototype interactions, as reactions with their targets resolved. */
export function reactions(n: Partial, index: RawIndex): Reaction[] {
  const list = n.prototypeInteractions as Array<AnyRec> | undefined;
  if (!list?.length) return [];
  const out: Reaction[] = [];
  for (const it of list) {
    if (it.isDeleted) continue;
    const event = (it.event as AnyRec | undefined) ?? {};
    const trigger = (event.interactionType as string) ?? "ON_CLICK";
    for (const a of (it.actions as AnyRec[] | undefined) ?? []) {
      const conn = a.connectionType as string | undefined;
      const nav = a.navigationType as string | undefined;
      const target = a.transitionNodeID ? guidKey(a.transitionNodeID as GUID) : "";
      let action: Reaction["action"];
      if (conn === "BACK") action = { kind: "BACK" };
      else if (conn === "CLOSE") action = { kind: "CLOSE" };
      else if (conn === "URL") action = { kind: "URL", url: (a.connectionURL as string) ?? "" };
      else if (target && index.get(target)) {
        if (nav === "OVERLAY") action = { kind: "OVERLAY", target };
        else if (nav === "SWAP") action = { kind: "SWAP", target };
        else if (nav === "SCROLL_TO") action = { kind: "SCROLL_TO", target };
        else if (nav === "SWAP_STATE" || nav === "CHANGE_TO") action = { kind: "CHANGE_TO", target };
        else action = { kind: "NAVIGATE", target };
      } else action = { kind: "OTHER", raw: `${conn ?? ""}/${nav ?? ""}` };
      out.push({ trigger, timeout: (event.transitionTimeout as number | undefined) ?? undefined, action });
    }
  }
  return out;
}

/** Fills `box` (bounds relative to the tree's root) for every node. */
export function resolveBoxes(node: DesignNode, parent: Mat, isRoot = true) {
  const abs = isRoot ? IDENTITY : mul(parent, node.transform);
  node.box = transformedBounds(abs, node.size.x, node.size.y);
  for (const c of node.children) resolveBoxes(c, abs, false);
}
