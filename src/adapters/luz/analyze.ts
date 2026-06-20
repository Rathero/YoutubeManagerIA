import type { ContentPayload, Metric, Segment } from "../../core/types/index.js";
import type { ApplianceConfig, HourPrice, LuzRawData, PriceSeries } from "./types.js";

const EUR_KWH = "€/kWh";

function hhRange(hour: number): string {
  const a = String(hour).padStart(2, "0");
  const b = String((hour + 1) % 24).padStart(2, "0");
  return `${a}:00–${b}:00`;
}

function windowRange(startHour: number, durationH: number): string {
  const a = String(startHour).padStart(2, "0");
  const b = String((startHour + durationH) % 24).padStart(2, "0");
  return `${a}:00–${b}:00`;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function round(n: number, decimals = 4): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/** Cheapest contiguous window of `durationH` hours, respecting a day/night bias. */
function cheapestWindow(
  hours: HourPrice[],
  durationH: number,
  prefer: ApplianceConfig["prefer"],
): { startHour: number; avgPrice: number } {
  const byHour = new Map(hours.map((h) => [h.hour, h.price]));
  let best: { startHour: number; avgPrice: number } | null = null;

  for (let start = 0; start <= 24 - durationH; start++) {
    const slice: number[] = [];
    for (let k = 0; k < durationH; k++) {
      const p = byHour.get(start + k);
      if (p === undefined) break;
      slice.push(p);
    }
    if (slice.length < durationH) continue;

    let avg = mean(slice);
    // Soft bias: nudge cost up for windows outside the preferred band so a
    // marginally-pricier preferred window can win, without ever overriding a
    // dramatically cheaper one.
    const midpoint = start + durationH / 2;
    const isNight = midpoint <= 7 || midpoint >= 22;
    if (prefer === "night" && !isNight) avg *= 1.05;
    if (prefer === "day" && isNight) avg *= 1.05;

    if (!best || avg < best.avgPrice) best = { startHour: start, avgPrice: round(avg) };
  }

  // Fallback (shouldn't happen with a full 24h series).
  return best ?? { startHour: 0, avgPrice: round(mean(hours.map((h) => h.price))) };
}

/**
 * Deterministic domain logic. Turns a price series into a normalized ContentPayload.
 * NO LLM, NO randomness — same input always yields the same payload.
 */
export function analyzeLuz(
  raw: LuzRawData,
  channelId: string,
  appliances: ApplianceConfig[],
  baselineEurKwh?: number,
): ContentPayload {
  const target: PriceSeries | undefined = raw.tomorrow ?? raw.today;
  if (!target || target.hours.length === 0) {
    throw new Error("luz.analyze: no price series available to analyze");
  }

  const hours = [...target.hours].sort((a, b) => a.hour - b.hour);
  const prices = hours.map((h) => h.price);
  const avg = round(mean(prices));
  const min = hours.reduce((m, h) => (h.price < m.price ? h : m), hours[0]!);
  const max = hours.reduce((m, h) => (h.price > m.price ? h : m), hours[0]!);

  const sortedCheap = [...hours].sort((a, b) => a.price - b.price);
  const top3Cheap = sortedCheap.slice(0, 3);
  const top3Expensive = [...sortedCheap].reverse().slice(0, 3);

  // Classification vs baseline (30d moving avg, or configured fallback).
  const baseline = raw.avg30d ?? baselineEurKwh ?? avg;
  const ratio = baseline > 0 ? avg / baseline : 1;
  const classification = ratio <= 0.9 ? "barato" : ratio >= 1.1 ? "caro" : "normal";

  // Delta vs today (for the comparison block), when both days are present.
  let comparison: ContentPayload["comparison"];
  let headlineFact: string;
  if (raw.today && raw.tomorrow) {
    const todayAvg = round(mean(raw.today.hours.map((h) => h.price)));
    const deltaPct = todayAvg > 0 ? round(((avg - todayAvg) / todayAvg) * 100, 1) : 0;
    const direction = deltaPct > 1 ? "up" : deltaPct < -1 ? "down" : "flat";
    comparison = { label: "vs. hoy", deltaPct: Math.abs(deltaPct), direction };
    const verb = direction === "down" ? "baja" : direction === "up" ? "sube" : "se mantiene";
    headlineFact =
      direction === "flat"
        ? `Mañana la luz se mantiene en torno a ${avg.toFixed(3)} ${EUR_KWH}`
        : `Mañana la luz ${verb} un ${Math.abs(deltaPct)}%`;
  } else {
    headlineFact = `Hoy la luz está ${classification} (media ${avg.toFixed(3)} ${EUR_KWH})`;
  }

  const keyMetrics: Metric[] = [
    { label: "Media del día", value: avg.toFixed(3), unit: EUR_KWH, emphasis: "primary" },
    { label: `Más barata (${hhRange(min.hour)})`, value: min.price.toFixed(3), unit: EUR_KWH, emphasis: "primary" },
    { label: `Más cara (${hhRange(max.hour)})`, value: max.price.toFixed(3), unit: EUR_KWH, emphasis: "secondary" },
  ];

  const segments: Segment[] = [
    {
      title: "Horas más baratas",
      detail: top3Cheap.map((h) => `${hhRange(h.hour)} (${h.price.toFixed(3)} ${EUR_KWH})`).join(", "),
      dataRef: "cheapest",
    },
    {
      title: "Horas más caras",
      detail: top3Expensive.map((h) => `${hhRange(h.hour)} (${h.price.toFixed(3)} ${EUR_KWH})`).join(", "),
      dataRef: "expensive",
    },
  ];

  const recommendation = {
    headline: "Cuándo poner cada cosa mañana",
    items: appliances.map((a) => {
      const w = cheapestWindow(hours, Math.min(a.duration_h, 23), a.prefer);
      return { label: a.key, window: windowRange(w.startHour, Math.min(a.duration_h, 23)) };
    }),
  };

  const savingsPct = max.price > 0 ? round(((max.price - min.price) / max.price) * 100, 0) : 0;

  return {
    channelId,
    date: target.date,
    classification,
    headlineFact,
    keyMetrics,
    segments,
    comparison,
    recommendation,
    context:
      `Programando los consumos en las horas baratas frente a las caras se puede ahorrar ` +
      `hasta un ${savingsPct}% en esos electrodomésticos.`,
    visualData: {
      type: "timeseries",
      series: hours.map((h) => ({ x: h.hour, y: h.price })),
      highlight: { min: min.hour, max: max.hour },
    },
    cta: "Sígueme para saber cada tarde las horas baratas de mañana.",
    sourceRef: raw.source,
    safety: {
      factsVerified: true,
      notes: `Serie horaria ${target.date}, ${hours.length}h, fuente ${raw.source.name}.`,
    },
  };
}
