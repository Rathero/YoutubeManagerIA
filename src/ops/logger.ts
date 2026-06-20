export type LogLevel = "debug" | "info" | "warn" | "error";

const order: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Structured logger bound to a run; emits single-line JSON for easy ingestion. */
export function createLogger(bindings: Record<string, unknown> = {}) {
  const min = (process.env.FACTORY_LOG_LEVEL as LogLevel) ?? "info";
  return (level: LogLevel, msg: string, extra?: Record<string, unknown>) => {
    if (order[level] < order[min]) return;
    const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...bindings, ...extra });
    if (level === "error") process.stderr.write(line + "\n");
    else process.stdout.write(line + "\n");
  };
}
