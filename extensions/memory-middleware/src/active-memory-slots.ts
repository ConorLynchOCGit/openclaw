import type {
  MemoryMiddlewareDb,
  MemoryObjectKind,
  MemoryObjectRecord,
  ProcedureObjectRecord,
  RetrievedMemoryRecord,
} from "./db/runtime.js";
import {
  readCanonicalMemoryIngestionCandidateFromMetadata,
  readCanonicalMemoryRecordFromMetadata,
} from "./memory-canonical-compat.js";
import {
  buildActiveMemorySlotSemanticKey,
  buildActiveMemorySlotSelectionKey,
  buildCategorizedActiveMemorySlotKey,
  type ActiveMemorySlotCategory,
  type ActiveMemorySlotScopeKind,
  normalizeActiveMemorySlotAgentKey,
  resolveActiveMemorySlotCategoryFromMemoryKind,
} from "./memory-slot-model.js";
import type { SharedBootstrapProjectionTarget } from "./native-memory-projection-eligibility.js";
import { resolveNativeMemoryProjectionScope } from "./native-memory-projection-scope.js";

export type { ActiveMemorySlotCategory, ActiveMemorySlotScopeKind } from "./memory-slot-model.js";

export type ActiveMemorySlot = {
  slotKey: string;
  semanticKey: string;
  primarySourceId: string;
  sourceIds: string[];
  sourceObjectType: "memory_object" | "procedure";
  sourceMemoryKind: MemoryObjectKind | "procedure";
  category: ActiveMemorySlotCategory;
  scopeKind: ActiveMemorySlotScopeKind;
  projectScoped: boolean;
  projectSlug?: string;
  agentKey?: string;
  sessionKey?: string;
  subject?: string;
  statement: string;
  displayText: string;
  promptText: string;
  searchText: string;
  selectionKey: string;
  tags: string[];
  facets: Record<string, unknown>;
  updatedAt: string;
  confidence: number;
  projectionTargets: SharedBootstrapProjectionTarget[];
};

function asArray<T>(value: Iterable<T>): T[] {
  return Array.from(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sanitizeSlotText(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const collapsed = value
    .replace(/\r\n/g, "\n")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^[#>*-]+\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return collapsed.length > 0 ? collapsed : null;
}

function buildDisplayText(params: {
  subject?: string;
  statement?: string;
  fallback: string;
}): string | null {
  const subject = sanitizeSlotText(params.subject);
  const statement = sanitizeSlotText(params.statement);
  if (subject && statement && subject.toLowerCase() !== statement.toLowerCase()) {
    return `${subject}: ${statement}`;
  }
  return statement ?? subject ?? sanitizeSlotText(params.fallback);
}

function buildSearchText(parts: Array<string | undefined>): string {
  return parts
    .flatMap((part) => (typeof part === "string" ? [part] : []))
    .map((part) => sanitizeSlotText(part))
    .filter((part): part is string => part !== null)
    .join(" ");
}

function readStringFacet(facets: Record<string, unknown>, key: string): string | undefined {
  const value = facets[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readTrueFacetKeys(facets: Record<string, unknown>): string[] {
  return Object.entries(facets)
    .filter(([, value]) => value === true)
    .map(([key]) => key);
}

function collectFacetText(facets: Record<string, unknown>): string[] {
  const values: string[] = [];
  for (const [key, value] of Object.entries(facets)) {
    if (typeof value === "string" && value.trim().length > 0) {
      values.push(value.trim());
      continue;
    }
    if (value === true) {
      values.push(key);
    }
  }
  return values;
}

function resolveProcedurePreview(record: ProcedureObjectRecord): string {
  const title = sanitizeSlotText(record.title);
  const body = sanitizeSlotText(record.body);
  if (title && body) {
    return `${title}: ${body}`;
  }
  return title ?? body ?? "Validated reusable procedure";
}

function resolveSlotCategory(record: RetrievedMemoryRecord): ActiveMemorySlotCategory {
  if (record.objectType === "procedure") {
    return "procedure";
  }

  const canonical = readCanonicalMemoryRecordFromMetadata(record.metadata);
  return resolveActiveMemorySlotCategoryFromMemoryKind({
    memoryKind: record.memoryKind,
    tags: canonical?.tags ?? [],
  });
}

function resolveProjectionTargets(params: {
  category: ActiveMemorySlotCategory;
  sourceMemoryKind: MemoryObjectKind | "procedure";
}): SharedBootstrapProjectionTarget[] {
  switch (params.category) {
    case "user_preference":
    case "user_correction":
      return ["user-profile"];
    case "tool_preference":
      return ["tool-preferences"];
    case "project_fact":
    case "project_rule":
    case "unmet_need":
      return ["memory-digest"];
    case "workflow_guidance":
      return params.sourceMemoryKind === "feedback" ? ["tool-preferences"] : ["memory-digest"];
    case "procedure":
    case "reference":
      return [];
  }
}

function resolveConfidence(params: {
  category: ActiveMemorySlotCategory;
  updatedAt: string;
}): number {
  const base =
    params.category === "user_correction"
      ? 0.98
      : params.category === "project_rule" || params.category === "workflow_guidance"
        ? 0.94
        : params.category === "user_preference"
          ? 0.92
          : params.category === "project_fact"
            ? 0.9
            : params.category === "unmet_need"
              ? 0.86
              : params.category === "procedure"
                ? 0.84
                : 0.8;
  const ageDays = Math.max(0, Math.floor((Date.now() - Date.parse(params.updatedAt)) / 86_400_000));
  return Math.max(0.5, base - Math.min(0.2, ageDays * 0.003));
}

function buildPromptText(params: {
  category: ActiveMemorySlotCategory;
  subject?: string;
  statement?: string;
  facets: Record<string, unknown>;
  fallback: string;
}): string | null {
  const subject = sanitizeSlotText(params.subject);
  const statement = sanitizeSlotText(params.statement);
  const fallback = sanitizeSlotText(params.fallback);
  const fieldKey = readStringFacet(params.facets, "fieldKey");
  const guidancePattern = readStringFacet(params.facets, "guidancePattern");
  const recommendedAction = readStringFacet(params.facets, "recommendedAction");
  const avoidAction = readStringFacet(params.facets, "avoidAction");

  if (params.category === "workflow_guidance") {
    if (guidancePattern === "use_instead_of" && subject && recommendedAction && avoidAction) {
      return `For ${subject}, use ${recommendedAction} instead of ${avoidAction}.`;
    }
    if (guidancePattern === "trust_for_scope" && subject && recommendedAction && avoidAction) {
      return `For ${subject}, trust ${recommendedAction}; ${avoidAction} is only a narrower signal.`;
    }
    if (guidancePattern === "avoid_only" && subject && avoidAction) {
      return `For ${subject}, avoid ${avoidAction}.`;
    }
    if (subject && recommendedAction) {
      return `For ${subject}, use ${recommendedAction}.`;
    }
  }

  if (params.category === "unmet_need") {
    if (subject && statement) {
      return `Unmet need for ${subject}: ${statement}`;
    }
    return statement ?? fallback;
  }

  if (params.category === "project_rule") {
    if (fieldKey === "default_branch" && statement) {
      return `Default branch is ${statement}.`;
    }
    if (fieldKey === "staging_branch" && statement) {
      return `Staging branch is ${statement}.`;
    }
    if (subject && statement) {
      return `${subject}: ${statement}`;
    }
    return statement ?? fallback;
  }

  if (params.category === "user_preference" || params.category === "user_correction") {
    if (subject === "response style" || subject === "response requirement") {
      return statement ?? fallback;
    }
    if (statement) {
      return statement;
    }
    return fallback;
  }

  if (params.category === "tool_preference") {
    if (statement) {
      return `Tooling preference: ${statement}`;
    }
    return fallback;
  }

  if (params.category === "project_fact") {
    if (subject && statement) {
      return `${subject}: ${statement}`;
    }
    return statement ?? fallback;
  }

  return buildDisplayText({
    subject: subject ?? undefined,
    statement: statement ?? undefined,
    fallback: fallback ?? "",
  });
}

function buildSlotFromRecord(record: RetrievedMemoryRecord): ActiveMemorySlot | null {
  if (record.objectType === "memory_object") {
    if (record.reviewState !== "approved" || record.readSurface !== "approved_memory_view") {
      return null;
    }
    const canonical = readCanonicalMemoryRecordFromMetadata(record.metadata);
    const candidate = readCanonicalMemoryIngestionCandidateFromMetadata(record.metadata);
    const projectionScope = resolveNativeMemoryProjectionScope(record);
    const category = resolveSlotCategory(record);
    const facets = asRecord(canonical?.facets);
    const displayText = buildDisplayText({
      subject: canonical?.subject,
      statement: canonical?.statement,
      fallback: record.content,
    });
    if (!displayText) {
      return null;
    }
    const subject = sanitizeSlotText(canonical?.subject ?? undefined) ?? undefined;
    const statement =
      sanitizeSlotText(canonical?.statement ?? undefined) ??
      sanitizeSlotText(record.content) ??
      displayText;
    const promptText =
      buildPromptText({
        category,
        subject,
        statement,
        facets,
        fallback: record.content,
      }) ?? displayText;
    const subjectKey =
      readStringFacet(facets, "subjectKey") ?? candidate?.identity.subjectKey ?? undefined;
    const fieldKey = readStringFacet(facets, "fieldKey");
    const guidancePattern = readStringFacet(facets, "guidancePattern");
    const toolKey = readStringFacet(facets, "toolKey");
    const tags = canonical?.tags ?? [];
    return {
      semanticKey: buildActiveMemorySlotSemanticKey({
        scopeKind: projectionScope.kind,
        projectSlug: projectionScope.projectSlug,
        agentKey: normalizeActiveMemorySlotAgentKey(projectionScope.agentKey),
        sessionKey: projectionScope.sessionKey,
        dedupeKey: candidate?.identity.dedupeKey,
        clusterKey: candidate?.identity.clusterKey,
        subjectKey: candidate?.identity.subjectKey,
        subject,
        statement,
        fallbackText: record.content,
      }),
      slotKey: buildCategorizedActiveMemorySlotKey({
        category,
        scopeKind: projectionScope.kind,
        projectSlug: projectionScope.projectSlug,
        agentKey: normalizeActiveMemorySlotAgentKey(projectionScope.agentKey),
        sessionKey: projectionScope.sessionKey,
        dedupeKey: candidate?.identity.dedupeKey,
        clusterKey: candidate?.identity.clusterKey,
        subjectKey: candidate?.identity.subjectKey,
        subject,
        statement,
        fallbackText: record.content,
      }),
      primarySourceId: record.id,
      sourceIds: [record.id],
      sourceObjectType: "memory_object",
      sourceMemoryKind: record.memoryKind,
      category,
      scopeKind: projectionScope.kind,
      projectScoped: projectionScope.projectScoped,
      ...(projectionScope.projectSlug ? { projectSlug: projectionScope.projectSlug } : {}),
      ...(projectionScope.agentKey ? { agentKey: projectionScope.agentKey } : {}),
      ...(projectionScope.sessionKey ? { sessionKey: projectionScope.sessionKey } : {}),
      ...(subject ? { subject } : {}),
      statement,
      displayText,
      promptText,
      searchText: buildSearchText([
        subject,
        statement,
        promptText,
        projectionScope.projectSlug,
        projectionScope.agentKey,
        ...tags,
        ...collectFacetText(facets),
        ...readTrueFacetKeys(facets),
      ]),
      selectionKey: buildActiveMemorySlotSelectionKey({
        category,
        scopeKind: projectionScope.kind,
        projectSlug: projectionScope.projectSlug,
        agentKey: normalizeActiveMemorySlotAgentKey(projectionScope.agentKey),
        sessionKey: projectionScope.sessionKey,
        subjectKey,
        fieldKey,
        guidancePattern,
        toolKey,
        subject,
        statement: promptText,
        fallbackText: record.content,
      }),
      tags,
      facets,
      updatedAt: record.updatedAt,
      confidence: resolveConfidence({ category, updatedAt: record.updatedAt }),
      projectionTargets: resolveProjectionTargets({
        category,
        sourceMemoryKind: record.memoryKind,
      }),
    };
  }

  const displayText = resolveProcedurePreview(record);
  const statement = sanitizeSlotText(record.body) ?? displayText;
  const promptText = statement;
  return {
    semanticKey: buildActiveMemorySlotSemanticKey({
      scopeKind: record.projectId ? "project" : "shared",
      projectSlug: record.projectId ?? undefined,
      subject: record.title,
      statement,
      fallbackText: displayText,
    }),
    slotKey: buildCategorizedActiveMemorySlotKey({
      category: "procedure",
      scopeKind: record.projectId ? "project" : "shared",
      projectSlug: record.projectId ?? undefined,
      subject: record.title,
      statement,
      fallbackText: displayText,
    }),
    primarySourceId: record.id,
    sourceIds: [record.id],
    sourceObjectType: "procedure",
    sourceMemoryKind: "procedure",
    category: "procedure",
    scopeKind: record.projectId ? "project" : "shared",
    projectScoped: Boolean(record.projectId),
    ...(record.projectId ? { projectSlug: record.projectId } : {}),
    ...(sanitizeSlotText(record.title)
      ? { subject: sanitizeSlotText(record.title) ?? undefined }
      : {}),
    statement,
    displayText,
    promptText,
    searchText: buildSearchText([record.title, record.body, promptText, record.projectId]),
    selectionKey: buildActiveMemorySlotSelectionKey({
      category: "procedure",
      scopeKind: record.projectId ? "project" : "shared",
      projectSlug: record.projectId ?? undefined,
      subject: record.title,
      statement: promptText,
      fallbackText: displayText,
    }),
    tags: ["procedure"],
    facets: {},
    updatedAt: record.updatedAt,
    confidence: resolveConfidence({ category: "procedure", updatedAt: record.updatedAt }),
    projectionTargets: resolveProjectionTargets({
      category: "procedure",
      sourceMemoryKind: "procedure",
    }),
  };
}

function compareSlotPriority(left: ActiveMemorySlot, right: ActiveMemorySlot): number {
  return (
    Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
    right.confidence - left.confidence ||
    left.primarySourceId.localeCompare(right.primarySourceId)
  );
}

export function buildActiveMemorySlots(records: RetrievedMemoryRecord[]): ActiveMemorySlot[] {
  const grouped = new Map<string, ActiveMemorySlot>();

  for (const record of records) {
    const slot = buildSlotFromRecord(record);
    if (!slot) {
      continue;
    }
    const existing = grouped.get(slot.slotKey);
    if (!existing) {
      grouped.set(slot.slotKey, slot);
      continue;
    }
    const winner = compareSlotPriority(existing, slot) > 0 ? slot : existing;
    const mergedSourceIds = new Set([...existing.sourceIds, ...slot.sourceIds]);
    grouped.set(slot.slotKey, {
      ...winner,
      sourceIds: asArray(mergedSourceIds).sort((left, right) => left.localeCompare(right)),
    });
  }

  return [...grouped.values()].toSorted(
    (left, right) => compareSlotPriority(left, right) || left.slotKey.localeCompare(right.slotKey),
  );
}

async function listApprovedRecordsByKind(params: {
  db: MemoryMiddlewareDb;
  kind: MemoryObjectKind;
  limit: number;
}): Promise<MemoryObjectRecord[]> {
  const result = await params.db.queries.listMemoryObjects({
    scope: "approved_only",
    kind: params.kind,
    limit: params.limit,
  });
  if (!result.accepted) {
    throw new Error(`active memory slot query failed for ${params.kind}: ${result.reason}`);
  }
  return result.records.filter(
    (record): record is MemoryObjectRecord => record.objectType === "memory_object",
  );
}

async function listValidatedProcedures(params: {
  db: MemoryMiddlewareDb;
  limit: number;
}): Promise<ProcedureObjectRecord[]> {
  const result = await params.db.queries.listMemoryObjects({
    scope: "include_validated_procedures",
    kind: "procedure",
    limit: params.limit,
  });
  if (!result.accepted) {
    throw new Error(`active memory slot query failed for procedure: ${result.reason}`);
  }
  return result.records.filter(
    (record): record is ProcedureObjectRecord => record.objectType === "procedure",
  );
}

export async function loadActiveMemorySlots(params: {
  db: MemoryMiddlewareDb;
  limitPerKind?: number;
  includeProcedures?: boolean;
}): Promise<ActiveMemorySlot[]> {
  const limitPerKind = params.limitPerKind ?? 120;
  const records: RetrievedMemoryRecord[] = [];

  for (const kind of ["user", "feedback", "project"] as const satisfies MemoryObjectKind[]) {
    records.push(
      ...(await listApprovedRecordsByKind({
        db: params.db,
        kind,
        limit: limitPerKind,
      })),
    );
  }

  if (params.includeProcedures) {
    records.push(
      ...(await listValidatedProcedures({
        db: params.db,
        limit: Math.max(20, Math.floor(limitPerKind / 2)),
      })),
    );
  }

  return buildActiveMemorySlots(records);
}
