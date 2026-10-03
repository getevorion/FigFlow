"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckIcon, ChevronRightIcon, CopyIcon, LoaderIcon } from "lucide-react";
import { loader } from "@monaco-editor/react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { formatBytes } from "@/lib/app-format";
import type { FileManifest } from "@/lib/app-types";
import { cn } from "@/lib/utils";
import { FileTypeIcon, FolderIcon } from "./file-icon";
import { ensureIconCollections } from "./icon-collections";
import { useProjectFiles } from "./use-project-files";
import { VscodeEditor } from "./vscode-editor";

const KIND_LABEL = {
  design: "From your design",
  runtime: "Figflow runtime and Dear ImGui",
  build: "Build files",
  asset: "Embedded images and fonts",
} as const;

type Tree = { name: string; path: string; dirs: Map<string, Tree>; files: FileManifest[] };

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

/** VS Code–style explorer + Monaco editor for generated project files. */
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
  const cache = useProjectFiles(base, files);
  const [open, setOpen] = useState<Set<string>>(() => withAncestors(new Set(OPEN_AT_FIRST), path));
  const [openedPath, setOpenedPath] = useState(path);
  const [copied, setCopied] = useState(false);

  if (path !== openedPath) {
    setOpenedPath(path);
    setOpen((o) => withAncestors(o, path));
  }

  useEffect(() => {
    ensureIconCollections();
    void loader.init();
  }, []);

  useEffect(() => {
    cache.ensure(path);
  }, [cache, path]);

  const file = files.find((f) => f.path === path);
  const entry = cache.get(path);
  const view = entry && "view" in entry ? entry.view : null;
  const error = entry && "error" in entry ? entry.error : null;
  const source = view?.text ?? "";
  const loading = !entry && !!file;

  const loadedFiles = useMemo(() => {
    const out: Array<{ path: string; lang: string; text: string }> = [];
    for (const f of files) {
      const e = cache.get(f.path);
      if (e && "view" in e && e.view.text) out.push({ path: f.path, lang: e.view.lang, text: e.view.text });
    }
    return out;
  }, [files, cache, cache.revision]);

  const copy = async () => {
    if (!source) return;
    await navigator.clipboard.writeText(source);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <ResizablePanelGroup orientation="horizontal" className="vscode-workbench h-full min-h-0">
      <ResizablePanel defaultSize={270} minSize={180} maxSize="45">
        <div className="h-full overflow-y-auto border-r border-[var(--kv-border)] bg-[var(--kv-sidebar)] py-1 text-[13px]" role="tree" aria-label="Project files">
          <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--kv-text-muted)]">Explorer</p>
          <TreeLevel node={tree} depth={0} open={open} setOpen={setOpen} path={path} onPath={onPath} onHover={cache.ensure} />
        </div>
      </ResizablePanel>
      <ResizableHandle className="w-px bg-[var(--kv-border)] hover:bg-[var(--kv-accent)]" />
      <ResizablePanel minSize={320}>
        {file ? (
          <div className="flex h-full min-h-0 flex-col bg-[var(--kv-surface)]">
            <div className="flex items-center gap-2 border-b border-[var(--kv-border)] bg-[var(--kv-bg)] px-3 py-1.5">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-t-md bg-[var(--kv-surface)] px-3 py-1.5 text-[12px] text-[var(--kv-text)] ring-1 ring-[var(--kv-border)]">
                <FileTypeIcon path={file.path} kind={file.kind} />
                <span className="truncate font-mono">{file.path.split("/").pop()}</span>
              </div>
              <span className="hidden shrink-0 text-[11px] text-[var(--kv-text-muted)] sm:inline">{KIND_LABEL[file.kind]}</span>
              <span className="shrink-0 font-mono text-[11px] text-[var(--kv-text-muted)]">
                {view ? `${view.lines} lines · ` : ""}
                {formatBytes(file.size)}
              </span>
              <button
                type="button"
                onClick={copy}
                disabled={!source}
                className="grid size-7 place-items-center rounded-md text-[var(--kv-text-subtle)] hover:bg-[var(--kv-accent-soft)] hover:text-[var(--kv-accent)] disabled:opacity-40"
                aria-label="Copy the file"
              >
                {copied ? <CheckIcon className="size-3.5 text-emerald-600" /> : <CopyIcon className="size-3.5" />}
              </button>
            </div>
            <div className="relative min-h-0 flex-1">
              {error ? (
                <p className="p-6 font-sans text-[13px] text-red-600">{error}</p>
              ) : loading ? (
                <div className="flex h-full items-center gap-2 p-6 font-sans text-[12.5px] text-[var(--kv-text-subtle)]">
                  <LoaderIcon className="size-4 animate-spin" aria-hidden /> Opening {file.path.split("/").pop()}…
                </div>
              ) : (
                <VscodeEditor
                  path={path}
                  lang={view?.lang ?? "cpp"}
                  value={source}
                  target={target}
                  getSources={cache.allSources}
                  loadedFiles={loadedFiles}
                />
              )}
              {view?.truncated && (
                <p className="absolute inset-x-0 bottom-0 border-t border-[var(--kv-border)] bg-[var(--kv-surface)]/95 px-4 py-2 font-sans text-[12px] text-[var(--kv-text-subtle)]">
                  Showing the first {source.split("\n").length} of {view.lines} lines — download the ZIP for the full file.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function TreeLevel({
  node,
  depth,
  open,
  setOpen,
  path,
  onPath,
  onHover,
}: {
  node: Tree;
  depth: number;
  open: Set<string>;
  setOpen: (f: (o: Set<string>) => Set<string>) => void;
  path: string;
  onPath: (p: string) => void;
  onHover: (p: string) => void;
}) {
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
              className="flex w-full items-center gap-1 py-[3px] pr-2 text-left text-[var(--kv-text)] hover:bg-[var(--kv-accent-soft)]/50"
              style={{ paddingLeft: 8 + depth * 12 }}
            >
              <ChevronRightIcon className={cn("size-3 shrink-0 text-[var(--kv-text-muted)]", isOpen && "rotate-90")} aria-hidden />
              <FolderIcon name={d.name} open={isOpen} />
              <span className="truncate">{d.name}</span>
            </button>
            {isOpen && (
              <div role="group">
                <TreeLevel node={d} depth={depth + 1} open={open} setOpen={setOpen} path={path} onPath={onPath} onHover={onHover} />
              </div>
            )}
          </div>
        );
      })}
      {files.map((f) => {
        const active = f.path === path;
        return (
          <button
            key={f.path}
            type="button"
            role="treeitem"
            aria-selected={active}
            onClick={() => onPath(f.path)}
            onMouseEnter={() => onHover(f.path)}
            className={cn(
              "flex w-full items-center gap-1.5 py-[3px] pr-2 text-left transition-colors",
              active ? "bg-[var(--kv-accent-soft)] font-medium text-[var(--kv-text)]" : "text-[var(--kv-text-subtle)] hover:bg-[var(--kv-accent-soft)]/50 hover:text-[var(--kv-text)]",
            )}
            style={{ paddingLeft: 8 + depth * 12 + 15 }}
            title={`${f.path} · ${formatBytes(f.size)}`}
          >
            <FileTypeIcon path={f.path} kind={f.kind} />
            <span className="truncate">{f.path.split("/").pop()}</span>
          </button>
        );
      })}
    </>
  );
}
