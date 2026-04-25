import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileExists } from "../infra/archive.js";
import {
  downloadClawHubSkillArchive,
  fetchClawHubSkillDetail,
  resolveClawHubBaseUrl,
  type ClawHubSkillDetail,
} from "../infra/clawhub.js";
import { formatErrorMessage } from "../infra/errors.js";
import { withExtractedArchiveRoot } from "../infra/install-flow.js";
import { resolveSafeInstallDir, safePathSegmentHashed } from "../infra/install-safe-path.js";
import { scanSkillInstallSource } from "../plugins/install-security-scan.js";

export type SkillTrustTier =
  | "bundled_trusted"
  | "local_trusted"
  | "third_party_staged"
  | "quarantined_rejected";

export type ClawHubSkillReviewOutcome = "install" | "reject";
export type ClawHubSkillReviewScopeMode =
  | "search_only"
  | "quarantine_review"
  | "blocked_on_acquisition";

export type ClawHubSkillStageManifest = {
  version: 1;
  source: "clawhub";
  registry: string;
  catalogId: string;
  slug: string;
  resolvedVersion: string;
  displayName?: string;
  summary?: string;
  ownerHandle?: string | null;
  ownerDisplayName?: string | null;
  stagedAt: number;
  trustTier: SkillTrustTier;
  outcome: ClawHubSkillReviewOutcome;
  reviewScopeMode: ClawHubSkillReviewScopeMode;
  reportPath: string;
  quarantineDir: string;
  skillDir: string;
  integrity?: string;
  fingerprint?: string;
  scan: {
    status: "clear" | "blocked" | "failed";
    reason?: string;
  };
};

export type VetClawHubSkillResult =
  | {
      ok: true;
      source: "clawhub";
      catalogId: string;
      slug: string;
      version: string;
      trustTier: SkillTrustTier;
      outcome: ClawHubSkillReviewOutcome;
      reportPath: string;
      quarantineDir: string;
      skillDir: string;
      manifest: ClawHubSkillStageManifest;
    }
  | { ok: false; error: string };

type Logger = {
  info?: (message: string) => void;
};

const CLAWHUB_SOURCE = "clawhub";
const VALID_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;
// eslint-disable-next-line no-control-regex -- rejects non-printable/non-ascii homograph slugs
const NON_ASCII_PATTERN = /[^\x00-\x7F]/;
const SKILL_VETTING_REPORT_RELATIVE_DIR = "docs/projects/skills-system/skill-vetting/reports";
const SKILL_VETTING_QUARANTINE_RELATIVE_DIR = ".artifacts/skills/quarantine";
const STAGE_MANIFEST_FILENAME = "stage.json";

function normalizeTrackedSlug(raw: string): string {
  const slug = raw.trim();
  if (!slug || slug.includes("/") || slug.includes("\\") || slug.includes("..")) {
    throw new Error(`Invalid skill slug: ${raw}`);
  }
  return slug;
}

function normalizeVersionSegment(raw: string): string {
  const value = raw.trim();
  if (!value) {
    throw new Error("Missing skill version.");
  }
  return safePathSegmentHashed(value);
}

function formatClawHubCatalogId(slug: string): string {
  return `${CLAWHUB_SOURCE}:${normalizeTrackedSlug(slug)}`;
}

function validateRequestedSlug(raw: string): string {
  const slug = normalizeTrackedSlug(raw);
  if (NON_ASCII_PATTERN.test(slug) || !VALID_SLUG_PATTERN.test(slug)) {
    throw new Error(`Invalid skill slug: ${raw}`);
  }
  return slug;
}

function resolveClawHubCatalogRef(
  params: { slug?: string; catalogId?: string },
  opts?: { allowLegacyTrackedSlug?: boolean },
) {
  const catalogIdRaw = params.catalogId?.trim();
  if (catalogIdRaw) {
    const normalized = catalogIdRaw.startsWith(`${CLAWHUB_SOURCE}:`)
      ? catalogIdRaw
      : `${CLAWHUB_SOURCE}:${catalogIdRaw}`;
    const [, rawSlug] = normalized.split(":", 2);
    if (!rawSlug) {
      throw new Error(`Invalid ClawHub catalog id: ${catalogIdRaw}`);
    }
    const slug = opts?.allowLegacyTrackedSlug
      ? normalizeTrackedSlug(rawSlug)
      : validateRequestedSlug(rawSlug);
    return {
      source: CLAWHUB_SOURCE,
      catalogId: formatClawHubCatalogId(slug),
      slug,
    };
  }
  if (params.slug?.trim()) {
    const slug = opts?.allowLegacyTrackedSlug
      ? normalizeTrackedSlug(params.slug)
      : validateRequestedSlug(params.slug);
    return {
      source: CLAWHUB_SOURCE,
      catalogId: formatClawHubCatalogId(slug),
      slug,
    };
  }
  throw new Error("Missing ClawHub slug or catalogId.");
}

export function resolveSkillOpsRoots(workspaceDir: string) {
  const resolvedWorkspaceDir = path.resolve(workspaceDir);
  return {
    workspaceDir: resolvedWorkspaceDir,
    reportRoot: path.join(resolvedWorkspaceDir, SKILL_VETTING_REPORT_RELATIVE_DIR),
    quarantineRoot: path.join(resolvedWorkspaceDir, SKILL_VETTING_QUARANTINE_RELATIVE_DIR),
  };
}

function resolveClawHubQuarantineDir(params: {
  workspaceDir: string;
  slug: string;
  version: string;
}): string {
  const { quarantineRoot } = resolveSkillOpsRoots(params.workspaceDir);
  const slugDir = resolveSafeInstallDir({
    baseDir: quarantineRoot,
    id: params.slug,
    invalidNameMessage: "invalid skill quarantine path",
  });
  if (!slugDir.ok) {
    throw new Error(slugDir.error);
  }
  const versionDir = resolveSafeInstallDir({
    baseDir: slugDir.path,
    id: normalizeVersionSegment(params.version),
    invalidNameMessage: "invalid skill quarantine version path",
  });
  if (!versionDir.ok) {
    throw new Error(versionDir.error);
  }
  return versionDir.path;
}

function resolveStageManifestPath(quarantineDir: string): string {
  return path.join(quarantineDir, STAGE_MANIFEST_FILENAME);
}

function resolveSkillReviewReportPath(params: { workspaceDir: string; slug: string }): string {
  const { reportRoot } = resolveSkillOpsRoots(params.workspaceDir);
  const dateStamp = new Date().toISOString().slice(0, 10);
  return path.join(reportRoot, `${dateStamp}-${params.slug}-review.md`);
}

async function computeDirectoryFingerprint(rootDir: string): Promise<string> {
  const digest = createHash("sha256");
  const queue = [rootDir];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    const entries = await fs.readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const relativePath = path.relative(rootDir, fullPath).split(path.sep).join("/");
      digest.update(relativePath);
      digest.update("\n");
      digest.update(await fs.readFile(fullPath));
      digest.update("\n");
    }
  }
  return digest.digest("hex");
}

function resolveRiskTier(outcome: ClawHubSkillReviewOutcome): "low" | "high" {
  return outcome === "install" ? "low" : "high";
}

function buildSkillReviewReportMarkdown(params: {
  detail: ClawHubSkillDetail;
  manifest: ClawHubSkillStageManifest;
}) {
  const generatedAtIso = new Date(params.manifest.stagedAt).toISOString();
  const lines = [
    "---",
    `summary: "Operator-facing review for ${params.manifest.slug}."`,
    `title: "Skill Review: ${params.manifest.slug}"`,
    "review:",
    `  slug: ${params.manifest.slug}`,
    `  version: ${params.manifest.resolvedVersion}`,
    `  outcome: ${params.manifest.outcome}`,
    `  riskTier: ${resolveRiskTier(params.manifest.outcome)}`,
    `  generatedAt: ${generatedAtIso}`,
    "---",
    "",
    `# Skill Review: ${params.manifest.slug}`,
    "",
    "## Acquisition record",
    `- Skill slug: ${params.manifest.slug}`,
    `- Version: ${params.manifest.resolvedVersion}`,
    `- Source: ${params.manifest.source}`,
    `- Search path used: openclaw skills search`,
    `- Acquisition path used: openclaw skills vet`,
    `- Whether force was required: false`,
    `- Quarantine path: ${params.manifest.quarantineDir}`,
    `- Review scope mode: ${params.manifest.reviewScopeMode}`,
    "",
    "## Provenance",
    `- Catalog id: ${params.manifest.catalogId}`,
    `- Registry: ${params.manifest.registry}`,
    `- Display name: ${params.detail.skill?.displayName ?? params.manifest.displayName ?? params.manifest.slug}`,
    `- Owner: ${params.detail.owner?.handle ?? params.manifest.ownerHandle ?? "unknown"}`,
    `- Integrity: ${params.manifest.integrity ?? "missing"}`,
    `- Fingerprint: ${params.manifest.fingerprint ?? "missing"}`,
    "",
    "## Trust",
    `- Trust tier: ${params.manifest.trustTier}`,
    "",
    "## Scan result",
    `- Status: ${params.manifest.scan.status}`,
    `- Reason: ${params.manifest.scan.reason ?? "no blocking findings"}`,
    "",
    "## Decision",
    `- Outcome: ${params.manifest.outcome}`,
    `- Activation: ${params.manifest.outcome === "install" ? "allowed after vetted stage" : "reject; do not install into active workspace"}`,
    "",
    "## Artifact retention",
    "- Report stays under docs/projects/skills-system/skill-vetting/reports/.",
    "- Quarantine output stays under .artifacts/skills/quarantine/ and is not an active skill root.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

async function ensureWritableSkillOpsRoots(workspaceDir: string): Promise<void> {
  const roots = resolveSkillOpsRoots(workspaceDir);
  await fs.mkdir(roots.reportRoot, { recursive: true });
  await fs.mkdir(roots.quarantineRoot, { recursive: true });
}

async function writeClawHubSkillStageManifest(manifest: ClawHubSkillStageManifest): Promise<void> {
  await fs.mkdir(manifest.quarantineDir, { recursive: true });
  await fs.writeFile(
    resolveStageManifestPath(manifest.quarantineDir),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}

export async function readClawHubSkillStageManifest(params: {
  workspaceDir: string;
  slug: string;
  version: string;
}): Promise<ClawHubSkillStageManifest | null> {
  const quarantineDir = resolveClawHubQuarantineDir(params);
  const manifestPath = resolveStageManifestPath(quarantineDir);
  try {
    const parsed = JSON.parse(await fs.readFile(manifestPath, "utf8")) as ClawHubSkillStageManifest;
    if (
      parsed?.version === 1 &&
      parsed.source === CLAWHUB_SOURCE &&
      parsed.slug === params.slug &&
      parsed.resolvedVersion === params.version
    ) {
      return parsed;
    }
  } catch {
    // ignore malformed or missing stage metadata
  }
  return null;
}

function resolveInstalledClawHubTrustTier(params: {
  hasOrigin: boolean;
  reviewed: boolean;
  fingerprint: boolean;
  integrity: boolean;
}): SkillTrustTier {
  if (!params.hasOrigin) {
    return "local_trusted";
  }
  if (params.reviewed && params.fingerprint && params.integrity) {
    return "local_trusted";
  }
  return "third_party_staged";
}

export function resolveSkillTrustTierFromOrigin(params: {
  source: string;
  baseDir: string;
}): SkillTrustTier {
  if (params.source === "openclaw-bundled") {
    return "bundled_trusted";
  }
  const originPath = path.join(params.baseDir, ".clawhub", "origin.json");
  try {
    const parsed = JSON.parse(readFileSync(originPath, "utf8")) as Partial<{
      source: string;
      review: { gate?: string };
      integrity: string;
      fingerprint: string;
    }>;
    if (parsed.source === CLAWHUB_SOURCE) {
      return resolveInstalledClawHubTrustTier({
        hasOrigin: true,
        reviewed: Boolean(parsed.review?.gate),
        fingerprint: Boolean(parsed.fingerprint),
        integrity: Boolean(parsed.integrity),
      });
    }
  } catch {
    // ignore missing origin metadata
  }
  return "local_trusted";
}

async function materializeQuarantineSkill(params: {
  workspaceDir: string;
  slug: string;
  version: string;
  archivePath: string;
}): Promise<{ quarantineDir: string; skillDir: string }> {
  const quarantineDir = resolveClawHubQuarantineDir({
    workspaceDir: params.workspaceDir,
    slug: params.slug,
    version: params.version,
  });
  const skillDir = path.join(quarantineDir, "skill");
  await fs.rm(quarantineDir, { recursive: true, force: true });
  await fs.mkdir(quarantineDir, { recursive: true });
  await withExtractedArchiveRoot({
    archivePath: params.archivePath,
    tempDirPrefix: "openclaw-skill-vet-",
    timeoutMs: 120_000,
    rootMarkers: ["SKILL.md"],
    onExtracted: async (rootDir) => {
      await fs.cp(rootDir, skillDir, {
        recursive: true,
        verbatimSymlinks: true,
      });
      return { ok: true as const };
    },
  });
  return { quarantineDir, skillDir };
}

export async function vetClawHubSkill(params: {
  workspaceDir: string;
  slug?: string;
  catalogId?: string;
  version?: string;
  baseUrl?: string;
  logger?: Logger;
  allowLegacyTrackedSlug?: boolean;
}): Promise<VetClawHubSkillResult> {
  try {
    await ensureWritableSkillOpsRoots(params.workspaceDir);
    const identity = resolveClawHubCatalogRef(
      {
        slug: params.slug,
        catalogId: params.catalogId,
      },
      { allowLegacyTrackedSlug: params.allowLegacyTrackedSlug },
    );
    const detail = await fetchClawHubSkillDetail({
      slug: identity.slug,
      baseUrl: params.baseUrl,
    });
    if (!detail.skill) {
      return {
        ok: false,
        error: `Skill "${identity.slug}" not found on ClawHub.`,
      };
    }
    const resolvedVersion = params.version ?? detail.latestVersion?.version;
    if (!resolvedVersion) {
      return {
        ok: false,
        error: `Skill "${identity.slug}" has no installable version.`,
      };
    }

    params.logger?.info?.(`Vetting ${identity.slug}@${resolvedVersion} from ClawHub…`);
    const archive = await downloadClawHubSkillArchive({
      slug: identity.slug,
      version: resolvedVersion,
      baseUrl: params.baseUrl,
    });
    try {
      const { quarantineDir, skillDir } = await materializeQuarantineSkill({
        workspaceDir: params.workspaceDir,
        slug: identity.slug,
        version: resolvedVersion,
        archivePath: archive.archivePath,
      });
      const scanResult = await scanSkillInstallSource({
        logger: {
          warn: (message) => params.logger?.info?.(message),
        },
        origin: CLAWHUB_SOURCE,
        skillName: identity.slug,
        sourceDir: skillDir,
        installId: "clawhub-vet",
      });
      const outcome: ClawHubSkillReviewOutcome = scanResult?.blocked ? "reject" : "install";
      const trustTier: SkillTrustTier =
        outcome === "install" ? "third_party_staged" : "quarantined_rejected";
      const stagedAt = Date.now();
      const manifest: ClawHubSkillStageManifest = {
        version: 1,
        source: CLAWHUB_SOURCE,
        registry: resolveClawHubBaseUrl(params.baseUrl),
        catalogId: identity.catalogId,
        slug: identity.slug,
        resolvedVersion,
        displayName: detail.skill.displayName,
        summary: detail.skill.summary,
        ownerHandle: detail.owner?.handle ?? null,
        ownerDisplayName: detail.owner?.displayName ?? null,
        stagedAt,
        trustTier,
        outcome,
        reviewScopeMode: "quarantine_review",
        reportPath: resolveSkillReviewReportPath({
          workspaceDir: params.workspaceDir,
          slug: identity.slug,
        }),
        quarantineDir,
        skillDir,
        integrity: archive.integrity,
        fingerprint: await computeDirectoryFingerprint(skillDir),
        scan: scanResult?.blocked
          ? {
              status: scanResult.blocked.code === "security_scan_failed" ? "failed" : "blocked",
              reason: scanResult.blocked.reason,
            }
          : { status: "clear" },
      };
      await writeClawHubSkillStageManifest(manifest);
      await fs.writeFile(
        manifest.reportPath,
        buildSkillReviewReportMarkdown({ detail, manifest }),
        "utf8",
      );
      return {
        ok: true,
        source: CLAWHUB_SOURCE,
        catalogId: identity.catalogId,
        slug: identity.slug,
        version: resolvedVersion,
        trustTier,
        outcome,
        reportPath: manifest.reportPath,
        quarantineDir,
        skillDir,
        manifest,
      };
    } finally {
      await archive.cleanup().catch(() => undefined);
    }
  } catch (err) {
    return {
      ok: false,
      error: formatErrorMessage(err),
    };
  }
}

export async function resolveClawHubSkillStageForInstall(params: {
  workspaceDir: string;
  slug?: string;
  catalogId?: string;
  version?: string;
  baseUrl?: string;
  logger?: Logger;
  allowLegacyTrackedSlug?: boolean;
}): Promise<
  | {
      ok: true;
      slug: string;
      version: string;
      manifest: ClawHubSkillStageManifest;
    }
  | { ok: false; error: string }
> {
  try {
    const identity = resolveClawHubCatalogRef(
      {
        slug: params.slug,
        catalogId: params.catalogId,
      },
      { allowLegacyTrackedSlug: params.allowLegacyTrackedSlug },
    );
    const detail = await fetchClawHubSkillDetail({
      slug: identity.slug,
      baseUrl: params.baseUrl,
    });
    if (!detail.skill) {
      return {
        ok: false,
        error: `Skill "${identity.slug}" not found on ClawHub.`,
      };
    }
    const resolvedVersion = params.version ?? detail.latestVersion?.version;
    if (!resolvedVersion) {
      return {
        ok: false,
        error: `Skill "${identity.slug}" has no installable version.`,
      };
    }

    let manifest = await readClawHubSkillStageManifest({
      workspaceDir: params.workspaceDir,
      slug: identity.slug,
      version: resolvedVersion,
    });
    if (!manifest || !(await fileExists(manifest.skillDir))) {
      const vetted = await vetClawHubSkill({
        workspaceDir: params.workspaceDir,
        slug: identity.slug,
        catalogId: identity.catalogId,
        version: resolvedVersion,
        baseUrl: params.baseUrl,
        logger: params.logger,
        allowLegacyTrackedSlug: params.allowLegacyTrackedSlug,
      });
      if (!vetted.ok) {
        return vetted;
      }
      manifest = vetted.manifest;
    }

    if (manifest.outcome !== "install") {
      return {
        ok: false,
        error: `Skill review rejected ${identity.slug}@${manifest.resolvedVersion}. See ${manifest.reportPath}`,
      };
    }

    return {
      ok: true,
      slug: identity.slug,
      version: resolvedVersion,
      manifest,
    };
  } catch (err) {
    return {
      ok: false,
      error: formatErrorMessage(err),
    };
  }
}
