import { z } from "zod";
import {
  CANONICAL_ACTION_CATEGORIES,
  CANONICAL_ROUTER_CAPABILITIES,
  type CanonicalActionCategory,
  type CanonicalRouterCapability,
  type CanonicalRouterOutput,
} from "./router-schema.ts";
import type { WorkflowSummaryIndexEntry } from "./workflow-summary-index.ts";

export const INTAKE_ROUTE_CONTRACT_SCHEMA_VERSION = "intent-front-door.intake-route-contract.v1";

export const INTAKE_PRIMARY_OUTCOME_KINDS = [
  "answer_question",
  "status_check",
  "produce_plan",
  "implement_existing_system",
  "harden_existing_system",
  "prove_existing_system",
  "review_existing_system",
  "run_existing_workflow",
] as const;

export type IntakePrimaryOutcomeKind = (typeof INTAKE_PRIMARY_OUTCOME_KINDS)[number];

export const intakeRouteContractSchema = z
  .object({
    artifactKind: z.literal("intake_route_contract"),
    schemaVersion: z.literal(INTAKE_ROUTE_CONTRACT_SCHEMA_VERSION),
    contractId: z.string().min(3).max(160),
    expectedPrimaryOutcomeKinds: z.array(z.enum(INTAKE_PRIMARY_OUTCOME_KINDS)).min(1).max(8),
    requiredExecutorCapabilities: z
      .array(z.enum(CANONICAL_ROUTER_CAPABILITIES))
      .max(12)
      .default([]),
    requiredRequestedActions: z.array(z.enum(CANONICAL_ACTION_CATEGORIES)).max(12).default([]),
    expectedSubjectKinds: z.array(z.string().min(1).max(80)).max(12).default([]),
    reasonCodes: z
      .array(
        z
          .string()
          .min(1)
          .max(120)
          .regex(/^[a-z0-9_.:-]+$/u),
      )
      .max(20)
      .default([]),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
  })
  .strict();

export type IntakeRouteContract = z.infer<typeof intakeRouteContractSchema>;

export type IntakeRouteContractValidationResult = {
  accepted: boolean;
  reasonCodes: string[];
};

export function normalizeIntakeRouteContract(value: unknown): IntakeRouteContract | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = intakeRouteContractSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function intakeRouteContractToRouterPayload(contract: IntakeRouteContract | null) {
  if (!contract) {
    return null;
  }
  return {
    artifactKind: contract.artifactKind,
    schemaVersion: contract.schemaVersion,
    contractId: contract.contractId,
    expectedPrimaryOutcomeKinds: contract.expectedPrimaryOutcomeKinds,
    requiredExecutorCapabilities: contract.requiredExecutorCapabilities,
    requiredRequestedActions: contract.requiredRequestedActions,
    expectedSubjectKinds: contract.expectedSubjectKinds,
    reasonCodes: contract.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
  } satisfies IntakeRouteContract;
}

function workflowFor(
  workflowSummaries: WorkflowSummaryIndexEntry[] | undefined,
  workflowId: string | null | undefined,
): WorkflowSummaryIndexEntry | null {
  if (!workflowId) {
    return null;
  }
  return workflowSummaries?.find((summary) => summary.workflowId === workflowId) ?? null;
}

function primaryOutcomeKinds(output: CanonicalRouterOutput): IntakePrimaryOutcomeKind[] {
  const prefix = "router_primary_outcome:";
  return output.reasonCodes
    .filter((reason) => reason.startsWith(prefix))
    .map((reason) => reason.slice(prefix.length))
    .filter((kind): kind is IntakePrimaryOutcomeKind =>
      INTAKE_PRIMARY_OUTCOME_KINDS.includes(kind as IntakePrimaryOutcomeKind),
    );
}

export function validateIntakeRouteContract(input: {
  contract: IntakeRouteContract | null;
  routerOutput: CanonicalRouterOutput;
  workflowSummaries?: WorkflowSummaryIndexEntry[];
}): IntakeRouteContractValidationResult {
  const contract = input.contract;
  if (!contract) {
    return { accepted: true, reasonCodes: ["intake_route_contract_not_required"] };
  }

  const reasonCodes = [
    "intake_route_contract_validation_applied",
    ...contract.reasonCodes.slice(0, 10),
  ];
  const outcomeKinds = primaryOutcomeKinds(input.routerOutput);
  if (outcomeKinds.length === 0) {
    reasonCodes.push("intake_route_contract_primary_outcome_missing");
  } else if (
    !outcomeKinds.some((outcomeKind) => contract.expectedPrimaryOutcomeKinds.includes(outcomeKind))
  ) {
    reasonCodes.push("intake_route_contract_primary_outcome_mismatch");
  }

  if (contract.requiredRequestedActions.length > 0) {
    reasonCodes.push("intake_route_contract_actions_deferred_to_requirement_map");
  }

  const executorWorkflowId = input.routerOutput.executorWorkflowId ?? input.routerOutput.workflowId;
  const workflow = workflowFor(input.workflowSummaries, executorWorkflowId);
  if (!workflow) {
    reasonCodes.push("intake_route_contract_executor_workflow_missing_or_unregistered");
  } else {
    for (const capability of contract.requiredExecutorCapabilities) {
      if (!workflow.capabilitySummary.executableCapabilities.includes(capability)) {
        reasonCodes.push(`intake_route_contract_executor_capability_missing:${capability}`);
      }
    }
  }

  const accepted = !reasonCodes.some(
    (reason) =>
      reason.startsWith("intake_route_contract_") &&
      reason !== "intake_route_contract_validation_applied" &&
      reason !== "intake_route_contract_actions_deferred_to_requirement_map",
  );
  return {
    accepted,
    reasonCodes: accepted ? [...reasonCodes, "intake_route_contract_validated"] : reasonCodes,
  };
}

export function intakeRouteContractRequiredCapabilities(
  contract: IntakeRouteContract | null,
): CanonicalRouterCapability[] {
  return contract ? [...contract.requiredExecutorCapabilities] : [];
}

export function intakeRouteContractRequiredActions(
  contract: IntakeRouteContract | null,
): CanonicalActionCategory[] {
  return contract ? [...contract.requiredRequestedActions] : [];
}
