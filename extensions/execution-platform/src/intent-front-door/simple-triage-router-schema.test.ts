import { describe, expect, it } from "vitest";
import {
  SIMPLE_TRIAGE_REASON_CODE_MAX_COUNT,
  createSimpleTriageRouterOutput,
  parseSimpleTriageRouterOutput,
} from "./simple-triage-router-schema.ts";

describe("SimpleTriageRouter schema", () => {
  it("parses valid lanes", () => {
    for (const lane of [
      "chat_send",
      "advanced_intent_front_door",
      "protocol_or_control_reject",
    ] as const) {
      const parsed = parseSimpleTriageRouterOutput(
        createSimpleTriageRouterOutput({
          lane,
          confidence: 0.9,
          reasonCodes: ["fixture_lane"],
          boundedRationale: "bounded rationale",
        }),
      );

      expect(parsed.valid).toBe(true);
      expect(parsed.output?.lane).toBe(lane);
      expect(parsed.rawPromptStored).toBe(false);
      expect(parsed.rawResponseStored).toBe(false);
    }
  });

  it("rejects unknown lane and unknown fields", () => {
    const base = createSimpleTriageRouterOutput({
      lane: "chat_send",
      confidence: 0.9,
      reasonCodes: ["fixture_lane"],
      boundedRationale: "bounded rationale",
    });

    expect(parseSimpleTriageRouterOutput({ ...base, lane: "workflow_execution" }).valid).toBe(
      false,
    );
    expect(parseSimpleTriageRouterOutput({ ...base, workflowId: "agent_team.coding" }).valid).toBe(
      false,
    );
  });

  it("rejects raw storage flags and unbounded fields", () => {
    const base = createSimpleTriageRouterOutput({
      lane: "chat_send",
      confidence: 0.9,
      reasonCodes: ["fixture_lane"],
      boundedRationale: "bounded rationale",
    });

    expect(parseSimpleTriageRouterOutput({ ...base, rawPromptStored: true }).valid).toBe(false);
    expect(parseSimpleTriageRouterOutput({ ...base, rawResponseStored: true }).valid).toBe(false);
    expect(
      parseSimpleTriageRouterOutput({ ...base, boundedRationale: "x".repeat(301) }).valid,
    ).toBe(false);
    expect(
      parseSimpleTriageRouterOutput({
        ...base,
        reasonCodes: Array.from(
          { length: SIMPLE_TRIAGE_REASON_CODE_MAX_COUNT + 1 },
          (_, index) => `reason_${index}`,
        ),
      }).valid,
    ).toBe(false);
  });

  it("does not allow workflow, action, authority, or side-effect fields", () => {
    const base = createSimpleTriageRouterOutput({
      lane: "advanced_intent_front_door",
      confidence: 0.9,
      reasonCodes: ["fixture_lane"],
      boundedRationale: "bounded rationale",
    });

    for (const field of [
      "workflowId",
      "jobType",
      "executeNow",
      "requestedActions",
      "requestedAuthority",
      "sideEffectClass",
      "targetRefs",
    ]) {
      expect(parseSimpleTriageRouterOutput({ ...base, [field]: "not_allowed" }).valid).toBe(false);
    }
  });
});
