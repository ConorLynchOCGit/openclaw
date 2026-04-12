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
        procedureFamily: "supported_key",
        procedureKey: "deploy_checklist",
        template: "named_recurring_checklist",
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
        procedureFamily: "supported_key",
        procedureKey: "release_checklist",
        title: "Release checklist",
      },
    });
  });

  it("captures an explicit generic recurring checklist title without a supported procedure key", () => {
    expect(
      detectRecurringProcedureSemanticDecision(
        [
          "My release evidence handoff checklist:",
          "1. Capture the signed evidence bundle.",
          "2. Post the handoff note in the audit channel.",
        ].join("\n"),
      ),
    ).toMatchObject({
      action: "capture",
      confidence: "high",
      match: {
        captureClass: "explicit_recurring_procedure",
        procedureFamily: "generalized_named_checklist",
        template: "generalized_recurring_checklist",
        title: "Release Evidence Handoff Checklist",
        steps: ["Capture the signed evidence bundle", "Post the handoff note in the audit channel"],
      },
    });
  });

  it("captures a medium-confidence generic recurring checklist subject as hold-for-more-evidence eligible", () => {
    expect(
      detectRecurringProcedureSemanticDecision(
        [
          "For rollback verification, we use this checklist:",
          "1. Confirm the rollback version.",
          "2. Verify the key health checks.",
        ].join("\n"),
      ),
    ).toMatchObject({
      action: "capture",
      confidence: "medium",
      match: {
        procedureFamily: "generalized_named_checklist",
        template: "generalized_recurring_checklist",
        title: "Rollback Verification Checklist",
      },
    });
  });

  it("captures a titled default phase order as a structured recurring procedure", () => {
    expect(
      detectRecurringProcedureSemanticDecision(
        [
          "Default phase order:",
          "1. Implementation loop",
          "2. Pre-proof gate",
          "3. Commit and push",
        ].join("\n"),
      ),
    ).toMatchObject({
      action: "capture",
      confidence: "medium",
      match: {
        procedureFamily: "generalized_named_checklist",
        title: "Default Phase Order",
        steps: ["Implementation loop", "Pre-proof gate", "Commit and push"],
      },
    });
  });

  it("captures a titled gate block with actionable steps as a recurring procedure", () => {
    expect(
      detectRecurringProcedureSemanticDecision(
        [
          "Pre-production gate:",
          "- Freeze the proof plan.",
          "- Capture the rollback reference.",
          "- Confirm the worktree still matches the proofed code.",
        ].join("\n"),
      ),
    ).toMatchObject({
      action: "capture",
      confidence: "high",
      match: {
        procedureFamily: "generalized_named_checklist",
        title: "Pre-production Gate",
        steps: [
          "Freeze the proof plan",
          "Capture the rollback reference",
          "Confirm the worktree still matches the proofed code",
        ],
      },
    });
  });

  it("captures a generic titled quick-start block when the steps are still clearly actionable", () => {
    expect(
      detectRecurringProcedureSemanticDecision(
        [
          "Quick start:",
          "- Default local loop: `pnpm check:fast` plus the strongest nearby targeted tests.",
          "- Use `pnpm build:runtime:fast` plus `pnpm runtime:proof:fast` for non-production runtime proof.",
          "- Debug provider issues with a narrowed `pnpm test:live`.",
        ].join("\n"),
      ),
    ).toMatchObject({
      action: "capture",
      match: {
        procedureFamily: "generalized_named_checklist",
        title: "Quick Start",
        steps: [
          "Default local loop: `pnpm check:fast` plus the strongest nearby targeted tests",
          "Use `pnpm build:runtime:fast` plus `pnpm runtime:proof:fast` for non-production runtime proof",
          "Debug provider issues with a narrowed `pnpm test:live`",
        ],
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
        procedureFamily: "supported_key",
        procedureKey: "triage_checklist",
      },
    });
  });

  it("ignores generic one-off procedure phrasing that stays transient", () => {
    expect(
      detectRecurringProcedureSemanticDecision(
        ["My checklist for this deploy today:", "1. Patch prod quickly.", "2. Hope it works."].join(
          "\n",
        ),
      ),
    ).toMatchObject({
      action: "ignore",
      reason: "no_supported_recurring_procedure_match",
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

  it("ignores titled gate prose that is only descriptive qualities rather than a reusable procedure", () => {
    expect(
      detectRecurringProcedureSemanticDecision(
        [
          "Production-proof gate:",
          "- narrow",
          "- cleanup-backed when it writes durable state",
          "- rollback-backed",
        ].join("\n"),
      ),
    ).toMatchObject({
      action: "ignore",
    });
  });
});
