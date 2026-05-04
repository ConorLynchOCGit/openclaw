import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadLatestWorkEpisodeOutcomePack } from "./model-memory-proactivity-runtime.ts";
import {
  OpenClawWorkEpisodeCloseoutService,
  type OpenClawWorkEpisodeCloseoutFile,
  type OpenClawWorkEpisodeCloseoutInput,
  type OpenClawWorkEpisodeCloseoutResult,
  type OpenClawWorkEpisodeCloseoutTest,
} from "./work-episode-closeout-service.ts";
import type { WorkEpisodeOutcomePackEligibilityReport } from "./work-episode-outcome-pack.ts";

export type ManualWorkEpisodeCloseoutInput = {
  projectId: string;
  sessionKey?: string;
  branch?: string;
  startedAt?: string;
  completedAt?: string;
  primarySystemArea?: string;
  completedObjective?: string;
  userGoal: string;
  workSummary: string;
  finalOutcome: string;
  filesTouched?: OpenClawWorkEpisodeCloseoutFile[];
  testsRun?: OpenClawWorkEpisodeCloseoutTest[];
  failuresAndFixes?: OpenClawWorkEpisodeCloseoutInput["failuresAndFixes"];
  unresolvedQuestions?: string[];
  followUpCandidates?: OpenClawWorkEpisodeCloseoutInput["followUpCandidates"];
  skillImprovementEvidence?: OpenClawWorkEpisodeCloseoutInput["skillImprovementEvidence"];
  sourceRefs: string[];
  contentHashes?: string[];
  providerCallMade?: boolean;
  acpSessionStarted?: boolean;
  codexCliInvoked?: boolean;
  rebuildPerformed?: boolean;
  workQueueLifecycleMutated?: boolean;
};

export type ManualWorkEpisodeCloseoutProof = {
  schemaVersion: "manual_work_episode_closeout_proof.v1";
  generatedAt: string;
  projectId: string;
  sessionKey?: string;
  episodeId: string;
  packHash: string;
  packPath: string;
  markdownPath: string;
  eligibility: WorkEpisodeOutcomePackEligibilityReport;
  discoverableByModelMemory: boolean;
  latestDiscoveredEpisodeId: string | null;
  codexCliInvoked: boolean;
  providerCallMade: boolean;
  acpSessionStarted: boolean;
  rebuildPerformed: boolean;
  workQueueLifecycleMutated: boolean;
  rawTranscriptPersisted: false;
  rawPromptPersisted: false;
};

export type ManualWorkEpisodeCloseoutServiceOptions = {
  artifactRoot?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
};

export class ManualWorkEpisodeCloseoutService {
  private readonly closeout: OpenClawWorkEpisodeCloseoutService;
  private readonly now: () => Date;

  constructor(options: ManualWorkEpisodeCloseoutServiceOptions = {}) {
    this.closeout = new OpenClawWorkEpisodeCloseoutService(options);
    this.now = options.now ?? (() => new Date());
  }

  buildInput(input: ManualWorkEpisodeCloseoutInput): OpenClawWorkEpisodeCloseoutInput {
    return this.closeout.buildCloseoutInput({
      projectId: input.projectId,
      sessionKey: input.sessionKey,
      branch: input.branch,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      outcomeStatus: "completed",
      workType: "implementation",
      primarySystemArea: input.primarySystemArea,
      completedObjective: input.completedObjective,
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

  async emit(input: ManualWorkEpisodeCloseoutInput): Promise<OpenClawWorkEpisodeCloseoutResult> {
    return this.closeout.writeCloseout(this.buildInput(input));
  }

  async buildProof(
    result: OpenClawWorkEpisodeCloseoutResult,
    input: Pick<
      ManualWorkEpisodeCloseoutInput,
      | "providerCallMade"
      | "acpSessionStarted"
      | "codexCliInvoked"
      | "rebuildPerformed"
      | "workQueueLifecycleMutated"
    > = {},
  ): Promise<ManualWorkEpisodeCloseoutProof> {
    const latest = await loadLatestWorkEpisodeOutcomePack();
    return {
      schemaVersion: "manual_work_episode_closeout_proof.v1",
      generatedAt: this.now().toISOString(),
      projectId: result.pack.projectId,
      sessionKey: result.pack.sessionKey,
      episodeId: result.pack.episodeId,
      packHash: result.artifact.packHash,
      packPath: result.artifact.jsonPath,
      markdownPath: result.artifact.markdownPath,
      eligibility: result.eligibility,
      discoverableByModelMemory: result.discoverableByModelMemory,
      latestDiscoveredEpisodeId: latest?.episodeId ?? null,
      codexCliInvoked: input.codexCliInvoked ?? false,
      providerCallMade: input.providerCallMade ?? false,
      acpSessionStarted: input.acpSessionStarted ?? false,
      rebuildPerformed: input.rebuildPerformed ?? false,
      workQueueLifecycleMutated: input.workQueueLifecycleMutated ?? false,
      rawTranscriptPersisted: false,
      rawPromptPersisted: false,
    };
  }

  async writeProof(input: {
    proof: ManualWorkEpisodeCloseoutProof;
    proofPath: string;
  }): Promise<void> {
    await mkdir(path.dirname(input.proofPath), { recursive: true });
    await writeFile(input.proofPath, `${JSON.stringify(input.proof, null, 2)}\n`, "utf8");
  }
}
