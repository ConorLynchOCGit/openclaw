// Content-addressed immutable evidence artifacts; cache data belongs in plugin-state instead.
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  createAcquisitionManifest,
  createClaimLedger,
  createComplianceEvent,
  stableJsonStringify,
  type XAcquisitionManifestV4,
  type XAcquisitionManifestV4Input,
  type XClaimLedgerV1,
  type XClaimLedgerV1Input,
  type XComplianceEventV1,
  type XComplianceEventV1Input,
} from "./contracts.js";

const ARTIFACT_RELATIVE_DIR = ["business-ops", "x-acquisition-manifests-v4"];
const ARTIFACT_REF_PREFIX = "artifacts/business-ops/x-acquisition-manifests-v4";

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

export function resolveEvidenceArtifactsDir(
  params: {
    env?: NodeJS.ProcessEnv;
    workspaceDir?: string;
  } = {},
): string {
  const env = params.env ?? process.env;
  const artifactsDir = env.OPENCLAW_ARTIFACTS_DIR?.trim();
  const workspaceDir =
    params.workspaceDir?.trim() ||
    env.OPENCLAW_WORKSPACE?.trim() ||
    env.OPENCLAW_WORKSPACE_DIR?.trim();
  if (!artifactsDir && !workspaceDir) {
    throw new Error("x evidence storage requires OPENCLAW_ARTIFACTS_DIR or a live workspace");
  }
  const root = artifactsDir ?? (workspaceDir ? path.join(workspaceDir, "artifacts") : undefined);
  if (!root) {
    throw new Error("x evidence storage root is unavailable");
  }
  return path.join(root, ...ARTIFACT_RELATIVE_DIR);
}

function digestText(text: string): string {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

async function writeContentAddressedArtifact<T extends XEvidenceArtifact>(params: {
  artifact: T;
  artifactsDir: string;
}): Promise<XEvidenceArtifactWriteResult<T>> {
  const text = `${stableJsonStringify(params.artifact)}\n`;
  const digest = digestText(text);
  const fileName = `${digest.slice("sha256:".length)}.json`;
  const artifactPath = path.join(params.artifactsDir, fileName);
  await fs.mkdir(params.artifactsDir, { recursive: true });

  const temporaryPath = path.join(
    params.artifactsDir,
    `.${fileName}.${process.pid}.${randomUUID()}.tmp`,
  );
  await fs.writeFile(temporaryPath, text, { encoding: "utf8", flag: "wx" });
  try {
    try {
      await fs.link(temporaryPath, artifactPath);
      return {
        artifact: params.artifact,
        digest,
        ref: `${ARTIFACT_REF_PREFIX}/${fileName}`,
        path: artifactPath,
        created: true,
      };
    } catch (error: unknown) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) {
        throw error;
      }
      const existing = await fs.readFile(artifactPath, "utf8");
      if (existing !== text || digestText(existing) !== digest) {
        throw new XEvidenceArtifactCollisionError(artifactPath);
      }
      return {
        artifact: params.artifact,
        digest,
        ref: `${ARTIFACT_REF_PREFIX}/${fileName}`,
        path: artifactPath,
        created: false,
      };
    }
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
}

export async function writeAcquisitionManifest(params: {
  input: XAcquisitionManifestV4Input;
  artifactsDir?: string;
  env?: NodeJS.ProcessEnv;
  workspaceDir?: string;
}): Promise<XEvidenceArtifactWriteResult<XAcquisitionManifestV4>> {
  return await writeContentAddressedArtifact({
    artifact: createAcquisitionManifest(params.input),
    artifactsDir:
      params.artifactsDir ??
      resolveEvidenceArtifactsDir({ env: params.env, workspaceDir: params.workspaceDir }),
  });
}

export async function writeComplianceEvent(params: {
  input: XComplianceEventV1Input;
  artifactsDir?: string;
  env?: NodeJS.ProcessEnv;
  workspaceDir?: string;
}): Promise<XEvidenceArtifactWriteResult<XComplianceEventV1>> {
  return await writeContentAddressedArtifact({
    artifact: createComplianceEvent(params.input),
    artifactsDir:
      params.artifactsDir ??
      resolveEvidenceArtifactsDir({ env: params.env, workspaceDir: params.workspaceDir }),
  });
}

export async function writeClaimLedger(params: {
  input: XClaimLedgerV1Input;
  artifactsDir?: string;
  env?: NodeJS.ProcessEnv;
  workspaceDir?: string;
}): Promise<XEvidenceArtifactWriteResult<XClaimLedgerV1>> {
  return await writeContentAddressedArtifact({
    artifact: createClaimLedger(params.input),
    artifactsDir:
      params.artifactsDir ??
      resolveEvidenceArtifactsDir({ env: params.env, workspaceDir: params.workspaceDir }),
  });
}
