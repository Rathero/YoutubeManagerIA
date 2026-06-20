import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Publisher } from "../_interface.js";
import type { PlatformMeta, PublishResult } from "../../core/types/index.js";
import { runDir } from "../../storage/paths.js";

/** Build the post text from metadata + an optional link, clamped to a char limit. */
export function buildPostText(meta: PlatformMeta, limit: number): string {
  const link = (meta.extra?.link as string | undefined) ?? "";
  const tags = meta.hashtags.slice(0, 3).join(" ");
  const parts = [meta.title, link, tags].filter(Boolean).join("\n");
  return parts.length > limit ? parts.slice(0, limit - 1) + "…" : parts;
}

async function enqueueTextPost(channelId: string, date: string, platform: string, format: string, text: string): Promise<string> {
  const dir = join(runDir(channelId, date), "queue");
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${platform}-${format}.txt`);
  await writeFile(path, text, "utf8");
  return path;
}

type PubInput = {
  channelId: string;
  date: string;
  asset: { format: any };
  meta: PlatformMeta;
  account: { ref: string; mode: "auto" | "assisted" };
  dryRun: boolean;
};

/** X / Twitter (API v2). Needs X_ACCESS_TOKEN (OAuth2 user token). */
export class XPublisher implements Publisher {
  readonly platform = "x" as const;
  async publish(i: PubInput): Promise<PublishResult> {
    const text = buildPostText(i.meta, 280);
    if (i.dryRun) return { platform: "x", format: i.meta.format, status: "skipped", message: "dry-run" };
    const token = process.env.X_ACCESS_TOKEN;
    if (!token || i.account.mode !== "auto") {
      const p = await enqueueTextPost(i.channelId, i.date, "x", i.meta.format, text);
      return { platform: "x", format: i.meta.format, status: "queued_assisted", queuedItemPath: p, message: token ? "mode=assisted" : "no X_ACCESS_TOKEN" };
    }
    try {
      const res = await fetch("https://api.twitter.com/2/tweets", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(`x ${res.status}: ${await res.text()}`);
      const j = (await res.json()) as { data?: { id?: string } };
      return { platform: "x", format: i.meta.format, status: "published", externalId: j.data?.id, url: j.data?.id ? `https://x.com/i/web/status/${j.data.id}` : undefined };
    } catch (e) {
      return { platform: "x", format: i.meta.format, status: "failed", message: (e as Error).message };
    }
  }
}

/** Bluesky (AT Protocol). Needs BLUESKY_HANDLE + BLUESKY_APP_PASSWORD. */
export class BlueskyPublisher implements Publisher {
  readonly platform = "bluesky" as const;
  async publish(i: PubInput): Promise<PublishResult> {
    const text = buildPostText(i.meta, 300);
    if (i.dryRun) return { platform: "bluesky", format: i.meta.format, status: "skipped", message: "dry-run" };
    const handle = process.env.BLUESKY_HANDLE;
    const pass = process.env.BLUESKY_APP_PASSWORD;
    if (!handle || !pass || i.account.mode !== "auto") {
      const p = await enqueueTextPost(i.channelId, i.date, "bluesky", i.meta.format, text);
      return { platform: "bluesky", format: i.meta.format, status: "queued_assisted", queuedItemPath: p, message: handle ? "mode=assisted" : "no BLUESKY_* creds" };
    }
    try {
      const base = "https://bsky.social/xrpc";
      const s = await fetch(`${base}/com.atproto.server.createSession`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier: handle, password: pass }),
      });
      if (!s.ok) throw new Error(`bsky session ${s.status}`);
      const session = (await s.json()) as { accessJwt: string; did: string };
      const r = await fetch(`${base}/com.atproto.repo.createRecord`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${session.accessJwt}` },
        body: JSON.stringify({ repo: session.did, collection: "app.bsky.feed.post", record: { text, createdAt: new Date().toISOString() } }),
      });
      if (!r.ok) throw new Error(`bsky post ${r.status}`);
      const j = (await r.json()) as { uri?: string };
      return { platform: "bluesky", format: i.meta.format, status: "published", externalId: j.uri };
    } catch (e) {
      return { platform: "bluesky", format: i.meta.format, status: "failed", message: (e as Error).message };
    }
  }
}

/** LinkedIn (UGC posts). Needs LINKEDIN_ACCESS_TOKEN + LINKEDIN_AUTHOR_URN. */
export class LinkedInPublisher implements Publisher {
  readonly platform = "linkedin" as const;
  async publish(i: PubInput): Promise<PublishResult> {
    const text = buildPostText(i.meta, 2900);
    if (i.dryRun) return { platform: "linkedin", format: i.meta.format, status: "skipped", message: "dry-run" };
    const token = process.env.LINKEDIN_ACCESS_TOKEN;
    const author = process.env.LINKEDIN_AUTHOR_URN;
    if (!token || !author || i.account.mode !== "auto") {
      const p = await enqueueTextPost(i.channelId, i.date, "linkedin", i.meta.format, text);
      return { platform: "linkedin", format: i.meta.format, status: "queued_assisted", queuedItemPath: p, message: token ? "mode=assisted" : "no LINKEDIN_* creds" };
    }
    try {
      const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "X-Restli-Protocol-Version": "2.0.0" },
        body: JSON.stringify({
          author,
          lifecycleState: "PUBLISHED",
          specificContent: { "com.linkedin.ugc.ShareContent": { shareCommentary: { text }, shareMediaCategory: "NONE" } },
          visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
        }),
      });
      if (!res.ok) throw new Error(`linkedin ${res.status}`);
      const id = res.headers.get("x-restli-id") ?? undefined;
      return { platform: "linkedin", format: i.meta.format, status: "published", externalId: id };
    } catch (e) {
      return { platform: "linkedin", format: i.meta.format, status: "failed", message: (e as Error).message };
    }
  }
}
