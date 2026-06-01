import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const GATEWAY_SUBMIT_DIAGNOSTICS_SCHEMA_VERSION =
  "execution-platform.gateway-submit-diagnostics.v1" as const;

export const GATEWAY_SUBMIT_DIAGNOSTICS_MANIFEST_MAX_BYTES = 16 * 1024;

export type GatewaySubmitDiagnosticsPhase = {
  artifactKind: "execution.front_door.submit_heap_diagnostic";
  phase: string;
  phaseSequence: number;
  elapsedMs: number;
  heapUsedBytes: number;
  heapTotalBytes: number;
  rssBytes: number;
  externalBytes: number;
  arrayBuffersBytes: number;
  heapUsedDeltaBytes: number | null;
  rssDeltaBytes: number | null;
  externalDeltaBytes: number | null;
  arrayBuffersDeltaBytes: number | null;
  promptHash: string;
  promptLength: number;
  promptByteLength: number;
  promptSummaryBytes: number;
  workflowSummaryCount: number | null;
  workflowSummaryBytes: number | null;
  conversationContextBytes: number | null;
  routerPayloadBytes: number | null;
  candidateCount: number | null;
  selectedModelRef: string | null;
  providerRef: string | null;
  errorName: string | null;
  errorCode: string | null;
  errorSummary: string | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
  hiddenReasoningStored: false;
};

export type GatewaySubmitDiagnosticsManifest = {
  artifactKind: "execution.front_door.submit_diagnostics_manifest";
  schemaVersion: typeof GATEWAY_SUBMIT_DIAGNOSTICS_SCHEMA_VERSION;
  submitId: string;
  runtimeJobId: string | null;
  status: "accepted" | "rejected" | "failed";
  promptHash: string;
  promptLength: number;
  promptByteLength: number;
  promptSummaryBytes: number;
  phaseCount: number;
  phaseSnapshotRefs: string[];
  bodyArtifactRef: string | null;
  manifestArtifactRef: string | null;
  bodySha256: string;
  bodyByteCount: number;
  manifestJsonByteCount: number;
  maxHeapUsedBytes: number;
  maxRssBytes: number;
  maxExternalBytes: number;
  maxArrayBuffersBytes: number;
  largestHeapDeltaBytes: number | null;
  largestHeapDeltaPhase: string | null;
  largestRssDeltaBytes: number | null;
  largestRssDeltaPhase: string | null;
  maxWorkflowSummaryBytes: number | null;
  maxConversationContextBytes: number | null;
  maxRouterPayloadBytes: number | null;
  maxCandidateCount: number | null;
  selectedModelRefs: string[];
  providerRefs: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
  hiddenReasoningStored: false;
};

export type GatewaySubmitDiagnosticsBody = {
  artifactKind: "execution.front_door.submit_diagnostics_body";
  schemaVersion: typeof GATEWAY_SUBMIT_DIAGNOSTICS_SCHEMA_VERSION;
  submitId: string;
  runtimeJobId: string | null;
  status: "accepted" | "rejected" | "failed";
  phases: GatewaySubmitDiagnosticsPhase[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
  hiddenReasoningStored: false;
};

export type GatewaySubmitDiagnosticsBundle = {
  artifactKind: "execution.front_door.submit_diagnostics_bundle";
  manifest: GatewaySubmitDiagnosticsManifest;
  body: GatewaySubmitDiagnosticsBody;
};

export type GatewaySubmitDiagnosticsSink = {
  writePhase(input: {
    submitId: string;
    phase: GatewaySubmitDiagnosticsPhase;
  }): Promise<{ artifactRef: string | null }>;
  writeBundle(input: {
    submitId: string;
    body: GatewaySubmitDiagnosticsBody;
    manifest: GatewaySubmitDiagnosticsManifest;
  }): Promise<{
    bodyArtifactRef: string | null;
    manifestArtifactRef: string | null;
    phaseSnapshotRefs?: string[];
  }>;
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function jsonBody(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function jsonBytes(value: unknown): number {
  return Buffer.byteLength(jsonBody(value), "utf8");
}

function boundedString(value: unknown, maxLength: number): string | null {
  return typeof value === "string" && value.trim()
    ? value.replace(/\s+/gu, " ").trim().slice(0, maxLength)
    : null;
}

function boundedStringArray(values: string[], maxItems: number, maxLength: number): string[] {
  return [
    ...new Set(
      values
        .map((value) => boundedString(value, maxLength))
        .filter((value): value is string => Boolean(value)),
    ),
  ].slice(0, maxItems);
}

function maxNumber(values: Array<number | null>): number | null {
  const numbers = values.filter((value): value is number => typeof value === "number");
  return numbers.length > 0 ? Math.max(...numbers) : null;
}

function withStableManifestByteCount(
  manifest: GatewaySubmitDiagnosticsManifest,
): GatewaySubmitDiagnosticsManifest {
  let normalized = { ...manifest, manifestJsonByteCount: 0 };
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const manifestJsonByteCount = jsonBytes(normalized);
    if (normalized.manifestJsonByteCount === manifestJsonByteCount) {
      return normalized;
    }
    normalized = { ...normalized, manifestJsonByteCount };
  }
  return normalized;
}

function largestDelta(input: {
  phases: GatewaySubmitDiagnosticsPhase[];
  field: "heapUsedDeltaBytes" | "rssDeltaBytes";
}): { bytes: number | null; phase: string | null } {
  const candidates = input.phases
    .map((phase) => ({ phase: phase.phase, bytes: phase[input.field] }))
    .filter((entry): entry is { phase: string; bytes: number } => typeof entry.bytes === "number")
    .sort((left, right) => right.bytes - left.bytes);
  const top = candidates[0];
  return top ? { bytes: top.bytes, phase: top.phase } : { bytes: null, phase: null };
}

export class GatewaySubmitDiagnosticsCollector {
  readonly submitId: string;
  readonly promptHash: string;
  readonly promptLength: number;
  readonly promptByteLength: number;
  readonly promptSummary: string;
  readonly promptSummaryBytes: number;
  readonly startedAt: number;
  readonly phases: GatewaySubmitDiagnosticsPhase[] = [];

  private readonly phaseSnapshotRefs: string[] = [];

  constructor(
    input: {
      submitId: string;
      promptHash: string;
      promptLength: number;
      promptByteLength: number;
      promptSummary: string;
      startedAt?: number;
    },
    private readonly sink: GatewaySubmitDiagnosticsSink | null = null,
  ) {
    this.submitId = input.submitId;
    this.promptHash = input.promptHash;
    this.promptLength = input.promptLength;
    this.promptByteLength = input.promptByteLength;
    this.promptSummary = input.promptSummary;
    this.promptSummaryBytes = Buffer.byteLength(input.promptSummary, "utf8");
    this.startedAt = input.startedAt ?? Date.now();
  }

  async record(
    phase: string,
    extra: {
      workflowSummaryCount?: number | null;
      workflowSummaryBytes?: number | null;
      conversationContextBytes?: number | null;
      routerPayloadBytes?: number | null;
      candidateCount?: number | null;
      selectedModelRef?: string | null;
      providerRef?: string | null;
      errorName?: string | null;
      errorCode?: string | null;
      errorSummary?: string | null;
      reasonCodes?: string[];
    } = {},
  ): Promise<GatewaySubmitDiagnosticsPhase> {
    const memory = process.memoryUsage();
    const previous = this.phases.at(-1);
    const snapshot: GatewaySubmitDiagnosticsPhase = {
      artifactKind: "execution.front_door.submit_heap_diagnostic",
      phase,
      phaseSequence: this.phases.length + 1,
      elapsedMs: Math.max(0, Date.now() - this.startedAt),
      heapUsedBytes: memory.heapUsed,
      heapTotalBytes: memory.heapTotal,
      rssBytes: memory.rss,
      externalBytes: memory.external,
      arrayBuffersBytes: memory.arrayBuffers,
      heapUsedDeltaBytes: previous ? memory.heapUsed - previous.heapUsedBytes : null,
      rssDeltaBytes: previous ? memory.rss - previous.rssBytes : null,
      externalDeltaBytes: previous ? memory.external - previous.externalBytes : null,
      arrayBuffersDeltaBytes: previous ? memory.arrayBuffers - previous.arrayBuffersBytes : null,
      promptHash: this.promptHash,
      promptLength: this.promptLength,
      promptByteLength: this.promptByteLength,
      promptSummaryBytes: this.promptSummaryBytes,
      workflowSummaryCount: extra.workflowSummaryCount ?? null,
      workflowSummaryBytes: extra.workflowSummaryBytes ?? null,
      conversationContextBytes: extra.conversationContextBytes ?? null,
      routerPayloadBytes: extra.routerPayloadBytes ?? null,
      candidateCount: extra.candidateCount ?? null,
      selectedModelRef: extra.selectedModelRef ?? null,
      providerRef: extra.providerRef ?? null,
      errorName: boundedString(extra.errorName, 120),
      errorCode: boundedString(extra.errorCode, 120),
      errorSummary: boundedString(extra.errorSummary, 600),
      reasonCodes: boundedStringArray(extra.reasonCodes ?? [], 30, 160),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
      hiddenReasoningStored: false,
    };
    this.phases.push(snapshot);
    if (this.sink) {
      const stored = await this.sink.writePhase({ submitId: this.submitId, phase: snapshot });
      if (stored.artifactRef) {
        this.phaseSnapshotRefs.push(stored.artifactRef);
      }
    }
    return snapshot;
  }

  async finalize(input: {
    status: "accepted" | "rejected" | "failed";
    runtimeJobId?: string | null;
    reasonCodes?: string[];
  }): Promise<GatewaySubmitDiagnosticsBundle> {
    const body: GatewaySubmitDiagnosticsBody = {
      artifactKind: "execution.front_door.submit_diagnostics_body",
      schemaVersion: GATEWAY_SUBMIT_DIAGNOSTICS_SCHEMA_VERSION,
      submitId: this.submitId,
      runtimeJobId: input.runtimeJobId ?? null,
      status: input.status,
      phases: this.phases,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
      hiddenReasoningStored: false,
    };
    const bodyText = jsonBody(body);
    const heapDelta = largestDelta({ phases: this.phases, field: "heapUsedDeltaBytes" });
    const rssDelta = largestDelta({ phases: this.phases, field: "rssDeltaBytes" });
    let manifest: GatewaySubmitDiagnosticsManifest = {
      artifactKind: "execution.front_door.submit_diagnostics_manifest",
      schemaVersion: GATEWAY_SUBMIT_DIAGNOSTICS_SCHEMA_VERSION,
      submitId: this.submitId,
      runtimeJobId: input.runtimeJobId ?? null,
      status: input.status,
      promptHash: this.promptHash,
      promptLength: this.promptLength,
      promptByteLength: this.promptByteLength,
      promptSummaryBytes: this.promptSummaryBytes,
      phaseCount: this.phases.length,
      phaseSnapshotRefs: this.phaseSnapshotRefs.slice(-40),
      bodyArtifactRef: null,
      manifestArtifactRef: null,
      bodySha256: `sha256:${sha256(bodyText)}`,
      bodyByteCount: Buffer.byteLength(bodyText, "utf8"),
      manifestJsonByteCount: 0,
      maxHeapUsedBytes: Math.max(...this.phases.map((phase) => phase.heapUsedBytes)),
      maxRssBytes: Math.max(...this.phases.map((phase) => phase.rssBytes)),
      maxExternalBytes: Math.max(...this.phases.map((phase) => phase.externalBytes)),
      maxArrayBuffersBytes: Math.max(...this.phases.map((phase) => phase.arrayBuffersBytes)),
      largestHeapDeltaBytes: heapDelta.bytes,
      largestHeapDeltaPhase: heapDelta.phase,
      largestRssDeltaBytes: rssDelta.bytes,
      largestRssDeltaPhase: rssDelta.phase,
      maxWorkflowSummaryBytes: maxNumber(this.phases.map((phase) => phase.workflowSummaryBytes)),
      maxConversationContextBytes: maxNumber(
        this.phases.map((phase) => phase.conversationContextBytes),
      ),
      maxRouterPayloadBytes: maxNumber(this.phases.map((phase) => phase.routerPayloadBytes)),
      maxCandidateCount: maxNumber(this.phases.map((phase) => phase.candidateCount)),
      selectedModelRefs: boundedStringArray(
        this.phases.flatMap((phase) => (phase.selectedModelRef ? [phase.selectedModelRef] : [])),
        12,
        180,
      ),
      providerRefs: boundedStringArray(
        this.phases.flatMap((phase) => (phase.providerRef ? [phase.providerRef] : [])),
        12,
        180,
      ),
      reasonCodes: boundedStringArray(
        [...(input.reasonCodes ?? []), ...this.phases.flatMap((phase) => phase.reasonCodes)],
        80,
        180,
      ),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
      hiddenReasoningStored: false,
    };
    manifest = withStableManifestByteCount(manifest);
    assertGatewaySubmitDiagnosticsManifestBounds(manifest);
    if (this.sink) {
      const stored = await this.sink.writeBundle({ submitId: this.submitId, body, manifest });
      manifest = {
        ...manifest,
        bodyArtifactRef: stored.bodyArtifactRef,
        manifestArtifactRef: stored.manifestArtifactRef,
        phaseSnapshotRefs: (stored.phaseSnapshotRefs ?? manifest.phaseSnapshotRefs).slice(-40),
      };
      manifest = withStableManifestByteCount(manifest);
      assertGatewaySubmitDiagnosticsManifestBounds(manifest);
    }
    return {
      artifactKind: "execution.front_door.submit_diagnostics_bundle",
      manifest,
      body,
    };
  }
}

export function assertGatewaySubmitDiagnosticsManifestBounds(
  manifest: GatewaySubmitDiagnosticsManifest,
  maxBytes = GATEWAY_SUBMIT_DIAGNOSTICS_MANIFEST_MAX_BYTES,
): void {
  const reasonCodes = [
    manifest.manifestJsonByteCount <= maxBytes ? null : "gateway_submit_manifest_overflow",
    manifest.rawPromptStored === false ? null : "raw_prompt_flag_invalid",
    manifest.rawResponseStored === false ? null : "raw_response_flag_invalid",
    manifest.rawProviderLogStored === false ? null : "raw_provider_log_flag_invalid",
    manifest.rawToolLogStored === false ? null : "raw_tool_log_flag_invalid",
    manifest.rawCommandLogStored === false ? null : "raw_command_log_flag_invalid",
    manifest.rawDbRowsStored === false ? null : "raw_db_rows_flag_invalid",
    manifest.secretsStored === false ? null : "secrets_flag_invalid",
    manifest.hiddenReasoningStored === false ? null : "hidden_reasoning_flag_invalid",
  ].filter((reason): reason is string => Boolean(reason));
  if (reasonCodes.length > 0) {
    throw new Error(`gateway_submit_diagnostics_manifest_invalid:${reasonCodes.join(",")}`);
  }
}

function safeFileSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/gu, "-").slice(0, 160);
}

export function createFileGatewaySubmitDiagnosticsSink(input: {
  rootDir: string;
  relativeArtifactRoot?: string;
}): GatewaySubmitDiagnosticsSink {
  const relativeRoot =
    input.relativeArtifactRoot ?? ".artifacts/execution-platform/gateway-submit-diagnostics";
  const absoluteRoot = path.join(input.rootDir, relativeRoot);
  async function writeRelative(relativePath: string, value: unknown): Promise<string> {
    const absolutePath = path.join(input.rootDir, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, jsonBody(value), "utf8");
    return relativePath;
  }
  return {
    async writePhase({ submitId, phase }) {
      const file = path.join(
        relativeRoot,
        safeFileSegment(submitId),
        "phases",
        `${String(phase.phaseSequence).padStart(3, "0")}-${safeFileSegment(phase.phase)}.json`,
      );
      await writeRelative(file, phase);
      return { artifactRef: file };
    },
    async writeBundle({ submitId, body, manifest }) {
      await fs.mkdir(path.join(absoluteRoot, safeFileSegment(submitId)), { recursive: true });
      const bodyRef = path.join(relativeRoot, safeFileSegment(submitId), "body.json");
      const manifestRef = path.join(relativeRoot, safeFileSegment(submitId), "manifest.json");
      const phaseSnapshotRefs = body.phases.map((phase) =>
        path.join(
          relativeRoot,
          safeFileSegment(submitId),
          "phases",
          `${String(phase.phaseSequence).padStart(3, "0")}-${safeFileSegment(phase.phase)}.json`,
        ),
      );
      await writeRelative(bodyRef, body);
      const storedManifest = withStableManifestByteCount({
        ...manifest,
        bodyArtifactRef: bodyRef,
        manifestArtifactRef: manifestRef,
        phaseSnapshotRefs,
      });
      assertGatewaySubmitDiagnosticsManifestBounds(storedManifest);
      await writeRelative(manifestRef, storedManifest);
      return {
        bodyArtifactRef: bodyRef,
        manifestArtifactRef: manifestRef,
        phaseSnapshotRefs,
      };
    },
  };
}
