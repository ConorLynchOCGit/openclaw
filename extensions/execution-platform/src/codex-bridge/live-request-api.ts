import { randomUUID } from "node:crypto";
import { DEFAULT_DIAGNOSTIC_LIMITS, boundDiagnosticJson } from "../observability/redaction.ts";
import type { JsonValue } from "../runtime-job-repository.ts";
import {
  createTrustedLocalYoloProfile,
  trustedLocalYoloProfileToLiveRequestAuthorityBlock,
  validateTrustedLocalYoloProfile,
  type TrustedLocalYoloAuthorityProfile,
  type TrustedLocalYoloLiveRequestAuthorityBlock,
} from "./trusted-local-yolo-profile.ts";

export type BridgeValidationPlan = {
  commands: string[];
  maxRepairAttempts: number;
};

export type BridgeRollbackPlan = {
  summary: string;
  expectations: string[];
};

export type YoloBridgeLiveRequest = {
  artifactKind: "codex_bridge_yolo_live_request";
  requestId: string;
  runtimeJobId: string;
  sessionId: string;
  objective: string;
  scope: {
    repoPath: string;
    allowedPaths: string[];
    maxChangedFiles: number | null;
  };
  authorityProfileId: string;
  authorityBlock: TrustedLocalYoloLiveRequestAuthorityBlock;
  validationPlan: BridgeValidationPlan;
  repairPlan: string[];
  rollbackPlan: BridgeRollbackPlan;
  controlPlan: string[];
  closeoutRequired: true;
  workQueueLink: JsonValue | null;
  promptPackage: {
    promptPackageId: string;
    inert: boolean;
    objective: string;
    allowedPaths: string[];
    prohibitedActions: string[];
    validationCommands: string[];
    closeoutRequired: true;
  };
  operatorApproval: {
    required: true;
    approved: boolean;
    approvedBy: string | null;
    approvedAt: string | null;
  };
  expiresAt: string;
  liveFlags: {
    enableLiveCodexPilot: boolean;
    enableTrustedLocalYolo: boolean;
  };
  acknowledgements: {
    noDeploy: true;
    noOutboundSending: true;
    noModelPromotion: true;
    noHiddenWorkQueueLifecycleMutation: true;
    noRawTranscriptsPromptsHiddenReasoningSecretsOrUnboundedLogs: true;
  };
};

export type YoloBridgeLiveRequestValidation = {
  artifactKind: "codex_bridge_yolo_live_request_validation";
  requestId: string;
  valid: boolean;
  blockingReasons: string[];
  warnings: string[];
};

function unsafeContentReasons(value: unknown): string[] {
  const serialized = JSON.stringify(value).toLowerCase();
  const patterns = [
    ["raw_transcript", /raw-transcript-marker|full-transcript-marker/u],
    ["raw_prompt", /raw-prompt-marker|provider-prompt-marker/u],
    ["hidden_reasoning", /hidden-reasoning-marker/u],
    ["secret", /\bsk-[a-z0-9_-]{12,}|secret-marker|password=/u],
    ["unbounded_log", /unbounded-log-marker|raw-command-log-marker|raw-tool-log-marker/u],
  ] as const;
  return patterns
    .filter(([, pattern]) => pattern.test(serialized))
    .map(([reason]) => `prohibited_${reason}_content`);
}

export function createYoloBridgeLiveRequest(input: {
  requestId?: string;
  promptPackageId?: string;
  runtimeJobId: string;
  sessionId: string;
  objective: string;
  repoPath: string;
  allowedPaths: string[];
  maxChangedFiles?: number | null;
  authorityProfile?: TrustedLocalYoloAuthorityProfile;
  validationPlan: BridgeValidationPlan;
  repairPlan?: string[];
  rollbackPlan: BridgeRollbackPlan;
  controlPlan?: string[];
  workQueueLink?: JsonValue | null;
  approved?: boolean;
  approvedBy?: string | null;
  approvedAt?: string | null;
  expiresAt: string;
  enableLiveCodexPilot?: boolean;
  enableTrustedLocalYolo?: boolean;
}): YoloBridgeLiveRequest {
  const profile = input.authorityProfile ?? createTrustedLocalYoloProfile();
  return boundDiagnosticJson(
    {
      artifactKind: "codex_bridge_yolo_live_request",
      requestId: input.requestId ?? `yolo-live-request-${randomUUID()}`,
      runtimeJobId: input.runtimeJobId,
      sessionId: input.sessionId,
      objective: input.objective,
      scope: {
        repoPath: input.repoPath,
        allowedPaths: input.allowedPaths,
        maxChangedFiles: input.maxChangedFiles ?? null,
      },
      authorityProfileId: profile.profileId,
      authorityBlock: trustedLocalYoloProfileToLiveRequestAuthorityBlock(profile),
      validationPlan: input.validationPlan,
      repairPlan: input.repairPlan ?? [
        "bridge executor owns inspect edit validate repair within approved scope",
        "validation passing is required before completed-work success",
      ],
      rollbackPlan: input.rollbackPlan,
      controlPlan: input.controlPlan ?? [
        "poll durable pause redirect cancel controls while running",
        "stop cleanly if cancel or unsupported redirect requires next turn",
      ],
      closeoutRequired: true,
      workQueueLink: input.workQueueLink ?? null,
      promptPackage: {
        promptPackageId: input.promptPackageId ?? `yolo-prompt-package-${randomUUID()}`,
        inert: true,
        objective: input.objective,
        allowedPaths: input.allowedPaths,
        prohibitedActions: [
          "deploy",
          "outbound_sending",
          "model_promotion",
          "hidden_work_queue_lifecycle_mutation",
          "raw_transcripts_prompts_hidden_reasoning_secrets_or_unbounded_logs",
        ],
        validationCommands: input.validationPlan.commands,
        closeoutRequired: true,
      },
      operatorApproval: {
        required: true,
        approved: input.approved ?? false,
        approvedBy: input.approvedBy ?? null,
        approvedAt: input.approvedAt ?? null,
      },
      expiresAt: input.expiresAt,
      liveFlags: {
        enableLiveCodexPilot: input.enableLiveCodexPilot ?? false,
        enableTrustedLocalYolo: input.enableTrustedLocalYolo ?? false,
      },
      acknowledgements: {
        noDeploy: true,
        noOutboundSending: true,
        noModelPromotion: true,
        noHiddenWorkQueueLifecycleMutation: true,
        noRawTranscriptsPromptsHiddenReasoningSecretsOrUnboundedLogs: true,
      },
    } satisfies YoloBridgeLiveRequest,
    {
      ...DEFAULT_DIAGNOSTIC_LIMITS,
      maxObjectKeys: 260,
      maxArrayItems: 120,
      maxStringLength: 2_000,
    },
  ) as YoloBridgeLiveRequest;
}

export function validateYoloBridgeLiveRequest(input: {
  request: YoloBridgeLiveRequest;
  authorityProfile?: TrustedLocalYoloAuthorityProfile;
  requireLiveApproval?: boolean;
}): YoloBridgeLiveRequestValidation {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const request = input.request;
  const authority =
    input.authorityProfile && input.authorityProfile.profileId === request.authorityProfileId
      ? validateTrustedLocalYoloProfile(input.authorityProfile)
      : null;
  if (!request.objective.trim()) {
    reasons.push("objective_required");
  }
  if (!request.scope.repoPath.trim() || request.scope.allowedPaths.length === 0) {
    reasons.push("explicit_scope_required");
  }
  if (request.validationPlan.commands.length === 0) {
    reasons.push("validation_commands_required");
  }
  if (request.validationPlan.commands.some((command) => !command.trim())) {
    reasons.push("blank_validation_command");
  }
  if (
    !Number.isInteger(request.validationPlan.maxRepairAttempts) ||
    request.validationPlan.maxRepairAttempts < 0
  ) {
    reasons.push("invalid_repair_attempt_limit");
  }
  if (!request.rollbackPlan.summary.trim() || request.rollbackPlan.expectations.length === 0) {
    reasons.push("rollback_plan_required");
  }
  if (!request.closeoutRequired) {
    reasons.push("closeout_required");
  }
  if (!request.authorityBlock.controlsRequired) {
    reasons.push("controls_required");
  }
  if (!request.authorityBlock.supabaseRuntimePersistenceRequired) {
    reasons.push("supabase_runtime_persistence_required");
  }
  if (input.requireLiveApproval && !request.operatorApproval.approved) {
    reasons.push("operator_approval_required");
  }
  if (request.liveFlags.enableLiveCodexPilot && !request.operatorApproval.approved) {
    reasons.push("live_flag_requires_operator_approval");
  }
  if (authority) {
    reasons.push(...authority.blockingReasons);
    warnings.push(...authority.warnings);
  }
  reasons.push(...unsafeContentReasons(request));
  return {
    artifactKind: "codex_bridge_yolo_live_request_validation",
    requestId: request.requestId,
    valid: reasons.length === 0,
    blockingReasons: [...new Set(reasons)],
    warnings: [...new Set(warnings)],
  };
}
