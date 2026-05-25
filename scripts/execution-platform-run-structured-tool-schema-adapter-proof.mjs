#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {
  buildStructuredAdapterProviderProfile,
  classifyStructuredAdapterOutcome,
  classifyModelTaskCall,
  structuredAdapterDiagnostics,
  structuredAdapterPreflight,
} = await tsImport(path.join(root, "extensions/execution-platform/src/index.ts"), import.meta.url);

const artifactDir = path.resolve(".artifacts/execution-platform/structured-tool-schema-adapter");
const artifactPath = path.join(artifactDir, "proof.json");

const semanticClassification = classifyModelTaskCall({
  taskClass: "local_semantic_extraction",
  callSite: "proof.commitment_packet.semantic_content",
});
const semanticProfile = buildStructuredAdapterProviderProfile(semanticClassification);
const semanticPreflight = structuredAdapterPreflight({
  profile: semanticProfile,
  inputBytes: 12_000,
  requestedMaxOutputTokens: 4_000,
  requestedTimeoutMs: 90_000,
});
const firstNoContentDiagnostics = structuredAdapterDiagnostics({
  profile: semanticProfile,
  attempt: 1,
  httpStatus: 200,
  latencyMs: 60_000,
  content: "",
  finishReason: "length",
  nativeFinishReason: "length",
  errorReasonCode: "openrouter_no_content",
  inputBytes: 12_000,
  usage: {
    inputTokenCount: 1400,
    outputTokenCount: 0,
    totalTokenCount: 1400,
    estimatedCostUsd: 0.0008,
  },
});
const firstNoContentOutcome = classifyStructuredAdapterOutcome({
  profile: semanticProfile,
  diagnostics: firstNoContentDiagnostics,
});
const secondNoContentOutcome = classifyStructuredAdapterOutcome({
  profile: semanticProfile,
  diagnostics: {
    ...firstNoContentDiagnostics,
    attempt: 2,
  },
});

const schemaClassification = classifyModelTaskCall({
  taskClass: "schema_normalization",
  callSite: "proof.scheduler.field_repair",
});
const schemaProfile = buildStructuredAdapterProviderProfile(schemaClassification);
const oversizedSchemaPreflight = structuredAdapterPreflight({
  profile: schemaProfile,
  inputBytes: 24_100,
  requestedMaxOutputTokens: 2_400,
  requestedTimeoutMs: 45_000,
});
const schemaRepairOutcome = classifyStructuredAdapterOutcome({
  profile: schemaProfile,
  diagnostics: structuredAdapterDiagnostics({
    profile: schemaProfile,
    attempt: 1,
    httpStatus: 200,
    latencyMs: 250,
    content: '{"route":"workflow_execution"}',
    finishReason: "stop",
    nativeFinishReason: "stop",
    errorReasonCode: null,
    inputBytes: 900,
  }),
  parsedJsonValid: false,
  schemaIssuePaths: ["newNodes[0].capabilityId"],
  preserveFieldPaths: ["ownerObjective", "targetCommitmentIds"],
});

const proof = {
  artifactKind: "execution_platform.structured_tool_schema_adapter_proof",
  adapterVersion: semanticProfile.adapterVersion,
  status:
    semanticPreflight.accepted &&
    firstNoContentOutcome.status === "retry_same_bounded_task" &&
    secondNoContentOutcome.status === "escalate_with_structured_reason" &&
    !oversizedSchemaPreflight.accepted &&
    schemaRepairOutcome.status === "needs_field_specific_schema_repair"
      ? "passed"
      : "failed",
  semanticProfile,
  semanticPreflight,
  firstNoContentDiagnostics,
  firstNoContentOutcome,
  secondNoContentOutcome,
  schemaProfile,
  oversizedSchemaPreflight,
  schemaRepairOutcome,
  rawPromptStored: false,
  rawResponseStored: false,
  rawProviderLogStored: false,
};

await mkdir(artifactDir, { recursive: true });
await writeFile(artifactPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: proof.status, artifactPath }, null, 2));
if (proof.status !== "passed") {
  process.exitCode = 1;
}
