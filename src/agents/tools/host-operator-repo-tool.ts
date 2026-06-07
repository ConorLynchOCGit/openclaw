import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Type } from "@sinclair/typebox";
import { resolveOpenClawPathRoots } from "../workspace-topology-resolver.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam, ToolAuthorizationError, ToolInputError } from "./common.js";

type HostOperatorAction =
  | "status"
  | "list"
  | "read"
  | "edit"
  | "mkdir"
  | "create_file"
  | "write_file_if_hash_matches"
  | "copy_from_workspace"
  | "move_from_workspace"
  | "install_skill"
  | "delete_empty_probe_file"
  | "delete_if_hash_matches"
  | "exec";
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

type HostOperatorFileInput = {
  path: string;
  content: string;
};

const MAX_READ_BYTES = 200_000;
const MAX_WRITE_BYTES = 200_000;
const MAX_COPY_FILE_BYTES = 200_000;
const MAX_COPY_TOTAL_BYTES = 1_000_000;
const MAX_COPY_FILES = 100;
const MAX_SKILL_FILE_COUNT = 25;
const MAX_LIST_ENTRIES = 200;
const MAX_EXEC_OUTPUT_BYTES = 120_000;
const LIVE_REPO_ALLOWED_WRITE_PREFIXES = [
  "docs/agents",
  "docs/projects",
  ".agents/skills",
  "skills",
];
const LIVE_REPO_BLOCKED_WRITE_PREFIXES = [
  ".git",
  ".openclaw",
  ".artifacts",
  ".openclaw-memory-ops",
  "node_modules",
  "dist",
  "coverage",
  "state",
  "checkpoints",
  "audits",
  "imports",
  "system",
  "credentials",
  "secrets",
];
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
    Type.Literal("mkdir"),
    Type.Literal("create_file"),
    Type.Literal("write_file_if_hash_matches"),
    Type.Literal("copy_from_workspace"),
    Type.Literal("move_from_workspace"),
    Type.Literal("install_skill"),
    Type.Literal("delete_empty_probe_file"),
    Type.Literal("delete_if_hash_matches"),
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
  content: Type.Optional(Type.String()),
  expectedHash: Type.Optional(Type.String()),
  sourcePath: Type.Optional(Type.String()),
  overwrite: Type.Optional(Type.Boolean()),
  validateOnly: Type.Optional(Type.Boolean()),
  skillName: Type.Optional(Type.String()),
  files: Type.Optional(
    Type.Array(
      Type.Object({
        path: Type.String(),
        content: Type.String(),
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

function sha256Buffer(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function resolveSettings(env: NodeJS.ProcessEnv): HostOperatorSettings {
  const roots = resolveOpenClawPathRoots({
    liveRepoRoot: env.OPENCLAW_HOST_OPERATOR_CANONICAL_REPO_ROOT,
    workspaceRoot: env.OPENCLAW_HOST_OPERATOR_CANONICAL_WORKSPACE_ROOT,
  });
  const canonicalRepoRoot = normalizePath(
    env.OPENCLAW_HOST_OPERATOR_CANONICAL_REPO_ROOT ?? roots.liveRepoRoot,
  );
  const canonicalWorkspaceRoot = normalizePath(
    env.OPENCLAW_HOST_OPERATOR_CANONICAL_WORKSPACE_ROOT ?? roots.workspaceRoot,
  );
  const repoRoot = normalizePath(env.OPENCLAW_HOST_OPERATOR_REPO_ROOT ?? canonicalRepoRoot);
  const workspaceRoot = normalizePath(
    env.OPENCLAW_HOST_OPERATOR_WORKSPACE_ROOT ?? canonicalWorkspaceRoot,
  );
  return {
    enabled: readBoolean(env.OPENCLAW_HOST_OPERATOR_ENABLED) ?? false,
    writeEnabled: readBoolean(env.OPENCLAW_HOST_OPERATOR_WRITE_ENABLED) ?? false,
    execEnabled: readBoolean(env.OPENCLAW_HOST_OPERATOR_EXEC_ENABLED) ?? false,
    repoRoot,
    canonicalRepoRoot,
    productImportRoot: normalizePath(
      env.OPENCLAW_HOST_OPERATOR_PRODUCT_IMPORT_ROOT ??
        path.posix.join(canonicalWorkspaceRoot, "imports/product_live/content"),
    ),
    workspaceRoot,
    canonicalWorkspaceRoot,
    auditDir: normalizePath(
      env.OPENCLAW_HOST_OPERATOR_AUDIT_DIR ??
        path.posix.join(canonicalWorkspaceRoot, ".openclaw/host-operator-audit"),
    ),
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

function assertLiveRepoWriteAllowed(relativePath: string) {
  const normalized = normalizeRelativePath(relativePath);
  if (normalized === "." || normalized === "") {
    throw new ToolAuthorizationError("live repo root is not approved for host-operator edits");
  }
  if (/^\.env(?:$|\.)/u.test(normalized) || normalized.includes("/.env")) {
    throw new ToolAuthorizationError(
      "live repo env files are not approved for host-operator edits",
    );
  }
  if (LIVE_REPO_BLOCKED_WRITE_PREFIXES.some((prefix) => pathMatchesPrefix(normalized, prefix))) {
    throw new ToolAuthorizationError("live repo path is blocked from host-operator edits");
  }
  if (LIVE_REPO_ALLOWED_WRITE_PREFIXES.some((prefix) => pathMatchesPrefix(normalized, prefix))) {
    return;
  }
  throw new ToolAuthorizationError("live repo path is not approved for host-operator edits");
}

function assertWriteAllowed(resolved: HostOperatorResolvedTarget) {
  if (resolved.scope === "operator_workspace") {
    assertWorkspaceWriteAllowed(resolved.relativePath);
    return;
  }
  assertLiveRepoWriteAllowed(resolved.relativePath);
}

function readAction(params: Record<string, unknown>): HostOperatorAction {
  const action = readStringParam(params, "action", { required: true, label: "action" });
  if (
    action === "status" ||
    action === "list" ||
    action === "read" ||
    action === "edit" ||
    action === "mkdir" ||
    action === "create_file" ||
    action === "write_file_if_hash_matches" ||
    action === "copy_from_workspace" ||
    action === "move_from_workspace" ||
    action === "install_skill" ||
    action === "delete_empty_probe_file" ||
    action === "delete_if_hash_matches" ||
    action === "exec"
  ) {
    return action;
  }
  throw new ToolInputError("unsupported host-operator action");
}

function readBooleanParam(value: unknown): boolean {
  return value === true || value === "true" || value === "1";
}

function readContentParam(record: Record<string, unknown>, label = "content"): string {
  const raw = record.content;
  if (typeof raw !== "string" || raw.length === 0) {
    throw new ToolInputError(`${label} required`);
  }
  const content = raw;
  assertSafeWriteContent(content);
  return content;
}

function readExpectedHash(record: Record<string, unknown>, required = true): string | null {
  const expectedHash = readStringParam(record, "expectedHash", {
    required,
    label: "expectedHash",
  });
  if (!expectedHash) {
    return null;
  }
  if (!/^[a-f0-9]{64}$/u.test(expectedHash)) {
    throw new ToolInputError("expectedHash must be a sha256 hex digest");
  }
  return expectedHash;
}

function assertSafeWriteContent(content: string) {
  if (Buffer.byteLength(content, "utf-8") > MAX_WRITE_BYTES) {
    throw new ToolInputError("content exceeds host-operator write size limit");
  }
  const secretPatterns = [
    /\bsk-[A-Za-z0-9_-]{20,}\b/u,
    /\bsk-or-v1-[A-Za-z0-9_-]{20,}\b/u,
    /\bghp_[A-Za-z0-9]{20,}\b/u,
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/u,
    /\bAKIA[0-9A-Z]{16}\b/u,
    /\bBEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY\b/u,
  ];
  if (secretPatterns.some((pattern) => pattern.test(content))) {
    throw new ToolInputError("content appears to contain a secret");
  }
  if (/BEGIN (?:RAW )?(?:TRANSCRIPT|TOOL LOG)/iu.test(content)) {
    throw new ToolInputError("content appears to contain raw transcript or tool-log data");
  }
}

function readSkillName(record: Record<string, unknown>): string {
  const skillName = readStringParam(record, "skillName", {
    required: true,
    label: "skillName",
  }).toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(skillName)) {
    throw new ToolInputError("skillName must be a slug of lowercase letters, digits, and hyphens");
  }
  return skillName;
}

function readSkillFrontmatterName(content: string): string | undefined {
  if (!content.startsWith("---\n")) {
    return undefined;
  }
  const end = content.indexOf("\n---", 4);
  if (end < 0) {
    return undefined;
  }
  const frontmatter = content.slice(4, end);
  const match = /^name:\s*["']?([A-Za-z0-9-]+)["']?\s*$/imu.exec(frontmatter);
  return match?.[1]?.toLowerCase();
}

function readSkillFiles(
  record: Record<string, unknown>,
  skillName: string,
): HostOperatorFileInput[] {
  const extraFiles = Array.isArray(record.files) ? record.files : [];
  const primaryFile = extraFiles.find(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      typeof (entry as Record<string, unknown>).path === "string" &&
      normalizeRelativePath((entry as Record<string, unknown>).path as string) === "SKILL.md" &&
      typeof (entry as Record<string, unknown>).content === "string",
  ) as Record<string, unknown> | undefined;
  const content =
    typeof record.content === "string" && record.content.length > 0
      ? readContentParam(record)
      : typeof primaryFile?.content === "string"
        ? primaryFile.content
        : undefined;
  if (!content) {
    throw new ToolInputError(
      'install_skill requires top-level content or files[{path:"SKILL.md",content}]. Example: {action:"install_skill",scope:"live_repo",skillName:"my-skill",content:"---\\nname: my-skill\\ndescription: ...\\n---\\n# My Skill\\n"}',
    );
  }
  assertSafeWriteContent(content);
  const frontmatterName = readSkillFrontmatterName(content);
  if (frontmatterName !== skillName) {
    throw new ToolInputError(
      `skill SKILL.md frontmatter name must match skillName "${skillName}" (received ${frontmatterName ?? "missing"})`,
    );
  }
  const files: HostOperatorFileInput[] = [{ path: "SKILL.md", content }];
  for (const entry of extraFiles) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const candidate = entry as Record<string, unknown>;
    if (typeof candidate.path !== "string" || typeof candidate.content !== "string") {
      continue;
    }
    const relativePath = normalizeRelativePath(candidate.path);
    if (relativePath === "SKILL.md") {
      continue;
    }
    if (
      relativePath === "." ||
      path.posix.isAbsolute(relativePath) ||
      relativePath.startsWith("../") ||
      relativePath.includes("/../") ||
      relativePath === "SKILL.md"
    ) {
      throw new ToolAuthorizationError("skill support file path is not approved");
    }
    assertSafeWriteContent(candidate.content);
    files.push({ path: relativePath, content: candidate.content });
  }
  if (files.length > MAX_SKILL_FILE_COUNT) {
    throw new ToolInputError("too many skill files");
  }
  return files;
}

async function assertHashMatches(filePath: string, expectedHash: string) {
  const content = await fs.readFile(filePath);
  const actual = sha256Buffer(content);
  if (actual !== expectedHash) {
    throw new ToolInputError("expectedHash does not match current file content");
  }
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

async function collectCopyEntries(sourcePath: string, targetPath: string) {
  const sourceStat = await fs.lstat(sourcePath);
  if (sourceStat.isSymbolicLink()) {
    throw new ToolAuthorizationError("symlink copy is not allowed");
  }
  if (sourceStat.isFile()) {
    if (sourceStat.size > MAX_COPY_FILE_BYTES || sourceStat.size > MAX_COPY_TOTAL_BYTES) {
      throw new ToolInputError("source file exceeds host-operator copy size limit");
    }
    return [{ source: sourcePath, target: targetPath, size: sourceStat.size }];
  }
  if (!sourceStat.isDirectory()) {
    throw new ToolAuthorizationError("source path is not a file or directory");
  }
  const entries: Array<{ source: string; target: string; size: number }> = [];
  let totalBytes = 0;
  async function walk(currentSource: string, currentTarget: string) {
    const children = await fs.readdir(currentSource, { withFileTypes: true });
    for (const child of children) {
      const childSource = path.posix.join(currentSource, child.name);
      const childTarget = path.posix.join(currentTarget, child.name);
      if (child.isSymbolicLink()) {
        throw new ToolAuthorizationError("symlink copy is not allowed");
      }
      if (child.isDirectory()) {
        await walk(childSource, childTarget);
        continue;
      }
      if (!child.isFile()) {
        continue;
      }
      const stat = await fs.stat(childSource);
      if (stat.size > MAX_COPY_FILE_BYTES) {
        throw new ToolInputError("source file exceeds host-operator copy size limit");
      }
      totalBytes += stat.size;
      if (entries.length >= MAX_COPY_FILES || totalBytes > MAX_COPY_TOTAL_BYTES) {
        throw new ToolInputError("source copy exceeds host-operator copy limits");
      }
      entries.push({ source: childSource, target: childTarget, size: stat.size });
    }
  }
  await walk(sourcePath, targetPath);
  return entries;
}

async function copyEntries(
  entries: Array<{ source: string; target: string; size: number }>,
  overwrite: boolean,
) {
  for (const entry of entries) {
    const existing = await fs.lstat(entry.target).catch(() => null);
    if (existing && !overwrite) {
      throw new ToolInputError("target exists; set overwrite=true to replace");
    }
    if (existing?.isDirectory()) {
      throw new ToolInputError("target path is an existing directory");
    }
  }
  for (const entry of entries) {
    const content = await fs.readFile(entry.source, "utf-8");
    assertSafeWriteContent(content);
    await fs.mkdir(path.posix.dirname(entry.target), { recursive: true });
    await fs.writeFile(entry.target, content, "utf-8");
  }
}

function resolveWorkspaceSourcePath(
  record: Record<string, unknown>,
  settings: HostOperatorSettings,
) {
  const sourcePath = readStringParam(record, "sourcePath", {
    required: true,
    label: "sourcePath",
  });
  const source = resolveScopedPath(sourcePath, settings, "operator_workspace");
  assertWorkspaceReadAllowed(source.relativePath);
  assertWorkspaceWriteAllowed(source.relativePath);
  return source;
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
      'Read, list, edit, install skills, or run allowlisted commands in scoped OpenClaw canonical paths when host-operator kill switches are enabled. install_skill accepts {action:"install_skill",scope:"live_repo",skillName:"my-skill",content:"---\\nname: my-skill\\ndescription: ...\\n---\\n# My Skill\\n"} or files[{path:"SKILL.md",content}]. Emits an audit record for every call.',
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
        const repoWritable = await fs
          .access(settings.repoRoot, fsConstants.W_OK)
          .then(() => true)
          .catch(() => false);
        const docsAgentsWritable = await fs
          .access(path.posix.join(settings.repoRoot, "docs/agents"), fsConstants.W_OK)
          .then(() => true)
          .catch(() => false);
        const skillsWritable = await fs
          .access(path.posix.join(settings.repoRoot, ".agents/skills"), fsConstants.W_OK)
          .then(() => true)
          .catch(() => false);
        const auditPath = await writeAudit(settings, {
          ...auditBase,
          enabled: settings.enabled,
          write_enabled: settings.writeEnabled,
          exec_enabled: settings.execEnabled,
          repo_writable: repoWritable,
          docs_agents_writable: docsAgentsWritable,
          agent_skills_writable: skillsWritable,
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
          physicalWrite: {
            repoRoot: repoWritable,
            docsAgents: docsAgentsWritable,
            agentSkills: skillsWritable,
          },
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
        assertWriteAllowed(resolved);
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

      if (
        action === "mkdir" ||
        action === "create_file" ||
        action === "write_file_if_hash_matches" ||
        action === "copy_from_workspace" ||
        action === "move_from_workspace" ||
        action === "install_skill" ||
        action === "delete_empty_probe_file" ||
        action === "delete_if_hash_matches"
      ) {
        if (!settings.writeEnabled) {
          throw new ToolAuthorizationError("host-operator writes are disabled");
        }
      }

      if (action === "mkdir") {
        assertWriteAllowed(resolved);
        await fs.mkdir(resolved.target, { recursive: true });
        const auditPath = await writeAudit(settings, {
          ...auditBase,
          created_directory: true,
        });
        return jsonResult({
          auditId,
          auditPath,
          scope: resolved.scope,
          path: resolved.target,
          canonicalPath: normalizePath(
            path.posix.join(resolved.canonicalRoot, resolved.relativePath),
          ),
          created: true,
        });
      }

      if (action === "create_file") {
        assertWriteAllowed(resolved);
        const content = readContentParam(record);
        const existing = await fs.lstat(resolved.target).catch(() => null);
        if (existing) {
          throw new ToolInputError("target file already exists");
        }
        await fs.mkdir(path.posix.dirname(resolved.target), { recursive: true });
        await fs.writeFile(resolved.target, content, "utf-8");
        const auditPath = await writeAudit(settings, {
          ...auditBase,
          bytes_written: Buffer.byteLength(content, "utf-8"),
          content_hash: sha256(content),
        });
        return jsonResult({
          auditId,
          auditPath,
          scope: resolved.scope,
          path: resolved.target,
          canonicalPath: normalizePath(
            path.posix.join(resolved.canonicalRoot, resolved.relativePath),
          ),
          created: true,
          contentHash: sha256(content),
        });
      }

      if (action === "write_file_if_hash_matches") {
        assertWriteAllowed(resolved);
        const expectedHash = readExpectedHash(record);
        if (!expectedHash) {
          throw new ToolInputError("expectedHash required");
        }
        const content = readContentParam(record);
        await assertHashMatches(resolved.target, expectedHash);
        await fs.writeFile(resolved.target, content, "utf-8");
        const auditPath = await writeAudit(settings, {
          ...auditBase,
          bytes_written: Buffer.byteLength(content, "utf-8"),
          previous_hash: expectedHash,
          content_hash: sha256(content),
        });
        return jsonResult({
          auditId,
          auditPath,
          scope: resolved.scope,
          path: resolved.target,
          canonicalPath: normalizePath(
            path.posix.join(resolved.canonicalRoot, resolved.relativePath),
          ),
          written: true,
          previousHash: expectedHash,
          contentHash: sha256(content),
        });
      }

      if (action === "copy_from_workspace" || action === "move_from_workspace") {
        if (resolved.scope !== "live_repo") {
          throw new ToolAuthorizationError("workspace copy target must be live_repo");
        }
        assertLiveRepoWriteAllowed(resolved.relativePath);
        const source = resolveWorkspaceSourcePath(record, settings);
        const overwrite = readBooleanParam(record.overwrite);
        const entries = await collectCopyEntries(source.target, resolved.target);
        for (const entry of entries) {
          assertLiveRepoWriteAllowed(relativeTo(settings.repoRoot, entry.target));
        }
        await copyEntries(entries, overwrite);
        if (action === "move_from_workspace") {
          await fs.rm(source.target, { recursive: true, force: true });
        }
        const auditPath = await writeAudit(settings, {
          ...auditBase,
          source_scope: source.scope,
          source_relative_path: source.relativePath,
          file_count: entries.length,
          bytes_written: entries.reduce((sum, entry) => sum + entry.size, 0),
          moved: action === "move_from_workspace",
        });
        return jsonResult({
          auditId,
          auditPath,
          scope: resolved.scope,
          path: resolved.target,
          canonicalPath: normalizePath(
            path.posix.join(resolved.canonicalRoot, resolved.relativePath),
          ),
          sourceCanonicalPath: normalizePath(
            path.posix.join(source.canonicalRoot, source.relativePath),
          ),
          copied: true,
          moved: action === "move_from_workspace",
          fileCount: entries.length,
        });
      }

      if (action === "install_skill") {
        const skillName = readSkillName(record);
        const skillRoot = resolveScopedPath(`.agents/skills/${skillName}`, settings, "live_repo");
        assertLiveRepoWriteAllowed(skillRoot.relativePath);
        const files = readSkillFiles(record, skillName);
        for (const file of files) {
          assertLiveRepoWriteAllowed(path.posix.join(skillRoot.relativePath, file.path));
        }
        if (readBooleanParam(record.validateOnly)) {
          const auditPath = await writeAudit(settings, {
            ...auditBase,
            action: "install_skill",
            relative_path: skillRoot.relativePath,
            skill_name: skillName,
            file_count: files.length,
            validated_only: true,
          });
          return jsonResult({
            auditId,
            auditPath,
            scope: "live_repo",
            canonicalPath: normalizePath(
              path.posix.join(settings.canonicalRepoRoot, skillRoot.relativePath),
            ),
            validated: true,
            installed: false,
            skillName,
            fileCount: files.length,
          });
        }
        const existing = await fs.lstat(skillRoot.target).catch(() => null);
        if (existing && !readBooleanParam(record.overwrite)) {
          throw new ToolInputError("skill already exists; set overwrite=true to replace");
        }
        await fs.mkdir(skillRoot.target, { recursive: true });
        for (const file of files) {
          const output = path.posix.join(skillRoot.target, file.path);
          await fs.mkdir(path.posix.dirname(output), { recursive: true });
          await fs.writeFile(output, file.content, "utf-8");
        }
        const auditPath = await writeAudit(settings, {
          ...auditBase,
          action: "install_skill",
          relative_path: skillRoot.relativePath,
          skill_name: skillName,
          file_count: files.length,
          content_hashes: files.map((file) => ({
            path: file.path,
            hash: sha256(file.content),
          })),
        });
        return jsonResult({
          auditId,
          auditPath,
          scope: "live_repo",
          path: skillRoot.target,
          canonicalPath: normalizePath(
            path.posix.join(settings.canonicalRepoRoot, skillRoot.relativePath),
          ),
          installed: true,
          skillName,
          fileCount: files.length,
        });
      }

      if (action === "delete_empty_probe_file" || action === "delete_if_hash_matches") {
        assertWriteAllowed(resolved);
        const stat = await fs.lstat(resolved.target);
        if (!stat.isFile()) {
          throw new ToolAuthorizationError("delete target must be a file");
        }
        if (action === "delete_empty_probe_file") {
          if (stat.size !== 0 || !resolved.relativePath.includes(".host-operator-probe")) {
            throw new ToolAuthorizationError("only empty host-operator probe files can be deleted");
          }
        } else {
          const expectedHash = readExpectedHash(record);
          if (!expectedHash) {
            throw new ToolInputError("expectedHash required");
          }
          await assertHashMatches(resolved.target, expectedHash);
        }
        await fs.unlink(resolved.target);
        const auditPath = await writeAudit(settings, {
          ...auditBase,
          deleted: true,
          deleted_bytes: stat.size,
        });
        return jsonResult({
          auditId,
          auditPath,
          scope: resolved.scope,
          path: resolved.target,
          canonicalPath: normalizePath(
            path.posix.join(resolved.canonicalRoot, resolved.relativePath),
          ),
          deleted: true,
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
