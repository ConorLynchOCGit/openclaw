#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const DEFAULT_OUTPUT_ROOT = ".artifacts/execution-platform";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const root = repoRoot();
  const inputPath = readArg("--input");
  if (!inputPath) {
    throw new Error("--input is required and must point to a bounded JSON closeout input file");
  }
  const input = JSON.parse(await readFile(path.resolve(root, inputPath), "utf8"));
  const outputRoot = path.resolve(root, readArg("--output-root") ?? DEFAULT_OUTPUT_ROOT);
  const proofPath = path.resolve(
    root,
    readArg("--proof") ??
      path.join(path.relative(root, outputRoot), "manual-closeout-8p-correction-proof.json"),
  );
  const { ManualWorkEpisodeCloseoutService } = await tsImport(
    path.join(root, "src/infra/manual-work-episode-closeout.ts"),
    import.meta.url,
  );
  const service = new ManualWorkEpisodeCloseoutService({
    artifactRoot: readArg("--artifact-root"),
    cwd: root,
  });
  const result = await service.emit(input);
  const proof = await service.buildProof(result, input);
  await service.writeProof({ proof, proofPath });
  console.log(
    JSON.stringify(
      {
        ok: true,
        proofPath,
        ...proof,
      },
      null,
      2,
    ),
  );
}

await main();
