import { createHash, randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export type MainRepoFileEntry = {
  fileRef: string;
  sha256: string | null;
  sizeBytes: number | null;
  state: "present" | "missing";
};

export type MainRepoHashManifest = {
  artifactKind: "main_repo_hash_manifest";
  manifestId: string;
  repoRoot: string;
  approvedScopeRefs: string[];
  fileCount: number;
  files: MainRepoFileEntry[];
  evidenceStatus: "accepted" | "evidence_failed";
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
};

export type MainRepoChangedFile = {
  fileRef: string;
  changeKind: "created" | "modified" | "deleted";
  beforeSha256: string | null;
  afterSha256: string | null;
  beforeSizeBytes: number | null;
  afterSizeBytes: number | null;
};

export type MainRepoChangeManifest = {
  artifactKind: "main_repo_change_manifest";
  changeManifestId: string;
  beforeManifestId: string;
  afterManifestId: string;
  changedFiles: MainRepoChangedFile[];
  diffHash: string;
  evidenceStatus: "accepted" | "evidence_failed";
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
};

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeRef(fileRef: string): string {
  return fileRef.replace(/\\/gu, "/").replace(/^\.\/+/u, "");
}

export function assertMainRepoRelativeSafe(fileRef: string): string {
  const normalized = normalizeRef(fileRef);
  if (!normalized || path.isAbsolute(normalized) || normalized.split("/").includes("..")) {
    throw new Error(`main_repo_unsafe_file_ref:${fileRef}`);
  }
  return normalized;
}

export function isMainRepoFileWithinScope(fileRef: string, scopeRef: string): boolean {
  const file = normalizeRef(fileRef);
  const scope = normalizeRef(scopeRef).replace(/\/$/u, "");
  return file === scope || file.startsWith(`${scope}/`);
}

async function walkFiles(root: string, relativeRoot = ""): Promise<string[]> {
  const absoluteRoot = path.join(root, relativeRoot);
  const entryStat = await stat(absoluteRoot).catch(() => null);
  if (!entryStat) {
    return [];
  }
  if (entryStat.isFile()) {
    return [normalizeRef(relativeRoot)];
  }
  if (!entryStat.isDirectory()) {
    return [];
  }
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(absoluteRoot, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const child = normalizeRef(path.join(relativeRoot, entry.name));
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(root, child)));
    } else if (entry.isFile()) {
      files.push(child);
    }
  }
  return files;
}

export async function createMainRepoHashManifest(input: {
  repoRoot: string;
  approvedScopeRefs: string[];
  manifestId?: string;
}): Promise<MainRepoHashManifest> {
  const scopes = input.approvedScopeRefs.map(assertMainRepoRelativeSafe);
  const files = new Set<string>();
  const reasonCodes: string[] = [];
  for (const scope of scopes) {
    const absolute = path.resolve(input.repoRoot, scope);
    const scopeStat = await stat(absolute).catch(() => null);
    if (!scopeStat) {
      files.add(scope);
    } else if (scopeStat.isFile()) {
      files.add(scope);
    } else if (scopeStat.isDirectory()) {
      for (const file of await walkFiles(input.repoRoot, scope)) {
        files.add(file);
      }
    }
  }
  const entries = await Promise.all(
    [...files].toSorted().map(async (fileRef): Promise<MainRepoFileEntry> => {
      const absolute = path.resolve(input.repoRoot, fileRef);
      const fileStat = await stat(absolute).catch(() => null);
      if (!fileStat?.isFile()) {
        return { fileRef, sha256: null, sizeBytes: null, state: "missing" };
      }
      try {
        const content = await readFile(absolute);
        return {
          fileRef,
          sha256: sha256(content),
          sizeBytes: fileStat.size,
          state: "present",
        };
      } catch {
        reasonCodes.push(`main_repo_file_evidence_unreadable:${fileRef}`);
        return { fileRef, sha256: null, sizeBytes: null, state: "missing" };
      }
    }),
  );
  return {
    artifactKind: "main_repo_hash_manifest",
    manifestId: input.manifestId ?? `main-repo-manifest-${randomUUID()}`,
    repoRoot: input.repoRoot,
    approvedScopeRefs: scopes,
    fileCount: entries.length,
    files: entries,
    evidenceStatus: reasonCodes.length === 0 ? "accepted" : "evidence_failed",
    reasonCodes: reasonCodes.length === 0 ? ["main_repo_hash_manifest_accepted"] : reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  };
}

export function diffMainRepoHashManifests(input: {
  before: MainRepoHashManifest;
  after: MainRepoHashManifest;
  changeManifestId?: string;
}): MainRepoChangeManifest {
  const beforeByFile = new Map(input.before.files.map((file) => [file.fileRef, file]));
  const afterByFile = new Map(input.after.files.map((file) => [file.fileRef, file]));
  const allFiles = [...new Set([...beforeByFile.keys(), ...afterByFile.keys()])].toSorted();
  const changedFiles: MainRepoChangedFile[] = [];
  for (const fileRef of allFiles) {
    const before = beforeByFile.get(fileRef) ?? {
      sha256: null,
      sizeBytes: null,
      state: "missing" as const,
    };
    const after = afterByFile.get(fileRef) ?? {
      sha256: null,
      sizeBytes: null,
      state: "missing" as const,
    };
    if (before.sha256 === after.sha256 && before.state === after.state) {
      continue;
    }
    changedFiles.push({
      fileRef,
      changeKind:
        before.state === "missing" ? "created" : after.state === "missing" ? "deleted" : "modified",
      beforeSha256: before.sha256,
      afterSha256: after.sha256,
      beforeSizeBytes: before.sizeBytes,
      afterSizeBytes: after.sizeBytes,
    });
  }
  const evidenceStatus =
    input.before.evidenceStatus === "accepted" && input.after.evidenceStatus === "accepted"
      ? "accepted"
      : "evidence_failed";
  const diffHash = sha256(
    changedFiles
      .map(
        (file) =>
          `${file.fileRef}:${file.changeKind}:${file.beforeSha256 ?? "null"}:${file.afterSha256 ?? "null"}`,
      )
      .join("\n"),
  );
  return {
    artifactKind: "main_repo_change_manifest",
    changeManifestId: input.changeManifestId ?? `main-repo-change-${randomUUID()}`,
    beforeManifestId: input.before.manifestId,
    afterManifestId: input.after.manifestId,
    changedFiles,
    diffHash,
    evidenceStatus,
    reasonCodes: [
      ...(changedFiles.length > 0
        ? ["main_repo_pre_post_hash_manifest_detected_changes"]
        : ["main_repo_pre_post_hash_manifest_no_changes"]),
      ...(evidenceStatus === "accepted" ? [] : ["main_repo_change_evidence_failed"]),
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  };
}
