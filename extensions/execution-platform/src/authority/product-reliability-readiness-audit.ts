export type ProductReliabilityDimensionId =
  | "normal_ux_prompt_path"
  | "authenticated_execution_submit"
  | "repeated_full_live_team_runs"
  | "real_implementation_lane"
  | "one_writer_enforcement"
  | "streaming_work_queue_oversight"
  | "first_class_controls"
  | "research_child_workflow"
  | "outbound_destination_registry"
  | "outbound_destination_canaries"
  | "v4_pro_all_role_eligibility"
  | "model_fallback_degradation"
  | "long_real_use_soak"
  | "incident_recovery_from_real_work"
  | "production_deploy_policy"
  | "outbound_write_send_policy"
  | "model_promotion_policy"
  | "persistent_audit_cockpit"
  | "no_raw_content_storage"
  | "no_work_queue_lifecycle_mutation"
  | "gateway_stability"
  | "docs_runbook_closeout";

export type ProductReliabilityDimensionStatus = "passed" | "needs_review" | "blocked" | "not_run";

export type ProductReliabilityDimension = {
  dimensionId: ProductReliabilityDimensionId;
  status: ProductReliabilityDimensionStatus;
  evidenceRefs: string[];
  reasonCodes: string[];
};

export type ProductReliabilityReadinessAudit = {
  artifactKind: "product_reliability_readiness_audit";
  scorePercent: number;
  reliableForNormalProductBuilding: boolean;
  dimensions: ProductReliabilityDimension[];
  hardBlockers: string[];
  needsReview: string[];
  productionDeployOccurred: boolean;
  externalOutboundWriteSendOccurred: boolean;
  productionModelPromotionOccurred: boolean;
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  secretsStored: false;
  workQueueLifecycleMutated: false;
};

const REQUIRED_DIMENSIONS: ProductReliabilityDimensionId[] = [
  "normal_ux_prompt_path",
  "authenticated_execution_submit",
  "repeated_full_live_team_runs",
  "real_implementation_lane",
  "one_writer_enforcement",
  "streaming_work_queue_oversight",
  "first_class_controls",
  "research_child_workflow",
  "outbound_destination_registry",
  "outbound_destination_canaries",
  "v4_pro_all_role_eligibility",
  "model_fallback_degradation",
  "long_real_use_soak",
  "incident_recovery_from_real_work",
  "production_deploy_policy",
  "outbound_write_send_policy",
  "model_promotion_policy",
  "persistent_audit_cockpit",
  "no_raw_content_storage",
  "no_work_queue_lifecycle_mutation",
  "gateway_stability",
  "docs_runbook_closeout",
];

function normalizeDimensions(
  dimensions: readonly ProductReliabilityDimension[],
): ProductReliabilityDimension[] {
  const supplied = new Map(dimensions.map((dimension) => [dimension.dimensionId, dimension]));
  return REQUIRED_DIMENSIONS.map(
    (dimensionId) =>
      supplied.get(dimensionId) ?? {
        dimensionId,
        status: "not_run",
        evidenceRefs: [],
        reasonCodes: ["dimension_not_run"],
      },
  );
}

export function buildProductReliabilityReadinessAudit(input: {
  dimensions: readonly ProductReliabilityDimension[];
  productionDeployOccurred: boolean;
  externalOutboundWriteSendOccurred: boolean;
  productionModelPromotionOccurred: boolean;
  noRawContentStored: boolean;
  workQueueLifecycleMutated: boolean;
}): ProductReliabilityReadinessAudit {
  const dimensions = normalizeDimensions(input.dimensions);
  const hardBlockers = dimensions
    .filter((dimension) => dimension.status === "blocked" || dimension.status === "not_run")
    .flatMap((dimension) =>
      dimension.reasonCodes.length > 0
        ? dimension.reasonCodes.map((reason) => `${dimension.dimensionId}:${reason}`)
        : [`${dimension.dimensionId}:${dimension.status}`],
    );
  if (!input.noRawContentStored) {
    hardBlockers.push("safety:raw_content_storage_detected");
  }
  if (input.workQueueLifecycleMutated) {
    hardBlockers.push("work_queue:lifecycle_mutation_detected");
  }

  const needsReview = dimensions
    .filter((dimension) => dimension.status === "needs_review")
    .map((dimension) => dimension.dimensionId);
  const passedCount = dimensions.filter((dimension) => dimension.status === "passed").length;
  const scorePercent = Math.round((passedCount / REQUIRED_DIMENSIONS.length) * 100);
  return {
    artifactKind: "product_reliability_readiness_audit",
    scorePercent,
    reliableForNormalProductBuilding:
      scorePercent === 100 &&
      hardBlockers.length === 0 &&
      needsReview.length === 0 &&
      input.productionDeployOccurred &&
      input.externalOutboundWriteSendOccurred &&
      input.productionModelPromotionOccurred,
    dimensions,
    hardBlockers,
    needsReview,
    productionDeployOccurred: input.productionDeployOccurred,
    externalOutboundWriteSendOccurred: input.externalOutboundWriteSendOccurred,
    productionModelPromotionOccurred: input.productionModelPromotionOccurred,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    secretsStored: false,
    workQueueLifecycleMutated: false,
  };
}
