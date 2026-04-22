import type {
  MmV2ProofCaseResult,
  MmV2ProofCorpusResult,
  MmV2ProofReport,
} from "./proof-runner-core.ts";

export type MmV2AdjudicationLabel =
  | "unreviewed"
  | "model_wrong"
  | "expectation_wrong"
  | "comparator_too_strict"
  | "write_policy_simulation_wrong";

export type MmV2AdjudicationEntry = {
  caseId: string;
  runMode: MmV2ProofCaseResult["runMode"];
  modelMetadata: MmV2ProofCaseResult["modelMetadata"];
  failedPhases: MmV2ProofCaseResult["failedPhases"];
  failedChecks: MmV2ProofCaseResult["failedChecks"];
  mismatchExcerpts: string[];
  simulatedWriteSummary: MmV2ProofCaseResult["writeSimulation"]["summary"];
  adjudicationLabel: MmV2AdjudicationLabel;
  reviewerNotes: string;
};

function renderMismatchExcerpts(result: MmV2ProofCaseResult): string[] {
  const excerpts: string[] = [];
  for (const phase of result.phaseResults.filter((phaseResult) => !phaseResult.pass)) {
    for (const mismatch of phase.mismatches.slice(0, 3)) {
      excerpts.push(`${phase.phase}:${mismatch.code}:${mismatch.message}`);
    }
  }
  for (const mismatch of result.writePolicyComparison.mismatches.slice(0, 3)) {
    excerpts.push(`write_policy:${mismatch.code}:${mismatch.message}`);
  }
  return excerpts;
}

export function buildAdjudicationEntries(
  report: Pick<MmV2ProofReport, "results"> | Pick<MmV2ProofCorpusResult, "results">,
): MmV2AdjudicationEntry[] {
  return report.results
    .filter((result) => !result.pass)
    .map((result) => ({
      caseId: result.caseId,
      runMode: result.runMode,
      modelMetadata: result.modelMetadata,
      failedPhases: result.failedPhases,
      failedChecks: result.failedChecks,
      mismatchExcerpts: renderMismatchExcerpts(result),
      simulatedWriteSummary: result.writeSimulation.summary,
      adjudicationLabel: "unreviewed",
      reviewerNotes: "",
    }));
}

export function renderAdjudicationMarkdown(entries: MmV2AdjudicationEntry[]): string {
  const lines = ["# MMV2 Adjudication Review", ""];
  if (entries.length === 0) {
    lines.push("- No failed cases required adjudication.");
    return lines.join("\n");
  }

  for (const entry of entries) {
    lines.push(`## ${entry.caseId}`);
    lines.push(`- Run mode: ${entry.runMode}`);
    lines.push(`- Requested model: ${entry.modelMetadata.requestedModelId}`);
    lines.push(
      `- Resolved models: ${
        entry.modelMetadata.resolvedModelIds.length > 0
          ? entry.modelMetadata.resolvedModelIds.join(", ")
          : "none recorded"
      }`,
    );
    lines.push(
      `- Failed phases: ${entry.failedPhases.length > 0 ? entry.failedPhases.join(", ") : "none"}`,
    );
    lines.push(
      `- Failed checks: ${entry.failedChecks.length > 0 ? entry.failedChecks.join(", ") : "none"}`,
    );
    lines.push(`- Adjudication label: ${entry.adjudicationLabel}`);
    lines.push(
      `- Simulated write summary: realistic=${entry.simulatedWriteSummary.realisticDurableMemoryCount}, shadow=${entry.simulatedWriteSummary.shadowDurableMemoryCount}, overstatement=${entry.simulatedWriteSummary.overstatementCount}`,
    );
    lines.push("- Mismatch excerpts:");
    for (const excerpt of entry.mismatchExcerpts) {
      lines.push(`  - ${excerpt}`);
    }
    lines.push("- Reviewer notes:");
    lines.push("  - ");
    lines.push("");
  }

  return lines.join("\n");
}
