import type {
  CanonicalMemoryKind,
  CanonicalMemoryScope,
} from "openclaw/plugin-sdk/memory-canonical-core";
import {
  createCanonicalMemoryRetrievalPlan,
  type CanonicalMemoryRetrievalFacetFilter,
  type CanonicalMemoryRetrievalPlan,
  type CanonicalMemorySemanticFallbackStrategy,
} from "openclaw/plugin-sdk/memory-canonical-retrieval";
import type { MemoryObjectSearchHybridInput, MemoryObjectSearchScope } from "./db/runtime.js";

export type ResponseStyleQueryHint = {
  template:
    | "responses_concise"
    | "responses_bullets"
    | "responses_plain_english"
    | "responses_no_tables"
    | "responses_numbered_steps"
    | "response_style_generalized_guidance";
  normalizedSubject?: "file references";
};

export type ProjectFactQueryHint = {
  fieldKey:
    | "default_branch"
    | "staging_branch"
    | "repository_url"
    | "deployment_url"
    | "documentation_url"
    | "runbook_url"
    | "primary_package_manager"
    | "primary_environment_name";
};

export type RecurringProcedureQueryHint = {
  procedureKey?:
    | "deploy_checklist"
    | "release_checklist"
    | "triage_checklist"
    | "investigation_checklist";
  normalizedSubject?: string;
};

export type WorkflowImprovementQueryHint = {
  captureClass:
    | "workflow_tool_gotcha"
    | "workflow_environment_constraint"
    | "workflow_api_workaround";
};

export type GeneralizedWorkflowGuidancePatternHint =
  | ""
  | "use_instead_of"
  | "trust_for_scope"
  | "avoid_only";

export type ProjectMemoryIntentFamily = "" | "project_fact" | "project_rule" | "unmet_need";

function readCanonicalStringFacetFilter(
  plan: CanonicalMemoryRetrievalPlan,
  key: string,
): string | undefined {
  const filter = plan.query.facetFilters.find((candidate) => candidate.key === key);
  return typeof filter?.value === "string" && filter.value.trim().length > 0
    ? filter.value.trim()
    : undefined;
}

function hasCanonicalDerivedView(plan: CanonicalMemoryRetrievalPlan, view: string): boolean {
  return plan.query.derivedViews.includes(view);
}

export function normalizeRetrievalQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

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

function mapHybridKindToCanonicalKinds(
  kind: MemoryObjectSearchHybridInput["kind"],
): readonly CanonicalMemoryKind[] {
  switch (kind) {
    case "feedback":
      return ["user", "feedback"];
    case "project":
      return ["project", "feedback", "reference"];
    case "procedure":
      return ["reference", "feedback"];
    default:
      return ["user", "feedback", "project", "reference"];
  }
}

function mapHybridScopeToCanonicalScope(
  kind: MemoryObjectSearchHybridInput["kind"],
): CanonicalMemoryScope {
  return kind === "project" ? { kind: "mixed" } : { kind: "global" };
}

function buildCanonicalFacetFilters(params: {
  responseStyleHint: ResponseStyleQueryHint | null;
  projectFactHint: ProjectFactQueryHint | null;
  workflowImprovementHint: WorkflowImprovementQueryHint | null;
  projectMemoryIntentFamily: ProjectMemoryIntentFamily;
  generalizedWorkflowPatternHint: GeneralizedWorkflowGuidancePatternHint;
  procedureHint: RecurringProcedureQueryHint | null;
}): CanonicalMemoryRetrievalFacetFilter[] {
  const filters: CanonicalMemoryRetrievalFacetFilter[] = [];
  if (params.responseStyleHint) {
    filters.push({
      key: "responseStyleTemplate",
      operator: "equals",
      value: params.responseStyleHint.template,
    });
    if (params.responseStyleHint.normalizedSubject) {
      filters.push({
        key: "normalizedSubject",
        operator: "equals",
        value: params.responseStyleHint.normalizedSubject,
      });
    }
  }
  if (params.projectFactHint) {
    filters.push({
      key: "fieldKey",
      operator: "equals",
      value: params.projectFactHint.fieldKey,
    });
  }
  if (params.workflowImprovementHint) {
    filters.push({
      key: "captureClass",
      operator: "equals",
      value: params.workflowImprovementHint.captureClass,
    });
  }
  if (params.generalizedWorkflowPatternHint) {
    filters.push({
      key: "guidancePattern",
      operator: "equals",
      value: params.generalizedWorkflowPatternHint,
    });
  }
  if (params.projectMemoryIntentFamily) {
    filters.push({
      key: "projectIntentFamily",
      operator: "equals",
      value: params.projectMemoryIntentFamily,
    });
  }
  if (params.procedureHint?.procedureKey) {
    filters.push({
      key: "procedureKey",
      operator: "equals",
      value: params.procedureHint.procedureKey,
    });
  }
  if (params.procedureHint?.normalizedSubject) {
    filters.push({
      key: "normalizedSubject",
      operator: "equals",
      value: params.procedureHint.normalizedSubject,
    });
  }
  return filters;
}

function buildCanonicalDerivedViews(params: {
  kind: MemoryObjectSearchHybridInput["kind"];
  responseStyleHint: ResponseStyleQueryHint | null;
  projectFactHint: ProjectFactQueryHint | null;
  workflowImprovementHint: WorkflowImprovementQueryHint | null;
  projectMemoryIntentFamily: ProjectMemoryIntentFamily;
  procedureHint: RecurringProcedureQueryHint | null;
}): string[] {
  const views: string[] = [];
  if (params.responseStyleHint) {
    views.push("response_style");
  }
  if (params.projectFactHint || params.projectMemoryIntentFamily === "project_fact") {
    views.push("project_fact");
  }
  if (params.workflowImprovementHint) {
    views.push("workflow_guidance");
  }
  if (params.projectMemoryIntentFamily === "project_rule") {
    views.push("project_rule");
  }
  if (params.projectMemoryIntentFamily === "unmet_need") {
    views.push("unmet_need");
  }
  if (params.procedureHint) {
    views.push("procedure");
  }
  if (views.length === 0 && params.kind === "feedback") {
    views.push("response_style");
  }
  return views;
}

function buildCanonicalSemanticFallbackStrategies(params: {
  kind: MemoryObjectSearchHybridInput["kind"];
  scope: MemoryObjectSearchScope;
  workflowImprovementHint: WorkflowImprovementQueryHint | null;
}): readonly CanonicalMemorySemanticFallbackStrategy[] {
  if (params.kind === "procedure" && scopeIncludesValidatedProcedures(params.scope)) {
    return ["procedure"];
  }
  if (params.kind !== "project" || scopeIncludesCandidates(params.scope)) {
    return [];
  }
  switch (params.workflowImprovementHint?.captureClass) {
    case "workflow_environment_constraint":
      return ["environment_constraint"];
    case "workflow_tool_gotcha":
      return ["workflow_tool_gotcha"];
    case "workflow_api_workaround":
      return ["api_workaround"];
    default:
      return ["environment_constraint", "workflow_tool_gotcha", "api_workaround"];
  }
}

export function inferSupportedRecurringProcedureKeyFromSubject(
  normalizedSubject: string,
):
  | "deploy_checklist"
  | "release_checklist"
  | "triage_checklist"
  | "investigation_checklist"
  | null {
  if (normalizedSubject === "deploy checklist" || normalizedSubject === "deployment checklist") {
    return "deploy_checklist";
  }
  if (normalizedSubject === "release checklist" || normalizedSubject === "release steps") {
    return "release_checklist";
  }
  if (normalizedSubject === "triage checklist" || normalizedSubject === "triage steps") {
    return "triage_checklist";
  }
  if (
    normalizedSubject === "investigation checklist" ||
    normalizedSubject === "investigation steps" ||
    normalizedSubject === "debug checklist"
  ) {
    return "investigation_checklist";
  }
  return null;
}

export function inferGeneralizedWorkflowGuidancePatternHint(
  query: string,
): GeneralizedWorkflowGuidancePatternHint {
  const normalized = normalizeRetrievalQuery(query);
  if (!normalized) {
    return "";
  }
  if (
    normalized.includes("what should i trust") ||
    normalized.includes("which signal should i trust") ||
    normalized.includes("which source should i trust") ||
    normalized.includes("what source should i trust") ||
    normalized.includes("rely on") ||
    normalized.includes("trust")
  ) {
    return "trust_for_scope";
  }
  if (
    normalized.includes("what should i avoid") ||
    normalized.includes("avoid") ||
    normalized.includes("don't use") ||
    normalized.includes("do not use")
  ) {
    return "avoid_only";
  }
  if (
    normalized.includes("should i use") ||
    normalized.includes("what should i use") ||
    normalized.includes("instead of")
  ) {
    return "use_instead_of";
  }
  return "";
}

export function inferProjectMemoryIntentFamily(query: string): ProjectMemoryIntentFamily {
  const normalized = normalizeRetrievalQuery(query);
  if (!normalized) {
    return "";
  }
  if (
    normalized.includes("still missing") ||
    normalized.includes("still need") ||
    normalized.includes("still needed") ||
    normalized.includes("what do we need") ||
    normalized.includes("what are we missing") ||
    normalized.includes("what is missing") ||
    normalized.includes("what's missing") ||
    normalized.includes("are we missing") ||
    normalized.includes("do we need") ||
    normalized.includes("what do we still need") ||
    normalized.includes("what are we still missing") ||
    normalized.includes("should have next")
  ) {
    return "unmet_need";
  }
  if (
    (normalized.includes("docs") || normalized.includes("documentation")) &&
    (normalized.includes("i18n") ||
      normalized.includes("translation") ||
      normalized.includes("translated") ||
      normalized.includes("localized") ||
      normalized.includes("localization") ||
      normalized.includes("zh-cn") ||
      normalized.includes("workflow") ||
      normalized.includes("rule") ||
      normalized.includes("edit") ||
      normalized.includes("update english"))
  ) {
    return "project_rule";
  }
  if (
    normalized.includes("should i use") ||
    normalized.includes("what should i use") ||
    normalized.includes("what should we use") ||
    normalized.includes("which should i use") ||
    normalized.includes("which should we use") ||
    normalized.includes("what should i trust") ||
    normalized.includes("what should we trust") ||
    normalized.includes("which signal should i trust") ||
    normalized.includes("which source should i trust") ||
    normalized.includes("what should i avoid") ||
    normalized.includes("what should we avoid") ||
    normalized.includes("instead of") ||
    normalized.includes("rely on") ||
    normalized.includes("trust") ||
    normalized.includes("avoid") ||
    normalized.includes("prefer ")
  ) {
    return "project_rule";
  }
  if (
    normalized.includes("where is") ||
    normalized.includes("what is the") ||
    normalized.includes("what's the") ||
    normalized.includes("which branch") ||
    normalized.includes("url") ||
    normalized.includes("link") ||
    normalized.includes("dashboard") ||
    normalized.includes("report") ||
    normalized.includes("runbook") ||
    normalized.includes("docs") ||
    normalized.includes("documentation")
  ) {
    return "project_fact";
  }
  return "";
}

export function inferResponseStyleQueryHint(query: string): ResponseStyleQueryHint | null {
  const normalized = normalizeRetrievalQuery(query);
  if (!normalized) {
    return null;
  }
  if (
    (normalized.includes("file") || normalized.includes("files") || normalized.includes("path")) &&
    (normalized.includes("repo-root relative") ||
      normalized.includes("repo root relative") ||
      normalized.includes("repo-relative") ||
      normalized.includes("repo relative") ||
      normalized.includes("absolute path") ||
      normalized.includes("absolute paths") ||
      normalized.includes("cite files") ||
      normalized.includes("file references") ||
      normalized.includes("referencing files") ||
      normalized.includes("path style"))
  ) {
    return {
      template: "response_style_generalized_guidance",
      normalizedSubject: "file references",
    };
  }
  if (normalized.includes("plain english") || normalized.includes("jargon")) {
    return { template: "responses_plain_english" };
  }
  if (normalized.includes("bullet points") || normalized.includes("bullet-point")) {
    return { template: "responses_bullets" };
  }
  if (normalized.includes("numbered steps") || normalized.includes("numbered lists")) {
    return { template: "responses_numbered_steps" };
  }
  if (normalized.includes("table")) {
    return { template: "responses_no_tables" };
  }
  if (
    normalized.includes("concise") ||
    normalized.includes("brief") ||
    normalized.includes("short replies") ||
    normalized.includes("short responses")
  ) {
    return { template: "responses_concise" };
  }
  return null;
}

export function inferProjectFactQueryHint(query: string): ProjectFactQueryHint | null {
  const normalized = normalizeRetrievalQuery(query);
  if (!normalized) {
    return null;
  }
  if (normalized.includes("default branch")) {
    return { fieldKey: "default_branch" };
  }
  if (normalized.includes("staging branch")) {
    return { fieldKey: "staging_branch" };
  }
  if (
    normalized.includes("repository url") ||
    normalized.includes("repo url") ||
    normalized.includes("repository link") ||
    normalized.includes("repo link")
  ) {
    return { fieldKey: "repository_url" };
  }
  if (
    normalized.includes("deployment url") ||
    normalized.includes("deploy url") ||
    normalized.includes("deployed url") ||
    normalized.includes("deployment link")
  ) {
    return { fieldKey: "deployment_url" };
  }
  if (
    normalized.includes("documentation url") ||
    normalized.includes("docs url") ||
    normalized.includes("documentation link") ||
    normalized.includes("docs link")
  ) {
    return { fieldKey: "documentation_url" };
  }
  if (normalized.includes("runbook url") || normalized.includes("runbook link")) {
    return { fieldKey: "runbook_url" };
  }
  if (
    normalized.includes("package manager") ||
    normalized.includes("pnpm") ||
    normalized.includes("npm") ||
    normalized.includes("yarn") ||
    normalized.includes("bun")
  ) {
    return { fieldKey: "primary_package_manager" };
  }
  if (normalized.includes("environment")) {
    return { fieldKey: "primary_environment_name" };
  }
  return null;
}

export function inferRecurringProcedureQueryHint(
  query: string,
): RecurringProcedureQueryHint | null {
  const normalized = normalizeRetrievalQuery(query);
  if (!normalized) {
    return null;
  }
  const genericNormalized = normalized
    .replace(
      /^(?:give me|show me|use|return|find|what(?: are| is)?|where(?: are| is)?|how should we|how do we|can you show me|can you give me)\s+/,
      "",
    )
    .replace(/\bmy\b\s+/g, "")
    .trim();
  const genericSubjectMatch = normalized.match(
    /\b(?:our|the)?\s*([a-z0-9][a-z0-9 /_-]{3,80}?)\s+(checklist|procedure|runbook|playbook|steps)\b/,
  );
  const fallbackGenericSubjectMatch = genericNormalized.match(
    /\b(?:our|the)?\s*([a-z0-9][a-z0-9 /_-]{3,80}?)\s+(checklist|procedure|runbook|playbook|steps)\b/,
  );
  const subjectMatch = genericSubjectMatch ?? fallbackGenericSubjectMatch;
  if (subjectMatch) {
    const normalizedSubject =
      `${subjectMatch[1]?.trim() ?? ""} ${subjectMatch[2]?.trim() ?? ""}`.trim();
    const supportedProcedureKey = inferSupportedRecurringProcedureKeyFromSubject(normalizedSubject);
    if (supportedProcedureKey) {
      return { procedureKey: supportedProcedureKey };
    }
    return {
      normalizedSubject,
    };
  }
  if (
    normalized.includes("deploy checklist") ||
    normalized.includes("deployment checklist") ||
    /\bdeploy\b/.test(normalized) ||
    /\bdeployment\b/.test(normalized) ||
    /\broll out\b/.test(normalized) ||
    /\brollout\b/.test(normalized)
  ) {
    return { procedureKey: "deploy_checklist" };
  }
  if (
    normalized.includes("release checklist") ||
    normalized.includes("release steps") ||
    /\brelease\b/.test(normalized) ||
    /\bship\b/.test(normalized)
  ) {
    return { procedureKey: "release_checklist" };
  }
  if (
    normalized.includes("triage checklist") ||
    normalized.includes("triage steps") ||
    /\btriage\b/.test(normalized)
  ) {
    return { procedureKey: "triage_checklist" };
  }
  if (
    normalized.includes("investigation checklist") ||
    normalized.includes("investigation steps") ||
    /\binvestigate\b/.test(normalized) ||
    /\binvestigation\b/.test(normalized) ||
    /\bdebug\b/.test(normalized)
  ) {
    return { procedureKey: "investigation_checklist" };
  }
  return null;
}

export function inferWorkflowImprovementQueryHint(
  query: string,
): WorkflowImprovementQueryHint | null {
  const normalized = normalizeRetrievalQuery(query);
  if (!normalized) {
    return null;
  }
  if (
    normalized.includes("vitest") ||
    normalized.includes("pnpm test") ||
    normalized.includes("test wrapper") ||
    normalized.includes("run tests")
  ) {
    return { captureClass: "workflow_tool_gotcha" };
  }
  if (
    normalized.includes("scripts/committer") ||
    normalized.includes("git add") ||
    normalized.includes("git commit") ||
    normalized.includes("scoped commit")
  ) {
    return { captureClass: "workflow_tool_gotcha" };
  }
  if (normalized.includes("git stash") || normalized.includes("stash")) {
    return { captureClass: "workflow_tool_gotcha" };
  }
  if (
    (normalized.includes("docs-only") ||
      normalized.includes("docs only") ||
      normalized.includes("process-only") ||
      normalized.includes("process only") ||
      normalized.includes("changelog-only") ||
      normalized.includes("changelog only")) &&
    (normalized.includes("check:fast") ||
      normalized.includes("check fast") ||
      normalized.includes("pnpm check") ||
      normalized.includes("pnpm build"))
  ) {
    return { captureClass: "workflow_tool_gotcha" };
  }
  if (
    normalized.includes("memory:proof") ||
    (normalized.includes("memory proof") &&
      (normalized.includes("proof runner") ||
        normalized.includes("isolated proof") ||
        normalized.includes("production proof")))
  ) {
    return { captureClass: "workflow_tool_gotcha" };
  }
  if (
    normalized.includes("readyz") ||
    ((normalized.includes("healthz") || normalized.includes("liveness")) &&
      normalized.includes("readiness"))
  ) {
    return { captureClass: "workflow_tool_gotcha" };
  }
  if (
    (normalized.includes("python") &&
      (normalized.includes("not available") ||
        normalized.includes("unavailable") ||
        normalized.includes("without python") ||
        normalized.includes("python command"))) ||
    normalized.includes("tsx")
  ) {
    return { captureClass: "workflow_environment_constraint" };
  }
  if (
    normalized.includes("/tools/invoke") ||
    normalized.includes("tools invoke") ||
    (normalized.includes("gateway") && normalized.includes("runtime invocation"))
  ) {
    return { captureClass: "workflow_environment_constraint" };
  }
  if (
    (normalized.includes("embedding") || normalized.includes("semantic memory search")) &&
    (normalized.includes("oauth") ||
      normalized.includes("auth profile") ||
      normalized.includes("provider profile") ||
      normalized.includes("synthetic auth")) &&
    (normalized.includes("api key") ||
      normalized.includes("provider key") ||
      normalized.includes("credential"))
  ) {
    return { captureClass: "workflow_api_workaround" };
  }
  if (
    (normalized.includes("long context") || normalized.includes("context1m")) &&
    (normalized.includes("extra usage") ||
      normalized.includes("429") ||
      normalized.includes("fallback model") ||
      normalized.includes("eligible credential") ||
      normalized.includes("billed api key"))
  ) {
    return { captureClass: "workflow_api_workaround" };
  }
  return null;
}

export function buildCanonicalMemoryRetrievalPlan(params: {
  input: Pick<MemoryObjectSearchHybridInput, "query" | "kind" | "scope">;
}): CanonicalMemoryRetrievalPlan {
  const scope = normalizeMemoryObjectScope(params.input.scope);
  const normalizedQuery = normalizeRetrievalQuery(params.input.query);
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
  const facetFilters = buildCanonicalFacetFilters({
    responseStyleHint,
    projectFactHint,
    workflowImprovementHint,
    projectMemoryIntentFamily,
    generalizedWorkflowPatternHint,
    procedureHint,
  });
  const derivedViews = buildCanonicalDerivedViews({
    kind: params.input.kind,
    responseStyleHint,
    projectFactHint,
    workflowImprovementHint,
    projectMemoryIntentFamily,
    procedureHint,
  });

  return createCanonicalMemoryRetrievalPlan({
    query: {
      rawQuery: params.input.query,
      normalizedQuery,
      requestedKinds: mapHybridKindToCanonicalKinds(params.input.kind),
      scope: mapHybridScopeToCanonicalScope(params.input.kind),
      derivedViews,
      facetFilters,
      compatibility: {
        ...(params.input.kind ? { legacyKind: params.input.kind } : {}),
        legacyScope: scope,
        metadata: {
          ...(responseStyleHint?.template
            ? { responseStyleTemplate: responseStyleHint.template }
            : {}),
          ...(responseStyleHint?.normalizedSubject
            ? { responseStyleNormalizedSubject: responseStyleHint.normalizedSubject }
            : {}),
          ...(projectFactHint?.fieldKey ? { projectFactFieldKey: projectFactHint.fieldKey } : {}),
          ...(workflowImprovementHint?.captureClass
            ? { workflowCaptureClass: workflowImprovementHint.captureClass }
            : {}),
          ...(projectMemoryIntentFamily ? { projectMemoryIntentFamily } : {}),
          ...(generalizedWorkflowPatternHint ? { generalizedWorkflowPatternHint } : {}),
          ...(procedureHint?.procedureKey ? { procedureKey: procedureHint.procedureKey } : {}),
          ...(procedureHint?.normalizedSubject
            ? { procedureSubject: procedureHint.normalizedSubject }
            : {}),
        },
      },
    },
    ranking: {
      preferValidationStatuses: scopeIncludesCandidates(scope)
        ? ["validated", "approved", "pending_confirmation", "observed"]
        : ["validated", "approved"],
      boostFacetFilters: facetFilters,
      preferApprovedWithinSubjectClusters: scopeIncludesCandidates(scope),
      semanticFallbackStrategies: buildCanonicalSemanticFallbackStrategies({
        kind: params.input.kind,
        scope,
        workflowImprovementHint,
      }),
    },
  });
}

export function resolveResponseStyleQueryHintFromCanonicalPlan(
  plan: CanonicalMemoryRetrievalPlan,
): ResponseStyleQueryHint | null {
  const template = readCanonicalStringFacetFilter(plan, "responseStyleTemplate");
  if (
    template !== "responses_concise" &&
    template !== "responses_bullets" &&
    template !== "responses_plain_english" &&
    template !== "responses_no_tables" &&
    template !== "responses_numbered_steps" &&
    template !== "response_style_generalized_guidance"
  ) {
    return null;
  }

  const normalizedSubject = readCanonicalStringFacetFilter(plan, "normalizedSubject");
  return {
    template,
    ...(normalizedSubject === "file references" ? { normalizedSubject } : {}),
  };
}

export function resolveProjectFactQueryHintFromCanonicalPlan(
  plan: CanonicalMemoryRetrievalPlan,
): ProjectFactQueryHint | null {
  const fieldKey = readCanonicalStringFacetFilter(plan, "fieldKey");
  if (
    fieldKey !== "default_branch" &&
    fieldKey !== "staging_branch" &&
    fieldKey !== "repository_url" &&
    fieldKey !== "deployment_url" &&
    fieldKey !== "documentation_url" &&
    fieldKey !== "runbook_url" &&
    fieldKey !== "primary_package_manager" &&
    fieldKey !== "primary_environment_name"
  ) {
    return null;
  }
  return { fieldKey };
}

export function resolveWorkflowImprovementQueryHintFromCanonicalPlan(
  plan: CanonicalMemoryRetrievalPlan,
): WorkflowImprovementQueryHint | null {
  const captureClass = readCanonicalStringFacetFilter(plan, "captureClass");
  if (
    captureClass !== "workflow_tool_gotcha" &&
    captureClass !== "workflow_environment_constraint" &&
    captureClass !== "workflow_api_workaround"
  ) {
    return null;
  }
  return { captureClass };
}

export function resolveProjectMemoryIntentFamilyFromCanonicalPlan(
  plan: CanonicalMemoryRetrievalPlan,
): ProjectMemoryIntentFamily {
  const projectIntentFamily = readCanonicalStringFacetFilter(plan, "projectIntentFamily");
  if (
    projectIntentFamily === "project_fact" ||
    projectIntentFamily === "project_rule" ||
    projectIntentFamily === "unmet_need"
  ) {
    return projectIntentFamily;
  }
  if (hasCanonicalDerivedView(plan, "project_fact")) {
    return "project_fact";
  }
  if (hasCanonicalDerivedView(plan, "project_rule")) {
    return "project_rule";
  }
  if (hasCanonicalDerivedView(plan, "unmet_need")) {
    return "unmet_need";
  }
  return "";
}

export function resolveGeneralizedWorkflowGuidancePatternHintFromCanonicalPlan(
  plan: CanonicalMemoryRetrievalPlan,
): GeneralizedWorkflowGuidancePatternHint {
  const guidancePattern = readCanonicalStringFacetFilter(plan, "guidancePattern");
  return guidancePattern === "use_instead_of" ||
    guidancePattern === "trust_for_scope" ||
    guidancePattern === "avoid_only"
    ? guidancePattern
    : "";
}

export function resolveRecurringProcedureQueryHintFromCanonicalPlan(
  plan: CanonicalMemoryRetrievalPlan,
): RecurringProcedureQueryHint | null {
  const rawProcedureKey = readCanonicalStringFacetFilter(plan, "procedureKey");
  const normalizedSubject = readCanonicalStringFacetFilter(plan, "normalizedSubject");
  const procedureKey =
    rawProcedureKey === "deploy_checklist" ||
    rawProcedureKey === "release_checklist" ||
    rawProcedureKey === "triage_checklist" ||
    rawProcedureKey === "investigation_checklist"
      ? rawProcedureKey
      : undefined;
  if (!procedureKey && !normalizedSubject) {
    return null;
  }
  return {
    ...(procedureKey ? { procedureKey } : {}),
    ...(normalizedSubject ? { normalizedSubject } : {}),
  };
}
