import type { ProjectRecord, UploadRecord } from "@/server/store";

export type DayCount = { date: string; count: number };

export type ProductPeriodData = {
  week: { product: string; count: number }[];
  month: { product: string; count: number }[];
  quarter: { product: string; count: number }[];
  year: { product: string; count: number }[];
};

function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Uploads per day for the activity chart (last 90 days, zero-filled). */
export function uploadsByDay(uploads: UploadRecord[]): DayCount[] {
  if (!uploads.length) return [];
  const counts = new Map<string, number>();
  for (const u of uploads) {
    const k = dayKey(u.createdAt);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const keys = [...counts.keys()].sort();
  const end = new Date(keys[keys.length - 1] + "T00:00:00Z");
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 89);
  const out: DayCount[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const k = d.toISOString().slice(0, 10);
    out.push({ date: k, count: counts.get(k) ?? 0 });
  }
  return out;
}

/** Project counts grouped by generated name / status for the donut. */
export function projectsByProduct(projects: ProjectRecord[]): ProductPeriodData {
  const bucket = (rows: ProjectRecord[]) => {
    const m = new Map<string, number>();
    for (const p of rows) {
      const name = p.manifest?.name ?? p.name ?? "Project";
      m.set(name, (m.get(name) ?? 0) + 1);
    }
    return [...m.entries()].map(([product, count]) => ({ product, count })).sort((a, b) => b.count - a.count);
  };
  const now = Date.now();
  const week = projects.filter((p) => now - p.createdAt <= 7 * 86400000);
  const month = projects.filter((p) => now - p.createdAt <= 30 * 86400000);
  const quarter = projects.filter((p) => now - p.createdAt <= 90 * 86400000);
  return { week: bucket(week), month: bucket(month), quarter: bucket(quarter), year: bucket(projects) };
}
