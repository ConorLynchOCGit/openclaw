import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  resolveCodexAppServerRuntimeOptions,
  type CodexDynamicToolCallParams,
  type CodexDynamicToolCallResponse,
  type CodexDynamicToolSpec,
  type CodexServerNotification,
  type CodexThreadItem,
  type CodexThreadStartResponse,
  type CodexTurn,
  type CodexTurnStartResponse,
  createIsolatedCodexAppServerClient,
  getSharedCodexAppServerClient,
} from "../../../codex/runtime-api.ts";
import type { JsonValue } from "../runtime-job-repository.ts";
import type { CodexProcessDescriptor, SupervisorProcessCallbacks } from "./execution-supervisor.ts";
import type { LiveCodexRunnerResult, LiveCodexRunnerValidation } from "./live-codex-runner.ts";

type AssistantCaptureState = {
  textByItem: Map<string, string>;
  order: string[];
};

type ParityToolRuntime = {
  cwd: string;
  approvedScopeRefs: string[];
  validationCommandRefs: string[];
};

type NormalizedCodexProgressEvent = {
  artifactKind: "codex_app_server_parity_progress_event";
  method: string;
  threadId: string;
  turnId: string;
  phase: string;
  itemId?: string;
  itemType?: string;
  itemStatus?: string;
  commandRef?: string;
  fileRefs?: string[];
  deltaBytes?: number;
  deltaHash?: string;
  errorCode?: string;
  errorMessageHash?: string;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

function readString(record: Record<string, unknown>, key: string): string | undefined {
  return typeof record[key] === "string" ? record[key] : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedText(value: string, maxBytes = 24_000): string {
  const buffer = Buffer.from(value, "utf8");
  if (buffer.byteLength <= maxBytes) {
    return value;
  }
  return `${buffer.subarray(0, maxBytes).toString("utf8")}\n[bounded_truncation_applied]`;
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function boundedStringArray(value: unknown, max = 20): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 500))
    .slice(0, max);
}

function normalizeCodexProgressEvent(
  notification: CodexServerNotification,
  threadId: string,
  turnId: string,
): NormalizedCodexProgressEvent | null {
  const params = notificationParamsForTurn(notification, threadId, turnId);
  const completedTurn = completedTurnFromNotification(notification, threadId, turnId);
  if (!params && !completedTurn) {
    return null;
  }
  const item = params ? readRecord(params.item) : null;
  const itemId =
    (params ? (readString(params, "itemId") ?? readString(params, "id")) : undefined) ??
    (typeof item?.id === "string" ? item.id : undefined);
  const itemType = typeof item?.type === "string" ? item.type : undefined;
  const itemStatus =
    typeof item?.status === "string" ? item.status : (completedTurn?.status ?? undefined);
  const delta = params ? readString(params, "delta") : undefined;
  const commandRef =
    typeof item?.command === "string"
      ? item.command.slice(0, 500)
      : typeof item?.cmd === "string"
        ? item.cmd.slice(0, 500)
        : undefined;
  const fileRefs = [
    ...boundedStringArray(item?.files),
    ...boundedStringArray(item?.fileRefs),
    ...(typeof item?.path === "string" ? [item.path.slice(0, 500)] : []),
  ].slice(0, 20);
  const errorMessage =
    completedTurn?.error?.message ??
    (params && typeof params.message === "string" ? params.message : undefined);
  return {
    artifactKind: "codex_app_server_parity_progress_event",
    method: notification.method,
    threadId,
    turnId,
    phase:
      notification.method === "item/agentMessage/delta"
        ? "agent_message_delta"
        : notification.method === "item/reasoning/textDelta" ||
            notification.method === "item/reasoning/summaryTextDelta"
          ? "reasoning_delta"
          : notification.method === "item/plan/delta" || notification.method === "turn/plan/updated"
            ? "plan_updated"
            : notification.method === "item/started"
              ? "item_started"
              : notification.method === "item/completed"
                ? "item_completed"
                : notification.method === "turn/completed"
                  ? "turn_completed"
                  : notification.method === "error"
                    ? "error"
                    : "notification",
    ...(itemId ? { itemId } : {}),
    ...(itemType ? { itemType } : {}),
    ...(itemStatus ? { itemStatus } : {}),
    ...(commandRef ? { commandRef } : {}),
    ...(fileRefs.length > 0 ? { fileRefs } : {}),
    ...(delta
      ? {
          deltaBytes: Buffer.byteLength(delta, "utf8"),
          deltaHash: sha256Text(delta),
        }
      : {}),
    ...(errorMessage
      ? {
          errorCode: "codex_app_server_notification_error",
          errorMessageHash: sha256Text(errorMessage),
        }
      : {}),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function validationProcessEnv(): NodeJS.ProcessEnv {
  return { ...process.env, NODE_ENV: "test" };
}

function normalizeRepoRelativePath(cwd: string, filePath: string): string | null {
  const trimmed = filePath.trim();
  if (!trimmed || trimmed.includes("\0")) {
    return null;
  }
  const absolute = path.isAbsolute(trimmed)
    ? path.normalize(trimmed)
    : path.normalize(path.join(cwd, trimmed));
  const relative = path.relative(cwd, absolute).replace(/\\/gu, "/");
  if (!relative || relative.startsWith("../") || path.isAbsolute(relative)) {
    return null;
  }
  return relative;
}

function isWithinScope(fileRef: string, approvedScopeRefs: string[]): boolean {
  return approvedScopeRefs.some((scope) => {
    const normalizedScope = scope.trim().replace(/\\/gu, "/").replace(/\/+$/u, "");
    if (!normalizedScope) {
      return false;
    }
    return fileRef === normalizedScope || fileRef.startsWith(`${normalizedScope}/`);
  });
}

function patchTouchedFiles(patchText: string): string[] {
  const touched = new Set<string>();
  for (const line of patchText.split(/\r?\n/u)) {
    const diff = line.match(/^diff --git a\/(.+?) b\/(.+)$/u);
    if (diff) {
      touched.add(diff[1]!.trim());
      touched.add(diff[2]!.trim());
      continue;
    }
    const file = line.match(/^(?:---|\+\+\+) (?:a|b)\/(.+)$/u);
    if (file) {
      const candidate = file[1]!.trim();
      if (candidate !== "/dev/null") {
        touched.add(candidate);
      }
    }
  }
  return [...touched].filter((value) => value && value !== "/dev/null").slice(0, 80);
}

async function runProcess(input: {
  cwd: string;
  command: string;
  args: string[];
  stdin?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return await new Promise((resolve) => {
    let settled = false;
    const settle = (value: { exitCode: number | null; stdout: string; stderr: string }): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve(value);
    };
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: input.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
    }, input.timeoutMs ?? 120_000);
    timeout.unref?.();
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      settle({
        exitCode: null,
        stdout: boundedText(stdout, 12_000),
        stderr: boundedText(`${stderr}\n${error.message}`.trim(), 12_000),
      });
    });
    child.on("close", (exitCode) => {
      settle({
        exitCode,
        stdout: boundedText(stdout, 12_000),
        stderr: boundedText(stderr, 12_000),
      });
    });
    if (input.stdin) {
      child.stdin.end(input.stdin);
    } else {
      child.stdin.end();
    }
  });
}

const REPO_WALK_EXCLUDED_DIRS = new Set([
  ".artifacts",
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
]);

function globMatches(fileRef: string, glob: string | undefined): boolean {
  if (!glob) {
    return true;
  }
  const trimmed = glob.trim();
  if (!trimmed) {
    return true;
  }
  if (trimmed.startsWith("*.")) {
    return fileRef.endsWith(trimmed.slice(1));
  }
  if (trimmed.endsWith("/")) {
    return fileRef.startsWith(trimmed);
  }
  return fileRef.includes(trimmed.replace(/\*/gu, ""));
}

async function walkRepoFiles(input: {
  cwd: string;
  roots: string[];
  maxFiles?: number;
  glob?: string;
}): Promise<string[]> {
  const files: string[] = [];
  const maxFiles = input.maxFiles ?? 2_000;
  async function walk(relativeRoot: string): Promise<void> {
    if (files.length >= maxFiles) {
      return;
    }
    const normalizedRoot = relativeRoot.replace(/\\/gu, "/").replace(/^\.\/+/u, "");
    const basename = path.basename(normalizedRoot);
    if (REPO_WALK_EXCLUDED_DIRS.has(basename)) {
      return;
    }
    const absolute = path.join(input.cwd, normalizedRoot);
    const stat = await fs.stat(absolute).catch(() => null);
    if (!stat) {
      return;
    }
    if (stat.isFile()) {
      if (globMatches(normalizedRoot, input.glob)) {
        files.push(normalizedRoot);
      }
      return;
    }
    if (!stat.isDirectory()) {
      return;
    }
    const entries = await fs.readdir(absolute, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (files.length >= maxFiles) {
        return;
      }
      if (entry.isDirectory() && REPO_WALK_EXCLUDED_DIRS.has(entry.name)) {
        continue;
      }
      await walk(path.join(normalizedRoot, entry.name));
    }
  }
  for (const root of input.roots) {
    const normalized = normalizeRepoRelativePath(input.cwd, root);
    if (normalized) {
      await walk(normalized);
    }
  }
  return [...new Set(files)].toSorted().slice(0, maxFiles);
}

async function searchRepoText(input: {
  cwd: string;
  roots: string[];
  query: string;
  pathFilter?: string;
}): Promise<{ matches: string[]; searchedFileCount: number; truncated: boolean }> {
  const roots = input.pathFilter ? [input.pathFilter] : input.roots;
  const files = await walkRepoFiles({ cwd: input.cwd, roots, maxFiles: 2_000 });
  const matches: string[] = [];
  for (const fileRef of files) {
    if (matches.length >= 200) {
      return { matches, searchedFileCount: files.length, truncated: true };
    }
    const absolute = path.join(input.cwd, fileRef);
    const stat = await fs.stat(absolute).catch(() => null);
    if (!stat?.isFile() || stat.size > 512_000) {
      continue;
    }
    const content = await fs.readFile(absolute, "utf8").catch(() => null);
    if (content === null) {
      continue;
    }
    const lines = content.split(/\r?\n/u);
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index]?.includes(input.query)) {
        matches.push(`${fileRef}:${index + 1}:${boundedText(lines[index] ?? "", 500)}`);
        if (matches.length >= 200) {
          return { matches, searchedFileCount: files.length, truncated: true };
        }
      }
    }
  }
  return { matches, searchedFileCount: files.length, truncated: false };
}

function inputText(text: string): CodexDynamicToolCallResponse {
  return { contentItems: [{ type: "inputText", text }], success: true };
}

function inputError(text: string): CodexDynamicToolCallResponse {
  return { contentItems: [{ type: "inputText", text }], success: false };
}

const PARITY_DYNAMIC_TOOLS: CodexDynamicToolSpec[] = [
  {
    name: "list_repo_files",
    description:
      "List repository files. Use before editing to locate relevant files. Output is bounded.",
    inputSchema: {
      type: "object",
      properties: {
        glob: { type: "string", description: "Optional rg --files glob, e.g. *.ts" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "search_repo",
    description:
      "Search repository text with ripgrep. Use for code discovery. Output is bounded and not stored as raw logs.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        path: { type: "string", description: "Optional repo-relative path or directory" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "read_repo_file",
    description:
      "Read a repo file by repo-relative path. Output is bounded. Use before constructing patches.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        maxBytes: { type: "number" },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "apply_unified_diff",
    description:
      "Apply a unified git diff to the live main repo. Every touched file must be inside OpenClaw approved editable scopes.",
    inputSchema: {
      type: "object",
      properties: {
        patch: { type: "string" },
      },
      required: ["patch"],
      additionalProperties: false,
    },
  },
  {
    name: "run_approved_validation",
    description:
      "Run one validation command only if it exactly matches a command approved by OpenClaw for this node.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string" },
      },
      required: ["command"],
      additionalProperties: false,
    },
  },
];

async function handleParityToolCall(
  runtime: ParityToolRuntime,
  call: CodexDynamicToolCallParams,
): Promise<CodexDynamicToolCallResponse> {
  const args = readRecord(call.arguments) ?? {};
  if (call.tool === "list_repo_files") {
    const glob = readString(args, "glob");
    const files = await walkRepoFiles({
      cwd: runtime.cwd,
      roots: runtime.approvedScopeRefs.length > 0 ? runtime.approvedScopeRefs : ["."],
      maxFiles: 1_000,
      glob,
    });
    return inputText(
      JSON.stringify({
        exitCode: 0,
        files: files.slice(0, 400),
        truncated: files.length > 400,
        reasonCodes: ["node_bounded_repo_file_listing_used"],
      }),
    );
  }
  if (call.tool === "search_repo") {
    const query = readString(args, "query");
    if (!query) {
      return inputError("query_required");
    }
    const requestedPath = readString(args, "path");
    const rel = requestedPath ? normalizeRepoRelativePath(runtime.cwd, requestedPath) : null;
    if (requestedPath && !rel) {
      return inputError("path_outside_repo");
    }
    if (rel && !isWithinScope(rel, runtime.approvedScopeRefs)) {
      return inputError("path_outside_approved_scope");
    }
    const result = await searchRepoText({
      cwd: runtime.cwd,
      roots: runtime.approvedScopeRefs.length > 0 ? runtime.approvedScopeRefs : ["."],
      query,
      pathFilter: rel ?? undefined,
    });
    return inputText(
      JSON.stringify({
        exitCode: 0,
        matches: result.matches,
        searchedFileCount: result.searchedFileCount,
        truncated: result.truncated,
        reasonCodes: ["node_bounded_repo_search_used"],
      }),
    );
  }
  if (call.tool === "read_repo_file") {
    const requestedPath = readString(args, "path");
    if (!requestedPath) {
      return inputError("path_required");
    }
    const rel = normalizeRepoRelativePath(runtime.cwd, requestedPath);
    if (!rel) {
      return inputError("path_outside_repo");
    }
    const maxBytes =
      typeof args.maxBytes === "number" && Number.isFinite(args.maxBytes)
        ? Math.max(1_000, Math.min(48_000, Math.trunc(args.maxBytes)))
        : 24_000;
    try {
      const content = await fs.readFile(path.join(runtime.cwd, rel), "utf8");
      return inputText(JSON.stringify({ path: rel, content: boundedText(content, maxBytes) }));
    } catch (error) {
      return inputError(error instanceof Error ? error.message : String(error));
    }
  }
  if (call.tool === "apply_unified_diff") {
    const patch = readString(args, "patch");
    if (!patch) {
      return inputError("patch_required");
    }
    const touchedFiles = patchTouchedFiles(patch)
      .map((file) => normalizeRepoRelativePath(runtime.cwd, file))
      .filter((file): file is string => Boolean(file));
    if (touchedFiles.length === 0) {
      return inputError("patch_touched_files_missing");
    }
    const outOfScope = touchedFiles.filter(
      (file) => !isWithinScope(file, runtime.approvedScopeRefs),
    );
    if (outOfScope.length > 0) {
      return inputError(`patch_out_of_scope:${outOfScope.slice(0, 12).join(",")}`);
    }
    const result = await runProcess({
      cwd: runtime.cwd,
      command: "git",
      args: ["apply", "--whitespace=nowarn", "-"],
      stdin: patch,
      timeoutMs: 60_000,
    });
    return (result.exitCode === 0 ? inputText : inputError)(
      JSON.stringify({
        exitCode: result.exitCode,
        touchedFiles,
        stdoutSummary: result.stdout.slice(0, 1_000),
        stderrSummary: result.stderr.slice(0, 1_000),
      }),
    );
  }
  if (call.tool === "run_approved_validation") {
    const command = readString(args, "command");
    if (!command) {
      return inputError("command_required");
    }
    if (!runtime.validationCommandRefs.includes(command)) {
      return inputError("validation_command_not_approved");
    }
    const parts = command.split(/\s+/u);
    if (parts[0] !== "pnpm" || parts[1] !== "test:file" || parts.length < 3) {
      return inputError("unsupported_validation_command_shape");
    }
    const result = await runProcess({
      cwd: runtime.cwd,
      command: "pnpm",
      args: parts.slice(1),
      env: validationProcessEnv(),
      timeoutMs: 240_000,
    });
    return (result.exitCode === 0 ? inputText : inputError)(
      JSON.stringify({
        exitCode: result.exitCode,
        stdoutSummary: result.stdout.slice(0, 2_000),
        stderrSummary: result.stderr.slice(0, 2_000),
      }),
    );
  }
  return inputError(`unknown_tool:${call.tool}`);
}

function remember(state: AssistantCaptureState, itemId: string): void {
  if (!state.order.includes(itemId)) {
    state.order.push(itemId);
  }
}

function captureItem(state: AssistantCaptureState, item: CodexThreadItem | undefined): void {
  if (item?.type === "agentMessage" && typeof item.text === "string" && item.text) {
    remember(state, item.id);
    state.textByItem.set(item.id, item.text);
  }
}

function captureTurn(state: AssistantCaptureState, turn: CodexTurn): void {
  for (const item of turn.items ?? []) {
    captureItem(state, item);
  }
}

function notificationParamsForTurn(
  notification: CodexServerNotification,
  threadId: string,
  turnId: string,
): Record<string, unknown> | null {
  const params = readRecord(notification.params);
  if (!params) {
    return null;
  }
  const candidateThreadId = readString(params, "threadId");
  const candidateTurnId = readString(params, "turnId");
  return candidateThreadId === threadId && candidateTurnId === turnId ? params : null;
}

function completedTurnFromNotification(
  notification: CodexServerNotification,
  threadId: string,
  turnId: string,
): CodexTurn | null {
  if (notification.method !== "turn/completed") {
    return null;
  }
  const params = readRecord(notification.params);
  if (!params || readString(params, "threadId") !== threadId) {
    return null;
  }
  const turn = readRecord(params.turn) as CodexTurn | null;
  const candidateTurnId = readString(params, "turnId") ?? turn?.id;
  return turn && candidateTurnId === turnId ? turn : null;
}

function captureNotification(
  state: AssistantCaptureState,
  notification: CodexServerNotification,
  threadId: string,
  turnId: string,
): CodexTurn | null {
  const completed = completedTurnFromNotification(notification, threadId, turnId);
  if (completed) {
    captureTurn(state, completed);
    return completed;
  }
  const params = notificationParamsForTurn(notification, threadId, turnId);
  if (!params) {
    return null;
  }
  if (notification.method === "item/agentMessage/delta") {
    const itemId = readString(params, "itemId") ?? readString(params, "id") ?? "assistant";
    const delta = readString(params, "delta") ?? "";
    if (delta) {
      remember(state, itemId);
      state.textByItem.set(itemId, `${state.textByItem.get(itemId) ?? ""}${delta}`);
    }
  }
  if (notification.method === "item/completed") {
    captureItem(state, readRecord(params.item) as CodexThreadItem | undefined);
  }
  return null;
}

function finalAssistantText(turn: CodexTurn, state: AssistantCaptureState): string | null {
  captureTurn(state, turn);
  for (const itemId of state.order.toReversed()) {
    const text = state.textByItem.get(itemId)?.trim();
    if (text) {
      return text;
    }
  }
  return null;
}

function processValidation(input: {
  repoPath: string;
  timeoutMs: number;
}): LiveCodexRunnerValidation {
  return {
    allowed: true,
    blockingReasons: [],
    executionMode: "codex_app_server_persistent_thread",
    repoPath: input.repoPath,
    maxRuntimeMs: input.timeoutMs,
    commandExecuted: false,
    codexCliInvoked: false,
    acpSessionStarted: false,
    shellCommandExecuted: false,
    providerCallMade: false,
    rebuildPerformed: false,
    schedulerStarted: false,
    daemonStarted: false,
    subagentStarted: false,
    liveExecutionEnabled: false,
  };
}

export type CodexAppServerParityExecutorOptions = {
  model?: string;
  reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
  timeoutMs?: number;
  serviceTier?: string;
  useSharedClient?: boolean;
};

export class CodexAppServerParityExecutor {
  constructor(private readonly options: CodexAppServerParityExecutorOptions = {}) {}

  async run(input: {
    descriptor: CodexProcessDescriptor;
    prompt: string;
    approvedScopeRefs?: string[];
    validationCommandRefs?: string[];
    callbacks?: SupervisorProcessCallbacks;
    abortSignal?: AbortSignal;
  }): Promise<LiveCodexRunnerResult> {
    const runtime = resolveCodexAppServerRuntimeOptions();
    const timeoutMs = this.options.timeoutMs ?? Math.max(runtime.requestTimeoutMs, 3_600_000);
    const validation = processValidation({ repoPath: input.descriptor.cwd, timeoutMs });
    const state: AssistantCaptureState = { textByItem: new Map(), order: [] };
    const pending: CodexServerNotification[] = [];
    let eventCount = 0;
    let currentTurnId: string | null = null;
    const startedAt = Date.now();

    try {
      const client = this.options.useSharedClient
        ? await getSharedCodexAppServerClient({
            startOptions: runtime.start,
            timeoutMs,
          })
        : await createIsolatedCodexAppServerClient({
            startOptions: runtime.start,
            timeoutMs,
          });
      let settle: (turn: CodexTurn) => void = () => undefined;
      let reject: (error: Error) => void = () => undefined;
      let turnInterruptSent = false;
      const completion = new Promise<CodexTurn>((resolve, rejectCompletion) => {
        settle = resolve;
        reject = rejectCompletion;
      });
      let threadId: string | null = null;
      const interruptActiveTurn = (reason: string): void => {
        if (!threadId || !currentTurnId || turnInterruptSent) {
          return;
        }
        turnInterruptSent = true;
        void client
          .request("turn/interrupt", { threadId, turnId: currentTurnId } as JsonValue, {
            timeoutMs: 30_000,
          })
          .then(() =>
            input.callbacks?.onCodexAppServerEvent?.({
              artifactKind: "codex_app_server_parity_progress_event",
              method: "turn/interrupt",
              threadId,
              turnId: currentTurnId,
              phase: "turn_interrupt_sent",
              reason,
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              rawToolLogStored: false,
            } as JsonValue),
          )
          .catch(() => undefined);
      };
      const abortListener = (): void => {
        interruptActiveTurn("runtime_job_abort_signal");
        reject(new Error("codex app-server parity turn aborted"));
      };
      if (input.abortSignal?.aborted) {
        throw new Error("codex app-server parity turn aborted before start");
      }
      input.abortSignal?.addEventListener("abort", abortListener, { once: true });
      const toolRuntime: ParityToolRuntime = {
        cwd: input.descriptor.cwd,
        approvedScopeRefs: input.approvedScopeRefs ?? [],
        validationCommandRefs: input.validationCommandRefs ?? [],
      };
      const off = client.addNotificationHandler((notification) => {
        eventCount += 1;
        void input.callbacks?.onHeartbeat?.();
        if (!currentTurnId || !threadId) {
          pending.push(notification);
          return;
        }
        const progress = normalizeCodexProgressEvent(notification, threadId, currentTurnId);
        if (progress) {
          void input.callbacks?.onCodexAppServerEvent?.(progress as unknown as JsonValue);
        }
        const completed = captureNotification(state, notification, threadId, currentTurnId);
        if (completed) {
          settle(completed);
        }
      });
      const offRequests = client.addRequestHandler(async (request) => {
        if (request.method !== "item/tool/call") {
          return undefined;
        }
        const params = readRecord(request.params);
        if (!params || !threadId || !currentTurnId) {
          return undefined;
        }
        if (
          readString(params, "threadId") !== threadId ||
          readString(params, "turnId") !== currentTurnId
        ) {
          return undefined;
        }
        const callId = readString(params, "callId");
        const tool = readString(params, "tool");
        if (!callId || !tool) {
          return inputError("invalid_tool_call_params") as unknown as JsonValue;
        }
        return (await handleParityToolCall(toolRuntime, {
          threadId,
          turnId: currentTurnId,
          callId,
          tool,
          arguments: readRecord(params.arguments) as JsonValue | undefined,
        })) as unknown as JsonValue;
      });
      const timeout = setTimeout(() => {
        interruptActiveTurn("codex_app_server_parity_turn_timeout");
        reject(new Error("codex app-server parity turn timed out"));
      }, timeoutMs);
      timeout.unref?.();
      const thread = await client.request<CodexThreadStartResponse>(
        "thread/start",
        {
          model: this.options.model ?? "gpt-5.5",
          modelProvider: "openai",
          cwd: input.descriptor.cwd,
          approvalPolicy: runtime.approvalPolicy,
          approvalsReviewer: runtime.approvalsReviewer,
          sandbox: runtime.sandbox,
          ...((this.options.serviceTier ?? runtime.serviceTier)
            ? { serviceTier: this.options.serviceTier ?? runtime.serviceTier }
            : {}),
          serviceName: "OpenClaw Codex Parity Runtime Adapter",
          developerInstructions: [
            "You are the Codex parity implementation worker for OpenClaw.",
            "OpenClaw owns orchestration, runtime truth, Work Queue readback, validation evidence, and final closeout.",
            "Work directly in the current repository within approved scopes. Do not store raw prompts, raw responses, logs, secrets, or hidden reasoning.",
            "Use the provided repository tools to inspect files, apply scoped unified diffs, run approved validation, repair validation failures, and summarize bounded evidence.",
            "When source edits are required, a prose-only answer is not completion. Apply at least one relevant source/test/docs/readback patch inside approved scope or explain an exact scope/config blocker.",
          ].join("\n"),
          ephemeral: true,
          dynamicTools: PARITY_DYNAMIC_TOOLS,
          experimentalRawEvents: true,
          persistExtendedHistory: true,
        } as JsonValue,
        { timeoutMs },
      );
      threadId = thread.thread.id;
      await input.callbacks?.onCodexAppServerEvent?.({
        artifactKind: "codex_app_server_parity_progress_event",
        method: "thread/start",
        threadId,
        turnId: "pending",
        phase: "thread_started",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      } as JsonValue);
      const turn = await client.request<CodexTurnStartResponse>(
        "turn/start",
        {
          threadId: thread.thread.id,
          input: [{ type: "text", text: input.prompt }],
          cwd: input.descriptor.cwd,
          approvalPolicy: runtime.approvalPolicy,
          approvalsReviewer: runtime.approvalsReviewer,
          model: this.options.model ?? thread.model ?? "gpt-5.5",
          ...((this.options.serviceTier ?? runtime.serviceTier)
            ? { serviceTier: this.options.serviceTier ?? runtime.serviceTier }
            : {}),
          effort: this.options.reasoningEffort ?? "xhigh",
        } as JsonValue,
        { timeoutMs },
      );
      currentTurnId = turn.turn.id;
      await input.callbacks?.onCodexAppServerEvent?.({
        artifactKind: "codex_app_server_parity_progress_event",
        method: "turn/start",
        threadId,
        turnId: currentTurnId,
        phase: "turn_started",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      } as JsonValue);
      if (
        turn.turn.status === "completed" ||
        turn.turn.status === "failed" ||
        turn.turn.status === "interrupted"
      ) {
        settle(turn.turn);
      }
      for (const notification of pending.splice(0)) {
        const completed = captureNotification(state, notification, thread.thread.id, currentTurnId);
        if (completed) {
          settle(completed);
          break;
        }
      }
      const completedTurn = await completion.finally(() => {
        clearTimeout(timeout);
        off();
        offRequests();
        input.abortSignal?.removeEventListener("abort", abortListener);
        if (!this.options.useSharedClient) {
          client.close();
        }
      });
      const finalMessage = finalAssistantText(completedTurn, state);
      const failed = completedTurn.status === "failed" || completedTurn.status === "interrupted";
      return {
        status: failed ? "failed" : "completed",
        exitCode: failed ? 1 : 0,
        signal: null,
        errorMessage: completedTurn.error?.message ?? null,
        finalMessage,
        emittedEventCount: eventCount,
        stdoutBytes: finalMessage ? Buffer.byteLength(finalMessage, "utf8") : 0,
        stderrBytes: 0,
        stderrPreview: null,
        validation,
        controlDecision: null,
        promptInjectedIntoLiveProcess: false,
        codexCliInvoked: false,
        acpSessionStarted: false,
        shellCommandExecuted: false,
        providerCallMade: true,
        rebuildPerformed: false,
        schedulerStarted: false,
        daemonStarted: false,
        subagentStarted: false,
        liveExecutionEnabled: true,
        commandExecuted: true,
      };
    } catch (error) {
      return {
        status: Date.now() - startedAt >= timeoutMs ? "timed_out" : "failed",
        exitCode: null,
        signal: null,
        errorMessage: error instanceof Error ? error.message : String(error),
        finalMessage: null,
        emittedEventCount: eventCount,
        stdoutBytes: 0,
        stderrBytes: 0,
        stderrPreview: null,
        validation,
        controlDecision: null,
        promptInjectedIntoLiveProcess: false,
        codexCliInvoked: false,
        acpSessionStarted: false,
        shellCommandExecuted: false,
        providerCallMade: true,
        rebuildPerformed: false,
        schedulerStarted: false,
        daemonStarted: false,
        subagentStarted: false,
        liveExecutionEnabled: true,
        commandExecuted: true,
      };
    }
  }
}

export const __testing = {
  isWithinScope,
  patchTouchedFiles,
  validationProcessEnv,
};
