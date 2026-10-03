import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { UploadList } from "@/components/app/upload-list";
import { MembersGrowthChart } from "@/components/dashboard/members-growth-chart";
import { PlanDonutChart } from "@/components/dashboard/plan-donut-chart";
import { formatBytes } from "@/lib/app-format";
import { projectsByProduct, uploadsByDay } from "@/lib/dashboard-metrics";
import { site } from "@/lib/site";
import { ownerId } from "@/server/owner";
import { listProjects, listUploads } from "@/server/store";
import { uploadView } from "@/server/views";

export default async function DashboardPage() {
  const owner = await ownerId();
  const uploads = owner ? await listUploads(owner) : [];
  const views = await Promise.all(uploads.map(async (u) => uploadView(u, await listProjects(u.id))));
  const allProjects = (await Promise.all(uploads.map((u) => listProjects(u.id)))).flat();

  const totalBytes = uploads.reduce((n, u) => n + u.size, 0);
  const ready = uploads.filter((u) => u.state === "ready").length;

  const stats = [
    { name: "Active uploads", value: uploads.length },
    { name: "Ready designs", value: ready },
    { name: "Storage used", value: formatBytes(totalBytes) },
  ];

  return (
    <div className="min-w-0 space-y-5">
      <header className="kv-page-header !mb-0">
        <div className="kv-page-header-main">
          <h1 className="kv-page-title">Dashboard</h1>
          <p className="kv-page-subtitle">Conversions on this browser · {site.retentionHours}h retention</p>
        </div>
        <div className="kv-page-actions">
          <Link href="/convert" className="btn-primary gap-1.5">
            New conversion <ArrowRightIcon className="size-3.5" aria-hidden />
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.name} className="card block min-w-0">
            <p className="kv-label text-[var(--kv-text-subtle)]">{stat.name}</p>
            <p className="mt-1 text-[22px] font-semibold tracking-[-0.02em] text-[var(--kv-text)] tabular-nums">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 items-stretch gap-3 xl:grid-cols-2">
        <div className="min-w-0 overflow-hidden">
          <MembersGrowthChart series={uploadsByDay(uploads)} />
        </div>
        <div className="min-w-0 overflow-hidden">
          <PlanDonutChart data={projectsByProduct(allProjects)} />
        </div>
      </div>

      <UploadList uploads={views} />
    </div>
  );
}
