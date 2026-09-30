"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon, ChevronRightIcon, CopyIcon, CpuIcon, FileCodeIcon, FolderIcon, HammerIcon, ImageIcon, LoaderIcon, SparklesIcon } from "lucide-react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { formatBytes } from "@/lib/app-format";
import type { FileManifest, FileView } from "@/lib/app-types";
import { cn } from "@/lib/utils";

const KIND = {
  design: { label: "From your design", icon: SparklesIcon, tone: "text-neutral-300" },
  runtime: { label: "Figflow runtime and Dear ImGui", icon: CpuIcon, tone: "text-neutral-500" },
  build: { label: "Build files", icon: HammerIcon, tone: "text-neutral-500" },
  asset: { label: "Embedded images and fonts", icon: ImageIcon, tone: "text-neutral-500" },
} as const;

type Tree = { name: string; path: string; dirs: Map<string, Tree>; files: FileManifest[] };

/** `open` plus every folder above `path`. */
function withAncestors(open: ReadonlySet<string>, path: string): Set<string> {
  const next = new Set(open);
  const parts = path.split("/");
  for (let i = 1; i < parts.length; i++) next.add(parts.slice(0, i).join("/"));
  return next;
}

const OPEN_AT_FIRST = ["src", "src/app", "src/ui", "src/ui/screens", "src/ui/popups", "src/ui/toasts", "src/ui/theme"];

function buildTree(files: FileManifest[]): Tree {
  const root: Tree = { name: "", path: "", dirs: new Map(), files: [] };
  for (const f of files) {
    const parts = f.path.split("/");
    let node = root;
    for (const part of parts.slice(0, -1)) {
      let next = node.dirs.get(part);
      if (!next) node.dirs.set(part, (next = { name: part, path: node.path ? `${node.path}/${part}` : part, dirs: new Map(), files: [] }));
      node = next;
    }
    node.files.push(f);
  }
  return root;
}

/** The project's files as a tree, and the chosen one highlighted; `target` scrolls to a line containing that text. */
export function CodePane({
  base,
  files,
  path,
  onPath,
  target,
}: {
  base: string;
  files: FileManifest[];
  path: string;
  onPath: (path: string) => void;
  target: string | null;
}) {
  const tree = useMemo(() => buildTree(files), [files]);
  // The design's own folders start open, and so does the way to each file opened.
  const [open, setOpen] = useState<Set<string>>(() => withAncestors(new Set(OPEN_AT_FIRST), path));
  const [openedPath, setOpenedPath] = useState(path);
  if (path !== openedPath) {
    setOpenedPath(path);
    setOpen((o) => withAncestors(o, path));
  }

  const file = files.find((f) => f.path === path);
  return (
    <ResizablePanelGroup orientation="horizontal" className="min-h-0">
      <ResizablePanel defaultSize={270} minSize={180} maxSize="45">
        <div className="scroll-dark h-full overflow-y-auto py-2 text-[12.5px]" role="tree" aria-label="Project files">
          <TreeLevel node={tree} depth={0} open={open} setOpen={setOpen} path={path} onPath={onPath} />
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel minSize={320}>{file ? <FileViewer key={file.path} base={base} file={file} target={target} /> : null}</ResizablePanel>
    </ResizablePanelGroup>
  );
}

function TreeLevel({ node, depth, open, setOpen, path, onPath }: { node: Tree; depth: number; open: Set<string>; setOpen: (f: (o: Set<string>) => Set<string>) => void; path: string; onPath: (p: string) => void }) {
  const dirs = [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name));
  const files = [...node.files].sort((a, b) => a.path.localeCompare(b.path));
  return (
    <>
      {dirs.map((d) => {
        const isOpen = open.has(d.path);
        return (
          <div key={d.path} role="treeitem" aria-expanded={isOpen} aria-selected={false}>
            <button
              type="button"
              onClick={() =>
                setOpen((o) => {
                  const next = new Set(o);
                  if (next.has(d.path)) next.delete(d.path);
                  else next.add(d.path);
                  return next;
                })
              }
              className="flex w-full items-center gap-1.5 py-1 pr-2 text-left text-foreground/75 transition-colors hover:bg-[#131313] hover:text-foreground"
              style={{ paddingLeft: 8 + depth * 14 }}
            >
              <ChevronRightIcon className={cn("size-3 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} aria-hidden />
              <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{d.name}</span>
            </button>
            {isOpen && (
              <div role="group">
                <TreeLevel node={d} depth={depth + 1} open={open} setOpen={setOpen} path={path} onPath={onPath} />
              </div>
            )}
          </div>
        );
      })}
      {files.map((f) => {
        const k = KIND[f.kind];
        const active = f.path === path;
        return (
          <button
            key={f.path}
            type="button"
            role="treeitem"
            aria-selected={active}
            onClick={() => onPath(f.path)}
            className={cn("flex w-full items-center gap-1.5 py-1 pr-2 text-left transition-colors", active ? "bg-[#161616] text-foreground" : "text-foreground/70 hover:bg-[#131313] hover:text-foreground")}
            style={{ paddingLeft: 8 + depth * 14 + 15 }}
            title={`${f.path} · ${formatBytes(f.size)}`}
          >
            <k.icon className={cn("size-3.5 shrink-0", k.tone)} aria-hidden />
            <span className="truncate">{f.path.split("/").pop()}</span>
          </button>
        );
      })}
    </>
  );
}

function FileViewer({ base, file, target }: { base: string; file: FileManifest; target: string | null }) {
  const [view, setView] = useState<FileView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const code = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stale = false;
    fetch(`${base}/files?path=${encodeURIComponent(file.path)}`)
      .then(async (r) => {
        const body = await r.json();
        if (stale) return;
        if (r.ok) setView(body as FileView);
        else setError(body.error ?? "Couldn't open the file.");
      })
      .catch(() => !stale && setError("Couldn't reach Figflow."));
    return () => {
      stale = true;
    };
  }, [base, file.path]);

  // Scroll to (and mark) the first line containing the target text.
  useEffect(() => {
    if (!view || !target || !code.current) return;
    const lines = [...code.current.querySelectorAll<HTMLElement>(".line")];
    const hit = lines.find((l) => l.textContent?.includes(target));
    if (!hit) return;
    hit.scrollIntoView({ block: "center" });
    hit.classList.add("is-target");
  }, [view, target]);

  const copy = async () => {
    const text = view?.text ?? code.current?.querySelector("code")?.innerText ?? "";
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const k = KIND[file.kind];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-[#1c1c1c] px-4 py-2">
        <FileCodeIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground/85">{file.path}</p>
        <span className={cn("hidden shrink-0 items-center gap-1 text-[11.5px] sm:inline-flex", k.tone)}>
          <k.icon className="size-3" aria-hidden /> {k.label}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {view ? `${view.lines} lines · ` : ""}
          {formatBytes(file.size)}
        </span>
        <button type="button" onClick={copy} disabled={!view} className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-[#171717] hover:text-foreground" aria-label="Copy the file">
          {copied ? <CheckIcon className="size-3.5 text-emerald-300" /> : <CopyIcon className="size-3.5" />}
        </button>
      </div>
      <div
        ref={code}
        className={cn(
          "scroll-dark min-h-0 flex-1 overflow-auto bg-[#070707] font-mono text-[12.5px] leading-[1.6]",
          // Line numbers for shiki's lines, and the jumped-to line marked.
          "[&_pre]:!bg-transparent [&_pre]:py-3 [&_code]:[counter-reset:line] [&_.line]:inline-block [&_.line]:min-w-full [&_.line]:pr-6",
          "[&_.line]:before:mr-5 [&_.line]:before:inline-block [&_.line]:before:w-10 [&_.line]:before:text-right [&_.line]:before:text-white/20 [&_.line]:before:content-[counter(line)] [&_.line]:before:[counter-increment:line]",
          "[&_.line.is-target]:bg-[#1a1a1a] [&_.line.is-target]:shadow-[inset_2px_0_0_#a3a3a3]",
        )}
      >
        {error ? (
          <p className="p-6 font-sans text-[13px] text-destructive">{error}</p>
        ) : !view ? (
          <div className="flex items-center gap-2 p-6 font-sans text-[12.5px] text-muted-foreground">
            <LoaderIcon className="size-4 animate-spin" aria-hidden /> Opening {file.path.split("/").pop()}…
          </div>
        ) : view.html ? (
          <div dangerouslySetInnerHTML={{ __html: view.html }} />
        ) : (
          <pre className="py-3">
            <code>
              {view.text!.split("\n").map((l, i) => (
                <span key={i} className="line">
                  {l}
                  {"\n"}
                </span>
              ))}
            </code>
          </pre>
        )}
        {view?.truncated && (
          <p className="border-t border-[#1c1c1c] px-6 py-4 font-sans text-[12.5px] text-muted-foreground">
            The first {view.text!.split("\n").length} of {view.lines} lines: the rest is embedded data. It&apos;s all in the ZIP.
          </p>
        )}
      </div>
    </div>
  );
}
