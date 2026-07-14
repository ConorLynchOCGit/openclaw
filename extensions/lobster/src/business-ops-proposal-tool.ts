// Presents one TaskFlow-bound Business Ops proposal without owning its decision.
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { Type } from "typebox";
import type { OpenClawPluginApi } from "../runtime-api.js";

type BoundTaskFlow = ReturnType<
  NonNullable<OpenClawPluginApi["runtime"]>["tasks"]["managedFlows"]["bindSession"]
>;

type ProposalToolOptions = {
  taskFlow?: BoundTaskFlow;
  workspaceDir: string;
};

type JsonRecord = Record<string, unknown>;

const MAX_ARTIFACT_BYTES = 512_000;
const MAX_PASSAGE_CHARS = 24_000;
const MAX_PRESENTATION_CHARS = 64_000;

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function requireString(params: JsonRecord, key: string, maxLength = 4_096): string {
  const value = typeof params[key] === "string" ? params[key].trim() : "";
  if (!value) {
    throw new Error(`${key} required`);
  }
  if (value.length > maxLength) {
    throw new Error(`${key} exceeds ${maxLength} characters`);
  }
  return value;
}

function requireInteger(params: JsonRecord, key: string): number {
  const value = params[key];
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new Error(`${key} must be a non-negative integer`);
  }
  return Number(value);
}

function stringArray(params: JsonRecord, key: string, maxItems: number): string[] {
  const value = params[key];
  if (!Array.isArray(value)) {
    return [];
  }
  if (value.length > maxItems) {
    throw new Error(`${key} exceeds ${maxItems} items`);
  }
  return value.map((item, index) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new Error(`${key}[${index}] must be a non-empty string`);
    }
    const normalized = item.trim();
    if (normalized.length > 2_000) {
      throw new Error(`${key}[${index}] exceeds 2000 characters`);
    }
    return normalized;
  });
}

function missingStringIndexes(items: string[], text: string): number[] {
  return items.flatMap((item, index) => (text.includes(item) ? [] : [index]));
}

function isWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

async function readWorkspaceArtifact(workspaceDir: string, ref: string) {
  if (isAbsolute(ref)) {
    throw new Error("artifact refs must be workspace-relative");
  }
  const root = await realpath(workspaceDir);
  const candidate = await realpath(resolve(root, ref));
  if (!isWithin(root, candidate)) {
    throw new Error(`artifact ref escapes workspace: ${ref}`);
  }
  const bytes = await readFile(candidate);
  if (bytes.byteLength > MAX_ARTIFACT_BYTES) {
    throw new Error(`artifact exceeds ${MAX_ARTIFACT_BYTES} bytes: ${ref}`);
  }
  return {
    text: bytes.toString("utf8"),
    digest: createHash("sha256").update(bytes).digest("hex"),
  };
}

function readCurrentProposal(flow: JsonRecord | undefined) {
  const state = asRecord(flow?.stateJson);
  return {
    state,
    proposal: asRecord(state?.proposal),
    canonicalRefs: Array.isArray(state?.canonicalRefs)
      ? state.canonicalRefs.map(asRecord).filter((value): value is JsonRecord => Boolean(value))
      : [],
  };
}

function exactPointerMatches(
  pointer: JsonRecord | undefined,
  ref: string,
  digest: string,
): boolean {
  return pointer?.ref === ref && pointer.digest === digest;
}

/** Creates a read-only presentation tool; TaskFlow and artifact writes remain elsewhere. */
export function createBusinessOpsProposalTool(options: ProposalToolOptions) {
  return {
    name: "business_ops_present_proposal",
    label: "Business Ops proposal",
    description:
      "Present one exact TaskFlow-bound Business Ops proposal for operator review. Proposal-content fields must be verbatim excerpts from the digest-bound artifacts. This validates current refs, digests, and excerpts but never records a decision or mutates an artifact.",
    parameters: Type.Object({
      flowId: Type.String({ minLength: 1, maxLength: 256 }),
      flowRevision: Type.Integer({ minimum: 0 }),
      proposalId: Type.String({ minLength: 1, maxLength: 256 }),
      proposalRef: Type.String({ minLength: 1, maxLength: 2_048 }),
      proposalDigest: Type.String({ minLength: 64, maxLength: 64 }),
      targetRef: Type.String({ minLength: 1, maxLength: 2_048 }),
      targetDigest: Type.String({ minLength: 64, maxLength: 64 }),
      anchor: Type.String({
        minLength: 1,
        maxLength: 4_096,
        description: "Exact verbatim anchor present in the digest-bound target artifact.",
      }),
      currentPassage: Type.String({
        minLength: 1,
        maxLength: MAX_PASSAGE_CHARS,
        description: "Exact verbatim current passage present in the digest-bound target artifact.",
      }),
      proposedPassage: Type.String({
        minLength: 1,
        maxLength: MAX_PASSAGE_CHARS,
        description:
          "Exact verbatim proposed passage present in the digest-bound proposal artifact.",
      }),
      evidenceBasis: Type.Array(Type.String({ minLength: 1, maxLength: 2_000 }), {
        maxItems: 24,
        description:
          "Exact verbatim evidence excerpts present in the digest-bound proposal artifact; do not add labels or paraphrase.",
      }),
      affectedSurfaces: Type.Array(Type.String({ minLength: 1, maxLength: 2_048 }), {
        maxItems: 24,
        description:
          "Exact verbatim affected-surface excerpts present in the digest-bound proposal artifact; do not add labels or paraphrase.",
      }),
      reviewerVerdict: Type.Optional(
        Type.String({
          maxLength: 2_000,
          description:
            "Exact verbatim reviewer-verdict excerpt present in the digest-bound proposal artifact.",
        }),
      ),
      unresolvedConsequences: Type.Array(Type.String({ minLength: 1, maxLength: 2_000 }), {
        maxItems: 24,
        description:
          "Exact verbatim unresolved-consequence excerpts present in the digest-bound proposal artifact; do not add labels or paraphrase.",
      }),
    }),
    async execute(_id: string, params: JsonRecord) {
      const flowId = requireString(params, "flowId", 256);
      const flowRevision = requireInteger(params, "flowRevision");
      const proposalId = requireString(params, "proposalId", 256);
      const proposalRef = requireString(params, "proposalRef", 2_048);
      const proposalDigest = requireString(params, "proposalDigest", 64);
      const targetRef = requireString(params, "targetRef", 2_048);
      const targetDigest = requireString(params, "targetDigest", 64);
      const anchor = requireString(params, "anchor", 4_096);
      const currentPassage = requireString(params, "currentPassage", MAX_PASSAGE_CHARS);
      const proposedPassage = requireString(params, "proposedPassage", MAX_PASSAGE_CHARS);
      const evidenceBasis = stringArray(params, "evidenceBasis", 24);
      const affectedSurfaces = stringArray(params, "affectedSurfaces", 24);
      const unresolvedConsequences = stringArray(params, "unresolvedConsequences", 24);
      const reviewerVerdict =
        typeof params.reviewerVerdict === "string" ? params.reviewerVerdict.trim() : "";

      const flow = asRecord(options.taskFlow?.get(flowId));
      const current = readCurrentProposal(flow);
      const proposalArtifact = await readWorkspaceArtifact(options.workspaceDir, proposalRef);
      const targetArtifact = await readWorkspaceArtifact(options.workspaceDir, targetRef);

      const checks = {
        flowExists: Boolean(flow),
        flowRevision: flow?.revision === flowRevision,
        flowWaiting: flow?.status === "waiting" && current.state?.state === "waiting_approval",
        proposalPointer:
          current.proposal?.id === proposalId &&
          exactPointerMatches(current.proposal, proposalRef, proposalDigest),
        targetPointer: current.canonicalRefs.some((pointer) =>
          exactPointerMatches(pointer, targetRef, targetDigest),
        ),
        proposalDigest: proposalArtifact.digest === proposalDigest,
        targetDigest: targetArtifact.digest === targetDigest,
        anchor: targetArtifact.text.includes(anchor),
        currentPassage: targetArtifact.text.includes(currentPassage),
        proposedPassage: proposalArtifact.text.includes(proposedPassage),
        proposalEvidence: evidenceBasis.every((item) => proposalArtifact.text.includes(item)),
        proposalAffectedSurfaces: affectedSurfaces.every((item) =>
          proposalArtifact.text.includes(item),
        ),
        proposalReviewerVerdict:
          !reviewerVerdict || proposalArtifact.text.includes(reviewerVerdict),
        proposalUnresolvedConsequences: unresolvedConsequences.every((item) =>
          proposalArtifact.text.includes(item),
        ),
      };
      const currentAndActionable = Object.values(checks).every(Boolean);
      const failedChecks = Object.entries(checks)
        .filter(([, passed]) => !passed)
        .map(([name]) => name);
      const missingProposalContentIndexes = {
        evidenceBasis: missingStringIndexes(evidenceBasis, proposalArtifact.text),
        affectedSurfaces: missingStringIndexes(affectedSurfaces, proposalArtifact.text),
        reviewerVerdict: Boolean(
          reviewerVerdict && !proposalArtifact.text.includes(reviewerVerdict),
        ),
        unresolvedConsequences: missingStringIndexes(unresolvedConsequences, proposalArtifact.text),
      };
      const identityChecksPassed = [
        checks.flowExists,
        checks.flowRevision,
        checks.flowWaiting,
        checks.proposalPointer,
        checks.targetPointer,
        checks.proposalDigest,
        checks.targetDigest,
      ].every(Boolean);
      const presentation = {
        schema: "openclaw.business-ops.proposal-presentation.v1",
        authority: "presentation_only",
        status: currentAndActionable ? "current" : "superseded_or_stale",
        flow: { id: flowId, revision: flowRevision },
        proposal: { id: proposalId, ref: proposalRef, digest: proposalDigest },
        target: {
          ref: targetRef,
          digest: targetDigest,
          anchor,
          currentPassage,
          proposedPassage,
        },
        evidenceBasis,
        affectedSurfaces,
        reviewerVerdict: reviewerVerdict || null,
        unresolvedConsequences,
        allowedOutcomes: currentAndActionable ? ["approve", "revise", "reject", "defer"] : [],
        checks,
        failedChecks,
        missingProposalContentIndexes,
        recoveryHint: currentAndActionable
          ? null
          : identityChecksPassed
            ? "Retry with exact verbatim excerpts already present in the digest-bound proposal and target artifacts; do not rewrite an artifact to satisfy presentation."
            : "Reload the current TaskFlow revision and digest-bound artifacts before presenting again.",
        instruction:
          "A UI action sends an explicit operator message containing this proposal identity. Business Ops must re-read TaskFlow and target digests before any mutation.",
      };
      const serialized = JSON.stringify(presentation);
      if (serialized.length > MAX_PRESENTATION_CHARS) {
        throw new Error(`proposal presentation exceeds ${MAX_PRESENTATION_CHARS} characters`);
      }
      return {
        content: [{ type: "text", text: serialized }],
        details: presentation,
      };
    },
  };
}
