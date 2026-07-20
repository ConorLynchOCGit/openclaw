// Resolves immutable accepted-release receipts and their content-addressed objects.
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { readLoadedReleaseIdentity } from "../release-manifest-readback.js";
import {
  isLowerHex,
  parseReleaseManifestBytes,
  type ReleaseManifest,
} from "../release-manifest.js";

export const ACCEPTED_RELEASE_RECEIPT_ID_ENV = "OPENCLAW_ACCEPTED_RELEASE_RECEIPT_ID";
export const RELEASE_STORE_ROOT_ENV = "OPENCLAW_RELEASE_STORE_ROOT";

const MAX_RECEIPT_BYTES = 1024 * 1024;
const MAX_RELEASE_MANIFEST_BYTES = 4 * 1024 * 1024;
const COPY_BUFFER_BYTES = 1024 * 1024;

export type AcceptedReleaseArtifact = {
  role: string;
  packageName: string;
  version: string;
  sha256: string;
  npmIntegrityOrShasum: string;
  packlistDigest: string;
  byteSize: number;
  contentAddressedLocation: string;
  fileName: string;
  filePath: string;
};

export type AcceptedReleaseReceipt = {
  receiptProtocolVersion: 1;
  releaseManifestDigest: string;
  loadedPredecessorManifestDigest: string;
  loadedPredecessorSourceObject: string;
  orderedArtifacts: AcceptedReleaseArtifact[];
  candidateEvidenceRef: string;
  candidateEvidenceDigest: string;
  terminalVerdict: "accepted";
  authorizationClass: "preauthorized_migration_free";
  authorizationRef: unknown;
  nativeSnapshotRef: string;
  acceptedSourceTag: string;
  acceptedSourceObject: string;
  createdAt: string;
  releasePreparationOperationId: string;
};

export type ResolvedAcceptedReleaseReceipt = {
  id: string;
  releaseStoreRoot: string;
  receipt: AcceptedReleaseReceipt;
  releaseManifest: ReleaseManifest;
  releaseManifestPath: string;
  coreArtifact: AcceptedReleaseArtifact;
  pluginArtifacts: AcceptedReleaseArtifact[];
};

type ImmutableFileIdentity = {
  sha256: string;
  byteSize: number;
  bytes?: Buffer;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, key: string, subject: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${subject} has an invalid ${key}`);
  }
  return value;
}

function requireExactKeys(
  record: Record<string, unknown>,
  expected: readonly string[],
  subject: string,
): void {
  const actual = Object.keys(record);
  const missing = expected.filter((key) => !Object.hasOwn(record, key));
  const unsupported = actual.filter((key) => !expected.includes(key));
  if (missing.length > 0 || unsupported.length > 0) {
    throw new Error(`${subject} does not match the supported receipt schema`);
  }
}

function requireDigest(record: Record<string, unknown>, key: string, subject: string): string {
  const value = requireString(record, key, subject);
  if (!isLowerHex(value, 64)) {
    throw new Error(`${subject} has an invalid ${key}`);
  }
  return value;
}

function requireGitObject(record: Record<string, unknown>, key: string, subject: string): string {
  const value = requireString(record, key, subject);
  if (!isLowerHex(value, [40, 64])) {
    throw new Error(`${subject} has an invalid ${key}`);
  }
  return value;
}

function requireProtocolVersion(record: Record<string, unknown>, key: string, subject: string): 1 {
  const value = record[key];
  if (value === 1) {
    return value;
  }
  throw new Error(`${subject} has an invalid ${key}`);
}

function requireReference(record: Record<string, unknown>, key: string, subject: string): unknown {
  if (!Object.hasOwn(record, key) || record[key] === null || record[key] === undefined) {
    throw new Error(`${subject} has an invalid ${key}`);
  }
  const value = record[key];
  if (typeof value === "string" && !value.trim()) {
    throw new Error(`${subject} has an invalid ${key}`);
  }
  if (typeof value !== "string" && !isRecord(value)) {
    throw new Error(`${subject} has an invalid ${key}`);
  }
  return value;
}

function requireSha256(value: string, subject: string): string {
  if (!isLowerHex(value, 64)) {
    throw new Error(`${subject} must be a lowercase SHA-256 digest`);
  }
  return value;
}

export function normalizeAcceptedReleaseReceiptId(value: string): string {
  return requireSha256(value, "accepted release receipt ID");
}

export function readAcceptedReleaseReceiptId(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env[ACCEPTED_RELEASE_RECEIPT_ID_ENV];
  if (value === undefined) {
    return null;
  }
  return normalizeAcceptedReleaseReceiptId(value);
}

export function resolveReleaseStoreRoot(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env[RELEASE_STORE_ROOT_ENV];
  if (!configured?.trim()) {
    throw new Error(`${RELEASE_STORE_ROOT_ENV} is required for accepted release activation`);
  }
  if (!path.isAbsolute(configured)) {
    throw new Error(`${RELEASE_STORE_ROOT_ENV} must be an absolute path`);
  }
  return path.resolve(configured);
}

function ensurePathWithinRoot(root: string, candidate: string, subject: string): void {
  const relative = path.relative(root, candidate);
  if (relative === "" || relative === ".") {
    throw new Error(`${subject} must name a file below the release store`);
  }
  if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    throw new Error(`${subject} escapes the release store`);
  }
}

async function assertPathHasNoLinks(params: {
  root: string;
  filePath: string;
  subject: string;
}): Promise<void> {
  ensurePathWithinRoot(params.root, params.filePath, params.subject);
  const rootStat = await fs.lstat(params.root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error("release store root must be a real directory");
  }

  const relative = path.relative(params.root, params.filePath);
  const parts = relative.split(path.sep);
  let current = params.root;
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink()) {
      throw new Error(`${params.subject} must not traverse symbolic links`);
    }
    if (index < parts.length - 1 && !stat.isDirectory()) {
      throw new Error(`${params.subject} has an invalid content-addressed path`);
    }
  }
}

async function readAndHashHandle(params: {
  handle: fs.FileHandle;
  includeBytes: boolean;
  maxBytes?: number;
  subject: string;
}): Promise<ImmutableFileIdentity> {
  const hash = createHash("sha256");
  const chunks: Buffer[] = [];
  const buffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
  let byteSize = 0;
  for (;;) {
    const { bytesRead } = await params.handle.read(buffer, 0, buffer.length, byteSize);
    if (bytesRead === 0) {
      break;
    }
    byteSize += bytesRead;
    if (params.maxBytes !== undefined && byteSize > params.maxBytes) {
      throw new Error(`${params.subject} exceeds the maximum supported size`);
    }
    const chunk = buffer.subarray(0, bytesRead);
    hash.update(chunk);
    if (params.includeBytes) {
      chunks.push(Buffer.from(chunk));
    }
  }
  return {
    sha256: hash.digest("hex"),
    byteSize,
    ...(params.includeBytes ? { bytes: Buffer.concat(chunks, byteSize) } : {}),
  };
}

async function inspectImmutableFile(params: {
  root: string;
  filePath: string;
  subject: string;
  includeBytes?: boolean;
  maxBytes?: number;
  expectedSha256?: string;
  expectedByteSize?: number;
}): Promise<ImmutableFileIdentity> {
  await assertPathHasNoLinks(params);
  const noFollowFlag = fsConstants.O_NOFOLLOW ?? 0;
  const handle = await fs.open(params.filePath, fsConstants.O_RDONLY | noFollowFlag);
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) {
      throw new Error(`${params.subject} must be a regular file`);
    }
    if (stat.nlink !== 1) {
      throw new Error(`${params.subject} must not have hard-link aliases`);
    }
    if ((stat.mode & 0o222) !== 0) {
      throw new Error(`${params.subject} must be non-writable`);
    }
    if (params.expectedByteSize !== undefined && stat.size !== params.expectedByteSize) {
      throw new Error(`${params.subject} byte size does not match the accepted receipt`);
    }
    const identity = await readAndHashHandle({
      handle,
      includeBytes: params.includeBytes === true,
      ...(params.maxBytes === undefined ? {} : { maxBytes: params.maxBytes }),
      subject: params.subject,
    });
    if (params.expectedByteSize !== undefined && identity.byteSize !== params.expectedByteSize) {
      throw new Error(`${params.subject} byte size changed while it was read`);
    }
    if (params.expectedSha256 !== undefined && identity.sha256 !== params.expectedSha256) {
      throw new Error(`${params.subject} SHA-256 does not match its content address`);
    }
    return identity;
  } finally {
    await handle.close();
  }
}

function parseJsonObject(bytes: Buffer, subject: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${subject} is not valid JSON`);
  }
  if (!isRecord(parsed)) {
    throw new Error(`${subject} must contain a JSON object`);
  }
  return parsed;
}

function resolveArtifactLocation(params: {
  releaseStoreRoot: string;
  sha256: string;
  contentAddressedLocation: string;
  subject: string;
}): { fileName: string; filePath: string } {
  if (
    path.isAbsolute(params.contentAddressedLocation) ||
    params.contentAddressedLocation.includes("\\") ||
    params.contentAddressedLocation.includes("\0")
  ) {
    throw new Error(`${params.subject} has an invalid content-addressed location`);
  }
  const filePath = path.resolve(params.releaseStoreRoot, params.contentAddressedLocation);
  ensurePathWithinRoot(params.releaseStoreRoot, filePath, params.subject);
  const relative = path.relative(params.releaseStoreRoot, filePath);
  const parts = relative.split(path.sep);
  const fileName = parts[3];
  if (
    parts.length !== 4 ||
    parts[0] !== "artifacts" ||
    parts[1] !== "sha256" ||
    parts[2] !== params.sha256 ||
    !fileName ||
    fileName === "." ||
    fileName === ".."
  ) {
    throw new Error(`${params.subject} is not at its exact content-addressed location`);
  }
  const expectedPath = path.join(
    params.releaseStoreRoot,
    "artifacts",
    "sha256",
    params.sha256,
    fileName,
  );
  if (filePath !== expectedPath) {
    throw new Error(`${params.subject} is not at its exact content-addressed location`);
  }
  return { fileName, filePath };
}

function parseArtifact(params: {
  value: unknown;
  index: number;
  releaseStoreRoot: string;
}): AcceptedReleaseArtifact {
  const subject = `accepted release artifact ${params.index + 1}`;
  if (!isRecord(params.value)) {
    throw new Error(`${subject} must be an object`);
  }
  requireExactKeys(
    params.value,
    [
      "role",
      "packageName",
      "version",
      "sha256",
      "npmIntegrityOrShasum",
      "packlistDigest",
      "byteSize",
      "contentAddressedLocation",
    ],
    subject,
  );
  const role = requireString(params.value, "role", subject);
  if (role !== "core" && role !== "plugin") {
    throw new Error(`${subject} has an invalid role`);
  }
  const packageName = requireString(params.value, "packageName", subject);
  const version = requireString(params.value, "version", subject);
  const sha256 = requireDigest(params.value, "sha256", subject);
  const npmIntegrityOrShasum = requireString(params.value, "npmIntegrityOrShasum", subject);
  const packlistDigest = requireDigest(params.value, "packlistDigest", subject);
  const byteSize = params.value.byteSize;
  if (typeof byteSize !== "number" || !Number.isSafeInteger(byteSize) || byteSize <= 0) {
    throw new Error(`${subject} has an invalid byteSize`);
  }
  const contentAddressedLocation = requireString(params.value, "contentAddressedLocation", subject);
  const location = resolveArtifactLocation({
    releaseStoreRoot: params.releaseStoreRoot,
    sha256,
    contentAddressedLocation,
    subject,
  });
  return {
    role,
    packageName,
    version,
    sha256,
    npmIntegrityOrShasum,
    packlistDigest,
    byteSize,
    contentAddressedLocation,
    ...location,
  };
}

function parseReceipt(
  raw: Record<string, unknown>,
  releaseStoreRoot: string,
): AcceptedReleaseReceipt {
  const subject = "accepted release receipt";
  requireExactKeys(
    raw,
    [
      "receiptProtocolVersion",
      "releaseManifestDigest",
      "loadedPredecessorManifestDigest",
      "loadedPredecessorSourceObject",
      "orderedArtifacts",
      "candidateEvidenceRef",
      "candidateEvidenceDigest",
      "terminalVerdict",
      "authorizationClass",
      "authorizationRef",
      "nativeSnapshotRef",
      "acceptedSourceTag",
      "acceptedSourceObject",
      "createdAt",
      "releasePreparationOperationId",
    ],
    subject,
  );
  const terminalVerdict = requireString(raw, "terminalVerdict", subject);
  if (terminalVerdict !== "accepted") {
    throw new Error("accepted release receipt does not have an accepted terminal verdict");
  }
  const authorizationClass = requireString(raw, "authorizationClass", subject);
  if (authorizationClass !== "preauthorized_migration_free") {
    throw new Error("accepted release receipt is not authorized for migration-free activation");
  }
  const artifactValues = raw.orderedArtifacts;
  if (!Array.isArray(artifactValues) || artifactValues.length === 0) {
    throw new Error("accepted release receipt must contain orderedArtifacts");
  }
  const orderedArtifacts = artifactValues.map((value, index) =>
    parseArtifact({ value, index, releaseStoreRoot }),
  );
  const artifactIdentities = new Set<string>();
  const artifactPaths = new Set<string>();
  for (const artifact of orderedArtifacts) {
    const identity = `${artifact.role}\0${artifact.packageName}`;
    if (artifactIdentities.has(identity) || artifactPaths.has(artifact.filePath)) {
      throw new Error("accepted release receipt contains duplicate artifacts");
    }
    artifactIdentities.add(identity);
    artifactPaths.add(artifact.filePath);
  }

  const createdAt = requireString(raw, "createdAt", subject);
  if (!Number.isFinite(Date.parse(createdAt))) {
    throw new Error("accepted release receipt has an invalid createdAt");
  }

  return {
    receiptProtocolVersion: requireProtocolVersion(raw, "receiptProtocolVersion", subject),
    releaseManifestDigest: requireDigest(raw, "releaseManifestDigest", subject),
    loadedPredecessorManifestDigest: requireDigest(raw, "loadedPredecessorManifestDigest", subject),
    loadedPredecessorSourceObject: requireGitObject(raw, "loadedPredecessorSourceObject", subject),
    orderedArtifacts,
    candidateEvidenceRef: requireString(raw, "candidateEvidenceRef", subject),
    candidateEvidenceDigest: requireDigest(raw, "candidateEvidenceDigest", subject),
    terminalVerdict: "accepted",
    authorizationClass,
    authorizationRef: requireReference(raw, "authorizationRef", subject),
    nativeSnapshotRef: requireString(raw, "nativeSnapshotRef", subject),
    acceptedSourceTag: requireString(raw, "acceptedSourceTag", subject),
    acceptedSourceObject: requireGitObject(raw, "acceptedSourceObject", subject),
    createdAt,
    releasePreparationOperationId: requireString(raw, "releasePreparationOperationId", subject),
  };
}

function parseAcceptedReleaseManifest(bytes: Buffer): ReleaseManifest {
  let manifest: ReleaseManifest;
  try {
    manifest = parseReleaseManifestBytes(bytes);
  } catch {
    throw new Error("accepted release manifest does not match the supported schema");
  }
  if (manifest.migration.class !== "migration_free") {
    throw new Error("accepted release manifest is not migration_free");
  }
  return manifest;
}

function assertManifestReceiptAgreement(params: {
  receipt: AcceptedReleaseReceipt;
  manifest: ReleaseManifest;
  coreArtifact: AcceptedReleaseArtifact;
}): void {
  if (
    params.manifest.predecessor.releaseManifestDigest !==
      params.receipt.loadedPredecessorManifestDigest ||
    params.manifest.predecessor.sourceTreeObject !== params.receipt.loadedPredecessorSourceObject
  ) {
    throw new Error("accepted release manifest predecessor does not match its receipt");
  }
  if (
    params.manifest.source.snapshotRef !== params.receipt.nativeSnapshotRef ||
    params.manifest.source.treeObject !== params.receipt.acceptedSourceObject
  ) {
    throw new Error("accepted release manifest source does not match its receipt");
  }
  if (params.manifest.package.version !== params.coreArtifact.version) {
    throw new Error("accepted core artifact version does not match the release manifest");
  }
  if (params.manifest.artifacts.length !== params.receipt.orderedArtifacts.length) {
    throw new Error("accepted artifact set does not match the release manifest");
  }
  for (const [index, manifestArtifact] of params.manifest.artifacts.entries()) {
    const receiptArtifact = params.receipt.orderedArtifacts[index];
    if (
      !receiptArtifact ||
      receiptArtifact.role !== manifestArtifact.role ||
      receiptArtifact.packageName !== manifestArtifact.packageName ||
      receiptArtifact.version !== manifestArtifact.packageVersion
    ) {
      throw new Error("accepted artifact order does not match the release manifest");
    }
  }
  const requiredPluginIds = new Set(params.manifest.loadedReadiness.requiredPluginIds);
  const ownedPluginIds = new Set(
    params.manifest.artifacts.flatMap((artifact) => artifact.ownedPluginIds),
  );
  for (const pluginId of requiredPluginIds) {
    if (!ownedPluginIds.has(pluginId)) {
      throw new Error(`required plugin ${pluginId} has no accepted artifact owner`);
    }
  }
  for (const artifact of params.manifest.artifacts.filter(({ role }) => role === "plugin")) {
    if (!artifact.ownedPluginIds.some((pluginId) => requiredPluginIds.has(pluginId))) {
      throw new Error(`accepted plugin package ${artifact.packageName} owns no required plugin`);
    }
  }
}

export async function verifyAcceptedReleaseArtifact(
  artifact: AcceptedReleaseArtifact,
  releaseStoreRoot: string,
): Promise<void> {
  await inspectImmutableFile({
    root: releaseStoreRoot,
    filePath: artifact.filePath,
    subject: `accepted release artifact ${artifact.role}`,
    expectedSha256: artifact.sha256,
    expectedByteSize: artifact.byteSize,
  });
}

export async function resolveAcceptedReleaseReceipt(params: {
  acceptedReleaseReceiptId: string;
  env?: NodeJS.ProcessEnv;
  releaseStoreRoot?: string;
}): Promise<ResolvedAcceptedReleaseReceipt> {
  const id = normalizeAcceptedReleaseReceiptId(params.acceptedReleaseReceiptId);
  if (params.releaseStoreRoot && !path.isAbsolute(params.releaseStoreRoot)) {
    throw new Error("accepted release store root must be absolute");
  }
  const releaseStoreRoot = params.releaseStoreRoot
    ? path.resolve(params.releaseStoreRoot)
    : resolveReleaseStoreRoot(params.env);
  if (!path.isAbsolute(releaseStoreRoot)) {
    throw new Error("accepted release store root must be absolute");
  }

  const receiptPath = path.join(releaseStoreRoot, "receipts", "sha256", `${id}.json`);
  const receiptIdentity = await inspectImmutableFile({
    root: releaseStoreRoot,
    filePath: receiptPath,
    subject: "accepted release receipt",
    includeBytes: true,
    maxBytes: MAX_RECEIPT_BYTES,
    expectedSha256: id,
  });
  const receipt = parseReceipt(
    parseJsonObject(receiptIdentity.bytes ?? Buffer.alloc(0), "accepted release receipt"),
    releaseStoreRoot,
  );

  const releaseManifestPath = path.join(
    releaseStoreRoot,
    "manifests",
    "sha256",
    `${receipt.releaseManifestDigest}.json`,
  );
  const manifestIdentity = await inspectImmutableFile({
    root: releaseStoreRoot,
    filePath: releaseManifestPath,
    subject: "accepted release manifest",
    includeBytes: true,
    maxBytes: MAX_RELEASE_MANIFEST_BYTES,
    expectedSha256: receipt.releaseManifestDigest,
  });
  const releaseManifest = parseAcceptedReleaseManifest(manifestIdentity.bytes ?? Buffer.alloc(0));

  const coreArtifacts = receipt.orderedArtifacts.filter((artifact) => artifact.role === "core");
  if (coreArtifacts.length !== 1) {
    throw new Error("accepted release receipt must contain exactly one core artifact");
  }
  const coreArtifact = coreArtifacts[0];
  if (!coreArtifact) {
    throw new Error("accepted release receipt is missing its core artifact");
  }
  assertManifestReceiptAgreement({ receipt, manifest: releaseManifest, coreArtifact });

  return {
    id,
    releaseStoreRoot,
    receipt,
    releaseManifest,
    releaseManifestPath,
    coreArtifact,
    pluginArtifacts: receipt.orderedArtifacts.filter((artifact) => artifact !== coreArtifact),
  };
}

function acceptedArtifactSetIdentity(resolved: ResolvedAcceptedReleaseReceipt): string {
  return JSON.stringify(
    resolved.receipt.orderedArtifacts.map((artifact) => ({
      role: artifact.role,
      packageName: artifact.packageName,
      version: artifact.version,
      sha256: artifact.sha256,
      npmIntegrityOrShasum: artifact.npmIntegrityOrShasum,
      packlistDigest: artifact.packlistDigest,
      byteSize: artifact.byteSize,
      contentAddressedLocation: artifact.contentAddressedLocation,
    })),
  );
}

/**
 * Resolve immutable acceptance history for the exact manifest loaded by N.
 * This is release-preparation lookup, not an active-release pointer.
 */
export async function resolveAcceptedReleaseForLoadedManifest(params: {
  releaseManifestDigest: string;
  env?: NodeJS.ProcessEnv;
  releaseStoreRoot?: string;
}): Promise<ResolvedAcceptedReleaseReceipt> {
  const releaseManifestDigest = requireSha256(
    params.releaseManifestDigest,
    "loaded release manifest digest",
  );
  const releaseStoreRoot = params.releaseStoreRoot
    ? path.resolve(params.releaseStoreRoot)
    : resolveReleaseStoreRoot(params.env);
  const receiptDirectory = path.join(releaseStoreRoot, "receipts", "sha256");
  const entries = await fs.readdir(receiptDirectory, { withFileTypes: true });
  const receiptIds = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name.slice(0, -".json".length))
    .filter((id) => isLowerHex(id, 64))
    .toSorted();
  const matches: ResolvedAcceptedReleaseReceipt[] = [];
  for (const acceptedReleaseReceiptId of receiptIds) {
    const resolved = await resolveAcceptedReleaseReceipt({
      acceptedReleaseReceiptId,
      releaseStoreRoot,
    });
    if (resolved.receipt.releaseManifestDigest === releaseManifestDigest) {
      matches.push(resolved);
    }
  }
  const first = matches[0];
  if (!first) {
    throw new Error("loaded release has no immutable accepted receipt history");
  }
  const artifactSet = acceptedArtifactSetIdentity(first);
  if (matches.some((candidate) => acceptedArtifactSetIdentity(candidate) !== artifactSet)) {
    throw new Error("loaded release manifest has conflicting accepted artifact histories");
  }
  return first;
}

export async function readEmbeddedReleaseManifestIdentity(packageRoot: string): Promise<{
  releaseManifestDigest: string;
  sourceTreeObject: string;
  packageVersion: string;
  packageShape: string;
}> {
  try {
    const identity = readLoadedReleaseIdentity(packageRoot);
    return {
      releaseManifestDigest: identity.releaseManifestDigest,
      sourceTreeObject: identity.sourceTreeObject,
      packageVersion: identity.packageVersion,
      packageShape: identity.packageShape,
    };
  } catch {
    throw new Error("installed package does not expose a valid embedded release manifest");
  }
}

export async function assertAcceptedReleasePredecessor(params: {
  packageRoot: string;
  receipt: AcceptedReleaseReceipt;
}): Promise<void> {
  const loaded = await readEmbeddedReleaseManifestIdentity(params.packageRoot);
  if (
    loaded.releaseManifestDigest !== params.receipt.loadedPredecessorManifestDigest ||
    loaded.sourceTreeObject !== params.receipt.loadedPredecessorSourceObject
  ) {
    throw new Error("loaded release manifest no longer matches the accepted predecessor");
  }
}

export function assertAcceptedReleaseCandidateIsDistinct(params: {
  predecessorManifest: ReleaseManifest;
  resolvedReceipt: ResolvedAcceptedReleaseReceipt;
}): void {
  if (
    params.resolvedReceipt.receipt.releaseManifestDigest ===
    params.resolvedReceipt.receipt.loadedPredecessorManifestDigest
  ) {
    throw new Error("accepted release candidate reuses the predecessor manifest");
  }
  if (
    params.resolvedReceipt.releaseManifest.package.version ===
    params.predecessorManifest.package.version
  ) {
    throw new Error("accepted release candidate reuses the predecessor package version");
  }
}

export async function assertAcceptedReleaseCandidate(params: {
  packageRoot: string;
  resolvedReceipt: ResolvedAcceptedReleaseReceipt;
}): Promise<void> {
  const loaded = await readEmbeddedReleaseManifestIdentity(params.packageRoot);
  if (
    loaded.releaseManifestDigest !== params.resolvedReceipt.receipt.releaseManifestDigest ||
    loaded.sourceTreeObject !== params.resolvedReceipt.releaseManifest.source.treeObject ||
    loaded.packageVersion !== params.resolvedReceipt.coreArtifact.version ||
    loaded.packageShape !== params.resolvedReceipt.releaseManifest.package.shape
  ) {
    throw new Error("installed package manifest does not match the accepted release");
  }
}

export async function copyAcceptedReleaseArtifactToStage(params: {
  artifact: AcceptedReleaseArtifact;
  releaseStoreRoot: string;
  stageRoot: string;
}): Promise<string> {
  const destinationDir = path.join(
    params.stageRoot,
    ".openclaw-accepted-release",
    params.artifact.sha256,
  );
  await fs.mkdir(destinationDir, { recursive: true, mode: 0o700 });
  const destination = path.join(destinationDir, params.artifact.fileName);
  const noFollowFlag = fsConstants.O_NOFOLLOW ?? 0;

  await assertPathHasNoLinks({
    root: params.releaseStoreRoot,
    filePath: params.artifact.filePath,
    subject: `accepted release artifact ${params.artifact.role}`,
  });
  const source = await fs.open(params.artifact.filePath, fsConstants.O_RDONLY | noFollowFlag);
  let target: fs.FileHandle | undefined;
  try {
    const sourceStat = await source.stat();
    if (
      !sourceStat.isFile() ||
      sourceStat.nlink !== 1 ||
      (sourceStat.mode & 0o222) !== 0 ||
      sourceStat.size !== params.artifact.byteSize
    ) {
      throw new Error(`accepted release artifact ${params.artifact.role} changed before staging`);
    }
    target = await fs.open(
      destination,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | noFollowFlag,
      0o400,
    );
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
    let position = 0;
    for (;;) {
      const { bytesRead } = await source.read(buffer, 0, buffer.length, position);
      if (bytesRead === 0) {
        break;
      }
      const chunk = buffer.subarray(0, bytesRead);
      await target.write(chunk, 0, bytesRead, position);
      hash.update(chunk);
      position += bytesRead;
    }
    await target.sync();
    if (position !== params.artifact.byteSize || hash.digest("hex") !== params.artifact.sha256) {
      throw new Error(
        `accepted release artifact ${params.artifact.role} failed its staged SHA-256 or byte-size check`,
      );
    }
  } catch (error) {
    await fs.rm(destination, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    await target?.close().catch(() => undefined);
    await source.close();
  }

  await inspectImmutableFile({
    root: params.stageRoot,
    filePath: destination,
    subject: `staged accepted release artifact ${params.artifact.role}`,
    expectedSha256: params.artifact.sha256,
    expectedByteSize: params.artifact.byteSize,
  });
  return destination;
}

/** Re-open and verify a staged copy immediately before a native installer consumes it. */
export async function verifyStagedAcceptedReleaseArtifact(params: {
  artifact: AcceptedReleaseArtifact;
  stageRoot: string;
  filePath: string;
}): Promise<void> {
  await inspectImmutableFile({
    root: path.resolve(params.stageRoot),
    filePath: path.resolve(params.filePath),
    subject: `staged accepted release artifact ${params.artifact.role}`,
    expectedSha256: params.artifact.sha256,
    expectedByteSize: params.artifact.byteSize,
  });
}
