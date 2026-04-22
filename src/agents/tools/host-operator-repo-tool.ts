import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam, ToolAuthorizationError, ToolInputError } from "./common.js";

type HostOperatorAction = "status" | "list" | "read" | "edit" | "exec";
type HostOperatorScope = "live_repo" | "operator_workspace";

type HostOperatorSettings = {
  enabled: boolean;
  writeEnabled: boolean;
  execEnabled: boolean;
  repoRoot: string;
  canonicalRepoRoot: string;
  productImportRoot: string;
  workspaceRoot: string;
  canonicalWorkspaceRoot: string;
  auditDir: string;
};

type HostOperatorResolvedTarget = {
  scope: HostOperatorScope;
  root: string;
  canonicalRoot: string;
  target: string;
  relativePath: string;
};

type EditReplacement = {
  oldText: string;
  newText: string;
};

const DEFAULT_REPO_ROOT = "/home/node/.openclaw/host-operator/openclaw-live";
const DEFAULT_CANONICAL_REPO_ROOT = "/root/services/openclaw-roles/live";
const DEFAULT_PRODUCT_IMPORT_ROOT = "/home/node/.openclaw/workspace/imports/product_live/content";
const DEFAULT_WORKSPACE_ROOT = "/home/node/.openclaw/workspace";
const DEFAULT_CANONICAL_WORKSPACE_ROOT = "/root/.openclaw/workspace";
const DEFAULT_AUDIT_DIR = "/home/node/.openclaw/workspace/.openclaw/host-operator-audit";
const MAX_READ_BYTES = 200_000;
const MAX_LIST_ENTRIES = 200;
const MAX_EXEC_OUTPUT_BYTES = 120_000;
const WORKSPACE_BLOCKED_READ_PREFIXES = [
  ".git",
  ".openclaw",
  "system/hostfs",
  "imports/runtime_state",
  "state",
  "checkpoints",
  "audits",
];
const WORKSPACE_ALLOWED_WRITE_PREFIXES = ["core", "docs", "projects", "runbooks", "memory"];
const WORKSPACE_ALLOWED_WRITE_FILES = new Set([
  "AGENTS.md",
  "HEARTBEAT.md",
  "IDENTITY.md",
  "TOOLS.md",
]);
const WORKSPACE_PROTECTED_WRITE_FILES = new Set([
  "USER.md",
  "MEMORY.md",
  "SOUL.md",
  "BOOTSTRAP.md",
]);

const HostOperatorRepoToolSchema = Type.Object({
  action: Type.Union([
    Type.Literal("status"),
    Type.Literal("list"),
    Type.Literal("read"),
    Type.Literal("edit"),
    Type.Literal("exec"),
  ]),
  scope: Type.Optional(Type.Union([Type.Literal("live_repo"), Type.Literal("operator_workspace")])),
  path: Type.Optional(Type.String()),
  edits: Type.Optional(
    Type.Array(
      Type.Object({
        oldText: Type.String(),
        newText: Type.String(),
      }),
    ),
  ),
  command: Type.Optional(Type.Array(Type.String())),
});

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function normalizePath(value: string): string {
  return path.posix.normalize(value.replace(/\\/g, "/"));
}

function normalizeRelativePath(value: string): string {
  const normalized = normalizePath(value);
  return normalized === "" ? "." : normalized;
}

function pathWithin(candidate: string, root: string): boolean {
  const normalizedCandidate = normalizePath(candidate);
  const normalizedRoot = normalizePath(root);
  return (
    normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}/`)
  );
}

function relativeTo(root: string, candidate: string): string {
  return normalizePath(path.posix.relative(normalizePath(root), normalizePath(candidate)));
}

function pathMatchesPrefix(relativePath: string, prefix: string): boolean {
  const normalized = normalizeRelativePath(relativePath);
  const normalizedPrefix = normalizeRelativePath(prefix);
  return normalized === normalizedPrefix || normalized.startsWith(`${normalizedPrefix}/`);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function resolveSettings(env: NodeJS.ProcessEnv): HostOperatorSettings {
  return {
    enabled: readBoolean(env.OPENCLAW_HOST_OPERATOR_ENABLED) ?? false,
    writeEnabled: readBoolean(env.OPENCLAW_HOST_OPERATOR_WRITE_ENABLED) ?? false,
    execEnabled: readBoolean(env.OPENCLAW_HOST_OPERATOR_EXEC_ENABLED) ?? false,
    repoRoot: normalizePath(env.OPENCLAW_HOST_OPERATOR_REPO_ROOT ?? DEFAULT_REPO_ROOT),
    canonicalRepoRoot: normalizePath(
      env.OPENCLAW_HOST_OPERATOR_CANONICAL_REPO_ROOT ?? DEFAULT_CANONICAL_REPO_ROOT,
    ),
    productImportRoot: normalizePath(
      env.OPENCLAW_HOST_OPERATOR_PRODUCT_IMPORT_ROOT ?? DEFAULT_PRODUCT_IMPORT_ROOT,
    ),
    workspaceRoot: normalizePath(
      env.OPENCLAW_HOST_OPERATOR_WORKSPACE_ROOT ?? DEFAULT_WORKSPACE_ROOT,
    ),
    canonicalWorkspaceRoot: normalizePath(
      env.OPENCLAW_HOST_OPERATOR_CANONICAL_WORKSPACE_ROOT ?? DEFAULT_CANONICAL_WORKSPACE_ROOT,
    ),
    auditDir: normalizePath(env.OPENCLAW_HOST_OPERATOR_AUDIT_DIR ?? DEFAULT_AUDIT_DIR),
  };
}

function readScope(value: unknown): HostOperatorScope | undefined {
  if (value === "live_repo" || value === "operator_workspace") {
    return value;
  }
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  throw new ToolInputError("unsupported host-operator scope");
}

function resolveScopedPath(
  requested: string | undefined,
  settings: HostOperatorSettings,
  scope: HostOperatorScope | undefined,
): HostOperatorResolvedTarget {
  const value = requested?.trim() || ".";
  const normalized = normalizePath(value);

  const resolveForRoot = (
    resolvedScope: HostOperatorScope,
    root: string,
    canonicalRoot: string,
    relativePath: string,
  ): HostOperatorResolvedTarget => {
    const resolved = normalizePath(path.posix.join(root, relativePath));
    if (!pathWithin(resolved, root)) {
      throw new ToolAuthorizationError("path escapes the scoped host-operator root");
    }
    return {
      scope: resolvedScope,
      root,
      canonicalRoot,
      target: resolved,
      relativePath: relativeTo(root, resolved),
    };
  };

  if (path.posix.isAbsolute(normalized)) {
    if (scope === "live_repo" || scope === undefined) {
      if (pathWithin(normalized, settings.repoRoot)) {
        return resolveForRoot(
          "live_repo",
          settings.repoRoot,
          settings.canonicalRepoRoot,
          relativeTo(settings.repoRoot, normalized),
        );
      }
      if (pathWithin(normalized, settings.canonicalRepoRoot)) {
        return resolveForRoot(
          "live_repo",
          settings.repoRoot,
          settings.canonicalRepoRoot,
          relativeTo(settings.canonicalRepoRoot, normalized),
        );
      }
      if (pathWithin(normalized, settings.productImportRoot)) {
        return resolveForRoot(
          "live_repo",
          settings.repoRoot,
          settings.canonicalRepoRoot,
          relativeTo(settings.productImportRoot, normalized),
        );
      }
    }
    if (scope === "operator_workspace" || scope === undefined) {
      if (pathWithin(normalized, settings.workspaceRoot)) {
        return resolveForRoot(
          "operator_workspace",
          settings.workspaceRoot,
          settings.canonicalWorkspaceRoot,
          relativeTo(settings.workspaceRoot, normalized),
        );
      }
      if (pathWithin(normalized, settings.canonicalWorkspaceRoot)) {
        return resolveForRoot(
          "operator_workspace",
          settings.workspaceRoot,
          settings.canonicalWorkspaceRoot,
          relativeTo(settings.canonicalWorkspaceRoot, normalized),
        );
      }
    }
    throw new ToolAuthorizationError("path is outside the scoped host-operator roots");
  }

  const effectiveScope = scope ?? "live_repo";
  if (effectiveScope === "operator_workspace") {
    return resolveForRoot(
      "operator_workspace",
      settings.workspaceRoot,
      settings.canonicalWorkspaceRoot,
      normalized,
    );
  }
  return resolveForRoot("live_repo", settings.repoRoot, settings.canonicalRepoRoot, normalized);
}

function assertWorkspaceReadAllowed(relativePath: string) {
  if (WORKSPACE_BLOCKED_READ_PREFIXES.some((prefix) => pathMatchesPrefix(relativePath, prefix))) {
    throw new ToolAuthorizationError("workspace path is not approved for host-operator reads");
  }
}

function assertWorkspaceWriteAllowed(relativePath: string) {
  const normalized = normalizeRelativePath(relativePath);
  if (WORKSPACE_PROTECTED_WRITE_FILES.has(normalized)) {
    throw new ToolAuthorizationError("workspace path is protected from host-operator edits");
  }
  if (WORKSPACE_ALLOWED_WRITE_FILES.has(normalized)) {
    return;
  }
  if (WORKSPACE_ALLOWED_WRITE_PREFIXES.some((prefix) => pathMatchesPrefix(normalized, prefix))) {
    return;
  }
  throw new ToolAuthorizationError("workspace path is not approved for host-operator edits");
}

function readAction(params: Record<string, unknown>): HostOperatorAction {
  const action = readStringParam(params, "action", { required: true, label: "action" });
  if (
    action === "status" ||
    action === "list" ||
    action === "read" ||
    action === "edit" ||
    action === "exec"
  ) {
    return action;
  }
  throw new ToolInputError("unsupported host-operator action");
}

function readEdits(value: unknown): EditReplacement[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.oldText !== "string" || typeof record.newText !== "string") {
      return [];
    }
    if (!record.oldText) {
      return [];
    }
    return [{ oldText: record.oldText, newText: record.newText }];
  });
}

function readCommand(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
    .map((entry) => entry.trim());
}

function isAllowedExecCommand(command: string[]): boolean {
  const [bin, ...args] = command;
  if (!bin) {
    return false;
  }
  if (bin === "git") {
    const sub = args[0];
    return (
      sub === "status" || sub === "diff" || sub === "log" || sub === "remote" || sub === "show"
    );
  }
  if (bin === "rg") {
    return !args.some((arg) => arg === "-0" || arg === "--null-data");
  }
  if (bin === "pnpm") {
    const sub = args[0];
    return sub === "tsgo" || sub === "build" || (sub === "vitest" && args[1] === "run");
  }
  return bin === "pwd" || bin === "ls";
}

async function writeAudit(settings: HostOperatorSettings, event: Record<string, unknown>) {
  await fs.mkdir(settings.auditDir, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const auditPath = path.posix.join(settings.auditDir, `${day}.jsonl`);
  await fs.appendFile(auditPath, `${JSON.stringify(event)}\n`, { encoding: "utf-8" });
  return auditPath;
}

async function runExec(
  command: string[],
  cwd: string,
): Promise<{ output: string; exitCode: number | null }> {
  return await new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    const collect = (chunk: Buffer) => {
      const current = Buffer.concat(chunks).byteLength;
      if (current < MAX_EXEC_OUTPUT_BYTES) {
        chunks.push(chunk);
      }
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("close", (exitCode) => {
      const output = Buffer.concat(chunks).toString("utf-8").slice(0, MAX_EXEC_OUTPUT_BYTES);
      resolve({ output, exitCode });
    });
  });
}

export function createHostOperatorRepoTool(opts?: {
  env?: NodeJS.ProcessEnv;
  now?: () => number;
}): AnyAgentTool {
  const env = opts?.env ?? process.env;
  const now = opts?.now ?? Date.now;
  return {
    name: "host_operator_repo",
    label: "Host operator repo",
    ownerOnly: true,
    displaySummary: "Scoped host-operator access to OpenClaw canonical paths.",
    description:
      "Read, list, edit, or run allowlisted commands in scoped OpenClaw canonical paths when host-operator kill switches are enabled. Emits an audit record for every call.",
    parameters: HostOperatorRepoToolSchema,
    execute: async (_callId, rawParams) => {
      const params = rawParams && typeof rawParams === "object" ? rawParams : {};
      const record = params as Record<string, unknown>;
      const settings = resolveSettings(env);
      const action = readAction(record);
      const auditId = randomUUID();
      const observedAt = new Date(now()).toISOString();

      if (!settings.enabled && action !== "status") {
        throw new ToolAuthorizationError("host-operator mode is disabled");
      }

      const resolved = resolveScopedPath(
        readStringParam(record, "path", { required: false, label: "path" }),
        settings,
        readScope(record.scope),
      );
      const auditBase = {
        audit_id: auditId,
        observed_at: observedAt,
        action,
        scope: resolved.scope,
        root: resolved.root,
        canonical_root: resolved.canonicalRoot,
        relative_path: resolved.relativePath,
        path_hash: sha256(resolved.target),
        raw_content_persisted: false,
      };

      if (action === "status") {
        const repoStat = await fs.stat(settings.repoRoot).catch(() => null);
        const workspaceStat = await fs.stat(settings.workspaceRoot).catch(() => null);
        const auditPath = await writeAudit(settings, {
          ...auditBase,
          enabled: settings.enabled,
          write_enabled: settings.writeEnabled,
          exec_enabled: settings.execEnabled,
        });
        return jsonResult({
          auditId,
          auditPath,
          enabled: settings.enabled,
          writeEnabled: settings.writeEnabled,
          execEnabled: settings.execEnabled,
          repoRoot: settings.repoRoot,
          canonicalRepoRoot: settings.canonicalRepoRoot,
          workspaceRoot: settings.workspaceRoot,
          canonicalWorkspaceRoot: settings.canonicalWorkspaceRoot,
          mounted: Boolean(repoStat?.isDirectory()),
          roots: [
            {
              scope: "live_repo",
              root: settings.repoRoot,
              canonicalRoot: settings.canonicalRepoRoot,
              mounted: Boolean(repoStat?.isDirectory()),
              writeScope: "repo-confined when write kill switch is enabled",
              execScope: "allowlisted commands when exec kill switch is enabled",
            },
            {
              scope: "operator_workspace",
              root: settings.workspaceRoot,
              canonicalRoot: settings.canonicalWorkspaceRoot,
              mounted: Boolean(workspaceStat?.isDirectory()),
              writeScope: "core/docs/projects/runbooks/memory plus selected operational files",
              execScope: "disabled",
            },
          ],
        });
      }

      if (action === "list") {
        if (resolved.scope === "operator_workspace") {
          assertWorkspaceReadAllowed(resolved.relativePath);
        }
        const entries = (await fs.readdir(resolved.target, { withFileTypes: true })).slice(
          0,
          MAX_LIST_ENTRIES,
        );
        const auditPath = await writeAudit(settings, {
          ...auditBase,
          entry_count: entries.length,
        });
        return jsonResult({
          auditId,
          auditPath,
          scope: resolved.scope,
          path: resolved.target,
          canonicalPath: normalizePath(
            path.posix.join(resolved.canonicalRoot, resolved.relativePath),
          ),
          entries: entries.map((entry) => ({
            name: entry.name,
            kind: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
          })),
        });
      }

      if (action === "read") {
        if (resolved.scope === "operator_workspace") {
          assertWorkspaceReadAllowed(resolved.relativePath);
        }
        const handle = await fs.open(resolved.target, "r");
        try {
          const buffer = Buffer.alloc(MAX_READ_BYTES);
          const read = await handle.read(buffer, 0, MAX_READ_BYTES, 0);
          const auditPath = await writeAudit(settings, {
            ...auditBase,
            bytes_returned: read.bytesRead,
          });
          return jsonResult({
            auditId,
            auditPath,
            scope: resolved.scope,
            path: resolved.target,
            canonicalPath: normalizePath(
              path.posix.join(resolved.canonicalRoot, resolved.relativePath),
            ),
            truncated: read.bytesRead === MAX_READ_BYTES,
            content: buffer.subarray(0, read.bytesRead).toString("utf-8"),
          });
        } finally {
          await handle.close();
        }
      }

      if (action === "edit") {
        if (!settings.writeEnabled) {
          throw new ToolAuthorizationError("host-operator writes are disabled");
        }
        if (resolved.scope === "operator_workspace") {
          assertWorkspaceWriteAllowed(resolved.relativePath);
        }
        const edits = readEdits(record.edits);
        if (edits.length === 0) {
          throw new ToolInputError("edits required");
        }
        let content = await fs.readFile(resolved.target, "utf-8");
        for (const edit of edits) {
          if (!content.includes(edit.oldText)) {
            throw new ToolInputError("edit oldText not found");
          }
          content = content.replace(edit.oldText, edit.newText);
        }
        await fs.writeFile(resolved.target, content, "utf-8");
        const auditPath = await writeAudit(settings, {
          ...auditBase,
          edit_count: edits.length,
        });
        return jsonResult({
          auditId,
          auditPath,
          scope: resolved.scope,
          path: resolved.target,
          canonicalPath: normalizePath(
            path.posix.join(resolved.canonicalRoot, resolved.relativePath),
          ),
          edited: true,
          editCount: edits.length,
        });
      }

      if (resolved.scope !== "live_repo") {
        throw new ToolAuthorizationError("host-operator exec is allowed only in live_repo scope");
      }
      if (!settings.execEnabled) {
        throw new ToolAuthorizationError("host-operator exec is disabled");
      }
      const command = readCommand(record.command);
      if (!isAllowedExecCommand(command)) {
        throw new ToolAuthorizationError("command is not allowed for host-operator exec");
      }
      const result = await runExec(command, settings.repoRoot);
      const auditPath = await writeAudit(settings, {
        ...auditBase,
        command: command.slice(0, 4),
        exit_code: result.exitCode,
        output_hash: sha256(result.output),
      });
      return jsonResult({
        auditId,
        auditPath,
        command,
        exitCode: result.exitCode,
        output: result.output,
      });
    },
  };
}
