export interface Cue {
  index: number;
  startSec: number;
  endSec: number;
  text: string;
}

/** Split a long line into chunks of at most `maxChars`, breaking on word boundaries. */
function wrap(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur.length + 1 + w.length) > maxChars) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cur ? `${cur} ${w}` : w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Build subtitle cues from narration, timed proportionally to the audio duration by
 * word count. Deterministic (no ASR): good enough for faceless shorts where the
 * narration text IS the script. Each cue is a sentence (long ones are split).
 */
export function buildCues(narration: string, totalSeconds: number, maxCharsPerLine = 38): Cue[] {
  const text = narration.trim();
  if (!text) return [];
  const sentences = text.split(/(?<=[.!?…])\s+/).filter(Boolean);

  // Further split sentences that would exceed ~2 lines, into ~maxChars*2 windows.
  const segments: string[] = [];
  for (const s of sentences) {
    const lines = wrap(s, maxCharsPerLine);
    if (lines.length <= 2) {
      segments.push(s);
    } else {
      for (let i = 0; i < lines.length; i += 2) segments.push(lines.slice(i, i + 2).join(" "));
    }
  }

  const totalWords = segments.reduce((n, s) => n + s.split(/\s+/).length, 0) || 1;
  const cues: Cue[] = [];
  let t = 0;
  segments.forEach((seg, i) => {
    const words = seg.split(/\s+/).length;
    const dur = (words / totalWords) * totalSeconds;
    const start = t;
    const end = Math.min(totalSeconds, t + dur);
    t = end;
    cues.push({ index: i + 1, startSec: start, endSec: end, text: wrap(seg, maxCharsPerLine).join("\n") });
  });
  return cues;
}

function stamp(sec: number): string {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const milli = ms % 1000;
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(milli, 3)}`;
}

export function toSrt(cues: Cue[]): string {
  return (
    cues
      .map((c) => `${c.index}\n${stamp(c.startSec)} --> ${stamp(c.endSec)}\n${c.text}`)
      .join("\n\n") + "\n"
  );
}
