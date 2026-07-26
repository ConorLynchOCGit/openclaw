import { isRecord } from "openclaw/plugin-sdk/string-coerce-runtime";
import { ocPathSegment } from "./policy-state-helpers.js";

export type PolicyConfiguredAgent = {
  readonly agentId: string;
  readonly value: Record<string, unknown>;
  readonly sourceBase: string;
};

/** Mirrors core agent resolution: keyed entries are authoritative when present. */
export function listPolicyConfiguredAgents(
  agents: Record<string, unknown>,
): readonly PolicyConfiguredAgent[] {
  if (isRecord(agents.entries)) {
    return Object.entries(agents.entries).flatMap(([entryId, rawAgent]) => {
      if (!isRecord(rawAgent)) {
        return [];
      }
      const configuredId =
        typeof rawAgent.id === "string" && rawAgent.id.trim() !== "" ? rawAgent.id.trim() : entryId;
      return [
        {
          agentId: configuredId,
          value: rawAgent,
          sourceBase: `oc://openclaw.config/agents/entries/${ocPathSegment(entryId)}`,
        },
      ];
    });
  }

  const list = Array.isArray(agents.list) ? agents.list : [];
  return list.flatMap((rawAgent, index) => {
    if (!isRecord(rawAgent)) {
      return [];
    }
    const configuredId =
      typeof rawAgent.id === "string" && rawAgent.id.trim() !== ""
        ? rawAgent.id.trim()
        : `agent-${index}`;
    return [
      {
        agentId: configuredId,
        value: rawAgent,
        sourceBase: `oc://openclaw.config/agents/list/#${index}`,
      },
    ];
  });
}
