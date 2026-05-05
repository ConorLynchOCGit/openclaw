import type { OutboundWriteAuthorityProof } from "./outbound-write-authority.ts";
import type { ProductionDeployAuthorityProof } from "./production-deploy-authority.ts";
import type { ProductionModelPromotionAuthorityProof } from "./production-model-promotion-authority.ts";

export type ProductionAuthorityReadinessAudit = {
  artifactKind: "production_authority_readiness_audit";
  scorePercent: number;
  allProductionAuthoritiesDefaultEnabled: boolean;
  finalAuthorityStates: {
    productionDeploy: string;
    externalOutboundWrite: string;
    productionModelPromotion: string;
  };
  hardBlockers: string[];
  evidenceRefs: string[];
  noRawContentStored: boolean;
  workQueueLifecycleMutated: false;
  gatewayConfigChanged: false;
  productionDeployOccurred: boolean;
  externalOutboundWriteSendOccurred: boolean;
  productionModelPromotionOccurred: boolean;
};

export function buildProductionAuthorityReadinessAudit(input: {
  productionDeploy: ProductionDeployAuthorityProof;
  outboundWrite: OutboundWriteAuthorityProof;
  modelPromotion: ProductionModelPromotionAuthorityProof;
  uxProofPresent: boolean;
  workQueueCockpitProofPresent: boolean;
  incidentDrillProofPresent: boolean;
  soakProofPresent: boolean;
  evidenceRefs?: string[];
}): ProductionAuthorityReadinessAudit {
  const blockers: string[] = [];
  if (!input.productionDeploy.defaultEnabled) {
    blockers.push(
      ...input.productionDeploy.exactMissingValues.map((value) => `production_deploy:${value}`),
    );
  }
  if (!input.outboundWrite.defaultEnabled) {
    blockers.push(
      ...input.outboundWrite.exactMissingValues.map((value) => `external_outbound_write:${value}`),
    );
  }
  if (!input.modelPromotion.defaultEnabled) {
    blockers.push(
      ...input.modelPromotion.exactMissingValues.map(
        (value) => `production_model_promotion:${value}`,
      ),
    );
  }
  if (!input.uxProofPresent) {
    blockers.push("native_ux_authority_proof_missing");
  }
  if (!input.workQueueCockpitProofPresent) {
    blockers.push("work_queue_authority_cockpit_missing");
  }
  if (!input.incidentDrillProofPresent) {
    blockers.push("incident_rollback_drill_missing");
  }
  if (!input.soakProofPresent) {
    blockers.push("default_on_authority_soak_missing");
  }
  const dimensions = [
    input.productionDeploy.defaultEnabled,
    input.outboundWrite.defaultEnabled,
    input.modelPromotion.defaultEnabled,
    input.uxProofPresent,
    input.workQueueCockpitProofPresent,
    input.incidentDrillProofPresent,
    input.soakProofPresent,
    !input.productionDeploy.rawDeployLogsStored,
    !input.outboundWrite.rawPayloadStored,
    !input.modelPromotion.rawProviderLogsStored,
  ];
  const scorePercent =
    Math.round((dimensions.filter(Boolean).length / dimensions.length) * 1000) / 10;
  return {
    artifactKind: "production_authority_readiness_audit",
    scorePercent,
    allProductionAuthoritiesDefaultEnabled:
      input.productionDeploy.defaultEnabled &&
      input.outboundWrite.defaultEnabled &&
      input.modelPromotion.defaultEnabled &&
      blockers.length === 0,
    finalAuthorityStates: {
      productionDeploy: input.productionDeploy.state,
      externalOutboundWrite: input.outboundWrite.state,
      productionModelPromotion: input.modelPromotion.state,
    },
    hardBlockers: [...new Set(blockers)].toSorted(),
    evidenceRefs: input.evidenceRefs ?? [],
    noRawContentStored:
      !input.productionDeploy.rawDeployLogsStored &&
      !input.outboundWrite.rawPayloadStored &&
      !input.modelPromotion.rawProviderLogsStored,
    workQueueLifecycleMutated: false,
    gatewayConfigChanged: false,
    productionDeployOccurred: input.productionDeploy.productionDeployOccurred,
    externalOutboundWriteSendOccurred: input.outboundWrite.externalOutboundWriteSendOccurred,
    productionModelPromotionOccurred: input.modelPromotion.productionModelPromotionOccurred,
  };
}
