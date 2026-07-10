import { buildSessionReadbackProjection, type ReadbackProjection } from "../readback/finality.js";
import type { GatewaySessionRow } from "./session-utils.types.js";

export type GatewaySessionDetailProjection = ReadbackProjection & {
  key: string;
  sessionKey: string;
  sessionId: string;
  agentId: string;
  status: string | null;
  finalAssistantText: string | null;
  activeProgress: GatewaySessionRow["activeProgress"] | null;
  readbackProvenance: GatewaySessionRow["readbackProvenance"];
  session: GatewaySessionRow;
} & Omit<
    GatewaySessionRow,
    "key" | "sessionId" | "agentId" | "status" | "finalAssistantText" | "activeProgress"
  >;

export type GatewaySessionIdentityUnavailable = {
  status: "identity_unavailable";
  requestedSessionKey: string;
  resolvedKey: string | null;
  sessionId: string | null;
  agentId: string;
  path?: string;
};

export type GatewaySessionDetailResult =
  | {
      ok: true;
      detail: GatewaySessionDetailProjection;
    }
  | {
      ok: false;
      error: GatewaySessionIdentityUnavailable;
    };

export function buildGatewaySessionDetailProjection(params: {
  row: GatewaySessionRow;
  requestedSessionKey: string;
  agentId: string;
  path?: string;
}): GatewaySessionDetailResult {
  const resolvedKey =
    typeof params.row.key === "string" && params.row.key.trim() ? params.row.key : null;
  const sessionId =
    typeof params.row.sessionId === "string" && params.row.sessionId.trim()
      ? params.row.sessionId
      : null;
  if (!resolvedKey || !sessionId) {
    return {
      ok: false,
      error: {
        status: "identity_unavailable",
        requestedSessionKey: params.requestedSessionKey,
        resolvedKey,
        sessionId,
        agentId: params.agentId,
        ...(params.path ? { path: params.path } : {}),
      },
    };
  }

  const readback = buildSessionReadbackProjection({
    ...params.row,
    agentId: params.agentId,
  });
  return {
    ok: true,
    detail: {
      ...params.row,
      ...readback,
      key: resolvedKey,
      sessionKey: resolvedKey,
      sessionId,
      agentId: params.agentId,
      status: readback.finality.status,
      finalAssistantText: params.row.finalAssistantText ?? null,
      activeProgress: params.row.activeProgress ?? null,
      readbackProvenance: params.row.readbackProvenance,
      session: params.row,
    },
  };
}
