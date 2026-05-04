import type { ScriptArtifactPolicy, ScriptJobDefinition } from "./types.ts";

const DEFAULT_ARTIFACT_POLICY: ScriptArtifactPolicy = {
  maxMetadataBytes: 16 * 1024,
  maxInlineTextBytes: 4 * 1024,
  allowInlineText: false,
};

export type RegisterScriptJobDefinitionInput = Omit<
  ScriptJobDefinition,
  "artifactPolicy" | "shellExecutionAllowed"
> & {
  artifactPolicy?: Partial<ScriptArtifactPolicy>;
  shellExecutionAllowed?: boolean;
};

export class ScriptJobDefinitionRegistry {
  private readonly definitions = new Map<string, ScriptJobDefinition>();

  constructor(definitions: RegisterScriptJobDefinitionInput[] = []) {
    for (const definition of definitions) {
      this.registerScriptJobDefinition(definition);
    }
  }

  registerScriptJobDefinition(input: RegisterScriptJobDefinitionInput): ScriptJobDefinition {
    if (this.definitions.has(input.scriptId)) {
      throw new Error(`script job definition already registered: ${input.scriptId}`);
    }
    if (input.allowedLanes.length === 0) {
      throw new Error("script job definition must allow at least one lane");
    }
    if (!Number.isInteger(input.timeoutMs) || input.timeoutMs <= 0) {
      throw new Error("script job definition timeoutMs must be a positive integer");
    }
    if (input.shellExecutionAllowed) {
      throw new Error("shell execution is disabled for Slice 6 script job definitions");
    }
    const definition: ScriptJobDefinition = {
      scriptId: input.scriptId,
      description: input.description,
      handlerId: input.handlerId,
      allowedLanes: input.allowedLanes,
      timeoutMs: input.timeoutMs,
      artifactPolicy: {
        ...DEFAULT_ARTIFACT_POLICY,
        ...input.artifactPolicy,
      },
      shellExecutionAllowed: false,
    };
    this.definitions.set(definition.scriptId, definition);
    return definition;
  }

  getScriptJobDefinition(scriptId: string): ScriptJobDefinition | null {
    return this.definitions.get(scriptId) ?? null;
  }

  requireScriptJobDefinition(scriptId: string): ScriptJobDefinition {
    const definition = this.getScriptJobDefinition(scriptId);
    if (!definition) {
      throw new Error(`script job definition not registered: ${scriptId}`);
    }
    return definition;
  }

  listScriptJobDefinitions(): ScriptJobDefinition[] {
    return Array.from(this.definitions.values()).toSorted((left, right) =>
      left.scriptId.localeCompare(right.scriptId),
    );
  }
}
