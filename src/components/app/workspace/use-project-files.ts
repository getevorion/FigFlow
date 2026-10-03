"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileManifest, FileView } from "@/lib/app-types";

const PREFETCH_BYTES = 512 * 1024;
const CONCURRENCY = 14;

type Entry = { view: FileView } | { error: string };

async function fetchFile(base: string, path: string): Promise<Entry> {
  const r = await fetch(`${base}/files?path=${encodeURIComponent(path)}&plain=1`);
  const body = await r.json();
  if (r.ok) return { view: body as FileView };
  return { error: (body as { error?: string }).error ?? "Couldn't open the file." };
}

/** In-memory cache + background prefetch so tab switches feel instant. */
export function useProjectFiles(base: string, files: FileManifest[]) {
  const cacheRef = useRef<Map<string, Entry>>(new Map());
  const inflightRef = useRef<Map<string, Promise<Entry>>>(new Map());
  const [revision, bump] = useState(0);

  const notify = useCallback(() => bump((n) => n + 1), []);

  const ensure = useCallback(
    (path: string) => {
      const hit = cacheRef.current.get(path);
      if (hit) return hit;
      let p = inflightRef.current.get(path);
      if (!p) {
        p = fetchFile(base, path).then((entry) => {
          cacheRef.current.set(path, entry);
          inflightRef.current.delete(path);
          notify();
          return entry;
        });
        inflightRef.current.set(path, p);
      }
      return undefined;
    },
    [base, notify],
  );

  const get = useCallback((path: string): Entry | undefined => cacheRef.current.get(path), []);

  useEffect(() => {
    const paths = files.filter((f) => f.size <= PREFETCH_BYTES).map((f) => f.path);
    let i = 0;
    let cancelled = false;

    const worker = async () => {
      while (!cancelled && i < paths.length) {
        const path = paths[i++];
        if (cacheRef.current.has(path) || inflightRef.current.has(path)) continue;
        const p = fetchFile(base, path).then((entry) => {
          cacheRef.current.set(path, entry);
          inflightRef.current.delete(path);
          notify();
          return entry;
        });
        inflightRef.current.set(path, p);
        await p;
      }
    };

    void Promise.all(Array.from({ length: Math.min(CONCURRENCY, paths.length) }, () => worker()));
    return () => {
      cancelled = true;
    };
  }, [base, files, notify]);

  /** All successfully loaded source text (for completions). */
  const allSources = useCallback((): string[] => {
    const out: string[] = [];
    for (const entry of cacheRef.current.values()) {
      if ("view" in entry && entry.view.text) out.push(entry.view.text);
    }
    return out;
  }, []);

  return useMemo(() => ({ get, ensure, allSources, revision }), [get, ensure, allSources, revision]);
}
