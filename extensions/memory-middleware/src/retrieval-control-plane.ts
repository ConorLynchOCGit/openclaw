import type { CanonicalMemoryRetrievalPlan } from "openclaw/plugin-sdk/memory-canonical-retrieval";
import type { OpenClawPluginToolContext } from "../api.js";
import type {
  MemoryObjectSearchHybridInput,
  MemoryObjectSearchHybridResult,
  MemoryObjectSearchScope,
  RankedRetrievedMemoryRecord,
} from "./db/runtime.js";
import { getMemoryFamilyDefinition, type MemoryFamilyId } from "./memory-family-registry.js";
import {
  buildCanonicalMemoryRetrievalPlan,
  inferGeneralizedWorkflowGuidancePatternHint,
  inferProjectFactQueryHint,
  inferProjectMemoryIntentFamily,
  inferRecurringProcedureQueryHint,
  inferResponseStyleQueryHint,
  inferWorkflowImprovementQueryHint,
  normalizeRetrievalQuery,
  type GeneralizedWorkflowGuidancePatternHint,
  type ProjectFactQueryHint,
  type ProjectMemoryIntentFamily,
  type RecurringProcedureQueryHint,
  type ResponseStyleQueryHint,
  type WorkflowImprovementQueryHint,
} from "./retrieval-intent.js";
import type { MemoryMiddlewareRuntime } from "./runtime.js";
import {
  createSemanticFallbackSharedState,
  maybeApplyApiWorkaroundSemanticFallback,
  maybeApplyEnvironmentConstraintSemanticFallback,
  maybeApplyProcedureSemanticFallback,
  maybeApplyWorkflowToolGotchaSemanticFallback,
  type SemanticFallbackFamily,
  type SemanticFallbackSharedState,
} from "./semantic-retrieval-routing.js";

export type MemoryObjectRetrievalControlDecision = {
  scope: MemoryObjectSearchScope;
  kind?: MemoryObjectSearchHybridInput["kind"];
  normalizedQuery: string;
  canonicalPlan: CanonicalMemoryRetrievalPlan;
  responseStyleHint: ResponseStyleQueryHint | null;
  projectFactHint: ProjectFactQueryHint | null;
  workflowImprovementHint: WorkflowImprovementQueryHint | null;
  projectMemoryIntentFamily: ProjectMemoryIntentFamily;
  generalizedWorkflowPatternHint: GeneralizedWorkflowGuidancePatternHint;
  procedureHint: RecurringProcedureQueryHint | null;
  semanticFallbackFamilies: SemanticFallbackFamily[];
};

type HybridSemanticFallbackApplyParams = {
  runtime: MemoryMiddlewareRuntime;
  input: MemoryObjectSearchHybridInput;
  hybridResult: MemoryObjectSearchHybridResult;
  cfg?: OpenClawPluginToolContext["runtimeConfig"] | OpenClawPluginToolContext["config"];
  agentId?: string;
  sessionKey?: string;
  shared?: SemanticFallbackSharedState;
};

type HybridSemanticFallbackApply = (
  input: HybridSemanticFallbackApplyParams,
) => Promise<MemoryObjectSearchHybridResult>;

function normalizeMemoryObjectScope(
  scope: MemoryObjectSearchScope | undefined,
): MemoryObjectSearchScope {
  return scope ?? "approved_only";
}

function scopeIncludesCandidates(scope: MemoryObjectSearchScope): boolean {
  return scope === "include_candidates" || scope === "include_candidates_and_validated_procedures";
}

function scopeIncludesValidatedProcedures(scope: MemoryObjectSearchScope): boolean {
  return (
    scope === "include_validated_procedures" ||
    scope === "include_candidates_and_validated_procedures"
  );
}

function readRecordMetadataString(value: unknown, path: readonly string[]): string | null {
  let current = value;
  for (const segment of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" && current.trim().length > 0 ? current.trim() : null;
}

function readSubjectKey(record: RankedRetrievedMemoryRecord): string | null {
  if (record.objectType !== "memory_object") {
    return null;
  }
  return (
    readRecordMetadataString(record.metadata, ["autoCapture", "subjectKey"]) ??
    readRecordMetadataString(record.metadata, ["candidateMetadata", "autoCapture", "subjectKey"]) ??
    readRecordMetadataString(record.metadata, [
      "promotionMetadata",
      "autoPromotion",
      "subjectKey",
    ]) ??
    readRecordMetadataString(record.metadata, ["autoPromotion", "subjectKey"]) ??
    readRecordMetadataString(record.metadata, ["preference_key"])
  );
}

function preferApprovedRecordsWithinSubjectClusters(
  records: RankedRetrievedMemoryRecord[],
): RankedRetrievedMemoryRecord[] {
  return [...records].sort((left, right) => {
    const leftSubjectKey = readSubjectKey(left);
    const rightSubjectKey = readSubjectKey(right);
    if (!leftSubjectKey || leftSubjectKey !== rightSubjectKey) {
      return 0;
    }
    if (left.objectType !== "memory_object" || right.objectType !== "memory_object") {
      return 0;
    }
    if (left.reviewState === right.reviewState) {
      return 0;
    }
    if (left.reviewState === "approved") {
      return -1;
    }
    if (right.reviewState === "approved") {
      return 1;
    }
    return 0;
  });
}

function resolveWorkflowSemanticFallbackFamilies(
  hint: WorkflowImprovementQueryHint | null,
): SemanticFallbackFamily[] {
  switch (hint?.lessonKey) {
    case "python_command_unavailable":
    case "gateway_tools_invoke_forbidden":
      return ["environment_constraint"];
    case "vitest_wrapper_required":
    case "scripts_committer_required":
    case "git_stash_unsafe":
      return ["workflow_tool_gotcha"];
    case "openai_embeddings_api_key_required":
    case "anthropic_context1m_eligible_credential_required":
      return ["api_workaround"];
    default:
      return ["environment_constraint", "workflow_tool_gotcha", "api_workaround"];
  }
}

export function buildMemoryObjectRetrievalControlDecision(params: {
  input: MemoryObjectSearchHybridInput;
}): MemoryObjectRetrievalControlDecision {
  const scope = normalizeMemoryObjectScope(params.input.scope);
  const canonicalPlan = buildCanonicalMemoryRetrievalPlan({
    input: {
      query: params.input.query,
      kind: params.input.kind,
      scope,
    },
  });
  const recurringProcedureDefinition = getMemoryFamilyDefinition("recurring_procedure");
  const workflowImprovementDefinition = getMemoryFamilyDefinition("workflow_improvement");
  const responseStyleHint =
    params.input.kind === "project" || params.input.kind === "procedure"
      ? null
      : inferResponseStyleQueryHint(params.input.query);
  const projectFactHint =
    params.input.kind === "project" ? inferProjectFactQueryHint(params.input.query) : null;
  const workflowImprovementHint =
    params.input.kind === "project" ? inferWorkflowImprovementQueryHint(params.input.query) : null;
  const projectMemoryIntentFamily =
    params.input.kind === "project" ? inferProjectMemoryIntentFamily(params.input.query) : "";
  const generalizedWorkflowPatternHint =
    params.input.kind === "project"
      ? inferGeneralizedWorkflowGuidancePatternHint(params.input.query)
      : "";
  const procedureHint = inferRecurringProcedureQueryHint(params.input.query);

  const preferredStrategies = canonicalPlan.ranking
    .semanticFallbackStrategies as readonly SemanticFallbackFamily[];
  const semanticFallbackFamilies: SemanticFallbackFamily[] = [];
  if (
    recurringProcedureDefinition.semanticRoutingPolicy.mode === "validated_procedure_only" &&
    params.input.kind === "procedure" &&
    scopeIncludesValidatedProcedures(scope) &&
    preferredStrategies.includes("procedure")
  ) {
    semanticFallbackFamilies.push("procedure");
  }
  if (
    workflowImprovementDefinition.semanticRoutingPolicy.mode === "family_gated_approved_only" &&
    params.input.kind === "project" &&
    !scopeIncludesCandidates(scope) &&
    !scopeIncludesValidatedProcedures(scope)
  ) {
    const workflowStrategies = preferredStrategies.filter((strategy) => strategy !== "procedure");
    semanticFallbackFamilies.push(
      ...(workflowStrategies.length > 0
        ? workflowStrategies
        : resolveWorkflowSemanticFallbackFamilies(workflowImprovementHint)),
    );
  }

  return {
    scope,
    kind: params.input.kind,
    normalizedQuery: normalizeRetrievalQuery(params.input.query),
    canonicalPlan,
    responseStyleHint,
    projectFactHint,
    workflowImprovementHint,
    projectMemoryIntentFamily,
    generalizedWorkflowPatternHint,
    procedureHint,
    semanticFallbackFamilies,
  };
}

export function shapeRankedRetrievedRecordsForControlPlane(params: {
  decision: MemoryObjectRetrievalControlDecision;
  records: RankedRetrievedMemoryRecord[];
  classifyProjectFamily: (
    record: RankedRetrievedMemoryRecord,
  ) => MemoryFamilyId | "workflow_guidance" | "other";
}): RankedRetrievedMemoryRecord[] {
  const records = scopeIncludesCandidates(params.decision.scope)
    ? preferApprovedRecordsWithinSubjectClusters(params.records)
    : params.records;

  if (
    params.decision.kind !== "project" ||
    scopeIncludesCandidates(params.decision.scope) ||
    !params.decision.projectMemoryIntentFamily
  ) {
    return records;
  }

  const targetFamily = params.decision.projectMemoryIntentFamily;
  const targetFamilyRecords = records.filter(
    (record) =>
      record.objectType === "memory_object" &&
      record.memoryKind === "project" &&
      params.classifyProjectFamily(record) === targetFamily,
  );
  if (targetFamilyRecords.length === 0) {
    return records;
  }

  const nonProjectOrSameFamilyRecords = records.filter((record) => {
    if (record.objectType !== "memory_object" || record.memoryKind !== "project") {
      return true;
    }
    return params.classifyProjectFamily(record) === targetFamily;
  });

  return [
    ...targetFamilyRecords,
    ...nonProjectOrSameFamilyRecords.filter(
      (record) =>
        !(
          record.objectType === "memory_object" &&
          record.memoryKind === "project" &&
          params.classifyProjectFamily(record) === targetFamily
        ),
    ),
  ];
}

async function applySemanticFallbackSafely(params: {
  hybridResult: MemoryObjectSearchHybridResult;
  apply: HybridSemanticFallbackApply;
  runtime: MemoryMiddlewareRuntime;
  input: MemoryObjectSearchHybridInput;
  cfg?: OpenClawPluginToolContext["runtimeConfig"] | OpenClawPluginToolContext["config"];
  agentId?: string;
  sessionKey?: string;
  shared?: SemanticFallbackSharedState;
}): Promise<MemoryObjectSearchHybridResult> {
  try {
    return await params.apply({
      runtime: params.runtime,
      input: params.input,
      hybridResult: params.hybridResult,
      cfg: params.cfg,
      agentId: params.agentId,
      sessionKey: params.sessionKey,
      ...(params.shared ? { shared: params.shared } : {}),
    });
  } catch {
    return params.hybridResult;
  }
}

function resolveSemanticFallbackApply(family: SemanticFallbackFamily): HybridSemanticFallbackApply {
  switch (family) {
    case "procedure":
      return maybeApplyProcedureSemanticFallback;
    case "environment_constraint":
      return maybeApplyEnvironmentConstraintSemanticFallback;
    case "workflow_tool_gotcha":
      return maybeApplyWorkflowToolGotchaSemanticFallback;
    case "api_workaround":
      return maybeApplyApiWorkaroundSemanticFallback;
  }
}

export async function applyHybridRetrievalControlPlane(params: {
  decision: MemoryObjectRetrievalControlDecision;
  runtime: MemoryMiddlewareRuntime;
  input: MemoryObjectSearchHybridInput;
  hybridResult: MemoryObjectSearchHybridResult;
  cfg?: OpenClawPluginToolContext["runtimeConfig"] | OpenClawPluginToolContext["config"];
  agentId?: string;
  sessionKey?: string;
}): Promise<MemoryObjectSearchHybridResult> {
  let result = params.hybridResult;
  const shared = createSemanticFallbackSharedState();
  for (const family of params.decision.semanticFallbackFamilies) {
    result = await applySemanticFallbackSafely({
      hybridResult: result,
      apply: resolveSemanticFallbackApply(family),
      runtime: params.runtime,
      input: params.input,
      cfg: params.cfg,
      agentId: params.agentId,
      sessionKey: params.sessionKey,
      shared,
    });
  }
  return result;
}
