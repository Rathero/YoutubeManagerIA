import { readFile } from "node:fs/promises";
import type { Publisher } from "../_interface.js";
import type { PublishResult } from "../../core/types/index.js";
import { enqueueAssisted } from "../assisted-queue.js";

/**
 * YouTube publisher (Data API v3). Direct upload is the cleanest fully-automatable
 * path. We use a resumable upload over fetch (no SDK). It activates only when an
 * OAuth access token is present (FACTORY_YT_ACCESS_TOKEN); otherwise it falls back
 * to the assisted queue so the pipeline still produces a ready-to-post bundle.
 *
 * Token acquisition (OAuth refresh flow) is an ops concern left to the operator;
 * the env var keeps this module credential-free and testable.
 */
export class YouTubePublisher implements Publisher {
  readonly platform = "youtube" as const;

  async publish(input: {
    channelId: string;
    date: string;
    asset: { format: any; aspectRatio: string; path: string; mimeType: string; durationSec: number };
    meta: { platform: any; format: any; title: string; description: string; hashtags: string[]; extra?: Record<string, unknown> };
    account: { ref: string; mode: "auto" | "assisted" };
    dryRun: boolean;
  }): Promise<PublishResult> {
    const { asset, meta } = input;

    if (input.dryRun) {
      return { platform: "youtube", format: meta.format, status: "skipped", message: "dry-run" };
    }

    const token = process.env.FACTORY_YT_ACCESS_TOKEN;
    const canAuto = input.account.mode === "auto" && token && asset.mimeType === "video/mp4";
    if (!canAuto) {
      const queuedItemPath = await enqueueAssisted(input.channelId, input.date, asset as any, meta as any);
      return {
        platform: "youtube",
        format: meta.format,
        status: "queued_assisted",
        queuedItemPath,
        message: token ? "asset not an mp4 / mode=assisted" : "no FACTORY_YT_ACCESS_TOKEN; queued for manual upload",
      };
    }

    try {
      const externalId = await this.resumableUpload(token!, asset.path, {
        title: meta.title,
        description: meta.description,
        tags: meta.hashtags.map((h) => h.replace(/^#/, "")),
        isShort: Boolean(meta.extra?.isShort),
      });

      // Best-effort extras: custom thumbnail + subtitle track. Never fail the publish.
      const thumb = meta.extra?.thumbnailPath as string | undefined;
      if (thumb && /\.(png|jpe?g)$/i.test(thumb)) {
        await this.setThumbnail(token!, externalId, thumb).catch(() => undefined);
      }
      const srt = meta.extra?.captionsPath as string | undefined;
      if (srt && srt.endsWith(".srt")) {
        await this.insertCaption(token!, externalId, srt).catch(() => undefined);
      }

      return {
        platform: "youtube",
        format: meta.format,
        status: "published",
        externalId,
        url: `https://youtu.be/${externalId}`,
      };
    } catch (err) {
      return { platform: "youtube", format: meta.format, status: "failed", message: (err as Error).message };
    }
  }

  /** Set a custom thumbnail (thumbnails.set). */
  private async setThumbnail(token: string, videoId: string, imagePath: string): Promise<void> {
    const body = await readFile(imagePath);
    const type = imagePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    const res = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": type, "content-length": String(body.byteLength) },
      body,
    });
    if (!res.ok) throw new Error(`thumbnails.set ${res.status}`);
  }

  /** Insert an SRT subtitle track (captions.insert, multipart/related). */
  private async insertCaption(token: string, videoId: string, srtPath: string): Promise<void> {
    const srt = await readFile(srtPath, "utf8");
    const meta = JSON.stringify({ snippet: { videoId, language: "es", name: "Subtítulos", isDraft: false } });
    const boundary = "cf-" + Math.random().toString(36).slice(2);
    const parts =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
      `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n${srt}\r\n--${boundary}--\r\n`;
    const res = await fetch("https://www.googleapis.com/upload/youtube/v3/captions?part=snippet&uploadType=multipart", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": `multipart/related; boundary=${boundary}` },
      body: parts,
    });
    if (!res.ok) throw new Error(`captions.insert ${res.status}`);
  }

  /** Minimal Data API v3 resumable upload. */
  private async resumableUpload(
    token: string,
    filePath: string,
    snippet: { title: string; description: string; tags: string[]; isShort: boolean },
  ): Promise<string> {
    const body = await readFile(filePath);
    const metadata = {
      snippet: { title: snippet.title, description: snippet.description, tags: snippet.tags, categoryId: "27" },
      status: { privacyStatus: "public", selfDeclaredMadeForKids: false, containsSyntheticMedia: true },
    };

    // 1) start a resumable session
    const start = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "x-upload-content-type": "video/*",
          "x-upload-content-length": String(body.byteLength),
        },
        body: JSON.stringify(metadata),
      },
    );
    if (!start.ok) throw new Error(`YouTube session start ${start.status}: ${await start.text()}`);
    const uploadUrl = start.headers.get("location");
    if (!uploadUrl) throw new Error("YouTube: missing resumable upload URL");

    // 2) upload bytes
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "content-type": "video/*", "content-length": String(body.byteLength) },
      body,
    });
    if (!put.ok) throw new Error(`YouTube upload ${put.status}: ${await put.text()}`);
    const result = (await put.json()) as { id?: string };
    if (!result.id) throw new Error("YouTube: no video id returned");
    return result.id;
  }
}

export function createYouTubePublisher(): Publisher {
  return new YouTubePublisher();
}
