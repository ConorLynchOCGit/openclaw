import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { sha256JsonValue } from "../hashing.ts";

export const WORK_EPISODE_OUTCOME_PACK_SCHEMA_VERSION = "work_episode_outcome_pack.v1" as const;

export type WorkEpisodeOutcomePackRuntime = "codex" | "openclaw" | "mixed";
export type WorkEpisodeOutcomePackTestStatus = "passed" | "failed" | "skipped" | "unknown";
export type WorkEpisodeOutcomePackChangeKind = "created" | "modified" | "deleted" | "unknown";
export type WorkEpisodeOutcomePackFailureStatus = "fixed" | "unresolved" | "deferred";
export type WorkEpisodeOutcomePackOutcomeStatus =
  | "completed"
  | "failed"
  | "interrupted"
  | "partial";
export type WorkEpisodeOutcomePackWorkType =
  | "implementation"
  | "validation"
  | "proof"
  | "diagnostic"
  | "planning"
  | "meta_infrastructure"
  | "other";

export type WorkEpisodeOutcomePack = {
  schemaVersion: typeof WORK_EPISODE_OUTCOME_PACK_SCHEMA_VERSION;
  episodeId: string;
  runtime: WorkEpisodeOutcomePackRuntime;
  projectId: string;
  sessionKey?: string;
  branch?: string;
  startedAt?: string;
  completedAt: string;
  outcomeStatus: WorkEpisodeOutcomePackOutcomeStatus;
  workType?: WorkEpisodeOutcomePackWorkType;
  primarySystemArea?: string;
  completedObjective?: string;
  recoveryRecommendation?: string;
  userGoal: string;
  workSummary: string;
  finalOutcome: string;
  filesTouched: Array<{
    path: string;
    changeKind?: WorkEpisodeOutcomePackChangeKind;
    summary?: string;
  }>;
  testsRun: Array<{
    command: string;
    status: WorkEpisodeOutcomePackTestStatus;
    summary: string;
  }>;
  failuresAndFixes: Array<{
    failure: string;
    fix?: string;
    status: WorkEpisodeOutcomePackFailureStatus;
  }>;
  unresolvedQuestions: string[];
  followUpCandidates: Array<{
    title: string;
    rationale: string;
    sourceRefs: string[];
  }>;
  skillImprovementEvidence: Array<{
    workflowName?: string;
    evidence: string;
    suggestedDirection?: string;
    sourceRefs: string[];
  }>;
  sourceRefs: string[];
  contentHashes: string[];
  safety: {
    noRawLogs: true;
    noRawTranscripts: true;
    noProviderPrompts: true;
    noHiddenReasoning: true;
    noSecrets: true;
  };
};

export type WorkEpisodeOutcomePackArtifact = {
  artifactRoot: string;
  jsonPath: string;
  markdownPath: string;
  packHash: string;
  promptPersisted: false;
  rawResponsePersisted: false;
  rawFullTranscriptPersisted: false;
};

export type WorkEpisodeOutcomePackEligibilityStatus = "eligible" | "ineligible" | "unsafe";

export type WorkEpisodeOutcomePackEligibilityReport = {
  status: WorkEpisodeOutcomePackEligibilityStatus;
  reasonCodes: string[];
  evidenceBearingFieldCount: number;
  reviewEligible: boolean;
};

export type WorkEpisodeOutcomePackDiscoveryRecord = {
  pack: WorkEpisodeOutcomePack;
  packPath: string;
  contentHash: string;
  eligibility: WorkEpisodeOutcomePackEligibilityReport;
};

const MAX_TEXT = 1_200;
const MAX_LONG_TEXT = 2_400;
const MAX_COMMAND_TEXT = 500;
const MAX_PATH_TEXT = 220;
const MAX_REFS = 24;
const MAX_HASHES = 24;
const MAX_ITEMS = 24;

const PROHIBITED_PATTERNS = [
  /raw-prompt-marker/iu,
  /raw-transcript-marker/iu,
  /raw-tool-log-marker/iu,
  /secret-marker/iu,
  /private-phrase-marker/iu,
  /\bsk-[a-z0-9_-]{12,}/iu,
  /\bhidden reasoning\b/iu,
  /\bprovider prompt\b/iu,
  /\braw full transcript\b/iu,
  /\braw command log\b/iu,
  /\braw tool log\b/iu,
] as const;

const WorkEpisodeOutcomePackSchema: z.ZodType<WorkEpisodeOutcomePack> = z
  .object({
    schemaVersion: z.literal(WORK_EPISODE_OUTCOME_PACK_SCHEMA_VERSION),
    episodeId: z.string().trim().min(4).max(160),
    runtime: z.enum(["codex", "openclaw", "mixed"]),
    projectId: z.string().trim().min(1).max(120),
    sessionKey: z.string().trim().min(1).max(180).optional(),
    branch: z.string().trim().min(1).max(180).optional(),
    startedAt: z.string().trim().min(1).max(80).optional(),
    completedAt: z.string().trim().min(1).max(80),
    outcomeStatus: z.enum(["completed", "failed", "interrupted", "partial"]),
    workType: z
      .enum([
        "implementation",
        "validation",
        "proof",
        "diagnostic",
        "planning",
        "meta_infrastructure",
        "other",
      ])
      .optional(),
    primarySystemArea: z.string().trim().min(1).max(180).optional(),
    completedObjective: z.string().trim().min(1).max(MAX_TEXT).optional(),
    recoveryRecommendation: z.string().trim().min(1).max(MAX_TEXT).optional(),
    userGoal: z.string().trim().min(8).max(MAX_LONG_TEXT),
    workSummary: z.string().trim().min(8).max(MAX_LONG_TEXT),
    finalOutcome: z.string().trim().min(8).max(MAX_LONG_TEXT),
    filesTouched: z
      .array(
        z
          .object({
            path: z.string().trim().min(1).max(MAX_PATH_TEXT),
            changeKind: z.enum(["created", "modified", "deleted", "unknown"]).optional(),
            summary: z.string().trim().min(1).max(MAX_TEXT).optional(),
          })
          .strict(),
      )
      .max(MAX_ITEMS),
    testsRun: z
      .array(
        z
          .object({
            command: z.string().trim().min(1).max(MAX_COMMAND_TEXT),
            status: z.enum(["passed", "failed", "skipped", "unknown"]),
            summary: z.string().trim().min(1).max(MAX_TEXT),
          })
          .strict(),
      )
      .max(MAX_ITEMS),
    failuresAndFixes: z
      .array(
        z
          .object({
            failure: z.string().trim().min(1).max(MAX_TEXT),
            fix: z.string().trim().min(1).max(MAX_TEXT).optional(),
            status: z.enum(["fixed", "unresolved", "deferred"]),
          })
          .strict(),
      )
      .max(MAX_ITEMS),
    unresolvedQuestions: z.array(z.string().trim().min(1).max(MAX_TEXT)).max(MAX_ITEMS),
    followUpCandidates: z
      .array(
        z
          .object({
            title: z.string().trim().min(4).max(180),
            rationale: z.string().trim().min(8).max(MAX_TEXT),
            sourceRefs: z.array(z.string().trim().min(1).max(220)).min(1).max(8),
          })
          .strict(),
      )
      .max(MAX_ITEMS),
    skillImprovementEvidence: z
      .array(
        z
          .object({
            workflowName: z.string().trim().min(1).max(160).optional(),
            evidence: z.string().trim().min(8).max(MAX_TEXT),
            suggestedDirection: z.string().trim().min(1).max(MAX_TEXT).optional(),
            sourceRefs: z.array(z.string().trim().min(1).max(220)).min(1).max(8),
          })
          .strict(),
      )
      .max(MAX_ITEMS),
    sourceRefs: z.array(z.string().trim().min(1).max(220)).min(1).max(MAX_REFS),
    contentHashes: z.array(z.string().trim().min(8).max(160)).min(1).max(MAX_HASHES),
    safety: z
      .object({
        noRawLogs: z.literal(true),
        noRawTranscripts: z.literal(true),
        noProviderPrompts: z.literal(true),
        noHiddenReasoning: z.literal(true),
        noSecrets: z.literal(true),
      })
      .strict(),
  })
  .strict();

function compact(value: string | null | undefined, maxLength: number): string | undefined {
  const normalized = value
    ?.replace(/\r\n/gu, "\n")
    .replace(/[ \t]+/gu, " ")
    .trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}.`;
}

function compactRequired(value: string | undefined, fallback: string, maxLength: number): string {
  return compact(value, maxLength) ?? fallback;
}

function unique(values: Array<string | undefined | null>, maxItems: number): string[] {
  return [...new Set(values.map((value) => compact(value, 220)).filter(Boolean) as string[])].slice(
    0,
    maxItems,
  );
}

function assertNoProhibitedContent(value: unknown, label: string): void {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const pattern of PROHIBITED_PATTERNS) {
    if (pattern.test(serialized)) {
      throw new Error(`${label} contains prohibited raw/private content`);
    }
  }
}

export function sanitizeWorkEpisodeOutcomePack(
  pack: WorkEpisodeOutcomePack,
): WorkEpisodeOutcomePack {
  const sourceRefs = unique(pack.sourceRefs, MAX_REFS);
  const contentHashes = unique(pack.contentHashes, MAX_HASHES);
  const sanitized: WorkEpisodeOutcomePack = {
    schemaVersion: WORK_EPISODE_OUTCOME_PACK_SCHEMA_VERSION,
    episodeId: compactRequired(pack.episodeId, "work-episode", 160),
    runtime: pack.runtime,
    projectId: compactRequired(pack.projectId, "openclaw", 120),
    sessionKey: compact(pack.sessionKey, 180),
    branch: compact(pack.branch, 180),
    startedAt: compact(pack.startedAt, 80),
    completedAt: compactRequired(pack.completedAt, new Date().toISOString(), 80),
    outcomeStatus: pack.outcomeStatus ?? "completed",
    workType: pack.workType,
    primarySystemArea: compact(pack.primarySystemArea, 180),
    completedObjective: compact(pack.completedObjective, MAX_TEXT),
    recoveryRecommendation: compact(pack.recoveryRecommendation, MAX_TEXT),
    userGoal: compactRequired(pack.userGoal, "Review the completed work episode.", MAX_LONG_TEXT),
    workSummary: compactRequired(
      pack.workSummary,
      "A bounded work episode completed.",
      MAX_LONG_TEXT,
    ),
    finalOutcome: compactRequired(
      pack.finalOutcome,
      "The episode produced a bounded outcome.",
      MAX_LONG_TEXT,
    ),
    filesTouched: pack.filesTouched.slice(0, MAX_ITEMS).map((file) => ({
      path: compactRequired(file.path, "unknown", MAX_PATH_TEXT),
      changeKind: file.changeKind ?? "unknown",
      summary: compact(file.summary, MAX_TEXT),
    })),
    testsRun: pack.testsRun.slice(0, MAX_ITEMS).map((test) => ({
      command: compactRequired(test.command, "unknown", MAX_COMMAND_TEXT),
      status: test.status,
      summary: compactRequired(test.summary, "No bounded summary provided.", MAX_TEXT),
    })),
    failuresAndFixes: pack.failuresAndFixes.slice(0, MAX_ITEMS).map((entry) => ({
      failure: compactRequired(entry.failure, "Unknown failure.", MAX_TEXT),
      fix: compact(entry.fix, MAX_TEXT),
      status: entry.status,
    })),
    unresolvedQuestions: unique(pack.unresolvedQuestions, MAX_ITEMS),
    followUpCandidates: pack.followUpCandidates.slice(0, MAX_ITEMS).map((candidate) => ({
      title: compactRequired(candidate.title, "Follow-up candidate", 180),
      rationale: compactRequired(candidate.rationale, "Bounded follow-up rationale.", MAX_TEXT),
      sourceRefs: unique(candidate.sourceRefs, 8),
    })),
    skillImprovementEvidence: pack.skillImprovementEvidence.slice(0, MAX_ITEMS).map((entry) => ({
      workflowName: compact(entry.workflowName, 160),
      evidence: compactRequired(entry.evidence, "Bounded skill improvement evidence.", MAX_TEXT),
      suggestedDirection: compact(entry.suggestedDirection, MAX_TEXT),
      sourceRefs: unique(entry.sourceRefs, 8),
    })),
    sourceRefs,
    contentHashes,
    safety: {
      noRawLogs: true,
      noRawTranscripts: true,
      noProviderPrompts: true,
      noHiddenReasoning: true,
      noSecrets: true,
    },
  };
  assertNoProhibitedContent(sanitized, "work episode outcome pack");
  return sanitized;
}

export function validateWorkEpisodeOutcomePack(pack: unknown): WorkEpisodeOutcomePack {
  const parsed = WorkEpisodeOutcomePackSchema.parse(pack);
  assertNoProhibitedContent(parsed, "work episode outcome pack");
  return parsed;
}

export function buildWorkEpisodeOutcomePack(
  input: Omit<
    WorkEpisodeOutcomePack,
    "schemaVersion" | "episodeId" | "contentHashes" | "safety" | "outcomeStatus"
  > & {
    episodeId?: string;
    contentHashes?: string[];
    outcomeStatus?: WorkEpisodeOutcomePackOutcomeStatus;
  },
): WorkEpisodeOutcomePack {
  const seed = {
    runtime: input.runtime,
    projectId: input.projectId,
    sessionKey: input.sessionKey,
    completedAt: input.completedAt,
    outcomeStatus: input.outcomeStatus ?? "completed",
    workType: input.workType,
    userGoal: input.userGoal,
    sourceRefs: input.sourceRefs,
  };
  const initial: WorkEpisodeOutcomePack = {
    ...input,
    schemaVersion: WORK_EPISODE_OUTCOME_PACK_SCHEMA_VERSION,
    outcomeStatus: input.outcomeStatus ?? "completed",
    episodeId: input.episodeId ?? `work-episode-${sha256JsonValue(seed).slice(0, 16)}`,
    contentHashes:
      input.contentHashes && input.contentHashes.length > 0
        ? input.contentHashes
        : [sha256JsonValue(seed)],
    safety: {
      noRawLogs: true,
      noRawTranscripts: true,
      noProviderPrompts: true,
      noHiddenReasoning: true,
      noSecrets: true,
    },
  };
  return validateWorkEpisodeOutcomePack(sanitizeWorkEpisodeOutcomePack(initial));
}

export async function writeWorkEpisodeOutcomePackArtifact(
  pack: WorkEpisodeOutcomePack,
  options: { artifactRoot: string; timestamp?: string },
): Promise<WorkEpisodeOutcomePackArtifact> {
  const sanitized = validateWorkEpisodeOutcomePack(sanitizeWorkEpisodeOutcomePack(pack));
  const timestamp = options.timestamp ?? new Date().toISOString();
  const safeTimestamp = timestamp.replace(/[:.]/gu, "-");
  const artifactRoot = path.join(options.artifactRoot, safeTimestamp);
  await fs.mkdir(artifactRoot, { recursive: true });
  const jsonPath = path.join(artifactRoot, "work-episode-outcome-pack.json");
  const markdownPath = path.join(artifactRoot, "work-episode-outcome-pack.md");
  const packHash = sha256JsonValue(sanitized);
  await fs.writeFile(jsonPath, `${JSON.stringify(sanitized, null, 2)}\n`, "utf8");
  await fs.writeFile(
    markdownPath,
    [
      "# Work Episode Outcome Pack",
      "",
      `- schemaVersion: ${sanitized.schemaVersion}`,
      `- episodeId: ${sanitized.episodeId}`,
      `- runtime: ${sanitized.runtime}`,
      `- projectId: ${sanitized.projectId}`,
      `- completedAt: ${sanitized.completedAt}`,
      `- outcomeStatus: ${sanitized.outcomeStatus}`,
      `- workType: ${sanitized.workType ?? "unspecified"}`,
      `- primarySystemArea: ${sanitized.primarySystemArea ?? "unspecified"}`,
      `- packHash: ${packHash}`,
      "",
      "## User Goal",
      sanitized.userGoal,
      "",
      "## Work Summary",
      sanitized.workSummary,
      "",
      "## Final Outcome",
      sanitized.finalOutcome,
      "",
      "## Completed Objective",
      sanitized.completedObjective ?? "Not specified.",
      "",
      "## Recovery Recommendation",
      sanitized.recoveryRecommendation ?? "Not specified.",
      "",
      "## Files Touched",
      ...sanitized.filesTouched.map(
        (file) => `- ${file.path} (${file.changeKind ?? "unknown"}): ${file.summary ?? ""}`,
      ),
      "",
      "## Tests Run",
      ...sanitized.testsRun.map((test) => `- ${test.status}: ${test.command} - ${test.summary}`),
      "",
      "## Follow-Up Candidates",
      ...sanitized.followUpCandidates.map(
        (candidate) => `- ${candidate.title}: ${candidate.rationale}`,
      ),
      "",
      "## Skill Improvement Evidence",
      ...sanitized.skillImprovementEvidence.map(
        (entry) =>
          `- ${entry.workflowName ?? "workflow"}: ${entry.evidence}${
            entry.suggestedDirection ? ` Direction: ${entry.suggestedDirection}` : ""
          }`,
      ),
      "",
    ].join("\n"),
    "utf8",
  );
  return {
    artifactRoot,
    jsonPath,
    markdownPath,
    packHash,
    promptPersisted: false,
    rawResponsePersisted: false,
    rawFullTranscriptPersisted: false,
  };
}

function safetyFlagsPass(pack: WorkEpisodeOutcomePack): boolean {
  return (
    pack.safety.noRawLogs &&
    pack.safety.noRawTranscripts &&
    pack.safety.noProviderPrompts &&
    pack.safety.noHiddenReasoning &&
    pack.safety.noSecrets
  );
}

export function evaluateWorkEpisodeOutcomePackEligibility(
  pack: WorkEpisodeOutcomePack,
): WorkEpisodeOutcomePackEligibilityReport {
  try {
    validateWorkEpisodeOutcomePack(pack);
  } catch {
    return {
      status: "unsafe",
      reasonCodes: ["schema_or_safety_validation_failed"],
      evidenceBearingFieldCount: 0,
      reviewEligible: false,
    };
  }
  const reasonCodes: string[] = [];
  if (!safetyFlagsPass(pack)) {
    reasonCodes.push("safety_flags_failed");
  }
  if (pack.sourceRefs.length === 0) {
    reasonCodes.push("source_refs_missing");
  }
  if (pack.contentHashes.length === 0) {
    reasonCodes.push("content_hashes_missing");
  }
  if (!pack.projectId || !pack.runtime || !pack.completedAt) {
    reasonCodes.push("required_identity_missing");
  }
  if (!pack.userGoal || !pack.workSummary || !pack.finalOutcome) {
    reasonCodes.push("bounded_summary_missing");
  }
  const evidenceBearingFieldCount = [
    pack.filesTouched.length,
    pack.testsRun.length,
    pack.failuresAndFixes.length,
    pack.unresolvedQuestions.length,
    pack.followUpCandidates.length,
    pack.skillImprovementEvidence.length,
    pack.sourceRefs.filter((ref) => /^artifact:|^repo:/u.test(ref)).length,
  ].filter((count) => count > 0).length;
  if (evidenceBearingFieldCount === 0) {
    reasonCodes.push("evidence_bearing_fields_missing");
  }
  if (pack.outcomeStatus !== "completed" && pack.failuresAndFixes.length === 0) {
    reasonCodes.push("partial_or_failed_pack_needs_failure_evidence");
  }
  if (reasonCodes.some((reasonCode) => reasonCode === "safety_flags_failed")) {
    return {
      status: "unsafe",
      reasonCodes,
      evidenceBearingFieldCount,
      reviewEligible: false,
    };
  }
  if (reasonCodes.length > 0) {
    return {
      status: "ineligible",
      reasonCodes,
      evidenceBearingFieldCount,
      reviewEligible: false,
    };
  }
  return {
    status: "eligible",
    reasonCodes: ["eligible_structural_evidence_present"],
    evidenceBearingFieldCount,
    reviewEligible: true,
  };
}

async function findOutcomePackFiles(root: string, depth = 0): Promise<string[]> {
  if (depth > 4) {
    return [];
  }
  let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isFile() && entry.name === "work-episode-outcome-pack.json") {
      files.push(fullPath);
    } else if (entry.isDirectory()) {
      files.push(...(await findOutcomePackFiles(fullPath, depth + 1)));
    }
  }
  return files;
}

export async function discoverWorkEpisodeOutcomePackArtifacts(
  roots: string[],
): Promise<WorkEpisodeOutcomePackDiscoveryRecord[]> {
  const records: WorkEpisodeOutcomePackDiscoveryRecord[] = [];
  for (const root of roots) {
    for (const packPath of await findOutcomePackFiles(root)) {
      try {
        const parsed = JSON.parse(await fs.readFile(packPath, "utf8"));
        const pack = validateWorkEpisodeOutcomePack(parsed);
        records.push({
          pack,
          packPath,
          contentHash: sha256JsonValue(pack),
          eligibility: evaluateWorkEpisodeOutcomePackEligibility(pack),
        });
      } catch {
        // Invalid or unsafe pack files are not loaded into runtime packet review.
      }
    }
  }
  return records.toSorted((left, right) => {
    const leftMs = Date.parse(left.pack.completedAt);
    const rightMs = Date.parse(right.pack.completedAt);
    if (Number.isFinite(leftMs) && Number.isFinite(rightMs)) {
      return leftMs - rightMs;
    }
    return left.packPath.localeCompare(right.packPath);
  });
}
