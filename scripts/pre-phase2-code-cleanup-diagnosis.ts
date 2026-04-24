import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeCodeCleanupDiagnosisArtifacts } from "./lib/pre-phase2-code-cleanup-diagnosis.ts";

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function readArgValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

async function main() {
  const root = repoRoot();
  const date = new Date().toISOString().slice(0, 10);
  const artifactRoot =
    readArgValue(process.argv, "--artifact-root") ??
    path.join(root, ".artifacts", "refactor-prephase2", date, "diagnosis");
  const result = await writeCodeCleanupDiagnosisArtifacts({
    repoRoot: root,
    artifactRoot,
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        artifactRoot: result.report.artifactRoot,
        report: result.jsonPath,
        summary: result.markdownPath,
        firstWave: result.report.backlog.map((entry) => ({
          id: entry.id,
          title: entry.title,
          priorityScore: entry.priorityScore,
        })),
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
