import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  generateZeroCandidateTextSearchDiagnostic,
  renderZeroCandidateTextSearchDiagnosticMarkdown,
} from "../src/agents/model-memory.zero-candidate-text-search-diagnostic.ts";

async function main() {
  const report = await generateZeroCandidateTextSearchDiagnostic();
  const markdown = renderZeroCandidateTextSearchDiagnosticMarkdown(report);
  const evidenceDir = path.join(process.cwd(), "docs/projects/model-memory/evidence");
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(
    path.join(evidenceDir, "zero-candidate-text-search-diagnostic.json"),
    JSON.stringify(report, null, 2),
  );
  await writeFile(path.join(evidenceDir, "zero-candidate-text-search-diagnostic.md"), markdown);
  process.stdout.write(markdown);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
