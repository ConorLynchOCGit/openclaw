import type {
  MemoryObjectGetResult,
  MemoryObjectListResult,
  MemoryObjectSearchBasicResult,
  MemoryObjectSearchHybridResult,
  MemoryObjectSearchSemanticResult,
  ProcedureObjectRecord,
  RetrievedMemoryRecord,
} from "../db/runtime.js";

export type MemoryObjectToolState = "approved" | "candidate" | "validated";

type RetrievedMemoryRecordWithState<T extends RetrievedMemoryRecord> = T & {
  memoryState: MemoryObjectToolState;
};

function readMemoryState(record: RetrievedMemoryRecord): MemoryObjectToolState {
  if (record.objectType === "procedure") {
    return record.status;
  }
  return record.reviewState;
}

function shapeRetrievedRecordState<T extends RetrievedMemoryRecord>(
  record: T,
): RetrievedMemoryRecordWithState<T> {
  return {
    ...record,
    memoryState: readMemoryState(record),
  };
}

function shapeProcedureResultRecord<T extends ProcedureObjectRecord>(
  record: T,
): RetrievedMemoryRecordWithState<T> {
  return shapeRetrievedRecordState(record);
}

export function shapeMemoryObjectGetToolResult(result: MemoryObjectGetResult):
  | MemoryObjectGetResult
  | (Exclude<MemoryObjectGetResult, { accepted: false }> & {
      record: RetrievedMemoryRecordWithState<RetrievedMemoryRecord>;
    }) {
  if (!result.accepted) {
    return result;
  }
  return {
    ...result,
    record:
      result.record.objectType === "procedure"
        ? shapeProcedureResultRecord(result.record)
        : shapeRetrievedRecordState(result.record),
  };
}

export function shapeMemoryObjectListToolResult(result: MemoryObjectListResult):
  | MemoryObjectListResult
  | (Exclude<MemoryObjectListResult, { accepted: false }> & {
      records: Array<RetrievedMemoryRecordWithState<RetrievedMemoryRecord>>;
    }) {
  if (!result.accepted) {
    return result;
  }
  return {
    ...result,
    records: result.records.map((record) => shapeRetrievedRecordState(record)),
  };
}

export function shapeMemoryObjectSearchBasicToolResult(result: MemoryObjectSearchBasicResult):
  | MemoryObjectSearchBasicResult
  | (Exclude<MemoryObjectSearchBasicResult, { accepted: false }> & {
      records: Array<RetrievedMemoryRecordWithState<RetrievedMemoryRecord>>;
    }) {
  if (!result.accepted) {
    return result;
  }
  return {
    ...result,
    records: result.records.map((record) => shapeRetrievedRecordState(record)),
  };
}

export function shapeMemoryObjectSearchHybridToolResult(result: MemoryObjectSearchHybridResult):
  | MemoryObjectSearchHybridResult
  | (Exclude<MemoryObjectSearchHybridResult, { accepted: false }> & {
      records: Array<
        RetrievedMemoryRecordWithState<
          Extract<MemoryObjectSearchHybridResult, { accepted: true }>["records"][number]
        >
      >;
    }) {
  if (!result.accepted) {
    return result;
  }
  return {
    ...result,
    records: result.records.map((record) => shapeRetrievedRecordState(record)),
  };
}

export function shapeMemoryObjectSearchSemanticToolResult(result: MemoryObjectSearchSemanticResult):
  | MemoryObjectSearchSemanticResult
  | (Exclude<MemoryObjectSearchSemanticResult, { accepted: false }> & {
      records: Array<
        RetrievedMemoryRecordWithState<
          Extract<MemoryObjectSearchSemanticResult, { accepted: true }>["records"][number]
        >
      >;
    }) {
  if (!result.accepted) {
    return result;
  }
  return {
    ...result,
    records: result.records.map((record) => shapeRetrievedRecordState(record)),
  };
}
