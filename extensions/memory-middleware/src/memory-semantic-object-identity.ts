import { createHash } from "node:crypto";
import type { CanonicalMemoryScope } from "openclaw/plugin-sdk/memory-canonical-core";
import type {
  MemoryCanonicalClass,
  MemorySemanticObject,
} from "./memory-semantic-interpretation.js";

export type MemorySemanticObjectIdentity = {
  canonicalClass: MemoryCanonicalClass;
  canonicalKind: MemoryCanonicalClass;
  scope: CanonicalMemoryScope;
  subject: string;
  statement: string;
  subjectKey: string;
  clusterKey: string;
  dedupeKey: string;
};

export type MemoryProjectionCategory =
  | "response_style"
  | "project_fact"
  | "recurring_procedure"
  | "reference_routing"
  | "workflow_improvement"
  | "project_rule"
  | "unmet_need";

/**
 * Deprecated compatibility-era alias. Use `MemoryProjectionCategory` for
 * output/reporting-only projection labels.
 */
export type MemoryCompatibilityProjectionCategory = MemoryProjectionCategory;

function normalizeLower(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[`"'()[\]{}:;,.!?/_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createStableKey(parts: Array<string | undefined>): string {
  return createHash("sha256")
    .update(parts.map((part) => part?.trim() ?? "").join("|"))
    .digest("hex")
    .slice(0, 16);
}

function resolveCanonicalClass(object: MemorySemanticObject): MemoryCanonicalClass {
  if (object.canonicalClass) {
    return object.canonicalClass;
  }
  switch (object.kind) {
    case "preference":
      return "user";
    case "correction":
      switch (object.correctionKind) {
        case "response_preference":
          return "user";
        case "workflow_guidance":
        case "project_rule":
          return "feedback";
        case "missing_capability":
          return "project";
      }
    case "procedure":
      return "feedback";
    case "project_fact":
      return "project";
    case "routing":
      return "reference";
  }
}

function resolveScope(object: MemorySemanticObject): CanonicalMemoryScope {
  const projectId = object.scope?.projectId;
  if (projectId) {
    return { kind: "mixed", projectId };
  }
  if (object.scope?.projectScope || object.scope?.workflowScope) {
    return { kind: "mixed" };
  }
  return { kind: "global" };
}

function resolveSubject(object: MemorySemanticObject): string {
  switch (object.kind) {
    case "preference":
      return object.subject;
    case "correction":
      return object.subject;
    case "procedure":
      return object.title;
    case "project_fact":
      return object.subject;
    case "routing":
      return object.task;
  }
}

function resolveStatement(object: MemorySemanticObject): string {
  switch (object.kind) {
    case "preference":
      return object.instruction;
    case "correction": {
      if (object.correctionKind === "missing_capability" && object.neededCapability) {
        return object.rationaleText
          ? `Need ${object.neededCapability} for ${object.subject} because ${object.rationaleText}.`
          : `Need ${object.neededCapability} for ${object.subject}.`;
      }
      if (object.recommendedAction && object.avoidAction) {
        return `Use ${object.recommendedAction} instead of ${object.avoidAction}.`;
      }
      if (object.recommendedAction) {
        return object.rationaleText
          ? `${object.recommendedAction}. ${object.rationaleText}`
          : object.recommendedAction;
      }
      if (object.avoidAction) {
        return object.rationaleText
          ? `Avoid ${object.avoidAction}. ${object.rationaleText}`
          : `Avoid ${object.avoidAction}.`;
      }
      return object.subject;
    }
    case "procedure":
      return `${object.title}: ${object.steps.join("; ")}`;
    case "project_fact":
      return `${object.subject}: ${object.value}`;
    case "routing": {
      const resources =
        object.companionResources && object.companionResources.length > 0
          ? [object.primaryResource, ...object.companionResources].join(" and ")
          : object.primaryResource;
      return `For ${object.task}, use ${resources}.`;
    }
  }
}

function resolveSubjectIdentityFragment(object: MemorySemanticObject): string {
  switch (object.kind) {
    case "preference":
      return createStableKey([
        "preference",
        normalizeLower(object.subject),
        object.preferenceProfile,
        object.scope?.projectScope ? normalizeLower(object.scope.projectScope) : undefined,
      ]);
    case "correction":
      return createStableKey([
        "correction",
        object.correctionKind,
        normalizeLower(object.subject),
        object.scope?.projectScope ? normalizeLower(object.scope.projectScope) : undefined,
      ]);
    case "procedure":
      return createStableKey([
        "procedure",
        object.procedureKey,
        normalizeLower(object.title),
        object.scope?.projectScope ? normalizeLower(object.scope.projectScope) : undefined,
      ]);
    case "project_fact":
      return createStableKey([
        "project_fact",
        object.factFieldKey,
        normalizeLower(object.subject),
        object.scope?.projectScope ? normalizeLower(object.scope.projectScope) : undefined,
      ]);
    case "routing":
      return createStableKey([
        "routing",
        normalizeLower(object.task),
        object.scope?.projectScope ? normalizeLower(object.scope.projectScope) : undefined,
      ]);
  }
}

function resolveClusterKey(object: MemorySemanticObject): string {
  switch (object.kind) {
    case "preference":
      return createStableKey([
        "cluster",
        "preference",
        normalizeLower(object.subject),
        object.scope?.projectScope ? normalizeLower(object.scope.projectScope) : undefined,
      ]);
    case "correction":
      return createStableKey([
        "cluster",
        "correction",
        object.correctionKind,
        normalizeLower(object.subject),
        object.scope?.projectScope ? normalizeLower(object.scope.projectScope) : undefined,
      ]);
    case "procedure":
      return createStableKey([
        "cluster",
        "procedure",
        object.procedureKey ?? normalizeLower(object.title),
        object.scope?.projectScope ? normalizeLower(object.scope.projectScope) : undefined,
      ]);
    case "project_fact":
      return createStableKey([
        "cluster",
        "project_fact",
        object.factFieldKey ?? normalizeLower(object.subject),
        object.scope?.projectScope ? normalizeLower(object.scope.projectScope) : undefined,
      ]);
    case "routing":
      return createStableKey([
        "cluster",
        "routing",
        normalizeLower(object.task),
        object.scope?.projectScope ? normalizeLower(object.scope.projectScope) : undefined,
      ]);
  }
}

function resolveDedupeKey(object: MemorySemanticObject): string {
  switch (object.kind) {
    case "preference":
      return createStableKey([
        "dedupe",
        "preference",
        object.operation,
        normalizeLower(object.subject),
        normalizeLower(object.instruction),
        object.preferenceProfile,
        object.scope?.projectScope ? normalizeLower(object.scope.projectScope) : undefined,
      ]);
    case "correction":
      return createStableKey([
        "dedupe",
        "correction",
        object.correctionKind,
        normalizeLower(object.subject),
        object.recommendedAction ? normalizeLower(object.recommendedAction) : undefined,
        object.avoidAction ? normalizeLower(object.avoidAction) : undefined,
        object.neededCapability ? normalizeLower(object.neededCapability) : undefined,
        object.workflowProfile,
        object.guidancePattern,
        object.rationaleText ? normalizeLower(object.rationaleText) : undefined,
        object.scope?.projectScope ? normalizeLower(object.scope.projectScope) : undefined,
      ]);
    case "procedure":
      return createStableKey([
        "dedupe",
        "procedure",
        object.procedureKey ?? normalizeLower(object.title),
        object.steps.map((step) => normalizeLower(step)).join("|"),
        object.scope?.projectScope ? normalizeLower(object.scope.projectScope) : undefined,
      ]);
    case "project_fact":
      return createStableKey([
        "dedupe",
        "project_fact",
        object.factFieldKey ?? normalizeLower(object.subject),
        normalizeLower(object.subject),
        normalizeLower(object.value),
        object.scope?.projectScope ? normalizeLower(object.scope.projectScope) : undefined,
      ]);
    case "routing":
      return createStableKey([
        "dedupe",
        "routing",
        normalizeLower(object.task),
        normalizeLower(object.primaryResource),
        object.companionResources?.map((entry) => normalizeLower(entry)).join("|"),
        object.scope?.projectScope ? normalizeLower(object.scope.projectScope) : undefined,
      ]);
  }
}

export function resolveMemoryProjectionCategory(
  object: MemorySemanticObject,
): MemoryProjectionCategory {
  switch (object.kind) {
    case "preference":
      return "response_style";
    case "correction":
      switch (object.correctionKind) {
        case "response_preference":
          return "response_style";
        case "project_rule":
          return "project_rule";
        case "missing_capability":
          return "unmet_need";
        case "workflow_guidance":
          return "workflow_improvement";
      }
    case "procedure":
      return "recurring_procedure";
    case "project_fact":
      return "project_fact";
    case "routing":
      return "reference_routing";
  }
}

/**
 * Deprecated compatibility-era alias.
 */
export const resolveMemoryCompatibilityProjectionCategory = resolveMemoryProjectionCategory;

/**
 * Deprecated alias while downstream packaging migrates away from document-lane naming.
 * This remains a projection-only label, not the semantic authority.
 */
export const resolveDocumentMemoryIngestionCategoryForSemanticObject =
  resolveMemoryProjectionCategory;

export function buildMemorySemanticObjectIdentity(
  object: MemorySemanticObject,
): MemorySemanticObjectIdentity {
  const canonicalClass = resolveCanonicalClass(object);
  const subject = resolveSubject(object);
  return {
    canonicalClass,
    canonicalKind: canonicalClass,
    scope: resolveScope(object),
    subject,
    statement: resolveStatement(object),
    subjectKey: resolveSubjectIdentityFragment(object),
    clusterKey: resolveClusterKey(object),
    dedupeKey: resolveDedupeKey(object),
  };
}
