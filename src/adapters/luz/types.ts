/** One hourly price point, normalized regardless of source (preciodelaluz/ESIOS). */
export interface HourPrice {
  /** Hour of day, 0..23. */
  hour: number;
  /** Price in €/kWh. */
  price: number;
}

export interface PriceSeries {
  /** ISO date (YYYY-MM-DD) the series belongs to. */
  date: string;
  hours: HourPrice[];
}

/** Raw data returned by luz.fetch() and consumed by luz.analyze(). */
export interface LuzRawData {
  today?: PriceSeries;
  tomorrow?: PriceSeries;
  /** 30-day moving average of the daily mean price, if known. */
  avg30d?: number;
  source: { name: string; url?: string };
}

export interface ApplianceConfig {
  key: string;
  duration_h: number;
  /** Bias the optimal window towards a part of the day. */
  prefer?: "night" | "day" | "any";
}

export interface LuzConfig {
  source: "preciodelaluz" | "esios" | "fixture";
  zone: string;
  appliances: ApplianceConfig[];
  /** Optional fixture path (for source: "fixture" or offline runs). */
  fixturePath?: string;
  /** Override for classification baseline when no 30d avg is fetched. */
  baselineEurKwh?: number;
}
