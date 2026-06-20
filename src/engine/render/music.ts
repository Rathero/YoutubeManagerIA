import { exec } from "node:child_process";
import { access, rename } from "node:fs/promises";
import { promisify } from "node:util";
import { resolve } from "node:path";

const pexec = promisify(exec);

async function hasFfmpeg(): Promise<boolean> {
  try {
    await pexec("ffmpeg -version");
    return true;
  } catch {
    return false;
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** ffmpeg args to mix a looped background track under the existing audio at `volumeDb`. */
export function musicMixArgs(videoPath: string, trackPath: string, volumeDb: number, outPath: string): string {
  return (
    `ffmpeg -y -i "${videoPath}" -stream_loop -1 -i "${trackPath}" ` +
    `-filter_complex "[1:a]volume=${volumeDb}dB[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[a]" ` +
    `-map 0:v -map "[a]" -c:v copy -c:a aac -shortest "${outPath}"`
  );
}

/**
 * Mix a background music track under a rendered MP4 (in place). No-op unless ffmpeg is
 * present and the track exists. Runs as a post-pass so it works for any render engine.
 */
export async function mixMusicInto(videoPath: string, track: string, volumeDb: number): Promise<boolean> {
  const trackPath = resolve(process.cwd(), track);
  if (!(await hasFfmpeg()) || !(await exists(trackPath)) || !videoPath.endsWith(".mp4")) return false;
  const tmp = videoPath.replace(/\.mp4$/, ".music.mp4");
  await pexec(musicMixArgs(videoPath, trackPath, volumeDb, tmp));
  await rename(tmp, videoPath);
  return true;
}
