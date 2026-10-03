import Link from "next/link";
import { site } from "@/lib/site";
import { usesBlob } from "@/server/data/io";

export default function DashboardSettingsPage() {
  const hosting = process.env.VERCEL ? "Vercel" : "Self-hosted";
  const storage = usesBlob() ? "Vercel Blob" : "Local disk";

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <header>
        <h1 className="kv-page-title">Settings</h1>
        <p className="kv-page-subtitle">How this deployment stores files and sessions.</p>
      </header>

      <dl className="kv-card divide-y divide-[var(--kv-border-subtle)] !p-0">
        {[
          ["Hosting", hosting],
          ["File storage", storage],
          ["Retention", `${site.retentionHours} hours per upload`],
          ["Max upload size", `${site.maxUploadMb} MB`],
          ["Authentication", "Browser cookie (no sign-in)"],
        ].map(([term, detail]) => (
          <div key={term} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:justify-between">
            <dt className="text-[13px] text-[var(--kv-text-subtle)]">{term}</dt>
            <dd className="text-[13px] font-medium">{detail}</dd>
          </div>
        ))}
      </dl>

      <p className="text-[13px] leading-relaxed text-[var(--kv-text-subtle)]">
        See <Link href="/docs/hosting" className="text-[var(--kv-accent)] hover:underline">hosting docs</Link> for Vercel Blob and cron setup.
      </p>
    </div>
  );
}
