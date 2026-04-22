import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveMemoryOpsConfig, type MemoryOpsClosedLoopConfig } from "./config.ts";
import { prepareSignalForPersistence } from "./signals.ts";
import type {
  MemoryOpsEventSink,
  MemoryOpsRecommendation,
  MemoryOpsRecordResult,
  MemoryOpsSignal,
} from "./types.ts";

function dayFromIso(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return parsed.toISOString().slice(0, 10);
}

async function appendJsonLine(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const line = `${JSON.stringify(value)}\n`;
  let existing = "";
  try {
    existing = await readFile(filePath, "utf8");
  } catch {
    existing = "";
  }
  await writeFile(filePath, `${existing}${line}`, "utf8");
}

export async function readJsonlFile<T = unknown>(filePath: string): Promise<T[]> {
  try {
    const raw = await readFile(filePath, "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as T);
  } catch {
    return [];
  }
}
export class JsonlMemoryOpsSink implements MemoryOpsEventSink {
  readonly config: MemoryOpsClosedLoopConfig;

  constructor(config: Partial<MemoryOpsClosedLoopConfig> = {}) {
    this.config = resolveMemoryOpsConfig(config);
  }

  signalPathForDay(day: string): string {
    return path.join(this.config.baseDir, "signals", `${day}.jsonl`);
  }

  recommendationPathForDay(day: string): string {
    return path.join(this.config.baseDir, "recommendations", `${day}.jsonl`);
  }

  async appendSignal(signal: MemoryOpsSignal): Promise<MemoryOpsRecordResult> {
    if (!this.config.enabled) {
      return { persisted: false, reason: "memory ops closed-loop disabled" };
    }
    const prepared = prepareSignalForPersistence(signal);
    if (!prepared.validation.ok) {
      return { persisted: false, reason: prepared.validation.reason };
    }
    if (!prepared.signal) {
      return { persisted: false, reason: "signal unavailable after validation" };
    }
    const filePath = this.signalPathForDay(dayFromIso(prepared.signal.created_at));
    await appendJsonLine(filePath, prepared.signal);
    return { persisted: true, path: filePath };
  }

  async recordSignal(signal: MemoryOpsSignal): Promise<void> {
    await this.appendSignal(signal);
  }

  async appendRecommendation(
    recommendation: MemoryOpsRecommendation,
  ): Promise<MemoryOpsRecordResult> {
    if (!this.config.enabled) {
      return { persisted: false, reason: "memory ops closed-loop disabled" };
    }
    const filePath = this.recommendationPathForDay(dayFromIso(recommendation.created_at));
    await appendJsonLine(filePath, recommendation);
    return { persisted: true, path: filePath };
  }

  async recordRecommendation(recommendation: MemoryOpsRecommendation): Promise<void> {
    await this.appendRecommendation(recommendation);
  }

  async markRecommendationResolved(id: string, reason: string): Promise<void> {
    await this.appendRecommendation({
      recommendation_id: id,
      schema_version: "memory_ops_recommendation.v1",
      created_at: new Date().toISOString(),
      severity: "info",
      status: "resolved",
      title: "Recommendation resolved",
      summary: reason,
      evidence_signal_ids: [],
      category: "hook_health",
      recommended_action: "No further action recorded by this observe-only sink.",
      auto_fix_available: false,
      auto_fix_enabled: false,
      safe_to_auto_fix: false,
    });
  }
}
