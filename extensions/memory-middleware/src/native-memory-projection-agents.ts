import type { MemoryMiddlewareDb, MemoryObjectRecord } from "./db/runtime.js";
import type { NativeMemoryProjectionSkippedRecord } from "./native-memory-projection-audit.js";
import {
  NATIVE_MEMORY_PROJECTION_CHAR_BUDGETS,
  renderProjectionBody,
  syncProjectionFile,
  trimProjectionCandidatesToBudget,
  type NativeMemoryProjectionSyncResult,
} from "./native-memory-projection-compiler.js";
import {
  buildNativeMemoryProjectionCandidate,
  type NativeMemoryProjectionCandidate,
} from "./native-memory-projection-eligibility.js";
import {
  classifyAgentWorkspaceProjectionTargets,
  discoverSiblingAgentWorkspaceTargets,
  isSpecializedAgentProjectionAllowlisted,
  type AgentWorkspaceProjectionTarget,
} from "./native-memory-projection-routing.js";
import {
  isAgentProjectionScope,
  resolveNativeMemoryProjectionScope,
} from "./native-memory-projection-scope.js";

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

async function loadApprovedAgentProjectionRecords(params: {
  db: MemoryMiddlewareDb;
  limitPerKind: number;
}): Promise<MemoryObjectRecord[]> {
  const records: MemoryObjectRecord[] = [];
  for (const kind of ["user", "feedback"] as const) {
    const result = await params.db.queries.listMemoryObjects({
      scope: "approved_only",
      kind,
      limit: params.limitPerKind,
    });
    if (!result.accepted) {
      throw new Error(`agent native projection query failed for ${kind}: ${result.reason}`);
    }
    records.push(
      ...result.records.filter(
        (record): record is MemoryObjectRecord => record.objectType === "memory_object",
      ),
    );
  }
  return records;
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
  const records = await loadApprovedAgentProjectionRecords({
    db: params.db,
    limitPerKind: params.limitPerKind ?? 80,
  });

  for (const record of records) {
    const scope = resolveNativeMemoryProjectionScope(record);
    if (!isAgentProjectionScope(scope)) {
      skipped.push({
        sourceId: record.id,
        reason: "scope_filtered",
        scopeKind: scope.kind,
        ...(scope.agentKey ? { agentKey: scope.agentKey } : {}),
      });
      continue;
    }
    const agentKey = scope.agentKey;
    if (!agentKey) {
      skipped.push({
        sourceId: record.id,
        reason: "missing_agent_key",
        scopeKind: scope.kind,
      });
      continue;
    }
    const targetWorkspace = specializedTargets.get(agentKey);
    if (!targetWorkspace) {
      skipped.push({
        sourceId: record.id,
        reason: "no_specialized_agent_workspace_target",
        scopeKind: scope.kind,
        agentKey,
      });
      continue;
    }
    const candidate = buildNativeMemoryProjectionCandidate(record);
    if (
      !candidate ||
      (candidate.target !== "user-profile" && candidate.target !== "tool-preferences")
    ) {
      skipped.push({
        sourceId: record.id,
        reason: "ineligible_agent_projection_candidate",
        scopeKind: scope.kind,
        agentKey,
      });
      continue;
    }
    const group = groups.get(agentKey) ?? {
      target: targetWorkspace,
      candidatesByTarget: new Map<AgentProjectionTarget, NativeMemoryProjectionCandidate[]>(),
    };
    const bucket = group.candidatesByTarget.get(candidate.target) ?? [];
    bucket.push(candidate);
    group.candidatesByTarget.set(candidate.target, bucket);
    groups.set(agentKey, group);
  }

  const results: AgentProjectionCompilationResult[] = [];
  for (const group of [...groups.values()].toSorted((left, right) =>
    left.target.agentKey.localeCompare(right.target.agentKey),
  )) {
    for (const target of [
      "user-profile",
      "tool-preferences",
    ] as const satisfies AgentProjectionTarget[]) {
      const candidates = group.candidatesByTarget.get(target) ?? [];
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
