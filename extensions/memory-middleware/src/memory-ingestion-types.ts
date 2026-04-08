import type {
  ProjectFactCanonicalMatch,
  ProjectFactFamily,
  ProjectFactFieldKey,
} from "./project-fact-semantic.js";
import type {
  RecurringProcedureCanonicalMatch,
  RecurringProcedureFamily,
  RecurringProcedureKey,
} from "./recurring-procedure-semantic.js";
import type {
  ResponseStyleCanonicalMatch,
  ResponseStyleFamily,
} from "./response-style-semantic.js";
import type {
  WorkflowImprovementCaptureClass,
  WorkflowImprovementGuidancePattern,
  WorkflowImprovementLessonFamily,
  WorkflowImprovementLessonKey,
  WorkflowImprovementNeedCategory,
  WorkflowImprovementReasonCode,
  WorkflowImprovementTemplate,
  WorkflowImprovementToolKey,
} from "./workflow-improvement-semantic.js";

export type OrdinaryTurnAutoCaptureMatch = {
  profile: "user-preference-v1" | "user-preference-v2";
  captureClass:
    | "explicit_preference"
    | "preference_correction"
    | "explicit_requirement"
    | "requirement_correction"
    | "explicit_project_fact"
    | "project_fact_correction"
    | "explicit_recurring_procedure"
    | "recurring_procedure_correction"
    | "workflow_tool_gotcha"
    | "workflow_environment_constraint"
    | "workflow_api_workaround"
    | "workflow_generalized_guidance"
    | "project_rule_guidance"
    | "unmet_need_recommendation";
  candidateKind: "learning" | "correction" | "procedure" | "improvement";
  reasonCode:
    | "explicit_preference_statement"
    | "explicit_preference_correction"
    | "explicit_requirement_statement"
    | "explicit_requirement_correction"
    | "explicit_project_fact_statement"
    | "explicit_project_fact_correction"
    | "explicit_recurring_procedure_statement"
    | "recurring_procedure_correction"
    | "workflow_tool_gotcha_statement"
    | "workflow_environment_constraint_statement"
    | "workflow_api_workaround_statement"
    | "workflow_generalized_guidance_statement"
    | "project_rule_guidance_statement"
    | "unmet_need_recommendation_statement";
  template:
    | "my_preferred_is"
    | "my_favorite_is"
    | "responses_concise"
    | "responses_bullets"
    | "responses_plain_english"
    | "responses_no_tables"
    | "responses_numbered_steps"
    | "response_style_generalized_guidance"
    | "project_fact_named_scope"
    | "project_fact_generalized_named_scope"
    | "named_recurring_checklist"
    | "generalized_recurring_checklist"
    | "workflow_tool_gotcha"
    | "workflow_environment_constraint"
    | "workflow_api_workaround"
    | "workflow_generalized_guidance"
    | "project_rule_guidance"
    | "unmet_need_recommendation";
  subject: string;
  value: string;
  normalizedSubject: string;
  normalizedValue: string;
  content: string;
  subjectKey: string;
  key: string;
  projectScope?: string;
  normalizedProjectScope?: string;
  responseStyleFamily?: ResponseStyleFamily;
  factFamily?: ProjectFactFamily;
  fieldKey?: ProjectFactFieldKey;
  procedureFamily?: RecurringProcedureFamily;
  procedureKey?: RecurringProcedureKey;
  title?: string;
  steps?: string[];
  lessonFamily?: WorkflowImprovementLessonFamily;
  lessonKey?: WorkflowImprovementLessonKey;
  toolKey?: WorkflowImprovementToolKey;
  guidancePattern?: WorkflowImprovementGuidancePattern;
  needCategory?: WorkflowImprovementNeedCategory;
  neededCapability?: string;
  normalizedNeededCapability?: string;
  recommendedAction?: string;
  normalizedRecommendedAction?: string;
  avoidAction?: string;
  normalizedAvoidAction?: string;
  rationale?: string;
  normalizedRationale?: string;
};

export function toOrdinaryTurnResponseStyleMatch(
  match: ResponseStyleCanonicalMatch,
): OrdinaryTurnAutoCaptureMatch {
  return {
    profile: "user-preference-v2",
    captureClass: match.captureClass,
    candidateKind: match.candidateKind,
    reasonCode: match.reasonCode,
    template: match.template,
    subject: match.subject,
    value: match.value,
    normalizedSubject: match.normalizedSubject,
    normalizedValue: match.normalizedValue,
    content: match.content,
    subjectKey: match.subjectKey,
    key: match.key,
    responseStyleFamily: match.family,
  };
}

export function toOrdinaryTurnProjectFactMatch(
  match: ProjectFactCanonicalMatch,
): OrdinaryTurnAutoCaptureMatch {
  return {
    profile: "user-preference-v2",
    captureClass: match.captureClass,
    candidateKind: match.candidateKind,
    reasonCode: match.reasonCode,
    template: match.template,
    subject: match.subject,
    value: match.value,
    normalizedSubject: match.normalizedSubject,
    normalizedValue: match.normalizedValue,
    content: match.content,
    subjectKey: match.subjectKey,
    key: match.key,
    projectScope: match.projectScope,
    normalizedProjectScope: match.normalizedProjectScope,
    factFamily: match.factFamily,
    ...(match.fieldKey ? { fieldKey: match.fieldKey } : {}),
  };
}

export function toOrdinaryTurnRecurringProcedureMatch(
  match: RecurringProcedureCanonicalMatch,
): OrdinaryTurnAutoCaptureMatch {
  return {
    profile: "user-preference-v2",
    captureClass: match.captureClass,
    candidateKind: match.candidateKind,
    reasonCode: match.reasonCode,
    template: match.template,
    subject: match.title,
    value: match.body,
    normalizedSubject: match.normalizedTitle,
    normalizedValue: match.normalizedBody,
    content: match.content,
    subjectKey: match.subjectKey,
    key: match.key,
    procedureFamily: match.procedureFamily,
    ...(match.procedureKey ? { procedureKey: match.procedureKey } : {}),
    title: match.title,
    steps: match.steps,
  };
}

export function toOrdinaryTurnWorkflowImprovementMatch(match: {
  captureClass: WorkflowImprovementCaptureClass;
  candidateKind: "improvement";
  reasonCode: WorkflowImprovementReasonCode;
  template: WorkflowImprovementTemplate;
  lessonFamily: WorkflowImprovementLessonFamily;
  projectScope?: string;
  normalizedProjectScope?: string;
  lessonKey?: WorkflowImprovementLessonKey;
  toolKey?: WorkflowImprovementToolKey;
  guidancePattern?: WorkflowImprovementGuidancePattern;
  needCategory?: WorkflowImprovementNeedCategory;
  subject: string;
  value: string;
  normalizedSubject: string;
  normalizedValue: string;
  content: string;
  subjectKey: string;
  key: string;
  neededCapability?: string;
  normalizedNeededCapability?: string;
  recommendedAction?: string;
  normalizedRecommendedAction?: string;
  avoidAction?: string;
  normalizedAvoidAction?: string;
  rationale?: string;
  normalizedRationale?: string;
}): OrdinaryTurnAutoCaptureMatch {
  return {
    profile: "user-preference-v2",
    captureClass: match.captureClass,
    candidateKind: match.candidateKind,
    reasonCode: match.reasonCode,
    template: match.template,
    lessonFamily: match.lessonFamily,
    subject: match.subject,
    value: match.value,
    normalizedSubject: match.normalizedSubject,
    normalizedValue: match.normalizedValue,
    content: match.content,
    subjectKey: match.subjectKey,
    key: match.key,
    ...(match.projectScope ? { projectScope: match.projectScope } : {}),
    ...(match.normalizedProjectScope
      ? { normalizedProjectScope: match.normalizedProjectScope }
      : {}),
    ...(match.lessonKey ? { lessonKey: match.lessonKey } : {}),
    ...(match.toolKey ? { toolKey: match.toolKey } : {}),
    ...(match.guidancePattern ? { guidancePattern: match.guidancePattern } : {}),
    ...(match.needCategory ? { needCategory: match.needCategory } : {}),
    ...(match.neededCapability ? { neededCapability: match.neededCapability } : {}),
    ...(match.normalizedNeededCapability
      ? { normalizedNeededCapability: match.normalizedNeededCapability }
      : {}),
    ...(match.recommendedAction ? { recommendedAction: match.recommendedAction } : {}),
    ...(match.normalizedRecommendedAction
      ? { normalizedRecommendedAction: match.normalizedRecommendedAction }
      : {}),
    ...(match.avoidAction ? { avoidAction: match.avoidAction } : {}),
    ...(match.normalizedAvoidAction ? { normalizedAvoidAction: match.normalizedAvoidAction } : {}),
    ...(match.rationale ? { rationale: match.rationale } : {}),
    ...(match.normalizedRationale ? { normalizedRationale: match.normalizedRationale } : {}),
  };
}
