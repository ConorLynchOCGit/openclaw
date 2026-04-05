import { describe, expect, it } from "vitest";
import { detectRecurringProcedureSemanticDecision } from "./recurring-procedure-semantic.js";

describe("detectRecurringProcedureSemanticDecision", () => {
  it("captures an explicit named checklist with bounded steps", () => {
    expect(
      detectRecurringProcedureSemanticDecision(
        [
          "My deploy checklist:",
          "1. Open the canary lane.",
          "2. Verify health.",
          "3. Roll forward.",
        ].join("\n"),
      ),
    ).toMatchObject({
      action: "capture",
      confidence: "high",
      match: {
        captureClass: "explicit_recurring_procedure",
        procedureKey: "deploy_checklist",
        title: "Deploy checklist",
        steps: ["Open the canary lane", "Verify health", "Roll forward"],
      },
    });
  });

  it("captures a softer recurring procedure signal as pending-confirmation eligible", () => {
    expect(
      detectRecurringProcedureSemanticDecision(
        [
          "For releases, we use this checklist:",
          "1. Cut the release branch.",
          "2. Run the smoke suite.",
        ].join("\n"),
      ),
    ).toMatchObject({
      action: "capture",
      confidence: "medium",
      match: {
        procedureKey: "release_checklist",
        title: "Release checklist",
      },
    });
  });

  it("treats correction phrasing as a recurring-procedure correction", () => {
    expect(
      detectRecurringProcedureSemanticDecision(
        ["Actually, my triage checklist:", "1. Reproduce the issue.", "2. Capture logs."].join(
          "\n",
        ),
      ),
    ).toMatchObject({
      action: "capture",
      confidence: "high",
      match: {
        captureClass: "recurring_procedure_correction",
        procedureKey: "triage_checklist",
      },
    });
  });

  it("ignores unsupported one-off steps without a named bounded checklist", () => {
    expect(
      detectRecurringProcedureSemanticDecision(
        ["For this deploy today:", "1. Patch prod quickly.", "2. Hope it works."].join("\n"),
      ),
    ).toMatchObject({
      action: "ignore",
    });
  });
});
