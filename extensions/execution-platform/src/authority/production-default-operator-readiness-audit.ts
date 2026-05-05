export type ProductionDefaultOperatorMilestoneStatus = "passed" | "needs_review" | "blocked";

export type ProductionDefaultOperatorReadinessDimension = {
  dimensionId: string;
  status: ProductionDefaultOperatorMilestoneStatus;
  evidenceRefs: string[];
  reasonCodes: string[];
};

export type ProductionDefaultOperatorReadinessAudit = {
  artifactKind: "production_default_operator_readiness_audit";
  scorePercent: number;
  readyAsPrimaryProductionOperator: boolean;
  dimensions: ProductionDefaultOperatorReadinessDimension[];
  hardBlockers: string[];
  finalAuthorityStates: {
    productionDeploy: string;
    externalOutboundWrite: string;
    productionModelPromotion: string;
  };
  productionDeployOccurred: boolean;
  externalOutboundWriteSendOccurred: boolean;
  productionModelPromotionOccurred: boolean;
  noRawContentStored: boolean;
  workQueueLifecycleMutated: false;
  gatewayConfigChanged: false;
};

export function buildProductionDefaultOperatorReadinessAudit(input: {
  dimensions: ProductionDefaultOperatorReadinessDimension[];
  finalAuthorityStates: ProductionDefaultOperatorReadinessAudit["finalAuthorityStates"];
  productionDeployOccurred: boolean;
  externalOutboundWriteSendOccurred: boolean;
  productionModelPromotionOccurred: boolean;
  noRawContentStored: boolean;
  workQueueLifecycleMutated?: boolean;
  gatewayConfigChanged?: boolean;
}): ProductionDefaultOperatorReadinessAudit {
  const hardBlockers = input.dimensions
    .filter((dimension) => dimension.status === "blocked")
    .flatMap((dimension) =>
      dimension.reasonCodes.length > 0
        ? dimension.reasonCodes.map((reason) => `${dimension.dimensionId}:${reason}`)
        : [`${dimension.dimensionId}:blocked`],
    )
    .toSorted();
  const dimensionScore =
    input.dimensions.length === 0
      ? 0
      : input.dimensions.reduce((score, dimension) => {
          if (dimension.status === "passed") {
            return score + 1;
          }
          if (dimension.status === "needs_review") {
            return score + 0.5;
          }
          return score;
        }, 0) / input.dimensions.length;
  const safetyScore =
    input.noRawContentStored &&
    input.workQueueLifecycleMutated !== true &&
    input.gatewayConfigChanged !== true
      ? 1
      : 0;
  const scorePercent = Math.round((dimensionScore * 0.9 + safetyScore * 0.1) * 1000) / 10;
  return {
    artifactKind: "production_default_operator_readiness_audit",
    scorePercent,
    readyAsPrimaryProductionOperator:
      scorePercent >= 95 &&
      hardBlockers.length === 0 &&
      input.noRawContentStored &&
      input.workQueueLifecycleMutated !== true &&
      input.gatewayConfigChanged !== true,
    dimensions: input.dimensions,
    hardBlockers,
    finalAuthorityStates: input.finalAuthorityStates,
    productionDeployOccurred: input.productionDeployOccurred,
    externalOutboundWriteSendOccurred: input.externalOutboundWriteSendOccurred,
    productionModelPromotionOccurred: input.productionModelPromotionOccurred,
    noRawContentStored: input.noRawContentStored,
    workQueueLifecycleMutated: false,
    gatewayConfigChanged: false,
  };
}
