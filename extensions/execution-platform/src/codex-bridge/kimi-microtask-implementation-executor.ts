import {
  KimiFileImplementationAdapter,
  type KimiAttemptDiagnostics,
  type KimiContextExpansionRequest,
  type KimiEditPlanStep,
  type KimiEvidenceClaim,
  type KimiFileImplementationAdapterInput,
  type KimiFileImplementationAdapterResult,
} from "./kimi-file-implementation-adapter.ts";

export type KimiMicrotaskImplementationExecutorInput = {
  microtaskId: string;
  microtaskTitle: string;
  exactEditObjective: string;
  rationaleForCallingThisRole?: string;
  downstreamConsumer?: string;
  expectedOutput?: string;
  contextScoutHandoff?: string;
  recommendedEditPoints?: Array<{
    path: string;
    symbolOrRegion?: string;
    reason: string;
  }>;
  repoRoot: string;
  allowedFileRefs: string[];
  targetFileRefs: string[];
  contextPackRefs: string[];
  validationCommandRefs: string[];
  acceptanceCriteria: string[];
  targetCommitmentIds?: string[];
  contextExpansion?: KimiFileImplementationAdapterInput["contextExpansion"];
  budgetPolicy?: Partial<KimiFileImplementationAdapterInput["budgetPolicy"]>;
};

export type KimiMicrotaskImplementationExecutorResult = {
  artifactKind: "kimi_microtask_implementation_executor_result";
  microtaskId: string;
  microtaskTitle: string;
  status: "completed" | "needs_review" | "escalated";
  modelRef: string;
  providerPath: string;
  modelRunRef: string | null;
  changedFileRefs: string[];
  diffHash: string | null;
  validationRefs: string[];
  artifactRefs: string[];
  limitations: string[];
  contextExpansionRequests: KimiContextExpansionRequest[];
  editPlanSteps: KimiEditPlanStep[];
  evidenceClaims: KimiEvidenceClaim[];
  attemptDiagnostics: KimiAttemptDiagnostics[];
  reasonCodes: string[];
  escalatedToCodexBridgeRecommended: boolean;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  workQueueLifecycleMutated: false;
};

function boundedLine(value: string, max = 1_000): string {
  return value.trim().replace(/\s+/gu, " ").slice(0, max);
}

export function buildKimiMicrotaskSummary(input: KimiMicrotaskImplementationExecutorInput): string {
  const recommendedEditPoints =
    input.recommendedEditPoints
      ?.slice(0, 8)
      .map((point) =>
        [
          boundedLine(point.path, 220),
          point.symbolOrRegion ? `#${boundedLine(point.symbolOrRegion, 120)}` : "",
          `: ${boundedLine(point.reason, 400)}`,
        ].join(""),
      ) ?? [];
  return [
    `Kimi microtask id: ${boundedLine(input.microtaskId, 120)}`,
    `Kimi microtask title: ${boundedLine(input.microtaskTitle, 180)}`,
    "You are performing one bounded standard implementation microtask, not the full project.",
    "Inspect the bounded target refs, produce a short edit plan, then produce a structured patch/file-edit proposal for the exact objective below.",
    `Exact edit objective: ${boundedLine(input.exactEditObjective, 1_500)}`,
    input.rationaleForCallingThisRole
      ? `Why the orchestrator called you now: ${boundedLine(input.rationaleForCallingThisRole, 800)}`
      : "",
    input.downstreamConsumer
      ? `Downstream consumer: ${boundedLine(input.downstreamConsumer, 400)}`
      : "",
    input.expectedOutput ? `Expected output: ${boundedLine(input.expectedOutput, 800)}` : "",
    `Target file refs: ${input.targetFileRefs.map((item) => boundedLine(item, 220)).join(", ")}`,
    `Allowed file refs: ${input.allowedFileRefs.map((item) => boundedLine(item, 220)).join(", ")}`,
    `Context refs: ${input.contextPackRefs.map((item) => boundedLine(item, 220)).join(", ")}`,
    input.contextScoutHandoff
      ? `Context scout handoff: ${boundedLine(input.contextScoutHandoff, 2_000)}`
      : "",
    recommendedEditPoints.length > 0 ? "Context scout recommended edit points:" : "",
    ...recommendedEditPoints.map((point) => `- ${point}`),
    "Acceptance criteria:",
    ...input.acceptanceCriteria.slice(0, 8).map((criterion) => `- ${boundedLine(criterion, 400)}`),
    "Prefer exact replace_text snippets, a fenced unified diff, or a SEARCH/REPLACE block for small edits. Use whole-file replacement only when it is clearly smaller and safer.",
    "Do not return needs_review merely because of uncertainty. If the bounded snapshots and target refs are sufficient, make the smallest safe patch.",
    "Return needs_review with no fileEdits only for a concrete blocker such as missing target snapshot, conflicting acceptance criteria, out-of-scope file, or validation impossible.",
    "Do not broaden scope, do not summarize the whole prompt, and do not pretend success without changed-file and validation evidence.",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

export class KimiMicrotaskImplementationExecutor {
  constructor(
    private readonly options: {
      adapter: Pick<KimiFileImplementationAdapter, "run">;
    },
  ) {}

  async run(
    input: KimiMicrotaskImplementationExecutorInput,
  ): Promise<KimiMicrotaskImplementationExecutorResult> {
    const adapterResult = await this.options.adapter.run({
      microtaskId: input.microtaskId,
      microtaskTitle: input.microtaskTitle,
      exactEditObjective: input.exactEditObjective,
      acceptanceCriteria: input.acceptanceCriteria,
      targetFileRefs: input.targetFileRefs,
      taskSummary: buildKimiMicrotaskSummary(input),
      repoRoot: input.repoRoot,
      allowedFileRefs: input.allowedFileRefs,
      contextPackRefs: input.contextPackRefs,
      validationCommandRefs: input.validationCommandRefs,
      targetCommitmentIds: input.targetCommitmentIds,
      contextExpansion: input.contextExpansion,
      budgetPolicy: {
        modelRef: input.budgetPolicy?.modelRef ?? "moonshotai/kimi-k2.6",
        providerPath: input.budgetPolicy?.providerPath ?? "openrouter",
        maxOutputTokens: input.budgetPolicy?.maxOutputTokens ?? 8_000,
        timeoutMs: input.budgetPolicy?.timeoutMs ?? 480_000,
        maxAttempts: input.budgetPolicy?.maxAttempts ?? 5,
      },
    });
    return this.fromAdapterResult(input, adapterResult);
  }

  private fromAdapterResult(
    input: KimiMicrotaskImplementationExecutorInput,
    result: KimiFileImplementationAdapterResult,
  ): KimiMicrotaskImplementationExecutorResult {
    return {
      artifactKind: "kimi_microtask_implementation_executor_result",
      microtaskId: input.microtaskId,
      microtaskTitle: input.microtaskTitle,
      status:
        result.status === "completed"
          ? "completed"
          : result.escalatedToCodexBridgeRecommended
            ? "escalated"
            : "needs_review",
      modelRef: result.modelRef,
      providerPath: result.providerPath,
      modelRunRef: result.modelRunRef,
      changedFileRefs: result.changedFileRefs,
      diffHash: result.diffHash,
      validationRefs: result.validationRefs,
      artifactRefs: result.artifactRefs,
      limitations: result.limitations,
      contextExpansionRequests: result.contextExpansionRequests,
      editPlanSteps: result.editPlanSteps,
      evidenceClaims: result.evidenceClaims,
      attemptDiagnostics: result.attemptDiagnostics,
      reasonCodes: [
        ...new Set([
          ...result.reasonCodes,
          result.status === "completed"
            ? "kimi_microtask_completed"
            : "kimi_microtask_escalation_required",
        ]),
      ].slice(0, 16),
      escalatedToCodexBridgeRecommended:
        result.escalatedToCodexBridgeRecommended || result.status !== "completed",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    };
  }
}
