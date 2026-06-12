import type {
  ContinuationPacket,
  ContinuationStrategy,
  ContinuationStrategyBuildParams,
  DiagnosticSummary,
} from "./types.js";

function stringFromRecord(record: Record<string, unknown> | undefined, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberFromRecord(record: Record<string, unknown> | undefined, key: string): number | null {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArrayFromRecord(record: Record<string, unknown> | undefined, key: string): string[] {
  const value = record?.[key];
  return Array.isArray(value)
    ? value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry.length > 0)
    : [];
}

function diagnosticSummariesFromTrace(
  trace: Record<string, unknown> | undefined,
): DiagnosticSummary[] {
  const diagnostics = stringArrayFromRecord(trace, "latestDiagnostics").slice(0, 12);
  return diagnostics.map((message) => ({ message }));
}

export const defaultContinuationStrategy: ContinuationStrategy = {
  id: "default",
  async build(params: ContinuationStrategyBuildParams): Promise<ContinuationPacket> {
    const instructions = [
      params.objective ? `Objective: ${params.objective}` : null,
      "Continue from the compacted conversation state.",
    ]
      .filter((line): line is string => typeof line === "string" && line.length > 0)
      .join("\n");
    return { instructions };
  },
};

export const executionNodeContinuationStrategy: ContinuationStrategy = {
  id: "execution-node",
  async build(params: ContinuationStrategyBuildParams): Promise<ContinuationPacket> {
    const trace = params.nodeTrace;
    const changedFiles = [
      ...stringArrayFromRecord(trace, "changedFiles"),
      ...stringArrayFromRecord(trace, "firstEditChangedFilePaths"),
    ].slice(0, 20);
    const firstChangedLine =
      numberFromRecord(trace, "firstEditLine") ??
      numberFromRecord(trace, "firstEditFirstChangedLine");
    const firstEditDiffAvailable = trace?.firstEditDiffAvailable === true;
    const firstEditDiffByteCount = numberFromRecord(trace, "firstEditDiffByteCount");
    const firstEditRef = stringFromRecord(trace, "firstEditRef");
    const changeSetRef = stringFromRecord(trace, "changeSetRef");
    const validationStateRef = stringFromRecord(trace, "validationStateRef");
    const sourceWindows = (
      await Promise.all(
        changedFiles.map(async (path) => {
          const content = await params.readSourceWindow?.({ path, line: firstChangedLine });
          return {
            path,
            ...(firstChangedLine !== null ? { startLine: firstChangedLine } : {}),
            ...(content ? { content } : {}),
          };
        }),
      )
    ).filter((window) => window.content || window.path);
    const diagnostics = [
      ...diagnosticSummariesFromTrace(trace),
      ...stringArrayFromRecord(trace, "firstEditDiagnosticSummaries")
        .slice(0, 12)
        .map((message) => ({ message })),
    ];
    const validationSignal = stringFromRecord(trace, "validationScoutResultRef");
    const hunkLines =
      changedFiles.length > 0 && (firstChangedLine !== null || firstEditDiffAvailable)
        ? changedFiles.map((path) =>
            [
              `- ${path}`,
              firstChangedLine !== null ? `firstChangedLine=${firstChangedLine}` : null,
              firstEditDiffAvailable ? "diffAvailable=true" : null,
              firstEditDiffByteCount !== null ? `diffByteCount=${firstEditDiffByteCount}` : null,
            ]
              .filter((part): part is string => typeof part === "string" && part.length > 0)
              .join(" "),
          )
        : [];
    const refLines = [
      firstEditRef ? `firstEditRef=${firstEditRef}` : null,
      changeSetRef ? `changeSetRef=${changeSetRef}` : null,
      validationStateRef ? `validationStateRef=${validationStateRef}` : null,
      validationSignal ? `validationScoutResultRef=${validationSignal}` : null,
    ].filter((line): line is string => typeof line === "string" && line.length > 0);
    const instructions = [
      params.existingInstructions,
      params.objective ? `Objective: ${params.objective}` : null,
      changedFiles.length > 0 ? `Changed files: ${changedFiles.join(", ")}` : null,
      hunkLines.length > 0 ? `<changed_hunks>\n${hunkLines.join("\n")}\n</changed_hunks>` : null,
      diagnostics.length > 0 ? "Use the diagnostics below as the next repair target." : null,
      validationSignal ? `Validation signal: ${validationSignal}` : null,
      refLines.length > 0 ? `<refs>\n${refLines.join("\n")}\n</refs>` : null,
      "Next action: edit, repair, validate, or finish. Do not restart broad discovery after compaction.",
    ]
      .filter((line): line is string => typeof line === "string" && line.trim().length > 0)
      .join("\n");
    return {
      instructions,
      ...(sourceWindows.length > 0 ? { sourceWindows } : {}),
      ...(changedFiles.length > 0 ? { changedFiles } : {}),
      ...(diagnostics.length > 0 ? { diagnostics } : {}),
    };
  },
};

export function renderContinuationPacket(packet: ContinuationPacket): string | undefined {
  const lines: string[] = [];
  lines.push("<compaction_repair_context>");
  if (packet.instructions?.trim()) {
    lines.push(packet.instructions.trim());
  }
  if (packet.changedFiles?.length) {
    lines.push("<changed_files>");
    lines.push(...packet.changedFiles.map((path) => `- ${path}`));
    lines.push("</changed_files>");
  }
  if (packet.diagnostics?.length) {
    lines.push("<diagnostics>");
    for (const diagnostic of packet.diagnostics) {
      const location =
        diagnostic.path || diagnostic.line !== undefined || diagnostic.column !== undefined
          ? `${diagnostic.path ?? ""}${diagnostic.line !== undefined ? `:${diagnostic.line}` : ""}${
              diagnostic.column !== undefined ? `:${diagnostic.column}` : ""
            } `
          : "";
      lines.push(
        `- ${location}${diagnostic.severity ? `${diagnostic.severity} ` : ""}${diagnostic.message}`,
      );
    }
    lines.push("</diagnostics>");
  }
  if (packet.sourceWindows?.length) {
    lines.push("<repair_windows>");
    for (const window of packet.sourceWindows) {
      lines.push(`<path>${window.path}</path>`);
      if (window.startLine !== undefined || window.endLine !== undefined) {
        lines.push(
          `<lines>${window.startLine ?? ""}${window.endLine !== undefined ? `-${window.endLine}` : ""}</lines>`,
        );
      }
      if (window.content?.trim()) {
        lines.push("<content>");
        lines.push(window.content.trimEnd());
        lines.push("</content>");
      }
    }
    lines.push("</repair_windows>");
  }
  lines.push("</compaction_repair_context>");
  return lines.length > 2 ? lines.join("\n") : undefined;
}
