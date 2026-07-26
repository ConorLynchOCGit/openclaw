import { resolveMetricIdentity } from "./src/schema.js";
import { AgencyDataStore, resolveAgencyDataStateDir } from "./src/store.js";
import type { CanonicalRecord, MetricComparisonProfile } from "./src/types.js";

/**
 * Trusted ingestion surface for source adapters and tests. It is intentionally
 * not registered with OpenClaw's model tool registry.
 */
export function createTrustedAgencyDataIngestion(params: { stateDir: string }) {
  const store = new AgencyDataStore(resolveAgencyDataStateDir(params.stateDir));
  return {
    append: (record: Record<string, unknown>): Promise<CanonicalRecord> => {
      if (record.object_type === "correction_tombstone") {
        throw new Error("Use appendCorrection or appendTombstone for canonical control records.");
      }
      return store.append(record);
    },
    appendBatch: (records: readonly Record<string, unknown>[]): Promise<CanonicalRecord[]> => {
      if (records.some((record) => record.object_type === "correction_tombstone")) {
        throw new Error("Use appendCorrection or appendTombstone for canonical control records.");
      }
      return store.appendBatch(records);
    },
    appendCorrection: (record: Record<string, unknown>): Promise<CanonicalRecord> =>
      store.append({ ...record, object_type: "correction_tombstone", action: "correction" }),
    appendTombstone: (record: Record<string, unknown>): Promise<CanonicalRecord> =>
      store.append({ ...record, object_type: "correction_tombstone", action: "tombstone" }),
  };
}

export type { CanonicalRecord, MetricComparisonProfile };
export { resolveMetricIdentity };
export { queryMarketingMetrics } from "./src/queries.js";
export {
  AgencyDataStore,
  materializeVisibleRecords,
  resolveAgencyDataStateDir,
} from "./src/store.js";
