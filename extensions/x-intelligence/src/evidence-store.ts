// Content-addressed immutable evidence artifacts; cache data belongs in plugin-state instead.
import { createHash } from "node:crypto";
import path from "node:path";
import { root } from "openclaw/plugin-sdk/file-access-runtime";
import {
  createAcquisitionManifest,
  createClaimLedger,
  createComplianceEvent,
  stableJsonStringify,
  X_MAX_EVIDENCE_ARTIFACT_BYTES,
  type XAcquisitionManifestV4,
  type XAcquisitionManifestV4Input,
  type XClaimLedgerV1,
  type XClaimLedgerV1Input,
  type XComplianceEventV1,
  type XComplianceEventV1Input,
} from "./contracts.js";

const ARTIFACT_RELATIVE_DIR = ["artifacts", "business-ops", "x-acquisition-manifests-v4"];
const ARTIFACT_REF_PREFIX = ARTIFACT_RELATIVE_DIR.join("/");

export type XEvidenceArtifact = XAcquisitionManifestV4 | XClaimLedgerV1 | XComplianceEventV1;

export type XEvidenceArtifactWriteResult<T extends XEvidenceArtifact> = Readonly<{
  artifact: T;
  digest: string;
  ref: string;
  path: string;
  created: boolean;
}>;

export class XEvidenceArtifactCollisionError extends Error {
  constructor(readonly artifactPath: string) {
    super(`evidence artifact collision at ${artifactPath}`);
    this.name = "XEvidenceArtifactCollisionError";
  }
}

function resolveEvidenceWorkspaceDir(
  params: {
    env?: NodeJS.ProcessEnv;
    workspaceDir?: string;
  } = {},
): string {
  const env = params.env ?? process.env;
  const workspaceDir = params.workspaceDir?.trim() || env.OPENCLAW_WORKSPACE_DIR?.trim();
  if (!workspaceDir) {
    throw new Error("x evidence storage requires workspaceDir or OPENCLAW_WORKSPACE_DIR");
  }
  if (!path.isAbsolute(workspaceDir)) {
    throw new Error("x evidence storage requires an absolute workspace directory");
  }
  return path.normalize(workspaceDir);
}

export function resolveEvidenceArtifactsDir(
  params: {
    env?: NodeJS.ProcessEnv;
    workspaceDir?: string;
  } = {},
): string {
  return path.join(resolveEvidenceWorkspaceDir(params), ...ARTIFACT_RELATIVE_DIR);
}

function digestText(text: string): string {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

async function writeContentAddressedArtifact<T extends XEvidenceArtifact>(params: {
  artifact: T;
  workspaceDir: string;
}): Promise<XEvidenceArtifactWriteResult<T>> {
  const text = `${stableJsonStringify(params.artifact)}\n`;
  const digest = digestText(text);
  const fileName = `${digest.slice("sha256:".length)}.json`;
  const ref = `${ARTIFACT_REF_PREFIX}/${fileName}`;
  const artifactPath = path.join(params.workspaceDir, ...ARTIFACT_RELATIVE_DIR, fileName);
  const workspaceRoot = await root(params.workspaceDir, {
    hardlinks: "reject",
    maxBytes: X_MAX_EVIDENCE_ARTIFACT_BYTES,
    mkdir: true,
    mode: 0o600,
    symlinks: "reject",
  });
  try {
    await workspaceRoot.create(ref, text);
    return {
      artifact: params.artifact,
      digest,
      ref,
      path: artifactPath,
      created: true,
    };
  } catch (error: unknown) {
    if (
      !(error && typeof error === "object" && "code" in error && error.code === "already-exists")
    ) {
      throw error;
    }
    const existing = await workspaceRoot.readText(ref);
    if (existing !== text || digestText(existing) !== digest) {
      throw new XEvidenceArtifactCollisionError(artifactPath);
    }
    return {
      artifact: params.artifact,
      digest,
      ref,
      path: artifactPath,
      created: false,
    };
  }
}

export async function writeAcquisitionManifest(params: {
  input: XAcquisitionManifestV4Input;
  env?: NodeJS.ProcessEnv;
  workspaceDir?: string;
}): Promise<XEvidenceArtifactWriteResult<XAcquisitionManifestV4>> {
  return await writeContentAddressedArtifact({
    artifact: createAcquisitionManifest(params.input),
    workspaceDir: resolveEvidenceWorkspaceDir({
      env: params.env,
      workspaceDir: params.workspaceDir,
    }),
  });
}

export async function writeComplianceEvent(params: {
  input: XComplianceEventV1Input;
  env?: NodeJS.ProcessEnv;
  workspaceDir?: string;
}): Promise<XEvidenceArtifactWriteResult<XComplianceEventV1>> {
  return await writeContentAddressedArtifact({
    artifact: createComplianceEvent(params.input),
    workspaceDir: resolveEvidenceWorkspaceDir({
      env: params.env,
      workspaceDir: params.workspaceDir,
    }),
  });
}

export async function writeClaimLedger(params: {
  input: XClaimLedgerV1Input;
  env?: NodeJS.ProcessEnv;
  workspaceDir?: string;
}): Promise<XEvidenceArtifactWriteResult<XClaimLedgerV1>> {
  return await writeContentAddressedArtifact({
    artifact: createClaimLedger(params.input),
    workspaceDir: resolveEvidenceWorkspaceDir({
      env: params.env,
      workspaceDir: params.workspaceDir,
    }),
  });
}
