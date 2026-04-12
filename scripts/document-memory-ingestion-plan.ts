import path from "node:path";
import {
  createDocumentMemoryIngestionService,
  createModelDrivenMemorySemanticInterpreterFromRunner,
  resolveMemoryMiddlewareConfig,
} from "../extensions/memory-middleware/runtime-api.js";
import { loadConfig } from "../src/config/config.js";
import { runEmbeddedPiAgent } from "../src/extensionAPI.js";

type ParsedArgs = {
  profileId?: string;
  projectId?: string;
  paths: string[];
};

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { paths: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--profile") {
      parsed.profileId = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--project") {
      parsed.projectId = argv[index + 1];
      index += 1;
      continue;
    }
    parsed.paths.push(arg);
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.paths.length === 0) {
    throw new Error(
      "usage: bun scripts/document-memory-ingestion-plan.ts [--profile <id>] [--project <id>] <path...>",
    );
  }

  const service = createDocumentMemoryIngestionService({
    config: resolveMemoryMiddlewareConfig({}),
    semanticInterpreter: createModelDrivenMemorySemanticInterpreterFromRunner({
      config: loadConfig(),
      runEmbeddedPiAgent,
    }),
  });

  const plan = await service.planDocuments(
    args.paths.map((entry) => ({
      path: path.resolve(entry),
      ...(args.profileId ? { profileId: args.profileId as never } : {}),
      ...(args.projectId ? { projectId: args.projectId } : {}),
    })),
  );

  process.stdout.write(
    JSON.stringify(
      {
        totals: plan.totals,
        documents: plan.documents.map((document) => ({
          path: document.source.path,
          profileId: document.source.profileId,
          sourceClass: document.source.sourceClass,
          counts: document.counts,
          candidates: document.candidates.map((candidate) => ({
            category: candidate.category,
            statement: candidate.canonicalCandidate.record.statement,
            lineStart: candidate.lineStart,
            lineEnd: candidate.lineEnd,
            headingPath: candidate.headingPath,
            duplicateCount: candidate.duplicateCount,
          })),
        })),
      },
      null,
      2,
    ),
  );
}

await main();
