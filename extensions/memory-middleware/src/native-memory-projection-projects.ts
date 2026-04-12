import type { ActiveMemorySlot } from "./active-memory-slots.js";
import { loadActiveMemorySlots } from "./active-memory-slots.js";
import type { MemoryMiddlewareDb } from "./db/runtime.js";
import { buildNativeMemoryProjectionCandidatesFromActiveSlots } from "./native-memory-projection-active-slots.js";
import type { NativeMemoryProjectionSkippedRecord } from "./native-memory-projection-audit.js";
import {
  NATIVE_MEMORY_PROJECTION_CHAR_BUDGETS,
  renderProjectionBody,
  syncProjectionFile,
  trimProjectionCandidatesToBudget,
  type NativeMemoryProjectionSyncResult,
} from "./native-memory-projection-compiler.js";
import { type NativeMemoryProjectionCandidate } from "./native-memory-projection-eligibility.js";
import {
  discoverWorkspaceProjectProjectionTargets,
  type WorkspaceProjectProjectionTarget,
} from "./native-memory-projection-routing.js";
import { isEligibleForProjectProjection } from "./native-memory-projection-scope.js";

const PROJECT_PROJECTION_TITLE = "Compiled Project Memory";

export type ProjectProjectionCompilationResult = NativeMemoryProjectionSyncResult & {
  projectSlug: string;
  selectedCount: number;
  omittedCount: number;
  sourceCount: number;
  pointerLine: string;
  selectedSourceIds: string[];
  omittedSourceIds: string[];
};

type ProjectProjectionGroup = {
  target: WorkspaceProjectProjectionTarget;
  slots: ActiveMemorySlot[];
  candidates: NativeMemoryProjectionCandidate[];
};

function resolveProjectProjectionTargetFromSlot(
  slot: ActiveMemorySlot,
  targets: WorkspaceProjectProjectionTarget[],
): WorkspaceProjectProjectionTarget | null {
  const projectSlug = slot.projectSlug?.trim().toLowerCase();
  if (!projectSlug) {
    return null;
  }
  return targets.find((target) => target.slug.trim().toLowerCase() === projectSlug) ?? null;
}

export async function syncProjectLocalProjections(params: {
  db: MemoryMiddlewareDb;
  workspaceDir: string;
  write: boolean;
  limit?: number;
}): Promise<{
  results: ProjectProjectionCompilationResult[];
  pointerItems: string[];
  projectedSourceIds: Set<string>;
  unmatched: Array<{ sourceId: string; reason: string }>;
  skipped: NativeMemoryProjectionSkippedRecord[];
}> {
  const slots = await loadActiveMemorySlots({
    db: params.db,
    limitPerKind: params.limit ?? 120,
    includeProcedures: false,
  });
  const targets = await discoverWorkspaceProjectProjectionTargets(params.workspaceDir);
  const allWorkspaceTargets = await discoverWorkspaceProjectProjectionTargets(params.workspaceDir, {
    includeUnallowlisted: true,
  });
  const groups = new Map<string, ProjectProjectionGroup>(
    targets.map((target) => [
      target.slug,
      {
        target,
        slots: [],
        candidates: [],
      },
    ]),
  );
  const unmatched: Array<{ sourceId: string; reason: string }> = [];
  const skipped: NativeMemoryProjectionSkippedRecord[] = [];

  for (const slot of slots.filter((entry) => entry.sourceMemoryKind === "project")) {
    const scope = {
      kind: slot.scopeKind,
      projectScoped: slot.projectScoped,
      ...(slot.projectSlug ? { projectSlug: slot.projectSlug } : {}),
      ...(slot.agentKey ? { agentKey: slot.agentKey } : {}),
      ...(slot.sessionKey ? { sessionKey: slot.sessionKey } : {}),
    };
    if (!isEligibleForProjectProjection(scope)) {
      skipped.push({
        sourceId: slot.primarySourceId,
        reason: "scope_filtered",
        scopeKind: scope.kind,
        ...(scope.agentKey ? { agentKey: scope.agentKey } : {}),
      });
      continue;
    }

    const target = resolveProjectProjectionTargetFromSlot(slot, targets);
    if (!target) {
      const unallowlistedTarget = resolveProjectProjectionTargetFromSlot(slot, allWorkspaceTargets);
      unmatched.push({
        sourceId: slot.primarySourceId,
        reason: unallowlistedTarget
          ? "project_target_not_allowlisted"
          : "no_workspace_project_target",
      });
      continue;
    }

    const candidates = buildNativeMemoryProjectionCandidatesFromActiveSlots([slot]);
    if (candidates.length === 0) {
      unmatched.push({
        sourceId: slot.primarySourceId,
        reason: "ineligible_project_projection_candidate",
      });
      continue;
    }

    const existing = groups.get(target.slug) ?? {
      target,
      slots: [],
      candidates: [],
    };
    existing.slots.push(slot);
    existing.candidates.push(...candidates);
    groups.set(target.slug, existing);
  }

  const results: ProjectProjectionCompilationResult[] = [];
  const projectedSourceIds = new Set<string>();
  for (const group of [...groups.values()].toSorted((left, right) =>
    left.target.slug.localeCompare(right.target.slug),
  )) {
    const trimmed = trimProjectionCandidatesToBudget({
      candidates: group.candidates,
      maxChars: NATIVE_MEMORY_PROJECTION_CHAR_BUDGETS["project-memory-digest"],
    });
    const body = renderProjectionBody({
      title: PROJECT_PROJECTION_TITLE,
      items: trimmed.kept.map((candidate) => candidate.text),
      omittedCount: trimmed.omittedCount,
    });
    const sync = await syncProjectionFile({
      workspaceDir: params.workspaceDir,
      target: {
        target: "project-memory-digest",
        projectSlug: group.target.slug,
        projectFileName: group.target.projectionFileName,
      },
      body,
      write: params.write,
    });
    for (const candidate of trimmed.kept) {
      projectedSourceIds.add(candidate.sourceId);
    }
    results.push({
      ...sync,
      projectSlug: group.target.slug,
      selectedCount: trimmed.kept.length,
      omittedCount: trimmed.omittedCount,
      sourceCount: group.candidates.length,
      pointerLine: `Project ${group.target.slug}: see ${group.target.relProjectionPath}`,
      selectedSourceIds: trimmed.kept.map((candidate) => candidate.sourceId),
      omittedSourceIds: trimmed.omitted.map((candidate) => candidate.sourceId),
    });
  }

  return {
    results,
    pointerItems: results
      .filter((result) => result.sourceCount > 0)
      .map((result) => result.pointerLine),
    projectedSourceIds,
    unmatched,
    skipped,
  };
}
