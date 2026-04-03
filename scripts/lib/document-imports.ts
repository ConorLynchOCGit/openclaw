import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export type DocumentImportConfigEntry = {
  id: string;
  sourceEnv: string;
  sourceType: "file" | "directory";
  workspacePath: string;
  mode: "bind-ro";
  readOnly: boolean;
};

export type DocumentImportConfig = {
  version: number;
  imports: DocumentImportConfigEntry[];
};

export type ResolvedDocumentImport = DocumentImportConfigEntry & {
  sourcePath: string;
  workspaceAbsolutePath: string;
  runtimeAbsolutePath: string;
};

export async function loadDocumentImportConfig(repoRoot: string): Promise<DocumentImportConfig> {
  const configPath = path.join(repoRoot, "config", "document-imports.json");
  const raw = await fs.readFile(configPath, "utf8");
  return JSON.parse(raw) as DocumentImportConfig;
}

export async function loadSimpleDotEnv(filePath: string): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const entries: Record<string, string> = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }
      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      entries[key] = value;
    }
    return entries;
  } catch {
    return {};
  }
}

export async function resolveDocumentImports(params: {
  repoRoot: string;
  workspaceRoot: string;
  env?: NodeJS.ProcessEnv;
}): Promise<ResolvedDocumentImport[]> {
  const config = await loadDocumentImportConfig(params.repoRoot);
  const dotEnv = await loadSimpleDotEnv(path.join(params.repoRoot, ".env"));
  const mergedEnv = {
    ...dotEnv,
    ...(params.env ?? process.env),
  };

  return config.imports.map((entry) => {
    const sourcePath = mergedEnv[entry.sourceEnv]?.trim();
    if (!sourcePath) {
      throw new Error(`Missing required env ${entry.sourceEnv} for document import ${entry.id}`);
    }
    return {
      ...entry,
      sourcePath: path.resolve(sourcePath),
      workspaceAbsolutePath: path.resolve(params.workspaceRoot, entry.workspacePath),
      runtimeAbsolutePath: path.posix.join(
        "/home/node/.openclaw/workspace",
        entry.workspacePath.replaceAll(path.sep, "/"),
      ),
    };
  });
}

export async function statImportPath(filePath: string) {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return {
        exists: false,
        type: "missing",
        size: 0,
        mtimeMs: 0,
        sha256: undefined as string | undefined,
      };
    }
    throw error;
  }
  const result = {
    exists: true,
    type: stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "other",
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    sha256: undefined as string | undefined,
  };
  if (stat.isFile()) {
    const buffer = await fs.readFile(filePath);
    result.sha256 = createHash("sha256").update(buffer).digest("hex");
  }
  return result;
}
