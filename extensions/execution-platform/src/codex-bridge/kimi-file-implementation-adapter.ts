import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type KimiPatchModelClient = {
  proposeFileEdits(input: {
    modelRef: string;
    providerPath: string;
    taskSummary: string;
    allowedFileRefs: string[];
    contextPackRefs: string[];
    validationCommandRefs: string[];
    maxOutputTokens: number;
    timeoutMs: number;
  }): Promise<{
    modelRunRef: string;
    responseText: string | null;
    responseHash: string;
    latencyMs: number;
    rawPromptStored: false;
    rawResponseStored: false;
  }>;
};

export type KimiValidationRunner = {
  run(commandRef: string): Promise<{
    validationRef: string;
    status: "passed" | "failed" | "not_run";
    summary: string;
  }>;
};

export type KimiFileImplementationAdapterInput = {
  taskSummary: string;
  repoRoot: string;
  allowedFileRefs: string[];
  contextPackRefs: string[];
  validationCommandRefs: string[];
  budgetPolicy: {
    modelRef?: string;
    providerPath?: string;
    maxOutputTokens: number;
    timeoutMs: number;
  };
};

export type KimiFileImplementationAdapterResult = {
  artifactKind: "kimi_file_implementation_adapter_result";
  status: "completed" | "needs_review" | "failed";
  modelRef: string;
  providerPath: string;
  modelRunRef: string | null;
  changedFileRefs: string[];
  diffHash: string | null;
  validationRefs: string[];
  artifactRefs: string[];
  limitations: string[];
  reasonCodes: string[];
  escalatedToCodexBridgeRecommended: boolean;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  workQueueLifecycleMutated: false;
};

type ParsedEdit = {
  path: string;
  content: string;
};

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseJsonObject(text: string | null): Record<string, unknown> {
  const source = text?.trim() ?? "";
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/iu)?.[1]?.trim();
  const candidates = [
    source,
    fenced ?? "",
    source.includes("{") ? source.slice(source.indexOf("{"), source.lastIndexOf("}") + 1) : "",
  ].filter((candidate) => candidate.trim().startsWith("{"));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      continue;
    }
  }
  return {};
}

function parseEdits(responseText: string | null): ParsedEdit[] {
  const parsed = parseJsonObject(responseText);
  const edits = Array.isArray(parsed.fileEdits) ? parsed.fileEdits : [];
  return edits
    .filter((edit): edit is Record<string, unknown> => Boolean(edit && typeof edit === "object"))
    .map((edit) => ({
      path: typeof edit.path === "string" ? edit.path : "",
      content: typeof edit.content === "string" ? edit.content : "",
    }))
    .filter((edit) => edit.path && edit.content)
    .slice(0, 8);
}

function assertAllowedFile(repoRoot: string, fileRef: string, allowedFileRefs: string[]): string {
  if (path.isAbsolute(fileRef) || fileRef.includes("..")) {
    throw new Error(`kimi_patch_out_of_scope:${fileRef}`);
  }
  const normalized = fileRef.replace(/\\/gu, "/");
  const allowed = allowedFileRefs.some((allowedRef) => {
    const allowedNormalized = allowedRef.replace(/\\/gu, "/");
    return (
      normalized === allowedNormalized ||
      normalized.startsWith(`${allowedNormalized.replace(/\/$/u, "")}/`)
    );
  });
  if (!allowed) {
    throw new Error(`kimi_patch_out_of_scope:${fileRef}`);
  }
  return path.resolve(repoRoot, normalized);
}

async function defaultApplyFile(repoRoot: string, edit: ParsedEdit, allowedFileRefs: string[]) {
  const absolute = assertAllowedFile(repoRoot, edit.path, allowedFileRefs);
  await mkdir(path.dirname(absolute), { recursive: true });
  const before = await readFile(absolute, "utf8").catch(() => "");
  if (before === edit.content) {
    return { changed: false, beforeHash: hash(before), afterHash: hash(edit.content) };
  }
  await writeFile(absolute, edit.content, "utf8");
  return { changed: true, beforeHash: hash(before), afterHash: hash(edit.content) };
}

export class KimiFileImplementationAdapter {
  constructor(
    private readonly options: {
      modelClient: KimiPatchModelClient;
      validationRunner: KimiValidationRunner;
      applyFile?: (
        repoRoot: string,
        edit: ParsedEdit,
        allowedFileRefs: string[],
      ) => Promise<{ changed: boolean; beforeHash: string; afterHash: string }>;
    },
  ) {}

  async run(
    input: KimiFileImplementationAdapterInput,
  ): Promise<KimiFileImplementationAdapterResult> {
    const modelRef = input.budgetPolicy.modelRef ?? "moonshotai/kimi-k2.6";
    const providerPath = input.budgetPolicy.providerPath ?? "openrouter";
    const response = await this.options.modelClient.proposeFileEdits({
      modelRef,
      providerPath,
      taskSummary: input.taskSummary.slice(0, 2_000),
      allowedFileRefs: input.allowedFileRefs,
      contextPackRefs: input.contextPackRefs,
      validationCommandRefs: input.validationCommandRefs,
      maxOutputTokens: input.budgetPolicy.maxOutputTokens,
      timeoutMs: input.budgetPolicy.timeoutMs,
    });
    const edits = parseEdits(response.responseText);
    if (edits.length === 0) {
      return this.needsReview({
        modelRef,
        providerPath,
        modelRunRef: response.modelRunRef,
        reasonCodes: ["kimi_no_patch_file_edit_output"],
        limitations: ["Kimi did not return structured fileEdits."],
      });
    }
    const apply = this.options.applyFile ?? defaultApplyFile;
    const changedFileRefs: string[] = [];
    const diffParts: string[] = [];
    try {
      for (const edit of edits) {
        const applied = await apply(input.repoRoot, edit, input.allowedFileRefs);
        if (applied.changed) {
          changedFileRefs.push(edit.path);
          diffParts.push(`${edit.path}:${applied.beforeHash}->${applied.afterHash}`);
        }
      }
    } catch (error) {
      return this.needsReview({
        modelRef,
        providerPath,
        modelRunRef: response.modelRunRef,
        reasonCodes: [error instanceof Error ? error.message : "kimi_patch_apply_failed"],
        limitations: ["Kimi patch was rejected by approved scope/apply boundary."],
      });
    }
    if (changedFileRefs.length === 0) {
      return this.needsReview({
        modelRef,
        providerPath,
        modelRunRef: response.modelRunRef,
        reasonCodes: ["kimi_patch_no_changed_files"],
        limitations: ["Kimi proposed edits that did not change approved files."],
      });
    }
    const validation = await Promise.all(
      input.validationCommandRefs
        .slice(0, 3)
        .map((commandRef) => this.options.validationRunner.run(commandRef)),
    );
    const validationRefs = validation.map((item) => item.validationRef);
    const validationPassed = validation.every((item) => item.status === "passed");
    return {
      artifactKind: "kimi_file_implementation_adapter_result",
      status: validationPassed ? "completed" : "needs_review",
      modelRef,
      providerPath,
      modelRunRef: response.modelRunRef,
      changedFileRefs,
      diffHash: hash(diffParts.join("\n")),
      validationRefs,
      artifactRefs: [
        `runtime-work-graph://kimi-file-adapter/${randomUUID()}`,
        ...changedFileRefs.map((file) => `repo://${file}`),
      ],
      limitations: validationPassed ? [] : ["Validation did not pass after Kimi file edits."],
      reasonCodes: validationPassed
        ? ["kimi_patch_applied_and_validated"]
        : ["kimi_patch_validation_needs_review"],
      escalatedToCodexBridgeRecommended: !validationPassed,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    };
  }

  private needsReview(input: {
    modelRef: string;
    providerPath: string;
    modelRunRef: string | null;
    reasonCodes: string[];
    limitations: string[];
  }): KimiFileImplementationAdapterResult {
    return {
      artifactKind: "kimi_file_implementation_adapter_result",
      status: "needs_review",
      modelRef: input.modelRef,
      providerPath: input.providerPath,
      modelRunRef: input.modelRunRef,
      changedFileRefs: [],
      diffHash: null,
      validationRefs: [],
      artifactRefs: [],
      limitations: input.limitations,
      reasonCodes: input.reasonCodes,
      escalatedToCodexBridgeRecommended: true,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    };
  }
}
