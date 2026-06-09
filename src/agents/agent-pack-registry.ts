import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { resolveBootstrapRepoPath } from "./bootstrap-repo-paths.js";

export const AGENT_PACK_REGISTRY_RELATIVE_PATH = "docs/agents/registry.yaml";

export type AgentPackToolBudgetPolicy = {
  readDefaultLineLimit?: number;
  readMaxBytes?: number;
  discoveryDefaultMaxResults?: number;
  discoveryDefaultMaxMatches?: number;
  discoveryDefaultMaxFiles?: number;
};

export type AgentPackRegistryEntry = {
  id: string;
  classification?: string;
  runtimeSourcePath?: string;
  sharedRuntimeSourcePath?: string;
  projectRoot?: string;
  requiredDocs?: string[];
  primarySkills?: string[];
  allowedChildAgents?: string[];
  requiredTools?: string[];
  forbiddenTools?: string[];
  toolBudget?: AgentPackToolBudgetPolicy;
};

function rawRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function rawList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(rawRecord) : [];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map(optionalString)
        .filter((entry): entry is string => Boolean(entry))
        .filter((entry, index, entries) => entries.indexOf(entry) === index)
    : [];
}

function optionalPositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : undefined;
}

function toolBudgetFromRecord(value: unknown): AgentPackToolBudgetPolicy | undefined {
  const record = rawRecord(value);
  const budget: AgentPackToolBudgetPolicy = {
    readDefaultLineLimit: optionalPositiveInteger(record.readDefaultLineLimit),
    readMaxBytes: optionalPositiveInteger(record.readMaxBytes),
    discoveryDefaultMaxResults: optionalPositiveInteger(record.discoveryDefaultMaxResults),
    discoveryDefaultMaxMatches: optionalPositiveInteger(record.discoveryDefaultMaxMatches),
    discoveryDefaultMaxFiles: optionalPositiveInteger(record.discoveryDefaultMaxFiles),
  };
  return Object.values(budget).some((entry) => typeof entry === "number") ? budget : undefined;
}

function resolveAgentPackRegistryPath(): string {
  return resolveBootstrapRepoPath({
    relativePath: AGENT_PACK_REGISTRY_RELATIVE_PATH,
    importMetaUrl: import.meta.url,
    cwd: process.cwd(),
  });
}

function parseAgentPackRegistryEntries(input: {
  registryPath: string;
  source: string;
}): AgentPackRegistryEntry[] {
  const registrySourceRoot = path.dirname(path.dirname(path.dirname(input.registryPath)));
  const parsed = rawRecord(YAML.parse(input.source));
  return rawList(parsed.agents)
    .map((entry): AgentPackRegistryEntry | null => {
      const id = optionalString(entry.id);
      if (!id) {
        return null;
      }
      const requiredDocs = stringList(entry.requiredDocs);
      const toolBudget = toolBudgetFromRecord(entry.toolBudget);
      return {
        id,
        classification: optionalString(entry.classification),
        runtimeSourcePath: optionalString(entry.runtimeSourcePath),
        sharedRuntimeSourcePath: optionalString(entry.sharedRuntimeSourcePath),
        projectRoot: optionalString(entry.projectRoot) ?? registrySourceRoot,
        requiredDocs: requiredDocs.length ? requiredDocs : stringList(entry.docs),
        primarySkills: stringList(entry.primarySkills),
        allowedChildAgents: stringList(entry.allowedChildAgents),
        requiredTools: stringList(entry.requiredTools),
        forbiddenTools: stringList(entry.forbiddenTools),
        ...(toolBudget ? { toolBudget } : {}),
      };
    })
    .filter((entry): entry is AgentPackRegistryEntry => Boolean(entry));
}

export async function loadAgentPackRegistryEntries(): Promise<AgentPackRegistryEntry[]> {
  const registryPath = resolveAgentPackRegistryPath();
  return parseAgentPackRegistryEntries({
    registryPath,
    source: await fs.readFile(registryPath, "utf8"),
  });
}

export function loadAgentPackRegistryEntriesSync(): AgentPackRegistryEntry[] {
  const registryPath = resolveAgentPackRegistryPath();
  return parseAgentPackRegistryEntries({
    registryPath,
    source: readFileSync(registryPath, "utf8"),
  });
}

export function isExecutionPlatformAgentPackId(agentId: string): boolean {
  return agentId.trim().startsWith("execution-");
}

export function isExecutionPlatformAgentPackEntry(entry: AgentPackRegistryEntry): boolean {
  return (
    entry.classification === "execution_platform_agent" || isExecutionPlatformAgentPackId(entry.id)
  );
}

export function findExecutionPlatformAgentPackEntry(params: {
  entries: readonly AgentPackRegistryEntry[];
  agentId: string;
}): AgentPackRegistryEntry | undefined {
  const entry = findAgentPackRegistryEntry(params);
  return entry && isExecutionPlatformAgentPackEntry(entry) ? entry : undefined;
}

export function findAgentPackRegistryEntry(params: {
  entries: readonly AgentPackRegistryEntry[];
  agentId: string;
}): AgentPackRegistryEntry | undefined {
  const normalizedAgentId = params.agentId.trim();
  return params.entries.find((entry) => entry.id === normalizedAgentId);
}

export function resolveAgentPackRuntimeSourceRoot(params: {
  entry: AgentPackRegistryEntry;
  defaultProjectRoot: string;
}): string | null {
  const runtimeSourcePath = params.entry.runtimeSourcePath ?? params.entry.sharedRuntimeSourcePath;
  if (!runtimeSourcePath) {
    return null;
  }
  return path.resolve(
    path.isAbsolute(runtimeSourcePath)
      ? runtimeSourcePath
      : path.join(params.entry.projectRoot || params.defaultProjectRoot, runtimeSourcePath),
  );
}
