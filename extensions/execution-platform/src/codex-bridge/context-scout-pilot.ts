import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";

export type ContextScoutArtifact = {
  artifactKind: "agent_team_context_scout";
  compatibilityStatus: "legacy_diagnostic_only";
  productionSuccessEvidence: false;
  scoutId: string;
  runtimeJobId: string;
  teamRunId: string;
  objective: string;
  relevantFiles: string[];
  existingPatterns: string[];
  knownConstraints: string[];
  risks: string[];
  suggestedImplementationPath: string[];
  unknowns: string[];
  filesNotToTouch: string[];
  readOnly: true;
  writeAccessGranted: false;
  forbiddenAuthorityRequested: false;
  rawPromptStored: false;
  rawResponseStored: false;
};

export function createContextScoutArtifact(
  input: Omit<
    ContextScoutArtifact,
    | "artifactKind"
    | "compatibilityStatus"
    | "productionSuccessEvidence"
    | "readOnly"
    | "writeAccessGranted"
    | "forbiddenAuthorityRequested"
    | "rawPromptStored"
    | "rawResponseStored"
  >,
): ContextScoutArtifact {
  return {
    artifactKind: "agent_team_context_scout",
    compatibilityStatus: "legacy_diagnostic_only",
    productionSuccessEvidence: false,
    ...input,
    readOnly: true,
    writeAccessGranted: false,
    forbiddenAuthorityRequested: false,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

export function compareContextScoutToImplementation(input: {
  scout: ContextScoutArtifact;
  actualFilesChanged: string[];
}): {
  suggestedFilesTouched: string[];
  unexpectedFilesTouched: string[];
  filesNotToTouchViolated: string[];
  handoffQuality: "satisfied" | "needs_review";
} {
  const suggested = new Set(input.scout.relevantFiles);
  const notToTouch = new Set(input.scout.filesNotToTouch);
  const suggestedFilesTouched = input.actualFilesChanged.filter((file) => suggested.has(file));
  const unexpectedFilesTouched = input.actualFilesChanged.filter((file) => !suggested.has(file));
  const filesNotToTouchViolated = input.actualFilesChanged.filter((file) => notToTouch.has(file));
  return {
    suggestedFilesTouched,
    unexpectedFilesTouched,
    filesNotToTouchViolated,
    handoffQuality:
      filesNotToTouchViolated.length === 0 && suggestedFilesTouched.length > 0
        ? "satisfied"
        : "needs_review",
  };
}

export async function recordContextScoutArtifact(input: {
  runtimeJobs: RuntimeJobRepository;
  artifact: ContextScoutArtifact;
}): Promise<void> {
  const metadata = input.artifact as unknown as JsonValue;
  await input.runtimeJobs.attachArtifact({
    jobId: input.artifact.runtimeJobId,
    artifactType: "agent_team.context_scout_legacy_diagnostic",
    storageKind: "metadata",
    uri: `runtime-job://${input.artifact.runtimeJobId}/agent-team/context-scout/${input.artifact.scoutId}`,
    contentType: "application/json",
    sizeBytes: Buffer.byteLength(JSON.stringify(metadata), "utf8"),
    metadata,
  });
  await input.runtimeJobs.recordEvent({
    jobId: input.artifact.runtimeJobId,
    eventType: "agent_team.context_scout_legacy_diagnostic_recorded",
    data: {
      scoutId: input.artifact.scoutId,
      relevantFileCount: input.artifact.relevantFiles.length,
      compatibilityStatus: "legacy_diagnostic_only",
      productionSuccessEvidence: false,
    },
  });
}
