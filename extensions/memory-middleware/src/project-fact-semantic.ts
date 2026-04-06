import { createHash } from "node:crypto";

export const PROJECT_FACT_FIELD_KEYS = [
  "default_branch",
  "staging_branch",
  "repository_url",
  "deployment_url",
  "documentation_url",
  "runbook_url",
  "primary_package_manager",
  "primary_environment_name",
] as const;

export type ProjectFactFieldKey = (typeof PROJECT_FACT_FIELD_KEYS)[number];

export type ProjectFactSemanticConfidence = "high" | "medium";

export type ProjectFactCanonicalMatch = {
  captureClass: "explicit_project_fact" | "project_fact_correction";
  candidateKind: "learning" | "correction";
  reasonCode: "explicit_project_fact_statement" | "explicit_project_fact_correction";
  template: "project_fact_named_scope";
  fieldKey: ProjectFactFieldKey;
  projectScope: string;
  normalizedProjectScope: string;
  subject: string;
  value: string;
  normalizedSubject: string;
  normalizedValue: string;
  content: string;
  subjectKey: string;
  key: string;
};

export type ProjectFactSemanticCaptureDecision =
  | {
      action: "capture";
      confidence: ProjectFactSemanticConfidence;
      evidence: string[];
      match: ProjectFactCanonicalMatch;
    }
  | {
      action: "ignore";
      reason: string;
      evidence: string[];
    };

type ProjectFactFieldSpec = {
  label: string;
};

const PROJECT_FACT_FIELD_SPECS: Record<ProjectFactFieldKey, ProjectFactFieldSpec> = {
  default_branch: {
    label: "default branch",
  },
  staging_branch: {
    label: "staging branch",
  },
  repository_url: {
    label: "repository URL",
  },
  deployment_url: {
    label: "deployment URL",
  },
  documentation_url: {
    label: "documentation URL",
  },
  runbook_url: {
    label: "runbook URL",
  },
  primary_package_manager: {
    label: "primary package manager",
  },
  primary_environment_name: {
    label: "primary environment name",
  },
};

const CORRECTION_PREFIX_PATTERNS = [
  /^actually\b/i,
  /^no\b/i,
  /^sorry\b/i,
  /^i meant\b/i,
  /^correction\b/i,
  /^thats not right\b/i,
  /^that's not right\b/i,
];

const PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "bun"] as const;

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeLower(value: string): string {
  return normalizeText(value).toLowerCase();
}

function normalizeSemanticText(value: string): string {
  return normalizeLower(value)
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s._/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildAutoCaptureKey(params: {
  normalizedSubject: string;
  normalizedValue: string;
}): string {
  return createHash("sha256")
    .update(
      [
        "memory-middleware",
        "ordinary-turn",
        "project-fact-v1",
        "project_fact_named_scope",
        params.normalizedSubject,
        params.normalizedValue,
      ].join("|"),
    )
    .digest("hex");
}

function buildAutoCaptureSubjectKey(params: { normalizedSubject: string }): string {
  return createHash("sha256")
    .update(
      [
        "memory-middleware",
        "ordinary-turn",
        "project-fact-subject-v1",
        "project_fact_named_scope",
        params.normalizedSubject,
      ].join("|"),
    )
    .digest("hex");
}

function extractProjectScope(text: string): { projectScope: string; remainder: string } | null {
  const match = text.match(/^(?:for|in)\s+project\s+([a-z0-9][a-z0-9 -]{0,47})(?:,|\s+)(.+)$/i);
  if (!match) {
    return null;
  }
  const projectScope = normalizeText(match[1] ?? "");
  const remainder = normalizeText(match[2] ?? "");
  if (!projectScope || !remainder) {
    return null;
  }
  return { projectScope, remainder };
}

function stripCorrectionPrefix(text: string): { normalized: string; corrected: boolean } {
  for (const pattern of CORRECTION_PREFIX_PATTERNS) {
    if (pattern.test(text)) {
      return {
        normalized: normalizeText(text.replace(pattern, "").replace(/^[:,\s-]+/, "")),
        corrected: true,
      };
    }
  }
  return {
    normalized: text,
    corrected: false,
  };
}

function normalizeProjectFactValue(value: string): string {
  return normalizeText(value)
    .replace(/[.!?]+$/, "")
    .replace(/^["']+|["']+$/g, "");
}

function matchProjectFactUrl(
  remainder: string,
  params: {
    fieldKey: ProjectFactFieldKey;
    subjectPattern: string;
    evidencePrefix: string;
  },
): {
  fieldKey: ProjectFactFieldKey;
  value: string;
  confidence: ProjectFactSemanticConfidence;
  evidence: string[];
} | null {
  const pattern = new RegExp(
    `^(?:the\\s+)?${params.subjectPattern} is (https?:\\/\\/[^\\s"')]+)$`,
    "i",
  );
  const matched = remainder.match(pattern);
  if (!matched) {
    return null;
  }
  return {
    fieldKey: params.fieldKey,
    value: normalizeProjectFactValue(matched[1] ?? ""),
    confidence: "high",
    evidence: [params.evidencePrefix, "url_is_pattern"],
  };
}

function extractFieldMatch(remainder: string): {
  fieldKey: ProjectFactFieldKey;
  value: string;
  confidence: ProjectFactSemanticConfidence;
  evidence: string[];
} | null {
  const normalized = normalizeSemanticText(remainder);

  const defaultBranch = normalized.match(
    /^(?:the\s+)?default branch is ([a-z0-9][a-z0-9._/-]{0,63})$/,
  );
  if (defaultBranch) {
    return {
      fieldKey: "default_branch",
      value: normalizeProjectFactValue(defaultBranch[1] ?? ""),
      confidence: "high",
      evidence: ["default_branch_phrase", "is_pattern"],
    };
  }

  const stagingBranch = normalized.match(
    /^(?:the\s+)?staging branch is ([a-z0-9][a-z0-9._/-]{0,63})$/,
  );
  if (stagingBranch) {
    return {
      fieldKey: "staging_branch",
      value: normalizeProjectFactValue(stagingBranch[1] ?? ""),
      confidence: "high",
      evidence: ["staging_branch_phrase", "is_pattern"],
    };
  }

  const repositoryUrl = matchProjectFactUrl(remainder, {
    fieldKey: "repository_url",
    subjectPattern: "(?:repository|repo) url",
    evidencePrefix: "repository_url_phrase",
  });
  if (repositoryUrl) {
    return repositoryUrl;
  }

  const deploymentUrl = matchProjectFactUrl(remainder, {
    fieldKey: "deployment_url",
    subjectPattern: "(?:deployment|deploy) url",
    evidencePrefix: "deployment_url_phrase",
  });
  if (deploymentUrl) {
    return deploymentUrl;
  }

  const documentationUrl = matchProjectFactUrl(remainder, {
    fieldKey: "documentation_url",
    subjectPattern: "(?:documentation|docs) url",
    evidencePrefix: "documentation_url_phrase",
  });
  if (documentationUrl) {
    return documentationUrl;
  }

  const runbookUrl = matchProjectFactUrl(remainder, {
    fieldKey: "runbook_url",
    subjectPattern: "runbook url",
    evidencePrefix: "runbook_url_phrase",
  });
  if (runbookUrl) {
    return runbookUrl;
  }

  const packageManagerExplicit = normalized.match(
    /^(?:the\s+)?(?:primary\s+)?package manager is (npm|pnpm|yarn|bun)(?:[.!?])?$/,
  );
  if (packageManagerExplicit) {
    return {
      fieldKey: "primary_package_manager",
      value: normalizeProjectFactValue(packageManagerExplicit[1] ?? ""),
      confidence: "high",
      evidence: ["package_manager_phrase", "is_pattern"],
    };
  }

  const packageManagerNatural = normalized.match(
    /^(?:we use|uses|use) (npm|pnpm|yarn|bun)(?: as (?:the )?package manager)?(?:[.!?])?$/,
  );
  if (packageManagerNatural) {
    return {
      fieldKey: "primary_package_manager",
      value: normalizeProjectFactValue(packageManagerNatural[1] ?? ""),
      confidence: "medium",
      evidence: ["package_manager_token", "use_pattern"],
    };
  }

  const environmentName = normalized.match(
    /^(?:the\s+)?(?:primary|main) environment(?: name)? is ([a-z0-9][a-z0-9._/-]{0,63})$/,
  );
  if (environmentName) {
    return {
      fieldKey: "primary_environment_name",
      value: normalizeProjectFactValue(environmentName[1] ?? ""),
      confidence: "high",
      evidence: ["environment_name_phrase", "is_pattern"],
    };
  }

  return null;
}

export function getProjectFactFieldSpec(fieldKey: ProjectFactFieldKey): ProjectFactFieldSpec {
  return PROJECT_FACT_FIELD_SPECS[fieldKey];
}

export function detectProjectFactSemanticDecision(
  text: string,
): ProjectFactSemanticCaptureDecision {
  const normalized = normalizeText(text);
  if (!normalized || normalized.length < 18 || normalized.length > 240) {
    return {
      action: "ignore",
      reason: "out_of_bounds",
      evidence: [],
    };
  }

  const correction = stripCorrectionPrefix(normalized);
  const scoped = extractProjectScope(correction.normalized);
  if (!scoped) {
    return {
      action: "ignore",
      reason: "missing_explicit_project_scope",
      evidence: [],
    };
  }

  const fieldMatch = extractFieldMatch(scoped.remainder);
  if (!fieldMatch) {
    return {
      action: "ignore",
      reason: "unsupported_or_ambiguous_field",
      evidence: [],
    };
  }

  const fieldSpec = getProjectFactFieldSpec(fieldMatch.fieldKey);
  const normalizedProjectScope = normalizeLower(scoped.projectScope);
  const normalizedSubject = `${normalizedProjectScope} :: ${fieldSpec.label}`;
  const normalizedValue = normalizeLower(fieldMatch.value);
  const subjectKey = buildAutoCaptureSubjectKey({
    normalizedSubject,
  });

  return {
    action: "capture",
    confidence: fieldMatch.confidence,
    evidence: correction.corrected
      ? [...fieldMatch.evidence, "correction_prefix"]
      : fieldMatch.evidence,
    match: {
      captureClass: correction.corrected ? "project_fact_correction" : "explicit_project_fact",
      candidateKind: correction.corrected ? "correction" : "learning",
      reasonCode: correction.corrected
        ? "explicit_project_fact_correction"
        : "explicit_project_fact_statement",
      template: "project_fact_named_scope",
      fieldKey: fieldMatch.fieldKey,
      projectScope: scoped.projectScope,
      normalizedProjectScope,
      subject: `${scoped.projectScope} / ${fieldSpec.label}`,
      value: fieldMatch.value,
      normalizedSubject,
      normalizedValue,
      content: correction.corrected
        ? `Project correction [${scoped.projectScope}]: ${fieldSpec.label} is ${fieldMatch.value}.`
        : `Project fact [${scoped.projectScope}]: ${fieldSpec.label} is ${fieldMatch.value}.`,
      subjectKey,
      key: buildAutoCaptureKey({
        normalizedSubject,
        normalizedValue,
      }),
    },
  };
}

export function isSupportedProjectFactField(value: string): value is ProjectFactFieldKey {
  return PROJECT_FACT_FIELD_KEYS.includes(value as ProjectFactFieldKey);
}

export function isSupportedProjectFactPackageManager(value: string): boolean {
  return PACKAGE_MANAGERS.includes(value as (typeof PACKAGE_MANAGERS)[number]);
}
