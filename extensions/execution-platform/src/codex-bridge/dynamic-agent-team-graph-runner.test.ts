import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import { RuntimeToolRegistry } from "../runtime-tool-call/runtime-tool-registry.ts";
import { RuntimeToolTraceRepository } from "../runtime-tool-call/runtime-tool-trace-repository.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { createModelAuthoredCloseoutCapsuleFixture } from "../workers/test-closeout-capsule-fixture.ts";
import { RuntimeWorkGraphRepository } from "../workflows/runtime-work-graph-repository.ts";
import { registerSchedulerRuntimeTools } from "../workflows/scheduler-runtime-tools.ts";
import { registerValidationQaRuntimeTools } from "../workflows/validation-qa-runtime-tools.ts";
import { AgentTeamQueuedRunner } from "./agent-team-queued-runner.ts";
import { AGENT_TEAM_JOB_TYPE } from "./agent-team-runtime-evidence.ts";
import { closeoutCapsuleToLegacyHumanSummary } from "./closeout-capsule.ts";
import { registerCloseoutFinalizationRuntimeTools } from "./closeout-finalization-runtime-tools.ts";
import { registerCloseoutGenerateRuntimeTool } from "./closeout-generate-runtime-tool.ts";
import {
  commitmentPacketReviewShouldTrigger,
  normalizedRepoFileRef,
  roleModelCandidatesFor,
  roleModelFailureIsRetryable,
} from "./dynamic-agent-team-graph-runner.ts";
import type { CloseoutCapsuleReporterInput } from "./model-closeout-capsule-reporter.ts";

describe("dynamic agent-team graph production path", () => {
  it("uses a context-scout-suitable model policy and retries bounded finish-length provider failures", () => {
    const contextScoutCandidates = roleModelCandidatesFor("context_scout");
    expect(contextScoutCandidates[0]).toMatchObject({
      modelId: "qwen/qwen3-coder-next",
      candidateId: "qwen3-coder-next-context-scout",
    });
    expect(contextScoutCandidates[0]?.maxTokens ?? 0).toBeGreaterThanOrEqual(8_000);
    expect(contextScoutCandidates.map((candidate) => candidate.modelId)).toContain(
      "moonshotai/kimi-k2.6",
    );
    expect(
      roleModelFailureIsRetryable({
        status: "failed",
        errorReasonCode: "openrouter_no_content_finish_length",
      } as never),
    ).toBe(true);
  });

  it("normalizes common in-repo context-scout file ref forms without widening outside repo", () => {
    expect(
      normalizedRepoFileRef(
        "/root/services/openclaw-roles/live/extensions/execution-platform/src/workflows/product-spec-planning-plugin.ts",
        "/root/services/openclaw-roles/live",
      ),
    ).toBe("extensions/execution-platform/src/workflows/product-spec-planning-plugin.ts");
    expect(
      normalizedRepoFileRef(
        "repo://extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
        "/root/services/openclaw-roles/live",
      ),
    ).toBe("extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts");
    expect(normalizedRepoFileRef("/etc/passwd", "/root/services/openclaw-roles/live")).toBeNull();
    expect(normalizedRepoFileRef("../outside.ts", "/root/services/openclaw-roles/live")).toBeNull();
  });

  it("does not use shared context handoff aggregate tail as current-node handoff evidence", async () => {
    const source = await readFile(
      path.join(
        process.cwd(),
        "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
      ),
      "utf8",
    );

    expect(source).not.toContain("contextHandoffPacketRefs.at(-1)");
  });

  it("splits context synthesis into GPT core reasoning and Qwen artifact expansion", async () => {
    const source = await readFile(
      path.join(
        process.cwd(),
        "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
      ),
      "utf8",
    );

    expect(source).toContain("context_synthesis_core_model_call");
    expect(source).toContain("context_synthesis_group_expansion_model_call");
    expect(source).toContain("qwen3-coder-next-context-synthesis-expansion");
    expect(source).toContain("context_synthesis_split_core_and_parallel_group_expansion");
  });

  it("uses adaptive commitment packet review instead of mandatory review for every normal pass", async () => {
    const source = await readFile(
      path.join(
        process.cwd(),
        "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
      ),
      "utf8",
    );

    expect(source).toContain("OPENCLAW_COMMITMENT_PACKET_REVIEW_MODE");
    expect(source).toContain("commitment_packet_model_review_skipped");
    expect(source).toContain("commitment_packet_model_review_triggered");
    expect(source).toContain("packet_review_blocking_risk:");
    expect(source).toContain("packet_review_advisory:");
  });

  it("does not trigger expensive packet review for advisory-only packet thinness", () => {
    const ledger = {
      blockingCommitments: [{ commitmentId: "commitment-1" }],
    } as never;
    const packet = {
      authoringSource: "model_authored",
      commitmentId: "commitment-1",
      workerObjective: "A short but usable worker objective for a bounded implementation task.",
      contextScoutObjective: "A short but usable scout objective for finding repo context.",
      implementationObjective: "A short but usable implementation objective for the worker.",
      validationObjective: "Run focused validation for this commitment.",
      acceptanceCriteria: ["Focused behavior is implemented.", "Validation evidence is recorded."],
      remainingWork: ["Patch the bounded workflow surface."],
      requiredContextQuestions: [
        "Which files own the workflow surface?",
        "Which tests cover this surface?",
      ],
      likelyRepoAreas: [],
      stopIfMissing: ["Stop if workflow owner files cannot be found."],
      expectedContextScoutOutput: ["Verified target files and related tests."],
      expectedImplementationOutput: ["Changed files and evidence refs."],
      expectedValidationOutput: ["Focused validation command refs."],
      requiredEvidenceClaimDescriptions: ["Evidence claim mapped to commitment-1."],
    } as never;

    expect(commitmentPacketReviewShouldTrigger({ packets: [packet], ledger })).toMatchObject({
      trigger: false,
      blockingSignals: [],
      advisorySignals: expect.arrayContaining([
        "short_worker_objective:commitment-1",
        "thin_remaining_work:commitment-1",
        "missing_likely_repo_areas:commitment-1",
      ]),
    });
  });

  it("does trigger packet review for blocking packet handoff defects", () => {
    const ledger = {
      blockingCommitments: [{ commitmentId: "commitment-1" }, { commitmentId: "commitment-2" }],
    } as never;
    const packet = {
      authoringSource: "deterministic_fallback",
      commitmentId: "commitment-1",
      workerObjective: "",
      contextScoutObjective: "",
      implementationObjective: "",
      validationObjective: "",
      acceptanceCriteria: [],
      remainingWork: [],
      requiredContextQuestions: [],
      likelyRepoAreas: [],
      stopIfMissing: [],
      expectedContextScoutOutput: [],
      expectedImplementationOutput: [],
      expectedValidationOutput: [],
      requiredEvidenceClaimDescriptions: [],
    } as never;

    const decision = commitmentPacketReviewShouldTrigger({ packets: [packet], ledger });
    expect(decision.trigger).toBe(true);
    expect(decision.blockingSignals).toEqual(
      expect.arrayContaining([
        "missing_packet:commitment-2",
        "not_model_authored:commitment-1",
        "missing_worker_objective:commitment-1",
      ]),
    );
  });

  it("guards context synthesis against duplicate rerun after an active or accepted barrier exists", async () => {
    const source = await readFile(
      path.join(
        process.cwd(),
        "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
      ),
      "utf8",
    );

    expect(source).toContain("contextSynthesisLifecycle");
    expect(source).toContain("context_synthesis_artifact_repair_required_not_rerun");
    expect(source).toContain("activeOrAcceptedContextSynthesisExists");
    expect(source).toContain("scheduler_run_first_node_skipped_already_running");
    expect(source).toContain("scheduler_run_first_node_skipped_already_succeeded");
  });

  it("compiles Qwen commitment packet semantic drafts through the runtime-owned packet envelope", async () => {
    const source = await readFile(
      path.join(
        process.cwd(),
        "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
      ),
      "utf8",
    );

    expect(source).toContain("compileSemanticDraftToPacketOutput");
    expect(source).toContain("Return a packetBrief only");
    expect(source).toContain("Return a packetBriefPatch only");
    expect(source).toContain("The runtime will compile the final CommitmentWorkPacket schema");
  });

  it("keeps Qwen packet authoring on compact semantic inputs while preserving full-prompt rescue", async () => {
    const source = await readFile(
      path.join(
        process.cwd(),
        "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
      ),
      "utf8",
    );

    expect(source).toContain("compactSourcePromptIndexForPacketAuthor");
    expect(source).toContain("compactMissionBriefForPacketAuthor");
    expect(source).toContain("commitment_packet_author_primary_prompt_too_large");
    expect(source).toContain("OPENCLAW_COMMITMENT_PACKET_AUTHOR_PRIMARY_MAX_INPUT_BYTES");
    expect(source).toContain("OPENCLAW_COMMITMENT_PACKET_AUTHOR_MAX_ATTEMPTS");
    expect(source).toContain("retryBeforeRescue");
    expect(source).toContain("packetAuthorContextPack");
    expect(source).toContain("commitment_packet_author_context_pack");
    expect(source).toContain("fullPromptProvidedToPrimaryModel: false");
    expect(source).toContain("packetBriefPatch");
    expect(source).toContain("objectiveResolution.objectiveForModel.slice(0, 120_000)");
    expect(source.indexOf("ownerPromptBriefVolatileText")).toBeLessThan(
      source.indexOf("packetAuthorRescuePayload"),
    );
  });

  it("scopes context synthesis validation commitments to accepted packet commitments", async () => {
    const source = await readFile(
      path.join(
        process.cwd(),
        "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
      ),
      "utf8",
    );

    expect(source).toContain("packetScopedNodeCommitmentIds");
    expect(source).toContain("packetCommitmentIds.has(commitmentId)");
    expect(source.indexOf("packetScopedNodeCommitmentIds")).toBeLessThan(
      source.indexOf("const sourceCommitmentIds"),
    );
    expect(source).toContain("packetScopedNodeCommitmentIds.length > 0");
  });

  it("drives the default production path through scheduler-selected graph decisions", async () => {
    const database = await createExecutionPlatformPgMemTestDatabase();
    const targetRef =
      "extensions/execution-platform/src/codex-bridge/__dynamic-agent-team-graph-runner-tool-worker-fixture.tmp.ts";
    const targetPath = path.join(process.cwd(), targetRef);
    try {
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, "export const schedulerBackedFixture = 'before';\n", "utf8");
      await applyExecutionPlatformMigrations(database.sql);
      const runtimeJobs = new RuntimeJobRepository(database.sql, { claimStrategy: "basic" });
      const workQueue = new WorkQueueRepository(database.sql, runtimeJobs);
      const runtimeWorkGraphs = new RuntimeWorkGraphRepository(database.sql);
      const runtimeToolRegistry = new RuntimeToolRegistry();
      const runtimeToolTraces = new RuntimeToolTraceRepository(database.sql);
      const roleModelCalls: Array<{
        modelCandidateId: string;
        responseFormat: unknown;
        responseFormatMode: unknown;
      }> = [];
      await workQueue.createWorkItem({
        workItemId: "work-item-scheduler-backed-agent-team",
        itemType: "execution_workflow",
        title: "Scheduler-backed agent-team proof",
      });
      await runtimeJobs.enqueueJob({
        jobId: "scheduler-backed-agent-team-job",
        jobType: AGENT_TEAM_JOB_TYPE,
        queueName: "agent-team",
        workItemId: "work-item-scheduler-backed-agent-team",
        payload: {
          workflowId: "agent_team.coding",
          teamRunId: "scheduler-backed-agent-team",
          objectiveSummary:
            "Improve scheduler-backed coding-team readback with a bounded source edit and validation.",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });

      const decisions = [
        {
          decisionId: "decompose-coding-work",
          decisionKind: "add_nodes",
          rationaleForDecision:
            "The complex coding-team mission needs a decomposed role graph before execution.",
          workBreakdownUnits: [
            {
              workUnitId: "context",
              title: "Context handoff",
              objective: "Inspect the runner and plugin surfaces and hand off bounded target refs.",
              commitmentIdsAdvanced: ["scheduler-backed-work"],
              rationale:
                "Context scout narrows the edit surface before any implementation worker runs.",
              expectedOutcome: "Relevant files, edit points, risks, and implementation handoff.",
              targetRefs: [targetRef],
            },
            {
              workUnitId: "implementation",
              title: "Scoped implementation",
              objective: "Apply the smallest scheduler-backed runner edit needed by this fixture.",
              commitmentIdsAdvanced: ["scheduler-backed-work"],
              rationale:
                "A scoped implementation node should make the bounded source change after context.",
              expectedOutcome:
                "Changed-file refs, validation refs, and implementation artifact refs.",
              targetRefs: [targetRef],
            },
            {
              workUnitId: "validation",
              title: "Focused validation",
              objective: "Run the focused scheduler-backed runner validation command.",
              commitmentIdsAdvanced: ["scheduler-backed-work"],
              rationale:
                "Validation must verify implementation evidence before review or closeout.",
              expectedOutcome: "Validation refs and pass/fail state.",
            },
            {
              workUnitId: "review",
              title: "Workflow review",
              objective:
                "Review scheduler-backed runner evidence for task fit and false-success risks.",
              commitmentIdsAdvanced: ["scheduler-backed-work"],
              rationale:
                "Reviewer checks the accepted source and validation evidence before readback.",
              expectedOutcome: "Task-fit and validation-integrity review.",
            },
            {
              workUnitId: "readback",
              title: "Owner readback",
              objective: "Summarize graph nodes, roles, validation, limitations, and next state.",
              commitmentIdsAdvanced: ["scheduler-backed-work"],
              rationale:
                "Readback turns runtime evidence into owner-visible progress before closeout.",
              expectedOutcome: "Owner-readable graph summary, limitations, and ELI5 progress.",
            },
            {
              workUnitId: "closeout",
              title: "Model-authored closeout",
              objective:
                "Generate the final model-authored Closeout Capsule from accepted scheduler evidence.",
              commitmentIdsAdvanced: ["scheduler-backed-work"],
              rationale:
                "Final closeout is required after implementation, validation, review, and readback evidence.",
              expectedOutcome: "Model-authored Closeout Capsule.",
            },
          ],
          capabilitySelectionsForWorkUnits: [
            {
              workUnitId: "context",
              selectedCapabilityId: "context_scout",
              consideredCapabilityIds: ["context_scout", "implementation_microtask"],
              utilityRationale: "A read-only scout reduces implementation uncertainty.",
              costRationale: "Context scout is cheaper than broad Codex implementation.",
              whyThisIsNotDuplicateWork: "No context node has run for this graph yet.",
              stopOrEscalationCondition:
                "Escalate if the scout cannot identify concrete target refs.",
            },
            {
              workUnitId: "implementation",
              selectedCapabilityId: "implementation_microtask",
              consideredCapabilityIds: ["implementation_microtask", "implementation_complex"],
              utilityRationale:
                "A microtask implementation lane is sufficient for this scoped fixture source edit.",
              costRationale:
                "Kimi/file-edit worker is the cheapest sufficiently capable implementation lane.",
              whyCheaperOptionsWereInsufficient: null,
              whyThisIsNotDuplicateWork:
                "No implementation node has produced changed-file evidence yet.",
              selectedModelQualificationProfileId: "openrouter.moonshotai.kimi-k2.6",
              qualificationEvidenceRefs: ["model-profile://kimi/file-edit-worker-loop"],
              stopOrEscalationCondition:
                "Escalate to complex implementation if the scoped edit cannot produce changed-file evidence.",
            },
            {
              workUnitId: "validation",
              selectedCapabilityId: "validation_run",
              consideredCapabilityIds: [
                "validation_run",
                "non_codex_validation_failure_explainer",
                "reviewer",
              ],
              utilityRationale:
                "Validation is required to prove the implementation did not just complete a process.",
              costRationale:
                "The validation executor is cheaper than asking a premium implementer to self-attest tests.",
              whyThisIsNotDuplicateWork: "No validation node has run for this graph yet.",
              stopOrEscalationCondition:
                "Send failed validation evidence back to orchestrator for repair.",
            },
            {
              workUnitId: "review",
              selectedCapabilityId: "reviewer",
              consideredCapabilityIds: ["reviewer", "implementation_complex"],
              utilityRationale: "A reviewer is required by the coding workflow evidence profile.",
              costRationale:
                "Standard reviewer lane is cheaper than another premium implementation pass.",
              whyThisIsNotDuplicateWork: "No reviewer node has run for this graph yet.",
              stopOrEscalationCondition:
                "Escalate if review finds missing implementation or validation evidence.",
            },
            {
              workUnitId: "readback",
              selectedCapabilityId: "observability_readback",
              consideredCapabilityIds: ["observability_readback", "reviewer"],
              utilityRationale:
                "Observability readback makes scheduler progress visible without raw logs.",
              costRationale: "Fast readback lane is sufficient for bounded evidence projection.",
              whyThisIsNotDuplicateWork:
                "No observability readback node has run for this graph yet.",
              stopOrEscalationCondition: "Escalate if readback cannot cite runtime graph refs.",
            },
            {
              workUnitId: "closeout",
              selectedCapabilityId: "coding_closeout",
              consideredCapabilityIds: ["coding_closeout"],
              utilityRationale:
                "Closeout is mandatory for production workflow completion evidence.",
              costRationale:
                "Closeout model call is the only lane allowed to produce the final capsule.",
              whyThisIsNotDuplicateWork: "No final closeout node has run for this graph yet.",
              stopOrEscalationCondition:
                "Needs review if model-authored closeout cannot be produced.",
            },
          ],
          nodeContractDrafts: [
            {
              workUnitId: "context",
              roleRationale: "The implementation worker needs file refs.",
              objective: "Inspect relevant workflow contracts and summarize edit points.",
              expectedOutput: "Context handoff with file refs.",
              successCriteria: ["Names concrete target files."],
              downstreamConsumer: "implementation_engineer",
              targetRefs: [targetRef],
            },
            {
              workUnitId: "implementation",
              roleRationale: "A scoped source edit should follow context.",
              objective: "Apply the smallest scheduler-backed runner edit needed by this fixture.",
              inputRefs: ["runtime-work-graph://node/context_scout-context"],
              expectedOutput: "Changed-file refs and implementation artifact refs.",
              successCriteria: ["Records changed-file evidence."],
              downstreamConsumer: "validation",
              targetRefs: [targetRef],
            },
            {
              workUnitId: "validation",
              roleRationale: "Validation verifies implementation evidence.",
              objective: "Run the focused scheduler-backed runner validation command.",
              inputRefs: ["runtime-work-graph://node/implementation-implementation"],
              expectedOutput: "Validation refs and pass/fail state.",
              successCriteria: ["Validation ref is recorded."],
              downstreamConsumer: "reviewer",
            },
            {
              workUnitId: "review",
              roleRationale: "Reviewer checks task fit and false-success risks.",
              objective: "Review scheduler-backed runner evidence for task fit.",
              inputRefs: ["runtime-work-graph://node/validation-validation"],
              expectedOutput: "Task-fit and validation-integrity review.",
              successCriteria: ["Reviews changed files and validation refs."],
              downstreamConsumer: "observability_scribe",
            },
            {
              workUnitId: "readback",
              roleRationale: "Readback makes runtime progress owner-visible.",
              objective: "Summarize graph nodes, roles, validation, limitations, and next state.",
              inputRefs: ["runtime-work-graph://node/reviewer-review"],
              expectedOutput: "Owner-readable graph summary, limitations, and ELI5 progress.",
              successCriteria: ["Includes runtime graph refs."],
              downstreamConsumer: "closeout",
            },
            {
              workUnitId: "closeout",
              roleRationale: "Final model-authored closeout is mandatory.",
              objective: "Generate a Closeout Capsule from accepted scheduler evidence.",
              inputRefs: ["runtime-work-graph://node/observability_readback-readback"],
              expectedOutput: "Model-authored Closeout Capsule.",
              successCriteria: ["Closeout ref is recorded."],
              downstreamConsumer: "runtime_job_completion",
            },
          ],
          edgeOrParallelismDraft: {
            edges: [
              {
                fromWorkUnitId: "context",
                toWorkUnitId: "implementation",
                edgeKind: "handoff",
                reasonCodes: ["context_to_implementation"],
              },
              {
                fromWorkUnitId: "implementation",
                toWorkUnitId: "validation",
                edgeKind: "depends_on",
                reasonCodes: ["implementation_to_validation"],
              },
              {
                fromWorkUnitId: "validation",
                toWorkUnitId: "review",
                edgeKind: "depends_on",
                reasonCodes: ["validation_to_review"],
              },
              {
                fromWorkUnitId: "review",
                toWorkUnitId: "readback",
                edgeKind: "handoff",
                reasonCodes: ["review_to_readback"],
              },
              {
                fromWorkUnitId: "readback",
                toWorkUnitId: "closeout",
                edgeKind: "handoff",
                reasonCodes: ["readback_to_closeout"],
              },
            ],
          },
          reasonCodes: ["complex_mission_decomposed"],
        },
        {
          decisionId: "run-context",
          decisionKind: "run_node",
          rationaleForDecision: "Run the selected context scout node.",
          runNodeId: "context_scout-context",
          metadata: {
            utilityDecision: {
              decisionId: "run-context:utility",
              consideredCapabilityIds: ["context_scout"],
              selectedCapabilityId: "context_scout",
              selectedNodeKind: "context_scout",
              selectedExecutorKey: "role:context_scout",
              targetCommitmentIds: ["scheduler-backed-work"],
              utilityRationale: "Run the context node before implementation.",
              costRationale: "Context scout is cheap and read-only.",
              whyThisIsNotDuplicateWork:
                "This is the execution of the already-created context node.",
              expectedEvidence: ["context_handoff"],
              expectedDownstreamConsumer: "implementation_engineer",
              stopOrEscalationCondition: "Escalate if context handoff refs are missing.",
            },
          },
          reasonCodes: ["run_context_scout"],
        },
        {
          decisionId: "run-implementation",
          decisionKind: "run_node",
          rationaleForDecision: "Run the selected implementation node.",
          runNodeId: "implementation-implementation",
          metadata: {
            utilityDecision: {
              decisionId: "run-implementation:utility",
              consideredCapabilityIds: ["implementation_microtask", "implementation_complex"],
              selectedCapabilityId: "implementation_microtask",
              selectedNodeKind: "implementation",
              selectedExecutorKey: "kind:implementation",
              targetCommitmentIds: ["scheduler-backed-work"],
              utilityRationale: "Run the scoped implementation node after context.",
              costRationale: "The scoped Kimi lane is cheaper than broad Codex implementation.",
              whyCheaperOptionsWereInsufficient: null,
              whyThisIsNotDuplicateWork:
                "This is the execution of the already-created implementation node.",
              expectedEvidence: ["source_change", "test_validation"],
              selectedModelQualificationProfileId: "openrouter.moonshotai.kimi-k2.6",
              qualificationEvidenceRefs: ["model-profile://kimi/file-edit-worker-loop"],
              expectedDownstreamConsumer: "validation",
              stopOrEscalationCondition:
                "Escalate if changed-file evidence or validation refs are missing.",
            },
          },
          reasonCodes: ["run_implementation"],
        },
        {
          decisionId: "run-validation",
          decisionKind: "run_node",
          rationaleForDecision: "Run validation selected by the orchestrator.",
          runNodeId: "validation-validation",
          metadata: {
            utilityDecision: {
              decisionId: "run-validation:utility",
              consideredCapabilityIds: ["validation_run", "non_codex_validation_failure_explainer"],
              selectedCapabilityId: "validation_run",
              selectedNodeKind: "validation",
              selectedExecutorKey: "kind:validation",
              targetCommitmentIds: ["scheduler-backed-work"],
              utilityRationale: "Run focused validation after implementation evidence.",
              costRationale: "Validation is cheaper than asking implementation to self-attest.",
              whyThisIsNotDuplicateWork:
                "This is the execution of the already-created validation node.",
              expectedEvidence: ["test_validation"],
              expectedDownstreamConsumer: "reviewer",
              stopOrEscalationCondition: "Escalate failed validation to repair.",
            },
          },
          reasonCodes: ["run_validation"],
        },
        {
          decisionId: "run-review",
          decisionKind: "run_node",
          rationaleForDecision: "Run reviewer selected by orchestrator.",
          runNodeId: "reviewer-review",
          metadata: {
            utilityDecision: {
              decisionId: "run-review:utility",
              consideredCapabilityIds: ["reviewer"],
              selectedCapabilityId: "reviewer",
              selectedNodeKind: "reviewer",
              selectedExecutorKey: "kind:reviewer",
              targetCommitmentIds: ["scheduler-backed-work"],
              utilityRationale: "Run model-authored review before readback and closeout.",
              costRationale: "Standard reviewer lane is sufficient for bounded review.",
              whyThisIsNotDuplicateWork:
                "This is the execution of the already-created reviewer node.",
              expectedEvidence: ["review"],
              expectedDownstreamConsumer: "observability_scribe",
              stopOrEscalationCondition: "Escalate if review rejects evidence.",
            },
          },
          reasonCodes: ["run_review"],
        },
        {
          decisionId: "run-readback",
          decisionKind: "run_node",
          rationaleForDecision: "Run observability readback.",
          runNodeId: "observability_readback-readback",
          metadata: {
            utilityDecision: {
              decisionId: "run-readback:utility",
              consideredCapabilityIds: ["observability_readback"],
              selectedCapabilityId: "observability_readback",
              selectedNodeKind: "observability_readback",
              selectedExecutorKey: "kind:observability_readback",
              targetCommitmentIds: ["scheduler-backed-work"],
              utilityRationale: "Run readback to surface graph state before closeout.",
              costRationale: "Fast observability lane is sufficient for bounded readback.",
              whyThisIsNotDuplicateWork:
                "This is the execution of the already-created readback node.",
              expectedEvidence: ["readback"],
              expectedDownstreamConsumer: "closeout",
              stopOrEscalationCondition: "Escalate if runtime graph refs are missing.",
            },
          },
          reasonCodes: ["run_readback"],
        },
        {
          decisionId: "run-closeout",
          decisionKind: "create_closeout",
          rationaleForDecision: "Run final closeout after accepted evidence.",
          runNodeId: "closeout-closeout",
          metadata: {
            utilityDecision: {
              decisionId: "run-closeout:utility",
              consideredCapabilityIds: ["coding_closeout"],
              selectedCapabilityId: "coding_closeout",
              selectedNodeKind: "closeout",
              selectedExecutorKey: "kind:closeout",
              targetCommitmentIds: ["scheduler-backed-work"],
              utilityRationale: "Run the model-authored closeout node for final evidence.",
              costRationale: "Closeout is required and has no cheaper production substitute.",
              whyThisIsNotDuplicateWork:
                "This is the execution of the already-created closeout node.",
              expectedEvidence: ["closeout"],
              expectedDownstreamConsumer: "runtime_job_completion",
              stopOrEscalationCondition:
                "Needs review if model-authored Closeout Capsule is unavailable.",
            },
          },
          reasonCodes: ["run_closeout"],
        },
      ];

      const closeoutReporter = {
        async createCapsule(input: CloseoutCapsuleReporterInput) {
          const capsule = createModelAuthoredCloseoutCapsuleFixture({
            runtimeJobId: input.factualRefs.runtimeJobId,
            teamRunId: input.factualRefs.teamRunId ?? null,
            workflowId: input.factualRefs.workflowId ?? "agent_team.coding",
            fileRefs: input.factualRefs.fileRefs,
            artifactRefs: input.factualRefs.artifactRefs,
            validationRefs: input.factualRefs.validationRefs,
          });
          return {
            source: "model" as const,
            capsule,
            legacyHumanSummary: closeoutCapsuleToLegacyHumanSummary(capsule),
            reasonCodes: ["fixture_model_closeout_created"],
            rawPromptStored: false as const,
            rawResponseStored: false as const,
            rawProviderLogStored: false as const,
          };
        },
      };
      registerSchedulerRuntimeTools({ registry: runtimeToolRegistry, includeWorkerInvoke: true });
      registerValidationQaRuntimeTools({ registry: runtimeToolRegistry });
      registerCloseoutFinalizationRuntimeTools({ registry: runtimeToolRegistry });
      registerCloseoutGenerateRuntimeTool({
        registry: runtimeToolRegistry,
        reporter: closeoutReporter,
      });
      const runtimeToolKernel = new RuntimeToolKernel({
        registry: runtimeToolRegistry,
        traces: runtimeToolTraces,
      });

      const result = await new AgentTeamQueuedRunner({
        runtimeJobs,
        runtimeWorkGraphs,
        workQueue,
        runtimeToolKernel,
        workerId: "scheduler-backed-agent-team-worker",
        queueName: "agent-team",
        dynamicOrchestratorModelClient: {
          async runJson(input) {
            const systemPrompt = typeof input.systemPrompt === "string" ? input.systemPrompt : "";
            if (systemPrompt.includes("context synthesis global reasoner")) {
              const payload =
                input.userPayload &&
                typeof input.userPayload === "object" &&
                !Array.isArray(input.userPayload)
                  ? (input.userPayload as Record<string, unknown>)
                  : {};
              const sourceContextHandoffRefs = Array.isArray(payload.sourceContextHandoffRefs)
                ? payload.sourceContextHandoffRefs.filter(
                    (ref): ref is string => typeof ref === "string" && ref.length > 0,
                  )
                : [];
              return {
                modelRunRef:
                  "codex-app-server://openai-codex/gpt-5.5/context-synthesis-core-fixture",
                responseText: JSON.stringify({
                  synthesisId: "scheduler-backed-context-synthesis",
                  implementationReadiness: "ready",
                  globalDependencySummary:
                    "Context scout handoff is sufficient for a single scoped scheduler-backed implementation group.",
                  independentWorkThemes: ["scheduler-backed runtime evidence edit"],
                  integrationCriticalPath: ["implementation", "validation", "review", "closeout"],
                  premiumWorkerMustOwn: [],
                  cheaperWorkerSuitableFor: ["scoped implementation and validation fixture work"],
                  groupPlanningGuidance: [
                    {
                      groupId: "scheduler-backed-implementation-group",
                      groupIntent: "Implement the bounded scheduler-backed fixture edit.",
                      commitmentIds: ["scheduler-backed-work"],
                      inputHandoffRefs: sourceContextHandoffRefs,
                      targetRefs: [targetRef],
                      dependencyNotes: ["Run after context scout handoff is accepted."],
                      workerFitRationale:
                        "The work is a bounded single-file fixture edit suitable for scoped implementation.",
                    },
                  ],
                  parallelismPlan: "Single implementation group; no parallel split is needed.",
                  validationStrategy: [
                    "pnpm test:file extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts",
                  ],
                  reviewStrategy: ["Review scheduler-backed evidence and closeout refs."],
                  risks: ["Fixture context is narrower than full Product/Spec proof."],
                  limitations: [],
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                }),
                responseHash: "sha256:context-synthesis-core-fixture",
                latencyMs: 10,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            const decision = decisions.shift();
            return {
              modelRunRef: `codex-app-server://openai-codex/gpt-5.5/${decision?.decisionId ?? "missing"}`,
              responseText: JSON.stringify(
                decision ?? {
                  decisionId: "unexpected-extra-call",
                  decisionKind: "mark_needs_review",
                  rationaleForDecision: "No more fixture decisions.",
                  reasonCodes: ["fixture_decisions_exhausted"],
                },
              ),
              responseHash: `sha256:${decision?.decisionId ?? "missing"}`,
              latencyMs: 10,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        missionContractModelClient: {
          async runJson(input) {
            const payload =
              input.userPayload &&
              typeof input.userPayload === "object" &&
              !Array.isArray(input.userPayload)
                ? (input.userPayload as Record<string, unknown>)
                : {};
            const missionLedger =
              payload.missionLedger && typeof payload.missionLedger === "object"
                ? (payload.missionLedger as Record<string, unknown>)
                : null;
            const candidateEvidenceRefs = Array.isArray(payload.candidateEvidenceRefs)
              ? payload.candidateEvidenceRefs.filter(
                  (ref): ref is string => typeof ref === "string" && ref.length > 0,
                )
              : [];
            return {
              modelRunRef: "codex-app-server://openai-codex/gpt-5.5/mission-contract-fixture",
              responseText: JSON.stringify(
                missionLedger
                  ? {
                      artifactKind: "mission_commitment_evaluation",
                      schemaVersion: "execution-platform.mission-contract-ledger.v1",
                      evaluationId: "fixture-evaluation",
                      missionId: "scheduler-backed-agent-team-mission-contract",
                      commitmentUpdates: [
                        {
                          commitmentId: "scheduler-backed-work",
                          status: "satisfied",
                          acceptedEvidenceRefs: candidateEvidenceRefs.slice(0, 4),
                          rejectedEvidenceRefs: [],
                          rationale:
                            "The fixture accepted bounded scheduler graph evidence for this production-path test.",
                          remainingWork: [],
                        },
                      ],
                      revisionProposals: [],
                      rawPromptStored: false,
                      rawResponseStored: false,
                      rawProviderLogStored: false,
                      workQueueLifecycleMutated: false,
                    }
                  : {
                      missionId: "scheduler-backed-agent-team-mission-contract",
                      ownerObjectiveSummary:
                        "Improve scheduler-backed coding-team readback with a bounded source edit and validation.",
                      blockingCommitments: [
                        {
                          commitmentId: "scheduler-backed-work",
                          commitmentText:
                            "Run the scheduler-backed coding-team workflow and produce bounded implementation, validation, review, and closeout evidence.",
                          whyItMatters: "The owner needs production-path graph execution evidence.",
                          expectedEvidenceDescription:
                            "Runtime graph node refs, changed-file refs, validation refs, review refs, and closeout refs.",
                          status: "pending",
                          blocking: true,
                        },
                      ],
                      nonBlockingCommitments: [],
                      explicitNonGoals: [],
                      safetyConstraints: [],
                      prohibitedDirectiveCandidates: [],
                      authorityBoundary: {
                        requestedAuthority: null,
                        maximumAuthority: "workflow_default",
                        requiresApproval: false,
                        approvalRefs: [],
                        authorityRefs: [],
                        rawPromptStored: false,
                        rawResponseStored: false,
                      },
                      storagePolicy: {
                        rawPromptStorageAllowed: false,
                        rawResponseStorageAllowed: false,
                        rawTranscriptStorageAllowed: false,
                        rawProviderLogStorageAllowed: false,
                        rawToolLogStorageAllowed: false,
                        rawDbRowStorageAllowed: false,
                        secretsStorageAllowed: false,
                        boundedRefsOnly: true,
                      },
                      lifecycleBoundary: {
                        workQueueLifecycleMutationAllowed: false,
                        authorityGrantAllowed: false,
                        deployAllowed: false,
                        outboundSendAllowed: false,
                        modelPromotionAllowed: false,
                        runtimeJobLifecycleOwner: "runtime_jobs",
                      },
                      missionGate: "clear_to_execute",
                      missionGateRationale: "The primary mission is local repo work.",
                      rawPromptStored: false,
                      rawResponseStored: false,
                      rawProviderLogStored: false,
                      workQueueLifecycleMutated: false,
                    },
              ),
              responseHash: "sha256:mission-contract-fixture",
              latencyMs: 10,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        roleModelClient: {
          async callRole(input) {
            roleModelCalls.push({
              modelCandidateId: input.modelCandidateId,
              responseFormat: input.responseFormat ?? null,
              responseFormatMode: input.requestProfileOverride?.responseFormatMode ?? null,
            });
            if (input.modelCandidateId === "kimi-2-6-commitment-packet-author") {
              return {
                status: "succeeded" as const,
                responseText: JSON.stringify({
                  commitmentWorkPackets: [
                    {
                      commitmentMeaning:
                        "The scheduler-backed coding-team workflow must produce implementation, validation, review, and closeout evidence.",
                      ownerIntentSummary:
                        "Prove the scheduler-backed coding team can execute bounded repo work without falling back to fixture success.",
                      whyItMatters:
                        "The owner needs worker-ready handoffs before runtime graph execution can be trusted.",
                      workerObjective:
                        "Implement the bounded scheduler-backed readback edit and preserve runtime graph evidence.",
                      contextScoutObjective:
                        "Find the runner and readback code paths that control scheduler-backed coding-team execution.",
                      implementationObjective:
                        "Make the scoped source edit in the scheduler-backed runner/readback path only.",
                      validationObjective:
                        "Run the focused dynamic-agent-team graph runner test file and report bounded validation refs.",
                      reviewObjective:
                        "Confirm implementation, validation, review, and closeout evidence map to the scheduler-backed commitment.",
                      expectedEvidenceDescriptions: [
                        "Runtime graph node refs, changed-file refs, validation refs, review refs, and closeout refs.",
                      ],
                      expectedEvidenceKinds: [
                        "runtime graph evidence",
                        "source edit evidence",
                        "validation evidence",
                        "review evidence",
                      ],
                      acceptanceCriteria: [
                        "Scheduler-backed node execution produces bounded artifacts.",
                        "Focused validation passes.",
                      ],
                      remainingWork: ["Run scheduler-backed implementation and validation."],
                      relevantConstraints: ["Do not mutate Work Queue lifecycle directly."],
                      explicitNonGoals: ["Do not deploy or send outbound messages."],
                      likelyRepoAreas: [targetRef],
                      requiredContextQuestions: [
                        "Which runner functions create and execute scheduler-backed nodes?",
                        "Which tests validate the scheduler-backed dynamic path?",
                      ],
                      allowedContextRequestHints: [
                        "Request bounded source prompt excerpts only when the runner objective is ambiguous.",
                      ],
                      expectedContextScoutOutput: [
                        "Verified runner file refs and recommended edit points.",
                      ],
                      expectedImplementationOutput: [
                        "Changed-file refs and a concise implementation evidence summary.",
                      ],
                      expectedValidationOutput: ["Focused validation ref and pass/fail summary."],
                      expectedReviewReadbackOutput: [
                        "Review evidence mapped to the scheduler-backed-work commitment.",
                      ],
                      requiredEvidenceClaimDescriptions: [
                        "Claim that runtime graph and validation evidence satisfy scheduler-backed-work.",
                      ],
                      stopIfMissing: ["Stop if no verified runner file refs are found."],
                      uncertaintiesAndRisks: ["Fixture execution is narrower than full UX proof."],
                      rawPromptStored: false,
                      rawResponseStored: false,
                      rawProviderLogStored: false,
                    },
                  ],
                }),
                responseHash: "sha256:kimi-commitment-packet-author",
                usage: null,
              };
            }
            if (input.modelCandidateId === "kimi-2-6-tool-selection") {
              return {
                status: "succeeded" as const,
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: "search-runner",
                      toolId: "worker.repo.search",
                      reason: "Find scheduler-backed runner symbols before editing.",
                      input: { query: "runSchedulerBacked" },
                    },
                    {
                      callId: "read-runner",
                      toolId: "worker.repo.read_files",
                      reason: "Read the bounded target file snapshot.",
                      input: {
                        fileRefs: [targetRef],
                      },
                    },
                    {
                      callId: "plan-edit",
                      toolId: "worker.edit.plan",
                      reason: "Plan the scoped fixture edit.",
                      input: {
                        editPlanSteps: [
                          {
                            stepId: "fixture-edit",
                            objective: "Update the scheduler-backed fixture marker.",
                            targetFileRefs: [targetRef],
                            validationExpectation: "Focused validation ref is recorded.",
                            commitmentIdsAdvanced: ["scheduler-backed-work"],
                          },
                        ],
                      },
                    },
                    {
                      callId: "apply-edit",
                      toolId: "worker.edit.apply_patch",
                      reason: "Apply the runtime-owned fixture source edit.",
                      input: {
                        fileEdits: [
                          {
                            path: targetRef,
                            operation: "replace_text",
                            oldText: "schedulerBackedFixture = 'before'",
                            newText: "schedulerBackedFixture = 'after'",
                            rationale: "Apply the scoped scheduler-backed fixture edit.",
                          },
                        ],
                      },
                    },
                    {
                      callId: "run-validation",
                      toolId: "worker.validation.run",
                      reason: "Record focused validation through the runtime validation runner.",
                      input: {
                        commandRefs: [
                          "pnpm test:file extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts",
                        ],
                      },
                    },
                    {
                      callId: "claim-evidence",
                      toolId: "worker.evidence.claim",
                      reason: "Claim commitment-linked implementation evidence.",
                      input: {
                        evidenceClaims: [
                          {
                            commitmentId: "scheduler-backed-work",
                            evidenceRef:
                              "runtime-job://scheduler-backed-agent-team-job/kimi/tool-worker-result",
                            claimSummary:
                              "Kimi tool worker updated the scheduler-backed fixture marker and recorded validation.",
                            changedFileRefs: [targetRef],
                            validationRefs: [
                              "validation://dynamic-agent-team-graph-runner/fixture-pass",
                            ],
                            limitations: [],
                            confidence: "high",
                            rawPromptStored: false,
                            rawResponseStored: false,
                          },
                        ],
                      },
                    },
                    {
                      callId: "inspect-tests",
                      toolId: "worker.repo.inspect_tests",
                      reason: "Confirm focused validation refs.",
                      input: {},
                    },
                  ],
                }),
                responseHash: "sha256:kimi-tool-selection",
                usage: null,
              };
            }
            if (input.modelCandidateId === "qwen3-coder-next-context-synthesis-expansion") {
              return {
                status: "succeeded" as const,
                responseText: JSON.stringify({
                  groupId: "scheduler-backed-implementation-group",
                  title: "Scheduler-backed implementation fixture",
                  objective:
                    "Make the bounded scheduler-backed source edit using the accepted context handoff.",
                  commitmentIds: ["scheduler-backed-work"],
                  inputHandoffRefs: [
                    "runtime-job://scheduler-backed-agent-team-job/context-handoff/g-60e644f507-context_scout-context:3c6d3293dfd8",
                  ],
                  targetRefs: [targetRef],
                  fileOwnershipRefs: [targetRef],
                  recommendedCapabilityIds: ["implementation_microtask"],
                  cheaperWorkerSuitability:
                    "The work is a scoped single-file edit with explicit validation.",
                  codexEscalationRationale: null,
                  downstreamConsumer: "validation_matrix",
                  successCriteria: [
                    "Changed-file evidence is recorded.",
                    "Focused validation ref is recorded.",
                  ],
                  expectedOutput:
                    "Changed-file refs and commitment-linked implementation evidence.",
                  evidenceClaimExpectations: [
                    "Claim source edit and validation evidence for scheduler-backed-work.",
                  ],
                  validationNeeds: [
                    "pnpm test:file extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts",
                  ],
                  reviewNeeds: ["Confirm evidence maps to scheduler-backed-work."],
                  stopIfMissing: ["Stop if target runner file is unavailable."],
                  riskRefs: ["fixture-narrowness"],
                  integrationRequirements: ["Validation before review and closeout."],
                  dependsOnGroupIds: [],
                  parallelizableWithGroupIds: [],
                  workerFitRationale:
                    "A scoped implementation lane is sufficient before validation/review.",
                  commitmentCoverage: [
                    {
                      commitmentId: "scheduler-backed-work",
                      covered: true,
                      contextHandoffRefs: [
                        "runtime-job://scheduler-backed-agent-team-job/context-handoff/g-60e644f507-context_scout-context:3c6d3293dfd8",
                      ],
                      limitationSummary: null,
                    },
                  ],
                  fileOwnershipProposal: {
                    targetRefs: [targetRef],
                    ownershipRationale: "The fixture edit is localized to this runner test target.",
                  },
                  contextHandoffRefMap: [
                    {
                      contextHandoffRef:
                        "runtime-job://scheduler-backed-agent-team-job/context-handoff/g-60e644f507-context_scout-context:3c6d3293dfd8",
                      commitmentIds: ["scheduler-backed-work"],
                    },
                  ],
                  validationStrategy: [
                    "pnpm test:file extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts",
                  ],
                  reviewLanes: ["Scheduler-backed graph evidence review."],
                  implementationReadiness: "ready",
                  limitations: [],
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                }),
                responseHash: "sha256:context-synthesis-expansion-fixture",
                usage: null,
              };
            }
            return {
              status: "succeeded" as const,
              responseText: JSON.stringify({
                whatIActuallyDid: `${input.roleId} executed the scheduler-selected node.`,
                evidenceRefs: [`runtime-job://scheduler-backed-agent-team-job/${input.roleId}`],
                filesOrArtifactsTouched: [targetRef],
                validationIPerformed:
                  "pnpm test:file extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts",
                whatWorked: ["scheduler-selected node executed"],
                whatWasWeakOrFailed: ["fixture model"],
                recommendedNextStep: "run full live UX proof next",
                confidence: "high",
                limitations: ["fixture model"],
                relevantFiles: [
                  {
                    path: targetRef,
                    whyRelevant: "runner wiring target",
                    keySymbolsOrFunctions: ["DynamicAgentTeamGraphRunner"],
                  },
                ],
                existingPatterns: [
                  "Scheduler-backed runner wiring records role execution evidence before downstream implementation.",
                ],
                risks: [
                  "A thin context handoff can leave the implementation worker guessing which runner path owns the edit.",
                ],
                recommendedEditPoints: [
                  {
                    path: targetRef,
                    symbolOrRegion: "runSchedulerBacked",
                    reason: "scheduler-backed production path",
                  },
                  {
                    path: targetRef,
                    symbolOrRegion: "context_scout handoff handling",
                    reason: "context handoff evidence must satisfy implementation gating.",
                  },
                ],
                validationSuggestions: [
                  "pnpm test:file extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts",
                  "Verify context scout sufficiency is accepted before implementation begins.",
                ],
                handoffSummaryForImplementation:
                  "Use the scheduler-backed runner path and validate focused tests. The implementation worker should inspect the DynamicAgentTeamGraphRunner context scout execution, preserve runtime graph evidence refs, and make the bounded edit only after verified context handoff evidence maps to the scheduler-backed-work commitment.",
              }),
              responseHash: `sha256:${input.roleId}`,
              usage: null,
            };
          },
        },
        dynamicValidationRunner: {
          async run(commandRef) {
            return {
              validationRef: `runtime-job://scheduler-backed-agent-team-job/validation/${commandRef.length}`,
              status: "passed",
              summary: "Fixture validation passed.",
            };
          },
        },
        implementationBridge: {
          async run() {
            return {
              status: "completed" as const,
              transportKind: "codex_parity_runtime_adapter" as const,
              modelRef: "openai-codex/gpt-5.3-codex",
              providerPath: "codex_parity_runtime_adapter",
              modelRunRef: "codex-parity://scheduler-backed-implementation",
              responseHash: "sha256:scheduler-backed-implementation",
              startedAt: "2026-05-14T00:00:00.000Z",
              completedAt: "2026-05-14T00:00:01.000Z",
              latencyMs: 1_000,
              summary: "Implementation bridge made the scheduler-selected bounded edit.",
              changedFileRefs: [targetRef],
              validationRefs: [
                "pnpm test:file extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts",
              ],
              artifactRefs: ["runtime-job://scheduler-backed-agent-team-job/codex-parity/result"],
              reasonCodes: ["codex_parity_runtime_adapter_completed"],
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              workQueueLifecycleMutated: false,
            };
          },
        },
        closeoutReporter,
      }).runOnce();

      expect(result.failure, JSON.stringify(result, null, 2)).toBeNull();
      expect(result.completed, JSON.stringify(result, null, 2)).toBe(true);
      expect(result.evidence?.modelRoutingEvidence).toMatchObject({
        graphId: "scheduler-backed-agent-team-runtime-work-graph",
        schedulerBackedDynamicRunner: true,
        staticSingleJobSequenceUsed: false,
      });
      const artifacts = await runtimeJobs.listArtifacts("scheduler-backed-agent-team-job");
      expect(artifacts.map((artifact) => artifact.artifactType)).toEqual(
        expect.arrayContaining([
          "execution.workflow_plugin_resolution",
          "execution.generic_orchestration_runtime_result",
          "execution.runtime_workflow_graph_engine_readiness",
          "execution.workflow_completion_review_gate",
        ]),
      );
      const genericRuntimeResult = artifacts.find(
        (artifact) => artifact.artifactType === "execution.generic_orchestration_runtime_result",
      );
      expect(genericRuntimeResult?.metadata).toMatchObject({
        engineId: "generic-orchestration-runtime-engine.v1",
        workflowId: "agent_team.coding",
        status: "succeeded",
        graphId: "scheduler-backed-agent-team-runtime-work-graph",
      });
      const pluginResolution = artifacts.find(
        (artifact) => artifact.artifactType === "execution.workflow_plugin_resolution",
      );
      expect(pluginResolution?.metadata).toMatchObject({
        pluginId: "workflow-plugin.agent_team.coding.v1",
        productionEnabled: true,
        degradedCloseoutSuccessAllowed: false,
      });
      const snapshot = await runtimeWorkGraphs.readGraphSnapshot(
        "scheduler-backed-agent-team-runtime-work-graph",
      );
      expect(snapshot?.nodes.map((node) => node.nodeId)).toEqual(
        expect.arrayContaining([
          expect.stringContaining("context_scout-context"),
          expect.stringContaining("implementation-implementation"),
          expect.stringContaining("validation-validation"),
          expect.stringContaining("reviewer-review"),
          expect.stringContaining("observability_readback-readback"),
          expect.stringContaining("closeout-closeout"),
        ]),
      );
      expect(snapshot?.checkpoints.map((checkpoint) => checkpoint.checkpointKind)).toEqual(
        expect.arrayContaining([
          "orchestrator_decision_add_nodes",
          "scheduler_final_closeout_recorded",
          "scheduler_terminal_succeeded",
          "boundary_replay_context_scout",
          "boundary_replay_worker_execution",
          "boundary_replay_validation_repair",
          "boundary_replay_closeout_finalization",
        ]),
      );
      expect(result.evidence?.roleExecutionEvidence?.map((role) => role.roleId)).toEqual(
        expect.arrayContaining([
          "context_scout",
          "implementation_engineer",
          "reviewer",
          "observability_scribe",
        ]),
      );
      const progressEvents = await runtimeJobs.listRecentEvents(
        "scheduler-backed-agent-team-job",
        500,
      );
      expect(
        roleModelCalls
          .filter((call) => call.modelCandidateId === "kimi-2-6-commitment-packet-author")
          .every(
            (call) => call.responseFormat === null && call.responseFormatMode === "prompt_only",
          ),
      ).toBe(true);
      const validationProgress = progressEvents
        .filter((event) => event.eventType === "agent_team.scheduler_progress")
        .map((event) => event.data as Record<string, unknown>)
        .find((data) => data.stage === "validation_node" && data.validationState === "passed");
      expect(validationProgress).toMatchObject({
        stage: "validation_node",
        validationState: "passed",
        rawCommandLogsStored: false,
      });
      expect(validationProgress?.validationQaToolInvocationRefs).toEqual(
        expect.arrayContaining([expect.stringMatching(/^runtime-tool:\/\//u)]),
      );
      expect(validationProgress?.validationQaEvidencePacketRefs).toEqual(
        expect.arrayContaining([
          expect.stringContaining(
            "runtime-job://scheduler-backed-agent-team-job/runtime-work-graph/validation-qa/",
          ),
        ]),
      );
      const finalizationProgress = progressEvents
        .filter((event) => event.eventType === "agent_team.scheduler_progress")
        .map((event) => event.data as Record<string, unknown>)
        .find((data) => data.stage === "closeout_finalization");
      expect(finalizationProgress).toMatchObject({
        stage: "closeout_finalization",
        closeoutFinalizationState: "accepted",
        rawPromptStored: false,
        rawResponseStored: false,
      });
      expect(finalizationProgress?.closeoutFinalizationEvidencePacketRefs).toEqual(
        expect.arrayContaining([
          "runtime-job://scheduler-backed-agent-team-job/execution/closeout-finalization/evidence-packet/agent_team.coding",
        ]),
      );
      expect(finalizationProgress?.closeoutFinalizationAcceptRefs).toEqual(
        expect.arrayContaining([expect.stringMatching(/^runtime-tool:\/\//u)]),
      );
      expect(result.completed).toBe(true);
    } finally {
      await rm(targetPath, { force: true });
      await database.close();
    }
  });

  it("rejects retired legacy fixed-runner flags instead of entering compatibility execution", async () => {
    const database = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(database.sql);
      const runtimeJobs = new RuntimeJobRepository(database.sql, { claimStrategy: "basic" });
      const runtimeWorkGraphs = new RuntimeWorkGraphRepository(database.sql);
      await runtimeJobs.enqueueJob({
        jobId: "dynamic-agent-team-retired-legacy-runner-job",
        jobType: AGENT_TEAM_JOB_TYPE,
        queueName: "agent-team",
        payload: {
          workflowId: "agent_team.coding",
          objectiveSummary: "Attempt to force the retired fixed runner.",
          legacyFixedDynamicRunner: true,
          proofOnlyLegacyFixedDynamicRunner: true,
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });

      const result = await new AgentTeamQueuedRunner({
        runtimeJobs,
        runtimeWorkGraphs,
        workerId: "dynamic-agent-team-retired-legacy-runner-worker",
        queueName: "agent-team",
      }).runOnce();

      expect(result.completed).toBe(false);
      expect(result.failure).toMatchObject({
        stage: "agent_team_run_once",
        message: "legacy_fixed_dynamic_runner_retired",
      });
      const events = await runtimeJobs.listEvents("dynamic-agent-team-retired-legacy-runner-job");
      expect(events.map((event) => event.eventType)).toContain(
        "agent_team.legacy_fixed_runner_rejected",
      );
    } finally {
      await database.close();
    }
  });
});
