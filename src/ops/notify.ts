/**
 * Ops alerts. Posts a one-line status to Discord and/or Telegram. No-op when no webhook
 * / token is configured. Failures always alert; successes only if FACTORY_ALERT_ON_SUCCESS=1.
 */
export async function notify(text: string): Promise<void> {
  const jobs: Promise<unknown>[] = [];
  const discord = process.env.DISCORD_WEBHOOK_URL;
  if (discord) {
    jobs.push(
      fetch(discord, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: text.slice(0, 1900) }),
      }).catch(() => undefined),
    );
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (token && chat) {
    jobs.push(
      fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000) }),
      }).catch(() => undefined),
    );
  }
  await Promise.all(jobs);
}

export async function notifyRunOutcome(input: {
  channelId: string;
  date: string;
  status: "completed" | "skipped" | "failed";
  detail: string;
}): Promise<void> {
  const onSuccess = process.env.FACTORY_ALERT_ON_SUCCESS === "1";
  if (input.status === "completed" && !onSuccess) return;
  if (input.status === "skipped") return; // not noteworthy
  const icon = input.status === "completed" ? "✅" : "❌";
  await notify(`${icon} [${input.channelId} ${input.date}] ${input.status}: ${input.detail}`);
}
