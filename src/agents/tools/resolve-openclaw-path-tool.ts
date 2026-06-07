import { Type } from "@sinclair/typebox";
import {
  buildSafeWorkspaceSearchCommand,
  resolveOpenClawPath,
  resolveOpenClawPathRoots,
  type OpenClawPathOwnerHint,
  type OpenClawPathActorProfile,
} from "../workspace-topology-resolver.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam } from "./common.js";

const ResolveOpenClawPathToolSchema = Type.Object({
  path: Type.String({
    description:
      "Path, repo-relative path, or workspace topic to resolve before creating or editing files.",
  }),
  actorProfile: Type.Optional(
    Type.Union([
      Type.Literal("ordinary-main"),
      Type.Literal("host-operator"),
      Type.Literal("repo-executor"),
    ]),
  ),
  scope: Type.Optional(Type.Union([Type.Literal("live_repo"), Type.Literal("operator_workspace")])),
});

function readActorProfile(value: string | undefined): OpenClawPathActorProfile | undefined {
  if (value === "ordinary-main" || value === "host-operator" || value === "repo-executor") {
    return value;
  }
  return undefined;
}

function readOwnerHint(value: string | undefined): OpenClawPathOwnerHint | undefined {
  if (value === "operator_workspace") {
    return value;
  }
  if (value === "live_repo") {
    return "product_repo";
  }
  return undefined;
}

export function createResolveOpenClawPathTool(opts?: {
  workspaceDir?: string;
  liveRepoRoot?: string;
}): AnyAgentTool {
  return {
    name: "resolve_openclaw_path",
    label: "Resolve OpenClaw path",
    displaySummary: "Resolve canonical OpenClaw file ownership before writes.",
    description:
      "Resolve whether a requested path/topic belongs to the live product repo, canonical workspace, read-only import mirror, generated artifact, Memory Ops output, or hostfs mirror. Use before writing docs/files to avoid creating parallel trees.",
    parameters: ResolveOpenClawPathToolSchema,
    execute: async (_callId, rawParams) => {
      const params = rawParams && typeof rawParams === "object" ? rawParams : {};
      const requested = readStringParam(params as Record<string, unknown>, "path", {
        required: true,
        label: "path",
      });
      const actorProfile = readActorProfile(
        readStringParam(params as Record<string, unknown>, "actorProfile", {
          required: false,
        }),
      );
      const ownerHint = readOwnerHint(
        readStringParam(params as Record<string, unknown>, "scope", {
          required: false,
        }),
      );
      const roots = resolveOpenClawPathRoots({
        workspaceRoot: opts?.workspaceDir,
        liveRepoRoot: opts?.liveRepoRoot,
      });
      const resolution = resolveOpenClawPath(requested, {
        workspaceRoot: roots.workspaceRoot,
        liveRepoRoot: roots.liveRepoRoot,
        actorProfile,
        ownerHint,
      });
      return jsonResult({
        ...resolution,
        safeWorkspaceSearchExample: buildSafeWorkspaceSearchCommand(
          "<pattern>",
          roots.workspaceRoot,
        ),
      });
    },
  };
}
