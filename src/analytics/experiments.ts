import type { ChannelDefinition } from "../core/types/index.js";
import { deriveFeedback, type FeedbackSignal, type PublicationMetric } from "./index.js";

export interface Experiment {
  variable: "title" | "publish_time" | "format" | "duration";
  hypothesis: string;
  variants: string[];
  status: "suggested" | "running" | "concluded";
  note: string;
}

function distinct<T>(xs: (T | undefined)[]): T[] {
  return [...new Set(xs.filter((x): x is T => x !== undefined))];
}

function signalFor(variable: string, signals: FeedbackSignal[]): FeedbackSignal | undefined {
  return signals.find((s) => s.variable === variable);
}

/**
 * Auto-experiments — turns the feedback loop into a continuous testing plan. For each
 * controllable variable it reports whether an experiment is concluded (with the winner),
 * running (enough variation, not enough data), or just suggested (not being tested yet),
 * and proposes the concrete next test. Deterministic; drives the dashboard + CLI.
 */
export function proposeExperiments(channel: ChannelDefinition, metrics: PublicationMetric[]): Experiment[] {
  const signals = deriveFeedback(metrics);
  const out: Experiment[] = [];

  // 1) Title A/B
  const titles = distinct(metrics.map((m) => m.titleVariant));
  const titleSig = signalFor("title", signals);
  out.push({
    variable: "title",
    hypothesis: "Variar el encuadre del título (afirmación vs. pregunta vs. énfasis) cambia el CTR.",
    variants: ["A: afirmación", "B: pregunta", "C: énfasis 👀"],
    status: titleSig ? "concluded" : titles.length > 1 ? "running" : channel.ab_testing.titles ? "running" : "suggested",
    note: titleSig?.recommendation ?? (channel.ab_testing.titles ? "Rotando variantes; recopilando datos." : "Activa ab_testing.titles para empezar."),
  });

  // 2) Publish time
  const hours = distinct(metrics.map((m) => m.publishHour));
  const timeSig = signalFor("publish_time", signals);
  out.push({
    variable: "publish_time",
    hypothesis: "La hora de publicación afecta a las vistas iniciales y al alcance.",
    variants: hours.length > 1 ? hours.map((h) => `${h}:00`) : ["21:00", "18:00"],
    status: timeSig ? "concluded" : hours.length > 1 ? "running" : "suggested",
    note: timeSig?.recommendation ?? "Prueba publicar a 2 horas distintas durante 1-2 semanas.",
  });

  // 3) Format mix
  const formats = distinct(metrics.map((m) => m.format));
  const fmtSig = signalFor("format", signals);
  out.push({
    variable: "format",
    hypothesis: "El formato (short vs. long) cambia la retención y el descubrimiento.",
    variants: formats.length > 1 ? formats : channel.formats.filter((f) => f.enabled).map((f) => f.kind),
    status: fmtSig ? "concluded" : formats.length > 1 ? "running" : "suggested",
    note: fmtSig?.recommendation ?? "Mantén short + long activos para comparar.",
  });

  // 4) Duration (not auto-varied yet → always a suggestion)
  const short = channel.formats.find((f) => f.kind === "short" && f.enabled);
  if (short?.target_seconds) {
    out.push({
      variable: "duration",
      hypothesis: "La duración del short afecta a la retención porcentual.",
      variants: [`${Math.max(15, short.target_seconds - 10)}s`, `${short.target_seconds + 10}s`],
      status: "suggested",
      note: `Prueba alternar la duración objetivo del short alrededor de ${short.target_seconds}s.`,
    });
  }

  return out;
}
