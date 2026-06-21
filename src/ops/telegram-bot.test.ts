import { describe, expect, it } from "vitest";
import { parseCommand, handleCommand } from "./telegram-bot.js";

describe("telegram command parsing", () => {
  it("parses pending/help aliases", () => {
    expect(parseCommand("/pending").cmd).toBe("pending");
    expect(parseCommand("/list").cmd).toBe("pending");
    expect(parseCommand("/start").cmd).toBe("help");
  });

  it("parses approve/reject with channel + date", () => {
    expect(parseCommand("/approve luz-es 2026-06-21")).toEqual({
      cmd: "approve",
      channel: "luz-es",
      date: "2026-06-21",
    });
    expect(parseCommand("/reject luz-es 2026-06-21").cmd).toBe("reject");
  });

  it("handles the @BotName mention form", () => {
    expect(parseCommand("/approve@FactoryBot luz 2026-06-21").channel).toBe("luz");
  });

  it("flags unknown input", () => {
    expect(parseCommand("hola").cmd).toBe("unknown");
  });
});

describe("telegram command handling", () => {
  it("explains usage on incomplete approve", async () => {
    expect(await handleCommand({ cmd: "approve" })).toContain("Uso:");
  });

  it("reports an error approving a non-existent run", async () => {
    const reply = await handleCommand({ cmd: "approve", channel: "nope", date: "2000-01-01" });
    expect(reply.startsWith("❌")).toBe(true);
  });

  it("renders help text", async () => {
    expect(await handleCommand({ cmd: "help" })).toContain("/pending");
  });
});
