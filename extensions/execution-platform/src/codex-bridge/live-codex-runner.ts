import { spawn as nodeSpawn } from "node:child_process";
import type {
  CodexJsonlParseResult,
  CodexProcessDescriptor,
  ObserveOnlyPilotGateResult,
  OperatorAcceptanceMetadata,
  SupervisorProcessCallbacks,
  SupervisorProcessResult,
} from "./execution-supervisor.ts";
import {
  normalizeParsedCodexJsonlEvent,
  parseCodexJsonlEventLine,
  validateOperatorAcceptanceForObserveOnlyLocalCodex,
} from "./execution-supervisor.ts";

const DEFAULT_ALLOWED_COMMAND = "codex" as const;
const DEFAULT_ALLOWED_ARGS_PREFIX = ["exec", "--json", "--cd"] as const;
const DEFAULT_ALLOWED_REPO_PATH = "/root/services/openclaw-roles/live" as const;
const DEFAULT_MAX_RUNTIME_MS = 120_000;
const DEFAULT_MAX_STDOUT_BYTES = 1024 * 1024;
const DEFAULT_MAX_STDERR_BYTES = 128 * 1024;
const DEFAULT_KILL_SIGNAL: NodeJS.Signals = "SIGTERM";

export type LiveCodexRunnerOptions = {
  enableLiveCodexPilot?: boolean;
  allowedCommand?: typeof DEFAULT_ALLOWED_COMMAND;
  allowedArgsPrefix?: readonly ["exec", "--json", "--cd"];
  allowedRepoPath?: typeof DEFAULT_ALLOWED_REPO_PATH;
  maxRuntimeMs?: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
  killSignal?: NodeJS.Signals;
  now?: () => Date;
  spawn?: CodexRunnerSpawn;
  externalAbortSignal?: AbortSignal;
  controlPollIntervalMs?: number;
  controlPoller?: LiveCodexRunnerControlPoller | null;
};

export type LiveCodexRunnerControlDecision = {
  commandId: string;
  commandKind: "pause" | "redirect" | "cancel";
  reason: string;
  redirectObjective?: string | null;
};

export type LiveCodexRunnerControlPoller = () =>
  | Promise<LiveCodexRunnerControlDecision | null>
  | LiveCodexRunnerControlDecision
  | null;

export type CodexRunnerSpawnOptions = {
  cwd: string;
  shell: false;
  stdio: ["ignore", "pipe", "pipe"];
  signal: AbortSignal;
  env: NodeJS.ProcessEnv;
};

export type CodexRunnerChildProcess = {
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  kill: (signal?: NodeJS.Signals | number) => boolean;
  on: (
    event: "error" | "exit" | "close",
    listener: (codeOrError?: number | Error | null, signal?: NodeJS.Signals | null) => void,
  ) => CodexRunnerChildProcess;
};

export type CodexRunnerSpawn = (
  command: string,
  args: string[],
  options: CodexRunnerSpawnOptions,
) => CodexRunnerChildProcess;

export type LiveCodexRunnerValidation = {
  allowed: boolean;
  blockingReasons: string[];
  executionMode: string | null;
  repoPath: string | null;
  maxRuntimeMs: number;
  commandExecuted: false;
  codexCliInvoked: false;
  acpSessionStarted: false;
  shellCommandExecuted: false;
  providerCallMade: false;
  rebuildPerformed: false;
  schedulerStarted: false;
  daemonStarted: false;
  subagentStarted: false;
  liveExecutionEnabled: false;
};

export type LiveCodexRunnerResult = SupervisorProcessResult & {
  signal: NodeJS.Signals | string | null;
  stdoutBytes: number;
  stderrBytes: number;
  stderrPreview: string | null;
  validation: LiveCodexRunnerValidation;
  controlDecision: LiveCodexRunnerControlDecision | null;
  promptInjectedIntoLiveProcess: false;
};

export type LiveCodexRunnerInput = {
  descriptor: CodexProcessDescriptor | null;
  gate: ObserveOnlyPilotGateResult | null;
  operatorAcceptance: OperatorAcceptanceMetadata | null;
};

export type LiveCodexRunnerPrevalidatedInput = {
  descriptor: CodexProcessDescriptor | null;
  validation?: LiveCodexRunnerValidation;
};

function noLiveAudit(
  commandExecuted: boolean,
): Omit<
  SupervisorProcessResult,
  "status" | "exitCode" | "errorMessage" | "finalMessage" | "emittedEventCount"
> {
  return {
    codexCliInvoked: false,
    acpSessionStarted: false,
    shellCommandExecuted: false,
    providerCallMade: false,
    rebuildPerformed: false,
    schedulerStarted: false,
    daemonStarted: false,
    subagentStarted: false,
    liveExecutionEnabled: false,
    commandExecuted,
  };
}

export function createDefaultLiveCodexRunnerOptions(
  options: LiveCodexRunnerOptions = {},
): Required<LiveCodexRunnerOptions> {
  return {
    enableLiveCodexPilot: options.enableLiveCodexPilot ?? false,
    allowedCommand: options.allowedCommand ?? DEFAULT_ALLOWED_COMMAND,
    allowedArgsPrefix: options.allowedArgsPrefix ?? DEFAULT_ALLOWED_ARGS_PREFIX,
    allowedRepoPath: options.allowedRepoPath ?? DEFAULT_ALLOWED_REPO_PATH,
    maxRuntimeMs: options.maxRuntimeMs ?? DEFAULT_MAX_RUNTIME_MS,
    maxStdoutBytes: options.maxStdoutBytes ?? DEFAULT_MAX_STDOUT_BYTES,
    maxStderrBytes: options.maxStderrBytes ?? DEFAULT_MAX_STDERR_BYTES,
    killSignal: options.killSignal ?? DEFAULT_KILL_SIGNAL,
    now: options.now ?? (() => new Date()),
    externalAbortSignal: options.externalAbortSignal ?? new AbortController().signal,
    controlPollIntervalMs: options.controlPollIntervalMs ?? 0,
    controlPoller: options.controlPoller ?? null,
    spawn:
      options.spawn ??
      ((command, args, spawnOptions) =>
        nodeSpawn(command, args, spawnOptions) as unknown as CodexRunnerChildProcess),
  };
}

function descriptorValue<T>(descriptor: CodexProcessDescriptor | null, key: string): T | undefined {
  return descriptor
    ? ((descriptor as unknown as Record<string, unknown>)[key] as T | undefined)
    : undefined;
}

function argsStartWith(args: string[], prefix: readonly string[]): boolean {
  return prefix.every((part, index) => args[index] === part);
}

function hasForbiddenAuthorityDescriptorFields(descriptor: CodexProcessDescriptor | null): boolean {
  return (
    descriptorValue<boolean>(descriptor, "allowRebuild") === true ||
    descriptorValue<boolean>(descriptor, "allowAutobailout") === true ||
    descriptorValue<boolean>(descriptor, "allowSubagents") === true
  );
}

function invalidPositiveInteger(value: number): boolean {
  return !Number.isInteger(value) || value <= 0;
}

export function validateLiveCodexRunnerReadiness(input: {
  descriptor: CodexProcessDescriptor | null;
  gate: ObserveOnlyPilotGateResult | null;
  operatorAcceptance: OperatorAcceptanceMetadata | null;
  options?: LiveCodexRunnerOptions;
  now?: Date;
}): LiveCodexRunnerValidation {
  const options = createDefaultLiveCodexRunnerOptions(input.options);
  const blockingReasons: string[] = [];
  const descriptor = input.descriptor;
  if (!options.enableLiveCodexPilot) {
    blockingReasons.push("live_codex_pilot_not_enabled");
  }
  if (!descriptor) {
    blockingReasons.push("descriptor_required");
  } else {
    if (descriptor.command !== options.allowedCommand) {
      blockingReasons.push("invalid_command");
    }
    if (!argsStartWith(descriptor.args, options.allowedArgsPrefix)) {
      blockingReasons.push("invalid_args_prefix");
    }
    if (
      descriptor.cwd !== options.allowedRepoPath ||
      descriptor.args[3] !== options.allowedRepoPath
    ) {
      blockingReasons.push("repo_scope_mismatch");
    }
    if (!descriptor.executionAllowed) {
      blockingReasons.push("descriptor_execution_not_allowed");
    }
    if ((descriptor as unknown as { commandExecuted?: boolean }).commandExecuted !== false) {
      blockingReasons.push("descriptor_already_executed");
    }
    if (
      (descriptor as unknown as { envPolicy?: { secretsIncluded?: boolean } }).envPolicy
        ?.secretsIncluded !== false
    ) {
      blockingReasons.push("descriptor_env_secrets_not_allowed");
    }
    if (!descriptor.sourcePackageId) {
      blockingReasons.push("descriptor_source_package_id_required");
    }
    if (hasForbiddenAuthorityDescriptorFields(descriptor)) {
      blockingReasons.push("descriptor_forbidden_future_authority");
    }
  }
  if (!input.gate) {
    blockingReasons.push("pilot_gate_required");
  } else if (!input.gate.allowed) {
    blockingReasons.push("pilot_gate_not_allowed");
  }
  const runtimeJobId =
    descriptorValue<string>(descriptor, "descriptorId")?.replace(/^codex-process-/, "") ??
    input.gate?.runtimeJobId ??
    input.operatorAcceptance?.runtimeJobId ??
    "";
  const acceptance = validateOperatorAcceptanceForObserveOnlyLocalCodex({
    acceptance: input.operatorAcceptance,
    runtimeJobId,
    expectedRepoPath: options.allowedRepoPath,
    now: input.now ?? options.now(),
  });
  blockingReasons.push(...acceptance.blockingReasons);
  if (invalidPositiveInteger(options.maxRuntimeMs)) {
    blockingReasons.push("invalid_max_runtime_ms");
  }
  if (invalidPositiveInteger(options.maxStdoutBytes)) {
    blockingReasons.push("invalid_max_stdout_bytes");
  }
  if (invalidPositiveInteger(options.maxStderrBytes)) {
    blockingReasons.push("invalid_max_stderr_bytes");
  }
  const uniqueBlockingReasons = [...new Set(blockingReasons)];
  return {
    allowed: uniqueBlockingReasons.length === 0,
    blockingReasons: uniqueBlockingReasons,
    executionMode: input.operatorAcceptance?.executionMode ?? null,
    repoPath: descriptor?.cwd ?? input.operatorAcceptance?.repoPath ?? null,
    maxRuntimeMs: options.maxRuntimeMs,
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

export function validateLiveCodexRunnerDescriptorOnly(input: {
  descriptor: CodexProcessDescriptor | null;
  options?: LiveCodexRunnerOptions;
}): LiveCodexRunnerValidation {
  const options = createDefaultLiveCodexRunnerOptions(input.options);
  const descriptor = input.descriptor;
  const blockingReasons: string[] = [];
  if (!options.enableLiveCodexPilot) {
    blockingReasons.push("live_codex_pilot_not_enabled");
  }
  if (!descriptor) {
    blockingReasons.push("descriptor_required");
  } else {
    if (descriptor.command !== options.allowedCommand) {
      blockingReasons.push("invalid_command");
    }
    if (!argsStartWith(descriptor.args, options.allowedArgsPrefix)) {
      blockingReasons.push("invalid_args_prefix");
    }
    if (
      descriptor.cwd !== options.allowedRepoPath ||
      descriptor.args[3] !== options.allowedRepoPath
    ) {
      blockingReasons.push("repo_scope_mismatch");
    }
    if (!descriptor.executionAllowed) {
      blockingReasons.push("descriptor_execution_not_allowed");
    }
    if ((descriptor as unknown as { commandExecuted?: boolean }).commandExecuted !== false) {
      blockingReasons.push("descriptor_already_executed");
    }
    if (
      (descriptor as unknown as { envPolicy?: { secretsIncluded?: boolean } }).envPolicy
        ?.secretsIncluded !== false
    ) {
      blockingReasons.push("descriptor_env_secrets_not_allowed");
    }
    if (!descriptor.sourcePackageId) {
      blockingReasons.push("descriptor_source_package_id_required");
    }
    if (hasForbiddenAuthorityDescriptorFields(descriptor)) {
      blockingReasons.push("descriptor_forbidden_future_authority");
    }
  }
  if (invalidPositiveInteger(options.maxRuntimeMs)) {
    blockingReasons.push("invalid_max_runtime_ms");
  }
  if (invalidPositiveInteger(options.maxStdoutBytes)) {
    blockingReasons.push("invalid_max_stdout_bytes");
  }
  if (invalidPositiveInteger(options.maxStderrBytes)) {
    blockingReasons.push("invalid_max_stderr_bytes");
  }
  const uniqueBlockingReasons = [...new Set(blockingReasons)];
  return {
    allowed: uniqueBlockingReasons.length === 0,
    blockingReasons: uniqueBlockingReasons,
    executionMode: "code_writing_bridge_pilot",
    repoPath: descriptor?.cwd ?? null,
    maxRuntimeMs: options.maxRuntimeMs,
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

function refusedResult(
  validation: LiveCodexRunnerValidation,
  message = "live Codex runner refused execution",
): LiveCodexRunnerResult {
  return {
    status: "refused",
    exitCode: null,
    signal: null,
    errorMessage: message,
    finalMessage: null,
    emittedEventCount: 0,
    stdoutBytes: 0,
    stderrBytes: 0,
    stderrPreview: null,
    validation,
    controlDecision: null,
    promptInjectedIntoLiveProcess: false,
    ...noLiveAudit(false),
  };
}

function readStream(stream: NodeJS.ReadableStream, onData: (chunk: Buffer) => void): void {
  stream.on("data", (chunk: Buffer | string) => {
    onData(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
}

function appendBoundedPreview(current: string, chunk: Buffer, maxBytes: number): string {
  const next = current + chunk.toString("utf8");
  if (Buffer.byteLength(next, "utf8") <= maxBytes) {
    return next;
  }
  return next.slice(0, maxBytes);
}

function finalMessageFromParsed(
  parsed: CodexJsonlParseResult,
  sequence: number,
  now: Date,
): string | null {
  if (!parsed.ok) {
    return null;
  }
  const normalized = normalizeParsedCodexJsonlEvent({
    event: parsed.event,
    sequence,
    now,
  });
  return normalized.eventKind === "final_response" ? normalized.summary : null;
}

export class LiveCodexRunner {
  private readonly options: Required<LiveCodexRunnerOptions>;
  private readonly usesNodeSpawn: boolean;

  constructor(options: LiveCodexRunnerOptions = {}) {
    this.usesNodeSpawn = options.spawn === undefined;
    this.options = createDefaultLiveCodexRunnerOptions(options);
  }

  private processAudit(commandExecuted: boolean): ReturnType<typeof noLiveAudit> {
    if (!commandExecuted || !this.usesNodeSpawn) {
      return noLiveAudit(commandExecuted);
    }
    return {
      ...noLiveAudit(commandExecuted),
      codexCliInvoked: true,
      liveExecutionEnabled: true,
    };
  }

  validate(input: LiveCodexRunnerInput): LiveCodexRunnerValidation {
    return validateLiveCodexRunnerReadiness({
      ...input,
      options: this.options,
      now: this.options.now(),
    });
  }

  async run(
    input: LiveCodexRunnerInput,
    callbacks: SupervisorProcessCallbacks,
  ): Promise<LiveCodexRunnerResult> {
    const validation = this.validate(input);
    return this.runWithValidation(input.descriptor, validation, callbacks);
  }

  runPrevalidatedDescriptor(
    input: LiveCodexRunnerPrevalidatedInput,
    callbacks: SupervisorProcessCallbacks,
  ): Promise<LiveCodexRunnerResult> {
    const validation =
      input.validation ??
      validateLiveCodexRunnerDescriptorOnly({
        descriptor: input.descriptor,
        options: this.options,
      });
    return this.runWithValidation(input.descriptor, validation, callbacks);
  }

  private async runWithValidation(
    descriptor: CodexProcessDescriptor | null,
    validation: LiveCodexRunnerValidation,
    callbacks: SupervisorProcessCallbacks,
  ): Promise<LiveCodexRunnerResult> {
    if (!validation.allowed || !descriptor) {
      return refusedResult(validation);
    }

    const processDescriptor = descriptor;
    const controller = new AbortController();
    let timedOut = false;
    let killedForBytes = false;
    let externallyCanceled = false;
    let controlDecision: LiveCodexRunnerControlDecision | null = null;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let emittedEventCount = 0;
    let finalMessage: string | null = null;
    let stderrPreview = "";
    let stdoutBuffer = "";
    let resolved = false;
    let timer: NodeJS.Timeout | null = null;
    let controlPollTimer: NodeJS.Timeout | null = null;

    return new Promise<LiveCodexRunnerResult>((resolve) => {
      const finish = (result: {
        status: LiveCodexRunnerResult["status"];
        exitCode: number | null;
        signal: NodeJS.Signals | string | null;
        errorMessage: string | null;
      }) => {
        if (resolved) {
          return;
        }
        resolved = true;
        if (timer) {
          clearTimeout(timer);
        }
        if (controlPollTimer) {
          clearInterval(controlPollTimer);
        }
        this.options.externalAbortSignal?.removeEventListener("abort", abortForExternalControl);
        resolve({
          status: result.status,
          exitCode: result.exitCode,
          signal: result.signal,
          errorMessage: result.errorMessage,
          finalMessage,
          emittedEventCount,
          stdoutBytes,
          stderrBytes,
          stderrPreview: stderrPreview || null,
          validation,
          controlDecision,
          promptInjectedIntoLiveProcess: false,
          ...this.processAudit(true),
        });
      };

      let child: CodexRunnerChildProcess | null = null;
      const abortForExternalControl = () => {
        externallyCanceled = true;
        controller.abort();
        child?.kill(this.options.killSignal);
      };
      if (this.options.externalAbortSignal?.aborted) {
        abortForExternalControl();
      } else {
        this.options.externalAbortSignal?.addEventListener("abort", abortForExternalControl, {
          once: true,
        });
      }
      try {
        child = this.options.spawn(processDescriptor.command, processDescriptor.args, {
          cwd: processDescriptor.cwd,
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
          signal: controller.signal,
          env: { PATH: process.env.PATH ?? "" },
        });
      } catch (error) {
        finish({
          status: externallyCanceled ? "killed" : "failed",
          exitCode: null,
          signal: null,
          errorMessage: externallyCanceled
            ? "live Codex runner canceled by external control"
            : error instanceof Error
              ? error.message
              : "spawn failed",
        });
        return;
      }

      const killChild = () => {
        child?.kill(this.options.killSignal);
      };

      const applyControlDecision = async () => {
        if (!this.options.controlPoller || controlDecision || resolved) {
          return;
        }
        const decision = await this.options.controlPoller();
        if (!decision) {
          return;
        }
        controlDecision = decision;
        externallyCanceled = true;
        controller.abort();
        killChild();
      };

      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        killChild();
      }, this.options.maxRuntimeMs);
      if (this.options.controlPoller && this.options.controlPollIntervalMs > 0) {
        controlPollTimer = setInterval(() => {
          void applyControlDecision().catch(() => {
            controlDecision = {
              commandId: "control-poller-error",
              commandKind: "pause",
              reason: "control poller failed",
            };
            externallyCanceled = true;
            controller.abort();
            killChild();
          });
        }, this.options.controlPollIntervalMs);
      }

      readStream(child.stdout, (chunk) => {
        stdoutBytes += chunk.byteLength;
        if (stdoutBytes > this.options.maxStdoutBytes) {
          killedForBytes = true;
          killChild();
          return;
        }
        stdoutBuffer += chunk.toString("utf8");
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }
          emittedEventCount += 1;
          const parsed = parseCodexJsonlEventLine(line);
          finalMessage =
            finalMessageFromParsed(parsed, emittedEventCount, this.options.now()) ?? finalMessage;
          void callbacks.onJsonlLine?.(line);
        }
      });

      readStream(child.stderr, (chunk) => {
        stderrBytes += chunk.byteLength;
        stderrPreview = appendBoundedPreview(stderrPreview, chunk, this.options.maxStderrBytes);
        if (stderrBytes > this.options.maxStderrBytes) {
          killedForBytes = true;
          killChild();
        }
      });

      child.on("error", (error) => {
        finish({
          status: externallyCanceled ? "killed" : "failed",
          exitCode: null,
          signal: null,
          errorMessage: externallyCanceled
            ? "live Codex runner canceled by external control"
            : error instanceof Error
              ? error.message
              : "child process error",
        });
      });

      child.on("close", (code, signal) => {
        if (stdoutBuffer.trim()) {
          emittedEventCount += 1;
          const line = stdoutBuffer;
          stdoutBuffer = "";
          const parsed = parseCodexJsonlEventLine(line);
          finalMessage =
            finalMessageFromParsed(parsed, emittedEventCount, this.options.now()) ?? finalMessage;
          void callbacks.onJsonlLine?.(line);
        }
        const status = externallyCanceled
          ? "killed"
          : timedOut
            ? "timed_out"
            : killedForBytes
              ? "killed"
              : code === 0
                ? "completed"
                : "failed";
        finish({
          status,
          exitCode: typeof code === "number" ? code : null,
          signal: typeof signal === "string" ? signal : null,
          errorMessage:
            status === "completed"
              ? null
              : externallyCanceled
                ? "live Codex runner canceled by external control"
                : timedOut
                  ? "live Codex runner timed out"
                  : killedForBytes
                    ? "live Codex runner killed after output byte limit"
                    : `live Codex runner exited with code ${String(code)}`,
        });
      });
    });
  }
}
