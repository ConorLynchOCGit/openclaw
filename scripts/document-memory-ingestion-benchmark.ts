import { runDocumentMemoryIngestionBenchmark } from "../extensions/memory-middleware/runtime-api.js";

const report = await runDocumentMemoryIngestionBenchmark();
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
