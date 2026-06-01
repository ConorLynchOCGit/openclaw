#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(
  root,
  ".artifacts/execution-platform/proof-hardening-07-adversarial-entry-suite-proof.json",
);

const api = await tsImport(
  path.join(root, "extensions/execution-platform/src/codex-bridge/adversarial-proof-entry-suite.ts"),
  import.meta.url,
);

const result = await api.writeAdversarialProofEntrySuiteArtifact({ outputPath });

console.log(
  JSON.stringify(
    {
      ok: result.pass,
      artifactPath:
        ".artifacts/execution-platform/proof-hardening-07-adversarial-entry-suite-proof.json",
      caseCount: result.caseResults.length,
      passedCaseCount: result.passedCaseCount,
      failedCaseCount: result.failedCaseCount,
      providerInvocationCount: result.providerInvocationCount,
      workerInvocationCount: result.workerInvocationCount,
      authoritySurfaceRetirementGate: result.authoritySurfaceRetirementGate,
      generalitySentinel: result.generalitySentinel,
      capabilityManifestConformance: result.capabilityManifestConformance,
      reasonCodes: result.reasonCodes,
    },
    null,
    2,
  ),
);

if (!result.pass) {
  process.exitCode = 1;
}
