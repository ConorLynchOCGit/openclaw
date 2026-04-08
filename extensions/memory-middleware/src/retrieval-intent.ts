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
  lessonKey:
    | "vitest_wrapper_required"
    | "scripts_committer_required"
    | "git_stash_unsafe"
    | "docs_only_check_fast"
    | "memory_proof_runner_required"
    | "readyz_for_readiness"
    | "python_command_unavailable"
    | "gateway_tools_invoke_forbidden"
    | "openai_embeddings_api_key_required"
    | "anthropic_context1m_eligible_credential_required";
};

export type GeneralizedWorkflowGuidancePatternHint =
  | ""
  | "use_instead_of"
  | "trust_for_scope"
  | "avoid_only";

export type ProjectMemoryIntentFamily = "" | "project_fact" | "project_rule" | "unmet_need";

export function normalizeRetrievalQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
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
    return { lessonKey: "vitest_wrapper_required" };
  }
  if (
    normalized.includes("scripts/committer") ||
    normalized.includes("git add") ||
    normalized.includes("git commit") ||
    normalized.includes("scoped commit")
  ) {
    return { lessonKey: "scripts_committer_required" };
  }
  if (normalized.includes("git stash") || normalized.includes("stash")) {
    return { lessonKey: "git_stash_unsafe" };
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
    return { lessonKey: "docs_only_check_fast" };
  }
  if (
    normalized.includes("memory:proof") ||
    (normalized.includes("memory proof") &&
      (normalized.includes("proof runner") ||
        normalized.includes("isolated proof") ||
        normalized.includes("production proof")))
  ) {
    return { lessonKey: "memory_proof_runner_required" };
  }
  if (
    normalized.includes("readyz") ||
    ((normalized.includes("healthz") || normalized.includes("liveness")) &&
      normalized.includes("readiness"))
  ) {
    return { lessonKey: "readyz_for_readiness" };
  }
  if (
    (normalized.includes("python") &&
      (normalized.includes("not available") ||
        normalized.includes("unavailable") ||
        normalized.includes("without python") ||
        normalized.includes("python command"))) ||
    normalized.includes("tsx")
  ) {
    return { lessonKey: "python_command_unavailable" };
  }
  if (
    normalized.includes("/tools/invoke") ||
    normalized.includes("tools invoke") ||
    (normalized.includes("gateway") && normalized.includes("runtime invocation"))
  ) {
    return { lessonKey: "gateway_tools_invoke_forbidden" };
  }
  if (
    (normalized.includes("embedding") || normalized.includes("semantic memory search")) &&
    (normalized.includes("codex oauth") ||
      normalized.includes("codex") ||
      normalized.includes("chatgpt oauth")) &&
    (normalized.includes("api key") || normalized.includes("openai_api_key"))
  ) {
    return { lessonKey: "openai_embeddings_api_key_required" };
  }
  if (
    (normalized.includes("anthropic") || normalized.includes("claude")) &&
    (normalized.includes("long context") || normalized.includes("context1m")) &&
    (normalized.includes("extra usage") ||
      normalized.includes("429") ||
      normalized.includes("fallback model"))
  ) {
    return { lessonKey: "anthropic_context1m_eligible_credential_required" };
  }
  return null;
}
