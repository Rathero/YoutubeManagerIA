import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDuplicateHeadline } from "./dedup.js";
import { addToBacklog, loadBacklog, nextForDate } from "./backlog.js";

process.env.FACTORY_DATA_DIR = mkdtempSync(join(tmpdir(), "cf-content-"));

describe("dedup headlines", () => {
  it("matches ignoring case/accents/punctuation", () => {
    expect(isDuplicateHeadline("Mañana la luz baja un 18%!", ["manana la luz baja un 18"])).toBe(true);
    expect(isDuplicateHeadline("Otro tema distinto", ["manana la luz baja"])).toBe(false);
  });
});

describe("idea backlog", () => {
  it("adds (dedup), then serves the next unused per date (idempotent)", async () => {
    expect(await addToBacklog("ch", ["Thor", "Loki", "Thor"])).toBe(2); // dup skipped
    const a = await nextForDate("ch", "2026-06-21");
    expect(a).toBe("Thor");
    // same date → same angle
    expect(await nextForDate("ch", "2026-06-21")).toBe("Thor");
    // new date → next unused
    expect(await nextForDate("ch", "2026-06-22")).toBe("Loki");
    // exhausted → null
    expect(await nextForDate("ch", "2026-06-23")).toBeNull();
    const items = await loadBacklog("ch");
    expect(items.filter((i) => i.usedDate).length).toBe(2);
  });
});
