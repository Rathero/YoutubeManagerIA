import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChannelDefinition, ContentPayload, PublishResult } from "../../core/types/index.js";
import { runDir } from "../../storage/paths.js";

/** A text/Markdown edition of the (already-structured) payload — algorithm-independent. */
export function buildNewsletterMarkdown(channel: ChannelDefinition, payload: ContentPayload): string {
  const lines: string[] = [];
  lines.push(`# ${channel.identity.name} — ${payload.date}`, "");
  lines.push(`**${payload.headlineFact}**`, "");
  if (payload.keyMetrics.length) {
    for (const m of payload.keyMetrics) lines.push(`- ${m.label}: ${m.value}${m.unit ? " " + m.unit : ""}`);
    lines.push("");
  }
  for (const s of payload.segments) lines.push(`### ${s.title}`, s.detail, "");
  if (payload.recommendation) {
    lines.push(`### ${payload.recommendation.headline}`);
    for (const it of payload.recommendation.items) lines.push(`- ${it.label}: ${it.window}`);
    lines.push("");
  }
  if (payload.context) lines.push(payload.context, "");
  if (payload.cta) lines.push(`_${payload.cta}_`, "");
  lines.push(`Fuente: ${payload.sourceRef.name}${payload.sourceRef.url ? ` (${payload.sourceRef.url})` : ""}`);
  return lines.join("\n");
}

function plainText(md: string): string {
  return md.replace(/[#*_`>]/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Emit the own-distribution editions (newsletter + Telegram). Always writes the Markdown
 * to disk; additionally posts to a provider when configured + credentials present.
 * Returns publish results (platform "newsletter"/"telegram").
 */
export async function emitOwnDistribution(
  channel: ChannelDefinition,
  date: string,
  payload: ContentPayload,
  dryRun: boolean,
): Promise<PublishResult[]> {
  const own = channel.distribution_own;
  if (!own) return [];
  const results: PublishResult[] = [];
  const md = buildNewsletterMarkdown(channel, payload);
  const format = (channel.formats[0]?.kind ?? "short") as PublishResult["format"];

  if (own.newsletter?.enabled) {
    const dir = join(runDir(channel.id, date), "newsletter");
    await mkdir(dir, { recursive: true });
    const path = join(dir, "edition.md");
    await writeFile(path, md, "utf8");

    if (dryRun) {
      results.push({ platform: "newsletter", format, status: "skipped", queuedItemPath: path, message: "dry-run (md written)" });
    } else {
      const sent = await sendNewsletter(own.newsletter.provider, channel.identity.name, md).catch((e) => e as Error);
      if (sent === true) results.push({ platform: "newsletter", format, status: "published", message: "sent" });
      else results.push({ platform: "newsletter", format, status: "queued_assisted", queuedItemPath: path, message: sent instanceof Error ? sent.message : "no provider configured; md written" });
    }
  }

  if (own.telegram_bot?.enabled) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chat = process.env.TELEGRAM_CHAT_ID;
    if (dryRun) {
      results.push({ platform: "telegram", format, status: "skipped", message: "dry-run" });
    } else if (token && chat) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: chat, text: plainText(md).slice(0, 4000) }),
        });
        if (!res.ok) throw new Error(`telegram ${res.status}`);
        results.push({ platform: "telegram", format, status: "published", message: "sent" });
      } catch (e) {
        results.push({ platform: "telegram", format, status: "failed", message: (e as Error).message });
      }
    } else {
      results.push({ platform: "telegram", format, status: "skipped", message: "TELEGRAM_BOT_TOKEN/CHAT_ID not set" });
    }
  }

  return results;
}

/** Post to a newsletter provider. Returns true if sent, false if not configured. */
async function sendNewsletter(provider: string | undefined, subject: string, md: string): Promise<boolean> {
  if (provider === "buttondown" && process.env.BUTTONDOWN_API_KEY) {
    const res = await fetch("https://api.buttondown.email/v1/emails", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Token ${process.env.BUTTONDOWN_API_KEY}` },
      body: JSON.stringify({ subject, body: md, status: "about_to_send" }),
    });
    if (!res.ok) throw new Error(`buttondown ${res.status}: ${await res.text()}`);
    return true;
  }
  if (provider === "listmonk" && process.env.LISTMONK_URL) {
    // listmonk requires creating a campaign; left as a documented extension point.
    throw new Error("listmonk provider configured but not wired (create campaign via its API)");
  }
  return false;
}
