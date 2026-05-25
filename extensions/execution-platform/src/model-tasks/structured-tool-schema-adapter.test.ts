import { describe, expect, it } from "vitest";
import { classifyModelTaskCall } from "./model-task-classification.ts";
import {
  buildStructuredAdapterProviderProfile,
  classifyStructuredAdapterOutcome,
  structuredAdapterDiagnostics,
  structuredAdapterPreflight,
} from "./structured-tool-schema-adapter.ts";

describe("structured tool/schema adapter", () => {
  it("builds provider profiles from model task policy without storing raw provider data", () => {
    const classification = classifyModelTaskCall({
      taskClass: "schema_normalization",
      callSite: "scheduler.field_repair",
    });
    const profile = buildStructuredAdapterProviderProfile(classification);

    expect(profile).toMatchObject({
      providerKind: "openrouter",
      modelRef: "qwen/qwen3-coder-next",
      reasoningMode: "none",
      parserMode: "field_patch_json",
      responseFormatMode: "prompt_only_json",
      maxInputBytes: 24_000,
      maxOutputTokens: 2_400,
      emptyOutputRetryBudget: 0,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
  });

  it("blocks oversized inputs before provider invocation instead of truncating", () => {
    const profile = buildStructuredAdapterProviderProfile(
      classifyModelTaskCall({
        taskClass: "schema_normalization",
        callSite: "commitment_packet.targeted_normalization",
      }),
    );
    const preflight = structuredAdapterPreflight({
      profile,
      inputBytes: 24_001,
      requestedMaxOutputTokens: 2_400,
      requestedTimeoutMs: 45_000,
    });

    expect(preflight.accepted).toBe(false);
    expect(preflight.reasonCodes).toContain("structured_adapter_input_exceeds_policy_bound");
    expect(preflight.blockingReason).toContain("24001");
  });

  it("classifies no-content as same bounded retry only within the policy retry budget", () => {
    const profile = buildStructuredAdapterProviderProfile(
      classifyModelTaskCall({
        taskClass: "local_semantic_extraction",
        callSite: "commitment_packet.semantic_content",
      }),
    );
    const firstDiagnostics = structuredAdapterDiagnostics({
      profile,
      attempt: 1,
      httpStatus: 200,
      latencyMs: 60_000,
      content: "",
      finishReason: "length",
      nativeFinishReason: "length",
      errorReasonCode: "openrouter_no_content",
      inputBytes: 12_000,
      usage: { inputTokenCount: 1000, outputTokenCount: 0, totalTokenCount: 1000 },
    });
    expect(
      classifyStructuredAdapterOutcome({ profile, diagnostics: firstDiagnostics }),
    ).toMatchObject({
      status: "retry_same_bounded_task",
      retryAllowed: true,
      retryAttempt: 2,
      rawPromptStored: false,
    });

    const secondDiagnostics = { ...firstDiagnostics, attempt: 2 };
    expect(
      classifyStructuredAdapterOutcome({ profile, diagnostics: secondDiagnostics }),
    ).toMatchObject({
      status: "escalate_with_structured_reason",
      retryAllowed: false,
      escalationModelRefs: ["openai-codex/gpt-5.5"],
    });
  });

  it("turns schema failures into field-specific repair requests that preserve accepted fields", () => {
    const profile = buildStructuredAdapterProviderProfile(
      classifyModelTaskCall({
        taskClass: "schema_normalization",
        callSite: "router.enum_repair",
      }),
    );
    const diagnostics = structuredAdapterDiagnostics({
      profile,
      attempt: 1,
      httpStatus: 200,
      latencyMs: 200,
      content: '{"route":"workflow_execution"}',
      finishReason: "stop",
      nativeFinishReason: "stop",
      errorReasonCode: null,
      inputBytes: 500,
    });
    const outcome = classifyStructuredAdapterOutcome({
      profile,
      diagnostics,
      parsedJsonValid: false,
      schemaIssuePaths: ["constraints[0].constraintKind"],
      preserveFieldPaths: ["route", "responseMode"],
    });

    expect(outcome).toMatchObject({
      status: "needs_field_specific_schema_repair",
      schemaRepairRequired: true,
      missingFieldPaths: ["constraints[0].constraintKind"],
      preserveFieldPaths: ["route", "responseMode"],
    });
  });
});
