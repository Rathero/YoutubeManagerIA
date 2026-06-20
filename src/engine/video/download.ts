import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** Download a URL to a local file. Optional headers for authenticated assets. */
export async function downloadTo(url: string, outPath: string, headers: Record<string, string> = {}): Promise<void> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`download ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, buf);
}
