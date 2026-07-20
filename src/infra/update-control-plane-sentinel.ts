// Persists update-control-plane sentinel files used by updater coordination.
import fs from "node:fs/promises";
import { isRecord } from "@openclaw/normalization-core/record-coerce";
import { normalizeAcceptedReleaseReceiptId } from "./accepted-release-receipt.js";
import {
  markUpdateRestartSentinelFailure,
  readRestartSentinel,
  writeRestartSentinel,
  type RestartSentinelAcceptedPluginArtifact,
  type RestartSentinelPayload,
} from "./restart-sentinel.js";
import {
  buildUpdateRestartSentinelPayload,
  type UpdateRestartSentinelMeta,
} from "./update-restart-sentinel-payload.js";
import type { UpdateRunResult } from "./update-runner.js";

// Control-plane update sentinel helpers preserve update metadata while a
// managed service handoff waits for restart health to complete.
export const CONTROL_PLANE_UPDATE_SENTINEL_META_ENV = "OPENCLAW_CONTROL_PLANE_UPDATE_SENTINEL_META";
export const CONTROL_PLANE_UPDATE_HANDOFF_STARTED_REASON = "managed-service-handoff-started";
export const CONTROL_PLANE_UPDATE_RESTART_HEALTH_PENDING_REASON = "restart-health-pending";

const CONTROL_PLANE_UPDATE_PENDING_REASONS = new Set<string>([
  CONTROL_PLANE_UPDATE_HANDOFF_STARTED_REASON,
  CONTROL_PLANE_UPDATE_RESTART_HEALTH_PENDING_REASON,
]);

export type ControlPlaneUpdateSentinelMetaFile = {
  version: 1;
  meta: UpdateRestartSentinelMeta;
};

/** Convert an update result into the restart-health-pending sentinel result. */
export function buildControlPlaneUpdateRestartHealthPendingResult(
  result: UpdateRunResult,
): UpdateRunResult {
  return {
    status: "skipped",
    mode: result.mode,
    ...(result.root ? { root: result.root } : {}),
    reason: CONTROL_PLANE_UPDATE_RESTART_HEALTH_PENDING_REASON,
    ...(result.before ? { before: result.before } : {}),
    ...(result.after ? { after: result.after } : {}),
    steps: result.steps,
    durationMs: result.durationMs,
  };
}

/** Return true when an update sentinel represents an in-progress control-plane restart. */
export function isPendingControlPlaneUpdateRestartSentinel(
  payload: RestartSentinelPayload,
): boolean {
  const reason = payload.stats?.reason;
  return (
    payload.kind === "update" &&
    payload.status === "skipped" &&
    typeof reason === "string" &&
    CONTROL_PLANE_UPDATE_PENDING_REASONS.has(reason)
  );
}

function normalizeText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function normalizeReceiptId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  try {
    return normalizeAcceptedReleaseReceiptId(value);
  } catch {
    return undefined;
  }
}

function normalizeMeta(value: unknown): UpdateRestartSentinelMeta | null {
  if (!isRecord(value)) {
    return null;
  }
  const sessionKey = normalizeText(value.sessionKey);
  const threadId = normalizeText(value.threadId);
  const handoffId = normalizeText(value.handoffId);
  const acceptedReleaseReceiptId = normalizeReceiptId(value.acceptedReleaseReceiptId);
  const channel = isRecord(value.deliveryContext)
    ? normalizeText(value.deliveryContext.channel)
    : undefined;
  const to = isRecord(value.deliveryContext) ? normalizeText(value.deliveryContext.to) : undefined;
  const accountId = isRecord(value.deliveryContext)
    ? normalizeText(value.deliveryContext.accountId)
    : undefined;
  const deliveryContext =
    channel || to || accountId
      ? {
          ...(channel ? { channel } : {}),
          ...(to ? { to } : {}),
          ...(accountId ? { accountId } : {}),
        }
      : undefined;
  return {
    ...(sessionKey ? { sessionKey } : {}),
    ...(deliveryContext ? { deliveryContext } : {}),
    ...(threadId ? { threadId } : {}),
    ...(handoffId ? { handoffId } : {}),
    ...(acceptedReleaseReceiptId ? { acceptedReleaseReceiptId } : {}),
    note: typeof value.note === "string" ? value.note : null,
    continuationMessage:
      typeof value.continuationMessage === "string" ? value.continuationMessage : null,
  };
}

function sameAcceptedPluginArtifacts(
  left: readonly RestartSentinelAcceptedPluginArtifact[],
  right: readonly RestartSentinelAcceptedPluginArtifact[],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Bind the verified accepted plugin set to the existing update sentinel before mutation. */
export async function bindAcceptedReleaseUpdateRestartSentinel(params: {
  acceptedReleaseReceiptId: string;
  pluginArtifacts: readonly RestartSentinelAcceptedPluginArtifact[];
  env?: NodeJS.ProcessEnv;
}): Promise<RestartSentinelPayload> {
  const acceptedReleaseReceiptId = normalizeAcceptedReleaseReceiptId(
    params.acceptedReleaseReceiptId,
  );
  const sentinel = await readRestartSentinel(params.env);
  if (!sentinel || sentinel.payload.kind !== "update" || sentinel.payload.status === "ok") {
    throw new Error("accepted release update requires a pending update restart sentinel");
  }
  if (sentinel.payload.stats?.acceptedReleaseReceiptId !== acceptedReleaseReceiptId) {
    throw new Error("accepted release update restart sentinel receipt does not match");
  }
  const pluginArtifacts = params.pluginArtifacts.map((artifact) => ({ ...artifact }));
  const existing = sentinel.payload.stats.acceptedReleasePluginArtifacts;
  if (existing && !sameAcceptedPluginArtifacts(existing, pluginArtifacts)) {
    throw new Error("accepted release update restart sentinel plugin set does not match");
  }
  const payload: RestartSentinelPayload = {
    ...sentinel.payload,
    stats: {
      ...sentinel.payload.stats,
      acceptedReleaseReceiptId,
      acceptedReleasePluginArtifacts: pluginArtifacts,
    },
  };
  await writeRestartSentinel(payload, params.env);
  return payload;
}

/** Return the opaque receipt identity from an unfinished accepted-release update. */
export async function readPendingAcceptedReleaseReceiptId(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  const sentinel = await readRestartSentinel(env);
  if (!sentinel || sentinel.payload.kind !== "update" || sentinel.payload.status === "ok") {
    return null;
  }
  return normalizeReceiptId(sentinel.payload.stats?.acceptedReleaseReceiptId) ?? null;
}

/** Read update sentinel routing metadata from the configured handoff file. */
export async function readControlPlaneUpdateSentinelMeta(
  env: NodeJS.ProcessEnv = process.env,
): Promise<UpdateRestartSentinelMeta | null> {
  const filePath = env[CONTROL_PLANE_UPDATE_SENTINEL_META_ENV]?.trim();
  if (!filePath) {
    return null;
  }
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.version !== 1) {
      return null;
    }
    return normalizeMeta(parsed.meta);
  } catch {
    return null;
  }
}

/** Write an update restart sentinel with control-plane routing metadata. */
export async function writeControlPlaneUpdateRestartSentinel(params: {
  result: UpdateRunResult;
  meta: UpdateRestartSentinelMeta;
}): Promise<string> {
  const payload = buildUpdateRestartSentinelPayload({
    result: params.result,
    meta: params.meta,
  });
  if (params.meta.acceptedReleaseReceiptId) {
    const current = await readRestartSentinel();
    if (
      current?.payload.kind === "update" &&
      current.payload.stats?.acceptedReleaseReceiptId === params.meta.acceptedReleaseReceiptId &&
      current.payload.stats.acceptedReleasePluginArtifacts
    ) {
      payload.stats = {
        ...payload.stats,
        acceptedReleasePluginArtifacts: current.payload.stats.acceptedReleasePluginArtifacts.map(
          (artifact) => ({ ...artifact }),
        ),
      };
    }
  }
  return await writeRestartSentinel(payload);
}

/** Mark the pending update restart sentinel as failed. */
export async function markControlPlaneUpdateRestartSentinelFailure(
  reason: string,
): Promise<RestartSentinelPayload | null> {
  return (await markUpdateRestartSentinelFailure(reason))?.payload ?? null;
}
