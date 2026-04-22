import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { resolveMemoryOpsConfig, type MemoryOpsClosedLoopConfig } from "./config.ts";
import { readProductionHookProbeRecords } from "./production-hook-probe.ts";

const execFile = promisify(execFileCallback);

export type HookDiscoveryStatus =
  | "production_verified"
  | "synthetic_only"
  | "registered_not_fired"
  | "blocked";

export type HookDiscoveryTarget = {
  hook_name: string;
  registration_surface_exists: boolean;
  registration_succeeded: boolean;
  fired: boolean;
  observed_payload_keys: string[];
  observed_ordering?: string | null;
  trigger_method?: string | null;
  verification_level?: "none" | "static_source" | "synthetic_in_process" | "runtime_observed";
  status: HookDiscoveryStatus;
  source_files: string[];
  notes: string[];
};

export type HookDiscoveryArtifact = {
  schema_version: "memory_ops_hook_discovery.v1";
  created_at: string;
  repo_root: string;
  git_head: string;
  targets: HookDiscoveryTarget[];
};

type HookTargetSpec = {
  hookName: string;
  primaryPatterns: string[];
  fallbackOnly?: boolean;
  futureOnly?: boolean;
  notes?: string[];
};

type InternalHookCanarySpec = {
  hookName: string;
  eventKey: string;
  type: "command" | "session" | "agent" | "gateway" | "message";
  action: string;
  context: Record<string, unknown>;
};

type PluginHookCanarySpec = {
  hookName: string;
  runMethod:
    | "runToolResultPersist"
    | "runAfterToolCall"
    | "runAgentEnd"
    | "runBeforeCompaction"
    | "runAfterCompaction"
    | "runSessionEnd";
  event: Record<string, unknown>;
  context: Record<string, unknown>;
};

type ContextEngineCanarySpec = {
  hookName: string;
  method: "ingest" | "ingestBatch" | "assemble" | "afterTurn";
  params: Record<string, unknown>;
};

const TARGET_SPECS: HookTargetSpec[] = [
  {
    hookName: "message:preprocessed",
    primaryPatterns: [
      "message:preprocessed",
      '"message", "preprocessed"',
      '"message","preprocessed"',
    ],
  },
  {
    hookName: "message:received",
    primaryPatterns: ["message:received", '"message", "received"', '"message","received"'],
    fallbackOnly: true,
  },
  {
    hookName: "message:transcribed",
    primaryPatterns: ["message:transcribed", '"message", "transcribed"', '"message","transcribed"'],
    fallbackOnly: true,
  },
  {
    hookName: "ContextEngine.ingest()",
    primaryPatterns: ["ingest(params", "ingest?:", ".ingest("],
  },
  {
    hookName: "ContextEngine.ingestBatch()",
    primaryPatterns: ["ingestBatch?", ".ingestBatch("],
  },
  {
    hookName: "ContextEngine.assemble()",
    primaryPatterns: ["assemble(params", "assemble?:", ".assemble("],
  },
  {
    hookName: "tool_result_persist",
    primaryPatterns: ["tool_result_persist", "runToolResultPersist"],
  },
  {
    hookName: "after_tool_call",
    primaryPatterns: ["after_tool_call", "runAfterToolCall"],
  },
  {
    hookName: "agent_end",
    primaryPatterns: ["agent_end", "embedded_run_agent_end"],
  },
  {
    hookName: "ContextEngine.afterTurn()",
    primaryPatterns: ["afterTurn?", ".afterTurn("],
  },
  {
    hookName: "agent:bootstrap",
    primaryPatterns: ["agent:bootstrap", '"agent", "bootstrap"', '"agent","bootstrap"'],
  },
  {
    hookName: "changed bootstrap files",
    primaryPatterns: ["bootstrapFiles", "AGENTS.md", "BOOTSTRAP.md"],
    futureOnly: true,
    notes: ["File-change firing still needs a dedicated watcher/trigger proof."],
  },
  {
    hookName: "changed memory files",
    primaryPatterns: ["MEMORY.md", "DREAMS.md", "memory/YYYY-MM-DD"],
    futureOnly: true,
    notes: ["File-change firing still needs a dedicated watcher/trigger proof."],
  },
  {
    hookName: "prompt assembly / memory injection observer",
    primaryPatterns: ["before_prompt_build", "persistContextRun", "retrieval_pack"],
  },
  {
    hookName: "retrieval observer",
    primaryPatterns: ["persistRetrievalRequest", "persistResultItems", "listRetrievalRequests"],
  },
  {
    hookName: "before_compaction",
    primaryPatterns: ["before_compaction", "runBeforeCompaction"],
  },
  {
    hookName: "after_compaction",
    primaryPatterns: ["after_compaction", "runAfterCompaction"],
  },
  {
    hookName: "session:compact:before",
    primaryPatterns: ['"session", "compact:before"', "session:compact:before"],
  },
  {
    hookName: "session:compact:after",
    primaryPatterns: ['"session", "compact:after"', "session:compact:after"],
  },
  {
    hookName: "command:new",
    primaryPatterns: ["command:new", '"command", "new"', '"command","new"'],
  },
  {
    hookName: "command:reset",
    primaryPatterns: ["command:reset", '"command", "reset"', '"command","reset"'],
  },
  {
    hookName: "command:stop",
    primaryPatterns: ["command:stop", '"command", "stop"', '"command","stop"'],
  },
  {
    hookName: "session_end",
    primaryPatterns: ["session_end"],
  },
];

const INTERNAL_HOOK_CANARY_SPECS: InternalHookCanarySpec[] = [
  {
    hookName: "message:preprocessed",
    eventKey: "message:preprocessed",
    type: "message",
    action: "preprocessed",
    context: {
      body_sha256: "canary-body-hash",
      bodyForAgent_sha256: "canary-body-for-agent-hash",
      channelId: "memory-ops-canary",
      messageId: "memory-ops-canary-message",
    },
  },
  {
    hookName: "message:received",
    eventKey: "message:received",
    type: "message",
    action: "received",
    context: {
      content_sha256: "canary-content-hash",
      channelId: "memory-ops-canary",
      messageId: "memory-ops-canary-message",
    },
  },
  {
    hookName: "message:transcribed",
    eventKey: "message:transcribed",
    type: "message",
    action: "transcribed",
    context: {
      body_sha256: "canary-body-hash",
      transcript_sha256: "canary-transcript-hash",
      channelId: "memory-ops-canary",
      mediaType: "audio/ogg",
    },
  },
  {
    hookName: "agent:bootstrap",
    eventKey: "agent:bootstrap",
    type: "agent",
    action: "bootstrap",
    context: {
      workspaceDir: "/memory-ops-canary",
      bootstrapFileCount: 0,
    },
  },
  {
    hookName: "session:compact:before",
    eventKey: "session:compact:before",
    type: "session",
    action: "compact:before",
    context: {
      sessionId: "memory-ops-canary-session",
      messageCount: 3,
      tokenCount: 42,
    },
  },
  {
    hookName: "session:compact:after",
    eventKey: "session:compact:after",
    type: "session",
    action: "compact:after",
    context: {
      sessionId: "memory-ops-canary-session",
      messageCount: 2,
      tokenCount: 30,
      compactedCount: 1,
    },
  },
  {
    hookName: "command:new",
    eventKey: "command:new",
    type: "command",
    action: "new",
    context: {
      command: "/new",
      sessionId: "memory-ops-canary-session",
    },
  },
  {
    hookName: "command:reset",
    eventKey: "command:reset",
    type: "command",
    action: "reset",
    context: {
      command: "/reset",
      sessionId: "memory-ops-canary-session",
    },
  },
  {
    hookName: "command:stop",
    eventKey: "command:stop",
    type: "command",
    action: "stop",
    context: {
      command: "/stop",
      sessionId: "memory-ops-canary-session",
    },
  },
];

const PLUGIN_HOOK_CANARY_SPECS: PluginHookCanarySpec[] = [
  {
    hookName: "tool_result_persist",
    runMethod: "runToolResultPersist",
    event: {
      toolName: "memory_ops_canary_tool",
      toolCallId: "memory-ops-canary-tool-call",
      isSynthetic: true,
      message: {
        role: "tool",
        content: "memory-ops-canary-result-redacted",
      },
    },
    context: {
      agentId: "main",
      sessionKey: "memory-ops-canary",
      toolName: "memory_ops_canary_tool",
      toolCallId: "memory-ops-canary-tool-call",
    },
  },
  {
    hookName: "after_tool_call",
    runMethod: "runAfterToolCall",
    event: {
      toolName: "memory_ops_canary_tool",
      params: { redacted: true },
      runId: "memory-ops-canary-run",
      toolCallId: "memory-ops-canary-tool-call",
      result: { result_sha256: "memory-ops-canary-result-hash" },
      durationMs: 1,
    },
    context: {
      agentId: "main",
      sessionKey: "memory-ops-canary",
      sessionId: "memory-ops-canary-session",
      runId: "memory-ops-canary-run",
      toolName: "memory_ops_canary_tool",
      toolCallId: "memory-ops-canary-tool-call",
    },
  },
  {
    hookName: "agent_end",
    runMethod: "runAgentEnd",
    event: {
      messages: [],
      success: true,
      durationMs: 1,
    },
    context: {
      agentId: "main",
      sessionKey: "memory-ops-canary",
      sessionId: "memory-ops-canary-session",
      runId: "memory-ops-canary-run",
    },
  },
  {
    hookName: "before_compaction",
    runMethod: "runBeforeCompaction",
    event: {
      messageCount: 3,
      compactingCount: 1,
      tokenCount: 42,
      messages: [],
      sessionFile: "memory-ops-canary.jsonl",
    },
    context: {
      agentId: "main",
      sessionKey: "memory-ops-canary",
      sessionId: "memory-ops-canary-session",
      runId: "memory-ops-canary-run",
    },
  },
  {
    hookName: "after_compaction",
    runMethod: "runAfterCompaction",
    event: {
      messageCount: 2,
      compactedCount: 1,
      tokenCount: 30,
      sessionFile: "memory-ops-canary.jsonl",
    },
    context: {
      agentId: "main",
      sessionKey: "memory-ops-canary",
      sessionId: "memory-ops-canary-session",
      runId: "memory-ops-canary-run",
    },
  },
  {
    hookName: "session_end",
    runMethod: "runSessionEnd",
    event: {
      sessionId: "memory-ops-canary-session",
      sessionKey: "memory-ops-canary",
      messageCount: 0,
      reason: "unknown",
      transcriptArchived: false,
    },
    context: {
      agentId: "main",
      sessionKey: "memory-ops-canary",
      sessionId: "memory-ops-canary-session",
    },
  },
];

const CONTEXT_ENGINE_CANARY_SPECS: ContextEngineCanarySpec[] = [
  {
    hookName: "ContextEngine.ingest()",
    method: "ingest",
    params: {
      role: "user",
      content_sha256: "memory-ops-canary-content-hash",
      sessionId: "memory-ops-canary-session",
    },
  },
  {
    hookName: "ContextEngine.ingestBatch()",
    method: "ingestBatch",
    params: {
      messages: [
        {
          role: "user",
          content_sha256: "memory-ops-canary-content-hash",
        },
      ],
      sessionId: "memory-ops-canary-session",
    },
  },
  {
    hookName: "ContextEngine.assemble()",
    method: "assemble",
    params: {
      sessionId: "memory-ops-canary-session",
      query_sha256: "memory-ops-canary-query-hash",
      tokenBudget: 256,
    },
  },
  {
    hookName: "ContextEngine.afterTurn()",
    method: "afterTurn",
    params: {
      sessionId: "memory-ops-canary-session",
      turn_delta_sha256: "memory-ops-canary-turn-delta-hash",
    },
  },
];

function isSourceFile(filePath: string): boolean {
  return /\.(ts|tsx|js|mjs|md|sh)$/.test(filePath);
}

async function walkFiles(root: string, relativeDir = ""): Promise<string[]> {
  const absoluteDir = path.join(root, relativeDir);
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  try {
    entries = await readdir(absoluteDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") {
      continue;
    }
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(root, relativePath)));
      continue;
    }
    if (entry.isFile() && isSourceFile(relativePath)) {
      files.push(relativePath);
    }
  }
  return files;
}

async function findPatternFiles(input: {
  repoRoot: string;
  files: string[];
  patterns: string[];
}): Promise<string[]> {
  const matches: string[] = [];
  for (const file of input.files) {
    let text = "";
    try {
      text = await readFile(path.join(input.repoRoot, file), "utf8");
    } catch {
      continue;
    }
    if (input.patterns.some((pattern) => text.includes(pattern))) {
      matches.push(file);
    }
  }
  return matches.toSorted();
}

async function readGitHead(repoRoot: string): Promise<string> {
  try {
    const { stdout } = await execFile("git", ["rev-parse", "HEAD"], { cwd: repoRoot });
    return stdout.trim();
  } catch {
    return "unknown";
  }
}

function statusForSpec(spec: HookTargetSpec, sourceFiles: string[]): HookDiscoveryStatus {
  if (spec.futureOnly || spec.fallbackOnly || sourceFiles.length === 0) {
    return "blocked";
  }
  return "registered_not_fired";
}

export async function discoverMemoryOpsHooksFromRepo(input: {
  repoRoot: string;
  createdAt?: string;
}): Promise<HookDiscoveryArtifact> {
  const searchRoots = ["src", "extensions", "ops", "docs/projects/model-memory"];
  const filesByRoot = await Promise.all(searchRoots.map((root) => walkFiles(input.repoRoot, root)));
  const files = filesByRoot.flat();
  const targets: HookDiscoveryTarget[] = [];
  for (const spec of TARGET_SPECS) {
    const sourceFiles = await findPatternFiles({
      repoRoot: input.repoRoot,
      files,
      patterns: spec.primaryPatterns,
    });
    const status = statusForSpec(spec, sourceFiles);
    targets.push({
      hook_name: spec.hookName,
      registration_surface_exists: sourceFiles.length > 0,
      registration_succeeded: false,
      fired: false,
      observed_payload_keys: [],
      observed_ordering: null,
      trigger_method: null,
      verification_level: sourceFiles.length > 0 ? "static_source" : "none",
      status,
      source_files: sourceFiles.slice(0, 12),
      notes: [
        ...(spec.notes ?? []),
        status === "registered_not_fired"
          ? "Registration/code surface exists, but this artifact did not execute a live lifecycle trigger."
          : "",
        spec.fallbackOnly ? "Fallback-only hook is blocked from primary capture wiring." : "",
        spec.futureOnly ? "Future hook lacks a production firing surface for capture wiring." : "",
      ].filter((entry) => entry.length > 0),
    });
  }

  return {
    schema_version: "memory_ops_hook_discovery.v1",
    created_at: input.createdAt ?? new Date().toISOString(),
    repo_root: input.repoRoot,
    git_head: await readGitHead(input.repoRoot),
    targets,
  };
}

function payloadKeysFromContext(value: Record<string, unknown>): string[] {
  return Object.keys(value).toSorted();
}

async function importInternalHookApi(repoRoot: string) {
  return await import(pathToFileURL(path.join(repoRoot, "src/hooks/internal-hooks.ts")).href);
}

async function importPluginHookApi(repoRoot: string) {
  return await import(pathToFileURL(path.join(repoRoot, "src/plugins/hooks.ts")).href);
}

function mergeSyntheticNotes(
  target: HookDiscoveryTarget,
  nextNotes: string[],
): HookDiscoveryTarget["notes"] {
  return [
    ...target.notes.filter(
      (note) => !note.includes("this artifact did not execute a live lifecycle trigger"),
    ),
    ...nextNotes,
  ].filter((note) => note.length > 0);
}

export async function runSafeHookFiringCanaries(input: {
  artifact: HookDiscoveryArtifact;
  repoRoot: string;
}): Promise<HookDiscoveryArtifact> {
  const internalHooks = await importInternalHookApi(input.repoRoot);
  const targetsByName = new Map(input.artifact.targets.map((target) => [target.hook_name, target]));
  const firedOrder: string[] = [];

  for (const spec of INTERNAL_HOOK_CANARY_SPECS) {
    const target = targetsByName.get(spec.hookName);
    if (!target?.registration_surface_exists) {
      continue;
    }

    let fired = false;
    const observedPayloadKeys: string[][] = [];
    const handler = (event: { context?: Record<string, unknown> }) => {
      fired = true;
      firedOrder.push(spec.hookName);
      observedPayloadKeys.push(payloadKeysFromContext(event.context ?? {}));
    };

    internalHooks.registerInternalHook(spec.eventKey, handler);
    try {
      await internalHooks.triggerInternalHook(
        internalHooks.createInternalHookEvent(
          spec.type,
          spec.action,
          "memory-ops-canary-session",
          spec.context,
        ),
      );
    } finally {
      internalHooks.unregisterInternalHook(spec.eventKey, handler);
    }

    target.registration_succeeded = true;
    target.fired = fired;
    target.observed_payload_keys = fired ? observedPayloadKeys.flat().toSorted() : [];
    target.observed_ordering = fired ? `synthetic_order:${firedOrder.join(">")}` : null;
    target.trigger_method = "synthetic_in_process_internal_hook";
    target.verification_level = fired ? "synthetic_in_process" : "static_source";
    target.status = fired ? "synthetic_only" : "registered_not_fired";
    target.notes = [
      ...target.notes.filter(
        (note) => !note.includes("this artifact did not execute a live lifecycle trigger"),
      ),
      TARGET_SPECS.find((entry) => entry.hookName === spec.hookName)?.fallbackOnly
        ? "Capture policy remains fallback-only even though synthetic handler mechanics fired."
        : "",
      fired
        ? "Synthetic in-process canary fired. This proves handler mechanics, not production lifecycle firing."
        : "Synthetic in-process canary registered but did not fire.",
    ].filter((note) => note.length > 0);
  }

  await runSafePluginHookCanaries({
    repoRoot: input.repoRoot,
    targetsByName,
  });
  await runSafeContextEngineCanaries({ targetsByName });

  return input.artifact;
}

async function runSafePluginHookCanaries(input: {
  repoRoot: string;
  targetsByName: Map<string, HookDiscoveryTarget>;
}): Promise<void> {
  let pluginHooks: { createHookRunner?: (registry: unknown, options?: unknown) => unknown };
  try {
    pluginHooks = await importPluginHookApi(input.repoRoot);
  } catch {
    return;
  }

  if (typeof pluginHooks.createHookRunner !== "function") {
    return;
  }

  for (const spec of PLUGIN_HOOK_CANARY_SPECS) {
    const target = input.targetsByName.get(spec.hookName);
    if (!target?.registration_surface_exists) {
      continue;
    }

    let fired = false;
    const observedPayloadKeys: string[][] = [];
    const handler = (event: Record<string, unknown>, context: Record<string, unknown>) => {
      fired = true;
      observedPayloadKeys.push([
        ...Object.keys(event).map((key) => `event.${key}`),
        ...Object.keys(context).map((key) => `context.${key}`),
      ]);
      if (spec.hookName === "tool_result_persist") {
        return { message: event.message };
      }
      return undefined;
    };

    const registry = {
      plugins: [{ id: "memory-ops-canary", status: "loaded" }],
      hooks: [],
      typedHooks: [
        {
          pluginId: "memory-ops-canary",
          hookName: spec.hookName,
          handler,
          priority: 0,
          source: "memory-ops-canary",
        },
      ],
    };
    const runner = pluginHooks.createHookRunner(registry, {
      catchErrors: false,
      logger: {
        warn: () => undefined,
        error: () => undefined,
        debug: () => undefined,
      },
    }) as Record<string, unknown>;
    const runMethod = runner[spec.runMethod];
    if (typeof runMethod !== "function") {
      continue;
    }

    await runMethod.call(runner, spec.event, spec.context);

    target.registration_succeeded = true;
    target.fired = fired;
    target.observed_payload_keys = fired ? observedPayloadKeys.flat().toSorted() : [];
    target.observed_ordering = fired ? `synthetic_plugin_hook:${spec.hookName}` : null;
    target.trigger_method = "synthetic_in_process_plugin_hook_runner";
    target.verification_level = fired ? "synthetic_in_process" : "static_source";
    target.status = fired ? "synthetic_only" : "registered_not_fired";
    target.notes = mergeSyntheticNotes(target, [
      fired
        ? "Synthetic plugin hook canary fired through a local hook runner. This proves hook-runner mechanics, not production lifecycle firing."
        : "Synthetic plugin hook canary registered but did not fire.",
    ]);
  }
}

async function runSafeContextEngineCanaries(input: {
  targetsByName: Map<string, HookDiscoveryTarget>;
}): Promise<void> {
  const firedMethods: string[] = [];
  const canaryContextEngine: Record<string, (params: Record<string, unknown>) => Promise<void>> = {
    async ingest() {
      firedMethods.push("ingest");
    },
    async ingestBatch() {
      firedMethods.push("ingestBatch");
    },
    async assemble() {
      firedMethods.push("assemble");
    },
    async afterTurn() {
      firedMethods.push("afterTurn");
    },
  };

  for (const spec of CONTEXT_ENGINE_CANARY_SPECS) {
    const target = input.targetsByName.get(spec.hookName);
    if (!target?.registration_surface_exists) {
      continue;
    }

    await canaryContextEngine[spec.method]?.(spec.params);
    const fired = firedMethods.includes(spec.method);
    target.registration_succeeded = true;
    target.fired = fired;
    target.observed_payload_keys = fired
      ? Object.keys(spec.params)
          .map((key) => `params.${key}`)
          .toSorted()
      : [];
    target.observed_ordering = fired ? `synthetic_context_engine:${firedMethods.join(">")}` : null;
    target.trigger_method = "synthetic_in_process_context_engine_lifecycle";
    target.verification_level = fired ? "synthetic_in_process" : "static_source";
    target.status = fired ? "synthetic_only" : "registered_not_fired";
    target.notes = mergeSyntheticNotes(target, [
      fired
        ? "Synthetic ContextEngine lifecycle canary fired against an isolated in-process context engine. This proves observer shape, not production lifecycle firing."
        : "Synthetic ContextEngine lifecycle canary registered but did not fire.",
    ]);
  }
}

function normalizeHookNameForRuntimeEvidence(hookName: string): string {
  return hookName.replace(/\(\)$/u, "").replace(/\s+/gu, "").trim().toLowerCase();
}

export async function mergeProductionHookProbeEvidence(input: {
  artifact: HookDiscoveryArtifact;
  config?: Partial<MemoryOpsClosedLoopConfig>;
}): Promise<HookDiscoveryArtifact> {
  const config = resolveMemoryOpsConfig(input.config ?? {});
  const runtimeProbeDir = path.join(config.baseDir, "hook-runtime-canaries");
  const records = await readProductionHookProbeRecords({ baseDir: runtimeProbeDir });
  if (records.length === 0) {
    return input.artifact;
  }
  const latestByHook = new Map<string, (typeof records)[number]>();
  for (const record of records) {
    const key = normalizeHookNameForRuntimeEvidence(record.hook_name);
    const previous = latestByHook.get(key);
    if (!previous || previous.observed_at < record.observed_at) {
      latestByHook.set(key, record);
    }
  }

  for (const target of input.artifact.targets) {
    const record = latestByHook.get(normalizeHookNameForRuntimeEvidence(target.hook_name));
    if (!record) {
      continue;
    }
    target.registration_surface_exists = true;
    target.registration_succeeded = true;
    target.fired = true;
    target.verification_level = "runtime_observed";
    target.status = "production_verified";
    target.trigger_method = "production_runtime_probe";
    target.observed_payload_keys = record.payload_key_paths;
    target.observed_ordering = record.ordering_marker;
    target.notes = [
      ...target.notes.filter((note) => !note.includes("did not execute a live lifecycle trigger")),
      `Production runtime probe observed this hook at ${record.observed_at}; evidence file ${path.join(
        runtimeProbeDir,
        `${record.observed_at.slice(0, 10)}.jsonl`,
      )}.`,
    ];
  }
  return input.artifact;
}

function formatTimestampForPath(iso: string): string {
  return iso.replaceAll(":", "").replaceAll(".", "-");
}

export async function writeHookDiscoveryArtifact(input: {
  artifact: HookDiscoveryArtifact;
  config?: Partial<MemoryOpsClosedLoopConfig>;
}): Promise<string> {
  const config = resolveMemoryOpsConfig(input.config ?? {});
  const outputDir = path.join(config.baseDir, "hook-discovery");
  await mkdir(outputDir, { recursive: true });
  const filePath = path.join(
    outputDir,
    `${formatTimestampForPath(input.artifact.created_at)}.json`,
  );
  await writeFile(filePath, `${JSON.stringify(input.artifact, null, 2)}\n`, "utf8");
  return filePath;
}

export function summarizeHookDiscovery(artifact: HookDiscoveryArtifact): Record<string, string[]> {
  const summary: Record<string, string[]> = {};
  for (const target of artifact.targets) {
    summary[target.status] ??= [];
    summary[target.status].push(target.hook_name);
  }
  return summary;
}
