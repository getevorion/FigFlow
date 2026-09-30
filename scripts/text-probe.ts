// Dev probe: Figma glyph positions vs node width for a text layer.
import { readFileSync } from "node:fs";
import { FigFile } from "../src/engine/fig/open";
import type { DesignNode } from "../src/engine/model/types";
const [file, frameName, textName] = process.argv.slice(2);
const fig = FigFile.open(new Uint8Array(readFileSync(file)));
const frame = fig.pages().flatMap((p) => p.frames).find((f) => f.name === frameName)!;
const built = fig.build(frame.id);
const find = (n: DesignNode): DesignNode | undefined => (n.name === textName && n.text ? n : n.children.map(find).find(Boolean));
const t = find(built.root);
if (!t?.text) throw new Error(`no text layer "${textName}" in "${frameName}"`);
console.log("node size", t.size, "chars", JSON.stringify(t.text.characters), "letterSpacing", t.text.runs[0].letterSpacing, "fontSize", t.text.runs[0].fontSize);
for (const g of t.text.glyphs) console.log(`char ${g.char} '${t.text.characters[g.char]}' x=${g.x.toFixed(3)} adv=${g.advance.toFixed(3)} next=${(g.x + g.advance).toFixed(3)}`);
console.log("lines", JSON.stringify(t.text.lines));
