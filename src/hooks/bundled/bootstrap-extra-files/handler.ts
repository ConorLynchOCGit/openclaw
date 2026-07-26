// Bootstrap extra files hook injects configured extra files into startup context.
import { normalizeTrimmedStringList } from "@openclaw/normalization-core/string-normalization";
import {
  filterBootstrapFilesForSession,
  loadExtraBootstrapFilesWithDiagnostics,
} from "../../../agents/workspace.js";
import { createSubsystemLogger } from "../../../logging/subsystem.js";
import { resolveHookConfig } from "../../config.js";
import { isAgentBootstrapEvent, type HookHandler } from "../../hooks.js";

const HOOK_KEY = "bootstrap-extra-files";
const log = createSubsystemLogger("bootstrap-extra-files");

/** Resolve legacy and current config keys for global extra bootstrap file patterns. */
function resolveGlobalExtraBootstrapPatterns(hookConfig: Record<string, unknown>): string[] {
  const fromPaths = normalizeTrimmedStringList(hookConfig.paths);
  if (fromPaths.length > 0) {
    return fromPaths;
  }
  const fromPatterns = normalizeTrimmedStringList(hookConfig.patterns);
  if (fromPatterns.length > 0) {
    return fromPatterns;
  }
  return normalizeTrimmedStringList(hookConfig.files);
}

function readAgentPatternMap(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  return raw as Record<string, unknown>;
}

function resolveAgentExtraBootstrapPatterns(
  hookConfig: Record<string, unknown>,
  agentId?: string,
): string[] {
  const normalizedAgentId = typeof agentId === "string" ? agentId.trim() : "";
  if (!normalizedAgentId) {
    return [];
  }
  for (const rawMap of [hookConfig.agentPaths, hookConfig.agentPatterns, hookConfig.agentFiles]) {
    const map = readAgentPatternMap(rawMap);
    if (!map) {
      continue;
    }
    const patterns = normalizeTrimmedStringList(map[normalizedAgentId]);
    if (patterns.length > 0) {
      return patterns;
    }
  }
  return [];
}

/** Agent-bootstrap hook that appends configured extra files to the session bootstrap set. */
const bootstrapExtraFilesHook: HookHandler = async (event) => {
  if (!isAgentBootstrapEvent(event)) {
    return;
  }

  const context = event.context;
  const hookConfig = resolveHookConfig(context.cfg, HOOK_KEY);
  if (!hookConfig || hookConfig.enabled === false) {
    return;
  }

  const rawHookConfig = hookConfig as Record<string, unknown>;
  const patterns = [
    ...resolveGlobalExtraBootstrapPatterns(rawHookConfig),
    ...resolveAgentExtraBootstrapPatterns(rawHookConfig, context.agentId),
  ];
  if (patterns.length === 0) {
    return;
  }

  try {
    const { files: extras, diagnostics } = await loadExtraBootstrapFilesWithDiagnostics(
      context.workspaceDir,
      patterns,
    );
    if (diagnostics.length > 0) {
      log.debug("skipped extra bootstrap candidates", {
        skipped: diagnostics.length,
        reasons: diagnostics.reduce<Record<string, number>>((counts, item) => {
          counts[item.reason] = (counts[item.reason] ?? 0) + 1;
          return counts;
        }, {}),
      });
    }
    if (extras.length === 0) {
      return;
    }
    // Re-run session filtering after append so extra files obey the same
    // per-session include rules as the original bootstrap files.
    context.bootstrapFiles = filterBootstrapFilesForSession(
      [...context.bootstrapFiles, ...extras],
      context.sessionKey,
    );
  } catch (err) {
    log.warn(`failed: ${String(err)}`);
  }
};

export default bootstrapExtraFilesHook;
