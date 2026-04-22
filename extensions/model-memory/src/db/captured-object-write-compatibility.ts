import type { StoreWriteResult, StoredCaptureInput } from "../memory-object-store.ts";
import type { SemanticCollisionAdjudicator } from "../semantic-collision-adjudication.ts";
import type { ModelMemoryCanonicalRepository } from "./canonical-repository.ts";

export const MODEL_MEMORY_LEGACY_CAPTURED_OBJECT_WRITE_FALLBACK_ENV =
  "MODEL_MEMORY_LEGACY_CAPTURED_OBJECT_WRITE_FALLBACK_ENABLED";

export type CapturedObjectWriteStore = {
  writeCapturedObject(input: StoredCaptureInput): Promise<StoreWriteResult> | StoreWriteResult;
  writeCapturedObjects(
    inputs: StoredCaptureInput[],
  ): Promise<StoreWriteResult[]> | StoreWriteResult[];
};

export function isLegacyCapturedObjectWriteFallbackEnabled(
  input: {
    env?: NodeJS.ProcessEnv;
    explicit?: boolean;
  } = {},
): boolean {
  if (input.explicit === true) {
    return true;
  }
  const raw = input.env?.[MODEL_MEMORY_LEGACY_CAPTURED_OBJECT_WRITE_FALLBACK_ENV] ?? "";
  return /^(1|true|yes|on)$/iu.test(raw.trim());
}

export function assertLegacyCapturedObjectWriteFallbackEnabled(input: {
  env?: NodeJS.ProcessEnv;
  explicit?: boolean;
  caller: string;
}): void {
  if (isLegacyCapturedObjectWriteFallbackEnabled(input)) {
    return;
  }
  throw new Error(
    [
      `${input.caller} attempted to use legacy captured-object write compatibility.`,
      "That fallback is disabled by default for MMV2 live paths.",
      `Set ${MODEL_MEMORY_LEGACY_CAPTURED_OBJECT_WRITE_FALLBACK_ENV}=true only for an explicit rollback/fallback run.`,
    ].join(" "),
  );
}

export class DisabledCapturedObjectWriteStore implements CapturedObjectWriteStore {
  constructor(private readonly reason = "legacy captured-object write compatibility disabled") {}

  writeCapturedObject(): Promise<StoreWriteResult> {
    return Promise.reject(new Error(this.reason));
  }

  writeCapturedObjects(): Promise<StoreWriteResult[]> {
    return Promise.reject(new Error(this.reason));
  }
}

export async function createLegacyCapturedObjectWriteFallbackStore(input: {
  canonicalRepository: ModelMemoryCanonicalRepository;
  collisionAdjudicator?: SemanticCollisionAdjudicator;
  env?: NodeJS.ProcessEnv;
  explicit?: boolean;
  caller: string;
}): Promise<CapturedObjectWriteStore> {
  assertLegacyCapturedObjectWriteFallbackEnabled(input);
  const { DatabaseMemoryObjectStore } = await import("./database-memory-object-store.ts");
  return new DatabaseMemoryObjectStore(input.canonicalRepository, input.collisionAdjudicator);
}
