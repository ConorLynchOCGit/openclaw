import type { OpenClawPluginApi, OpenClawPluginToolFactory } from "../../api.js";
import { resolveMemoryMiddlewareCandidateIngressCapabilities } from "../config.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import { createCandidateGetTool } from "./candidate-get.js";
import { createCandidateListTool } from "./candidate-list.js";
import { createCandidatePromoteMemoryTool } from "./candidate-promote-memory.js";
import { createCandidatePromotePlanTool } from "./candidate-promote-plan.js";
import { createCandidatePromoteProcedureTool } from "./candidate-promote-procedure.js";
import { createCandidateReviewPromptTool } from "./candidate-review-prompt.js";
import { createCandidateReviewTool } from "./candidate-review.js";
import { createCandidateSubmitTool } from "./candidate-submit.js";
import { createMemoryBackgroundJobEnqueueTool } from "./memory-background-job-enqueue.js";
import { createMemoryBackgroundJobGetTool } from "./memory-background-job-get.js";
import { createMemoryBackgroundJobListTool } from "./memory-background-job-list.js";
import { createMemoryBackgroundJobRunNextTool } from "./memory-background-job-run-next.js";
import { createMemoryCompactionPlanTool } from "./memory-compaction-plan.js";
import { createMemoryConsolidationExecuteTool } from "./memory-consolidation-execute.js";
import { createMemoryConsolidationPlanTool } from "./memory-consolidation-plan.js";
import { createMemoryDriftCheckExecuteTool } from "./memory-drift-check-execute.js";
import { createMemoryFullCompactionFallbackExecuteTool } from "./memory-full-compaction-fallback-execute.js";
import { createMemoryLearnedGuidancePlanTool } from "./memory-learned-guidance-plan.js";
import { createMemoryObjectGetTool } from "./memory-object-get.js";
import { createMemoryObjectListTool } from "./memory-object-list.js";
import { createMemoryObjectSearchBasicTool } from "./memory-object-search-basic.js";
import { createMemoryObjectSearchHybridTool } from "./memory-object-search-hybrid.js";
import { createMemoryObjectSearchSemanticTool } from "./memory-object-search-semantic.js";
import { createMemoryProactiveExecuteTool } from "./memory-proactive-execute.js";
import { createMemoryProactivePlanTool } from "./memory-proactive-plan.js";
import { createMemorySelfImprovingCaptureCandidateTool } from "./memory-self-improving-capture-candidate.js";
import { createMemorySessionCompactExecuteTool } from "./memory-session-compact-execute.js";
import { createMemorySessionGetTool } from "./memory-session-get.js";
import { createMemorySessionUpdateTool } from "./memory-session-update.js";
import { createMemoryToolResultGetTool } from "./memory-tool-result-get.js";
import { createMemoryToolResultMicrocompactExecuteTool } from "./memory-tool-result-microcompact-execute.js";
import { createMemoryToolResultMicrocompactPlanTool } from "./memory-tool-result-microcompact-plan.js";
import { createMemoryToolResultPersistTool } from "./memory-tool-result-persist.js";
import { createProcedureValidatePlanTool } from "./procedure-validate-plan.js";
import { createProcedureValidateTool } from "./procedure-validate.js";
import { createSkillCandidateApprovalPlanTool } from "./skill-candidate-approval-plan.js";
import { createSkillCandidateApproveTool } from "./skill-candidate-approve.js";
import { createSkillCandidateCreateTool } from "./skill-candidate-create.js";
import { createSkillCandidateInstallHandoffTool } from "./skill-candidate-install-handoff.js";
import { createSkillCandidateInstallRecordCreateTool } from "./skill-candidate-install-record-create.js";
import { createSkillCandidatePlanTool } from "./skill-candidate-plan.js";
import { createSkillCandidateProcurementPlanTool } from "./skill-candidate-procurement-plan.js";
import { createSkillCandidateProcurementRecordCreateTool } from "./skill-candidate-procurement-record-create.js";
import { createSkillCandidateSkillVetterHandoffTool } from "./skill-candidate-skill-vetter-handoff.js";
import { createSkillCandidateVettingResultRecordTool } from "./skill-candidate-vetting-result-record.js";

function isLearnedGuidanceAdvisoryToolEnabled(
  runtime: Pick<MemoryMiddlewareRuntime, "config">,
): boolean {
  const config = runtime.config.learnedGuidanceAdvisoryPlanning;
  return (
    config?.mode === "inline-only" &&
    (config.rolloutTarget === "off-production" || config.rolloutTarget === "production-canary")
  );
}

function isSelfImprovingCaptureToolEnabled(
  runtime: Pick<MemoryMiddlewareRuntime, "config">,
): boolean {
  const config = runtime.config.selfImprovingCapture;
  return (
    config?.mode === "candidate-only" &&
    (config.rolloutTarget === "off-production" || config.rolloutTarget === "production-canary")
  );
}

export function registerMemoryMiddlewareTools(
  api: OpenClawPluginApi,
  runtime: MemoryMiddlewareRuntime,
): void {
  const automation = resolveMemoryMiddlewareCandidateIngressCapabilities(
    runtime.config.candidateIngress.mode,
  );
  const reviewToolsEnabled = automation.review;
  const promotionPlanningToolsEnabled =
    automation.memoryPromotion || automation.procedureDraftPromotion;

  api.registerTool(
    ((ctx) =>
      createCandidateSubmitTool({
        runtime,
        context: ctx,
      })) as OpenClawPluginToolFactory,
    { name: "memory_candidate_submit" },
  );
  if (isSelfImprovingCaptureToolEnabled(runtime)) {
    api.registerTool(
      ((ctx) =>
        createMemorySelfImprovingCaptureCandidateTool({
          runtime,
          context: ctx,
        })) as OpenClawPluginToolFactory,
      { name: "memory_self_improving_capture_candidate" },
    );
  }
  if (isLearnedGuidanceAdvisoryToolEnabled(runtime)) {
    api.registerTool(
      ((ctx) =>
        createMemoryLearnedGuidancePlanTool({
          runtime,
          context: ctx,
        })) as OpenClawPluginToolFactory,
      { name: "memory_learned_guidance_plan" },
    );
  }
  if (reviewToolsEnabled) {
    api.registerTool(
      ((ctx) =>
        createCandidateListTool({
          runtime,
          context: ctx,
        })) as OpenClawPluginToolFactory,
      { name: "memory_candidate_list" },
    );
    api.registerTool(
      ((ctx) =>
        createCandidateGetTool({
          runtime,
          context: ctx,
        })) as OpenClawPluginToolFactory,
      { name: "memory_candidate_get" },
    );
    api.registerTool(
      ((ctx) =>
        createCandidateReviewPromptTool({
          runtime,
          context: ctx,
        })) as OpenClawPluginToolFactory,
      { name: "memory_candidate_review_prompt" },
    );
  }
  api.registerTool(
    ((ctx) =>
      createMemoryObjectListTool({
        runtime,
        context: ctx,
      })) as OpenClawPluginToolFactory,
    { name: "memory_object_list" },
  );
  api.registerTool(
    ((ctx) =>
      createMemoryObjectGetTool({
        runtime,
        context: ctx,
      })) as OpenClawPluginToolFactory,
    { name: "memory_object_get" },
  );
  api.registerTool(
    ((ctx) =>
      createMemoryObjectSearchBasicTool({
        runtime,
        context: ctx,
      })) as OpenClawPluginToolFactory,
    { name: "memory_object_search_basic" },
  );
  api.registerTool(
    ((ctx) =>
      createMemoryObjectSearchHybridTool({
        runtime,
        context: ctx,
      })) as OpenClawPluginToolFactory,
    { name: "memory_object_search_hybrid" },
  );
  api.registerTool(
    ((ctx) =>
      createMemoryObjectSearchSemanticTool({
        runtime,
        context: ctx,
      })) as OpenClawPluginToolFactory,
    { name: "memory_object_search_semantic" },
  );
  api.registerTool(
    ((ctx) =>
      createMemoryToolResultPersistTool({
        runtime,
        context: ctx,
      })) as OpenClawPluginToolFactory,
    { name: "memory_tool_result_persist" },
  );
  api.registerTool(
    ((ctx) =>
      createMemoryToolResultGetTool({
        runtime,
        context: ctx,
      })) as OpenClawPluginToolFactory,
    { name: "memory_tool_result_get" },
  );
  api.registerTool(
    ((ctx) =>
      createMemoryToolResultMicrocompactPlanTool({
        runtime,
        context: ctx,
      })) as OpenClawPluginToolFactory,
    { name: "memory_tool_result_microcompact_plan" },
  );
  api.registerTool(
    ((ctx) =>
      createMemoryToolResultMicrocompactExecuteTool({
        runtime,
        context: ctx,
      })) as OpenClawPluginToolFactory,
    { name: "memory_tool_result_microcompact_execute" },
  );
  api.registerTool(
    ((ctx) =>
      createMemoryCompactionPlanTool({
        runtime,
        context: ctx,
      })) as OpenClawPluginToolFactory,
    { name: "memory_compaction_plan" },
  );
  api.registerTool(
    ((ctx) =>
      createMemorySessionGetTool({
        runtime,
        context: ctx,
      })) as OpenClawPluginToolFactory,
    { name: "memory_session_get" },
  );
  api.registerTool(
    ((ctx) =>
      createMemorySessionUpdateTool({
        runtime,
        context: ctx,
      })) as OpenClawPluginToolFactory,
    { name: "memory_session_update" },
  );
  api.registerTool(
    ((ctx) =>
      createMemorySessionCompactExecuteTool({
        runtime,
        context: ctx,
      })) as OpenClawPluginToolFactory,
    { name: "memory_session_compact_execute" },
  );
  api.registerTool(
    ((ctx) =>
      createMemoryFullCompactionFallbackExecuteTool({
        runtime,
        context: ctx,
      })) as OpenClawPluginToolFactory,
    { name: "memory_full_compaction_fallback_execute" },
  );
  api.registerTool(
    ((ctx) =>
      createMemoryDriftCheckExecuteTool({
        runtime,
        context: ctx,
      })) as OpenClawPluginToolFactory,
    { name: "memory_drift_check_execute" },
  );
  api.registerTool(
    ((ctx) =>
      createMemoryConsolidationExecuteTool({
        runtime,
        context: ctx,
      })) as OpenClawPluginToolFactory,
    { name: "memory_consolidation_execute" },
  );
  api.registerTool(
    ((ctx) =>
      createMemoryConsolidationPlanTool({
        runtime,
        context: ctx,
      })) as OpenClawPluginToolFactory,
    { name: "memory_consolidation_plan" },
  );
  api.registerTool(
    ((ctx) =>
      createMemoryProactivePlanTool({
        runtime,
        context: ctx,
      })) as OpenClawPluginToolFactory,
    { name: "memory_proactive_plan" },
  );
  api.registerTool(
    ((ctx) =>
      createMemoryProactiveExecuteTool({
        runtime,
        context: ctx,
      })) as OpenClawPluginToolFactory,
    { name: "memory_proactive_execute" },
  );
  api.registerTool(
    ((ctx) =>
      createMemoryBackgroundJobEnqueueTool({
        runtime,
        context: ctx,
      })) as OpenClawPluginToolFactory,
    { name: "memory_background_job_enqueue" },
  );
  api.registerTool(
    ((ctx) =>
      createMemoryBackgroundJobListTool({
        runtime,
        context: ctx,
      })) as OpenClawPluginToolFactory,
    { name: "memory_background_job_list" },
  );
  api.registerTool(
    ((ctx) =>
      createMemoryBackgroundJobGetTool({
        runtime,
        context: ctx,
      })) as OpenClawPluginToolFactory,
    { name: "memory_background_job_get" },
  );
  api.registerTool(
    ((ctx) =>
      createMemoryBackgroundJobRunNextTool({
        runtime,
        context: ctx,
      })) as OpenClawPluginToolFactory,
    { name: "memory_background_job_run_next" },
  );
  if (reviewToolsEnabled) {
    api.registerTool(
      ((ctx) =>
        createCandidateReviewTool({
          runtime,
          context: ctx,
        })) as OpenClawPluginToolFactory,
      { name: "memory_candidate_review" },
    );
  }
  if (promotionPlanningToolsEnabled) {
    api.registerTool(
      ((ctx) =>
        createCandidatePromotePlanTool({
          runtime,
          context: ctx,
        })) as OpenClawPluginToolFactory,
      { name: "memory_candidate_promote_plan" },
    );
    api.registerTool(
      ((ctx) =>
        createCandidatePromoteMemoryTool({
          runtime,
          context: ctx,
        })) as OpenClawPluginToolFactory,
      { name: "memory_candidate_promote_memory" },
    );
  }
  if (automation.procedureDraftPromotion) {
    api.registerTool(
      ((ctx) =>
        createCandidatePromoteProcedureTool({
          runtime,
          context: ctx,
        })) as OpenClawPluginToolFactory,
      { name: "memory_candidate_promote_procedure" },
    );
  }
  if (automation.procedureValidation) {
    api.registerTool(
      ((ctx) =>
        createProcedureValidatePlanTool({
          runtime,
          context: ctx,
        })) as OpenClawPluginToolFactory,
      { name: "memory_procedure_validate_plan" },
    );
    api.registerTool(
      ((ctx) =>
        createProcedureValidateTool({
          runtime,
          context: ctx,
        })) as OpenClawPluginToolFactory,
      { name: "memory_procedure_validate" },
    );
  }
  if (automation.skillApproval) {
    api.registerTool(
      ((ctx) =>
        createSkillCandidateApprovalPlanTool({
          runtime,
          context: ctx,
        })) as OpenClawPluginToolFactory,
      { name: "memory_skill_candidate_approval_plan" },
    );
    api.registerTool(
      ((ctx) =>
        createSkillCandidateApproveTool({
          runtime,
          context: ctx,
        })) as OpenClawPluginToolFactory,
      { name: "memory_skill_candidate_approve" },
    );
  }
  if (automation.skillInstall) {
    api.registerTool(
      ((ctx) =>
        createSkillCandidateInstallHandoffTool({
          runtime,
          context: ctx,
        })) as OpenClawPluginToolFactory,
      { name: "memory_skill_candidate_install_handoff" },
    );
    api.registerTool(
      ((ctx) =>
        createSkillCandidateInstallRecordCreateTool({
          runtime,
          context: ctx,
        })) as OpenClawPluginToolFactory,
      { name: "memory_skill_candidate_install_record_create" },
    );
  }
  if (automation.skillCandidate) {
    api.registerTool(
      ((ctx) =>
        createSkillCandidatePlanTool({
          runtime,
          context: ctx,
        })) as OpenClawPluginToolFactory,
      { name: "memory_skill_candidate_plan" },
    );
    api.registerTool(
      ((ctx) =>
        createSkillCandidateCreateTool({
          runtime,
          context: ctx,
        })) as OpenClawPluginToolFactory,
      { name: "memory_skill_candidate_create" },
    );
  }
  if (automation.skillProcurement) {
    api.registerTool(
      ((ctx) =>
        createSkillCandidateProcurementPlanTool({
          runtime,
          context: ctx,
        })) as OpenClawPluginToolFactory,
      { name: "memory_skill_candidate_procurement_plan" },
    );
    api.registerTool(
      ((ctx) =>
        createSkillCandidateProcurementRecordCreateTool({
          runtime,
          context: ctx,
        })) as OpenClawPluginToolFactory,
      { name: "memory_skill_candidate_procurement_record_create" },
    );
  }
  if (automation.skillVetting) {
    api.registerTool(
      ((ctx) =>
        createSkillCandidateSkillVetterHandoffTool({
          runtime,
          context: ctx,
        })) as OpenClawPluginToolFactory,
      { name: "memory_skill_candidate_skill_vetter_handoff" },
    );
    api.registerTool(
      ((ctx) =>
        createSkillCandidateVettingResultRecordTool({
          runtime,
          context: ctx,
        })) as OpenClawPluginToolFactory,
      { name: "memory_skill_candidate_vetting_result_record" },
    );
  }
}
