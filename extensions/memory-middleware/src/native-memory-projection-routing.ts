import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { MemoryObjectRecord } from "./db/runtime.js";
import {
  readCanonicalFirstMetadataString,
  readCanonicalMemoryRecordFromMetadata,
} from "./memory-canonical-compat.js";

export type WorkspaceProjectProjectionTarget = {
  slug: string;
  relDir: string;
  absDir: string;
};

export type AgentWorkspaceProjectionTarget = {
  agentKey: string;
  workspaceDir: string;
  kind: "shared" | "generic" | "specialized";
};

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizePathForComparison(value: string): string {
  return path.resolve(value).replace(/\\/g, "/").toLowerCase();
}

function addCandidateLabel(labels: Set<string>, value: string | undefined): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    return;
  }
  const normalized = normalizeKey(value);
  if (normalized.length > 0) {
    labels.add(normalized);
    labels.add(normalized.replaceAll("_", ""));
  }
}

function extractBracketScopeLabel(content: string | undefined): string | undefined {
  if (typeof content !== "string") {
    return undefined;
  }
  const match = content.match(/\[([^\]]+)\]/u);
  return match?.[1]?.trim();
}

export async function discoverWorkspaceProjectProjectionTargets(
  workspaceDir: string,
): Promise<WorkspaceProjectProjectionTarget[]> {
  const projectsDir = path.join(workspaceDir, "projects");
  let entries: Dirent<string>[];
  try {
    entries = await fs.readdir(projectsDir, { withFileTypes: true, encoding: "utf8" });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      slug: entry.name,
      relDir: `projects/${entry.name}`,
      absDir: path.join(projectsDir, entry.name),
    }))
    .sort((left, right) => left.slug.localeCompare(right.slug));
}

export async function discoverSiblingAgentWorkspaceTargets(
  sharedWorkspaceDir: string,
): Promise<Array<{ agentKey: string; workspaceDir: string }>> {
  const agentWorkspacesDir = path.join(path.dirname(sharedWorkspaceDir), "agent-workspaces");
  let entries: Dirent<string>[];
  try {
    entries = await fs.readdir(agentWorkspacesDir, { withFileTypes: true, encoding: "utf8" });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      agentKey: entry.name,
      workspaceDir: path.join(agentWorkspacesDir, entry.name),
    }))
    .sort((left, right) => left.agentKey.localeCompare(right.agentKey));
}

export function resolveProjectProjectionTarget(
  record: MemoryObjectRecord,
  targets: WorkspaceProjectProjectionTarget[],
): WorkspaceProjectProjectionTarget | null {
  if (targets.length === 0) {
    return null;
  }

  const canonical = readCanonicalMemoryRecordFromMetadata(record.metadata);
  const labels = new Set<string>();
  addCandidateLabel(
    labels,
    readCanonicalFirstMetadataString(record.metadata, [
      "candidateMetadata",
      "autoCapture",
      "projectScope",
    ]),
  );
  addCandidateLabel(
    labels,
    readCanonicalFirstMetadataString(record.metadata, [
      "promotionMetadata",
      "autoPromotion",
      "projectScope",
    ]),
  );
  addCandidateLabel(
    labels,
    readCanonicalFirstMetadataString(record.metadata, ["autoCapture", "projectScope"]),
  );
  addCandidateLabel(
    labels,
    readCanonicalFirstMetadataString(record.metadata, ["autoPromotion", "projectScope"]),
  );
  if (typeof canonical?.facets.projectScope === "string") {
    addCandidateLabel(labels, canonical.facets.projectScope);
  }
  addCandidateLabel(labels, canonical?.subject?.split("/")[0]);
  addCandidateLabel(labels, extractBracketScopeLabel(record.content));

  if (labels.size === 0) {
    return null;
  }

  for (const target of targets) {
    const targetLabel = normalizeKey(target.slug);
    if (labels.has(targetLabel) || labels.has(targetLabel.replaceAll("_", ""))) {
      return target;
    }
  }
  return null;
}

export function resolveProjectionAgentKey(record: MemoryObjectRecord): string | undefined {
  const direct =
    readCanonicalFirstMetadataString(record.metadata, [
      "candidateMetadata",
      "autoCapture",
      "agentExternalKey",
    ]) ??
    readCanonicalFirstMetadataString(record.metadata, [
      "promotionMetadata",
      "autoPromotion",
      "agentExternalKey",
    ]) ??
    readCanonicalFirstMetadataString(record.metadata, ["autoCapture", "agentExternalKey"]) ??
    readCanonicalFirstMetadataString(record.metadata, ["autoPromotion", "agentExternalKey"]);
  if (direct) {
    return direct.trim();
  }

  const sessionKey =
    readCanonicalFirstMetadataString(record.metadata, [
      "candidateMetadata",
      "autoCapture",
      "sessionKey",
    ]) ??
    readCanonicalFirstMetadataString(record.metadata, [
      "promotionMetadata",
      "autoPromotion",
      "sessionKey",
    ]) ??
    readCanonicalFirstMetadataString(record.metadata, ["autoCapture", "sessionKey"]) ??
    readCanonicalFirstMetadataString(record.metadata, ["autoPromotion", "sessionKey"]);
  const sessionAgentMatch = sessionKey?.match(/^agent:([^:]+):/u);
  return sessionAgentMatch?.[1]?.trim();
}

export async function classifyAgentWorkspaceProjectionTargets(params: {
  sharedWorkspaceDir: string;
  agentWorkspaces: Array<{ agentKey: string; workspaceDir: string }>;
}): Promise<AgentWorkspaceProjectionTarget[]> {
  const sharedWorkspaceNormalized = normalizePathForComparison(params.sharedWorkspaceDir);
  const results: AgentWorkspaceProjectionTarget[] = [];

  for (const entry of params.agentWorkspaces) {
    const workspaceNormalized = normalizePathForComparison(entry.workspaceDir);
    if (workspaceNormalized === sharedWorkspaceNormalized) {
      results.push({
        agentKey: entry.agentKey,
        workspaceDir: entry.workspaceDir,
        kind: "shared",
      });
      continue;
    }

    let agentsText = "";
    try {
      agentsText = await fs.readFile(path.join(entry.workspaceDir, "AGENTS.md"), "utf-8");
    } catch {}
    const generic =
      agentsText.startsWith("# AGENTS.md - Your Workspace") ||
      agentsText.startsWith("# AGENTS.md - Your Workspace\r\n");
    results.push({
      agentKey: entry.agentKey,
      workspaceDir: entry.workspaceDir,
      kind: generic ? "generic" : "specialized",
    });
  }

  return results.sort((left, right) => left.agentKey.localeCompare(right.agentKey));
}
