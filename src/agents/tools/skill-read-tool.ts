/**
 * skill_read built-in tool.
 *
 * Lets agents load instructions for skills already exposed in their active
 * skill snapshot without granting broad filesystem read access.
 */
import fs from "node:fs";
import path from "node:path";
import { Type } from "typebox";
import { openRootFileSync } from "../../infra/boundary-file-read.js";
import type { SkillSnapshot } from "../../skills/types.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam, ToolInputError } from "./common.js";

const DEFAULT_MAX_CHARS = 120_000;
const MAX_MAX_CHARS = 200_000;

const SkillReadToolSchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  maxChars: Type.Optional(Type.Number()),
});

function clampMaxChars(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_MAX_CHARS;
  }
  return Math.max(1, Math.min(MAX_MAX_CHARS, Math.floor(value)));
}

function readSkillBody(params: { filePath: string; baseDir: string }): string {
  const rootPath = path.resolve(params.baseDir);
  const opened = openRootFileSync({
    absolutePath: path.resolve(params.filePath),
    rootPath,
    rootRealPath: fs.realpathSync(rootPath),
    boundaryLabel: "skill root",
    maxBytes: 512 * 1024,
  });
  if (!opened.ok) {
    throw new ToolInputError("skill not readable from active skill snapshot");
  }
  try {
    return fs.readFileSync(opened.fd, "utf8");
  } finally {
    fs.closeSync(opened.fd);
  }
}

export function createSkillReadTool(opts: { skillsSnapshot?: SkillSnapshot }): AnyAgentTool {
  return {
    label: "Skill Read",
    name: "skill_read",
    description:
      "Read the SKILL.md instructions for a model-visible skill already present in this session's active skill snapshot. Use this instead of file read when broad filesystem read is unavailable.",
    parameters: SkillReadToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
      const requestedName = readStringParam(params, "name", { required: true, label: "name" });
      const normalizedRequestedName = requestedName.toLowerCase();
      const skills = opts.skillsSnapshot?.resolvedSkills ?? [];
      const skill = skills.find((entry) => entry.name.toLowerCase() === normalizedRequestedName);
      if (!skill) {
        throw new ToolInputError(
          `skill "${requestedName}" is not available in the active skill snapshot`,
        );
      }

      const maxChars = clampMaxChars(params.maxChars);
      const content = readSkillBody({
        filePath: skill.filePath,
        baseDir: skill.baseDir || path.dirname(skill.filePath),
      });
      const truncated = content.length > maxChars;
      return jsonResult({
        name: skill.name,
        location: skill.filePath,
        version: skill.promptVersion ?? null,
        source: skill.source,
        chars: content.length,
        truncated,
        content: truncated ? content.slice(0, maxChars) : content,
      });
    },
  };
}
