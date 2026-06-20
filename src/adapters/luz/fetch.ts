import { readFile } from "node:fs/promises";
import type { HourPrice, LuzConfig, LuzRawData, PriceSeries } from "./types.js";

/**
 * preciodelaluz.org returns an object keyed by "HH-HH" with { hour, price, ... }.
 * We normalize it to a flat hour/price series. No token needed (MVP source).
 */
interface PdlEntry {
  hour: string; // "00-01"
  price: number; // €/kWh or €/MWh depending on endpoint; v1/prices/all is €/kWh
  "is-cheap"?: boolean;
  "is-under-avg"?: boolean;
}

function parsePreciodelaluz(json: Record<string, PdlEntry>, date: string): PriceSeries {
  const hours: HourPrice[] = [];
  for (const entry of Object.values(json)) {
    if (!entry || typeof entry.hour !== "string") continue;
    const hour = Number.parseInt(entry.hour.slice(0, 2), 10);
    if (Number.isNaN(hour)) continue;
    hours.push({ hour, price: Number(entry.price) });
  }
  hours.sort((a, b) => a.hour - b.hour);
  return { date, hours };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function fetchPdl(zone: string, day: "today" | "tomorrow"): Promise<PriceSeries | undefined> {
  const url = `https://api.preciodelaluz.org/v1/prices/all?zone=${encodeURIComponent(zone)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    if (day === "tomorrow" && (res.status === 404 || res.status === 502)) return undefined;
    throw new Error(`preciodelaluz ${res.status} for zone ${zone}`);
  }
  const json = (await res.json()) as Record<string, PdlEntry>;
  const date = day === "tomorrow" ? isoDate(new Date(Date.now() + 864e5)) : isoDate(new Date());
  return parsePreciodelaluz(json, date);
}

/** Load a fixture: either { today, tomorrow, avg30d } or a bare preciodelaluz dump. */
export async function loadFixture(path: string): Promise<LuzRawData> {
  const text = await readFile(path, "utf8");
  const json = JSON.parse(text);
  if (json && (json.today || json.tomorrow)) {
    return {
      today: json.today,
      tomorrow: json.tomorrow,
      avg30d: json.avg30d,
      source: json.source ?? { name: "fixture", url: undefined },
    };
  }
  // bare preciodelaluz dump
  const series = parsePreciodelaluz(json, isoDate(new Date()));
  return { tomorrow: series, source: { name: "fixture", url: undefined } };
}

export async function fetchLuz(config: LuzConfig): Promise<LuzRawData> {
  if (config.source === "fixture") {
    if (!config.fixturePath) throw new Error("luz.fetch: source=fixture requires config.fixturePath");
    return loadFixture(config.fixturePath);
  }

  if (config.source === "preciodelaluz") {
    const [today, tomorrow] = await Promise.all([
      fetchPdl(config.zone, "today").catch(() => undefined),
      fetchPdl(config.zone, "tomorrow").catch(() => undefined),
    ]);
    return {
      today,
      tomorrow,
      source: { name: "preciodelaluz.org", url: "https://www.preciodelaluz.org/" },
    };
  }

  // ESIOS (production) — requires a free token; left as a documented extension point.
  throw new Error(`luz.fetch: source "${config.source}" not implemented yet (ESIOS needs a token)`);
}
