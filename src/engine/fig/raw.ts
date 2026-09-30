/**
 * Indexes a decoded Kiwi message: nodes by GUID, ordered children, shared
 * styles, variables and components. Nothing here interprets visuals; it only
 * makes the flat `nodeChanges` list navigable.
 */
import type { Message, NodeChange } from "./kiwi/schema";
import { getBlobBytes } from "./kiwi/index";

export type GUID = { sessionID: number; localID: number };

/** 0xFFFFFFFF in both halves marks "no GUID" (seen in overrideKey). */
const NONE = 4294967295;

export function guidKey(g: GUID | undefined | null): string {
  return g ? `${g.sessionID}:${g.localID}` : "";
}

export function isNoneGuid(g: GUID | undefined | null): boolean {
  return !g || (g.sessionID === NONE && g.localID === NONE);
}

export type VariableInfo = {
  guid: string;
  key?: string;
  name: string;
  collection?: string;
  /** The collection's guid (its modes decide which value applies). */
  set?: string;
  type: string;
  /** Value for the collection's default mode (first entry). */
  value: unknown;
  /** Values by mode id. */
  modes: Record<string, unknown>;
};

export type StyleInfo = { guid: string; key?: string; name: string; type: string; node: NodeChange };

/** The variable mode chosen for each collection (collection guid → mode guid), inherited down the tree. */
export type VariableModes = ReadonlyMap<string, string>;

/** A bound value as Figma stores it: a literal, or an alias to a variable. */
export type VariableRefData = { value?: { alias?: { guid?: GUID; assetRef?: { key?: string } }; colorValue?: { r?: number; g?: number; b?: number; a?: number }; floatValue?: number } };

export class RawIndex {
  readonly nodes = new Map<string, NodeChange>();
  readonly children = new Map<string, NodeChange[]>();
  readonly parent = new Map<string, string>();
  readonly variablesByGuid = new Map<string, VariableInfo>();
  readonly variablesByKey = new Map<string, VariableInfo>();
  readonly stylesByGuid = new Map<string, StyleInfo>();
  readonly stylesByKey = new Map<string, StyleInfo>();
  /** Components (SYMBOL) by their `componentKey` (library key), for swaps that reference keys. */
  readonly componentsByKey = new Map<string, NodeChange>();
  /** Each variable collection's default mode (its first). */
  readonly defaultMode = new Map<string, string>();
  readonly document: NodeChange | undefined;
  /** Every overrideKey in the file (what instance overrides address layers by, see build.ts). */
  readonly overrideKeys = new Set<string>();

  constructor(readonly message: Message) {
    const list = message.nodeChanges ?? [];
    for (const n of list) {
      if (!n.guid || n.phase === "REMOVED") continue;
      this.nodes.set(guidKey(n.guid), n);
      const ok = (n as { overrideKey?: GUID }).overrideKey;
      if (ok && !isNoneGuid(ok)) this.overrideKeys.add(guidKey(ok));
    }
    for (const n of this.nodes.values()) {
      const p = n.parentIndex?.guid;
      if (!p) continue;
      const pk = guidKey(p);
      const id = guidKey(n.guid);
      this.parent.set(id, pk);
      let arr = this.children.get(pk);
      if (!arr) this.children.set(pk, (arr = []));
      arr.push(n);
    }
    // Fractional-index positions: ascending order is paint order (first = bottom).
    for (const arr of this.children.values()) {
      arr.sort((a, b) => {
        const pa = a.parentIndex?.position ?? "";
        const pb = b.parentIndex?.position ?? "";
        return pa < pb ? -1 : pa > pb ? 1 : 0;
      });
    }
    this.document = list.find((n) => n.type === "DOCUMENT");

    // Variables and their collections.
    const collectionNames = new Map<string, string>();
    for (const n of this.nodes.values()) {
      if (n.type !== "VARIABLE_SET") continue;
      collectionNames.set(guidKey(n.guid), n.name ?? "");
      const modes = [...((n as NodeChange & { variableSetModes?: Array<{ id?: GUID; sortPosition?: string }> }).variableSetModes ?? [])];
      modes.sort((a, b) => (a.sortPosition ?? "") < (b.sortPosition ?? "") ? -1 : (a.sortPosition ?? "") > (b.sortPosition ?? "") ? 1 : 0);
      if (modes[0]?.id) this.defaultMode.set(guidKey(n.guid), guidKey(modes[0].id));
    }
    for (const n of this.nodes.values()) {
      if (n.type !== "VARIABLE") continue;
      const entries = (n as NodeChange & { variableDataValues?: { entries?: Array<{ modeID?: GUID; variableData?: { value?: unknown } }> } })
        .variableDataValues?.entries ?? [];
      const modes: Record<string, unknown> = {};
      for (const e of entries) modes[guidKey(e.modeID)] = e.variableData?.value;
      const setRef = (n as NodeChange & { variableSetID?: { guid?: GUID } }).variableSetID;
      const info: VariableInfo = {
        guid: guidKey(n.guid),
        key: n.key,
        name: n.name ?? "",
        collection: setRef?.guid ? collectionNames.get(guidKey(setRef.guid)) : undefined,
        set: setRef?.guid ? guidKey(setRef.guid) : undefined,
        type: (n as NodeChange & { variableResolvedType?: string }).variableResolvedType ?? "",
        value: entries[0]?.variableData?.value,
        modes,
      };
      this.variablesByGuid.set(info.guid, info);
      if (n.key) this.variablesByKey.set(n.key, info);
    }

    // Shared styles: nodes that carry a styleType (they live on the internal canvas).
    for (const n of this.nodes.values()) {
      if (!n.styleType || n.type === "VARIABLE") continue;
      const info: StyleInfo = { guid: guidKey(n.guid), key: n.key, name: n.name ?? "", type: n.styleType, node: n };
      this.stylesByGuid.set(info.guid, info);
      if (n.key) this.stylesByKey.set(n.key, info);
    }

    for (const n of this.nodes.values()) {
      if (n.type === "SYMBOL" && n.componentKey) this.componentsByKey.set(n.componentKey, n);
    }
  }

  get(guid: GUID | string | undefined | null): NodeChange | undefined {
    if (!guid) return undefined;
    return this.nodes.get(typeof guid === "string" ? guid : guidKey(guid));
  }

  childrenOf(n: NodeChange | string): NodeChange[] {
    const id = typeof n === "string" ? n : guidKey(n.guid);
    return this.children.get(id) ?? [];
  }

  parentOf(n: NodeChange): NodeChange | undefined {
    const p = this.parent.get(guidKey(n.guid));
    return p ? this.nodes.get(p) : undefined;
  }

  blob(id: number | undefined): Uint8Array | null {
    return id === undefined ? null : getBlobBytes(id, this.message);
  }

  /** Pages the user sees, in the order of Figma's page list. */
  pages(): NodeChange[] {
    if (!this.document) return [];
    return this.childrenOf(this.document).filter((c) => c.type === "CANVAS" && !c.internalOnly);
  }

  /** A variable alias (by GUID or library key) → variable. */
  variable(alias: { guid?: GUID; assetRef?: { key?: string } } | undefined): VariableInfo | undefined {
    if (!alias) return undefined;
    if (alias.guid) return this.variablesByGuid.get(guidKey(alias.guid));
    if (alias.assetRef?.key) return this.variablesByKey.get(alias.assetRef.key);
    return undefined;
  }

  /**
   * The value a bound field resolves to under `modes`: the variable's value in
   * the mode chosen for its collection (else the collection's default), with
   * aliases to other variables followed. Undefined when the variable isn't in
   * this file (a library that wasn't imported): callers keep Figma's cached value.
   */
  resolveBound(data: VariableRefData | undefined, modes: VariableModes, depth = 0): VariableRefData["value"] | undefined {
    const value = data?.value;
    if (!value || depth > 16) return undefined;
    if (!value.alias) return value;
    const v = this.variable(value.alias);
    if (!v) return undefined;
    const mode = (v.set && modes.get(v.set)) || (v.set && this.defaultMode.get(v.set)) || "";
    const next = (mode && mode in v.modes ? v.modes[mode] : v.value) as VariableRefData["value"];
    return this.resolveBound({ value: next }, modes, depth + 1);
  }

  /** The explicit variable modes a node sets, on top of those it inherits. */
  modesOf(n: { variableModeBySetMap?: unknown }, inherited: VariableModes): VariableModes {
    const entries = (n.variableModeBySetMap as { entries?: Array<{ variableSetID?: { guid?: GUID }; variableModeID?: GUID }> } | undefined)?.entries;
    if (!entries?.length) return inherited;
    const out = new Map(inherited);
    for (const e of entries) if (e.variableSetID?.guid && e.variableModeID) out.set(guidKey(e.variableSetID.guid), guidKey(e.variableModeID));
    return out;
  }

  /** A style reference (styleIdForFill etc.) → style. */
  style(ref: { guid?: GUID; assetRef?: { key?: string } } | undefined): StyleInfo | undefined {
    if (!ref) return undefined;
    if (ref.guid && !isNoneGuid(ref.guid)) {
      const s = this.stylesByGuid.get(guidKey(ref.guid));
      if (s) return s;
    }
    if (ref.assetRef?.key) return this.stylesByKey.get(ref.assetRef.key);
    return undefined;
  }

  /** The component set a variant component belongs to, if any. */
  componentSetOf(symbol: NodeChange): NodeChange | undefined {
    const p = this.parentOf(symbol);
    return p?.isStateGroup ? p : undefined;
  }
}
