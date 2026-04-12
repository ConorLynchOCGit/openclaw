import type { CanonicalMemoryRetrievalPlan } from "openclaw/plugin-sdk/memory-canonical-retrieval";
import type { OpenClawPluginToolContext } from "../api.js";
import type {
  MemoryObjectSearchHybridInput,
  MemoryObjectSearchHybridResult,
  MemoryObjectSearchScope,
  RankedRetrievedMemoryRecord,
} from "./db/runtime.js";
import { readCanonicalFirstMetadataString } from "./memory-canonical-compat.js";
import {
  normalizeMemoryObjectScope,
  scopeIncludesCandidates,
  scopeIncludesValidatedProcedures,
} from "./memory-object-retrieval-scope.js";
import { getMemorySemanticRoutingRuntimePolicy } from "./memory-runtime-policy-views.js";
import {
  buildCanonicalMemoryRetrievalPlan,
  normalizeRetrievalQuery,
  resolveGeneralizedWorkflowGuidancePatternHintFromCanonicalPlan,
  resolveProjectFactQueryHintFromCanonicalPlan,
  resolveProjectMemoryIntentProfileFromCanonicalPlan,
  resolveRecurringProcedureQueryHintFromCanonicalPlan,
  resolveResponseStyleQueryHintFromCanonicalPlan,
  resolveWorkflowSemanticFallbackStrategies,
  resolveWorkflowImprovementQueryHintFromCanonicalPlan,
  type GeneralizedWorkflowGuidancePatternHint,
  type ProjectFactQueryHint,
  type ProjectMemoryIntentProfile,
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

type ProjectRetrievedProfile =
  | "project_fact"
  | "project_rule"
  | "unmet_need"
  | "workflow_guidance"
  | "other";

export type MemoryObjectRetrievalControlDecision = {
  scope: MemoryObjectSearchScope;
  kind?: MemoryObjectSearchHybridInput["kind"];
  normalizedQuery: string;
  canonicalPlan: CanonicalMemoryRetrievalPlan;
  responseStyleHint: ResponseStyleQueryHint | null;
  projectFactHint: ProjectFactQueryHint | null;
  workflowImprovementHint: WorkflowImprovementQueryHint | null;
  projectMemoryIntentProfile: ProjectMemoryIntentProfile;
  generalizedWorkflowPatternHint: GeneralizedWorkflowGuidancePatternHint;
  procedureHint: RecurringProcedureQueryHint | null;
  semanticFallbackFamilies: SemanticFallbackFamily[];
};

const DIRECT_PROJECT_INTENT_PROFILES = new Set<ProjectRetrievedProfile>([
  "project_fact",
  "project_rule",
  "unmet_need",
]);

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

function readRecordMetadataString(value: unknown, path: readonly string[]): string | null {
  const resolved =
    value && typeof value === "object" && !Array.isArray(value)
      ? readCanonicalFirstMetadataString(value as Record<string, unknown>, path)
      : undefined;
  return resolved ?? null;
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
  const recurringProcedureSemanticRouting =
    getMemorySemanticRoutingRuntimePolicy("recurring_procedure");
  const workflowImprovementSemanticRouting =
    getMemorySemanticRoutingRuntimePolicy("workflow_improvement");
  const responseStyleHint = resolveResponseStyleQueryHintFromCanonicalPlan(canonicalPlan);
  const projectFactHint = resolveProjectFactQueryHintFromCanonicalPlan(canonicalPlan);
  const workflowImprovementHint =
    resolveWorkflowImprovementQueryHintFromCanonicalPlan(canonicalPlan);
  const projectMemoryIntentProfile =
    resolveProjectMemoryIntentProfileFromCanonicalPlan(canonicalPlan);
  const generalizedWorkflowPatternHint =
    resolveGeneralizedWorkflowGuidancePatternHintFromCanonicalPlan(canonicalPlan);
  const procedureHint = resolveRecurringProcedureQueryHintFromCanonicalPlan(canonicalPlan);

  const preferredStrategies = canonicalPlan.ranking
    .semanticFallbackStrategies as readonly SemanticFallbackFamily[];
  const semanticFallbackFamilies: SemanticFallbackFamily[] = [];
  if (
    recurringProcedureSemanticRouting.mode === "validated_procedure_only" &&
    params.input.kind === "procedure" &&
    scopeIncludesValidatedProcedures(scope) &&
    preferredStrategies.includes("procedure")
  ) {
    semanticFallbackFamilies.push("procedure");
  }
  if (
    workflowImprovementSemanticRouting.mode === "profile_gated_approved_only" &&
    params.input.kind === "project" &&
    !scopeIncludesCandidates(scope) &&
    !scopeIncludesValidatedProcedures(scope)
  ) {
    const workflowStrategies = preferredStrategies.filter((strategy) => strategy !== "procedure");
    semanticFallbackFamilies.push(
      ...(workflowStrategies.length > 0
        ? workflowStrategies
        : resolveWorkflowSemanticFallbackStrategies(workflowImprovementHint)),
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
    projectMemoryIntentProfile,
    generalizedWorkflowPatternHint,
    procedureHint,
    semanticFallbackFamilies,
  };
}

export function shapeRankedRetrievedRecordsForControlPlane(params: {
  decision: MemoryObjectRetrievalControlDecision;
  records: RankedRetrievedMemoryRecord[];
  classifyProjectProfile: (record: RankedRetrievedMemoryRecord) => ProjectRetrievedProfile;
}): RankedRetrievedMemoryRecord[] {
  const records = scopeIncludesCandidates(params.decision.scope)
    ? preferApprovedRecordsWithinSubjectClusters(params.records)
    : params.records;

  if (
    params.decision.kind !== "project" ||
    scopeIncludesCandidates(params.decision.scope) ||
    !params.decision.projectMemoryIntentProfile
  ) {
    return records;
  }

  const targetProfile = params.decision.projectMemoryIntentProfile;
  const targetProfileRecords = records.filter(
    (record) =>
      record.objectType === "memory_object" &&
      params.classifyProjectProfile(record) === targetProfile,
  );
  if (targetProfileRecords.length === 0) {
    return records;
  }

  const remainingRecords = records.filter((record) => {
    const profile = params.classifyProjectProfile(record);
    if (profile === targetProfile) {
      return false;
    }
    if (
      DIRECT_PROJECT_INTENT_PROFILES.has(targetProfile) &&
      DIRECT_PROJECT_INTENT_PROFILES.has(profile)
    ) {
      return false;
    }
    return true;
  });

  return [...targetProfileRecords, ...remainingRecords];
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
