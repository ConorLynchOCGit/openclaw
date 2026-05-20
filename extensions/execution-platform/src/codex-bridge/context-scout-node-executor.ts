import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { CodeIntelligenceRuntimeToolId } from "../code-intelligence/index.ts";
import type { JsonValue, RuntimeJob, RuntimeJobRepository } from "../runtime-job-repository.ts";
import type { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import {
  buildContextScoutToolLoopRun,
  buildContextScoutRepoAnalysisFindings,
  buildContextScoutVerifiedFileRefs,
  inspectContextScoutModelAuthoredHandoffSubstance,
  summarizeContextScoutToolLoopRun,
  validateContextScoutToolLoopForImplementation,
  type ContextScoutToolLoopRun,
} from "../workflows/context-scout-tool-loop.ts";
import {
  deriveContextSnapshotRefsFromArtifactRefs,
  normalizeContextSnapshotRefs,
} from "../workflows/context-snapshot.ts";
import {
  buildContextHandoffPacket,
  type CommitmentWorkPacket,
  type ContextHandoffPacket,
} from "../workflows/mission-work-packets.ts";
import type { TeamGraphNode, TeamRunGraph } from "../workflows/runtime-work-graph.ts";
import {
  invokeSchedulerRuntimeTool,
  type SchedulerRuntimeToolInvocationSummary,
} from "../workflows/scheduler-runtime-tools.ts";
import type { SourcePromptContextIndex } from "../workflows/source-prompt-context.ts";
import { parseContextScoutOutput, validateContextScoutOutputShape } from "./child-work-order.ts";
import type { AgentTeamModelClient, AgentTeamModelClientResult } from "./live-agent-team-runner.ts";

export type BoundedRepoContextIndexEntry = {
  fileRef: string;
  evidenceHash: string;
  boundedSummary: string;
  rawFileContentStored: false;
};

export type VerifiedContextScoutOutput = {
  output: ReturnType<typeof parseContextScoutOutput>;
  verifiedFileRefs: string[];
  reasonCodes: string[];
};

export type ContextScoutNodeExecutorResult = {
  status: "succeeded" | "needs_review" | "failed";
  runtimeJobId: string;
  graphId: string;
  nodeId: string;
  roleId: "context_scout";
  sourceRuntimeJobId?: string | null;
  contextHandoffPacketRef: string | null;
  contextScoutToolLoopRef: string | null;
  contextScoutToolLoopRun: ContextScoutToolLoopRun | null;
  verifiedFileRefs: string[];
  rejectedRefs: string[];
  runtimeToolInvocationRefs: string[];
  codeIntelligenceResultRefs: string[];
  codeIntelligenceRuntimeToolInvocationRefs: string[];
  codeIntelligenceSymbolRefs: string[];
  codeIntelligenceDiagnosticRefs: string[];
  codeIntelligenceRelatedTestRefs: string[];
  codeIntelligenceImpactRefs: string[];
  codeIntelligenceSemanticModes: string[];
  codeIntelligenceLimitations: string[];
  codeIntelligenceBackendIds: string[];
  codeIntelligenceBackendHealthRefs: string[];
  codeIntelligenceWorkspaceSnapshotRefs: string[];
  codeIntelligenceFallbackReasonCodes: string[];
  codeIntelligenceDiagnosticVersionRefs: string[];
  codeIntelligenceProjectConfigRefs: string[];
  codeIntelligenceBackendLatencyMs: number | null;
  codeIntelligenceResultCounts: Record<string, number>;
  artifactRefs: string[];
  reasonCodes: string[];
  implementationBlocked: boolean;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  workQueueLifecycleMutated: false;
};

export type ContextScoutNodeExecutorInput = {
  runtimeJobs: RuntimeJobRepository;
  runtimeToolKernel?: RuntimeToolKernel | null;
  runtimeJob: RuntimeJob;
  sourceRuntimeJobId?: string | null;
  graph: TeamRunGraph;
  node: TeamGraphNode;
  repoRoot: string;
  approvedRepoScopePaths: string[];
  validationCommandRefs: string[];
  objectiveSummary: string;
  commitmentWorkPackets: CommitmentWorkPacket[];
  sourcePromptContextIndex: SourcePromptContextIndex | null;
  roleModelClient?: AgentTeamModelClient | null;
  modelId?: string;
  modelCandidateId?: string;
  maxModelTokens?: number;
  timeoutMs?: number;
};

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function bounded(value: string | null | undefined, max = 1_000): string {
  return (value ?? "").trim().replace(/\s+/gu, " ").slice(0, max);
}

function readPositiveIntEnv(name: string, fallback: number, input?: { max?: number }): number {
  const raw = process.env[name]?.trim();
  const parsed = raw ? Number(raw) : NaN;
  const value = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  return Math.max(1, Math.min(input?.max ?? Number.MAX_SAFE_INTEGER, value));
}

export function resolveContextScoutModelCallBudget(input: {
  startedAtMs: number;
  nowMs: number;
  totalTimeoutMs: number;
  minimumUsefulTimeoutMs?: number;
}):
  | { status: "available"; timeoutMs: number; reasonCodes: string[] }
  | { status: "expired"; timeoutMs: 0; reasonCodes: string[] } {
  const totalTimeoutMs = Number.isFinite(input.totalTimeoutMs)
    ? Math.max(1, Math.floor(input.totalTimeoutMs))
    : 300_000;
  const remainingMs = input.startedAtMs + totalTimeoutMs - input.nowMs;
  const minimumUsefulTimeoutMs = Math.max(1, Math.floor(input.minimumUsefulTimeoutMs ?? 1));
  if (remainingMs < minimumUsefulTimeoutMs) {
    return {
      status: "expired",
      timeoutMs: 0,
      reasonCodes: [
        "context_scout_total_budget_exhausted",
        `context_scout_total_budget_ms:${totalTimeoutMs}`,
        `context_scout_remaining_budget_ms:${Math.max(0, Math.floor(remainingMs))}`,
      ],
    };
  }
  return {
    status: "available",
    timeoutMs: Math.max(1, Math.floor(remainingMs)),
    reasonCodes: [
      "context_scout_model_call_budget_resolved",
      `context_scout_total_budget_ms:${totalTimeoutMs}`,
      `context_scout_remaining_budget_ms:${Math.max(0, Math.floor(remainingMs))}`,
    ],
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseJsonObject(text: string | null): Record<string, unknown> {
  const source = text?.trim() ?? "";
  if (!source.includes("{")) {
    return {};
  }
  try {
    const parsed = JSON.parse(source.slice(source.indexOf("{"), source.lastIndexOf("}") + 1));
    return asRecord(parsed);
  } catch {
    return {};
  }
}

function stringArray(value: unknown, max = 40): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (item): item is string => typeof item === "string" && item.trim().length > 0,
          ),
        ),
      ]
        .map((item) => bounded(item, 260))
        .slice(0, max)
    : [];
}

function jsonSafeRecord(input: Record<string, unknown>): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) {
      continue;
    }
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      out[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value.filter((item): item is string => typeof item === "string");
    }
  }
  return out;
}

function normalizedRepoFileRef(fileRef: string, repoRoot: string): string | null {
  let candidate = fileRef.trim().replaceAll("\\", "/");
  const root = repoRoot.replaceAll("\\", "/").replace(/\/+$/u, "");
  if (candidate.startsWith(`${root}/`)) {
    candidate = candidate.slice(root.length + 1);
  }
  if (candidate.startsWith("services/openclaw-roles/live/")) {
    candidate = candidate.slice("services/openclaw-roles/live/".length);
  }
  if (!candidate || candidate.startsWith("/") || candidate.includes("..")) {
    return null;
  }
  return candidate;
}

function allowedRepoFileRef(fileRef: string, allowedFileRefs: string[]): boolean {
  return allowedFileRefs.some(
    (allowedRef) =>
      fileRef === allowedRef || (allowedRef.endsWith("/") && fileRef.startsWith(allowedRef)),
  );
}

const CONTEXT_SCOUT_DISCOVERY_STOP_TOKENS = new Set([
  "extensions",
  "execution",
  "platform",
  "src",
  "docs",
  "projects",
  "specs",
  "scripts",
  "test",
  "tests",
  "index",
  "runtime",
  "workflows",
]);

function discoveryTokens(refs: string[]): string[] {
  return [
    ...new Set(
      refs
        .flatMap((ref) => ref.toLowerCase().split(/[^a-z0-9]+/u))
        .filter((token) => token.length >= 3 && !CONTEXT_SCOUT_DISCOVERY_STOP_TOKENS.has(token)),
    ),
  ].slice(0, 24);
}

function scoreContextScoutCandidate(fileRef: string, tokens: string[]): number {
  if (tokens.length === 0) {
    return 0;
  }
  const lower = fileRef.toLowerCase();
  const basename = path.basename(lower);
  return tokens.reduce((score, token) => {
    if (!lower.includes(token)) {
      return score;
    }
    return score + 1 + (basename.includes(token) ? 2 : 0);
  }, 0);
}

async function nearestExistingAllowedAncestor(input: {
  repoRoot: string;
  fileRef: string;
  allowedFileRefs: string[];
}): Promise<string | null> {
  let current = input.fileRef.replace(/\/+$/u, "");
  for (;;) {
    if (!current || current === ".") {
      return null;
    }
    if (
      allowedRepoFileRef(`${current}/`, input.allowedFileRefs) ||
      allowedRepoFileRef(current, input.allowedFileRefs)
    ) {
      const info = await stat(path.join(input.repoRoot, current)).catch(() => null);
      if (info?.isDirectory()) {
        return current;
      }
    }
    const next = path.dirname(current).replaceAll("\\", "/");
    if (next === current) {
      return null;
    }
    current = next;
  }
}

async function collectContextScoutFiles(input: {
  repoRoot: string;
  rootRef: string;
  allowedFileRefs: string[];
  maxFiles: number;
}): Promise<string[]> {
  const absolute = path.join(input.repoRoot, input.rootRef);
  const info = await stat(absolute).catch(() => null);
  if (info?.isFile()) {
    return [input.rootRef];
  }
  if (!info?.isDirectory()) {
    return [];
  }
  const candidates: string[] = [];
  const entries = await readdir(absolute, { recursive: true, withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (candidates.length >= input.maxFiles) {
      break;
    }
    if (!entry.isFile()) {
      continue;
    }
    const parent = "parentPath" in entry ? entry.parentPath : absolute;
    const relative = path
      .relative(input.repoRoot, path.join(parent, entry.name))
      .replaceAll("\\", "/");
    if (
      /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|md|json)$/iu.test(relative) &&
      !relative.includes("/node_modules/") &&
      !relative.includes("/dist/") &&
      allowedRepoFileRef(relative, input.allowedFileRefs)
    ) {
      candidates.push(relative);
    }
  }
  return candidates;
}

async function repoFileExists(input: {
  repoRoot: string;
  fileRef: string;
  allowedFileRefs: string[];
}): Promise<boolean> {
  const normalized = normalizedRepoFileRef(input.fileRef, input.repoRoot);
  if (!normalized || !allowedRepoFileRef(normalized, input.allowedFileRefs)) {
    return false;
  }
  const info = await stat(path.join(input.repoRoot, normalized)).catch(() => null);
  return info?.isFile() === true;
}

export async function discoverContextScoutRepoCandidateFileRefs(input: {
  repoRoot: string;
  targetRefs: string[];
  allowedFileRefs: string[];
  maxFiles?: number;
}): Promise<string[]> {
  const maxFiles = Math.max(10, Math.min(220, input.maxFiles ?? 120));
  const candidates: string[] = [];
  const roots = input.targetRefs.length > 0 ? input.targetRefs : input.allowedFileRefs;
  const tokens = discoveryTokens(roots);
  for (const ref of roots.slice(0, 20)) {
    const normalized = normalizedRepoFileRef(ref, input.repoRoot);
    if (!normalized || !allowedRepoFileRef(normalized, input.allowedFileRefs)) {
      continue;
    }
    const absolute = path.join(input.repoRoot, normalized);
    const info = await stat(absolute).catch(() => null);
    if (info?.isFile()) {
      candidates.push(normalized);
      continue;
    }
    const rootRef = info?.isDirectory()
      ? normalized
      : await nearestExistingAllowedAncestor({
          repoRoot: input.repoRoot,
          fileRef: normalized,
          allowedFileRefs: input.allowedFileRefs,
        });
    if (!rootRef) {
      continue;
    }
    candidates.push(
      ...(await collectContextScoutFiles({
        repoRoot: input.repoRoot,
        rootRef,
        allowedFileRefs: input.allowedFileRefs,
        maxFiles: Math.min(800, maxFiles * 6),
      })),
    );
  }
  return [...new Set(candidates)]
    .toSorted((a, b) => {
      const scoreDelta =
        scoreContextScoutCandidate(b, tokens) - scoreContextScoutCandidate(a, tokens);
      return scoreDelta === 0 ? a.localeCompare(b) : scoreDelta;
    })
    .slice(0, maxFiles);
}

export async function buildBoundedContextScoutRepoContextIndex(input: {
  repoRoot: string;
  fileRefs: string[];
  maxFiles?: number;
}): Promise<BoundedRepoContextIndexEntry[]> {
  const maxFiles = Math.max(8, Math.min(80, input.maxFiles ?? 40));
  const entries: BoundedRepoContextIndexEntry[] = [];
  for (const fileRef of input.fileRefs.slice(0, maxFiles)) {
    const text = await readFile(path.join(input.repoRoot, fileRef), "utf8").catch(() => "");
    if (!text) {
      continue;
    }
    const lines = text.split(/\r?\n/u);
    const importLines = lines
      .filter((line) => /^(?:import|export)\s/u.test(line.trim()))
      .slice(0, 8)
      .join(" ");
    const symbolLines = lines
      .filter((line) =>
        /^\s*(?:export\s+)?(?:class|function|const|type|interface|enum)\s+[A-Za-z0-9_]+/u.test(
          line,
        ),
      )
      .slice(0, 12)
      .join(" ");
    const packageOrHeadingLines = lines
      .filter((line) => /^\s*(?:"(?:name|scripts|dependencies)"|#{1,4}\s+)/u.test(line))
      .slice(0, 8)
      .join(" ");
    const boundedSummary = bounded(
      [symbolLines, importLines, packageOrHeadingLines, text.slice(0, 500)]
        .filter(Boolean)
        .join(" "),
      1_200,
    );
    entries.push({
      fileRef,
      evidenceHash: sha256Text(JSON.stringify({ fileRef, boundedSummary })).slice(0, 64),
      boundedSummary:
        boundedSummary || `Verified existing repo file available to context scout: ${fileRef}`,
      rawFileContentStored: false,
    });
  }
  return entries;
}

export async function verifyContextScoutOutputAgainstRepo(input: {
  output: ReturnType<typeof parseContextScoutOutput>;
  repoRoot: string;
  allowedFileRefs: string[];
}): Promise<VerifiedContextScoutOutput> {
  const reasonCodes: string[] = [];
  const verifiedFileRefs: string[] = [];
  const relevantFiles = [];
  for (const file of input.output.relevantFiles) {
    if (
      await repoFileExists({
        repoRoot: input.repoRoot,
        fileRef: file.path,
        allowedFileRefs: input.allowedFileRefs,
      })
    ) {
      relevantFiles.push(file);
      verifiedFileRefs.push(file.path);
    } else {
      reasonCodes.push("context_scout_unverified_relevant_file_ref");
    }
  }
  const recommendedEditPoints = [];
  for (const point of input.output.recommendedEditPoints) {
    if (
      await repoFileExists({
        repoRoot: input.repoRoot,
        fileRef: point.path,
        allowedFileRefs: input.allowedFileRefs,
      })
    ) {
      recommendedEditPoints.push(point);
      verifiedFileRefs.push(point.path);
    } else {
      reasonCodes.push("context_scout_unverified_edit_point_ref");
    }
  }
  if (input.output.relevantFiles.length > 0 && relevantFiles.length === 0) {
    reasonCodes.push("context_scout_no_verified_relevant_files");
  }
  return {
    output: {
      ...input.output,
      relevantFiles,
      recommendedEditPoints,
      limitations:
        reasonCodes.length > 0
          ? [
              ...input.output.limitations,
              "Some context-scout file refs were not verified in the repo.",
            ]
          : input.output.limitations,
    },
    verifiedFileRefs: [...new Set(verifiedFileRefs)].slice(0, 30),
    reasonCodes: [...new Set(reasonCodes)].slice(0, 12),
  };
}

export function applyRuntimeVerifiedContextToScoutOutput(input: {
  output: ReturnType<typeof parseContextScoutOutput> | null;
  groundedOutput: VerifiedContextScoutOutput | null;
  boundedRepoContextIndex: BoundedRepoContextIndexEntry[];
  maxFileRefs?: number;
}): VerifiedContextScoutOutput | null {
  const output = input.groundedOutput?.output ?? input.output;
  if (!output) {
    return null;
  }
  const runtimeFileRefs = [...new Set(input.boundedRepoContextIndex.map((entry) => entry.fileRef))]
    .filter((fileRef) => fileRef.trim().length > 0)
    .slice(0, input.maxFileRefs ?? 24);
  if (runtimeFileRefs.length === 0) {
    return input.groundedOutput;
  }
  const groundedVerifiedRefs = input.groundedOutput?.verifiedFileRefs ?? [];
  const verifiedFileRefs = [...new Set([...groundedVerifiedRefs, ...runtimeFileRefs])].slice(
    0,
    input.maxFileRefs ?? 24,
  );
  const runtimeRelevantFiles = runtimeFileRefs.map((fileRef) => {
    const contextEntry = input.boundedRepoContextIndex.find((entry) => entry.fileRef === fileRef);
    return {
      path: fileRef,
      whyRelevant: bounded(
        contextEntry?.boundedSummary ??
          "Runtime-verified repo context candidate supplied by the context tool loop.",
        260,
      ),
      keySymbolsOrFunctions: [],
    };
  });
  const runtimeEditPoints =
    output.recommendedEditPoints.length > 0
      ? []
      : runtimeFileRefs.slice(0, 12).map((fileRef) => ({
          path: fileRef,
          symbolOrRegion: "runtime_verified_context",
          reason: "Runtime verified this file as bounded context for downstream inspection.",
        }));
  return {
    output: {
      ...output,
      relevantFiles: output.relevantFiles.length > 0 ? output.relevantFiles : runtimeRelevantFiles,
      recommendedEditPoints: [...output.recommendedEditPoints, ...runtimeEditPoints].slice(0, 20),
      limitations: [
        ...output.limitations,
        ...(groundedVerifiedRefs.length === 0
          ? [
              "Model output did not provide verified repo file refs; runtime supplied verified context-tool file refs instead.",
            ]
          : []),
      ].slice(0, 8),
    },
    verifiedFileRefs,
    reasonCodes: [
      ...new Set([
        ...(input.groundedOutput?.reasonCodes ?? []),
        "context_scout_tool_first_verified_context_used",
      ]),
    ].slice(0, 12),
  };
}

function contextScoutPrompt(input: {
  objectiveSummary: string;
  nodeObjective: string;
  commitmentWorkPackets: CommitmentWorkPacket[];
  sourcePromptContextIndex: SourcePromptContextIndex | null;
  boundedRepoContextIndex: BoundedRepoContextIndexEntry[];
  validationCommandRefs: string[];
}): string {
  return [
    "You are the OpenClaw context_scout node.",
    "Use only bounded runtime-provided evidence. Do not invent repo paths.",
    "Return strict JSON with relevantFiles, existingPatterns, risks, recommendedEditPoints, validationSuggestions, handoffSummaryForImplementation, confidence, limitations.",
    "These context handoff fields are required for a usable scout result. Do not satisfy this role by returning only generic role closeout fields.",
    "A valid handoff must contain model-authored implementation substance, not just file refs. Include a concrete handoffSummaryForImplementation plus substantive existingPatterns, risks, validationSuggestions, and non-generic recommendedEditPoints entries tied to the packet objective.",
    "Use at least 3 relevantFiles from boundedRepoContextIndex when available. Use at least 2 existingPatterns, 2 risks, 2 validationSuggestions, and 2 recommendedEditPoints unless you are explicitly returning needs_review with a concrete blocker.",
    "The handoffSummaryForImplementation must explain what the next implementation worker should change or inspect, why these files matter, and what validation should prove. Do not write a generic 'use target refs' summary.",
    "Do not return empty existingPatterns or risks unless you explicitly request more bounded context. Do not use runtime_verified_context as a symbol or region; name the likely file area or symbol from the bounded summaries.",
    "For each relevant file, explain why it matters for this packet and which downstream worker should inspect it next.",
    "If runtime-provided file refs are useful but you cannot add substantive implementation guidance, say so in limitations and identify the missing bounded context instead of returning a generic handoff.",
    "If context is insufficient, return limitations and exact missing context. Do not store raw prompts, raw responses, provider logs, tool logs, or secrets.",
    'Required JSON shape: {"relevantFiles":[{"path":"relative/file.ts","whyRelevant":"why this exact existing file matters","keySymbolsOrFunctions":["symbol or area"]}],"existingPatterns":["concrete pattern from boundedRepoContextIndex"],"risks":["concrete implementation or validation risk"],"recommendedEditPoints":[{"path":"relative/file.ts","symbolOrRegion":"specific symbol or file area","reason":"why downstream worker should inspect or edit it"}],"validationSuggestions":["specific test/build/readback command or check"],"handoffSummaryForImplementation":"detailed worker handoff grounded in the files above","confidence":0.8,"limitations":[]}',
    `objectiveSummary: ${bounded(input.objectiveSummary, 2_000)}`,
    `nodeObjective: ${bounded(input.nodeObjective, 1_500)}`,
    `commitmentWorkPackets: ${bounded(
      JSON.stringify(
        input.commitmentWorkPackets.map((packet) => ({
          packetRef: packet.packetRef,
          commitmentId: packet.commitmentId,
          contextScoutObjective: packet.contextScoutObjective,
          requiredContextQuestions: packet.requiredContextQuestions,
          expectedContextScoutOutput: packet.expectedContextScoutOutput,
          likelyRepoAreas: packet.likelyRepoAreas,
          stopIfMissing: packet.stopIfMissing,
        })),
      ),
      8_000,
    )}`,
    `sourcePromptSections: ${bounded(JSON.stringify(input.sourcePromptContextIndex?.sections.slice(0, 24) ?? []), 6_000)}`,
    `boundedRepoContextIndex: ${bounded(JSON.stringify(input.boundedRepoContextIndex), 12_000)}`,
    `validationCommandRefs: ${input.validationCommandRefs.slice(0, 12).join(", ")}`,
  ].join("\n");
}

async function callContextScoutModel(input: {
  modelClient?: AgentTeamModelClient | null;
  modelId: string;
  modelCandidateId: string;
  prompt: string;
  maxTokens: number;
  timeoutMs: number;
  perAttemptTimeoutMs?: number;
  maxAttempts?: number;
  nodeStartedAtMs?: number;
  minimumUsefulTimeoutMs?: number;
}): Promise<AgentTeamModelClientResult> {
  if (!input.modelClient) {
    return {
      status: "needs_review",
      responseText: null,
      responseHash: null,
      errorReasonCode: "context_scout_model_client_missing",
    };
  }
  const budget =
    typeof input.nodeStartedAtMs === "number"
      ? resolveContextScoutModelCallBudget({
          startedAtMs: input.nodeStartedAtMs,
          nowMs: Date.now(),
          totalTimeoutMs: input.timeoutMs,
          minimumUsefulTimeoutMs: input.minimumUsefulTimeoutMs,
        })
      : ({
          status: "available",
          timeoutMs: input.timeoutMs,
          reasonCodes: ["context_scout_model_call_budget_legacy_available"],
        } as const);
  if (budget.status === "expired") {
    return {
      status: "needs_review",
      responseText: null,
      responseHash: null,
      errorReasonCode: budget.reasonCodes[0],
      providerResponseDiagnostics: {
        reasonCodes: budget.reasonCodes,
        timeoutMs: input.timeoutMs,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    };
  }
  const attemptTimeoutMs = Math.max(
    1,
    Math.min(budget.timeoutMs, input.perAttemptTimeoutMs ?? budget.timeoutMs),
  );
  const maxAttempts = Math.max(1, Math.min(3, Math.floor(input.maxAttempts ?? 1)));
  return input.modelClient.callRole({
    roleId: "context_scout",
    modelId: input.modelId,
    modelCandidateId: input.modelCandidateId,
    prompt: input.prompt,
    responseFormat: "json_object",
    maxTokens: input.maxTokens,
    timeoutMs: attemptTimeoutMs,
    maxAttempts,
  });
}

function contextScoutSubstanceNeedsRepair(input: {
  output: ReturnType<typeof parseContextScoutOutput> | null;
  rawModelObject: Record<string, unknown>;
}): { needsRepair: boolean; missingFieldPaths: string[]; reasonCodes: string[] } {
  if (!input.output) {
    return {
      needsRepair: true,
      missingFieldPaths: ["context_scout_output"],
      reasonCodes: ["context_scout_output_missing"],
    };
  }
  const rawSummary =
    typeof input.rawModelObject.handoffSummaryForImplementation === "string"
      ? input.rawModelObject.handoffSummaryForImplementation
      : "";
  const review = inspectContextScoutModelAuthoredHandoffSubstance({
    modelAuthoredSummary: rawSummary,
    recommendedEditPoints: input.output.recommendedEditPoints.map(
      (point) => `${point.path}:${point.symbolOrRegion} - ${point.reason}`,
    ),
    existingPatterns: input.output.existingPatterns,
    risks: input.output.risks,
    validationSuggestions: input.output.validationSuggestions,
  });
  return {
    needsRepair: !review.hasModelAuthoredHandoffSubstance,
    missingFieldPaths: review.missingFieldPaths,
    reasonCodes: review.reasonCodes,
  };
}

function deriveContextScoutSymbolRefs(
  output: ReturnType<typeof parseContextScoutOutput>,
): string[] {
  return [
    ...new Set(
      output.relevantFiles.flatMap((file) =>
        file.keySymbolsOrFunctions.map((symbol) => `${file.path}:${symbol}`),
      ),
    ),
  ]
    .map((ref) => bounded(ref, 260))
    .slice(0, 40);
}

function deriveContextScoutTestRefs(input: {
  output: ReturnType<typeof parseContextScoutOutput>;
  verifiedFileRefs: string[];
  validationCommandRefs: string[];
}): string[] {
  return [
    ...new Set(
      [
        ...input.verifiedFileRefs.filter((fileRef) =>
          /(?:^|\/)(?:test|tests|__tests__|.*\.(?:test|spec))\.(?:ts|tsx|js|jsx|mjs|cjs)$/iu.test(
            fileRef,
          ),
        ),
        ...input.validationCommandRefs,
        ...input.output.validationSuggestions,
      ].filter((value) => value.trim().length > 0),
    ),
  ]
    .map((ref) => bounded(ref, 260))
    .slice(0, 32);
}

function summarizeContextScoutForSynthesis(input: {
  objective: string;
  output: ReturnType<typeof parseContextScoutOutput>;
  verifiedFileRefs: string[];
  symbolRefs: string[];
  testRefs: string[];
  limitations: string[];
}): string {
  return bounded(
    [
      `Objective: ${input.objective}`,
      `Verified files: ${input.verifiedFileRefs.slice(0, 12).join(", ") || "none"}.`,
      `Symbols/areas: ${input.symbolRefs.slice(0, 10).join(", ") || "none"}.`,
      `Tests/checks: ${input.testRefs.slice(0, 8).join(", ") || "none"}.`,
      `Patterns: ${input.output.existingPatterns.slice(0, 4).join(" | ") || "none"}.`,
      `Risks: ${input.output.risks.slice(0, 4).join(" | ") || "none"}.`,
      `Limitations: ${input.limitations.slice(0, 4).join(" | ") || "none"}.`,
    ].join(" "),
    1_500,
  );
}

function verifiedFileRefsForRepair(
  groundedOutput: VerifiedContextScoutOutput | null | undefined,
): string[] {
  return groundedOutput?.verifiedFileRefs ?? [];
}

export async function runContextScoutNodeExecutor(
  input: ContextScoutNodeExecutorInput,
): Promise<ContextScoutNodeExecutorResult> {
  const nodeStartedAtMs = Date.now();
  const totalTimeoutMs = input.timeoutMs ?? 300_000;
  const modelAttemptTimeoutMs = readPositiveIntEnv(
    "OPENCLAW_CONTEXT_SCOUT_MODEL_CALL_TIMEOUT_MS",
    Math.min(totalTimeoutMs, 90_000),
    { max: totalTimeoutMs },
  );
  const modelMaxAttempts = readPositiveIntEnv("OPENCLAW_CONTEXT_SCOUT_MODEL_MAX_ATTEMPTS", 2, {
    max: 3,
  });
  const metadata = asRecord(input.node.metadata);
  const commitmentIds = stringArray(metadata.commitmentIdsAdvanced, 24);
  const targetRefs = [
    ...stringArray(metadata.targetRefs, 40),
    ...input.commitmentWorkPackets.flatMap((packet) => packet.likelyRepoAreas),
  ];
  const nodeObjective = bounded(
    typeof metadata.exactObjective === "string"
      ? metadata.exactObjective
      : typeof metadata.objective === "string"
        ? metadata.objective
        : "Inspect repo context for downstream implementation.",
    1_500,
  );
  const runtimeToolInvocationRefs: string[] = [];
  const toolSummaries: SchedulerRuntimeToolInvocationSummary[] = [];
  const invokeTool = async (
    toolId: Parameters<typeof invokeSchedulerRuntimeTool>[0]["toolId"],
    idempotencyKey: string,
    inputSummary: string,
    metadataValue: JsonValue,
    volatileInput?: unknown,
  ): Promise<SchedulerRuntimeToolInvocationSummary | null> => {
    if (!input.runtimeToolKernel) {
      return null;
    }
    const summary = await invokeSchedulerRuntimeTool({
      kernel: input.runtimeToolKernel,
      toolId,
      runtimeJobId: input.runtimeJob.jobId,
      graphId: input.graph.graphId,
      nodeId: input.node.nodeId,
      roleRef: "context_scout",
      modelRef: input.modelId ?? "openrouter/context-scout",
      idempotencyKey,
      inputRef: input.node.nodeId,
      inputSummary,
      metadata: metadataValue,
      volatileInput,
    });
    toolSummaries.push(summary);
    runtimeToolInvocationRefs.push(summary.invocationRef);
    return summary;
  };

  const invokeCodeIntelligenceTool = async (
    toolId: CodeIntelligenceRuntimeToolId,
    idempotencyKey: string,
    inputSummary: string,
    query: Record<string, unknown>,
  ): Promise<SchedulerRuntimeToolInvocationSummary | null> => {
    const codeIntelligenceQuery = jsonSafeRecord(query);
    return invokeTool(
      toolId,
      idempotencyKey,
      inputSummary,
      {
        codeIntelligenceQuery,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      },
      { codeIntelligenceQuery },
    );
  };

  const collectCodeIntelligence = (
    summaries: SchedulerRuntimeToolInvocationSummary[],
  ): {
    resultRefs: string[];
    invocationRefs: string[];
    symbolRefs: string[];
    diagnosticRefs: string[];
    relatedTestRefs: string[];
    impactRefs: string[];
    semanticModes: string[];
    limitations: string[];
    backendIds: string[];
    backendHealthRefs: string[];
    workspaceSnapshotRefs: string[];
    fallbackReasonCodes: string[];
    diagnosticVersionRefs: string[];
    projectConfigRefs: string[];
    backendLatencyMs: number | null;
    resultCounts: Record<string, number>;
  } => {
    const codeSummaries = summaries.filter((summary) => summary.toolId.startsWith("code."));
    const outputMetadata = codeSummaries.map((summary) => asRecord(summary.outputMetadata));
    const semanticModes = outputMetadata.flatMap((metadata) =>
      typeof metadata.semanticMode === "string" ? [metadata.semanticMode] : [],
    );
    const limitations = [
      ...outputMetadata.flatMap((metadata) =>
        typeof metadata.structuralModeDisclosure === "string"
          ? [metadata.structuralModeDisclosure]
          : [],
      ),
      ...codeSummaries.flatMap((summary) =>
        summary.reasonCodes.includes("code_intelligence_structural_mode_used")
          ? [
              "Code intelligence is using bounded structural mode; LSP semantic backend is not yet attached.",
            ]
          : [],
      ),
    ];
    return {
      resultRefs: [
        ...new Set(
          codeSummaries.flatMap((summary) => [
            ...(summary.outputRef ? [summary.outputRef] : []),
            ...stringArray(asRecord(summary.outputMetadata).outputRef, 1),
          ]),
        ),
      ].slice(0, 80),
      invocationRefs: [...new Set(codeSummaries.map((summary) => summary.invocationRef))].slice(
        0,
        80,
      ),
      symbolRefs: [
        ...new Set(outputMetadata.flatMap((metadata) => stringArray(metadata.symbolRefs, 80))),
      ].slice(0, 80),
      diagnosticRefs: [
        ...new Set(outputMetadata.flatMap((metadata) => stringArray(metadata.diagnosticRefs, 80))),
      ].slice(0, 80),
      relatedTestRefs: [
        ...new Set(outputMetadata.flatMap((metadata) => stringArray(metadata.relatedTestRefs, 80))),
      ].slice(0, 80),
      impactRefs: [
        ...new Set(outputMetadata.flatMap((metadata) => stringArray(metadata.impactRefs, 80))),
      ].slice(0, 80),
      semanticModes: [...new Set(semanticModes)].slice(0, 8),
      limitations: [...new Set(limitations)].slice(0, 16),
      backendIds: [
        ...new Set(outputMetadata.flatMap((metadata) => stringArray(metadata.backendId, 1))),
      ].slice(0, 8),
      backendHealthRefs: [
        ...new Set(outputMetadata.flatMap((metadata) => stringArray(metadata.backendHealthRef, 1))),
      ].slice(0, 20),
      workspaceSnapshotRefs: [
        ...new Set(
          outputMetadata.flatMap((metadata) => stringArray(metadata.workspaceSnapshotRef, 1)),
        ),
      ].slice(0, 20),
      fallbackReasonCodes: [
        ...new Set(
          outputMetadata.flatMap((metadata) => stringArray(metadata.fallbackReasonCodes, 20)),
        ),
      ].slice(0, 20),
      diagnosticVersionRefs: [
        ...new Set(
          outputMetadata.flatMap((metadata) => stringArray(metadata.diagnosticVersionRef, 1)),
        ),
      ].slice(0, 20),
      projectConfigRefs: [
        ...new Set(
          outputMetadata.flatMap((metadata) => stringArray(metadata.projectConfigRefs, 20)),
        ),
      ].slice(0, 20),
      backendLatencyMs:
        outputMetadata
          .map((metadata) =>
            typeof metadata.backendLatencyMs === "number" ? metadata.backendLatencyMs : null,
          )
          .findLast((value): value is number => value !== null) ?? null,
      resultCounts: outputMetadata.reduce<Record<string, number>>((acc, metadata) => {
        const counts = asRecord(metadata.resultCounts);
        for (const key of [
          "symbols",
          "locations",
          "diagnostics",
          "importEdges",
          "relatedTests",
          "codeActions",
        ]) {
          const value = counts[key];
          if (typeof value === "number") {
            acc[key] = Math.max(acc[key] ?? 0, value);
          }
        }
        return acc;
      }, {}),
    };
  };

  await invokeTool("context_scout.plan", `${input.node.nodeId}:boundary-plan`, nodeObjective, {
    commitmentIds,
    commitmentWorkPacketRefs: input.commitmentWorkPackets.map((packet) => packet.packetRef),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  });
  await invokeTool(
    "context.request_more_context",
    `${input.node.nodeId}:context-boundary`,
    nodeObjective,
    {
      phase: "context_scout_start",
      requestedContextQuestions: input.commitmentWorkPackets
        .flatMap((packet) => packet.requiredContextQuestions)
        .slice(0, 24),
      sourcePromptHash: input.sourcePromptContextIndex?.promptHash ?? null,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
  );

  const candidateFileRefs = await discoverContextScoutRepoCandidateFileRefs({
    repoRoot: input.repoRoot,
    targetRefs: [
      ...input.commitmentWorkPackets.flatMap((packet) => packet.likelyRepoAreas),
      ...targetRefs,
    ],
    allowedFileRefs: input.approvedRepoScopePaths,
    maxFiles: 120,
  });
  const boundedRepoContextIndex = await buildBoundedContextScoutRepoContextIndex({
    repoRoot: input.repoRoot,
    fileRefs: candidateFileRefs,
    maxFiles: 48,
  });
  await invokeTool(
    "repo.search",
    `${input.node.nodeId}:repo-search`,
    `Search bounded repo candidates for ${commitmentIds.join(", ") || input.node.nodeId}.`,
    {
      candidateFileRefs: candidateFileRefs.slice(0, 80),
      expectedRepoAreaRefs: input.commitmentWorkPackets
        .flatMap((packet) => packet.likelyRepoAreas)
        .slice(0, 60),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
  );
  await invokeTool(
    "repo.list_files",
    `${input.node.nodeId}:repo-list-files`,
    `List bounded repo files available to ${input.node.nodeId}.`,
    {
      candidateFileRefs: candidateFileRefs.slice(0, 80),
      boundedRepoContextRefs: boundedRepoContextIndex.map((entry) => entry.fileRef).slice(0, 80),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
  );
  await invokeTool(
    "file.read",
    `${input.node.nodeId}:file-read-bounded-summaries`,
    `Read bounded summaries for ${boundedRepoContextIndex.length} candidate files.`,
    {
      boundedRepoContextRefs: boundedRepoContextIndex.map((entry) => ({
        fileRef: entry.fileRef,
        evidenceHash: entry.evidenceHash,
        rawFileContentStored: false,
      })),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawFileContentStored: false,
    },
  );
  await invokeTool(
    "context_scout.search_repo",
    `${input.node.nodeId}:boundary-search-repo`,
    `Search bounded repo candidates for ${commitmentIds.join(", ") || input.node.nodeId}.`,
    {
      candidateFileRefs: candidateFileRefs.slice(0, 80),
      boundedRepoContextRefs: boundedRepoContextIndex.map((entry) => entry.fileRef).slice(0, 80),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
  );

  const scoutQueryText = bounded(
    [
      nodeObjective,
      input.commitmentWorkPackets.flatMap((packet) => packet.requiredContextQuestions).join(" "),
      input.commitmentWorkPackets.flatMap((packet) => packet.likelyRepoAreas).join(" "),
    ].join(" "),
    700,
  );
  const codeCandidateFiles = [
    ...new Set([
      ...boundedRepoContextIndex.map((entry) => entry.fileRef),
      ...candidateFileRefs,
      ...targetRefs,
    ]),
  ].slice(0, 24);
  await invokeCodeIntelligenceTool(
    "code.search_symbols",
    `${input.node.nodeId}:code-search-symbols`,
    "Search code symbols for context scout handoff.",
    { query: scoutQueryText, filePaths: codeCandidateFiles, limit: 80 },
  );
  await invokeCodeIntelligenceTool(
    "code.get_document_symbols",
    `${input.node.nodeId}:code-document-symbols`,
    "Inspect document symbols for bounded context scout candidates.",
    { filePaths: codeCandidateFiles.slice(0, 16), limit: 120 },
  );
  await invokeCodeIntelligenceTool(
    "code.get_diagnostics",
    `${input.node.nodeId}:code-diagnostics`,
    "Read bounded code diagnostics for context scout candidates.",
    { filePaths: codeCandidateFiles.slice(0, 16), limit: 80 },
  );
  await invokeCodeIntelligenceTool(
    "code.find_related_tests",
    `${input.node.nodeId}:code-related-tests`,
    "Find related tests for bounded context scout candidates.",
    {
      targetFilePath: codeCandidateFiles[0] ?? null,
      filePath: codeCandidateFiles[0] ?? null,
      filePaths: codeCandidateFiles.slice(0, 16),
      query: scoutQueryText,
      limit: 60,
    },
  );
  await invokeCodeIntelligenceTool(
    "code.find_impact_radius",
    `${input.node.nodeId}:code-impact-radius`,
    "Find bounded impact radius for context scout candidates.",
    {
      targetFilePath: codeCandidateFiles[0] ?? null,
      targetSymbol: scoutQueryText.split(/\s+/u).find((token) => token.length > 4) ?? null,
      filePaths: codeCandidateFiles.slice(0, 16),
      query: scoutQueryText,
      limit: 80,
    },
  );
  const codeIntelligence = collectCodeIntelligence(toolSummaries);

  const modelPrompt = contextScoutPrompt({
    objectiveSummary: input.objectiveSummary,
    nodeObjective,
    commitmentWorkPackets: input.commitmentWorkPackets,
    sourcePromptContextIndex: input.sourcePromptContextIndex,
    boundedRepoContextIndex,
    validationCommandRefs: input.validationCommandRefs,
  });
  let modelResult = await callContextScoutModel({
    modelClient: input.roleModelClient,
    modelId: input.modelId ?? "deepseek/deepseek-v4-pro",
    modelCandidateId: input.modelCandidateId ?? "deepseek-v4-pro-context-scout",
    prompt: modelPrompt,
    maxTokens: input.maxModelTokens ?? 4_000,
    timeoutMs: totalTimeoutMs,
    perAttemptTimeoutMs: modelAttemptTimeoutMs,
    maxAttempts: modelMaxAttempts,
    nodeStartedAtMs,
    minimumUsefulTimeoutMs: 1_000,
  });
  let parsedOutput = parseContextScoutOutput({
    responseText: modelResult.responseText,
    targetRefs,
    validationCommandRefs: input.validationCommandRefs,
  });
  let groundedOutput = await verifyContextScoutOutputAgainstRepo({
    output: parsedOutput,
    repoRoot: input.repoRoot,
    allowedFileRefs: input.approvedRepoScopePaths,
  });
  let effectiveGroundedOutput = applyRuntimeVerifiedContextToScoutOutput({
    output: parsedOutput,
    groundedOutput,
    boundedRepoContextIndex,
  });
  let effectiveOutput = effectiveGroundedOutput?.output ?? parsedOutput;
  let shape = validateContextScoutOutputShape(effectiveOutput);
  let modelResponseObject = parseJsonObject(modelResult.responseText);
  let modelAuthoredSummaryFromRaw =
    typeof modelResponseObject.handoffSummaryForImplementation === "string"
      ? bounded(modelResponseObject.handoffSummaryForImplementation, 800)
      : "";
  let modelAuthoredSummary =
    modelAuthoredSummaryFromRaw || bounded(effectiveOutput.handoffSummaryForImplementation, 800);
  let substanceRepair = contextScoutSubstanceNeedsRepair({
    output: effectiveOutput,
    rawModelObject: modelResponseObject,
  });
  const repairReasonCodes: string[] = [];
  if (
    modelResult.status === "succeeded" &&
    modelResult.responseText &&
    (verifiedFileRefsForRepair(effectiveGroundedOutput).length === 0 ||
      !shape.valid ||
      substanceRepair.needsRepair)
  ) {
    await invokeTool(
      "context_scout.request_repair",
      `${input.node.nodeId}:boundary-repair-substance`,
      "Repair context scout handoff substance and repo grounding before implementation.",
      {
        failedReasonCodes: [
          ...(effectiveGroundedOutput?.reasonCodes ?? []),
          ...shape.reasonCodes,
          ...substanceRepair.reasonCodes,
        ].slice(0, 16),
        missingFieldPaths: substanceRepair.missingFieldPaths,
        boundedRepoContextIndexRefs: boundedRepoContextIndex
          .map((entry) => entry.fileRef)
          .slice(0, 80),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    );
    const repairPrompt = [
      modelPrompt,
      "REPAIR TURN: The prior context scout output was not acceptable for implementation handoff.",
      "Fix only these defects. Use exact boundedRepoContextIndex fileRef values. Add model-authored handoff substance in handoffSummaryForImplementation, existingPatterns, risks, validationSuggestions, and recommendedEditPoints. If still blocked, request exact bounded context instead of returning generic refs.",
      JSON.stringify({
        failedReasonCodes: [
          ...(effectiveGroundedOutput?.reasonCodes ?? []),
          ...shape.reasonCodes,
          ...substanceRepair.reasonCodes,
        ].slice(0, 16),
        missingFieldPaths: substanceRepair.missingFieldPaths,
        rawPromptStored: false,
        rawResponseStored: false,
      }),
    ].join("\n\n");
    const repairResult = await callContextScoutModel({
      modelClient: input.roleModelClient,
      modelId: input.modelId ?? "deepseek/deepseek-v4-pro",
      modelCandidateId: input.modelCandidateId ?? "deepseek-v4-pro-context-scout",
      prompt: repairPrompt,
      maxTokens: input.maxModelTokens ?? 4_000,
      timeoutMs: totalTimeoutMs,
      perAttemptTimeoutMs: modelAttemptTimeoutMs,
      maxAttempts: modelMaxAttempts,
      nodeStartedAtMs,
      minimumUsefulTimeoutMs: 30_000,
    });
    if (repairResult.status !== "succeeded") {
      repairReasonCodes.push(
        repairResult.errorReasonCode ?? "context_scout_repair_model_call_failed",
      );
    }
    const repairedOutput = parseContextScoutOutput({
      responseText: repairResult.responseText,
      targetRefs,
      validationCommandRefs: input.validationCommandRefs,
    });
    const repairedGrounding = await verifyContextScoutOutputAgainstRepo({
      output: repairedOutput,
      repoRoot: input.repoRoot,
      allowedFileRefs: input.approvedRepoScopePaths,
    });
    const repairedEffectiveGrounding = applyRuntimeVerifiedContextToScoutOutput({
      output: repairedOutput,
      groundedOutput: repairedGrounding,
      boundedRepoContextIndex,
    });
    const repairedEffectiveOutput = repairedEffectiveGrounding?.output ?? repairedOutput;
    const repairedShape = validateContextScoutOutputShape(repairedEffectiveOutput);
    const repairedRawObject = parseJsonObject(repairResult.responseText);
    const repairedSubstance = contextScoutSubstanceNeedsRepair({
      output: repairedEffectiveOutput,
      rawModelObject: repairedRawObject,
    });
    if (
      repairResult.status === "succeeded" &&
      verifiedFileRefsForRepair(repairedEffectiveGrounding).length > 0 &&
      repairedShape.valid &&
      !repairedSubstance.needsRepair
    ) {
      modelResult = repairResult;
      parsedOutput = repairedOutput;
      groundedOutput = repairedGrounding;
      effectiveGroundedOutput = repairedEffectiveGrounding;
      effectiveOutput = repairedEffectiveOutput;
      shape = repairedShape;
      modelResponseObject = repairedRawObject;
      modelAuthoredSummaryFromRaw =
        typeof modelResponseObject.handoffSummaryForImplementation === "string"
          ? bounded(modelResponseObject.handoffSummaryForImplementation, 800)
          : "";
      modelAuthoredSummary =
        modelAuthoredSummaryFromRaw ||
        bounded(effectiveOutput.handoffSummaryForImplementation, 800);
      substanceRepair = repairedSubstance;
    }
  }
  const verifiedFileRefs = effectiveGroundedOutput?.verifiedFileRefs ?? [];
  const symbolRefs = deriveContextScoutSymbolRefs(effectiveOutput);
  const testRefs = deriveContextScoutTestRefs({
    output: effectiveOutput,
    verifiedFileRefs,
    validationCommandRefs: input.validationCommandRefs,
  });
  const combinedSymbolRefs = [...new Set([...symbolRefs, ...codeIntelligence.symbolRefs])].slice(
    0,
    80,
  );
  const combinedTestRefs = [...new Set([...testRefs, ...codeIntelligence.relatedTestRefs])].slice(
    0,
    80,
  );
  const handoffSummaryForSynthesis = summarizeContextScoutForSynthesis({
    objective: nodeObjective,
    output: effectiveOutput,
    verifiedFileRefs,
    symbolRefs,
    testRefs,
    limitations: effectiveOutput.limitations,
  });
  const contextVerifiedFileRefs = buildContextScoutVerifiedFileRefs({
    fileRefs: verifiedFileRefs,
    runtimeJobId: input.runtimeJob.jobId,
    nodeId: input.node.nodeId,
    reasonCodes: ["context_scout_file_ref_verified_by_runtime"],
    boundedSummariesByFileRef: Object.fromEntries(
      boundedRepoContextIndex.map((entry) => [entry.fileRef, entry.boundedSummary]),
    ),
  });
  const contextRejectedRefs = (effectiveGroundedOutput?.reasonCodes ?? []).map((reasonCode) => ({
    ref: `context-scout-rejection://${input.node.nodeId}/${reasonCode}`,
    reasonCodes: [reasonCode],
    rejectedContextSource: "hybrid" as const,
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
  }));
  await invokeTool(
    "context_scout.verify_refs",
    `${input.node.nodeId}:boundary-verify-refs`,
    "Verify context scout repo refs.",
    {
      verifiedFileRefs,
      rejectedRefs: contextRejectedRefs.map((ref) => ref.ref),
      reasonCodes: effectiveGroundedOutput?.reasonCodes ?? [],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
  );
  await invokeTool(
    "file.inspect_symbols",
    `${input.node.nodeId}:inspect-symbols`,
    "Inspect bounded symbols and file areas for context scout handoff.",
    {
      symbolRefs,
      relevantFiles: effectiveOutput.relevantFiles.slice(0, 24).map((file) => ({
        path: file.path,
        keySymbolsOrFunctions: file.keySymbolsOrFunctions.slice(0, 12),
      })),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawFileContentStored: false,
    },
  );
  await invokeTool(
    "test.find_related",
    `${input.node.nodeId}:find-related-tests`,
    "Find related tests and validation refs for this context handoff.",
    {
      testRefs,
      validationSuggestions: effectiveOutput.validationSuggestions.slice(0, 16),
      validationCommandRefs: input.validationCommandRefs.slice(0, 12),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
  );
  if (effectiveOutput.limitations.length > 0 || contextRejectedRefs.length > 0) {
    await invokeTool(
      "context.limitations",
      `${input.node.nodeId}:context-limitations`,
      "Record bounded context scout limitations.",
      {
        limitations: effectiveOutput.limitations.slice(0, 12),
        rejectedRefs: contextRejectedRefs.map((ref) => ref.ref).slice(0, 24),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    );
  }
  if (contextVerifiedFileRefs.length > 0) {
    await invokeTool(
      "context_scout.select_relevant_files",
      `${input.node.nodeId}:boundary-select-relevant-files`,
      "Select relevant verified files for context scout handoff.",
      {
        relevantFiles: effectiveOutput.relevantFiles.slice(0, 24).map((file) => ({
          path: file.path,
          whyRelevant: file.whyRelevant,
          keySymbolsOrFunctions: file.keySymbolsOrFunctions.slice(0, 12),
        })),
        selectedFileRefs: contextVerifiedFileRefs.map((ref) => ref.fileRef).slice(0, 24),
        componentStatus:
          effectiveOutput.relevantFiles.length > 0 ? "model_authored" : "runtime_supplied_only",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    );
    await invokeTool(
      "context_scout.extract_existing_patterns",
      `${input.node.nodeId}:boundary-extract-existing-patterns`,
      "Extract model-authored existing implementation patterns.",
      {
        existingPatterns: effectiveOutput.existingPatterns.slice(0, 12),
        componentStatus: effectiveOutput.existingPatterns.length > 0 ? "model_authored" : "missing",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    );
    await invokeTool(
      "context_scout.assess_risks",
      `${input.node.nodeId}:boundary-assess-risks`,
      "Assess context handoff risks and limitations.",
      {
        risks: effectiveOutput.risks.slice(0, 12),
        limitations: effectiveOutput.limitations.slice(0, 12),
        componentStatus: effectiveOutput.risks.length > 0 ? "model_authored" : "missing",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    );
    await invokeTool(
      "context_scout.plan_edit_points",
      `${input.node.nodeId}:boundary-plan-edit-points`,
      "Plan downstream edit or inspection points.",
      {
        recommendedEditPoints: effectiveOutput.recommendedEditPoints.slice(0, 16).map((point) => ({
          path: point.path,
          symbolOrRegion: point.symbolOrRegion,
          reason: point.reason,
        })),
        componentStatus: effectiveOutput.recommendedEditPoints.some(
          (point) => point.symbolOrRegion !== "runtime_verified_context",
        )
          ? "model_authored"
          : "runtime_supplied_or_missing",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    );
    await invokeTool(
      "context_scout.plan_validation",
      `${input.node.nodeId}:boundary-plan-validation`,
      "Plan validation checks for context handoff.",
      {
        validationSuggestions: effectiveOutput.validationSuggestions.slice(0, 16),
        componentStatus:
          effectiveOutput.validationSuggestions.length >= 2 ? "model_authored" : "weak_or_missing",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    );
  }

  let handoff: ContextHandoffPacket | null = null;
  let handoffRef: string | null = null;
  if (shape.valid && verifiedFileRefs.length > 0 && modelAuthoredSummary) {
    const sourcePromptSnapshotRefs = normalizeContextSnapshotRefs(
      input.sourcePromptContextIndex?.contextSnapshotRefs,
    );
    const repoSnapshotRefs = deriveContextSnapshotRefsFromArtifactRefs({
      artifactRefs: verifiedFileRefs,
      sourceKind: "file_snapshot",
      runtimeJobId: input.runtimeJob.jobId,
      workflowId: input.graph.workflowId,
      graphId: input.graph.graphId,
      nodeId: input.node.nodeId,
      commitmentIds,
      scopeSummary: "Context scout verified repo/file refs for this commitment packet.",
    });
    handoff = buildContextHandoffPacket({
      sourceNodeId: input.node.nodeId,
      targetCommitmentIds: commitmentIds,
      commitmentWorkPacketRefs: input.commitmentWorkPackets.map((packet) => packet.packetRef),
      sourcePromptExcerptRefs: input.sourcePromptContextIndex?.sections
        .map((section) => section.sectionRef)
        .slice(0, 24),
      targetFileRefs: targetRefs,
      relevantFileRefs: verifiedFileRefs,
      symbolRefs: combinedSymbolRefs,
      testRefs: combinedTestRefs,
      codeIntelligenceResultRefs: codeIntelligence.resultRefs,
      codeIntelligenceSymbolRefs: codeIntelligence.symbolRefs,
      codeIntelligenceDiagnosticRefs: codeIntelligence.diagnosticRefs,
      codeIntelligenceRelatedTestRefs: codeIntelligence.relatedTestRefs,
      codeIntelligenceImpactRefs: codeIntelligence.impactRefs,
      codeIntelligenceSemanticModes: codeIntelligence.semanticModes,
      codeIntelligenceLimitations: codeIntelligence.limitations,
      recommendedEditPoints: effectiveOutput.recommendedEditPoints.map(
        (point) => `${point.path}:${point.symbolOrRegion} - ${point.reason}`,
      ),
      existingPatterns: effectiveOutput.existingPatterns,
      risks: effectiveOutput.risks,
      validationSuggestions: effectiveOutput.validationSuggestions,
      handoffSummaryForImplementation: effectiveOutput.handoffSummaryForImplementation,
      handoffSummaryForSynthesis,
      evidenceClaimRefs: contextVerifiedFileRefs.map((ref) => ref.evidenceRef),
      limitations: [...effectiveOutput.limitations, ...codeIntelligence.limitations],
      providedContextSnapshotRefs: [...sourcePromptSnapshotRefs, ...repoSnapshotRefs],
    });
    handoffRef = `runtime-job://${input.runtimeJob.jobId}/context-handoff/${handoff.packetId}`;
    await input.runtimeJobs.attachArtifact({
      jobId: input.runtimeJob.jobId,
      artifactType: "execution_platform.context_handoff_packet",
      storageKind: "metadata",
      uri: handoffRef,
      contentType: "application/json",
      metadata: handoff as unknown as JsonValue,
    });
    await invokeTool(
      "context_scout.emit_handoff_packet",
      `${input.node.nodeId}:boundary-emit-handoff`,
      handoff.handoffSummaryForImplementation,
      {
        contextHandoffPacketRef: handoffRef,
        targetCommitmentIds: handoff.targetCommitmentIds,
        relevantFileRefs: handoff.relevantFileRefs,
        codeIntelligenceResultRefs: handoff.codeIntelligenceResultRefs,
        codeIntelligenceSemanticModes: handoff.codeIntelligenceSemanticModes,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    );
    await invokeTool(
      "context.handoff",
      `${input.node.nodeId}:context-handoff`,
      handoff.handoffSummaryForSynthesis || handoff.handoffSummaryForImplementation,
      {
        contextHandoffPacketRef: handoffRef,
        commitmentWorkPacketRefs: handoff.commitmentWorkPacketRefs,
        targetCommitmentIds: handoff.targetCommitmentIds,
        relevantFileRefs: handoff.relevantFileRefs,
        symbolRefs: handoff.symbolRefs,
        testRefs: handoff.testRefs,
        codeIntelligenceResultRefs: handoff.codeIntelligenceResultRefs,
        codeIntelligenceDiagnosticRefs: handoff.codeIntelligenceDiagnosticRefs,
        codeIntelligenceRelatedTestRefs: handoff.codeIntelligenceRelatedTestRefs,
        codeIntelligenceImpactRefs: handoff.codeIntelligenceImpactRefs,
        handoffSummaryForSynthesis: handoff.handoffSummaryForSynthesis,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      },
    );
    await invokeTool(
      "context.evidence_claim",
      `${input.node.nodeId}:context-evidence-claim`,
      "Claim bounded context evidence for downstream synthesis and implementation.",
      {
        contextHandoffPacketRef: handoffRef,
        contextEvidenceRefs: handoff.evidenceClaimRefs,
        targetCommitmentIds: handoff.targetCommitmentIds,
        claimSummary: handoff.handoffSummaryForSynthesis || handoff.handoffSummaryForImplementation,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      },
    );
  }

  const toolLoopRun = buildContextScoutToolLoopRun({
    runtimeJobId: input.runtimeJob.jobId,
    graphId: input.graph.graphId,
    nodeId: input.node.nodeId,
    roleId: "context_scout",
    modelRef: input.modelId ?? "deepseek/deepseek-v4-pro",
    targetCommitmentIds: commitmentIds,
    commitmentWorkPacketRefs: input.commitmentWorkPackets.map((packet) => packet.packetRef),
    requestedContextQuestions: input.commitmentWorkPackets.flatMap(
      (packet) => packet.requiredContextQuestions,
    ),
    downstreamConsumer: "implementation_and_validation",
    sourcePromptHash: input.sourcePromptContextIndex?.promptHash ?? null,
    candidateFileRefs,
    expectedRepoAreaRefs: input.commitmentWorkPackets.flatMap((packet) => packet.likelyRepoAreas),
    verifiedFileRefs: contextVerifiedFileRefs,
    rejectedRefs: contextRejectedRefs,
    runtimeToolInvocationRefs,
    codeIntelligenceResultRefs: codeIntelligence.resultRefs,
    codeIntelligenceRuntimeToolInvocationRefs: codeIntelligence.invocationRefs,
    codeIntelligenceSymbolRefs: codeIntelligence.symbolRefs,
    codeIntelligenceDiagnosticRefs: codeIntelligence.diagnosticRefs,
    codeIntelligenceRelatedTestRefs: codeIntelligence.relatedTestRefs,
    codeIntelligenceImpactRefs: codeIntelligence.impactRefs,
    codeIntelligenceSemanticModes: codeIntelligence.semanticModes,
    codeIntelligenceLimitations: codeIntelligence.limitations,
    contextHandoffPacketRef: handoffRef,
    contextHandoffPacket: handoff,
    modelAuthoredSummary,
    limitations: [...effectiveOutput.limitations, ...codeIntelligence.limitations],
    repoAnalysisFindings: buildContextScoutRepoAnalysisFindings({
      runtimeJobId: input.runtimeJob.jobId,
      nodeId: input.node.nodeId,
      relevantFileRefs: verifiedFileRefs,
      symbolRefs,
      testRefs,
      codeIntelligenceResultRefs: codeIntelligence.resultRefs,
      codeIntelligenceSymbolRefs: codeIntelligence.symbolRefs,
      codeIntelligenceDiagnosticRefs: codeIntelligence.diagnosticRefs,
      codeIntelligenceRelatedTestRefs: codeIntelligence.relatedTestRefs,
      codeIntelligenceImpactRefs: codeIntelligence.impactRefs,
      codeIntelligenceSemanticModes: codeIntelligence.semanticModes,
      codeIntelligenceLimitations: codeIntelligence.limitations,
      existingPatterns: effectiveOutput.existingPatterns,
      risks: effectiveOutput.risks,
      recommendedEditPoints: effectiveOutput.recommendedEditPoints.map(
        (point) => `${point.path}:${point.symbolOrRegion} - ${point.reason}`,
      ),
      validationSuggestions: effectiveOutput.validationSuggestions,
      missingInformation: effectiveOutput.limitations,
    }),
    groundingReasonCodes: [
      ...(effectiveGroundedOutput?.reasonCodes ?? []),
      ...(shape.valid ? [] : shape.reasonCodes),
      ...(modelResult.status === "succeeded"
        ? []
        : [modelResult.errorReasonCode ?? "model_call_failed"]),
      ...repairReasonCodes,
    ],
  });
  await invokeTool(
    "context_scout.review_sufficiency",
    `${input.node.nodeId}:boundary-review-sufficiency`,
    toolLoopRun.sufficiencyReview.reviewerSummary,
    {
      status: toolLoopRun.sufficiencyReview.status,
      sufficientForImplementation: toolLoopRun.sufficiencyReview.sufficientForImplementation,
      missingInformation: toolLoopRun.sufficiencyReview.missingInformation,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
  );
  const toolLoopRef = `runtime-job://${input.runtimeJob.jobId}/context-scout/tool-loop/${toolLoopRun.loopId}`;
  await input.runtimeJobs.attachArtifact({
    jobId: input.runtimeJob.jobId,
    artifactType: "execution_platform.context_scout_tool_loop",
    storageKind: "metadata",
    uri: toolLoopRef,
    contentType: "application/json",
    metadata: summarizeContextScoutToolLoopRun({
      ...toolLoopRun,
      runtimeToolInvocationRefs: [...new Set(runtimeToolInvocationRefs)].slice(0, 80),
    }),
  });
  const validation = validateContextScoutToolLoopForImplementation(toolLoopRun);
  const artifactRefs = [toolLoopRef, ...(handoffRef ? [handoffRef] : [])];
  return {
    status: validation.valid ? "succeeded" : "needs_review",
    runtimeJobId: input.runtimeJob.jobId,
    graphId: input.graph.graphId,
    nodeId: input.node.nodeId,
    roleId: "context_scout",
    sourceRuntimeJobId: input.sourceRuntimeJobId ?? null,
    contextHandoffPacketRef: handoffRef,
    contextScoutToolLoopRef: toolLoopRef,
    contextScoutToolLoopRun: toolLoopRun,
    verifiedFileRefs,
    rejectedRefs: contextRejectedRefs.map((ref) => ref.ref),
    runtimeToolInvocationRefs: [...new Set(runtimeToolInvocationRefs)].slice(0, 80),
    codeIntelligenceResultRefs: codeIntelligence.resultRefs,
    codeIntelligenceRuntimeToolInvocationRefs: codeIntelligence.invocationRefs,
    codeIntelligenceSymbolRefs: codeIntelligence.symbolRefs,
    codeIntelligenceDiagnosticRefs: codeIntelligence.diagnosticRefs,
    codeIntelligenceRelatedTestRefs: codeIntelligence.relatedTestRefs,
    codeIntelligenceImpactRefs: codeIntelligence.impactRefs,
    codeIntelligenceSemanticModes: codeIntelligence.semanticModes,
    codeIntelligenceLimitations: codeIntelligence.limitations,
    codeIntelligenceBackendIds: codeIntelligence.backendIds,
    codeIntelligenceBackendHealthRefs: codeIntelligence.backendHealthRefs,
    codeIntelligenceWorkspaceSnapshotRefs: codeIntelligence.workspaceSnapshotRefs,
    codeIntelligenceFallbackReasonCodes: codeIntelligence.fallbackReasonCodes,
    codeIntelligenceDiagnosticVersionRefs: codeIntelligence.diagnosticVersionRefs,
    codeIntelligenceProjectConfigRefs: codeIntelligence.projectConfigRefs,
    codeIntelligenceBackendLatencyMs: codeIntelligence.backendLatencyMs,
    codeIntelligenceResultCounts: codeIntelligence.resultCounts,
    artifactRefs,
    reasonCodes: [
      validation.valid
        ? "context_scout_boundary_replay_succeeded"
        : "context_scout_boundary_replay_needs_review",
      ...validation.reasonCodes,
      ...(effectiveGroundedOutput?.reasonCodes ?? []),
      ...repairReasonCodes,
    ].slice(0, 40),
    implementationBlocked: !validation.valid,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    workQueueLifecycleMutated: false,
  };
}
