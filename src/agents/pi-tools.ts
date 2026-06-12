import fs from "node:fs/promises";
import path from "node:path";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import { codingTools, createReadTool, readTool } from "@mariozechner/pi-coding-agent";
import { resolveStateDir } from "../config/paths.js";
import type { ModelCompatConfig } from "../config/types.models.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import type { ToolLoopDetectionConfig } from "../config/types.tools.js";
import { resolveMergedSafeBinProfileFixtures } from "../infra/exec-safe-bin-runtime-policy.js";
import { logWarn } from "../logger.js";
import { getPluginToolMeta } from "../plugins/tools.js";
import { isSubagentSessionKey } from "../routing/session-key.js";
import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalLowercaseString,
} from "../shared/string-coerce.js";
import { resolveGatewayMessageChannel } from "../utils/message-channel.js";
import {
  findAgentPackRegistryEntry,
  loadAgentPackRegistryEntriesSync,
  type AgentPackToolBudgetPolicy,
} from "./agent-pack-registry.js";
import { resolveAgentConfig } from "./agent-scope.js";
import { createApplyPatchTool } from "./apply-patch.js";
import { describeExecTool, describeProcessTool } from "./bash-tools.descriptions.js";
import type { ExecToolDefaults } from "./bash-tools.exec-types.js";
import type { ProcessToolDefaults } from "./bash-tools.process.js";
import { execSchema, processSchema } from "./bash-tools.schemas.js";
import { listChannelAgentTools } from "./channel-tools.js";
import { shouldSuppressManagedWebSearchTool } from "./codex-native-web-search.js";
import { resolveImageSanitizationLimits } from "./image-sanitization.js";
import type { ModelAuthMode } from "./model-auth.js";
import type { OpenClawNodeAuthorityOverlay } from "./node-authority-overlay.js";
import { createOpenClawLspService, type OpenClawLspService } from "./openclaw-lsp-service.js";
import { createOpenClawTools } from "./openclaw-tools.js";
import { wrapToolWithAbortSignal } from "./pi-tools.abort.js";
import { wrapToolWithBeforeToolCallHook } from "./pi-tools.before-tool-call.js";
import { applyDeferredFollowupToolDescriptions } from "./pi-tools.deferred-followup.js";
import { filterToolsByMessageProvider } from "./pi-tools.message-provider-policy.js";
import {
  isToolAllowedByPolicies,
  resolveEffectiveToolPolicy,
  resolveGroupToolPolicy,
  resolveSubagentToolPolicyForSession,
} from "./pi-tools.policy.js";
import {
  assertRequiredParams,
  createHostWorkspaceEditTool,
  createHostWorkspaceWriteTool,
  createOpenClawReadTool,
  createSandboxedEditTool,
  createSandboxedReadTool,
  createSandboxedWriteTool,
  getToolParamsRecord,
  wrapReadToolWithDocumentIngestArbitration,
  wrapToolMemoryFlushAppendOnlyWrite,
  wrapToolWorkspaceRootGuard,
  wrapToolWorkspaceRootGuardWithOptions,
  wrapToolParamValidation,
  resolveToolPathAgainstWorkspaceRoot,
} from "./pi-tools.read.js";
import { cleanToolSchemaForGemini, normalizeToolParameters } from "./pi-tools.schema.js";
import type { AnyAgentTool } from "./pi-tools.types.js";
import type { SandboxContext } from "./sandbox.js";
import type { NativeTaskRunChildTask } from "./session-runtime/native-task-types.js";
import {
  EXEC_TOOL_DISPLAY_SUMMARY,
  PROCESS_TOOL_DISPLAY_SUMMARY,
} from "./tool-description-presets.js";
import { createToolFsPolicy, resolveToolFsConfig } from "./tool-fs-policy.js";
import {
  applyToolPolicyPipeline,
  buildDefaultToolPolicyPipelineSteps,
} from "./tool-policy-pipeline.js";
import {
  applyOwnerOnlyToolPolicy,
  collectExplicitAllowlist,
  mergeAlsoAllowPolicy,
  normalizeToolName,
  resolveToolProfilePolicy,
} from "./tool-policy.js";
import { ToolAuthorizationError } from "./tools/common.js";
import { createLspTool } from "./tools/lsp-tool.js";
import { createGlobTool, createGrepTool, createListTool } from "./tools/repo-discovery-tools.js";
import { resolveWorkspaceRoot } from "./workspace-dir.js";

function isOpenAIProvider(provider?: string) {
  const normalized = normalizeOptionalLowercaseString(provider);
  return normalized === "openai" || normalized === "openai-codex";
}

function isExecutionCodingNodeParent(input: {
  agentId?: string | null;
  requestedAgentId?: string | null;
  sessionKey?: string | null;
  nodeNativeTaskEnabled?: boolean;
}): boolean {
  if (input.nodeNativeTaskEnabled !== true) {
    return false;
  }
  const requestedAgentId = normalizeLowercaseStringOrEmpty(input.requestedAgentId ?? "");
  const resolvedAgentId = normalizeLowercaseStringOrEmpty(input.agentId ?? "");
  const sessionKey = normalizeLowercaseStringOrEmpty(input.sessionKey ?? "");
  return (
    requestedAgentId === "execution-coding" ||
    resolvedAgentId === "execution-coding" ||
    sessionKey.startsWith("agent:execution-coding:")
  );
}

const MEMORY_FLUSH_ALLOWED_TOOL_NAMES = new Set(["read", "write"]);
const NODE_AUTHORITY_PATH_TOOL_NAMES = new Set(["read", "write", "edit", "apply_patch", "lsp"]);
const NODE_AGENT_NATIVE_TASK_ALWAYS_ALLOWED_TOOL_NAMES = new Set([
  "update_plan",
  "read_todo",
  "task",
  "read",
  "grep",
  "glob",
  "lsp",
  "node_finish",
]);
const OPENCODE_READ_DEFAULT_LINES = 2_000;
const NODE_AGENT_PARENT_READ_DEFAULT_LINES = OPENCODE_READ_DEFAULT_LINES;

export function isNodeAgentNativeTaskParentToolAllowed(input: {
  toolName?: string | null;
  mutationToolName?: string | null;
}): boolean {
  const toolName = normalizeToolName(input.toolName ?? "");
  const mutationToolName = normalizeToolName(input.mutationToolName ?? "edit");
  return Boolean(
    toolName &&
    (NODE_AGENT_NATIVE_TASK_ALWAYS_ALLOWED_TOOL_NAMES.has(toolName) ||
      (mutationToolName && toolName === mutationToolName)),
  );
}

function stripNodeAgentNativeTaskParentDenyPolicy(input: {
  policy?: { allow?: string[]; deny?: string[] };
  mode?: {
    enabled?: boolean;
    mutationToolName?: string;
  };
}): typeof input.policy {
  if (input.mode?.enabled !== true || !input.policy?.deny?.length) {
    return input.policy;
  }
  const deny = input.policy.deny.filter(
    (toolName) =>
      !isNodeAgentNativeTaskParentToolAllowed({
        toolName,
        mutationToolName: input.mode?.mutationToolName,
      }),
  );
  return deny.length === input.policy.deny.length ? input.policy : { ...input.policy, deny };
}

const EXECUTION_CONTEXT_SCOUT_ALLOWED_TOOL_NAMES = new Set([
  "read",
  "list",
  "glob",
  "grep",
  "openclaw_resource_read",
]);
const EXECUTION_VALIDATION_SCOUT_ALLOWED_TOOL_NAMES = new Set([
  "read",
  "list",
  "glob",
  "grep",
  "exec",
  "openclaw_resource_read",
]);
const EXECUTION_ROLE_REMINDER_TOOL_NAMES = new Set(["read", "grep", "glob"]);
const EXECUTION_PARENT_EDIT_COMMITMENT_SENTENCE =
  "If you have enough context to make even a small, medium-confidence edit, make that edit now; do not take another context-acquisition turn.";

function appendSystemReminderToToolResult<T>(
  result: T,
  reminder: string,
  detailsPatch?: Record<string, unknown>,
): T {
  const trimmedReminder = reminder.trim();
  if (!trimmedReminder || !result || typeof result !== "object") {
    return result;
  }
  const record = result as {
    content?: unknown;
    details?: unknown;
  };
  const reminderText = `<system-reminder>\n${trimmedReminder}\n</system-reminder>`;
  const content = Array.isArray(record.content) ? record.content : [];
  let replaced = false;
  const nextContent = content.map((block) => {
    if (
      !replaced &&
      block &&
      typeof block === "object" &&
      (block as { type?: unknown }).type === "text" &&
      typeof (block as { text?: unknown }).text === "string"
    ) {
      const text = (block as { text: string }).text;
      if (text.includes(reminderText)) {
        replaced = true;
        return block;
      }
      replaced = true;
      return {
        ...block,
        text: `${text.trimEnd()}\n\n${reminderText}`,
      };
    }
    return block;
  });
  const details =
    record.details && typeof record.details === "object" && !Array.isArray(record.details)
      ? (record.details as Record<string, unknown>)
      : null;
  const nextDetails =
    details && typeof details.text === "string" && !details.text.includes(reminderText)
      ? {
          ...details,
          ...detailsPatch,
          text: `${details.text.trimEnd()}\n\n${reminderText}`,
        }
      : details
        ? { ...details, ...detailsPatch }
        : detailsPatch
          ? detailsPatch
          : record.details;
  return {
    ...(result as object),
    content: replaced ? nextContent : [...content, { type: "text", text: reminderText }],
    ...(nextDetails ? { details: nextDetails } : {}),
  } as T;
}

function resolveExecutionRoleToolReminder(input: {
  agentId?: string | null;
  toolName: string;
  nodeNativeTaskParentMode?: boolean;
}): { description: string; result: string } | null {
  const agentId = normalizeLowercaseStringOrEmpty(input.agentId ?? "");
  const toolName = normalizeLowercaseStringOrEmpty(input.toolName);
  if (!EXECUTION_ROLE_REMINDER_TOOL_NAMES.has(toolName)) {
    return null;
  }
  if (agentId === "execution-coding" && input.nodeNativeTaskParentMode === true) {
    return null;
  }
  if (agentId === "execution-context-scout") {
    if (toolName === "grep") {
      return {
        description:
          "Context scout search-first reminder: search known refs/keywords first, then read bounded windows around matched lines instead of walking from the top of files.",
        result:
          "Context scout reminder: read bounded windows around matched symbols. If scoped search misses, search variants or return missing_windows. Do not switch to top-of-file read walking.",
      };
    }
    return {
      description:
        "Context scout read reminder: read only matched bounded windows; for known-file/symbol tasks grep the file first instead of reading from line 1.",
      result:
        "Context scout reminder: use plain mechanical handoff headings such as symbol_windows, file_graph, missing_windows, and likely_edit_points. Pair likely_edit_points with actual line-window excerpts; otherwise put them under missing_windows.",
    };
  }
  if (agentId === "execution-validation-scout") {
    return {
      description:
        "Validation scout reminder: use source reads/search only to answer the focused validation question and repair context.",
      result:
        "Validation scout reminder: return validation scope, commands considered/run, exit status, bounded output excerpts, diagnosis, repair context, and residual risk. Do not mutate files.",
    };
  }
  return null;
}

function wrapToolsWithExecutionRoleToolReminders(input: {
  tools: AnyAgentTool[];
  agentId?: string | null;
  nodeNativeTaskParentMode?: boolean;
}): AnyAgentTool[] {
  return input.tools.map((tool) => {
    const reminder = resolveExecutionRoleToolReminder({
      agentId: input.agentId,
      toolName: tool.name,
      nodeNativeTaskParentMode: input.nodeNativeTaskParentMode,
    });
    if (!reminder) {
      return tool;
    }
    return {
      ...tool,
      description: `${tool.description} ${reminder.description}`,
      execute: async (toolCallId, args, signal, onUpdate): Promise<AgentToolResult<unknown>> => {
        const result = await tool.execute(toolCallId, args, signal, onUpdate);
        return appendSystemReminderToToolResult(result, reminder.result);
      },
    };
  });
}

type ResolvedNodeAuthorityOverlay = {
  readableRoots: string[];
  writableRoots: string[];
  deniedRoots: string[];
  validationCommandRefs: string[];
  authorityRef: string | null;
};

function createLazyExecTool(defaults?: ExecToolDefaults): AnyAgentTool {
  let loadedTool: AnyAgentTool | undefined;
  const loadTool = async () => {
    if (!loadedTool) {
      const { createExecTool } = await import("./bash-tools.js");
      loadedTool = createExecTool(defaults) as unknown as AnyAgentTool;
    }
    return loadedTool;
  };

  return {
    name: "exec",
    label: "exec",
    displaySummary: EXEC_TOOL_DISPLAY_SUMMARY,
    get description() {
      return describeExecTool({
        agentId: defaults?.agentId,
        hasCronTool: defaults?.hasCronTool === true,
      });
    },
    parameters: execSchema,
    execute: async (...args: Parameters<AnyAgentTool["execute"]>) =>
      (await loadTool()).execute(...args),
  } as AnyAgentTool;
}

function createLazyProcessTool(defaults?: ProcessToolDefaults): AnyAgentTool {
  let loadedTool: AnyAgentTool | undefined;
  const loadTool = async () => {
    if (!loadedTool) {
      const { createProcessTool } = await import("./bash-tools.js");
      loadedTool = createProcessTool(defaults) as unknown as AnyAgentTool;
    }
    return loadedTool;
  };

  return {
    name: "process",
    label: "process",
    displaySummary: PROCESS_TOOL_DISPLAY_SUMMARY,
    description: describeProcessTool({ hasCronTool: defaults?.hasCronTool === true }),
    parameters: processSchema,
    execute: async (...args: Parameters<AnyAgentTool["execute"]>) =>
      (await loadTool()).execute(...args),
  } as AnyAgentTool;
}

function uniqueNonEmpty(values: readonly (string | null | undefined)[], max = 200): string[] {
  return [
    ...new Set(
      values
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim()),
    ),
  ].slice(0, max);
}

function isPathWithinRoot(candidatePath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizeNodeAuthorityPathRef(ref: string, workspaceRoot: string): string | null {
  const trimmed = ref.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed === "repo-scope://workspace" || trimmed === "repo://workspace") {
    return path.resolve(workspaceRoot);
  }
  const stripped = trimmed
    .replace(/^repo-path:\/\//u, "")
    .replace(/^repo-file:\/\//u, "")
    .replace(/^repo-scope:\/\//u, "")
    .replace(/^workspace:\/\//u, "");
  if (!stripped || stripped === "workspace") {
    return path.resolve(workspaceRoot);
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(stripped)) {
    return null;
  }
  return path.resolve(workspaceRoot, stripped.startsWith("@") ? stripped.slice(1) : stripped);
}

function resolveNodeAuthorityOverlay(
  overlay: OpenClawNodeAuthorityOverlay | undefined,
  workspaceRoot: string,
): ResolvedNodeAuthorityOverlay | null {
  if (!overlay) {
    return null;
  }
  const readableRoots = uniqueNonEmpty(
    (overlay.readablePathRefs ?? []).map((ref) =>
      normalizeNodeAuthorityPathRef(ref, workspaceRoot),
    ),
  );
  const writableRoots = uniqueNonEmpty(
    (overlay.writablePathRefs ?? []).map((ref) =>
      normalizeNodeAuthorityPathRef(ref, workspaceRoot),
    ),
  );
  const deniedRoots = uniqueNonEmpty(
    (overlay.deniedPathRefs ?? []).map((ref) => normalizeNodeAuthorityPathRef(ref, workspaceRoot)),
  );
  return {
    readableRoots,
    writableRoots,
    deniedRoots,
    validationCommandRefs: uniqueNonEmpty([...(overlay.validationCommandRefs ?? [])], 80),
    authorityRef: overlay.authorityRef?.trim() || null,
  };
}

function resolveNodeAuthorityToolPath(input: {
  filePath: string;
  workspaceRoot: string;
  sandboxContainerWorkdir?: string;
}): string {
  return resolveToolPathAgainstWorkspaceRoot({
    filePath: input.filePath,
    root: input.workspaceRoot,
    containerWorkdir: input.sandboxContainerWorkdir,
  });
}

function assertNodeAuthorityPath(input: {
  toolName: string;
  action: "read" | "write" | "execute";
  filePath: string;
  resolvedPath: string;
  authority: ResolvedNodeAuthorityOverlay;
}) {
  const allowedRoots =
    input.action === "write" ? input.authority.writableRoots : input.authority.readableRoots;
  const denied = input.authority.deniedRoots.some((root) =>
    isPathWithinRoot(input.resolvedPath, root),
  );
  const allowed = allowedRoots.some((root) => isPathWithinRoot(input.resolvedPath, root));
  if (denied || !allowed) {
    const authorityRef = input.authority.authorityRef
      ? ` Authority: ${input.authority.authorityRef}.`
      : "";
    throw new ToolAuthorizationError(
      `Node authority does not allow ${input.action} with ${input.toolName} at ${input.filePath}.${authorityRef}`,
    );
  }
}

function patchTargetPaths(input: string): string[] {
  const targets: string[] = [];
  for (const line of input.split(/\r?\n/u)) {
    const match = line.match(/^\*\*\* (?:Add File|Delete File|Update File|Move to):\s+(.+)$/u);
    if (match?.[1]?.trim()) {
      targets.push(match[1].trim());
    }
  }
  return uniqueNonEmpty(targets, 200);
}

function wrapToolWithNodeAuthorityOverlay(input: {
  tool: AnyAgentTool;
  authority: ResolvedNodeAuthorityOverlay;
  workspaceRoot: string;
  sandboxContainerWorkdir?: string;
}): AnyAgentTool {
  const { tool, authority, workspaceRoot, sandboxContainerWorkdir } = input;
  if (!NODE_AUTHORITY_PATH_TOOL_NAMES.has(tool.name) && tool.name !== "exec") {
    return tool;
  }
  return {
    ...tool,
    execute: async (toolCallId, args, signal, onUpdate) => {
      const record = getToolParamsRecord(args);
      if (tool.name === "apply_patch") {
        const patch = typeof record?.input === "string" ? record.input : "";
        for (const targetPath of patchTargetPaths(patch)) {
          const resolvedPath = resolveNodeAuthorityToolPath({
            filePath: targetPath,
            workspaceRoot,
            sandboxContainerWorkdir,
          });
          assertNodeAuthorityPath({
            toolName: tool.name,
            action: "write",
            filePath: targetPath,
            resolvedPath,
            authority,
          });
        }
      } else if (tool.name === "exec") {
        const workdir =
          typeof record?.workdir === "string" && record.workdir.trim() ? record.workdir : null;
        if (workdir) {
          const resolvedPath = resolveNodeAuthorityToolPath({
            filePath: workdir,
            workspaceRoot,
            sandboxContainerWorkdir,
          });
          const allowedRoots = uniqueNonEmpty([
            ...authority.readableRoots,
            ...authority.writableRoots,
          ]);
          const denied = authority.deniedRoots.some((root) => isPathWithinRoot(resolvedPath, root));
          const allowed = allowedRoots.some((root) => isPathWithinRoot(resolvedPath, root));
          if (denied || !allowed) {
            throw new ToolAuthorizationError(
              `Node authority does not allow exec workdir ${workdir}.`,
            );
          }
        }
      } else {
        const filePath =
          typeof record?.path === "string" && record.path.trim()
            ? record.path
            : tool.name === "lsp" && typeof record?.filePath === "string" && record.filePath.trim()
              ? record.filePath
              : null;
        if (filePath) {
          const resolvedPath = resolveNodeAuthorityToolPath({
            filePath,
            workspaceRoot,
            sandboxContainerWorkdir,
          });
          assertNodeAuthorityPath({
            toolName: tool.name,
            action: tool.name === "read" || tool.name === "lsp" ? "read" : "write",
            filePath,
            resolvedPath,
            authority,
          });
        }
      }
      return tool.execute(toolCallId, args, signal, onUpdate);
    },
  };
}

function applyNodeAuthorityOverlay(input: {
  tools: AnyAgentTool[];
  overlay?: OpenClawNodeAuthorityOverlay;
  workspaceRoot: string;
  sandboxContainerWorkdir?: string;
}): AnyAgentTool[] {
  const authority = resolveNodeAuthorityOverlay(input.overlay, input.workspaceRoot);
  if (!authority) {
    return input.tools;
  }
  return input.tools.map((tool) =>
    wrapToolWithNodeAuthorityOverlay({
      tool,
      authority,
      workspaceRoot: input.workspaceRoot,
      sandboxContainerWorkdir: input.sandboxContainerWorkdir,
    }),
  );
}

const NODE_PARENT_REPO_MAPPING_TOOL_NAMES = new Set(["grep", "glob", "list"]);

function normalizeToolPathParam(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hasPreciseReadWindow(params: Record<string, unknown>): boolean {
  const numericWindowKeys = ["offset", "limit", "lineOffset", "lineLimit", "startLine", "endLine"];
  return numericWindowKeys.some((key) => {
    const value = params[key];
    return typeof value === "number" && Number.isFinite(value);
  });
}

function isParentRepoMappingBeforeScout(input: {
  toolName: string;
  params: Record<string, unknown>;
  workspaceRoot: string;
}): boolean {
  if (input.toolName === "read") {
    const filePath = normalizeToolPathParam(input.params.path);
    if (!filePath) {
      return true;
    }
    const resolved = resolveToolPathAgainstWorkspaceRoot({
      filePath,
      root: input.workspaceRoot,
    });
    return resolved === input.workspaceRoot || !hasPreciseReadWindow(input.params);
  }
  if (!NODE_PARENT_REPO_MAPPING_TOOL_NAMES.has(input.toolName)) {
    return false;
  }
  return true;
}

function positiveIntegerParam(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const integer = Math.floor(value);
  return integer > 0 ? integer : null;
}

function isWorkspaceStateRuntimePath(input: {
  resolvedPath: string;
  workspaceRoot: string;
}): boolean {
  const relative = path.relative(input.workspaceRoot, input.resolvedPath).split(path.sep).join("/");
  return (
    relative === ".openclaw" ||
    relative === ".openclaw/runtime" ||
    relative.startsWith(".openclaw/runtime/")
  );
}

function isWorkspaceManagedToolOutputFilePath(input: {
  resolvedPath: string;
  workspaceRoot: string;
}): boolean {
  const relative = path.relative(input.workspaceRoot, input.resolvedPath).split(path.sep).join("/");
  return relative.startsWith(".openclaw/runtime/managed-tool-output/") && relative.endsWith(".txt");
}

function isPathInsideWorkspace(input: { resolvedPath: string; workspaceRoot: string }): boolean {
  const relative = path.relative(input.workspaceRoot, input.resolvedPath);
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function wrapToolsWithNodeParentExactReadGuard(input: {
  tools: AnyAgentTool[];
  enabled?: boolean;
  workspaceRoot: string;
  sandboxContainerWorkdir?: string;
}): AnyAgentTool[] {
  if (!input.enabled) {
    return input.tools;
  }
  return input.tools.map((tool) => {
    if (tool.name !== "read" && tool.name !== "grep" && tool.name !== "glob") {
      return tool;
    }
    if (tool.name === "glob") {
      return {
        ...tool,
        execute: async (toolCallId, args, signal, onUpdate) => {
          const params = getToolParamsRecord(args) ?? {};
          const pathParam = normalizeToolPathParam(params.path);
          if (pathParam && /^file:/iu.test(pathParam)) {
            throw new ToolAuthorizationError(
              "glob path must be workspace-relative; file:// paths are not accepted.",
            );
          }
          if (pathParam) {
            const resolvedPath = resolveNodeAuthorityToolPath({
              filePath: pathParam,
              workspaceRoot: input.workspaceRoot,
              sandboxContainerWorkdir: input.sandboxContainerWorkdir,
            });
            if (!isPathInsideWorkspace({ resolvedPath, workspaceRoot: input.workspaceRoot })) {
              throw new ToolAuthorizationError("glob path must stay inside the workspace root.");
            }
            if (isWorkspaceStateRuntimePath({ resolvedPath, workspaceRoot: input.workspaceRoot })) {
              throw new ToolAuthorizationError("glob path cannot inspect OpenClaw runtime state.");
            }
          }
          return tool.execute(toolCallId, args, signal, onUpdate);
        },
      };
    }
    if (tool.name === "grep") {
      return {
        ...tool,
        execute: async (toolCallId, args, signal, onUpdate) => {
          const params = getToolParamsRecord(args) ?? {};
          const query = typeof params.query === "string" ? params.query.trim() : "";
          if (!query) {
            throw new ToolAuthorizationError("grep query is required.");
          }
          const filePath = normalizeToolPathParam(params.path);
          if (filePath && /^file:/iu.test(filePath)) {
            throw new ToolAuthorizationError(
              "grep path must be workspace-relative; file:// paths are not accepted.",
            );
          }
          if (filePath) {
            const resolvedPath = resolveNodeAuthorityToolPath({
              filePath,
              workspaceRoot: input.workspaceRoot,
              sandboxContainerWorkdir: input.sandboxContainerWorkdir,
            });
            if (!isPathInsideWorkspace({ resolvedPath, workspaceRoot: input.workspaceRoot })) {
              throw new ToolAuthorizationError("grep path must stay inside the workspace root.");
            }
            if (
              isWorkspaceStateRuntimePath({ resolvedPath, workspaceRoot: input.workspaceRoot }) &&
              !isWorkspaceManagedToolOutputFilePath({
                resolvedPath,
                workspaceRoot: input.workspaceRoot,
              })
            ) {
              throw new ToolAuthorizationError("grep path cannot inspect OpenClaw runtime state.");
            }
            const stat = await fs.stat(resolvedPath).catch(() => null);
            if (!stat?.isFile() && !stat?.isDirectory()) {
              throw new ToolAuthorizationError(
                "grep path must resolve to a workspace file or directory.",
              );
            }
          }
          return tool.execute(toolCallId, args, signal, onUpdate);
        },
      };
    }
    return {
      ...tool,
      execute: async (toolCallId, args, signal, onUpdate) => {
        const params = getToolParamsRecord(args) ?? {};
        const filePath = normalizeToolPathParam(params.path);
        if (!filePath) {
          throw new ToolAuthorizationError("read path is required.");
        }
        if (/^file:/iu.test(filePath)) {
          throw new ToolAuthorizationError(
            "read path must be workspace-relative; file:// paths are not accepted.",
          );
        }
        const offset = positiveIntegerParam(params.offset);
        const limit = positiveIntegerParam(params.limit);
        const resolvedPath = resolveNodeAuthorityToolPath({
          filePath,
          workspaceRoot: input.workspaceRoot,
          sandboxContainerWorkdir: input.sandboxContainerWorkdir,
        });
        if (!isPathInsideWorkspace({ resolvedPath, workspaceRoot: input.workspaceRoot })) {
          throw new ToolAuthorizationError("read path must stay inside the workspace root.");
        }
        if (
          isWorkspaceStateRuntimePath({ resolvedPath, workspaceRoot: input.workspaceRoot }) &&
          !isWorkspaceManagedToolOutputFilePath({
            resolvedPath,
            workspaceRoot: input.workspaceRoot,
          })
        ) {
          throw new ToolAuthorizationError("read path cannot inspect OpenClaw runtime state.");
        }
        return tool.execute(
          toolCallId,
          {
            ...params,
            offset: offset ?? 1,
            limit: limit ?? NODE_AGENT_PARENT_READ_DEFAULT_LINES,
          },
          signal,
          onUpdate,
        );
      },
    };
  });
}

function isAcceptedContextScoutSpawnResult(result: unknown): boolean {
  const details =
    result && typeof result === "object" && "details" in result
      ? (result as { details?: unknown }).details
      : null;
  if (!details || typeof details !== "object") {
    return false;
  }
  const record = details as Record<string, unknown>;
  const status = normalizeLowercaseStringOrEmpty(
    typeof record.status === "string" ? record.status : "",
  );
  const childSessionKey = typeof record.childSessionKey === "string" ? record.childSessionKey : "";
  return status === "accepted" && childSessionKey.includes("execution-context-scout");
}

function wrapToolsWithNodeParentCrawlGuard(input: {
  tools: AnyAgentTool[];
  enabled?: boolean;
  workspaceRoot: string;
}): AnyAgentTool[] {
  if (!input.enabled) {
    return input.tools;
  }
  let contextScoutDelegated = false;
  return input.tools.map((tool) => {
    if (
      tool.name !== "sessions_spawn" &&
      tool.name !== "read" &&
      !NODE_PARENT_REPO_MAPPING_TOOL_NAMES.has(tool.name)
    ) {
      return tool;
    }
    return {
      ...tool,
      execute: async (toolCallId, args, signal, onUpdate) => {
        const params = getToolParamsRecord(args) ?? {};
        if (tool.name === "sessions_spawn") {
          const agentId = normalizeLowercaseStringOrEmpty(
            typeof params.agentId === "string" ? params.agentId : "",
          );
          const result = await tool.execute(toolCallId, args, signal, onUpdate);
          if (agentId === "execution-context-scout" && isAcceptedContextScoutSpawnResult(result)) {
            contextScoutDelegated = true;
          }
          return result;
        }
        if (
          !contextScoutDelegated &&
          isParentRepoMappingBeforeScout({
            toolName: tool.name,
            params,
            workspaceRoot: input.workspaceRoot,
          })
        ) {
          throw new ToolAuthorizationError(
            "Parent repo mapping is disabled before scout delegation by the current node policy.",
          );
        }
        return tool.execute(toolCallId, args, signal, onUpdate);
      },
    };
  });
}

function filterToolsForNodeAgentNativeTaskMode(input: {
  tools: AnyAgentTool[];
  mode?: {
    enabled?: boolean;
    allowedAgentIds?: readonly string[];
    mutationToolName?: string;
  };
}): AnyAgentTool[] {
  if (!input.mode?.enabled) {
    return input.tools;
  }
  const mutationToolName = normalizeLowercaseStringOrEmpty(input.mode.mutationToolName ?? "edit");
  return input.tools
    .filter((tool) => {
      return isNodeAgentNativeTaskParentToolAllowed({
        toolName: tool.name,
        mutationToolName,
      });
    })
    .map((tool) => {
      const normalizedName = normalizeLowercaseStringOrEmpty(tool.name);
      if (normalizedName === "apply_patch") {
        return {
          ...tool,
          description: [
            tool.description,
            `Execution-node parent patch guidance: use apply_patch for multi-hunk or larger structured edits when the target file and patch shape are known. ${EXECUTION_PARENT_EDIT_COMMITMENT_SENTENCE} Do not wait for complete architecture certainty. Keep patches scoped to the node authority workspace.`,
          ]
            .filter((line): line is string => typeof line === "string" && line.length > 0)
            .join(" "),
        };
      }
      if (normalizedName !== mutationToolName && normalizedName !== "edit") {
        return tool;
      }
      return {
        ...tool,
        description: [
          tool.description,
          `Execution-node parent edit guidance: this is the primary implementation tool. ${EXECUTION_PARENT_EDIT_COMMITMENT_SENTENCE} Use it as soon as the target file, target symbol, and patch shape are visible. Do not wait for complete architecture certainty. If old text is visible and locally bounded, edit before more lookup. Read before editing when the old string is not visible. Match exact strings from line-numbered read output, excluding the line-number prefix. Prefer editing existing files. If the old string is not unique, include more surrounding context from the bounded read window.`,
        ]
          .filter((line): line is string => typeof line === "string" && line.length > 0)
          .join(" "),
      };
    });
}

const EXECUTION_PARENT_TOOL_ORDER_PRIORITY = new Map<string, number>([
  ["edit", 0],
  ["apply_patch", 1],
  ["write", 2],
  ["node_finish", 3],
  ["update_plan", 4],
  ["read_todo", 5],
  ["task", 6],
  ["lsp", 7],
  ["read", 8],
  ["grep", 9],
  ["glob", 10],
]);

function orderExecutionParentProviderTools(input: {
  tools: AnyAgentTool[];
  agentId?: string | null;
  requestedAgentId?: string | null;
  sessionKey?: string | null;
  nodeNativeTaskEnabled?: boolean;
}): AnyAgentTool[] {
  if (
    !isExecutionCodingNodeParent({
      agentId: input.agentId,
      requestedAgentId: input.requestedAgentId,
      sessionKey: input.sessionKey,
      nodeNativeTaskEnabled: input.nodeNativeTaskEnabled,
    })
  ) {
    return input.tools;
  }
  return input.tools
    .map((tool, index) => ({ tool, index }))
    .toSorted((a, b) => {
      const aPriority =
        EXECUTION_PARENT_TOOL_ORDER_PRIORITY.get(normalizeLowercaseStringOrEmpty(a.tool.name)) ??
        Number.MAX_SAFE_INTEGER;
      const bPriority =
        EXECUTION_PARENT_TOOL_ORDER_PRIORITY.get(normalizeLowercaseStringOrEmpty(b.tool.name)) ??
        Number.MAX_SAFE_INTEGER;
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.tool);
}

export function filterToolsForExecutionScoutMode<TTool extends { name?: string | null }>(input: {
  tools: readonly TTool[];
  agentId?: string | null;
}): TTool[] {
  const agentId = normalizeLowercaseStringOrEmpty(input.agentId ?? "");
  const allowedToolNames =
    agentId === "execution-context-scout"
      ? EXECUTION_CONTEXT_SCOUT_ALLOWED_TOOL_NAMES
      : agentId === "execution-validation-scout"
        ? EXECUTION_VALIDATION_SCOUT_ALLOWED_TOOL_NAMES
        : null;
  if (!allowedToolNames) {
    return [...input.tools];
  }
  return input.tools.filter((tool) => {
    const toolName = normalizeLowercaseStringOrEmpty(tool.name ?? "");
    return Boolean(toolName && allowedToolNames.has(toolName));
  });
}

function applyModelProviderToolPolicy(
  tools: AnyAgentTool[],
  params?: {
    config?: OpenClawConfig;
    modelProvider?: string;
    modelApi?: string;
    modelId?: string;
    agentDir?: string;
    modelCompat?: ModelCompatConfig;
  },
): AnyAgentTool[] {
  if (params?.config?.agents?.defaults?.experimental?.localModelLean === true) {
    const leanDeny = new Set(["browser", "cron", "message"]);
    tools = tools.filter((tool) => !leanDeny.has(tool.name));
  }

  if (
    shouldSuppressManagedWebSearchTool({
      config: params?.config,
      modelProvider: params?.modelProvider,
      modelApi: params?.modelApi,
      agentDir: params?.agentDir,
    })
  ) {
    return tools.filter((tool) => tool.name !== "web_search");
  }

  return tools;
}

function isApplyPatchAllowedForModel(params: {
  modelProvider?: string;
  modelId?: string;
  allowModels?: string[];
}) {
  const allowModels = Array.isArray(params.allowModels) ? params.allowModels : [];
  if (allowModels.length === 0) {
    return true;
  }
  const modelId = params.modelId?.trim();
  if (!modelId) {
    return false;
  }
  const normalizedModelId = normalizeLowercaseStringOrEmpty(modelId);
  const provider = normalizeOptionalLowercaseString(params.modelProvider);
  const normalizedFull =
    provider && !normalizedModelId.includes("/")
      ? `${provider}/${normalizedModelId}`
      : normalizedModelId;
  return allowModels.some((entry) => {
    const normalized = normalizeOptionalLowercaseString(entry);
    if (!normalized) {
      return false;
    }
    return normalized === normalizedModelId || normalized === normalizedFull;
  });
}

function resolveExecConfig(params: { cfg?: OpenClawConfig; agentId?: string }) {
  const cfg = params.cfg;
  const globalExec = cfg?.tools?.exec;
  const agentExec =
    cfg && params.agentId ? resolveAgentConfig(cfg, params.agentId)?.tools?.exec : undefined;
  return {
    host: agentExec?.host ?? globalExec?.host,
    security: agentExec?.security ?? globalExec?.security,
    ask: agentExec?.ask ?? globalExec?.ask,
    node: agentExec?.node ?? globalExec?.node,
    pathPrepend: agentExec?.pathPrepend ?? globalExec?.pathPrepend,
    safeBins: agentExec?.safeBins ?? globalExec?.safeBins,
    strictInlineEval: agentExec?.strictInlineEval ?? globalExec?.strictInlineEval,
    safeBinTrustedDirs: agentExec?.safeBinTrustedDirs ?? globalExec?.safeBinTrustedDirs,
    safeBinProfiles: resolveMergedSafeBinProfileFixtures({
      global: globalExec,
      local: agentExec,
    }),
    backgroundMs: agentExec?.backgroundMs ?? globalExec?.backgroundMs,
    timeoutSec: agentExec?.timeoutSec ?? globalExec?.timeoutSec,
    approvalRunningNoticeMs:
      agentExec?.approvalRunningNoticeMs ?? globalExec?.approvalRunningNoticeMs,
    cleanupMs: agentExec?.cleanupMs ?? globalExec?.cleanupMs,
    notifyOnExit: agentExec?.notifyOnExit ?? globalExec?.notifyOnExit,
    notifyOnExitEmptySuccess:
      agentExec?.notifyOnExitEmptySuccess ?? globalExec?.notifyOnExitEmptySuccess,
    applyPatch: agentExec?.applyPatch ?? globalExec?.applyPatch,
  };
}

function resolveAgentToolBudgetPolicy(agentId: string | undefined): AgentPackToolBudgetPolicy {
  const normalizedAgentId = agentId?.trim();
  if (!normalizedAgentId) {
    return {};
  }
  try {
    const entry = findAgentPackRegistryEntry({
      entries: loadAgentPackRegistryEntriesSync(),
      agentId: normalizedAgentId,
    });
    return entry?.toolBudget ? { ...entry.toolBudget } : {};
  } catch {
    return {};
  }
}

export function resolveToolLoopDetectionConfig(params: {
  cfg?: OpenClawConfig;
  agentId?: string;
}): ToolLoopDetectionConfig | undefined {
  const global = params.cfg?.tools?.loopDetection;
  const agent =
    params.agentId && params.cfg
      ? resolveAgentConfig(params.cfg, params.agentId)?.tools?.loopDetection
      : undefined;

  if (!agent) {
    return global;
  }
  if (!global) {
    return agent;
  }

  return {
    ...global,
    ...agent,
    detectors: {
      ...global.detectors,
      ...agent.detectors,
    },
  };
}

export const __testing = {
  cleanToolSchemaForGemini,
  getToolParamsRecord,
  wrapToolParamValidation,
  assertRequiredParams,
  applyModelProviderToolPolicy,
  wrapToolsWithNodeParentCrawlGuard,
} as const;

export function createOpenClawCodingTools(options?: {
  agentId?: string;
  exec?: ExecToolDefaults & ProcessToolDefaults;
  messageProvider?: string;
  agentAccountId?: string;
  messageTo?: string;
  messageThreadId?: string | number;
  sandbox?: SandboxContext | null;
  sessionKey?: string;
  /** Ephemeral session UUID — regenerated on /new and /reset. */
  sessionId?: string;
  /** Stable run identifier for this agent invocation. */
  runId?: string;
  /** What initiated this run (for trigger-specific tool restrictions). */
  trigger?: string;
  /** Relative workspace path that memory-triggered writes may append to. */
  memoryFlushWritePath?: string;
  agentDir?: string;
  workspaceDir?: string;
  /** Native resolved Location.stateRoot for excluding runtime state from repo discovery. */
  stateRoot?: string | null;
  /**
   * Workspace directory that spawned subagents should inherit.
   * When sandboxing uses a copied workspace (`ro` or `none`), workspaceDir is the
   * sandbox copy but subagents should inherit the real agent workspace instead.
   * Defaults to workspaceDir when not set.
   */
  spawnWorkspaceDir?: string;
  config?: OpenClawConfig;
  abortSignal?: AbortSignal;
  /**
   * Provider of the currently selected model (used for provider-specific tool quirks).
   * Example: "anthropic", "openai", "google", "openai-codex".
   */
  modelProvider?: string;
  /** Model id for the current provider (used for model-specific tool gating). */
  modelId?: string;
  /** Model API for the current provider (used for provider-native tool arbitration). */
  modelApi?: string;
  /** Model context window in tokens (used to scale read-tool output budget). */
  modelContextWindowTokens?: number;
  /** Resolved runtime model compatibility hints. */
  modelCompat?: ModelCompatConfig;
  /**
   * Auth mode for the current provider. We only need this for Anthropic OAuth
   * tool-name blocking quirks.
   */
  modelAuthMode?: ModelAuthMode;
  /** Current channel ID for auto-threading (Slack). */
  currentChannelId?: string;
  /** Current thread timestamp for auto-threading (Slack). */
  currentThreadTs?: string;
  /** Current inbound message id for action fallbacks (e.g. Telegram react). */
  currentMessageId?: string | number;
  /** Group id for channel-level tool policy resolution. */
  groupId?: string | null;
  /** Group channel label (e.g. #general) for channel-level tool policy resolution. */
  groupChannel?: string | null;
  /** Group space label (e.g. guild/team id) for channel-level tool policy resolution. */
  groupSpace?: string | null;
  /** Parent session key for subagent group policy inheritance. */
  spawnedBy?: string | null;
  senderId?: string | null;
  senderName?: string | null;
  senderUsername?: string | null;
  senderE164?: string | null;
  /** Reply-to mode for Slack auto-threading. */
  replyToMode?: "off" | "first" | "all" | "batched";
  /** Mutable ref to track if a reply was sent (for "first" mode). */
  hasRepliedRef?: { value: boolean };
  /** Allow plugin tools for this run to late-bind the gateway subagent. */
  allowGatewaySubagentBinding?: boolean;
  /** If true, the model has native vision capability */
  modelHasVision?: boolean;
  /** Require explicit message targets (no implicit last-route sends). */
  requireExplicitMessageTarget?: boolean;
  /** If true, omit the message tool from the tool list. */
  disableMessageTool?: boolean;
  /** Additional caller-owned tools inserted before the shared policy pipeline. */
  extraTools?: AnyAgentTool[];
  /**
   * Runner-owned native runtime tools inserted before the shared policy
   * pipeline and therefore visible to the same effective inventory path as the
   * rest of OpenClaw's native tools.
   */
  nativeRuntimeTools?: AnyAgentTool[];
  /** Optional node-scoped authority overlay that narrows native file/exec tools. */
  nodeAuthorityOverlay?: OpenClawNodeAuthorityOverlay;
  /** Optional OpenClaw-native guard for execution node parent crawl behavior. */
  nodeAgentParentCrawlGuard?: { enabled: boolean };
  /** Optional caller-owned LSP service. When provided, the caller owns shutdown. */
  lspService?: OpenClawLspService;
  /**
   * Native executable-node parent mode. This makes catalog filtering the
   * primary control plane: the parent sees task/todo/mutation/resource/finish,
   * while search/read/exec/raw-session mechanics remain owned by scouts and
   * OpenClaw internals.
   */
  nodeAgentNativeTaskMode?: {
    enabled: boolean;
    allowedAgentIds: readonly string[];
    mutationToolName?: string;
    parentVisibleResultMaxChars?: number;
    runChildTask?: NativeTaskRunChildTask;
  };
  /** Whether the sender is an owner (required for owner-only tools). */
  senderIsOwner?: boolean;
  /** Callback invoked when sessions_yield tool is called. */
  onYield?: (message: string) => Promise<void> | void;
}): AnyAgentTool[] {
  const execToolName = "exec";
  const sandbox = options?.sandbox?.enabled ? options.sandbox : undefined;
  const isMemoryFlushRun = options?.trigger === "memory";
  if (isMemoryFlushRun && !options?.memoryFlushWritePath) {
    throw new Error("memoryFlushWritePath required for memory-triggered tool runs");
  }
  const memoryFlushWritePath = isMemoryFlushRun ? options.memoryFlushWritePath : undefined;
  const {
    agentId,
    globalPolicy,
    globalProviderPolicy,
    agentPolicy,
    agentProviderPolicy,
    profile,
    providerProfile,
    profileAlsoAllow,
    providerProfileAlsoAllow,
  } = resolveEffectiveToolPolicy({
    config: options?.config,
    sessionKey: options?.sessionKey,
    agentId: options?.agentId,
    modelProvider: options?.modelProvider,
    modelId: options?.modelId,
  });
  // Prefer the already-resolved sandbox context policy. Recomputing from
  // sessionKey/config can lose the real sandbox agent when callers pass a
  // legacy alias like `main` instead of an agent session key.
  const sandboxToolPolicy = sandbox?.tools;
  const groupPolicy = resolveGroupToolPolicy({
    config: options?.config,
    sessionKey: options?.sessionKey,
    spawnedBy: options?.spawnedBy,
    messageProvider: options?.messageProvider,
    groupId: options?.groupId,
    groupChannel: options?.groupChannel,
    groupSpace: options?.groupSpace,
    accountId: options?.agentAccountId,
    senderId: options?.senderId,
    senderName: options?.senderName,
    senderUsername: options?.senderUsername,
    senderE164: options?.senderE164,
  });
  const profilePolicy = resolveToolProfilePolicy(profile);
  const providerProfilePolicy = resolveToolProfilePolicy(providerProfile);
  const subagentPolicy =
    isSubagentSessionKey(options?.sessionKey) && options?.sessionKey
      ? resolveSubagentToolPolicyForSession(options.config, options.sessionKey)
      : undefined;

  const nodeNativeTaskParentMode = options?.nodeAgentNativeTaskMode;
  const nodeNativeTaskMutationToolName = normalizeToolName(
    options?.nodeAgentNativeTaskMode?.mutationToolName ?? "edit",
  );
  const nodeNativeTaskAlsoAllow = isExecutionCodingNodeParent({
    agentId,
    requestedAgentId: options?.agentId,
    sessionKey: options?.sessionKey,
    nodeNativeTaskEnabled: options?.nodeAgentNativeTaskMode?.enabled,
  })
    ? [nodeNativeTaskMutationToolName]
    : undefined;
  const profilePolicyWithAlsoAllow = stripNodeAgentNativeTaskParentDenyPolicy({
    policy: mergeAlsoAllowPolicy(
      mergeAlsoAllowPolicy(profilePolicy, profileAlsoAllow),
      nodeNativeTaskAlsoAllow,
    ),
    mode: nodeNativeTaskParentMode,
  });
  const providerProfilePolicyWithAlsoAllow = stripNodeAgentNativeTaskParentDenyPolicy({
    policy: mergeAlsoAllowPolicy(
      mergeAlsoAllowPolicy(providerProfilePolicy, providerProfileAlsoAllow),
      nodeNativeTaskAlsoAllow,
    ),
    mode: nodeNativeTaskParentMode,
  });
  const nodeNativeTaskGlobalPolicy = stripNodeAgentNativeTaskParentDenyPolicy({
    policy: mergeAlsoAllowPolicy(globalPolicy, nodeNativeTaskAlsoAllow),
    mode: nodeNativeTaskParentMode,
  });
  const nodeNativeTaskGlobalProviderPolicy = stripNodeAgentNativeTaskParentDenyPolicy({
    policy: mergeAlsoAllowPolicy(globalProviderPolicy, nodeNativeTaskAlsoAllow),
    mode: nodeNativeTaskParentMode,
  });
  const nodeNativeTaskAgentPolicy = stripNodeAgentNativeTaskParentDenyPolicy({
    policy: mergeAlsoAllowPolicy(agentPolicy, nodeNativeTaskAlsoAllow),
    mode: nodeNativeTaskParentMode,
  });
  const nodeNativeTaskAgentProviderPolicy = stripNodeAgentNativeTaskParentDenyPolicy({
    policy: mergeAlsoAllowPolicy(agentProviderPolicy, nodeNativeTaskAlsoAllow),
    mode: nodeNativeTaskParentMode,
  });
  const nodeNativeTaskGroupPolicy = stripNodeAgentNativeTaskParentDenyPolicy({
    policy: mergeAlsoAllowPolicy(groupPolicy, nodeNativeTaskAlsoAllow),
    mode: nodeNativeTaskParentMode,
  });
  const nativeTaskPolicyPreservesLocalDeny =
    options?.nodeAgentNativeTaskMode?.enabled === true &&
    [
      profilePolicy,
      providerProfilePolicy,
      globalPolicy,
      globalProviderPolicy,
      agentPolicy,
      agentProviderPolicy,
      groupPolicy,
    ].some(
      (policy) =>
        policy?.deny?.some((toolName) =>
          isNodeAgentNativeTaskParentToolAllowed({
            toolName,
            mutationToolName: options.nodeAgentNativeTaskMode?.mutationToolName,
          }),
        ) === true,
    );
  if (nativeTaskPolicyPreservesLocalDeny) {
    logWarn(
      "node native task mode ignored local deny entries for first-party parent tools; exact read/mutation guards still apply",
    );
  }
  const globalPolicyForToolFiltering = nodeNativeTaskGlobalPolicy;
  const globalProviderPolicyForToolFiltering = nodeNativeTaskGlobalProviderPolicy;
  const agentPolicyForToolFiltering = nodeNativeTaskAgentPolicy;
  const agentProviderPolicyForToolFiltering = nodeNativeTaskAgentProviderPolicy;
  const groupPolicyForToolFiltering = nodeNativeTaskGroupPolicy;
  const sandboxPolicyForToolFiltering = sandboxToolPolicy;
  const subagentPolicyForToolFiltering = subagentPolicy;
  const nodeNativeTaskToolPolicies = [
    profilePolicyWithAlsoAllow,
    providerProfilePolicyWithAlsoAllow,
    globalPolicyForToolFiltering,
    globalProviderPolicyForToolFiltering,
    agentPolicyForToolFiltering,
    agentProviderPolicyForToolFiltering,
    groupPolicyForToolFiltering,
    sandboxPolicyForToolFiltering,
    subagentPolicyForToolFiltering,
  ];
  // Prefer sessionKey for process isolation scope to prevent cross-session process visibility/killing.
  // Fallback to agentId if no sessionKey is available (e.g. legacy or global contexts).
  const scopeKey =
    options?.exec?.scopeKey ?? options?.sessionKey ?? (agentId ? `agent:${agentId}` : undefined);
  const allowBackground = isToolAllowedByPolicies("process", [...nodeNativeTaskToolPolicies]);
  const execConfig = resolveExecConfig({ cfg: options?.config, agentId });
  const fsConfig = resolveToolFsConfig({ cfg: options?.config, agentId });
  const fsPolicy = createToolFsPolicy({
    workspaceOnly: isMemoryFlushRun || fsConfig.workspaceOnly,
  });
  const sandboxRoot = sandbox?.workspaceDir;
  const sandboxFsBridge = sandbox?.fsBridge;
  const allowWorkspaceWrites = sandbox?.workspaceAccess !== "ro";
  const workspaceRoot = resolveWorkspaceRoot(options?.workspaceDir);
  const stateRoot = options?.stateRoot ?? resolveStateDir(process.env);
  const toolBudgetPolicy = resolveAgentToolBudgetPolicy(agentId);
  const workspaceOnly = fsPolicy.workspaceOnly;
  const lspService = sandboxRoot
    ? undefined
    : (options?.lspService ?? createOpenClawLspService({ workspaceRoot, externalEnabled: false }));
  const applyPatchConfig = execConfig.applyPatch;
  // Secure by default: apply_patch is workspace-contained unless explicitly disabled.
  // (tools.fs.workspaceOnly is a separate umbrella flag for read/write/edit/apply_patch.)
  const applyPatchWorkspaceOnly = workspaceOnly || applyPatchConfig?.workspaceOnly !== false;
  const nodeExecutionCodingApplyPatchEnabled =
    nodeNativeTaskMutationToolName === "apply_patch" &&
    isExecutionCodingNodeParent({
      agentId,
      requestedAgentId: options?.agentId,
      sessionKey: options?.sessionKey,
      nodeNativeTaskEnabled: options?.nodeAgentNativeTaskMode?.enabled,
    });
  const applyPatchProviderAllowed =
    isOpenAIProvider(options?.modelProvider) || nodeExecutionCodingApplyPatchEnabled;
  const applyPatchEnabled =
    applyPatchConfig?.enabled !== false &&
    applyPatchProviderAllowed &&
    isApplyPatchAllowedForModel({
      modelProvider: options?.modelProvider,
      modelId: options?.modelId,
      allowModels: applyPatchConfig?.allowModels,
    });

  if (sandboxRoot && !sandboxFsBridge) {
    throw new Error("Sandbox filesystem bridge is unavailable.");
  }
  const imageSanitization = resolveImageSanitizationLimits(options?.config);

  const base = (codingTools as unknown as AnyAgentTool[]).flatMap((tool) => {
    if (tool.name === readTool.name) {
      if (sandboxRoot) {
        const sandboxed = createSandboxedReadTool({
          root: sandboxRoot,
          bridge: sandboxFsBridge!,
          modelContextWindowTokens: options?.modelContextWindowTokens,
          imageSanitization,
          defaultLineLimit: toolBudgetPolicy.readDefaultLineLimit,
          maxBytes: toolBudgetPolicy.readMaxBytes,
          stateRoot,
        });
        return [
          workspaceOnly
            ? wrapToolWorkspaceRootGuardWithOptions(sandboxed, sandboxRoot, {
                containerWorkdir: sandbox.containerWorkdir,
              })
            : sandboxed,
        ];
      }
      const freshReadTool = createReadTool(workspaceRoot);
      const wrapped = createOpenClawReadTool(freshReadTool, {
        modelContextWindowTokens: options?.modelContextWindowTokens,
        imageSanitization,
        workspaceRoot,
        defaultLineLimit: toolBudgetPolicy.readDefaultLineLimit,
        maxBytes: toolBudgetPolicy.readMaxBytes,
        stateRoot,
        lspService,
      });
      return [workspaceOnly ? wrapToolWorkspaceRootGuard(wrapped, workspaceRoot) : wrapped];
    }
    if (tool.name === "bash" || tool.name === execToolName) {
      return [];
    }
    if (tool.name === "write") {
      if (sandboxRoot) {
        return [];
      }
      const wrapped = createHostWorkspaceWriteTool(workspaceRoot, { workspaceOnly, lspService });
      return [workspaceOnly ? wrapToolWorkspaceRootGuard(wrapped, workspaceRoot) : wrapped];
    }
    if (tool.name === "edit") {
      if (sandboxRoot) {
        return [];
      }
      const wrapped = createHostWorkspaceEditTool(workspaceRoot, { workspaceOnly, lspService });
      return [workspaceOnly ? wrapToolWorkspaceRootGuard(wrapped, workspaceRoot) : wrapped];
    }
    return [tool];
  });
  const { cleanupMs: cleanupMsOverride, ...execDefaults } = options?.exec ?? {};
  const execTool = createLazyExecTool({
    ...execDefaults,
    host: options?.exec?.host ?? execConfig.host,
    security: options?.exec?.security ?? execConfig.security,
    ask: options?.exec?.ask ?? execConfig.ask,
    trigger: options?.trigger,
    node: options?.exec?.node ?? execConfig.node,
    pathPrepend: options?.exec?.pathPrepend ?? execConfig.pathPrepend,
    safeBins: options?.exec?.safeBins ?? execConfig.safeBins,
    strictInlineEval: options?.exec?.strictInlineEval ?? execConfig.strictInlineEval,
    safeBinTrustedDirs: options?.exec?.safeBinTrustedDirs ?? execConfig.safeBinTrustedDirs,
    safeBinProfiles: options?.exec?.safeBinProfiles ?? execConfig.safeBinProfiles,
    agentId,
    cwd: workspaceRoot,
    allowBackground,
    scopeKey,
    sessionKey: options?.sessionKey,
    messageProvider: options?.messageProvider,
    currentChannelId: options?.currentChannelId,
    currentThreadTs: options?.currentThreadTs,
    accountId: options?.agentAccountId,
    backgroundMs: options?.exec?.backgroundMs ?? execConfig.backgroundMs,
    timeoutSec: options?.exec?.timeoutSec ?? execConfig.timeoutSec,
    approvalRunningNoticeMs:
      options?.exec?.approvalRunningNoticeMs ?? execConfig.approvalRunningNoticeMs,
    notifyOnExit: options?.exec?.notifyOnExit ?? execConfig.notifyOnExit,
    notifyOnExitEmptySuccess:
      options?.exec?.notifyOnExitEmptySuccess ?? execConfig.notifyOnExitEmptySuccess,
    stateRoot,
    sandbox: sandbox
      ? {
          containerName: sandbox.containerName,
          workspaceDir: sandbox.workspaceDir,
          containerWorkdir: sandbox.containerWorkdir,
          env: sandbox.backend?.env ?? sandbox.docker.env,
          buildExecSpec: sandbox.backend?.buildExecSpec.bind(sandbox.backend),
          finalizeExec: sandbox.backend?.finalizeExec?.bind(sandbox.backend),
        }
      : undefined,
  });
  const processTool = createLazyProcessTool({
    cleanupMs: cleanupMsOverride ?? execConfig.cleanupMs,
    scopeKey,
  });
  const applyPatchTool =
    !applyPatchEnabled || (sandboxRoot && !allowWorkspaceWrites)
      ? null
      : createApplyPatchTool({
          cwd: sandboxRoot ?? workspaceRoot,
          sandbox:
            sandboxRoot && allowWorkspaceWrites
              ? { root: sandboxRoot, bridge: sandboxFsBridge! }
              : undefined,
          workspaceOnly: applyPatchWorkspaceOnly,
          lspService,
        });
  const repoDiscoveryTools = sandboxRoot
    ? []
    : [
        createListTool({
          workspaceRoot,
          stateRoot,
          defaultMaxResults: toolBudgetPolicy.discoveryDefaultMaxResults,
        }),
        createGlobTool({
          workspaceRoot,
          stateRoot,
          defaultMaxResults: toolBudgetPolicy.discoveryDefaultMaxResults,
        }),
        createGrepTool({
          workspaceRoot,
          stateRoot,
          defaultMaxMatches: toolBudgetPolicy.discoveryDefaultMaxMatches,
        }),
        ...(lspService ? [createLspTool({ workspaceRoot, lspService })] : []),
      ];
  if (
    options?.nodeAgentNativeTaskMode?.enabled === true &&
    !options.nodeAgentNativeTaskMode.runChildTask
  ) {
    throw new Error("node native task mode requires OpenClaw session-runtime runChildTask");
  }
  const tools: AnyAgentTool[] = [
    ...base,
    ...repoDiscoveryTools,
    ...(sandboxRoot
      ? allowWorkspaceWrites
        ? [
            workspaceOnly
              ? wrapToolWorkspaceRootGuardWithOptions(
                  createSandboxedEditTool({ root: sandboxRoot, bridge: sandboxFsBridge! }),
                  sandboxRoot,
                  {
                    containerWorkdir: sandbox.containerWorkdir,
                  },
                )
              : createSandboxedEditTool({ root: sandboxRoot, bridge: sandboxFsBridge! }),
            workspaceOnly
              ? wrapToolWorkspaceRootGuardWithOptions(
                  createSandboxedWriteTool({ root: sandboxRoot, bridge: sandboxFsBridge! }),
                  sandboxRoot,
                  {
                    containerWorkdir: sandbox.containerWorkdir,
                  },
                )
              : createSandboxedWriteTool({ root: sandboxRoot, bridge: sandboxFsBridge! }),
          ]
        : []
      : []),
    ...(applyPatchTool ? [applyPatchTool as unknown as AnyAgentTool] : []),
    execTool as unknown as AnyAgentTool,
    processTool as unknown as AnyAgentTool,
    // Channel docking: include channel-defined agent tools (login, etc.).
    ...listChannelAgentTools({ cfg: options?.config }),
    ...createOpenClawTools({
      sandboxBrowserBridgeUrl: sandbox?.browser?.bridgeUrl,
      allowHostBrowserControl: sandbox ? sandbox.browserAllowHostControl : true,
      agentSessionKey: options?.sessionKey,
      agentChannel: resolveGatewayMessageChannel(options?.messageProvider),
      agentAccountId: options?.agentAccountId,
      agentTo: options?.messageTo,
      agentThreadId: options?.messageThreadId,
      agentGroupId: options?.groupId ?? null,
      agentGroupChannel: options?.groupChannel ?? null,
      agentGroupSpace: options?.groupSpace ?? null,
      agentDir: options?.agentDir,
      sandboxRoot,
      sandboxContainerWorkdir: sandbox?.containerWorkdir,
      sandboxFsBridge,
      fsPolicy,
      workspaceDir: workspaceRoot,
      spawnWorkspaceDir: options?.spawnWorkspaceDir
        ? resolveWorkspaceRoot(options.spawnWorkspaceDir)
        : undefined,
      sandboxed: !!sandbox,
      config: options?.config,
      pluginToolAllowlist: collectExplicitAllowlist([
        profilePolicy,
        providerProfilePolicy,
        globalPolicyForToolFiltering,
        globalProviderPolicyForToolFiltering,
        agentPolicyForToolFiltering,
        agentProviderPolicyForToolFiltering,
        groupPolicyForToolFiltering,
        sandboxToolPolicy,
        subagentPolicy,
      ]),
      currentChannelId: options?.currentChannelId,
      currentThreadTs: options?.currentThreadTs,
      currentMessageId: options?.currentMessageId,
      modelProvider: options?.modelProvider,
      modelId: options?.modelId,
      replyToMode: options?.replyToMode,
      hasRepliedRef: options?.hasRepliedRef,
      modelHasVision: options?.modelHasVision,
      requireExplicitMessageTarget: options?.requireExplicitMessageTarget,
      disableMessageTool: options?.disableMessageTool,
      omitOpenClawResourceReadTool:
        isExecutionCodingNodeParent({
          agentId,
          requestedAgentId: options?.agentId,
          sessionKey: options?.sessionKey,
          nodeNativeTaskEnabled: options?.nodeAgentNativeTaskMode?.enabled,
        }) || options?.nativeRuntimeTools?.some((tool) => tool.name === "openclaw_resource_read"),
      forceUpdatePlanTool: options?.nodeAgentNativeTaskMode?.enabled === true,
      ...(options?.nodeAgentNativeTaskMode?.enabled === true
        ? {
            nativeTask: {
              enabled: true,
              allowedAgentIds: options.nodeAgentNativeTaskMode.allowedAgentIds,
              ...(typeof options.nodeAgentNativeTaskMode.parentVisibleResultMaxChars === "number"
                ? {
                    parentVisibleResultMaxChars:
                      options.nodeAgentNativeTaskMode.parentVisibleResultMaxChars,
                  }
                : {}),
              runChildTask: options.nodeAgentNativeTaskMode.runChildTask!,
            },
          }
        : {}),
      requesterAgentIdOverride: agentId,
      requesterSenderId: options?.senderId,
      senderIsOwner: options?.senderIsOwner,
      sessionId: options?.sessionId,
      runId: options?.runId,
      onYield: options?.onYield,
      allowGatewaySubagentBinding: options?.allowGatewaySubagentBinding,
    }),
    ...(options?.nativeRuntimeTools ?? []),
    ...(options?.extraTools ?? []),
  ];
  const toolsForMemoryFlush =
    isMemoryFlushRun && memoryFlushWritePath
      ? tools.flatMap((tool) => {
          if (!MEMORY_FLUSH_ALLOWED_TOOL_NAMES.has(tool.name)) {
            return [];
          }
          if (tool.name === "write") {
            return [
              wrapToolMemoryFlushAppendOnlyWrite(tool, {
                root: sandboxRoot ?? workspaceRoot,
                relativePath: memoryFlushWritePath,
                containerWorkdir: sandbox?.containerWorkdir,
                sandbox:
                  sandboxRoot && sandboxFsBridge
                    ? { root: sandboxRoot, bridge: sandboxFsBridge }
                    : undefined,
              }),
            ];
          }
          return [tool];
        })
      : tools;
  const toolsForMessageProvider = filterToolsByMessageProvider(
    toolsForMemoryFlush,
    options?.messageProvider,
  );
  const toolsForModelProvider = applyModelProviderToolPolicy(toolsForMessageProvider, {
    config: options?.config,
    modelProvider: options?.modelProvider,
    modelApi: options?.modelApi,
    modelId: options?.modelId,
    agentDir: options?.agentDir,
    modelCompat: options?.modelCompat,
  });
  // Security: treat unknown/undefined as unauthorized (opt-in, not opt-out)
  const senderIsOwner = options?.senderIsOwner === true;
  const toolsByAuthorization = applyOwnerOnlyToolPolicy(toolsForModelProvider, senderIsOwner);
  const subagentFiltered = applyToolPolicyPipeline({
    tools: toolsByAuthorization,
    toolMeta: (tool) => getPluginToolMeta(tool),
    warn: logWarn,
    steps: [
      ...buildDefaultToolPolicyPipelineSteps({
        profilePolicy: profilePolicyWithAlsoAllow,
        profile,
        profileUnavailableCoreWarningAllowlist: profilePolicy?.allow,
        providerProfilePolicy: providerProfilePolicyWithAlsoAllow,
        providerProfile,
        providerProfileUnavailableCoreWarningAllowlist: providerProfilePolicy?.allow,
        globalPolicy: globalPolicyForToolFiltering,
        globalProviderPolicy: globalProviderPolicyForToolFiltering,
        agentPolicy: agentPolicyForToolFiltering,
        agentProviderPolicy: agentProviderPolicyForToolFiltering,
        groupPolicy: groupPolicyForToolFiltering,
        agentId,
      }),
      { policy: sandboxToolPolicy, label: "sandbox tools.allow" },
      { policy: subagentPolicy, label: "subagent tools.allow" },
    ],
  });
  const nodeNativeTaskMutationRestored =
    nodeExecutionCodingApplyPatchEnabled &&
    applyPatchTool &&
    !subagentFiltered.some((tool) => tool.name === "apply_patch")
      ? [...subagentFiltered, applyPatchTool as unknown as AnyAgentTool]
      : subagentFiltered;
  const nodeAuthorityFiltered = applyNodeAuthorityOverlay({
    tools: nodeNativeTaskMutationRestored,
    overlay: options?.nodeAuthorityOverlay,
    workspaceRoot: sandboxRoot ?? workspaceRoot,
    sandboxContainerWorkdir: sandbox?.containerWorkdir,
  });
  const nodeNativeTaskFiltered = filterToolsForNodeAgentNativeTaskMode({
    tools: nodeAuthorityFiltered,
    mode: options?.nodeAgentNativeTaskMode,
  });
  const nodeNativeTaskParentReadGuarded = wrapToolsWithNodeParentExactReadGuard({
    tools: nodeNativeTaskFiltered,
    enabled:
      options?.nodeAgentNativeTaskMode?.enabled === true &&
      normalizeLowercaseStringOrEmpty(agentId ?? "") === "execution-coding",
    workspaceRoot: sandboxRoot ?? workspaceRoot,
    sandboxContainerWorkdir: sandbox?.containerWorkdir,
  });
  const executionScoutFiltered = filterToolsForExecutionScoutMode({
    tools: nodeNativeTaskParentReadGuarded,
    agentId,
  });
  const nodeParentCrawlGuarded = wrapToolsWithNodeParentCrawlGuard({
    tools: executionScoutFiltered,
    enabled:
      options?.nodeAgentNativeTaskMode?.enabled === true
        ? false
        : options?.nodeAgentParentCrawlGuard?.enabled,
    workspaceRoot: sandboxRoot ?? workspaceRoot,
  });
  const executionRoleToolReminded = wrapToolsWithExecutionRoleToolReminders({
    tools: nodeParentCrawlGuarded,
    agentId,
    nodeNativeTaskParentMode: options?.nodeAgentNativeTaskMode?.enabled === true,
  });
  // Always normalize tool JSON Schemas before handing them to pi-agent/pi-ai.
  // Without this, some providers (notably OpenAI) will reject root-level union schemas.
  // Provider-specific cleaning: Gemini needs constraint keywords stripped, but Anthropic expects them.
  const normalized = executionRoleToolReminded.map((tool) =>
    normalizeToolParameters(tool, {
      modelProvider: options?.modelProvider,
      modelId: options?.modelId,
      modelCompat: options?.modelCompat,
    }),
  );
  const withHooks = normalized.map((tool) =>
    wrapToolWithBeforeToolCallHook(tool, {
      agentId,
      sessionKey: options?.sessionKey,
      sessionId: options?.sessionId,
      runId: options?.runId,
      loopDetection: resolveToolLoopDetectionConfig({ cfg: options?.config, agentId }),
    }),
  );
  const withAbort = options?.abortSignal
    ? withHooks.map((tool) => wrapToolWithAbortSignal(tool, options.abortSignal))
    : withHooks;
  const withDeferredFollowupDescriptions = applyDeferredFollowupToolDescriptions(withAbort, {
    agentId,
  });
  const finalReadTool = withDeferredFollowupDescriptions.find((tool) => tool.name === "read");
  const finalDocumentIngestTool = withDeferredFollowupDescriptions.find(
    (tool) => tool.name === "model_memory_document_ingest",
  );
  const withDocumentArbitration =
    !finalReadTool || !finalDocumentIngestTool
      ? withDeferredFollowupDescriptions
      : withDeferredFollowupDescriptions.map((tool) =>
          tool === finalReadTool
            ? wrapReadToolWithDocumentIngestArbitration(tool, {
                workspaceRoot,
                ingestTool: finalDocumentIngestTool,
                warn: logWarn,
              })
            : tool,
        );

  // NOTE: Keep canonical (lowercase) tool names here.
  // pi-ai's Anthropic OAuth transport remaps tool names to Claude Code-style names
  // on the wire and maps them back for tool dispatch.
  return orderExecutionParentProviderTools({
    tools: withDocumentArbitration,
    agentId,
    requestedAgentId: options?.agentId,
    sessionKey: options?.sessionKey,
    nodeNativeTaskEnabled: options?.nodeAgentNativeTaskMode?.enabled,
  });
}
