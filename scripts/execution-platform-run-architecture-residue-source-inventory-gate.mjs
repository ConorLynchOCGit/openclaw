#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactNamespace = "source-inventory-domain-lifecycle-residue-gate";
const artifactDir = path.join(root, ".artifacts/execution-platform", artifactNamespace);
const fullReportRef =
  "artifact://execution-platform/source-inventory-domain-lifecycle-residue-gate/full-report.json";

function sha256(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

async function writeJson(name, value) {
  await fs.mkdir(artifactDir, { recursive: true });
  const body = `${JSON.stringify(value, null, 2)}\n`;
  const target = path.join(artifactDir, name);
  await fs.writeFile(target, body, "utf8");
  return {
    path: path.relative(root, target),
    ref: `artifact://execution-platform/${artifactNamespace}/${name}`,
    sha256: `sha256:${sha256(body)}`,
    bytes: Buffer.byteLength(body, "utf8"),
  };
}

async function main() {
  const inventoryModule = await tsImport(
    path.join(
      root,
      "extensions/execution-platform/src/workflows/architecture-residue-source-inventory.ts",
    ),
    import.meta.url,
  );
  const report = inventoryModule.runArchitectureResidueSourceInventory({
    repoRoot: root,
    fullReportRef,
  });
  const fullReport = await writeJson("full-report.json", report);
  const manifest = {
    ...report.manifest,
    fullReportRef: fullReport.ref,
    fullReportHash: fullReport.sha256,
    fullReportBytes: fullReport.bytes,
  };
  inventoryModule.assertArchitectureResidueSourceInventoryManifestMetadata(manifest);
  const manifestArtifact = await writeJson("manifest.json", manifest);

  console.log(
    JSON.stringify(
      {
        status: report.status,
        hardFailureCount: report.hardFailureCount,
        blockedSurvivorRefCount: report.blockedSurvivorRefCount,
        survivorRefCount: report.survivorRefCount,
        lineReduction: report.lineReduction,
        manifestArtifact,
        fullReport,
        topSurvivorFiles: manifest.topSurvivorFiles,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
      null,
      2,
    ),
  );

  if (report.status !== "passed") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        status: "failed",
        errorName: error?.name ?? "unknown_error",
        errorSummary: String(error?.message ?? error).slice(0, 1_200),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
