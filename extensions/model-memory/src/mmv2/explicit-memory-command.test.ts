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

  it("parses general remember-this commands as explicit project facts", () => {
    const command = parseExplicitMemoryCommand(
      "For project model-memory, please remember this exact value: PHASE2-UI-GENERIC-VALUE-001",
    );

    expect(command).toMatchObject({
      commandType: "project_fact",
      statement: "PHASE2-UI-GENERIC-VALUE-001",
    });
  });

  it("parses cited researcher-report facts only when a source ref is present", () => {
    const command = parseExplicitMemoryCommand(
      "Researcher report artifact. Cited fact: model-memory live proof uses cited soft evidence. Source ref: https://example.invalid/report. Treat this as cited soft evidence, not hard truth.",
    );

    expect(command).toMatchObject({
      commandType: "project_fact",
      sourceProfileId: "researcher_report_artifact",
      statement: "model-memory live proof uses cited soft evidence.",
      citationRefs: ["https://example.invalid/report"],
      evidenceQuote: "model-memory live proof uses cited soft evidence.",
    });
    expect(
      parseExplicitMemoryCommand(
        "Researcher report artifact. Cited fact: model-memory live proof lacks source refs.",
      ),
    ).toBeNull();
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
