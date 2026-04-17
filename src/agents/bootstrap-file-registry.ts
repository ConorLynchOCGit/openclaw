import fs from "node:fs/promises";
import YAML from "yaml";
import { resolveBootstrapRepoPath } from "./bootstrap-repo-paths.js";

export type BootstrapFileRegistryEntry = {
  id: string;
  runtimePath: string;
  structuralMode: string;
  currentOwnership: string;
  targetOwnership: string;
  projectionMode: string;
  seedMode: string;
  seedTiming: string;
  canonicalSourceClass: string[];
};

type BootstrapFileRegistryDocument = {
  version: number;
  fileClasses: BootstrapFileRegistryEntry[];
};

let cachedRegistry: BootstrapFileRegistryDocument | null = null;

function resolveRegistryPath() {
  return resolveBootstrapRepoPath({
    relativePath: "docs/system/registries/bootstrap-files.yaml",
    importMetaUrl: import.meta.url,
    cwd: process.cwd(),
  });
}

export async function loadBootstrapFileRegistry(): Promise<BootstrapFileRegistryDocument> {
  if (cachedRegistry) {
    return cachedRegistry;
  }

  const raw = await fs.readFile(resolveRegistryPath(), "utf8");
  const parsed = YAML.parse(raw) as Partial<BootstrapFileRegistryDocument> | null;
  if (!parsed || !Array.isArray(parsed.fileClasses) || parsed.fileClasses.length === 0) {
    throw new Error("bootstrap file registry is missing fileClasses");
  }

  const invalidEntry = parsed.fileClasses.find(
    (entry) =>
      !entry ||
      typeof entry.id !== "string" ||
      typeof entry.runtimePath !== "string" ||
      typeof entry.structuralMode !== "string" ||
      typeof entry.currentOwnership !== "string" ||
      typeof entry.targetOwnership !== "string" ||
      typeof entry.projectionMode !== "string" ||
      typeof entry.seedMode !== "string" ||
      typeof entry.seedTiming !== "string" ||
      !Array.isArray(entry.canonicalSourceClass),
  );
  if (invalidEntry) {
    throw new Error(`bootstrap file registry entry is invalid: ${JSON.stringify(invalidEntry)}`);
  }

  cachedRegistry = {
    version: typeof parsed.version === "number" ? parsed.version : 1,
    fileClasses: parsed.fileClasses,
  };
  return cachedRegistry;
}

export async function listConcreteBootstrapFileRegistryEntries(): Promise<
  BootstrapFileRegistryEntry[]
> {
  const registry = await loadBootstrapFileRegistry();
  return registry.fileClasses.filter((entry) => !entry.runtimePath.includes("*"));
}

export async function findBootstrapFileRegistryEntryByRuntimePath(
  runtimePath: string,
): Promise<BootstrapFileRegistryEntry | undefined> {
  const entries = await listConcreteBootstrapFileRegistryEntries();
  return entries.find((entry) => entry.runtimePath === runtimePath);
}
