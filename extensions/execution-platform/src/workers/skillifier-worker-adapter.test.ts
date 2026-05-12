import { describe, expect, it } from "vitest";
import {
  SKILLIFIER_CANDIDATE_SCHEMA_VERSION,
  buildSkillifierCandidateId,
} from "../../../model-memory/src/skillifier-runtime.ts";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository, type RuntimeJob } from "../runtime-job-repository.ts";
import {
  SKILLIFIER_RUNTIME_JOB_TYPE,
  SKILLIFIER_WORKFLOW_ID,
} from "../workflows/skillifier-runtime-workflow.ts";
import { RuntimeWorkerSupervisor } from "./runtime-worker-supervisor.ts";
import {
  SKILLIFIER_WORKER_ADAPTER_ID,
  SkillifierWorkerAdapter,
  skillifierRuntimeEvidenceRefs,
} from "./skillifier-worker-adapter.ts";
import { createModelAuthoredCloseoutCapsuleFixture } from "./test-closeout-capsule-fixture.ts";

async function withRepository<T>(work: (repository: RuntimeJobRepository) => Promise<T>) {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    return await work(new RuntimeJobRepository(database.sql, { claimStrategy: "basic" }));
  } finally {
    await database.close();
  }
}

async function enqueueSkillifierJob(repository: RuntimeJobRepository, jobId: string) {
  return repository.enqueueJob({
    jobId,
    jobType: SKILLIFIER_RUNTIME_JOB_TYPE,
    queueName: "workflow-workers",
    maxAttempts: 1,
    payload: {
      workflowId: SKILLIFIER_WORKFLOW_ID,
      opportunitySeedRefs: ["closeout-capsule://capsule-1/opportunity/seed-1"],
      closeoutCapsuleRefs: ["closeout-capsule://capsule-1"],
      sourceArtifactRefs: ["artifact://closeout-capsule-source"],
      targetSkillRefs: [],
      requestedOutcome: "create_candidate",
      ownerConstraintRefs: [],
      modelPolicyRefs: ["model-task.skillifier.structured-json"],
      workerPolicyRefs: [SKILLIFIER_WORKER_ADAPTER_ID],
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
    },
  });
}

describe("Skillifier worker adapter", () => {
  it("runs a Skillifier runtime job through RuntimeWorkerSupervisor with candidate and middleware refs", async () => {
    await withRepository(async (repository) => {
      const job = await enqueueSkillifierJob(repository, "skillifier-worker-job");
      const modelTaskRefs = ["runtime-job://skillifier-model-task/model-task/validation"];
      const dbOperationRefs = ["runtime-job://skillifier-db-operation/db-operation/metadata"];
      const candidateId = buildSkillifierCandidateId({
        sourceCloseoutCapsuleHash: "a".repeat(64),
        sourceOpportunityRef: "closeout-capsule://capsule-1/opportunity/seed-1",
        candidateType: "new_skill",
      });
      const candidateRef = `runtime-job://${job.jobId}/skillifier/candidate/${candidateId}`;
      const adapter = new SkillifierWorkerAdapter({
        runtimeJobs: repository,
        runner: {
          async run({ job: runtimeJob }) {
            await repository.attachArtifact({
              jobId: runtimeJob.jobId,
              artifactType: "skillifier.runtime_candidate",
              storageKind: "metadata",
              uri: candidateRef,
              metadata: {
                artifactKind: "model_memory_skillifier_candidate",
                schemaVersion: SKILLIFIER_CANDIDATE_SCHEMA_VERSION,
                candidateId,
                createdAt: "2026-05-11T17:00:00.000Z",
                sourceOpportunityRef: "closeout-capsule://capsule-1/opportunity/seed-1",
                sourceCloseoutCapsuleRef: "closeout-capsule://capsule-1",
                sourceCloseoutCapsuleHash: "a".repeat(64),
                targetSkillRef: null,
                candidateType: "new_skill",
                reviewState: "candidate_ready",
                modelRef: "model-task://skillifier.structured_json",
                modelTaskRefs,
                dbOperationRefs,
                modelAuthoredRationale:
                  "A model-authored review found this skill candidate useful.",
                modelAuthoredProposedSkillSummary:
                  "Create a bounded Skillifier runtime closeout review skill.",
                proposedFilePathRef: "skills/skillifier-runtime-review/SKILL.md",
                boundedDraftRef: "artifact://skillifier-draft",
                boundedDraftHash: "b".repeat(64),
                validationRefs: ["validation://skillifier-candidate-schema"],
                reviewRefs: ["review://skillifier-candidate-quality"],
                limitations: ["owner review is required before applying the skill file"],
                eli5Progress:
                  "OpenClaw reviewed a closeout seed and produced a safe skill candidate.",
                rawPromptStored: false,
                rawResponseStored: false,
                rawTranscriptStored: false,
                rawProviderLogStored: false,
                rawToolLogStored: false,
                rawDbRowsStored: false,
              },
            });
            return {
              status: "completed",
              summary: "Skillifier worker produced a bounded candidate artifact.",
              workflowId: SKILLIFIER_WORKFLOW_ID,
              runId: `run-${runtimeJob.jobId}`,
              roleRefs: ["role://skillifier_reviewer", "role://skill_candidate_writer"],
              modelRefs: ["model-task://skillifier.structured_json"],
              modelRunRefs: ["model-run://skillifier-review"],
              sourceRefs: ["closeout-capsule://capsule-1"],
              validationRefs: ["validation://skillifier-candidate-schema"],
              reviewRefs: ["review://skillifier-candidate-quality"],
              closeoutRefs: [`runtime-job://${runtimeJob.jobId}/closeout`],
              completedWorkEvidenceRefs: skillifierRuntimeEvidenceRefs({
                runtimeJobId: runtimeJob.jobId,
                candidateId,
                modelTaskRefs,
                dbOperationRefs,
                candidateArtifactRefs: [candidateRef],
              }),
              artifactRefs: [candidateRef],
              closeoutCapsule: createModelAuthoredCloseoutCapsuleFixture({
                runtimeJobId: runtimeJob.jobId,
                workflowId: SKILLIFIER_WORKFLOW_ID,
                roleId: "skillifier_reviewer",
                modelRef: "model-task://skillifier.structured_json",
                artifactRefs: [candidateRef],
                validationRefs: ["validation://skillifier-candidate-schema"],
                fileRefs: ["skills/skillifier-runtime-review/SKILL.md"],
                reportMarkdown:
                  "The Skillifier runtime worker created a bounded candidate proposal and left apply review-gated.",
                eli5Progress:
                  "OpenClaw turned one follow-up idea into a skill candidate without editing files directly.",
              }),
              reasonCodes: ["skillifier_worker_fixture_completed"],
              result: {
                artifactKind: "skillifier_worker_runtime_result",
                runtimeJobId: runtimeJob.jobId,
                workflowId: SKILLIFIER_WORKFLOW_ID,
                candidateId,
                candidateType: "new_skill",
                reviewState: "candidate_ready",
                opportunitySeedRefs: ["closeout-capsule://capsule-1/opportunity/seed-1"],
                closeoutCapsuleRefs: ["closeout-capsule://capsule-1"],
                targetSkillRefs: [],
                modelTaskRefs,
                dbOperationRefs,
                candidateArtifactRefs: [candidateRef],
                skillFileEdited: false,
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
                rawDbRowsStored: false,
                workQueueLifecycleMutated: false,
              },
              rawPromptStored: false,
              rawResponseStored: false,
              rawLogsStored: false,
              rawProviderLogStored: false,
              rawToolLogStored: false,
              workQueueLifecycleMutated: false,
            };
          },
        },
      });

      const supervisor = new RuntimeWorkerSupervisor({
        repository,
        workerId: "skillifier-worker-test",
        queueName: "workflow-workers",
        adapters: [adapter],
      });
      const result = await supervisor.runOnce({ runtimeJobId: job.jobId });
      const completed = await repository.getJob(job.jobId);
      const artifacts = await repository.listArtifacts(job.jobId);

      expect(result).toMatchObject({
        status: "completed",
        completed: true,
        adapterId: SKILLIFIER_WORKER_ADAPTER_ID,
      });
      expect(completed?.state).toBe("succeeded");
      expect(artifacts.map((artifact) => artifact.artifactType)).toEqual(
        expect.arrayContaining([
          "skillifier.runtime_candidate",
          "runtime_worker.adapter_result",
          "execution_platform.closeout_capsule",
        ]),
      );
    });
  });

  it("does not accept completed Skillifier work without model-task and DB-operation refs", async () => {
    await withRepository(async (repository) => {
      const job = await enqueueSkillifierJob(repository, "skillifier-worker-missing-refs");
      const adapter = new SkillifierWorkerAdapter({
        runtimeJobs: repository,
        runner: {
          async run({ job }: { job: RuntimeJob }) {
            return {
              status: "completed",
              summary: "Missing middleware refs.",
              workflowId: SKILLIFIER_WORKFLOW_ID,
              runId: `run-${job.jobId}`,
              roleRefs: ["role://skillifier_reviewer"],
              modelRefs: ["model-task://skillifier.structured_json"],
              modelRunRefs: [],
              sourceRefs: ["closeout-capsule://capsule-1"],
              validationRefs: ["validation://present"],
              reviewRefs: ["review://present"],
              closeoutRefs: ["closeout://present"],
              completedWorkEvidenceRefs: ["runtime-job://skillifier-worker-missing-refs/evidence"],
              artifactRefs: ["runtime-job://skillifier-worker-missing-refs/evidence"],
              closeoutCapsule: createModelAuthoredCloseoutCapsuleFixture({
                runtimeJobId: job.jobId,
                workflowId: SKILLIFIER_WORKFLOW_ID,
              }),
              reasonCodes: [],
              result: {
                artifactKind: "skillifier_worker_runtime_result",
                runtimeJobId: job.jobId,
                workflowId: SKILLIFIER_WORKFLOW_ID,
                candidateId: null,
                candidateType: null,
                reviewState: "needs_review",
                opportunitySeedRefs: [],
                closeoutCapsuleRefs: [],
                targetSkillRefs: [],
                modelTaskRefs: [],
                dbOperationRefs: [],
                candidateArtifactRefs: [],
                skillFileEdited: false,
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
                rawDbRowsStored: false,
                workQueueLifecycleMutated: false,
              },
              rawPromptStored: false,
              rawResponseStored: false,
              rawLogsStored: false,
              rawProviderLogStored: false,
              rawToolLogStored: false,
              workQueueLifecycleMutated: false,
            };
          },
        },
      });
      const result = await new RuntimeWorkerSupervisor({
        repository,
        workerId: "skillifier-worker-test",
        queueName: "workflow-workers",
        adapters: [adapter],
      }).runOnce({ runtimeJobId: job.jobId });

      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).toEqual(
        expect.arrayContaining([
          "skillifier_worker_model_task_refs_missing",
          "skillifier_worker_db_operation_refs_missing",
          "skillifier_worker_candidate_artifact_refs_missing",
        ]),
      );
    });
  });
});
