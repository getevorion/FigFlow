// Dev probe: how instances, overrides, derived data and component props are stored.
import { readFileSync } from "node:fs";
import { readFigFile } from "../src/engine/fig/kiwi/index";

const file = process.argv[2];
const pick = Number(process.argv[3] ?? 0);
const { message } = readFigFile(new Uint8Array(readFileSync(file)));
const nodes = message.nodeChanges ?? [];
const key = (g?: { sessionID: number; localID: number }) => (g ? `${g.sessionID}:${g.localID}` : "-");
const byId = new Map(nodes.map((n) => [key(n.guid), n]));

const trim = (_k: string, v: unknown) =>
  v instanceof Uint8Array ? `<bytes ${v.length}>` : Array.isArray(v) && v.length > 6 ? [...v.slice(0, 6), `…${v.length - 6} more`] : v;

const instances = nodes.filter((n) => n.type === "INSTANCE" && n.symbolData?.symbolOverrides?.length && n.componentPropAssignments?.length);
const inst = instances[pick] ?? nodes.find((n) => n.type === "INSTANCE")!;
const master = byId.get(key(inst.symbolData?.symbolID));
console.log("INSTANCE", key(inst.guid), JSON.stringify(inst.name), "size", inst.size, "-> SYMBOL", key(inst.symbolData?.symbolID), JSON.stringify(master?.name));
console.log("instance keys:", Object.keys(inst).join(", "));
console.log("symbolData keys:", Object.keys(inst.symbolData ?? {}).join(", "));
const ovs = inst.symbolData?.symbolOverrides ?? [];
console.log(`overrides (${ovs.length}):`);
for (const o of ovs.slice(0, 8)) {
  const { guidPath, ...rest } = o as Record<string, unknown> & { guidPath?: { guids: { sessionID: number; localID: number }[] } };
  console.log("  path", guidPath?.guids.map(key).join("/"), "->", Object.keys(rest).join(", "));
}
const derived = inst.derivedSymbolData ?? [];
console.log(`derivedSymbolData (${derived.length}):`);
for (const d of derived.slice(0, 8)) {
  const { guidPath, ...rest } = d as Record<string, unknown> & { guidPath?: { guids: { sessionID: number; localID: number }[] } };
  console.log("  path", guidPath?.guids.map(key).join("/"), "->", Object.keys(rest).join(", "));
}
console.log("componentPropAssignments:", JSON.stringify(inst.componentPropAssignments, trim));
if (master) {
  console.log("master keys:", Object.keys(master).join(", "));
  console.log("master componentPropDefs:", JSON.stringify(master.componentPropDefs, trim));
  const kids = nodes.filter((n) => key(n.parentIndex?.guid) === key(master.guid));
  console.log("master children:", kids.map((k) => `${k.type}:${JSON.stringify(k.name)}${k.componentPropRefs ? " refs=" + JSON.stringify(k.componentPropRefs, trim) : ""}`).join("\n   "));
  const parent = byId.get(key(master.parentIndex?.guid));
  console.log("master parent:", parent?.type, JSON.stringify(parent?.name), "isStateGroup=", parent?.isStateGroup, "variantPropSpecs=", JSON.stringify(master.variantPropSpecs, trim));
}
// children stored under the instance itself?
const direct = nodes.filter((n) => key(n.parentIndex?.guid) === key(inst.guid));
console.log("nodes parented directly to the instance:", direct.length);
