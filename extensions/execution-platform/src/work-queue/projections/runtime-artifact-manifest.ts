import type { RuntimeJobArtifact } from "../../runtime-job-repository.ts";
import {
  RUNTIME_JOB_ARTIFACT_PAYLOAD_STORAGE_KIND,
  isRuntimeJobArtifactPayloadManifest,
} from "../../runtime-job-repository.ts";
import { boundedUniqueStringValues } from "./projection-utils.ts";

export function runtimeArtifactPayloadManifestSummary(artifacts: RuntimeJobArtifact[]): {
  artifactKind: "work_queue_runtime_artifact_payload_manifest_summary";
  manifestCount: number;
  payloadRefs: string[];
  artifactRefs: string[];
  artifactTypes: string[];
  totalPayloadBytes: number;
  hydrationToolId: "artifact.payload.get_json";
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
} {
  const manifests = artifacts.filter(
    (artifact) =>
      artifact.storageKind === RUNTIME_JOB_ARTIFACT_PAYLOAD_STORAGE_KIND &&
      isRuntimeJobArtifactPayloadManifest(artifact.metadata),
  );
  return {
    artifactKind: "work_queue_runtime_artifact_payload_manifest_summary",
    manifestCount: manifests.length,
    payloadRefs: boundedUniqueStringValues(
      manifests.map((artifact) => {
        const manifest = artifact.metadata;
        return isRuntimeJobArtifactPayloadManifest(manifest) ? manifest.payloadRef : null;
      }),
      30,
    ),
    artifactRefs: manifests.map((artifact) => artifact.uri).slice(0, 30),
    artifactTypes: boundedUniqueStringValues(
      manifests.map((artifact) => artifact.artifactType),
      30,
    ),
    totalPayloadBytes: manifests.reduce((total, artifact) => total + (artifact.sizeBytes ?? 0), 0),
    hydrationToolId: "artifact.payload.get_json",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}
