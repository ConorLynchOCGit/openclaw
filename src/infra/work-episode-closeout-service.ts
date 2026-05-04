import path from "node:path";
import {
  buildWorkEpisodeOutcomePack,
  discoverWorkEpisodeOutcomePackArtifacts,
  evaluateWorkEpisodeOutcomePackEligibility,
  validateWorkEpisodeOutcomePack,
  writeWorkEpisodeOutcomePackArtifact,
  type WorkEpisodeOutcomePack,
  type WorkEpisodeOutcomePackArtifact,
  type WorkEpisodeOutcomePackChangeKind,
  type WorkEpisodeOutcomePackEligibilityReport,
  type WorkEpisodeOutcomePackFailureStatus,
  type WorkEpisodeOutcomePackOutcomeStatus,
  type WorkEpisodeOutcomePackTestStatus,
  type WorkEpisodeOutcomePackWorkType,
} from "./work-episode-outcome-pack.ts";

const DEFAULT_OUTCOME_PACK_RELATIVE_ROOT = ".artifacts/model-memory/work-episode-outcome-pack";

export type OpenClawWorkEpisodeCloseoutFile = {
  path: string;
  changeKind?: WorkEpisodeOutcomePackChangeKind;
  summary?: string;
};

export type OpenClawWorkEpisodeCloseoutTest = {
  command: string;
  status: WorkEpisodeOutcomePackTestStatus;
  summary: string;
};

export type OpenClawWorkEpisodeCloseoutFailure = {
  failure: string;
  fix?: string;
  status: WorkEpisodeOutcomePackFailureStatus;
};

export type OpenClawWorkEpisodeCloseoutInput = {
  projectId: string;
  sessionKey?: string;
  branch?: string;
  startedAt?: string;
  completedAt: string;
  outcomeStatus?: WorkEpisodeOutcomePackOutcomeStatus;
  workType?: WorkEpisodeOutcomePackWorkType;
  primarySystemArea?: string;
  completedObjective?: string;
  recoveryRecommendation?: string;
  userGoal: string;
  workSummary: string;
  finalOutcome: string;
  filesTouched?: OpenClawWorkEpisodeCloseoutFile[];
  testsRun?: OpenClawWorkEpisodeCloseoutTest[];
  failuresAndFixes?: OpenClawWorkEpisodeCloseoutFailure[];
  unresolvedQuestions?: string[];
  followUpCandidates?: Array<{
    title: string;
    rationale: string;
    sourceRefs: string[];
  }>;
  skillImprovementEvidence?: Array<{
    workflowName?: string;
    evidence: string;
    suggestedDirection?: string;
    sourceRefs: string[];
  }>;
  sourceRefs: string[];
  contentHashes?: string[];
};

export type OpenClawWorkEpisodeCloseoutResult = {
  input: OpenClawWorkEpisodeCloseoutInput;
  pack: WorkEpisodeOutcomePack;
  artifact: WorkEpisodeOutcomePackArtifact;
  eligibility: WorkEpisodeOutcomePackEligibilityReport;
  discoverableByModelMemory: boolean;
};

export type OpenClawWorkEpisodeCloseoutBlockerReport = {
  closeoutPresent: boolean;
  closeoutRequired: boolean;
  allowed: boolean;
  blockingReasons: string[];
  latestPack: WorkEpisodeOutcomePack | null;
  eligibility: WorkEpisodeOutcomePackEligibilityReport | null;
};

export type OpenClawWorkEpisodeCloseoutServiceOptions = {
  artifactRoot?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
};

function resolveArtifactRoot(input: {
  artifactRoot?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}): string {
  const env = input.env ?? process.env;
  return path.resolve(
    input.cwd ?? process.cwd(),
    input.artifactRoot ??
      env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT ??
      DEFAULT_OUTCOME_PACK_RELATIVE_ROOT,
  );
}

export function buildOpenClawWorkEpisodeOutcomePack(
  input: OpenClawWorkEpisodeCloseoutInput,
): WorkEpisodeOutcomePack {
  return buildWorkEpisodeOutcomePack({
    runtime: "openclaw",
    projectId: input.projectId,
    sessionKey: input.sessionKey,
    branch: input.branch,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    outcomeStatus: input.outcomeStatus ?? "completed",
    workType: input.workType,
    primarySystemArea: input.primarySystemArea,
    completedObjective: input.completedObjective,
    recoveryRecommendation: input.recoveryRecommendation,
    userGoal: input.userGoal,
    workSummary: input.workSummary,
    finalOutcome: input.finalOutcome,
    filesTouched: input.filesTouched ?? [],
    testsRun: input.testsRun ?? [],
    failuresAndFixes: input.failuresAndFixes ?? [],
    unresolvedQuestions: input.unresolvedQuestions ?? [],
    followUpCandidates: input.followUpCandidates ?? [],
    skillImprovementEvidence: input.skillImprovementEvidence ?? [],
    sourceRefs: input.sourceRefs,
    contentHashes: input.contentHashes,
  });
}

export class OpenClawWorkEpisodeCloseoutService {
  private readonly artifactRoot: string;
  private readonly now: () => Date;

  constructor(options: OpenClawWorkEpisodeCloseoutServiceOptions = {}) {
    this.artifactRoot = resolveArtifactRoot(options);
    this.now = options.now ?? (() => new Date());
  }

  buildCloseoutInput(
    input: Omit<OpenClawWorkEpisodeCloseoutInput, "completedAt"> & { completedAt?: string },
  ): OpenClawWorkEpisodeCloseoutInput {
    return {
      ...input,
      completedAt: input.completedAt ?? this.now().toISOString(),
    };
  }

  buildPack(input: OpenClawWorkEpisodeCloseoutInput): WorkEpisodeOutcomePack {
    return buildOpenClawWorkEpisodeOutcomePack(input);
  }

  async writeCloseout(
    input: OpenClawWorkEpisodeCloseoutInput,
  ): Promise<OpenClawWorkEpisodeCloseoutResult> {
    const pack = this.buildPack(input);
    const artifact = await writeWorkEpisodeOutcomePackArtifact(pack, {
      artifactRoot: this.artifactRoot,
      timestamp: pack.completedAt,
    });
    const eligibility = evaluateWorkEpisodeOutcomePackEligibility(pack);
    const discoverableByModelMemory = await this.isDiscoverable(pack);
    return {
      input,
      pack,
      artifact,
      eligibility,
      discoverableByModelMemory,
    };
  }

  async produceMissingCloseoutBlockerReport(input: {
    closeoutRequired: boolean;
  }): Promise<OpenClawWorkEpisodeCloseoutBlockerReport> {
    const records = await discoverWorkEpisodeOutcomePackArtifacts([this.artifactRoot]);
    const latest = records.at(-1) ?? null;
    const blockingReasons: string[] = [];
    if (input.closeoutRequired && !latest) {
      blockingReasons.push("work_episode_closeout_missing");
    }
    if (latest?.eligibility.reviewEligible === false) {
      blockingReasons.push("work_episode_closeout_not_eligible");
    }
    return {
      closeoutPresent: latest !== null,
      closeoutRequired: input.closeoutRequired,
      allowed: blockingReasons.length === 0,
      blockingReasons,
      latestPack: latest?.pack ?? null,
      eligibility: latest?.eligibility ?? null,
    };
  }

  produceOperatorSummary(input: OpenClawWorkEpisodeCloseoutResult): {
    episodeId: string;
    packPath: string;
    eligibilityStatus: WorkEpisodeOutcomePackEligibilityReport["status"];
    discoverableByModelMemory: boolean;
    processCompletionIsNotTaskSuccess: true;
  } {
    validateWorkEpisodeOutcomePack(input.pack);
    return {
      episodeId: input.pack.episodeId,
      packPath: input.artifact.jsonPath,
      eligibilityStatus: input.eligibility.status,
      discoverableByModelMemory: input.discoverableByModelMemory,
      processCompletionIsNotTaskSuccess: true,
    };
  }

  private async isDiscoverable(pack: WorkEpisodeOutcomePack): Promise<boolean> {
    const records = await discoverWorkEpisodeOutcomePackArtifacts([this.artifactRoot]);
    return records.some((record) => record.pack.episodeId === pack.episodeId);
  }
}
