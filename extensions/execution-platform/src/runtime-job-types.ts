export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type RuntimeJobArtifact = {
  artifactId: string;
  jobId: string;
  artifactType: string;
  storageKind: string;
  uri: string;
  contentType: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  metadata: JsonValue;
  createdAt: Date;
};

export type RuntimeJobArtifactPayload = {
  payloadRef: string;
  jobId: string;
  artifactType: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  body: JsonValue;
  createdAt: Date;
};

export type AttachRuntimeJobArtifactInput = {
  artifactId?: string;
  jobId: string;
  artifactType: string;
  storageKind: string;
  uri: string;
  contentType?: string | null;
  sizeBytes?: number | null;
  sha256?: string | null;
  metadata?: JsonValue;
};

export type AttachRuntimeJobJsonPayloadArtifactInput = {
  artifactId?: string;
  jobId: string;
  artifactType: string;
  uri: string;
  contentType?: string;
  body: JsonValue;
  boundedSummary?: string | null;
  targetCommitmentIds?: string[];
  targetNodeIds?: string[];
  resourcePacketKind?: string | null;
  readinessStatus?: string | null;
  reasonCodes?: string[];
  inputCounts?: JsonValue;
  outputCounts?: JsonValue;
  maxBounds?: JsonValue;
  createdBy?: string | null;
  metadata?: Record<string, JsonValue>;
};
