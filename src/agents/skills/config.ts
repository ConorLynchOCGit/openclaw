import fs from "node:fs";
import path from "node:path";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import type { SkillConfig } from "../../config/types.skills.js";
import {
  evaluateRuntimeEligibility,
  hasBinary,
  isConfigPathTruthyWithDefaults,
  resolveConfigPath,
  resolveRuntimePlatform,
} from "../../shared/config-eval.js";
import { normalizeStringEntries } from "../../shared/string-normalization.js";
import { resolveSkillKey } from "./frontmatter.js";
import { resolveSkillSource } from "./source.js";
import type { SkillEligibilityContext, SkillEntry } from "./types.js";

const DEFAULT_CONFIG_VALUES: Record<string, boolean> = {
  "browser.enabled": true,
  "browser.evaluateEnabled": true,
};

export { hasBinary, resolveConfigPath, resolveRuntimePlatform };

export function isConfigPathTruthy(config: OpenClawConfig | undefined, pathStr: string): boolean {
  return isConfigPathTruthyWithDefaults(config, pathStr, DEFAULT_CONFIG_VALUES);
}

export function resolveSkillConfig(
  config: OpenClawConfig | undefined,
  skillKey: string,
): SkillConfig | undefined {
  const skills = config?.skills?.entries;
  if (!skills || typeof skills !== "object") {
    return undefined;
  }
  const entry = (skills as Record<string, SkillConfig | undefined>)[skillKey];
  if (!entry || typeof entry !== "object") {
    return undefined;
  }
  return entry;
}

function normalizeAllowlist(input: unknown): string[] | undefined {
  if (!input) {
    return undefined;
  }
  if (!Array.isArray(input)) {
    return undefined;
  }
  const normalized = normalizeStringEntries(input);
  return normalized.length > 0 ? normalized : undefined;
}

const BUNDLED_SOURCES = new Set(["openclaw-bundled"]);
const CLAWHUB_ORIGIN_RELATIVE_PATHS = [".clawhub/origin.json", ".clawdhub/origin.json"] as const;

function isBundledSkill(entry: SkillEntry): boolean {
  return BUNDLED_SOURCES.has(resolveSkillSource(entry.skill));
}

export type SkillTrustGate = {
  blockedByTrustVetting: boolean;
  trustReason?: string;
};

type ClawHubOriginPreview = Partial<{
  source: string;
  review: {
    gate?: string;
    reviewedAt?: number;
    reviewedVersion?: string;
  };
  integrity: string;
  fingerprint: string;
}>;

function readClawHubOriginPreview(baseDir: string): ClawHubOriginPreview | null {
  for (const relativePath of CLAWHUB_ORIGIN_RELATIVE_PATHS) {
    const candidate = path.join(baseDir, relativePath);
    try {
      return JSON.parse(fs.readFileSync(candidate, "utf8")) as ClawHubOriginPreview;
    } catch {
      // ignore missing or malformed origin metadata here; the caller decides
      // whether the skill should be treated as local-trusted or trust-blocked.
    }
  }
  return null;
}

export function resolveSkillTrustGate(entry: SkillEntry): SkillTrustGate {
  const origin = readClawHubOriginPreview(entry.skill.baseDir);
  if (!origin) {
    return { blockedByTrustVetting: false };
  }
  if (origin.source !== "clawhub") {
    return { blockedByTrustVetting: false };
  }
  if (!origin.review) {
    return {
      blockedByTrustVetting: true,
      trustReason: "third-party skill is missing persisted review metadata",
    };
  }
  if (!origin.integrity) {
    return {
      blockedByTrustVetting: true,
      trustReason: "third-party skill is missing persisted integrity metadata",
    };
  }
  if (!origin.fingerprint) {
    return {
      blockedByTrustVetting: true,
      trustReason: "third-party skill is missing persisted fingerprint metadata",
    };
  }
  return { blockedByTrustVetting: false };
}

export function isSkillVisibleInModelCatalog(entry: SkillEntry): boolean {
  if (entry.exposure) {
    return entry.exposure.includeInAvailableSkillsPrompt !== false;
  }
  if (entry.invocation) {
    return entry.invocation.disableModelInvocation !== true;
  }
  return entry.skill.disableModelInvocation !== true;
}

export function resolveBundledAllowlist(config?: OpenClawConfig): string[] | undefined {
  return normalizeAllowlist(config?.skills?.allowBundled);
}

export function isBundledSkillAllowed(entry: SkillEntry, allowlist?: string[]): boolean {
  if (!allowlist || allowlist.length === 0) {
    return true;
  }
  if (!isBundledSkill(entry)) {
    return true;
  }
  const key = resolveSkillKey(entry.skill, entry);
  return allowlist.includes(key) || allowlist.includes(entry.skill.name);
}

export function shouldIncludeSkill(params: {
  entry: SkillEntry;
  config?: OpenClawConfig;
  eligibility?: SkillEligibilityContext;
}): boolean {
  const { entry, config, eligibility } = params;
  const skillKey = resolveSkillKey(entry.skill, entry);
  const skillConfig = resolveSkillConfig(config, skillKey);
  const allowBundled = normalizeAllowlist(config?.skills?.allowBundled);
  const trustGate = resolveSkillTrustGate(entry);

  if (skillConfig?.enabled === false) {
    return false;
  }
  if (!isBundledSkillAllowed(entry, allowBundled)) {
    return false;
  }
  if (trustGate.blockedByTrustVetting) {
    return false;
  }
  return evaluateRuntimeEligibility({
    os: entry.metadata?.os,
    remotePlatforms: eligibility?.remote?.platforms,
    always: entry.metadata?.always,
    requires: entry.metadata?.requires,
    hasBin: hasBinary,
    hasRemoteBin: eligibility?.remote?.hasBin,
    hasAnyRemoteBin: eligibility?.remote?.hasAnyBin,
    hasEnv: (envName) =>
      Boolean(
        process.env[envName] ||
        skillConfig?.env?.[envName] ||
        (skillConfig?.apiKey && entry.metadata?.primaryEnv === envName),
      ),
    isConfigPathTruthy: (configPath) => isConfigPathTruthy(config, configPath),
  });
}
