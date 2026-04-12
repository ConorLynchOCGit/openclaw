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
  classifyAgentWorkspaceProjectionTargets,
  discoverSiblingAgentWorkspaceTargets,
  isSpecializedAgentProjectionAllowlisted,
  type AgentWorkspaceProjectionTarget,
} from "./native-memory-projection-routing.js";

const AGENT_PROJECTION_TITLES = {
  "user-profile": "Compiled Agent User Memory",
  "tool-preferences": "Compiled Agent Tool Preferences",
} as const;

type AgentProjectionTarget = keyof typeof AGENT_PROJECTION_TITLES;

export type AgentProjectionCompilationResult = NativeMemoryProjectionSyncResult & {
  agentKey: string;
  workspaceKind: "specialized";
  selectedCount: number;
  omittedCount: number;
  sourceCount: number;
  selectedSourceIds: string[];
  omittedSourceIds: string[];
};

type AgentProjectionGroup = {
  target: AgentWorkspaceProjectionTarget & { kind: "specialized" };
  candidatesByTarget: Map<AgentProjectionTarget, NativeMemoryProjectionCandidate[]>;
};

function isAgentProjectionTarget(target: string): target is AgentProjectionTarget {
  return target === "user-profile" || target === "tool-preferences";
}

export async function syncAgentBootstrapProjections(params: {
  db: MemoryMiddlewareDb;
  sharedWorkspaceDir: string;
  write: boolean;
  limitPerKind?: number;
}): Promise<{
  results: AgentProjectionCompilationResult[];
  skipped: NativeMemoryProjectionSkippedRecord[];
  targets: AgentWorkspaceProjectionTarget[];
}> {
  const discoveredTargets = await discoverSiblingAgentWorkspaceTargets(params.sharedWorkspaceDir);
  const targets = await classifyAgentWorkspaceProjectionTargets({
    sharedWorkspaceDir: params.sharedWorkspaceDir,
    agentWorkspaces: discoveredTargets,
  });
  const specializedTargets = new Map(
    targets
      .filter(
        (target): target is AgentWorkspaceProjectionTarget & { kind: "specialized" } =>
          target.kind === "specialized" && isSpecializedAgentProjectionAllowlisted(target.agentKey),
      )
      .map((target) => [target.agentKey, target] as const),
  );

  const skipped: NativeMemoryProjectionSkippedRecord[] = [];
  const groups = new Map<string, AgentProjectionGroup>(
    [...specializedTargets.entries()].map(([agentKey, target]) => [
      agentKey,
      {
        target,
        candidatesByTarget: new Map<AgentProjectionTarget, NativeMemoryProjectionCandidate[]>(),
      },
    ]),
  );
  const slots = await loadActiveMemorySlots({
    db: params.db,
    limitPerKind: params.limitPerKind ?? 80,
    includeProcedures: false,
  });
  const sharedBaselineSlots = slots.filter(
    (entry) =>
      (entry.sourceMemoryKind === "user" || entry.sourceMemoryKind === "feedback") &&
      entry.scopeKind === "shared" &&
      entry.projectionTargets.some((target) => isAgentProjectionTarget(target)),
  );

  for (const slot of slots.filter(
    (entry) =>
      (entry.sourceMemoryKind === "user" || entry.sourceMemoryKind === "feedback") &&
      entry.scopeKind === "agent",
  )) {
    const agentKey = slot.agentKey;
    if (!agentKey) {
      skipped.push({
        sourceId: slot.primarySourceId,
        reason: "missing_agent_key",
        scopeKind: slot.scopeKind,
      });
      continue;
    }
    const targetWorkspace = specializedTargets.get(agentKey);
    if (!targetWorkspace) {
      skipped.push({
        sourceId: slot.primarySourceId,
        reason: "no_specialized_agent_workspace_target",
        scopeKind: slot.scopeKind,
        agentKey,
      });
      continue;
    }
    const group = groups.get(agentKey) ?? {
      target: targetWorkspace,
      candidatesByTarget: new Map<AgentProjectionTarget, NativeMemoryProjectionCandidate[]>(),
    };
    const slotCandidates = buildNativeMemoryProjectionCandidatesFromActiveSlots([slot]).filter(
      (
        candidate,
      ): candidate is NativeMemoryProjectionCandidate & {
        target: AgentProjectionTarget;
      } => isAgentProjectionTarget(candidate.target),
    );
    if (slotCandidates.length === 0) {
      skipped.push({
        sourceId: slot.primarySourceId,
        reason: "ineligible_agent_projection_candidate",
        scopeKind: slot.scopeKind,
        agentKey,
      });
      continue;
    }
    for (const candidate of slotCandidates) {
      const bucket = group.candidatesByTarget.get(candidate.target) ?? [];
      bucket.push(candidate);
      group.candidatesByTarget.set(candidate.target, bucket);
    }
    groups.set(agentKey, group);
  }

  const results: AgentProjectionCompilationResult[] = [];
  for (const group of [...groups.values()].toSorted((left, right) =>
    left.target.agentKey.localeCompare(right.target.agentKey),
  )) {
    const inheritedCandidates = buildNativeMemoryProjectionCandidatesFromActiveSlots(
      sharedBaselineSlots,
    ).filter(
      (
        candidate,
      ): candidate is NativeMemoryProjectionCandidate & {
        target: AgentProjectionTarget;
      } => isAgentProjectionTarget(candidate.target),
    );
    for (const target of [
      "user-profile",
      "tool-preferences",
    ] as const satisfies AgentProjectionTarget[]) {
      const candidates = [
        ...inheritedCandidates.filter((candidate) => candidate.target === target),
        ...(group.candidatesByTarget.get(target) ?? []),
      ].toSorted(
        (left, right) =>
          right.priority - left.priority ||
          Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
          left.sourceId.localeCompare(right.sourceId),
      );
      const trimmed = trimProjectionCandidatesToBudget({
        candidates,
        maxChars: NATIVE_MEMORY_PROJECTION_CHAR_BUDGETS[target],
      });
      const body = renderProjectionBody({
        title: AGENT_PROJECTION_TITLES[target],
        items: trimmed.kept.map((candidate) => candidate.text),
        omittedCount: trimmed.omittedCount,
      });
      const sync = await syncProjectionFile({
        workspaceDir: group.target.workspaceDir,
        target: { target },
        body,
        write: params.write,
      });
      results.push({
        ...sync,
        agentKey: group.target.agentKey,
        workspaceKind: group.target.kind,
        selectedCount: trimmed.kept.length,
        omittedCount: trimmed.omittedCount,
        sourceCount: candidates.length,
        selectedSourceIds: trimmed.kept.map((candidate) => candidate.sourceId),
        omittedSourceIds: trimmed.omitted.map((candidate) => candidate.sourceId),
      });
    }
  }

  return {
    results,
    skipped,
    targets,
  };
}
