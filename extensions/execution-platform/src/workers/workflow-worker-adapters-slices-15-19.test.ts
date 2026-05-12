import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository, type RuntimeJob } from "../runtime-job-repository.ts";
import { architectureWorkflowContract } from "../workflows/architecture-workflow.ts";
import { docsSkillsWorkflowContract } from "../workflows/docs-skills-workflow.ts";
import { qaTestWorkflowContract } from "../workflows/qa-test-workflow.ts";
import { webResearchWorkflowContract } from "../workflows/web-research-workflow.ts";
import { ArchitectureSpecWorkerAdapter } from "./architecture-spec-worker-adapter.ts";
import type { BoundedWorkflowWorkerRunResult } from "./bounded-workflow-worker-adapter.ts";
import { DocsSkillsWorkerAdapter } from "./docs-skills-worker-adapter.ts";
import { QaTestWorkerAdapter } from "./qa-test-worker-adapter.ts";
import {
  RESEARCH_TO_CODING_HANDOFF_JOB_TYPE,
  RESEARCH_TO_CODING_HANDOFF_WORKFLOW_ID,
  ResearchToCodingHandoffWorkerAdapter,
  validateResearchToCodingWorkerHandoff,
} from "./research-to-coding-handoff-worker.ts";
import { RuntimeWorkerSupervisor } from "./runtime-worker-supervisor.ts";
import { createModelAuthoredCloseoutCapsuleFixture } from "./test-closeout-capsule-fixture.ts";
import { WebResearchWorkerAdapter } from "./web-research-worker-adapter.ts";

async function withRepository<T>(work: (repository: RuntimeJobRepository) => Promise<T>) {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    return await work(
      new RuntimeJobRepository(database.sql, {
        claimStrategy: "basic",
        now: () => new Date("2026-05-09T00:00:00.000Z"),
      }),
    );
  } finally {
    await database.close();
  }
}

function completedRun(input: {
  job: RuntimeJob;
  workflowId: string;
  roleId: string;
  modelRef: string;
  reasonCode: string;
  citationRefs?: string[];
}): BoundedWorkflowWorkerRunResult {
  const artifactRef = `runtime-job://${input.job.jobId}/${input.workflowId}/bounded-evidence`;
  const validationRef = `runtime-job://${input.job.jobId}/${input.workflowId}/validation`;
  return {
    status: "completed",
    summary: `${input.workflowId} worker completed bounded workflow evidence.`,
    workflowId: input.workflowId,
    runId: `run-${input.job.jobId}`,
    roleRefs: [`role://${input.roleId}`],
    modelRefs: [input.modelRef],
    modelRunRefs: [`model-run://${input.job.jobId}/${input.roleId}`],
    sourceRefs: input.citationRefs,
    citationRefs: input.citationRefs,
    validationRefs: [validationRef],
    reviewRefs: [`runtime-job://${input.job.jobId}/${input.workflowId}/review`],
    closeoutRefs: [`runtime-job://${input.job.jobId}/${input.workflowId}/closeout`],
    completedWorkEvidenceRefs: [artifactRef],
    artifactRefs: [artifactRef],
    closeoutCapsule: createModelAuthoredCloseoutCapsuleFixture({
      runtimeJobId: input.job.jobId,
      workflowId: input.workflowId,
      roleId: input.roleId,
      modelRef: input.modelRef,
      artifactRefs: [artifactRef],
      validationRefs: [validationRef],
      fileRefs: [`workflow://${input.workflowId}`],
      reportMarkdown: `${input.workflowId} produced bounded model-authored workflow closeout evidence.`,
      eli5Progress: "OpenClaw ran the workflow worker and saved a clear closeout.",
    }),
    reasonCodes: [input.reasonCode],
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    workQueueLifecycleMutated: false,
  };
}

async function enqueueWorkflowJob(input: {
  repository: RuntimeJobRepository;
  jobId: string;
  jobType: string;
  workflowId: string;
  queueName?: string;
}) {
  await input.repository.enqueueJob({
    jobId: input.jobId,
    jobType: input.jobType,
    queueName: input.queueName ?? "workflow-workers",
    maxAttempts: 1,
    payload: {
      workflowId: input.workflowId,
      objectiveSummary: "Run bounded worker adapter proof.",
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
    },
  });
}

describe("Slices 15-19 workflow worker adapters", () => {
  it("keeps research-to-coding child handoff pinned to the bounded validation evidence ref", () => {
    const validationEvidenceRef =
      "runtime-job://slice-26-workflow-research-to-coding-handoff-model-fda5bc9554/model-task/validation";
    const result = validateResearchToCodingWorkerHandoff({
      parentRuntimeJobId: "runtime-job://agent-team-coding-parent",
      childRuntimeJobId: "slice-26-workflow-research-to-coding-handoff-model-fda5bc9554",
      childEvidenceRef: validationEvidenceRef,
    });

    expect(result).toMatchObject({
      accepted: true,
      reasonCodes: [],
      parentWorkflowExists: true,
      childWorkflowExists: true,
      rawPromptStored: false,
      rawResponseStored: false,
    });
  });

  it("runs web research, handoff, docs, QA, and architecture workers through RuntimeWorkerSupervisor", async () => {
    await withRepository(async (repository) => {
      const adapters = [
        new WebResearchWorkerAdapter({
          runtimeJobs: repository,
          runner: {
            async run({ job }) {
              return completedRun({
                job,
                workflowId: webResearchWorkflowContract.workflowId,
                roleId: "web_researcher",
                modelRef: "model://fixture-web-researcher",
                reasonCode: "web_research_worker_fixture_completed",
                citationRefs: [`runtime-job://${job.jobId}/web-research/citation-ref`],
              });
            },
          },
        }),
        new ResearchToCodingHandoffWorkerAdapter({
          runtimeJobs: repository,
          runner: {
            async run({ job }) {
              const validation = validateResearchToCodingWorkerHandoff({
                parentRuntimeJobId: job.jobId,
                childRuntimeJobId: `${job.jobId}-child-web-research`,
                childEvidenceRef: `runtime-job://${job.jobId}/child-web-research/evidence`,
              });
              expect(validation.accepted).toBe(true);
              return completedRun({
                job,
                workflowId: RESEARCH_TO_CODING_HANDOFF_WORKFLOW_ID,
                roleId: "handoff_coordinator",
                modelRef: "model://fixture-handoff-coordinator",
                reasonCode: "research_to_coding_handoff_fixture_completed",
              });
            },
          },
        }),
        new DocsSkillsWorkerAdapter({
          runtimeJobs: repository,
          runner: {
            async run({ job }) {
              return completedRun({
                job,
                workflowId: docsSkillsWorkflowContract.workflowId,
                roleId: "docs_skills_writer",
                modelRef: "model://fixture-docs-skills-writer",
                reasonCode: "docs_skills_worker_fixture_completed",
              });
            },
          },
        }),
        new QaTestWorkerAdapter({
          runtimeJobs: repository,
          runner: {
            async run({ job }) {
              return completedRun({
                job,
                workflowId: qaTestWorkflowContract.workflowId,
                roleId: "qa_test_reviewer",
                modelRef: "model://fixture-qa-test-reviewer",
                reasonCode: "qa_test_worker_fixture_completed",
              });
            },
          },
        }),
        new ArchitectureSpecWorkerAdapter({
          runtimeJobs: repository,
          runner: {
            async run({ job }) {
              return completedRun({
                job,
                workflowId: architectureWorkflowContract.workflowId,
                roleId: "technical_spec_writer",
                modelRef: "model://fixture-technical-spec-writer",
                reasonCode: "architecture_spec_worker_fixture_completed",
              });
            },
          },
        }),
      ];

      await enqueueWorkflowJob({
        repository,
        jobId: "job-web-research-worker",
        jobType: webResearchWorkflowContract.jobType,
        workflowId: webResearchWorkflowContract.workflowId,
      });
      await enqueueWorkflowJob({
        repository,
        jobId: "job-research-to-coding-handoff-worker",
        jobType: RESEARCH_TO_CODING_HANDOFF_JOB_TYPE,
        workflowId: RESEARCH_TO_CODING_HANDOFF_WORKFLOW_ID,
      });
      await enqueueWorkflowJob({
        repository,
        jobId: "job-docs-skills-worker",
        jobType: docsSkillsWorkflowContract.jobType,
        workflowId: docsSkillsWorkflowContract.workflowId,
      });
      await enqueueWorkflowJob({
        repository,
        jobId: "job-qa-test-worker",
        jobType: qaTestWorkflowContract.jobType,
        workflowId: qaTestWorkflowContract.workflowId,
      });
      await enqueueWorkflowJob({
        repository,
        jobId: "job-architecture-worker",
        jobType: architectureWorkflowContract.jobType,
        workflowId: architectureWorkflowContract.workflowId,
      });

      const results = await new RuntimeWorkerSupervisor({
        repository,
        workerId: "workflow-worker-supervisor",
        queueName: "workflow-workers",
        adapters,
      }).runUntilIdle(10);

      expect(results).toHaveLength(5);
      expect(results.map((result) => result.status)).toEqual([
        "completed",
        "completed",
        "completed",
        "completed",
        "completed",
      ]);
      for (const jobId of [
        "job-web-research-worker",
        "job-research-to-coding-handoff-worker",
        "job-docs-skills-worker",
        "job-qa-test-worker",
        "job-architecture-worker",
      ]) {
        await expect(repository.getJob(jobId)).resolves.toMatchObject({ state: "succeeded" });
        const artifacts = await repository.listArtifacts(jobId);
        expect(artifacts.map((artifact) => artifact.artifactType)).toEqual(
          expect.arrayContaining([
            "runtime_worker.adapter_result",
            "runtime_worker.closeout_capsule_evaluation",
            "execution_platform.closeout_capsule",
          ]),
        );
        expect(JSON.stringify(artifacts)).not.toContain('"rawPromptStored":true');
        expect(JSON.stringify(artifacts)).not.toContain('"rawResponseStored":true');
      }
    });
  });

  it("requires web research citation refs before clean success", async () => {
    await withRepository(async (repository) => {
      await enqueueWorkflowJob({
        repository,
        jobId: "job-web-research-no-citations",
        jobType: webResearchWorkflowContract.jobType,
        workflowId: webResearchWorkflowContract.workflowId,
      });
      const result = await new RuntimeWorkerSupervisor({
        repository,
        workerId: "workflow-worker-supervisor",
        queueName: "workflow-workers",
        adapters: [
          new WebResearchWorkerAdapter({
            runtimeJobs: repository,
            runner: {
              async run({ job }) {
                return completedRun({
                  job,
                  workflowId: webResearchWorkflowContract.workflowId,
                  roleId: "web_researcher",
                  modelRef: "model://fixture-web-researcher",
                  reasonCode: "web_research_worker_fixture_completed",
                  citationRefs: [],
                });
              },
            },
          }),
        ],
      }).runOnce();

      expect(result).toMatchObject({
        status: "needs_review",
        reasonCodes: ["web_research_worker_citation_refs_missing"],
      });
      await expect(repository.getJob("job-web-research-no-citations")).resolves.toMatchObject({
        state: "failed",
      });
    });
  });

  it("rejects wrong workflows and command-shaped payloads without lifecycle mutation", async () => {
    await withRepository(async (repository) => {
      await enqueueWorkflowJob({
        repository,
        jobId: "job-docs-wrong-workflow",
        jobType: docsSkillsWorkflowContract.jobType,
        workflowId: architectureWorkflowContract.workflowId,
      });
      await repository.enqueueJob({
        jobId: "job-docs-command-payload",
        jobType: docsSkillsWorkflowContract.jobType,
        queueName: "workflow-workers",
        maxAttempts: 1,
        payload: {
          workflowId: docsSkillsWorkflowContract.workflowId,
          objectiveSummary: "bounded docs task",
          shellCommand: "echo nope",
        },
      });
      const adapter = new DocsSkillsWorkerAdapter({
        runtimeJobs: repository,
        runner: {
          async run({ job }) {
            return completedRun({
              job,
              workflowId: docsSkillsWorkflowContract.workflowId,
              roleId: "docs_skills_writer",
              modelRef: "model://fixture-docs-skills-writer",
              reasonCode: "docs_skills_worker_fixture_completed",
            });
          },
        },
      });
      const supervisor = new RuntimeWorkerSupervisor({
        repository,
        workerId: "workflow-worker-supervisor",
        queueName: "workflow-workers",
        adapters: [adapter],
      });

      const wrongWorkflow = await supervisor.runOnce({ runtimeJobId: "job-docs-wrong-workflow" });
      const commandPayload = await supervisor.runOnce({ runtimeJobId: "job-docs-command-payload" });

      expect(wrongWorkflow).toMatchObject({
        status: "needs_review",
        reasonCodes: ["docs_skills_worker_wrong_workflow"],
      });
      expect(commandPayload).toMatchObject({
        status: "needs_review",
        reasonCodes: ["bounded_workflow_worker_arbitrary_command_payload_rejected"],
      });
      expect(
        JSON.stringify(await repository.listArtifacts("job-docs-command-payload")),
      ).not.toContain('"rawLogsStored":true');
    });
  });
});
