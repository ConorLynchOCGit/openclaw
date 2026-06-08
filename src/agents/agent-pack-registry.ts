import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { resolveBootstrapRepoPath } from "./bootstrap-repo-paths.js";

export const AGENT_PACK_REGISTRY_RELATIVE_PATH = "docs/agents/registry.yaml";

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

export async function loadAgentPackRegistryEntries(): Promise<AgentPackRegistryEntry[]> {
  const registryPath = resolveBootstrapRepoPath({
    relativePath: AGENT_PACK_REGISTRY_RELATIVE_PATH,
    importMetaUrl: import.meta.url,
    cwd: process.cwd(),
  });
  const registrySourceRoot = path.dirname(path.dirname(path.dirname(registryPath)));
  const parsed = rawRecord(YAML.parse(await fs.readFile(registryPath, "utf8")));
  return rawList(parsed.agents)
    .map((entry): AgentPackRegistryEntry | null => {
      const id = optionalString(entry.id);
      if (!id) {
        return null;
      }
      return {
        id,
        classification: optionalString(entry.classification),
        runtimeSourcePath: optionalString(entry.runtimeSourcePath),
        sharedRuntimeSourcePath: optionalString(entry.sharedRuntimeSourcePath),
        projectRoot: optionalString(entry.projectRoot) ?? registrySourceRoot,
        requiredDocs: stringList(entry.requiredDocs).length
          ? stringList(entry.requiredDocs)
          : stringList(entry.docs),
        primarySkills: stringList(entry.primarySkills),
        allowedChildAgents: stringList(entry.allowedChildAgents),
        requiredTools: stringList(entry.requiredTools),
        forbiddenTools: stringList(entry.forbiddenTools),
      };
    })
    .filter((entry): entry is AgentPackRegistryEntry => Boolean(entry));
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
