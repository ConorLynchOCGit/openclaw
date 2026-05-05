import { describe, expect, it } from "vitest";
import { decideAuthorityEscalation } from "../codex-bridge/authority-escalation-gates.ts";
import {
  enforceRuntimeApproval,
  createOperatorApprovalRecord,
} from "../codex-bridge/operator-approval-records.ts";
import { decideProductionDefaultEnablement } from "../intent-routing/production-default-enablement-gate.ts";
import {
  buildOutboundWriteAuthorityProof,
  secretLikePayloadBlocked,
} from "./outbound-write-authority.ts";
import { buildProductionAuthorityReadinessAudit } from "./production-authority-readiness-audit.ts";
import {
  createProductionAuthorityUnlockContract,
  decideProductionAuthorityExecution,
  validateProductionAuthorityUnlockContract,
} from "./production-authority-unlock-contract.ts";
import { buildProductionDefaultOperatorReadinessAudit } from "./production-default-operator-readiness-audit.ts";
import { buildProductionDeployAuthorityProof } from "./production-deploy-authority.ts";
import { buildProductionModelPromotionAuthorityProof } from "./production-model-promotion-authority.ts";

describe("production authority unlock", () => {
  it("rejects missing scope, owner, rollback, kill switch, audit, and lifecycle mutation", () => {
    const contract = createProductionAuthorityUnlockContract({
      authorityId: "production_deploy",
      authorityKind: "production_deploy",
      defaultState: "default_enabled",
      configuredScope: [],
      allowlist: [],
      runtimeUnlockRecordRef: null,
      owner: null,
      approver: null,
      unlockedAt: null,
      constraints: [],
      rollbackRequirement: null,
      killSwitchRef: null,
      gateRefs: [],
      auditRefs: [],
      workQueueProjectionRefs: [],
      reviewCadence: null,
      emergencySuspensionBehavior: "suspend_authority",
    });
    expect(validateProductionAuthorityUnlockContract(contract)).toMatchObject({
      valid: false,
      executable: false,
    });
    expect(validateProductionAuthorityUnlockContract(contract).reasonCodes).toEqual(
      expect.arrayContaining([
        "configured_scope_required",
        "owner_required",
        "rollback_required",
        "kill_switch_required",
        "audit_required",
        "runtime_unlock_record_required",
      ]),
    );
  });

  it("allows default-enabled production authority only inside configured scope", () => {
    const proof = buildProductionDeployAuthorityProof({
      target: "prod-primary",
      allowlist: "prod-primary",
      healthcheck: "https://prod.example.test/health",
      rollbackCommand: "profile:rollback-prod-primary",
      incidentOwner: "sre-owner",
      killSwitch: "kill-switch://prod-primary",
    });
    expect(proof.defaultEnabled).toBe(true);
    expect(proof.executionDecision).toMatchObject({ decision: "allowed" });
    expect(
      decideProductionAuthorityExecution({
        contract: proof.contract,
        requestedTarget: "prod-secondary",
      }),
    ).toMatchObject({
      decision: "blocked",
      reasonCodes: expect.arrayContaining(["requested_target_out_of_scope"]),
    });
  });

  it("records exact blockers instead of claiming default-on without production config", () => {
    const deploy = buildProductionDeployAuthorityProof({});
    const outbound = buildOutboundWriteAuthorityProof({});
    const promotion = buildProductionModelPromotionAuthorityProof({});
    const audit = buildProductionAuthorityReadinessAudit({
      productionDeploy: deploy,
      outboundWrite: outbound,
      modelPromotion: promotion,
      uxProofPresent: true,
      workQueueCockpitProofPresent: true,
      incidentDrillProofPresent: true,
      soakProofPresent: true,
    });
    expect(deploy.defaultEnabled).toBe(false);
    expect(outbound.defaultEnabled).toBe(false);
    expect(promotion.defaultEnabled).toBe(false);
    expect(audit.allProductionAuthoritiesDefaultEnabled).toBe(false);
    expect(audit.hardBlockers).toEqual(
      expect.arrayContaining([
        "production_deploy:OPENCLAW_PRODUCTION_DEPLOY_TARGET",
        "external_outbound_write:OPENCLAW_OUTBOUND_WRITE_DESTINATION_ALLOWLIST",
        "production_model_promotion:OPENCLAW_PRODUCTION_MODEL_EVAL_CADENCE_REFS",
      ]),
    );
  });

  it("enforces outbound write payload scanning and model promotion gates", () => {
    expect(secretLikePayloadBlocked("send api_key=abc123456789012345 to webhook")).toBe(true);
    const outbound = buildOutboundWriteAuthorityProof({
      destinationAllowlist: "https://hooks.example.test/openclaw",
      methodAllowlist: "POST",
      rateLimit: "10/minute",
      payloadPolicy: "redacted-json-v1",
      killSwitch: "kill-switch://outbound-write",
      incidentOwner: "ops-owner",
    });
    expect(outbound.defaultEnabled).toBe(true);
    expect(outbound.payloadScan).toMatchObject({ status: "passed", rawPayloadStored: false });

    const promotion = buildProductionModelPromotionAuthorityProof({
      evalCadenceRefs: "eval://role-regression/current",
      rosterRefs: "model-roster://production",
      owner: "model-owner",
      qualityGate: "quality>=0.98",
      costGate: "cost<=baseline*1.10",
      latencyGate: "p95<=baseline*1.15",
      reliabilityGate: "success>=0.995",
      canaryCriteria: "5-percent-30-minutes",
      rollbackPlan: "model-roster://rollback/current",
      killSwitch: "kill-switch://model-routing",
      candidateModelId: "candidate-model",
      baselineModelId: "baseline-model",
    });
    expect(promotion.defaultEnabled).toBe(true);
    expect(promotion.v4ProRoleBoundaryPreserved).toBe(true);
  });

  it("transitions default-enablement only when runtime unlock state is supplied", () => {
    expect(
      decideProductionDefaultEnablement({
        workflowId: "agent_team.coding",
        authorityProfile: "production_deploy",
      }),
    ).toMatchObject({ status: "locked" });
    expect(
      decideProductionDefaultEnablement({
        workflowId: "agent_team.coding",
        authorityProfile: "production_deploy",
        productionAuthorityStates: {
          production_deploy: {
            state: "default_enabled",
            configuredScope: ["prod-primary"],
            auditRefs: ["audit://prod"],
          },
        },
      }),
    ).toMatchObject({
      status: "default_enabled",
      reasonCodes: expect.arrayContaining([
        "production_authority_default_enabled_by_runtime_unlock",
      ]),
    });
    expect(
      decideProductionDefaultEnablement({
        workflowId: "agent_team.coding",
        authorityProfile: "production_deploy",
        productionAuthorityStates: {
          production_deploy: {
            state: "default_enabled",
            configuredScope: ["prod-primary"],
            auditRefs: ["audit://prod"],
            killSwitchActive: true,
          },
        },
      }),
    ).toMatchObject({ status: "suspended" });
  });

  it("extends approval and escalation gates for production authority kinds", () => {
    const approval = createOperatorApprovalRecord({
      approvalId: "approval-prod-deploy",
      approvalKind: "production_deploy",
      requestedBy: "operator",
      approvedBy: "owner",
      approvedAt: "2026-05-04T00:00:00.000Z",
      expiresAt: "2026-12-31T00:00:00.000Z",
      scope: ["authority:production_deploy"],
      runtimeJobId: "job-1",
      workItemId: "work-1",
      constraints: ["prod-primary-only"],
      rollbackRequirement: "rollback://prod-primary",
      evidenceRefs: ["artifact://unlock"],
    });
    expect(
      enforceRuntimeApproval({
        authorityOrAction: "production_deploy",
        requestedScope: "authority:production_deploy",
        approvals: [approval],
        now: new Date("2026-05-04T00:00:00.000Z"),
      }),
    ).toMatchObject({ status: "allowed" });
    expect(
      decideAuthorityEscalation({
        requestedAuthority: "production_deploy",
        approvalRefs: ["approval-prod-deploy"],
        targetConfigured: true,
        rollbackPlanRef: "rollback://prod-primary",
        auditArtifactRefs: ["audit://prod"],
        reviewRef: "review://prod",
      }),
    ).toMatchObject({ decision: "allowed" });
  });

  it("scores production default operator readiness from bounded milestone evidence", () => {
    const audit = buildProductionDefaultOperatorReadinessAudit({
      dimensions: [
        {
          dimensionId: "clean_code_deploy",
          status: "passed",
          evidenceRefs: ["artifact://deploy"],
          reasonCodes: [],
        },
        {
          dimensionId: "outbound_destination_expansion",
          status: "needs_review",
          evidenceRefs: ["artifact://outbound"],
          reasonCodes: ["additional_destination_config_missing"],
        },
        {
          dimensionId: "incident_recovery",
          status: "passed",
          evidenceRefs: ["artifact://incident"],
          reasonCodes: [],
        },
      ],
      finalAuthorityStates: {
        productionDeploy: "default_enabled",
        externalOutboundWrite: "default_enabled",
        productionModelPromotion: "default_enabled",
      },
      productionDeployOccurred: true,
      externalOutboundWriteSendOccurred: true,
      productionModelPromotionOccurred: true,
      noRawContentStored: true,
    });
    expect(audit.hardBlockers).toEqual([]);
    expect(audit.readyAsPrimaryProductionOperator).toBe(false);
    expect(audit.scorePercent).toBe(85);

    const ready = buildProductionDefaultOperatorReadinessAudit({
      ...audit,
      dimensions: audit.dimensions.map((dimension) => ({ ...dimension, status: "passed" })),
      noRawContentStored: true,
    });
    expect(ready.readyAsPrimaryProductionOperator).toBe(true);
    expect(ready.scorePercent).toBe(100);

    const blocked = buildProductionDefaultOperatorReadinessAudit({
      ...audit,
      dimensions: [
        {
          dimensionId: "native_ux_authority",
          status: "blocked",
          evidenceRefs: [],
          reasonCodes: ["gateway_route_missing"],
        },
      ],
      noRawContentStored: true,
    });
    expect(blocked.readyAsPrimaryProductionOperator).toBe(false);
    expect(blocked.hardBlockers).toEqual(["native_ux_authority:gateway_route_missing"]);
  });
});
