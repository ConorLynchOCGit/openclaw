import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileExists } from "../infra/archive.js";
import {
  fetchClawHubSkillDetail,
  resolveClawHubBaseUrl,
  searchClawHubSkills,
  type ClawHubSkillDetail,
  type ClawHubSkillSearchResult,
} from "../infra/clawhub.js";
import { formatErrorMessage } from "../infra/errors.js";
import { installPackageDir } from "../infra/install-package-dir.js";
import { resolveSafeInstallDir } from "../infra/install-safe-path.js";
import { resolveClawHubSkillStageForInstall, type SkillTrustTier } from "./skills-vetting.js";

const DOT_DIR = ".clawhub";
const LEGACY_DOT_DIR = ".clawdhub";
const SKILL_ORIGIN_RELATIVE_PATH = path.join(DOT_DIR, "origin.json");
export const CLAWHUB_SOURCE = "clawhub";

export type ClawHubSkillOrigin = {
  version: 2;
  source: typeof CLAWHUB_SOURCE;
  registry: string;
  catalogId: string;
  slug: string;
  installedSkillKey: string;
  installedVersion: string;
  installedAt: number;
  integrity?: string;
  fingerprint?: string;
  displayName?: string;
  summary?: string;
  ownerHandle?: string | null;
  ownerDisplayName?: string | null;
  trustTier?: SkillTrustTier;
  review?: {
    gate: "install_scan" | "vet_scan";
    reviewedAt: number;
    reviewedVersion: string;
    reportPath?: string;
  };
};

export type ClawHubSkillsLockfile = {
  version: 1;
  skills: Record<
    string,
    {
      version: string;
      installedAt: number;
    }
  >;
};

export type InstallClawHubSkillResult =
  | {
      ok: true;
      source: typeof CLAWHUB_SOURCE;
      catalogId: string;
      slug: string;
      version: string;
      targetDir: string;
      installedSkillKey: string;
      detail: ClawHubSkillDetail;
    }
  | { ok: false; error: string };

export type UpdateClawHubSkillResult =
  | {
      ok: true;
      slug: string;
      previousVersion: string | null;
      version: string;
      changed: boolean;
      targetDir: string;
    }
  | { ok: false; error: string };

type Logger = {
  info?: (message: string) => void;
};

const VALID_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;
// eslint-disable-next-line no-control-regex -- detects any character outside printable ASCII
const NON_ASCII_PATTERN = /[^\x00-\x7F]/;

function normalizeTrackedSlug(raw: string): string {
  const slug = raw.trim();
  if (!slug || slug.includes("/") || slug.includes("\\") || slug.includes("..")) {
    throw new Error(`Invalid skill slug: ${raw}`);
  }
  return slug;
}

export function formatClawHubCatalogId(slug: string): string {
  return `${CLAWHUB_SOURCE}:${normalizeTrackedSlug(slug)}`;
}

export function resolveClawHubCatalogRef(params: {
  slug?: string;
  catalogId?: string;
}): ClawHubSkillCatalogRef {
  const catalogIdRaw = params.catalogId?.trim();
  if (catalogIdRaw) {
    const normalized = catalogIdRaw.startsWith(`${CLAWHUB_SOURCE}:`)
      ? catalogIdRaw
      : `${CLAWHUB_SOURCE}:${catalogIdRaw}`;
    const [, rawSlug] = normalized.split(":", 2);
    if (!rawSlug) {
      throw new Error(`Invalid ClawHub catalog id: ${catalogIdRaw}`);
    }
    const slug = normalizeTrackedSlug(rawSlug);
    return {
      source: CLAWHUB_SOURCE,
      catalogId: formatClawHubCatalogId(slug),
      slug,
    };
  }
  if (params.slug?.trim()) {
    const slug = normalizeTrackedSlug(params.slug);
    return {
      source: CLAWHUB_SOURCE,
      catalogId: formatClawHubCatalogId(slug),
      slug,
    };
  }
  throw new Error("Missing ClawHub slug or catalogId.");
}

function validateRequestedClawHubCatalogRef(params: {
  slug?: string;
  catalogId?: string;
}): ClawHubSkillCatalogRef {
  const identity = resolveClawHubCatalogRef(params);
  const slug = validateRequestedSlug(identity.slug);
  return {
    source: CLAWHUB_SOURCE,
    catalogId: formatClawHubCatalogId(slug),
    slug,
  };
}

function validateRequestedSlug(raw: string): string {
  const slug = normalizeTrackedSlug(raw);
  if (NON_ASCII_PATTERN.test(slug) || !VALID_SLUG_PATTERN.test(slug)) {
    throw new Error(`Invalid skill slug: ${raw}`);
  }
  return slug;
}

async function resolveRequestedUpdateSlug(params: {
  workspaceDir: string;
  requestedSlug: string;
  lock: ClawHubSkillsLockfile;
}): Promise<string> {
  const trackedSlug = normalizeTrackedSlug(params.requestedSlug);
  const trackedTargetDir = resolveSkillInstallDir(params.workspaceDir, trackedSlug);
  const trackedOrigin = await readClawHubSkillOrigin(trackedTargetDir);
  if (trackedOrigin || params.lock.skills[trackedSlug]) {
    return trackedSlug;
  }
  return validateRequestedSlug(params.requestedSlug);
}

type ClawHubInstallParams = {
  workspaceDir: string;
  slug?: string;
  catalogId?: string;
  version?: string;
  baseUrl?: string;
  force?: boolean;
  logger?: Logger;
  allowLegacyTrackedSlug?: boolean;
};

export type ClawHubSkillCatalogRef = {
  source: typeof CLAWHUB_SOURCE;
  catalogId: string;
  slug: string;
};

export type ClawHubSkillSearchEntry = ClawHubSkillSearchResult & ClawHubSkillCatalogRef;

export type TrackedClawHubSkillInstall = {
  source: typeof CLAWHUB_SOURCE;
  catalogId: string;
  slug: string;
  installedSkillKey: string;
  targetDir: string;
  registry: string;
  installedVersion: string | null;
  installedAt: number | null;
  integrity?: string;
  fingerprint?: string;
  displayName?: string;
  summary?: string;
  ownerHandle?: string | null;
  ownerDisplayName?: string | null;
  trustTier?: SkillTrustTier;
  review?: {
    gate: "install_scan" | "vet_scan";
    reviewedAt: number;
    reviewedVersion: string;
    reportPath?: string;
  };
};

type TrackedUpdateTarget =
  | {
      ok: true;
      slug: string;
      baseUrl?: string;
      previousVersion: string | null;
    }
  | {
      ok: false;
      slug: string;
      error: string;
    };

function resolveSkillInstallDir(workspaceDir: string, slug: string): string {
  const skillsDir = path.join(path.resolve(workspaceDir), "skills");
  const target = resolveSafeInstallDir({
    baseDir: skillsDir,
    id: slug,
    invalidNameMessage: "invalid skill target path",
  });
  if (!target.ok) {
    throw new Error(target.error);
  }
  return target.path;
}

async function ensureSkillRoot(rootDir: string): Promise<void> {
  for (const candidate of ["SKILL.md", "skill.md", "skills.md", "SKILL.MD"]) {
    if (await fileExists(path.join(rootDir, candidate))) {
      return;
    }
  }
  throw new Error("downloaded archive is missing SKILL.md");
}

export async function readClawHubSkillsLockfile(
  workspaceDir: string,
): Promise<ClawHubSkillsLockfile> {
  const candidates = [
    path.join(workspaceDir, DOT_DIR, "lock.json"),
    path.join(workspaceDir, LEGACY_DOT_DIR, "lock.json"),
  ];
  for (const candidate of candidates) {
    try {
      const raw = JSON.parse(
        await fs.readFile(candidate, "utf8"),
      ) as Partial<ClawHubSkillsLockfile>;
      if (raw.version === 1 && raw.skills && typeof raw.skills === "object") {
        return {
          version: 1,
          skills: raw.skills,
        };
      }
    } catch {
      // ignore
    }
  }
  return { version: 1, skills: {} };
}

export async function writeClawHubSkillsLockfile(
  workspaceDir: string,
  lockfile: ClawHubSkillsLockfile,
): Promise<void> {
  const targetPath = path.join(workspaceDir, DOT_DIR, "lock.json");
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `${JSON.stringify(lockfile, null, 2)}\n`, "utf8");
}

export async function readClawHubSkillOrigin(skillDir: string): Promise<ClawHubSkillOrigin | null> {
  const candidates = [
    path.join(skillDir, DOT_DIR, "origin.json"),
    path.join(skillDir, LEGACY_DOT_DIR, "origin.json"),
  ];
  for (const candidate of candidates) {
    try {
      const raw = JSON.parse(await fs.readFile(candidate, "utf8")) as Partial<ClawHubSkillOrigin>;
      if (
        raw.version === 2 &&
        raw.source === CLAWHUB_SOURCE &&
        typeof raw.registry === "string" &&
        typeof raw.catalogId === "string" &&
        typeof raw.slug === "string" &&
        typeof raw.installedSkillKey === "string" &&
        typeof raw.installedVersion === "string" &&
        typeof raw.installedAt === "number"
      ) {
        return raw as ClawHubSkillOrigin;
      }
      const legacy = raw as Partial<{
        version: 1;
        registry: string;
        slug: string;
        installedVersion: string;
        installedAt: number;
      }>;
      if (
        legacy.version === 1 &&
        typeof legacy.registry === "string" &&
        typeof legacy.slug === "string" &&
        typeof legacy.installedVersion === "string" &&
        typeof legacy.installedAt === "number"
      ) {
        return {
          version: 2,
          source: CLAWHUB_SOURCE,
          registry: legacy.registry,
          catalogId: formatClawHubCatalogId(legacy.slug),
          slug: legacy.slug,
          installedSkillKey: path.basename(path.resolve(skillDir)),
          installedVersion: legacy.installedVersion,
          installedAt: legacy.installedAt,
        };
      }
    } catch {
      // ignore
    }
  }
  return null;
}

export async function writeClawHubSkillOrigin(
  skillDir: string,
  origin: ClawHubSkillOrigin,
): Promise<void> {
  const targetPath = path.join(skillDir, SKILL_ORIGIN_RELATIVE_PATH);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `${JSON.stringify(origin, null, 2)}\n`, "utf8");
}

export async function searchSkillsFromClawHub(params: {
  query?: string;
  limit?: number;
  baseUrl?: string;
}): Promise<ClawHubSkillSearchEntry[]> {
  const results = await searchClawHubSkills({
    query: params.query?.trim() || "*",
    limit: params.limit,
    baseUrl: params.baseUrl,
  });
  return results.map((entry) => ({
    ...entry,
    source: CLAWHUB_SOURCE,
    catalogId: formatClawHubCatalogId(entry.slug),
  }));
}

export async function fetchSkillDetailFromClawHub(params: {
  slug?: string;
  catalogId?: string;
  baseUrl?: string;
}): Promise<ClawHubSkillDetail & ClawHubSkillCatalogRef> {
  const identity = resolveClawHubCatalogRef(params);
  const detail = await fetchClawHubSkillDetail({
    slug: identity.slug,
    baseUrl: params.baseUrl,
  });
  return {
    ...detail,
    ...identity,
  };
}

async function resolveInstallVersion(params: {
  slug?: string;
  catalogId?: string;
  version?: string;
  baseUrl?: string;
  allowLegacyTrackedSlug?: boolean;
}): Promise<{ detail: ClawHubSkillDetail; version: string; identity: ClawHubSkillCatalogRef }> {
  const identity: ClawHubSkillCatalogRef =
    params.allowLegacyTrackedSlug && params.slug
      ? {
          source: CLAWHUB_SOURCE,
          catalogId: formatClawHubCatalogId(params.slug),
          slug: normalizeTrackedSlug(params.slug),
        }
      : resolveClawHubCatalogRef(params);
  const detail = await fetchClawHubSkillDetail({
    slug: identity.slug,
    baseUrl: params.baseUrl,
  });
  if (!detail.skill) {
    throw new Error(`Skill "${identity.slug}" not found on ClawHub.`);
  }
  const resolvedVersion = params.version ?? detail.latestVersion?.version;
  if (!resolvedVersion) {
    throw new Error(`Skill "${identity.slug}" has no installable version.`);
  }
  return {
    detail,
    version: resolvedVersion,
    identity,
  };
}

async function installExtractedSkill(params: {
  workspaceDir: string;
  slug: string;
  extractedRoot: string;
  mode: "install" | "update";
  logger?: Logger;
}): Promise<{ ok: true; targetDir: string } | { ok: false; error: string }> {
  await ensureSkillRoot(params.extractedRoot);
  const targetDir = resolveSkillInstallDir(params.workspaceDir, params.slug);
  const install = await installPackageDir({
    sourceDir: params.extractedRoot,
    targetDir,
    mode: params.mode,
    timeoutMs: 120_000,
    logger: params.logger,
    copyErrorPrefix: "failed to install skill",
    hasDeps: false,
    depsLogMessage: "",
  });
  if (!install.ok) {
    return install;
  }
  return { ok: true, targetDir };
}

async function performClawHubSkillInstall(
  params: ClawHubInstallParams,
): Promise<InstallClawHubSkillResult> {
  try {
    const { detail, version, identity } = await resolveInstallVersion({
      slug: params.slug,
      catalogId: params.catalogId,
      version: params.version,
      baseUrl: params.baseUrl,
      allowLegacyTrackedSlug: params.allowLegacyTrackedSlug,
    });
    const targetDir = resolveSkillInstallDir(params.workspaceDir, identity.slug);
    if (!params.force && (await fileExists(targetDir))) {
      return {
        ok: false,
        error: `Skill already exists at ${targetDir}. Re-run with force/update.`,
      };
    }
    const stage = await resolveClawHubSkillStageForInstall({
      workspaceDir: params.workspaceDir,
      slug: identity.slug,
      catalogId: identity.catalogId,
      version,
      baseUrl: params.baseUrl,
      logger: params.logger,
      allowLegacyTrackedSlug: params.allowLegacyTrackedSlug,
    });
    if (!stage.ok) {
      return stage;
    }

    const install = await installExtractedSkill({
      workspaceDir: params.workspaceDir,
      slug: identity.slug,
      extractedRoot: stage.manifest.skillDir,
      mode: params.force ? "update" : "install",
      logger: params.logger,
    });
    if (!install.ok) {
      return install;
    }

    const installedAt = Date.now();
    const fingerprint = await computeSkillFingerprint(install.targetDir);
    const installedSkillKey = path.basename(install.targetDir);
    await writeClawHubSkillOrigin(install.targetDir, {
      version: 2,
      source: CLAWHUB_SOURCE,
      registry: stage.manifest.registry,
      catalogId: identity.catalogId,
      slug: identity.slug,
      installedSkillKey,
      installedVersion: version,
      installedAt,
      integrity: stage.manifest.integrity,
      fingerprint,
      displayName: detail.skill?.displayName,
      summary: detail.skill?.summary,
      ownerHandle: detail.owner?.handle ?? null,
      ownerDisplayName: detail.owner?.displayName ?? null,
      trustTier: "local_trusted",
      review: {
        gate: "vet_scan",
        reviewedAt: installedAt,
        reviewedVersion: version,
        reportPath: stage.manifest.reportPath,
      },
    });
    const lock = await readClawHubSkillsLockfile(params.workspaceDir);
    lock.skills[identity.slug] = {
      version,
      installedAt,
    };
    await writeClawHubSkillsLockfile(params.workspaceDir, lock);

    return {
      ok: true,
      source: CLAWHUB_SOURCE,
      catalogId: identity.catalogId,
      slug: identity.slug,
      version,
      targetDir: install.targetDir,
      installedSkillKey,
      detail,
    };
  } catch (err) {
    return {
      ok: false,
      error: formatErrorMessage(err),
    };
  }
}

async function installRequestedSkillFromClawHub(
  params: ClawHubInstallParams,
): Promise<InstallClawHubSkillResult> {
  try {
    const identity = validateRequestedClawHubCatalogRef(params);
    return await performClawHubSkillInstall({
      ...params,
      slug: identity.slug,
      catalogId: identity.catalogId,
    });
  } catch (err) {
    return {
      ok: false,
      error: formatErrorMessage(err),
    };
  }
}

async function installTrackedSkillFromClawHub(
  params: ClawHubInstallParams,
): Promise<InstallClawHubSkillResult> {
  try {
    const resolvedSlug = params.slug ? normalizeTrackedSlug(params.slug) : undefined;
    return await performClawHubSkillInstall({
      ...params,
      slug: resolvedSlug,
      allowLegacyTrackedSlug: true,
    });
  } catch (err) {
    return {
      ok: false,
      error: formatErrorMessage(err),
    };
  }
}

async function resolveTrackedUpdateTarget(params: {
  workspaceDir: string;
  slug: string;
  lock: ClawHubSkillsLockfile;
  baseUrl?: string;
}): Promise<TrackedUpdateTarget> {
  const targetDir = resolveSkillInstallDir(params.workspaceDir, params.slug);
  const origin = (await readClawHubSkillOrigin(targetDir)) ?? null;
  if (!origin && !params.lock.skills[params.slug]) {
    return {
      ok: false,
      slug: params.slug,
      error: `Skill "${params.slug}" is not tracked as a ClawHub install.`,
    };
  }
  return {
    ok: true,
    slug: params.slug,
    baseUrl: origin?.registry ?? params.baseUrl,
    previousVersion: origin?.installedVersion ?? params.lock.skills[params.slug]?.version ?? null,
  };
}

export async function installSkillFromClawHub(params: {
  workspaceDir: string;
  slug?: string;
  catalogId?: string;
  version?: string;
  baseUrl?: string;
  force?: boolean;
  logger?: Logger;
}): Promise<InstallClawHubSkillResult> {
  return await installRequestedSkillFromClawHub(params);
}

export async function updateSkillsFromClawHub(params: {
  workspaceDir: string;
  slug?: string;
  baseUrl?: string;
  logger?: Logger;
}): Promise<UpdateClawHubSkillResult[]> {
  const lock = await readClawHubSkillsLockfile(params.workspaceDir);
  const slugs = params.slug
    ? [
        await resolveRequestedUpdateSlug({
          workspaceDir: params.workspaceDir,
          requestedSlug: params.slug,
          lock,
        }),
      ]
    : Object.keys(lock.skills).map((slug) => normalizeTrackedSlug(slug));
  const results: UpdateClawHubSkillResult[] = [];
  for (const slug of slugs) {
    const tracked = await resolveTrackedUpdateTarget({
      workspaceDir: params.workspaceDir,
      slug,
      lock,
      baseUrl: params.baseUrl,
    });
    if (!tracked.ok) {
      results.push({
        ok: false,
        error: tracked.error,
      });
      continue;
    }
    const install = await installTrackedSkillFromClawHub({
      workspaceDir: params.workspaceDir,
      slug: tracked.slug,
      baseUrl: tracked.baseUrl,
      force: true,
      logger: params.logger,
    });
    if (!install.ok) {
      results.push(install);
      continue;
    }
    results.push({
      ok: true,
      slug: tracked.slug,
      previousVersion: tracked.previousVersion,
      version: install.version,
      changed: tracked.previousVersion !== install.version,
      targetDir: install.targetDir,
    });
  }
  return results;
}

export async function readTrackedClawHubSkillSlugs(workspaceDir: string): Promise<string[]> {
  const lock = await readClawHubSkillsLockfile(workspaceDir);
  return Object.keys(lock.skills).toSorted();
}

export async function readTrackedClawHubSkillInstalls(
  workspaceDir: string,
): Promise<TrackedClawHubSkillInstall[]> {
  const slugs = await readTrackedClawHubSkillSlugs(workspaceDir);
  const installs: TrackedClawHubSkillInstall[] = [];
  for (const slug of slugs) {
    const targetDir = resolveSkillInstallDir(workspaceDir, slug);
    const origin = await readClawHubSkillOrigin(targetDir);
    installs.push({
      source: CLAWHUB_SOURCE,
      catalogId: origin?.catalogId ?? formatClawHubCatalogId(slug),
      slug,
      installedSkillKey: origin?.installedSkillKey ?? path.basename(targetDir),
      targetDir,
      registry: origin?.registry ?? resolveClawHubBaseUrl(undefined),
      installedVersion: origin?.installedVersion ?? null,
      installedAt: origin?.installedAt ?? null,
      integrity: origin?.integrity,
      fingerprint: origin?.fingerprint,
      displayName: origin?.displayName,
      summary: origin?.summary,
      ownerHandle: origin?.ownerHandle ?? null,
      ownerDisplayName: origin?.ownerDisplayName ?? null,
      trustTier: origin?.trustTier,
      review: origin?.review,
    });
  }
  return installs;
}

export async function computeSkillFingerprint(skillDir: string): Promise<string> {
  const digest = createHash("sha256");
  const queue = [skillDir];
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
      const relPath = path.relative(skillDir, fullPath).split(path.sep).join("/");
      digest.update(relPath);
      digest.update("\n");
      digest.update(await fs.readFile(fullPath));
      digest.update("\n");
    }
  }
  return digest.digest("hex");
}
