import { getStore } from "./index.js";
import { loadBacklog } from "./backlog.js";

export interface CalendarEntry {
  date: string;
  status: "completed" | "skipped" | "failed";
}

export interface CalendarView {
  channelId: string;
  published: CalendarEntry[];
  planned: Array<{ angle: string; usedDate?: string }>;
}

/**
 * Editorial calendar for a channel: published/processed dates (from run history) plus
 * the planned idea backlog. Powers the calendar view in the UI.
 */
export async function calendarFor(channelId: string): Promise<CalendarView> {
  const store = await getStore();
  const runs = await store.listRuns(channelId, 120);
  // Latest status per date.
  const byDate = new Map<string, CalendarEntry["status"]>();
  for (const r of runs) {
    if (!byDate.has(r.date)) byDate.set(r.date, r.status);
  }
  const published = [...byDate.entries()]
    .map(([date, status]) => ({ date, status }))
    .sort((a, b) => b.date.localeCompare(a.date));
  const planned = (await loadBacklog(channelId)).map((b) => ({ angle: b.angle, usedDate: b.usedDate }));
  return { channelId, published, planned };
}
