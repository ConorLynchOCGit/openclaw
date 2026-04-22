import { describe, expect, it } from "vitest";
import { parseExplicitMemoryCommand } from "./explicit-memory-command.ts";

describe("mmv2/explicit-memory-command", () => {
  it("parses explicit project fact commands without topic-specific inference", () => {
    const command = parseExplicitMemoryCommand(
      "SOAKQUAR-2026-04-21-PROJECTFACT: Durable workspace project fact: the current model-memory lane validates structural correction targets. Please store this if durable.",
    );

    expect(command).toEqual({
      commandType: "project_fact",
      evidenceQuote:
        "SOAKQUAR-2026-04-21-PROJECTFACT: Durable workspace project fact: the current model-memory lane validates structural correction targets. Please store this if durable.",
      statement: "the current model-memory lane validates structural correction targets.",
    });
  });

  it("parses structural correction target refs and does not infer topics", () => {
    const command = parseExplicitMemoryCommand(
      "SOAKQUAR-2026-04-21-CORRECTION: Durable correction targeting memory_id=memory-pref-001: replace the earlier preference with this standing preference: concise outcome first, then exact evidence.",
    );

    expect(command).toMatchObject({
      commandType: "correction_preference",
      preferenceObject: "concise outcome first, then exact evidence.",
      targetRefs: [{ type: "memory_id", value: "memory-pref-001" }],
    });
  });

  it("does not parse ordinary validation-report wording as a command", () => {
    expect(
      parseExplicitMemoryCommand(
        "For validation reports, I prefer concise status first and exact artifact paths.",
      ),
    ).toBeNull();
  });
});
