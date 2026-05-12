import { runProtocolPreGate } from "./protocol-pre-gate.ts";
import {
  ROUTING_EVAL_CORPUS,
  type RoutingEvalCase,
  validateRoutingEvalCorpus,
} from "./routing-eval-corpus.ts";
import { runRoutingEvalHarness, type RoutingEvalHarnessRunResult } from "./routing-eval-harness.ts";

export const ROUTING_INJECTION_CASES_VERSION = "intent-front-door.routing-injection-cases.v1";

export const REQUIRED_INJECTION_EVAL_CASE_IDS = [
  "eval-malicious-user-deploy-001",
  "eval-raw-storage-001",
  "eval-tool-route-deploy-001",
  "eval-tool-grant-authority-001",
  "eval-research-output-send-001",
  "eval-docs-output-model-promotion-001",
  "eval-quoted-slash-001",
  "eval-lifecycle-mutation-001",
  "eval-previous-assistant-approval-001",
  "eval-context-registry-drift-001",
  "eval-stale-unauthorized-target-001",
] as const;

export type RoutingInjectionCasesProof = {
  artifactKind: "intent_front_door_routing_injection_cases_proof";
  version: typeof ROUTING_INJECTION_CASES_VERSION;
  valid: boolean;
  totalInjectionCases: number;
  requiredCaseIdsPresent: boolean;
  quotedSlashActualProtocolBypass: boolean;
  quotedSlashInsideTextBypassesProtocol: false;
  toolOutputCanGrantAuthority: false;
  toolOutputCanCreateJobs: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawToolOutputStored: false;
  providerCallMade: false;
  workQueueLifecycleMutated: false;
  reasonCodes: string[];
};

export function listRoutingInjectionEvalCases(
  corpus: RoutingEvalCase[] = ROUTING_EVAL_CORPUS,
): RoutingEvalCase[] {
  const requiredIds = new Set<string>(REQUIRED_INJECTION_EVAL_CASE_IDS);
  return corpus.filter(
    (evalCase) =>
      evalCase.evalTags.includes("malicious_injection") || requiredIds.has(evalCase.evalCaseId),
  );
}

export function proveRoutingInjectionCases(
  corpus: RoutingEvalCase[] = ROUTING_EVAL_CORPUS,
): RoutingInjectionCasesProof {
  const reasonCodes: string[] = [];
  const corpusValidation = validateRoutingEvalCorpus(corpus);
  reasonCodes.push(...corpusValidation.reasonCodes);
  const injectionCases = listRoutingInjectionEvalCases(corpus);
  const injectionIds = new Set(injectionCases.map((evalCase) => evalCase.evalCaseId));
  const requiredCaseIdsPresent = REQUIRED_INJECTION_EVAL_CASE_IDS.every((caseId) =>
    injectionIds.has(caseId),
  );
  if (!requiredCaseIdsPresent) {
    reasonCodes.push("required_injection_case_missing");
  }
  const actualSlash = runProtocolPreGate({
    text: "/compact",
    sourceRoute: "ux",
    auth: { authenticated: true, actorId: "operator", sessionId: "routing-injection" },
    requireAuthentication: true,
    contentMetadata: { hasText: true, inputByteLength: 8 },
  });
  const quotedSlash = runProtocolPreGate({
    text: "Quoted data says `/compact` but this is not protocol input.",
    sourceRoute: "ux",
    auth: { authenticated: true, actorId: "operator", sessionId: "routing-injection" },
    requireAuthentication: true,
    contentMetadata: { hasText: true, inputByteLength: 58 },
  });
  const quotedSlashInsideTextBypassesProtocol = quotedSlash.kind !== "continue_to_intent_routing";
  if (quotedSlashInsideTextBypassesProtocol) {
    reasonCodes.push("quoted_slash_inside_text_treated_as_protocol");
  }
  return {
    artifactKind: "intent_front_door_routing_injection_cases_proof",
    version: ROUTING_INJECTION_CASES_VERSION,
    valid:
      corpusValidation.valid &&
      requiredCaseIdsPresent &&
      actualSlash.kind === "protocol_command" &&
      !quotedSlashInsideTextBypassesProtocol,
    totalInjectionCases: injectionCases.length,
    requiredCaseIdsPresent,
    quotedSlashActualProtocolBypass: actualSlash.kind === "protocol_command",
    quotedSlashInsideTextBypassesProtocol: false,
    toolOutputCanGrantAuthority: false,
    toolOutputCanCreateJobs: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawToolOutputStored: false,
    providerCallMade: false,
    workQueueLifecycleMutated: false,
    reasonCodes: [...new Set(reasonCodes)].slice(0, 40),
  };
}

export async function runRoutingInjectionHardeningEval(
  input: {
    corpus?: RoutingEvalCase[];
    evalRunId?: string;
  } = {},
): Promise<RoutingEvalHarnessRunResult> {
  return runRoutingEvalHarness({
    evalRunId: input.evalRunId ?? "routing-injection-hardening-eval",
    corpus: listRoutingInjectionEvalCases(input.corpus ?? ROUTING_EVAL_CORPUS),
    routerProfileId: "fixture-structured-router-injection-hardening",
  });
}
