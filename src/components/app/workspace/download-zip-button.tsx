"use client";

import { useState } from "react";
import { DownloadIcon, LoaderIcon } from "lucide-react";
import { formatBytes } from "@/lib/app-format";
import { cn } from "@/lib/utils";

export function DownloadZipButton({ href, name, size }: { href: string; name: string; size: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(href, { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) {
        let msg = "Couldn't download the ZIP.";
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) msg = body.error;
        } catch {
          /* not JSON */
        }
        setError(msg);
        return;
      }
      const blob = await res.blob();
      if (blob.size < 4) {
        setError("The ZIP file is missing or empty.");
        return;
      }
      const buf = await blob.slice(0, 2).arrayBuffer();
      const sig = new Uint8Array(buf);
      if (sig[0] !== 0x50 || sig[1] !== 0x4b) {
        setError("The server didn't return a valid ZIP. Try again in a moment.");
        return;
      }
      const file = name.endsWith(".zip") ? name : `${name}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("The download failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" disabled={busy} onClick={() => void download()} className={cn("btn-primary gap-1.5", busy && "opacity-80")}>
        {busy ? <LoaderIcon className="size-4 animate-spin" aria-hidden /> : <DownloadIcon className="size-4" aria-hidden />}
        Download ZIP <span className="font-mono text-[11px] opacity-75">{formatBytes(size)}</span>
      </button>
      {error && (
        <p role="alert" className="max-w-xs text-right text-[11px] text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
