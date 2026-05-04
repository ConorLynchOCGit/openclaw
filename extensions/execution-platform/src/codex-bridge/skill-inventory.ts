import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { DEFAULT_DIAGNOSTIC_LIMITS, boundDiagnosticJson } from "../observability/redaction.ts";
import type {
  JsonValue,
  RuntimeJobArtifact,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import { listRequiredCodexBridgeSkillDocs } from "./skill-triggers.ts";

const execFileAsync = promisify(execFile);

const DEFAULT_REPO_ROOT = "/root/services/openclaw-roles/live";
const DEFAULT_CODEX_SKILL_ROOT = "/root/.codex/skills";
const DEFAULT_WORKSPACE_SKILL_ROOT = "/root/.openclaw/workspace/skills";
const DEFAULT_EXECUTION_PLATFORM_DOC_ROOT =
  "/root/.openclaw/workspace/docs/projects/execution-platform";
const DEFAULT_MAX_SKILL_AUDIT_METADATA_BYTES = 96 * 1024;

export type CodexBridgeSkillInventorySourceKind =
  | "codex_active_skill"
  | "openclaw_repo_skill"
  | "openclaw_agent_skill"
  | "openclaw_workspace_draft_skill"
  | "execution_platform_workspace_skill_doc"
  | "execution_platform_workspace_role_doc";

export type CodexBridgeSkillInventoryItem = {
  skillDocId: string;
  sourceKind: CodexBridgeSkillInventorySourceKind;
  path: string;
  name: string | null;
  description: string | null;
  triggerPhraseHints: string[];
  activationState: "active" | "draft_only" | "repo_installed" | "missing";
  requiredForBridgeSafety: boolean;
  candidateForActivation: boolean;
  thirdPartyOrLocal: "local_authored" | "third_party" | "unknown";
};

export type CodexBridgeSkillInventoryReport = {
  artifactKind: "codex_bridge_skill_inventory_report";
  items: CodexBridgeSkillInventoryItem[];
  countsBySource: Record<string, number>;
  requiredBridgeSafetyItemIds: string[];
  noRawSkillContentIncluded: true;
};

export type ClawHubSearchResult = {
  slug: string;
  displayName: string;
  score: number | null;
};

export type CodexBridgeClawHubComparisonItem = {
  query: string;
  status:
    | "audited"
    | "unavailable_on_clawhub"
    | "skipped_not_bridge_relevant"
    | "skipped_timeout_or_noise";
  results: ClawHubSearchResult[];
  notes: string[];
};

export type CodexBridgeClawHubComparisonReport = {
  artifactKind: "codex_bridge_skill_clawhub_comparison_report";
  clawhubSkillPath: string;
  hostClawHubAvailable: boolean;
  boundedSearchOnly: true;
  installUpdatePublishPerformed: false;
  audited: CodexBridgeClawHubComparisonItem[];
  skipped: CodexBridgeClawHubComparisonItem[];
  searchedQueryCount: number;
  maxQueries: number;
  maxResultsPerQuery: number;
};

export type CodexBridgeSkillQualityReport = {
  artifactKind: "codex_bridge_skill_quality_audit_report";
  skillDocId: string;
  path: string;
  status: "pass" | "warn" | "fail";
  score: number;
  maxScore: number;
  blockingIssues: string[];
  warnings: string[];
  recommendedAction:
    | "keep_active"
    | "activate_local_bridge_skill"
    | "keep_draft"
    | "revise_before_activation"
    | "do_not_activate"
    | "quarantine_review_required";
  noRawSkillContentIncluded: true;
};

export type CodexBridgeSkillActivationReport = {
  artifactKind: "codex_bridge_skill_activation_report";
  activeBridgeSafetySkillId: "openclaw-bridge-safety";
  activeBridgeSafetySkillPath: string;
  activated: boolean;
  coversRequiredSkillDocIds: string[];
  quality: CodexBridgeSkillQualityReport;
  codeWritingSkillLayerReady: boolean;
  codeWritingBridgePilotStillBlockedByNonSkillGates: true;
  trustedYoloBlocked: true;
  rebuildBlocked: true;
  autobailoutBlocked: true;
  codexCliInvoked: false;
  acpSessionStarted: false;
  providerCallMade: false;
  rebuildPerformed: false;
  workQueueLifecycleMutated: false;
  clawHubInstallUpdatePublishPerformed: false;
};

export type CodexBridgeSkillAuditArtifact = {
  artifactKind: "codex_bridge_skill_activation_audit_8p";
  inventoryCountsBySource: Record<string, number>;
  clawhubSearchSurface: {
    hostClawHubAvailable: boolean;
    boundedSearchOnly: true;
    installUpdatePublishPerformed: false;
  };
  auditedSkills: string[];
  skippedSkills: Array<{ query: string; reason: string }>;
  activeBridgeSafetySkillPath: string;
  qualityStatus: CodexBridgeSkillQualityReport["status"];
  codeWritingSkillLayerReady: boolean;
  codeWritingBridgePilotStillBlockedByNonSkillGates: true;
  codexCliInvoked: false;
  workQueueLifecycleMutated: false;
};

export type ClawHubSearchRunner = (input: {
  query: string;
  maxResults: number;
  timeoutMs: number;
}) => Promise<{ available: boolean; timedOut?: boolean; output: string }>;

export type CodexBridgeSkillInventoryOptions = {
  repoRoot?: string;
  codexSkillRoot?: string;
  workspaceSkillRoot?: string;
  executionPlatformDocRoot?: string;
  readTextFile?: (path: string) => Promise<string>;
  listDirectory?: (path: string) => Promise<string[]>;
  maxArtifactMetadataBytes?: number;
};

function requiredBridgeSafetyIds(): string[] {
  return listRequiredCodexBridgeSkillDocs()
    .map((entry) => entry.skillDocId)
    .filter((id) => id !== "work-queue-ux-review")
    .toSorted();
}

function idFromPath(filePath: string): string {
  const base = path.basename(filePath, ".md");
  if (base === "SKILL") {
    return path.basename(path.dirname(filePath));
  }
  return base;
}

function parseFrontmatter(text: string): { name: string | null; description: string | null } {
  const match = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!match) {
    return { name: null, description: null };
  }
  const frontmatter = match[1]!;
  return {
    name: frontmatter.match(/^name:\s*"?([^"\n]+)"?/m)?.[1]?.trim() ?? null,
    description: frontmatter.match(/^description:\s*"?([^"\n]+)"?/m)?.[1]?.trim() ?? null,
  };
}

function triggerHints(description: string | null): string[] {
  if (!description) {
    return [];
  }
  return description
    .split(/[,.]| use when | before | during /i)
    .map((part) => part.trim())
    .filter((part) => part.length > 4)
    .slice(0, 8);
}

function inferThirdParty(
  filePath: string,
  text: string,
): "local_authored" | "third_party" | "unknown" {
  const lower = text.toLowerCase();
  if (filePath.includes("/.codex/skills/") || filePath.includes("/.openclaw/workspace/")) {
    return "local_authored";
  }
  if (lower.includes("provenance") || lower.includes("clawhub:") || lower.includes("github.com")) {
    return "third_party";
  }
  return filePath.includes("/skills/") ? "unknown" : "local_authored";
}

async function maybeListSkillFiles(
  root: string,
  sourceKind: CodexBridgeSkillInventorySourceKind,
  options: Required<Pick<CodexBridgeSkillInventoryOptions, "readTextFile" | "listDirectory">>,
): Promise<CodexBridgeSkillInventoryItem[]> {
  try {
    const entries = await options.listDirectory(root);
    const requiredIds = new Set(requiredBridgeSafetyIds());
    const items: CodexBridgeSkillInventoryItem[] = [];
    for (const entry of entries.toSorted()) {
      const skillPath = path.join(root, entry, "SKILL.md");
      try {
        const text = await options.readTextFile(skillPath);
        const frontmatter = parseFrontmatter(text);
        const skillDocId = entry;
        const isRequired = requiredIds.has(skillDocId) || skillDocId === "openclaw-bridge-safety";
        items.push({
          skillDocId,
          sourceKind,
          path: skillPath,
          name: frontmatter.name,
          description: frontmatter.description,
          triggerPhraseHints: triggerHints(frontmatter.description),
          activationState:
            sourceKind === "codex_active_skill"
              ? "active"
              : sourceKind === "openclaw_workspace_draft_skill"
                ? "draft_only"
                : "repo_installed",
          requiredForBridgeSafety: isRequired,
          candidateForActivation: isRequired || skillDocId === "work-queue-ux-review",
          thirdPartyOrLocal: inferThirdParty(skillPath, text),
        });
      } catch {
        continue;
      }
    }
    return items;
  } catch {
    return [];
  }
}

async function maybeListMarkdownDocs(
  root: string,
  sourceKind: CodexBridgeSkillInventorySourceKind,
  options: Required<Pick<CodexBridgeSkillInventoryOptions, "readTextFile" | "listDirectory">>,
): Promise<CodexBridgeSkillInventoryItem[]> {
  try {
    const entries = await options.listDirectory(root);
    const requiredIds = new Set(requiredBridgeSafetyIds());
    const items: CodexBridgeSkillInventoryItem[] = [];
    for (const entry of entries
      .filter((name) => name.endsWith(".md") && name !== "index.md")
      .toSorted()) {
      const docPath = path.join(root, entry);
      const text = await options.readTextFile(docPath);
      const frontmatter = parseFrontmatter(text);
      const skillDocId = idFromPath(entry);
      const isRequired =
        requiredIds.has(skillDocId) || sourceKind === "execution_platform_workspace_role_doc";
      items.push({
        skillDocId,
        sourceKind,
        path: docPath,
        name: frontmatter.name ?? text.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? null,
        description: frontmatter.description ?? null,
        triggerPhraseHints: triggerHints(
          frontmatter.description ?? text.match(/^#\s+(.+)$/m)?.[1] ?? null,
        ),
        activationState: "draft_only",
        requiredForBridgeSafety: isRequired,
        candidateForActivation: isRequired,
        thirdPartyOrLocal: "local_authored",
      });
    }
    return items;
  } catch {
    return [];
  }
}

export async function inventoryCodexBridgeSkills(
  input: CodexBridgeSkillInventoryOptions = {},
): Promise<CodexBridgeSkillInventoryReport> {
  const repoRoot = input.repoRoot ?? DEFAULT_REPO_ROOT;
  const codexSkillRoot = input.codexSkillRoot ?? DEFAULT_CODEX_SKILL_ROOT;
  const workspaceSkillRoot = input.workspaceSkillRoot ?? DEFAULT_WORKSPACE_SKILL_ROOT;
  const executionPlatformDocRoot =
    input.executionPlatformDocRoot ?? DEFAULT_EXECUTION_PLATFORM_DOC_ROOT;
  const options = {
    readTextFile: input.readTextFile ?? ((filePath: string) => readFile(filePath, "utf8")),
    listDirectory: input.listDirectory ?? ((dirPath: string) => readdir(dirPath)),
  };
  const items = [
    ...(await maybeListSkillFiles(codexSkillRoot, "codex_active_skill", options)),
    ...(await maybeListSkillFiles(path.join(repoRoot, "skills"), "openclaw_repo_skill", options)),
    ...(await maybeListSkillFiles(
      path.join(repoRoot, ".agents", "skills"),
      "openclaw_agent_skill",
      options,
    )),
    ...(await maybeListSkillFiles(workspaceSkillRoot, "openclaw_workspace_draft_skill", options)),
    ...(await maybeListMarkdownDocs(
      path.join(executionPlatformDocRoot, "skills"),
      "execution_platform_workspace_skill_doc",
      options,
    )),
    ...(await maybeListMarkdownDocs(
      path.join(executionPlatformDocRoot, "roles"),
      "execution_platform_workspace_role_doc",
      options,
    )),
  ];
  const countsBySource: Record<string, number> = {};
  for (const item of items) {
    countsBySource[item.sourceKind] = (countsBySource[item.sourceKind] ?? 0) + 1;
  }
  return {
    artifactKind: "codex_bridge_skill_inventory_report",
    items,
    countsBySource,
    requiredBridgeSafetyItemIds: requiredBridgeSafetyIds(),
    noRawSkillContentIncluded: true,
  };
}

export async function detectHostClawHubAvailable(): Promise<boolean> {
  try {
    await access("/usr/bin/clawhub", constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function createHostClawHubSearchRunner(): ClawHubSearchRunner {
  return async (input) => {
    try {
      const { stdout } = await execFileAsync("clawhub", ["search", input.query], {
        timeout: input.timeoutMs,
        maxBuffer: 24 * 1024,
        encoding: "utf8",
      });
      return { available: true, output: stdout };
    } catch (error) {
      const maybeError = error as { killed?: boolean; stdout?: string; message?: string };
      return {
        available: true,
        timedOut: maybeError.killed === true,
        output: maybeError.stdout ?? maybeError.message ?? "",
      };
    }
  };
}

function parseClawHubSearchOutput(output: string, maxResults: number): ClawHubSearchResult[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.toLowerCase().includes("searching"))
    .map((line) => {
      const match = /^([a-z0-9_.-]+)\s+(.+?)(?:\s+\(([\d.]+)\))?$/.exec(line);
      return {
        slug: match?.[1] ?? line.slice(0, 80),
        displayName: match?.[2]?.trim() ?? line.slice(0, 120),
        score: match?.[3] ? Number(match[3]) : null,
      };
    })
    .slice(0, maxResults);
}

export async function compareCodexBridgeSkillsWithClawHub(input: {
  inventory: CodexBridgeSkillInventoryReport;
  runner?: ClawHubSearchRunner;
  clawhubSkillPath?: string;
  hostClawHubAvailable?: boolean;
  maxQueries?: number;
  maxResultsPerQuery?: number;
  timeoutMs?: number;
}): Promise<CodexBridgeClawHubComparisonReport> {
  const minimumQueries = [
    "work-queue-ux-review",
    "skill-vetting",
    "skill-creator",
    "model-memory-deep-ingest",
    "ui-ux-pro-max",
    "clawhub",
    ...requiredBridgeSafetyIds(),
  ];
  const relevantInventoryQueries = input.inventory.items
    .filter((item) => item.requiredForBridgeSafety || item.candidateForActivation)
    .map((item) => item.skillDocId);
  const queries = [...new Set([...minimumQueries, ...relevantInventoryQueries])].toSorted();
  const maxQueries = input.maxQueries ?? 32;
  const maxResultsPerQuery = input.maxResultsPerQuery ?? 5;
  const runner = input.runner;
  const hostClawHubAvailable =
    input.hostClawHubAvailable ?? (runner ? true : await detectHostClawHubAvailable());
  const audited: CodexBridgeClawHubComparisonItem[] = [];
  const skipped: CodexBridgeClawHubComparisonItem[] = [];

  for (const query of queries.slice(0, maxQueries)) {
    if (!runner || !hostClawHubAvailable) {
      skipped.push({
        query,
        status: "skipped_timeout_or_noise",
        results: [],
        notes: ["ClawHub search runner unavailable for this bounded comparison."],
      });
      continue;
    }
    const result = await runner({
      query,
      maxResults: maxResultsPerQuery,
      timeoutMs: input.timeoutMs ?? 5_000,
    });
    if (result.timedOut) {
      skipped.push({
        query,
        status: "skipped_timeout_or_noise",
        results: [],
        notes: ["ClawHub search timed out."],
      });
      continue;
    }
    const results = parseClawHubSearchOutput(result.output, maxResultsPerQuery);
    audited.push({
      query,
      status: results.length ? "audited" : "unavailable_on_clawhub",
      results,
      notes: ["Search-only comparison; no install/update/publish performed."],
    });
  }
  for (const query of queries.slice(maxQueries)) {
    skipped.push({
      query,
      status: "skipped_not_bridge_relevant",
      results: [],
      notes: ["Skipped by max query bound."],
    });
  }
  return {
    artifactKind: "codex_bridge_skill_clawhub_comparison_report",
    clawhubSkillPath:
      input.clawhubSkillPath ?? path.join(DEFAULT_REPO_ROOT, "skills", "clawhub", "SKILL.md"),
    hostClawHubAvailable,
    boundedSearchOnly: true,
    installUpdatePublishPerformed: false,
    audited,
    skipped,
    searchedQueryCount: audited.length,
    maxQueries,
    maxResultsPerQuery,
  };
}

export function evaluateCodexBridgeSkillQuality(input: {
  skillDocId: string;
  path: string;
  skillText: string;
  sourceKind?: CodexBridgeSkillInventorySourceKind;
}): CodexBridgeSkillQualityReport {
  const text = input.skillText.toLowerCase();
  const checks = [
    {
      id: "precise_trigger_description",
      ok: text.includes("description:") && text.includes("use"),
    },
    {
      id: "clear_allowed_or_required_actions",
      ok: text.includes("required context") || text.includes("required workflow"),
    },
    {
      id: "explicit_prohibited_actions",
      ok: text.includes("prohibited actions") || text.includes("do not"),
    },
    {
      id: "bounded_context_progressive_disclosure",
      ok: text.includes("read only") || text.includes("bounded") || text.includes("progressive"),
    },
    { id: "no_secret_exposure", ok: text.includes("secrets") },
    {
      id: "no_arbitrary_command_execution",
      ok:
        text.includes("arbitrary shell") ||
        text.includes("command strings") ||
        text.includes("do not invoke"),
    },
    { id: "no_runtime_truth_bypass", ok: text.includes("runtime truth") },
    {
      id: "no_work_queue_lifecycle_without_evidence",
      ok: text.includes("work queue") && text.includes("lifecycle"),
    },
    {
      id: "process_completion_not_task_success",
      ok: text.includes("process completion") && text.includes("task success"),
    },
    {
      id: "validation_proof_expectations",
      ok: text.includes("validation") && text.includes("proof"),
    },
    {
      id: "escalation_stop_conditions",
      ok: text.includes("escalation") || text.includes("pause") || text.includes("stop"),
    },
  ];
  const passed = checks.filter((check) => check.ok);
  const warnings = checks.filter((check) => !check.ok).map((check) => `missing:${check.id}`);
  const blockingIssues = checks
    .filter(
      (check) =>
        !check.ok &&
        [
          "precise_trigger_description",
          "explicit_prohibited_actions",
          "no_arbitrary_command_execution",
          "no_runtime_truth_bypass",
        ].includes(check.id),
    )
    .map((check) => `blocking:${check.id}`);
  const score = passed.length;
  const status = blockingIssues.length ? "fail" : warnings.length ? "warn" : "pass";
  return {
    artifactKind: "codex_bridge_skill_quality_audit_report",
    skillDocId: input.skillDocId,
    path: input.path,
    status,
    score,
    maxScore: checks.length,
    blockingIssues,
    warnings,
    recommendedAction:
      status === "pass"
        ? input.skillDocId === "openclaw-bridge-safety"
          ? "activate_local_bridge_skill"
          : "keep_active"
        : status === "warn"
          ? "revise_before_activation"
          : "do_not_activate",
    noRawSkillContentIncluded: true,
  };
}

export async function buildBridgeSafetyActivationReport(
  input: {
    bridgeSafetySkillPath?: string;
    readTextFile?: (path: string) => Promise<string>;
  } = {},
): Promise<CodexBridgeSkillActivationReport> {
  const bridgeSafetySkillPath =
    input.bridgeSafetySkillPath ??
    path.join(DEFAULT_CODEX_SKILL_ROOT, "openclaw-bridge-safety", "SKILL.md");
  const readTextFile = input.readTextFile ?? ((filePath: string) => readFile(filePath, "utf8"));
  const text = await readTextFile(bridgeSafetySkillPath);
  const quality = evaluateCodexBridgeSkillQuality({
    skillDocId: "openclaw-bridge-safety",
    path: bridgeSafetySkillPath,
    skillText: text,
    sourceKind: "codex_active_skill",
  });
  const coversRequiredSkillDocIds = requiredBridgeSafetyIds();
  const codeWritingSkillLayerReady = quality.status === "pass";
  return {
    artifactKind: "codex_bridge_skill_activation_report",
    activeBridgeSafetySkillId: "openclaw-bridge-safety",
    activeBridgeSafetySkillPath: bridgeSafetySkillPath,
    activated: true,
    coversRequiredSkillDocIds,
    quality,
    codeWritingSkillLayerReady,
    codeWritingBridgePilotStillBlockedByNonSkillGates: true,
    trustedYoloBlocked: true,
    rebuildBlocked: true,
    autobailoutBlocked: true,
    codexCliInvoked: false,
    acpSessionStarted: false,
    providerCallMade: false,
    rebuildPerformed: false,
    workQueueLifecycleMutated: false,
    clawHubInstallUpdatePublishPerformed: false,
  };
}

export function buildSkillActivationAuditArtifact(input: {
  inventory: CodexBridgeSkillInventoryReport;
  comparison: CodexBridgeClawHubComparisonReport;
  activation: CodexBridgeSkillActivationReport;
}): CodexBridgeSkillAuditArtifact {
  return {
    artifactKind: "codex_bridge_skill_activation_audit_8p",
    inventoryCountsBySource: input.inventory.countsBySource,
    clawhubSearchSurface: {
      hostClawHubAvailable: input.comparison.hostClawHubAvailable,
      boundedSearchOnly: true,
      installUpdatePublishPerformed: false,
    },
    auditedSkills: input.comparison.audited.map((item) => item.query),
    skippedSkills: input.comparison.skipped.map((item) => ({
      query: item.query,
      reason: item.notes.join("; "),
    })),
    activeBridgeSafetySkillPath: input.activation.activeBridgeSafetySkillPath,
    qualityStatus: input.activation.quality.status,
    codeWritingSkillLayerReady: input.activation.codeWritingSkillLayerReady,
    codeWritingBridgePilotStillBlockedByNonSkillGates: true,
    codexCliInvoked: false,
    workQueueLifecycleMutated: false,
  };
}

function boundSkillAuditMetadata(value: JsonValue): JsonValue {
  return boundDiagnosticJson(value, {
    ...DEFAULT_DIAGNOSTIC_LIMITS,
    maxObjectKeys: 420,
    maxArrayItems: 260,
    maxDepth: 10,
    maxStringLength: 2_000,
  });
}

function jsonByteLength(value: JsonValue): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

export async function writeSkillActivationAuditArtifact(input: {
  artifactPath: string;
  artifact: CodexBridgeSkillAuditArtifact;
}): Promise<void> {
  await writeFile(input.artifactPath, `${JSON.stringify(input.artifact, null, 2)}\n`, "utf8");
}

export class CodexBridgeSkillInventoryRepository {
  private readonly maxArtifactMetadataBytes: number;

  constructor(
    private readonly runtimeJobs: RuntimeJobRepository,
    options: Pick<CodexBridgeSkillInventoryOptions, "maxArtifactMetadataBytes"> = {},
  ) {
    this.maxArtifactMetadataBytes =
      options.maxArtifactMetadataBytes ?? DEFAULT_MAX_SKILL_AUDIT_METADATA_BYTES;
  }

  async persistReport(input: {
    runtimeJobId: string;
    artifactType:
      | "codex_bridge.skill_inventory_report"
      | "codex_bridge.skill_clawhub_comparison_report"
      | "codex_bridge.skill_quality_audit_report"
      | "codex_bridge.skill_activation_report";
    report: JsonValue;
  }): Promise<RuntimeJobArtifact> {
    const bounded = boundSkillAuditMetadata(input.report);
    if (jsonByteLength(bounded) > this.maxArtifactMetadataBytes) {
      throw new Error("skill inventory metadata exceeds artifact bounds");
    }
    const artifact = await this.runtimeJobs.attachArtifact({
      jobId: input.runtimeJobId,
      artifactType: input.artifactType,
      storageKind: "metadata",
      uri: `runtime-job://${input.runtimeJobId}/codex-bridge/${input.artifactType}`,
      contentType: "application/json",
      sizeBytes: jsonByteLength(bounded),
      metadata: bounded,
    });
    await this.runtimeJobs.recordEvent({
      jobId: input.runtimeJobId,
      eventType: "codex_bridge.skill_trigger_checked",
      data: {
        artifactType: input.artifactType,
        artifactId: artifact.artifactId,
        noRawSkillContentIncluded: true,
      },
    });
    return artifact;
  }
}
