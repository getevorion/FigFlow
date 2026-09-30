/**
 * Opening a .fig: decode, index, list pages and frames, build a frame tree.
 */
import { readFigFile, extractImages, getMeta, getThumbnail, type ParsedFigmaArchive } from "./kiwi/index";
import { RawIndex, guidKey } from "./raw";
import { DesignBuilder, type BuildResult } from "./build";
import type { NodeChange } from "./kiwi/schema";

export type FrameSummary = {
  id: string;
  name: string;
  kind: "FRAME" | "COMPONENT" | "COMPONENT_SET" | "INSTANCE" | "SECTION" | "GROUP";
  width: number;
  height: number;
  x: number;
  y: number;
  /** Direct children count, a rough complexity signal for the picker. */
  layers: number;
  /** Frames nested in a section are listed with the section's name. */
  section?: string;
};

export type PageSummary = { id: string; name: string; frames: FrameSummary[] };

export class FigFile {
  readonly index: RawIndex;
  readonly images: Map<string, Uint8Array>;
  readonly meta: unknown;
  readonly thumbnail: Uint8Array | undefined;
  readonly archiveVersion: number;

  private constructor(readonly parsed: ParsedFigmaArchive) {
    this.index = new RawIndex(parsed.message);
    this.images = extractImages(parsed.zip_files);
    this.meta = getMeta(parsed.zip_files);
    this.thumbnail = getThumbnail(parsed.zip_files);
    this.archiveVersion = parsed.header.version;
  }

  static open(bytes: Uint8Array): FigFile {
    return new FigFile(readFigFile(bytes));
  }

  get name(): string {
    const m = this.meta as { file_name?: string } | undefined;
    return m?.file_name ?? this.index.document?.name ?? "Untitled";
  }

  /** Pages with their convertible top-level frames (sections are looked into). */
  pages(): PageSummary[] {
    return this.index.pages().map((page) => {
      const frames: FrameSummary[] = [];
      const visit = (n: NodeChange, section?: string) => {
        const kind = summaryKind(n);
        if (!kind) return;
        if (kind === "SECTION") {
          for (const c of this.index.childrenOf(n)) visit(c, n.name ?? "Section");
          return;
        }
        frames.push({
          id: guidKey(n.guid),
          name: n.name ?? "",
          kind,
          width: n.size?.x ?? 0,
          height: n.size?.y ?? 0,
          x: n.transform?.m02 ?? 0,
          y: n.transform?.m12 ?? 0,
          layers: this.index.childrenOf(n).length,
          section,
        });
      };
      for (const c of this.index.childrenOf(page)) visit(c);
      return { id: guidKey(page.guid), name: page.name ?? "", frames };
    });
  }

  /** Builds the full design tree under a node, with instances expanded. */
  build(nodeId: string): BuildResult {
    return new DesignBuilder(this.index).build(nodeId);
  }

  pageOf(nodeId: string): NodeChange | undefined {
    let cur = this.index.get(nodeId);
    while (cur && cur.type !== "CANVAS") cur = this.index.parentOf(cur);
    return cur;
  }
}

function summaryKind(n: NodeChange): FrameSummary["kind"] | null {
  if (n.visible === false) return null;
  switch (n.type) {
    case "FRAME":
      if (n.isStateGroup) return "COMPONENT_SET";
      return n.resizeToFit ? "GROUP" : "FRAME";
    case "SYMBOL":
      return "COMPONENT";
    case "INSTANCE":
      return "INSTANCE";
    case "SECTION":
      return "SECTION";
    default:
      return null;
  }
}
