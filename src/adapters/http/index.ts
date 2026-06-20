import type { NicheAdapter } from "../_interface.js";
import type { ContentPayload, Metric, RawData, RunContext } from "../../core/types/index.js";

/**
 * Declarative HTTP adapter — the "no code" adapter for DATA niches. Instead of writing
 * a TypeScript adapter, the user points at a JSON endpoint and declares how to read it.
 * It fetches the feed, extracts a numeric series, computes min/max/avg generically, and
 * builds a grounded ContentPayload. Good for prices, weather, stats, rankings, etc.
 *
 * Config (data.config):
 *   url:           string                 # JSON endpoint
 *   headers:       record<string,string>  # optional (e.g. auth token)
 *   series_path:   string                 # dot-path to an array (e.g. "data.items")
 *   x_field:       string                 # field for the x axis (optional; index if absent)
 *   y_field:       string                 # numeric field for the value
 *   unit:          string                 # unit label (e.g. "€/kWh", "ºC")
 *   label:         string                 # what the value represents (e.g. "precio")
 *   headline:      string                 # template with {avg} {min} {max} {unit} {label}
 *   source_name:   string                 # attribution
 *   source_url:    string
 *   lower_is_better: boolean              # affects "best moment" wording
 */
interface HttpConfig {
  url: string;
  headers?: Record<string, string>;
  series_path?: string;
  x_field?: string;
  y_field: string;
  unit?: string;
  label?: string;
  headline?: string;
  source_name?: string;
  source_url?: string;
  lower_is_better?: boolean;
}

function getPath(obj: unknown, path?: string): unknown {
  if (!path) return obj;
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

interface Point {
  x: string | number;
  y: number;
}

function extractSeries(raw: unknown, cfg: HttpConfig): Point[] {
  const arr = getPath(raw, cfg.series_path);
  if (!Array.isArray(arr)) return [];
  const out: Point[] = [];
  arr.forEach((item, i) => {
    if (item && typeof item === "object") {
      const y = Number((item as Record<string, unknown>)[cfg.y_field]);
      if (!Number.isFinite(y)) return;
      const x = cfg.x_field ? ((item as Record<string, unknown>)[cfg.x_field] as string | number) ?? i : i;
      out.push({ x, y });
    } else if (typeof item === "number") {
      out.push({ x: i, y: item });
    }
  });
  return out;
}

function round(n: number, d = 3): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

function parseConfig(ctx: RunContext): HttpConfig {
  const c = (ctx.channel.data.config ?? {}) as Partial<HttpConfig>;
  if (!c.url) throw new Error("http adapter: data.config.url is required");
  if (!c.y_field) throw new Error("http adapter: data.config.y_field is required");
  return { url: c.url, y_field: c.y_field, ...c } as HttpConfig;
}

async function fetchJson(cfg: HttpConfig): Promise<unknown> {
  const res = await fetch(cfg.url, { headers: { Accept: "application/json", ...(cfg.headers ?? {}) } });
  if (!res.ok) throw new Error(`http adapter: ${res.status} for ${cfg.url}`);
  return res.json();
}

class HttpAdapter implements NicheAdapter {
  readonly key = "http";

  async isReady(ctx: RunContext): Promise<{ ready: boolean; reason?: string }> {
    try {
      const cfg = parseConfig(ctx);
      const series = extractSeries(await fetchJson(cfg), cfg);
      return series.length > 0 ? { ready: true } : { ready: false, reason: "empty series from feed" };
    } catch (err) {
      return { ready: false, reason: (err as Error).message };
    }
  }

  async fetch(ctx: RunContext): Promise<RawData> {
    return fetchJson(parseConfig(ctx));
  }

  async analyze(raw: RawData, ctx: RunContext): Promise<ContentPayload> {
    const cfg = parseConfig(ctx);
    const series = extractSeries(raw, cfg);
    if (series.length === 0) throw new Error("http adapter: no numeric series to analyze");

    const ys = series.map((p) => p.y);
    const avg = round(ys.reduce((s, y) => s + y, 0) / ys.length);
    const min = series.reduce((m, p) => (p.y < m.y ? p : m), series[0]!);
    const max = series.reduce((m, p) => (p.y > m.y ? p : m), series[0]!);
    const unit = cfg.unit ?? "";
    const label = cfg.label ?? "valor";
    const best = cfg.lower_is_better ? min : max;

    const headline = (cfg.headline ?? `Hoy el ${label} medio es {avg} {unit}`)
      .replace("{avg}", String(avg))
      .replace("{min}", String(min.y))
      .replace("{max}", String(max.y))
      .replace("{unit}", unit)
      .replace("{label}", label)
      .trim();

    const keyMetrics: Metric[] = [
      { label: `Media`, value: avg, unit, emphasis: "primary" },
      { label: `Mínimo (${min.x})`, value: round(min.y), unit, emphasis: "secondary" },
      { label: `Máximo (${max.x})`, value: round(max.y), unit, emphasis: "secondary" },
    ];

    return {
      channelId: ctx.channel.id,
      date: ctx.date,
      headlineFact: headline,
      keyMetrics,
      segments: [
        { title: "Mejor momento", detail: `${best.x} con ${round(best.y)} ${unit}`.trim() },
        { title: "Rango del día", detail: `de ${round(min.y)} a ${round(max.y)} ${unit}`.trim() },
      ],
      visualData: { type: "timeseries", series, highlight: { min: min.x, max: max.x } },
      cta: "Sígueme para el dato de cada día.",
      sourceRef: { name: cfg.source_name ?? new URL(cfg.url).hostname, url: cfg.source_url ?? cfg.url },
      safety: { factsVerified: true, notes: `Serie de ${series.length} puntos desde ${cfg.url}` },
    };
  }
}

export function createHttpAdapter(): NicheAdapter {
  return new HttpAdapter();
}
