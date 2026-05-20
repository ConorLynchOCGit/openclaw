import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export type RuntimeSourcePromptRef = {
  refKind: "gateway_chat_transcript" | "native_submit";
  promptHash: string;
  promptLength: number;
  sessionKey: string | null;
  sessionId: string | null;
  runId: string | null;
  sourceRoute: string | null;
  rawPromptStored: false;
};

export type SourcePromptResolutionEvidence = {
  status: "not_present" | "resolved" | "unresolved" | "unsupported";
  reasonCodes: string[];
  promptHash: string | null;
  promptLength: number | null;
  sessionId: string | null;
  sessionKey: string | null;
  runId: string | null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type RuntimeObjectiveResolution = {
  objectiveForModel: string;
  objectiveForEvidence: string;
  taskSpecificObjectivePresent: boolean;
  sourcePromptResolution: SourcePromptResolutionEvidence;
};

export type ResolveRuntimeObjectiveOptions = {
  sessionSearchRoots?: string[];
  maxPromptChars?: number;
};

const DEFAULT_SESSION_SEARCH_ROOTS = [
  "/root/.openclaw/agents/main/sessions",
  "/home/node/.openclaw/agents/main/sessions",
  "/app/.openclaw/agents/main/sessions",
];

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function boundedEvidenceObjective(value: string): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, 600);
}

export function readRuntimeSourcePromptRef(value: unknown): RuntimeSourcePromptRef | null {
  const record = asRecord(value);
  const refKind = optionalString(record.refKind);
  const promptHash = optionalString(record.promptHash);
  const promptLength = optionalNumber(record.promptLength);
  if (
    (refKind !== "gateway_chat_transcript" && refKind !== "native_submit") ||
    !promptHash ||
    promptLength === null ||
    record.rawPromptStored !== false
  ) {
    return null;
  }
  return {
    refKind,
    promptHash,
    promptLength,
    sessionKey: optionalString(record.sessionKey),
    sessionId: optionalString(record.sessionId),
    runId: optionalString(record.runId),
    sourceRoute: optionalString(record.sourceRoute),
    rawPromptStored: false,
  };
}

function sourcePromptResolutionEvidence(
  input: Partial<SourcePromptResolutionEvidence> & {
    status: SourcePromptResolutionEvidence["status"];
    reasonCodes: string[];
  },
): SourcePromptResolutionEvidence {
  return {
    status: input.status,
    reasonCodes: input.reasonCodes,
    promptHash: input.promptHash ?? null,
    promptLength: input.promptLength ?? null,
    sessionId: input.sessionId ?? null,
    sessionKey: input.sessionKey ?? null,
    runId: input.runId ?? null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function candidateSessionFiles(
  ref: RuntimeSourcePromptRef,
  roots: string[],
): Promise<string[]> {
  const candidates = new Set<string>();
  for (const root of roots) {
    if (/\.(jsonl|json|txt|md)$/iu.test(root)) {
      candidates.add(root);
      continue;
    }
    if (ref.sessionId) {
      candidates.add(path.join(root, `${ref.sessionId}.jsonl`));
    }
    if (ref.runId) {
      candidates.add(path.join(root, `${ref.runId}.jsonl`));
      candidates.add(path.join(root, `${ref.runId}.json`));
      candidates.add(path.join(root, `${ref.runId}.prompt.txt`));
    }
  }
  const existing: string[] = [];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      existing.push(candidate);
    }
  }
  return existing;
}

function textFromNativeSubmitFile(text: string): string | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    const record = asRecord(parsed);
    for (const key of ["prompt", "ownerPrompt", "objective", "fullPrompt", "taskPrompt"]) {
      const value = optionalString(record[key]);
      if (value) {
        return value;
      }
    }
  } catch {
    // Plain prompt files are expected for native submit lane proofs.
  }
  return text.trim() ? text : null;
}

function textFromTranscriptEntry(line: string): string | null {
  try {
    const entry = JSON.parse(line) as unknown;
    const record = asRecord(entry);
    if (record.type !== "message") {
      return null;
    }
    const message = asRecord(record.message);
    if (message.role !== "user") {
      return null;
    }
    const content = message.content;
    if (typeof content === "string") {
      return content;
    }
    if (!Array.isArray(content)) {
      return null;
    }
    const text = content
      .map((item) => {
        const part = asRecord(item);
        return part.type === "text" && typeof part.text === "string" ? part.text : "";
      })
      .filter((part) => part.length > 0)
      .join("\n");
    return text.trim() ? text : null;
  } catch {
    return null;
  }
}

export async function resolveSourcePromptText(
  ref: RuntimeSourcePromptRef,
  options: ResolveRuntimeObjectiveOptions = {},
): Promise<{ promptText: string | null; evidence: SourcePromptResolutionEvidence }> {
  const maxPromptChars = options.maxPromptChars ?? 240_000;
  if (ref.promptLength > maxPromptChars) {
    return {
      promptText: null,
      evidence: sourcePromptResolutionEvidence({
        status: "unresolved",
        reasonCodes: ["source_prompt_ref_exceeds_volatile_resolution_budget"],
        promptHash: ref.promptHash,
        promptLength: ref.promptLength,
        sessionId: ref.sessionId,
        sessionKey: ref.sessionKey,
        runId: ref.runId,
      }),
    };
  }
  const files = await candidateSessionFiles(
    ref,
    options.sessionSearchRoots ?? DEFAULT_SESSION_SEARCH_ROOTS,
  );
  if (files.length === 0) {
    return {
      promptText: null,
      evidence: sourcePromptResolutionEvidence({
        status: "unresolved",
        reasonCodes: ["source_prompt_session_file_not_found"],
        promptHash: ref.promptHash,
        promptLength: ref.promptLength,
        sessionId: ref.sessionId,
        sessionKey: ref.sessionKey,
        runId: ref.runId,
      }),
    };
  }
  for (const file of files) {
    const text = await fs.readFile(file, "utf8");
    if (ref.refKind === "native_submit") {
      const promptText = textFromNativeSubmitFile(text);
      if (
        promptText &&
        promptText.length === ref.promptLength &&
        sha256Text(promptText) === ref.promptHash
      ) {
        return {
          promptText,
          evidence: sourcePromptResolutionEvidence({
            status: "resolved",
            reasonCodes: ["source_prompt_ref_resolved_from_native_submit_file"],
            promptHash: ref.promptHash,
            promptLength: ref.promptLength,
            sessionId: ref.sessionId,
            sessionKey: ref.sessionKey,
            runId: ref.runId,
          }),
        };
      }
      continue;
    }
    for (const line of text.split(/\r?\n/u)) {
      if (!line.trim()) {
        continue;
      }
      const promptText = textFromTranscriptEntry(line);
      if (
        promptText &&
        promptText.length === ref.promptLength &&
        sha256Text(promptText) === ref.promptHash
      ) {
        return {
          promptText,
          evidence: sourcePromptResolutionEvidence({
            status: "resolved",
            reasonCodes: ["source_prompt_ref_resolved_from_transcript"],
            promptHash: ref.promptHash,
            promptLength: ref.promptLength,
            sessionId: ref.sessionId,
            sessionKey: ref.sessionKey,
            runId: ref.runId,
          }),
        };
      }
    }
  }
  return {
    promptText: null,
    evidence: sourcePromptResolutionEvidence({
      status: "unresolved",
      reasonCodes: ["source_prompt_hash_or_length_not_found"],
      promptHash: ref.promptHash,
      promptLength: ref.promptLength,
      sessionId: ref.sessionId,
      sessionKey: ref.sessionKey,
      runId: ref.runId,
    }),
  };
}

export async function resolveRuntimeObjective(
  payload: unknown,
  options: ResolveRuntimeObjectiveOptions = {},
): Promise<RuntimeObjectiveResolution> {
  const record = asRecord(payload);
  const boundedObjective =
    optionalString(record.objective) ??
    optionalString(record.objectiveSummary) ??
    optionalString(record.promptSummary) ??
    "task-specific-objective-missing";
  const ref = readRuntimeSourcePromptRef(record.sourcePromptRef);
  if (!ref) {
    return {
      objectiveForModel: boundedObjective,
      objectiveForEvidence: boundedObjective,
      taskSpecificObjectivePresent: boundedObjective !== "task-specific-objective-missing",
      sourcePromptResolution: sourcePromptResolutionEvidence({
        status: "not_present",
        reasonCodes: ["source_prompt_ref_not_present"],
      }),
    };
  }
  const resolved = await resolveSourcePromptText(ref, options);
  if (!resolved.promptText) {
    return {
      objectiveForModel: boundedObjective,
      objectiveForEvidence: boundedObjective,
      taskSpecificObjectivePresent: boundedObjective !== "task-specific-objective-missing",
      sourcePromptResolution: resolved.evidence,
    };
  }
  return {
    objectiveForModel: resolved.promptText,
    objectiveForEvidence:
      optionalString(record.objectiveSummary) ??
      optionalString(record.promptSummary) ??
      boundedEvidenceObjective(resolved.promptText),
    taskSpecificObjectivePresent: true,
    sourcePromptResolution: resolved.evidence,
  };
}
