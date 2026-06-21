/**
 * Telegram approval bot. Long-polls getUpdates and lets you approve/reject held runs from
 * your phone. Only messages from TELEGRAM_CHAT_ID are honored (the bot ignores everyone else).
 *
 *   /pending                  → list runs awaiting approval
 *   /approve <channel> <date> → publish a held run
 *   /reject  <channel> <date> → discard a held run
 *
 * Run with `factory telegram`. No external SDK — raw Telegram Bot API over fetch.
 */
import { resilientFetch } from "../core/util/fetch.js";

export interface BotCommand {
  cmd: "pending" | "approve" | "reject" | "help" | "unknown";
  channel?: string;
  date?: string;
}

/** Parse a Telegram message into a command. Pure — unit tested. */
export function parseCommand(text: string): BotCommand {
  const trimmed = text.trim();
  // Strip a leading "/cmd@BotName" mention form.
  const [head, ...rest] = trimmed.split(/\s+/);
  const cmd = (head ?? "").replace(/^\//, "").split("@")[0]!.toLowerCase();
  if (cmd === "pending" || cmd === "list") return { cmd: "pending" };
  if (cmd === "start" || cmd === "help") return { cmd: "help" };
  if (cmd === "approve" || cmd === "reject") {
    return { cmd, channel: rest[0], date: rest[1] };
  }
  return { cmd: "unknown" };
}

interface TelegramUpdate {
  update_id: number;
  message?: { text?: string; chat?: { id: number } };
}

async function api(token: string, method: string, body: Record<string, unknown>): Promise<any> {
  const res = await resilientFetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({}));
}

async function send(token: string, chatId: string | number, text: string): Promise<void> {
  await api(token, "sendMessage", { chat_id: chatId, text: text.slice(0, 4000) }).catch(() => undefined);
}

/** Execute one parsed command and return the reply text. Exported for testing/reuse. */
export async function handleCommand(cmd: BotCommand): Promise<string> {
  switch (cmd.cmd) {
    case "help":
      return [
        "🤖 Channel Factory — aprobación",
        "/pending — lista lo que espera aprobación",
        "/approve <canal> <fecha> — publica",
        "/reject <canal> <fecha> — descarta",
      ].join("\n");
    case "pending": {
      const { listPending } = await import("../storage/pending.js");
      const recs = await listPending();
      if (recs.length === 0) return "✅ Nada pendiente.";
      return recs
        .map((r) => `• ${r.channelId} ${r.date} — ${r.items.length} salida(s)\n   /approve ${r.channelId} ${r.date}`)
        .join("\n");
    }
    case "approve": {
      if (!cmd.channel || !cmd.date) return "Uso: /approve <canal> <fecha>";
      const { approvePending } = await import("../engine/publish/approve.js");
      try {
        const results = await approvePending(cmd.channel, cmd.date);
        const ok = results.filter((r) => r.status === "published").length;
        return `✅ Publicado ${cmd.channel} ${cmd.date}: ${ok}/${results.length} salida(s).`;
      } catch (err) {
        return `❌ ${(err as Error).message}`;
      }
    }
    case "reject": {
      if (!cmd.channel || !cmd.date) return "Uso: /reject <canal> <fecha>";
      const { rejectPending } = await import("../engine/publish/approve.js");
      await rejectPending(cmd.channel, cmd.date);
      return `🗑️ Descartado ${cmd.channel} ${cmd.date}.`;
    }
    default:
      return "No te entendí. Envía /help.";
  }
}

export interface BotOptions {
  token?: string;
  chatId?: string;
  /** Stop after one poll (for smoke tests). */
  once?: boolean;
  log?: (msg: string) => void;
}

/** Long-poll loop. Honors only messages from the configured chat id. */
export async function runTelegramBot(opts: BotOptions = {}): Promise<void> {
  const token = opts.token ?? process.env.TELEGRAM_BOT_TOKEN;
  const chatId = opts.chatId ?? process.env.TELEGRAM_CHAT_ID;
  const log = opts.log ?? ((m: string) => console.log(m));
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN no configurado");
  if (!chatId) throw new Error("TELEGRAM_CHAT_ID no configurado (a quién obedece el bot)");

  log(`Bot de aprobación escuchando (chat ${chatId}). Ctrl+C para salir.`);
  let offset = 0;
  for (;;) {
    let updates: TelegramUpdate[] = [];
    try {
      const res = await api(token, "getUpdates", { offset, timeout: 25 });
      updates = (res?.result ?? []) as TelegramUpdate[];
    } catch (err) {
      log(`getUpdates falló: ${(err as Error).message}`);
      if (opts.once) return;
      continue;
    }
    for (const u of updates) {
      offset = Math.max(offset, u.update_id + 1);
      const text = u.message?.text;
      const from = u.message?.chat?.id;
      if (!text) continue;
      if (String(from) !== String(chatId)) {
        log(`ignorado mensaje de chat ${from}`);
        continue;
      }
      const reply = await handleCommand(parseCommand(text));
      await send(token, chatId, reply);
      log(`> ${text}  →  ${reply.split("\n")[0]}`);
    }
    if (opts.once) return;
  }
}
