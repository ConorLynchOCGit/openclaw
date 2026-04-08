import {
  getMemoryFamilyDefinition,
  listMemoryFamilyDefinitions,
  type MemoryFamilyDefinition,
  type MemoryFamilyId,
  type MemoryFamilyRetrievalFeature,
} from "./memory-family-registry.js";

type RetrievalSqlExpressions = {
  autoCaptureTemplateExpression: string;
  autoCaptureFactFamilyExpression: string;
  autoCaptureLessonFamilyExpression: string;
  autoCaptureGuidancePatternExpression: string;
  autoCaptureNormalizedSubjectExpression: string;
  autoCaptureNormalizedProjectFactLabelExpression: string;
  autoCaptureNormalizedProjectScopeExpression: string;
  autoCaptureNormalizedRecommendedActionExpression: string;
  autoCaptureNormalizedAvoidActionExpression: string;
  autoCaptureNormalizedNeededCapabilityExpression: string;
  autoCaptureNormalizedValueExpression: string;
};

type RetrievalParamRefs = {
  responseStyleNormalizedSubjectHintRef: string;
  normalizedQueryRef: string;
  projectMemoryIntentFamilyRef: string;
  generalizedWorkflowPatternHintRef: string;
};

type RetrievalFeatureSqlBundle = {
  scoreClauses: string[];
  matchedFieldClauses: string[];
};

type ValidatedProcedureExpressions = {
  procedureSubjectExpression: string;
};

type ValidatedProcedureParamRefs = {
  normalizedSubjectRef: string;
};

function listApprovedMemoryFeatureFamilies(): MemoryFamilyDefinition[] {
  return listMemoryFamilyDefinitions().filter(
    (definition) =>
      definition.storageKinds.includes("memory_object") &&
      definition.id !== "recurring_procedure" &&
      Object.keys(definition.retrievalPolicy.featureWeights).length > 0,
  );
}

function buildApprovedMemoryFeatureFamilyGuard(
  familyId: MemoryFamilyId,
  expressions: RetrievalSqlExpressions,
): string | null {
  switch (familyId) {
    case "response_style":
      return `${expressions.autoCaptureTemplateExpression} = 'response_style_generalized_guidance'`;
    case "project_fact":
      return `${expressions.autoCaptureFactFamilyExpression} = 'generalized_reference'`;
    case "workflow_improvement":
      return `${expressions.autoCaptureLessonFamilyExpression} = 'generalized_workflow_lesson'`;
    case "project_rule":
      return `${expressions.autoCaptureLessonFamilyExpression} = 'generalized_project_rule'`;
    case "unmet_need":
      return `${expressions.autoCaptureLessonFamilyExpression} = 'generalized_unmet_need'`;
    case "recurring_procedure":
      return null;
  }
}

function buildApprovedMemoryIntentFamilyGuard(
  familyId: MemoryFamilyId,
  expressions: RetrievalSqlExpressions,
): string | null {
  switch (familyId) {
    case "project_fact":
      return `${expressions.autoCaptureFactFamilyExpression} in ('supported_field', 'generalized_reference')`;
    case "project_rule":
      return `${expressions.autoCaptureLessonFamilyExpression} = 'generalized_project_rule'`;
    case "unmet_need":
      return `${expressions.autoCaptureLessonFamilyExpression} = 'generalized_unmet_need'`;
    default:
      return null;
  }
}

function buildApprovedMemoryFeatureValueExpression(
  familyId: MemoryFamilyId,
  feature: MemoryFamilyRetrievalFeature,
  expressions: RetrievalSqlExpressions,
): string | null {
  switch (feature) {
    case "project_scope_match":
      return expressions.autoCaptureNormalizedProjectScopeExpression;
    case "subject_match":
      return familyId === "project_fact"
        ? expressions.autoCaptureNormalizedProjectFactLabelExpression
        : expressions.autoCaptureNormalizedSubjectExpression;
    case "value_match":
      return expressions.autoCaptureNormalizedValueExpression;
    case "recommended_action_match":
      return expressions.autoCaptureNormalizedRecommendedActionExpression;
    case "avoid_action_match":
      return expressions.autoCaptureNormalizedAvoidActionExpression;
    case "needed_capability_match":
      return expressions.autoCaptureNormalizedNeededCapabilityExpression;
    case "guidance_pattern_match":
    case "family_intent_match":
    case "procedure_title_match":
      return null;
  }
}

function buildMatchedFieldLabel(
  definition: MemoryFamilyDefinition,
  feature: MemoryFamilyRetrievalFeature,
): string {
  const prefix = definition.retrievalPolicy.matchedFieldPrefix ?? definition.id;
  switch (feature) {
    case "family_intent_match":
      return `${prefix}_intent_match`;
    case "project_scope_match":
      return `${prefix}_scope_match`;
    case "subject_match":
      return `${prefix}_subject_match`;
    case "value_match":
      return `${prefix}_value_match`;
    case "recommended_action_match":
      return `${prefix}_recommended_action_match`;
    case "avoid_action_match":
      return `${prefix}_avoid_action_match`;
    case "needed_capability_match":
      return `${prefix}_capability_match`;
    case "guidance_pattern_match":
      return `${prefix}_guidance_pattern_match`;
    case "procedure_title_match":
      return `${prefix}_procedure_title_match`;
  }
}

function buildApprovedMemoryFeatureClause(params: {
  definition: MemoryFamilyDefinition;
  feature: MemoryFamilyRetrievalFeature;
  weight: number;
  expressions: RetrievalSqlExpressions;
  paramRefs: RetrievalParamRefs;
}): { scoreClause: string; matchedFieldClause: string } | null {
  const { definition, feature, weight, expressions, paramRefs } = params;
  const label = buildMatchedFieldLabel(definition, feature);

  if (feature === "family_intent_match") {
    const intentGuard = buildApprovedMemoryIntentFamilyGuard(definition.id, expressions);
    if (!intentGuard || !definition.retrievalPolicy.directIntentClass) {
      return null;
    }
    const whenClause = `${paramRefs.projectMemoryIntentFamilyRef} = '${definition.id}' and ${intentGuard}`;
    return {
      scoreClause: `case when ${whenClause} then ${weight} else 0 end`,
      matchedFieldClause: `case when ${whenClause} then '${label}' end`,
    };
  }

  if (feature === "guidance_pattern_match") {
    const familyGuard = buildApprovedMemoryFeatureFamilyGuard(definition.id, expressions);
    if (!familyGuard) {
      return null;
    }
    const whenClause = `${familyGuard} and ${paramRefs.generalizedWorkflowPatternHintRef} <> '' and ${expressions.autoCaptureGuidancePatternExpression} = ${paramRefs.generalizedWorkflowPatternHintRef}`;
    return {
      scoreClause: `case when ${whenClause} then ${weight} else 0 end`,
      matchedFieldClause: `case when ${whenClause} then '${label}' end`,
    };
  }

  const familyGuard = buildApprovedMemoryFeatureFamilyGuard(definition.id, expressions);
  const valueExpression = buildApprovedMemoryFeatureValueExpression(
    definition.id,
    feature,
    expressions,
  );
  if (!familyGuard || !valueExpression) {
    return null;
  }
  const whenClause =
    definition.id === "response_style" && feature === "subject_match"
      ? `${familyGuard} and ${valueExpression} <> '' and ((${paramRefs.responseStyleNormalizedSubjectHintRef} <> '' and ${valueExpression} = ${paramRefs.responseStyleNormalizedSubjectHintRef}) or ${paramRefs.normalizedQueryRef} like '%' || ${valueExpression} || '%')`
      : `${familyGuard} and ${valueExpression} <> '' and ${paramRefs.normalizedQueryRef} like '%' || ${valueExpression} || '%'`;
  return {
    scoreClause: `case when ${whenClause} then ${weight} else 0 end`,
    matchedFieldClause: `case when ${whenClause} then '${label}' end`,
  };
}

export function buildApprovedMemoryRetrievalFeatureSql(params: {
  expressions: RetrievalSqlExpressions;
  paramRefs: RetrievalParamRefs;
}): RetrievalFeatureSqlBundle {
  const scoreClauses: string[] = [];
  const matchedFieldClauses: string[] = [];

  for (const definition of listApprovedMemoryFeatureFamilies()) {
    for (const [feature, weight] of Object.entries(definition.retrievalPolicy.featureWeights)) {
      if (!weight) {
        continue;
      }
      const clause = buildApprovedMemoryFeatureClause({
        definition,
        feature: feature as MemoryFamilyRetrievalFeature,
        weight,
        expressions: params.expressions,
        paramRefs: params.paramRefs,
      });
      if (!clause) {
        continue;
      }
      scoreClauses.push(clause.scoreClause);
      matchedFieldClauses.push(clause.matchedFieldClause);
    }
  }

  return { scoreClauses, matchedFieldClauses };
}

export function buildReviewableCandidateRetrievalFeatureSql(params: {
  expressions: RetrievalSqlExpressions;
  paramRefs: RetrievalParamRefs;
}): RetrievalFeatureSqlBundle {
  return buildApprovedMemoryRetrievalFeatureSql(params);
}

export function buildValidatedProcedureRetrievalFeatureSql(params: {
  expressions: ValidatedProcedureExpressions;
  paramRefs: ValidatedProcedureParamRefs;
}): RetrievalFeatureSqlBundle {
  const definition = getMemoryFamilyDefinition("recurring_procedure");
  const subjectWeight = definition.retrievalPolicy.featureWeights.subject_match ?? 0;
  if (!subjectWeight) {
    return { scoreClauses: [], matchedFieldClauses: [] };
  }

  const exactWhenClause = `${params.paramRefs.normalizedSubjectRef} <> '' and ${params.expressions.procedureSubjectExpression} = ${params.paramRefs.normalizedSubjectRef}`;
  const prefixWeight = Math.max(subjectWeight - 30, 0);
  const prefixWhenClause = `${params.paramRefs.normalizedSubjectRef} <> '' and ${params.expressions.procedureSubjectExpression} like (${params.paramRefs.normalizedSubjectRef} || '%')`;

  return {
    scoreClauses: [
      `case when ${exactWhenClause} then ${subjectWeight} else 0 end`,
      `case when ${prefixWhenClause} then ${prefixWeight} else 0 end`,
    ],
    matchedFieldClauses: [
      `case when ${exactWhenClause} then 'procedure_subject_match' end`,
      `case when ${prefixWhenClause} then 'procedure_subject_prefix' end`,
    ],
  };
}
