import type { OpenClawPluginToolContext } from "../api.js";
import type {
  MemoryObjectSearchHybridInput,
  MemoryObjectSearchHybridResult,
  MemoryObjectSearchScope,
  RankedRetrievedMemoryRecord,
} from "./db/runtime.js";
import { getMemoryFamilyDefinition, type MemoryFamilyId } from "./memory-family-registry.js";
import {
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
  maybeApplyApiWorkaroundSemanticFallback,
  maybeApplyEnvironmentConstraintSemanticFallback,
  maybeApplyProcedureSemanticFallback,
  maybeApplyWorkflowToolGotchaSemanticFallback,
  type SemanticFallbackFamily,
} from "./semantic-retrieval-routing.js";

export type MemoryObjectRetrievalControlDecision = {
  scope: MemoryObjectSearchScope;
  kind?: MemoryObjectSearchHybridInput["kind"];
  normalizedQuery: string;
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

  const semanticFallbackFamilies: SemanticFallbackFamily[] = [];
  if (
    recurringProcedureDefinition.semanticRoutingPolicy.mode === "validated_procedure_only" &&
    params.input.kind === "procedure" &&
    scopeIncludesValidatedProcedures(scope)
  ) {
    semanticFallbackFamilies.push("procedure");
  }
  if (
    workflowImprovementDefinition.semanticRoutingPolicy.mode === "family_gated_approved_only" &&
    params.input.kind === "project" &&
    !scopeIncludesCandidates(scope) &&
    !scopeIncludesValidatedProcedures(scope)
  ) {
    semanticFallbackFamilies.push(
      ...resolveWorkflowSemanticFallbackFamilies(workflowImprovementHint),
    );
  }

  return {
    scope,
    kind: params.input.kind,
    normalizedQuery: normalizeRetrievalQuery(params.input.query),
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
  if (
    params.decision.kind !== "project" ||
    scopeIncludesCandidates(params.decision.scope) ||
    !params.decision.projectMemoryIntentFamily
  ) {
    return params.records;
  }

  const targetFamily = params.decision.projectMemoryIntentFamily;
  const targetFamilyRecords = params.records.filter(
    (record) =>
      record.objectType === "memory_object" &&
      record.memoryKind === "project" &&
      params.classifyProjectFamily(record) === targetFamily,
  );
  if (targetFamilyRecords.length === 0) {
    return params.records;
  }

  const nonProjectOrSameFamilyRecords = params.records.filter((record) => {
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
}): Promise<MemoryObjectSearchHybridResult> {
  try {
    return await params.apply({
      runtime: params.runtime,
      input: params.input,
      hybridResult: params.hybridResult,
      cfg: params.cfg,
      agentId: params.agentId,
      sessionKey: params.sessionKey,
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
  for (const family of params.decision.semanticFallbackFamilies) {
    result = await applySemanticFallbackSafely({
      hybridResult: result,
      apply: resolveSemanticFallbackApply(family),
      runtime: params.runtime,
      input: params.input,
      cfg: params.cfg,
      agentId: params.agentId,
      sessionKey: params.sessionKey,
    });
  }
  return result;
}
