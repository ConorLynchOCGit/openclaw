import { Type } from "@sinclair/typebox";
import {
  listOpenClawResourceRoots,
  listOpenClawResources,
  resolveOpenClawResource,
  resolveOpenClawResourceRegistryOptions,
} from "../openclaw-resource-registry.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam } from "./common.js";

const ResolveOpenClawResourceToolSchema = Type.Object({
  action: Type.Optional(Type.Union([Type.Literal("resolve"), Type.Literal("list")])),
  query: Type.Optional(
    Type.String({
      description:
        "Stable resource id, exact path, or operator-facing query such as 'latest Memory Ops report' or 'daily operator review context'. Required for action=resolve.",
    }),
  ),
});

export function createResolveOpenClawResourceTool(opts?: {
  workspaceDir?: string;
  liveRepoRoot?: string;
}): AnyAgentTool {
  return {
    name: "resolve_openclaw_resource",
    label: "Resolve OpenClaw resource",
    displaySummary: "Resolve operator-facing cross-root resources and generated artifacts.",
    description:
      "Resolve high-value cross-root operator resources such as the latest Memory Ops report, daily operator review context, and archived cron reports. Use this instead of fuzzy workspace search when the artifact may live in the live repo, generated_current, or archive surfaces.",
    parameters: ResolveOpenClawResourceToolSchema,
    execute: async (_callId, rawParams) => {
      const params = rawParams && typeof rawParams === "object" ? rawParams : {};
      const action =
        readStringParam(params as Record<string, unknown>, "action", {
          required: false,
          label: "action",
        }) ?? "resolve";
      if (action === "list") {
        const resolvedOptions = await resolveOpenClawResourceRegistryOptions({
          workspaceRoot: opts?.workspaceDir,
          liveRepoRoot: opts?.liveRepoRoot,
        });
        const [roots, resources] = await Promise.all([
          Promise.resolve(listOpenClawResourceRoots(resolvedOptions)),
          listOpenClawResources(resolvedOptions),
        ]);
        return jsonResult({ action, roots, resources });
      }
      const query = readStringParam(params as Record<string, unknown>, "query", {
        required: true,
        label: "query",
      });
      const resolution = await resolveOpenClawResource(query, {
        workspaceRoot: opts?.workspaceDir,
        liveRepoRoot: opts?.liveRepoRoot,
      });
      return jsonResult(resolution);
    },
  };
}
