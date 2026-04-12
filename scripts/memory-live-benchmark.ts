import {
  createModelDrivenMemorySemanticInterpreterFromRunner,
  resolveMemoryMiddlewareConfig,
  runMemorySemanticGoldCorpusBenchmark,
  evaluateMemorySemanticCalibration,
} from "../extensions/memory-middleware/runtime-api.js";
import { loadConfig } from "../src/config/config.js";
import { runEmbeddedPiAgent } from "../src/extensionAPI.js";

async function main() {
  const benchmark = await runMemorySemanticGoldCorpusBenchmark({
    config: resolveMemoryMiddlewareConfig({}),
    interpreter: createModelDrivenMemorySemanticInterpreterFromRunner({
      config: loadConfig(),
      runEmbeddedPiAgent,
    }),
  });
  const calibration = evaluateMemorySemanticCalibration({
    report: benchmark,
  });

  process.stdout.write(
    JSON.stringify(
      {
        readiness: benchmark.readiness,
        calibration,
        caseResults: benchmark.caseResults.map((result) => ({
          id: result.benchmarkCase.id,
          pass: result.pass,
          matchedCandidateIds: result.matchedCandidateIds,
          issues: result.issues,
          actual: result.actual,
        })),
      },
      null,
      2,
    ),
  );
}

await main();
