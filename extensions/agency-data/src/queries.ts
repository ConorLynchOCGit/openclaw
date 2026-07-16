import { Type, type Static, type TSchema } from "typebox";
import { Check, Errors } from "typebox/value";
import { materializeVisibleRecords, type AgencyDataStore } from "./store.js";
import {
  CANONICAL_OBJECT_TYPES,
  type CanonicalObjectType,
  type CanonicalRecord,
  type Distribution,
} from "./types.js";

const DEFAULT_RESULT_LIMIT = 100;
const MAX_RESULT_LIMIT = 200;
const MAX_TREND_BUCKETS = 366;
const RESULT_METADATA_RESERVE_BYTES = 4 * 1024;
export const MAX_MODEL_RESULT_BYTES = 48 * 1024;

const identifier = Type.String({ minLength: 1, maxLength: 512, pattern: "\\S" });
const dateBoundary = Type.String({ minLength: 1, maxLength: 64, pattern: "\\S" });
const maxResults = Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_RESULT_LIMIT }));
const objectType = Type.Union(CANONICAL_OBJECT_TYPES.map((value) => Type.Literal(value)));
const distribution = Type.Union([
  Type.Literal("organic"),
  Type.Literal("promoted"),
  Type.Literal("combined"),
  Type.Literal("provider_total"),
]);

export const marketingDataCatalogParameters = Type.Object(
  {
    tenant_id: identifier,
    object_types: Type.Optional(
      Type.Array(objectType, {
        maxItems: CANONICAL_OBJECT_TYPES.length,
        uniqueItems: true,
      }),
    ),
    account_id: Type.Optional(identifier),
    content_id: Type.Optional(identifier),
    max_results: maxResults,
  },
  { additionalProperties: false },
);

export const marketingMetricsParameters = Type.Object(
  {
    tenant_id: identifier,
    account_id: Type.Optional(identifier),
    content_ids: Type.Optional(
      Type.Array(identifier, { maxItems: MAX_RESULT_LIMIT, uniqueItems: true }),
    ),
    metric_definition_id: identifier,
    metric_family: Type.Optional(identifier),
    metric_name: Type.Optional(identifier),
    distribution,
    from: Type.Optional(dateBoundary),
    to: Type.Optional(dateBoundary),
    trend: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

export const marketingExperimentsParameters = Type.Object(
  {
    tenant_id: identifier,
    account_id: Type.Optional(identifier),
    status: Type.Optional(identifier),
    from: Type.Optional(dateBoundary),
    to: Type.Optional(dateBoundary),
    max_results: maxResults,
  },
  { additionalProperties: false },
);

type MarketingDataCatalogInput = Static<typeof marketingDataCatalogParameters>;
type MarketingMetricsInput = Static<typeof marketingMetricsParameters>;
type MarketingExperimentsInput = Static<typeof marketingExperimentsParameters>;
type DateRange = { from?: number; to?: number };
type JsonBudget = { remaining: number };

function parseInput<Schema extends TSchema>(
  schema: Schema,
  input: unknown,
  toolName: string,
): Static<Schema> {
  if (Check(schema, input)) {
    return input;
  }
  const issue = Errors(schema, input)[0];
  const location = issue?.instancePath || "/";
  const detail = issue?.message ?? "input does not match the declared schema";
  throw new Error(`${toolName} parameters are invalid at ${location}: ${detail}.`);
}

function parseDateRange(from?: string, to?: string): DateRange {
  const fromEpoch = from === undefined ? undefined : Date.parse(from);
  const toEpoch = to === undefined ? undefined : Date.parse(to);
  if (fromEpoch !== undefined && !Number.isFinite(fromEpoch)) {
    throw new Error("from must be an ISO-compatible timestamp.");
  }
  if (toEpoch !== undefined && !Number.isFinite(toEpoch)) {
    throw new Error("to must be an ISO-compatible timestamp.");
  }
  if (fromEpoch !== undefined && toEpoch !== undefined && fromEpoch > toEpoch) {
    throw new Error("from must be earlier than or equal to to.");
  }
  return { from: fromEpoch, to: toEpoch };
}

function timestampInRange(value: unknown, range: DateRange): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const epoch = Date.parse(value);
  return (
    Number.isFinite(epoch) &&
    (range.from === undefined || epoch >= range.from) &&
    (range.to === undefined || epoch <= range.to)
  );
}

function timestampEpoch(value: unknown): number {
  return typeof value === "string" ? Date.parse(value) : 0;
}

function sortedByTimestamp<T extends CanonicalRecord>(
  records: T[],
  timestamp: (record: T) => unknown,
): T[] {
  return records.toSorted(
    (left, right) =>
      timestampEpoch(timestamp(left)) - timestampEpoch(timestamp(right)) ||
      left.object_id.localeCompare(right.object_id),
  );
}

async function visibleForTenant(store: AgencyDataStore, tenantId: string) {
  const read = await store.read({ tenantId });
  return { ...read, records: materializeVisibleRecords(read.records) };
}

function safeCatalogRecord(record: CanonicalRecord): Record<string, unknown> {
  const { source, source_ref, subject, ...rest } = record;
  return {
    ...rest,
    subject,
    source: { provider: source.provider, auth_mode: source.auth_mode },
    source_ref,
  };
}

function takeWithinBudget<Input, Output>(
  values: Input[],
  maxItems: number,
  budget: JsonBudget,
  map: (value: Input) => Output,
): { items: Output[]; truncated: boolean } {
  const items: Output[] = [];
  for (const value of values) {
    if (items.length >= maxItems) {
      return { items, truncated: true };
    }
    const item = map(value);
    const separatorBytes = items.length === 0 ? 0 : 1;
    const itemBytes = Buffer.byteLength(JSON.stringify(item), "utf8") + separatorBytes;
    if (itemBytes > budget.remaining) {
      return { items, truncated: true };
    }
    budget.remaining -= itemBytes;
    items.push(item);
  }
  return { items, truncated: false };
}

function createResultBudget(): JsonBudget {
  return { remaining: MAX_MODEL_RESULT_BYTES - RESULT_METADATA_RESERVE_BYTES };
}

export async function queryMarketingDataCatalog(store: AgencyDataStore, rawInput: unknown) {
  const input: MarketingDataCatalogInput = parseInput(
    marketingDataCatalogParameters,
    rawInput,
    "marketing_data_catalog",
  );
  const read = await visibleForTenant(store, input.tenant_id);
  const types = new Set<CanonicalObjectType>(
    input.object_types ?? ["account_snapshot", "content_item", "metric_definition", "experiment"],
  );
  const matching = sortedByTimestamp(
    read.records.filter(
      (record) =>
        types.has(record.object_type) &&
        (input.account_id === undefined || record.account_id === input.account_id) &&
        (input.content_id === undefined || record.content_id === input.content_id),
    ),
    (record) => record.event_at,
  );
  const bounded = takeWithinBudget(
    matching,
    input.max_results ?? DEFAULT_RESULT_LIMIT,
    createResultBudget(),
    safeCatalogRecord,
  );
  return {
    records: bounded.items,
    returned: bounded.items.length,
    results_truncated: bounded.truncated,
    scanned: read.scanned,
    malformed_rows: read.malformed_rows,
    truncated: read.truncated,
  };
}

type NumericMetric = CanonicalRecord & {
  account_id: string;
  metric_definition_id: string;
  metric_family: string;
  metric_name: string;
  numerator: number;
  denominator: number;
  unit: string;
  completeness: number;
  method_version: string;
  observation_at: string;
  distribution: Distribution;
};

function percentile(sortedValues: number[], fraction: number): number | null {
  if (sortedValues.length === 0) {
    return null;
  }
  const index = (sortedValues.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (index - lower);
}

function metricSummary(records: NumericMetric[]) {
  const rateRecords = records
    .filter((record) => record.denominator > 0)
    .map((record) => ({ record, rate: record.numerator / record.denominator }))
    .filter(({ rate }) => Number.isFinite(rate));
  const rates = rateRecords.map(({ rate }) => rate).toSorted((left, right) => left - right);
  const numeratorTotal = rateRecords.reduce((total, { record }) => total + record.numerator, 0);
  const denominatorTotal = rateRecords.reduce((total, { record }) => total + record.denominator, 0);
  const totalsAreFinite = Number.isFinite(numeratorTotal) && Number.isFinite(denominatorTotal);
  const aggregateRate =
    totalsAreFinite && denominatorTotal > 0 ? numeratorTotal / denominatorTotal : null;
  const aggregateRateIsFinite = aggregateRate === null || Number.isFinite(aggregateRate);
  const medianCompleteness = percentile(
    records.map((record) => record.completeness).toSorted((left, right) => left - right),
    0.5,
  );
  const warnings: string[] = [];
  if (records.length < 30) {
    warnings.push("sample_size_below_30");
  }
  if (records.some((record) => record.denominator === 0)) {
    warnings.push("zero_denominator_observations_excluded_from_rate_aggregates");
  }
  if (rateRecords.length < records.filter((record) => record.denominator > 0).length) {
    warnings.push("non_finite_rate_observations_excluded");
  }
  if (!totalsAreFinite || !aggregateRateIsFinite) {
    warnings.push("aggregate_totals_exceed_numeric_range");
  }
  if (medianCompleteness !== null && medianCompleteness < 0.9) {
    warnings.push("median_completeness_below_0.90");
  }
  return {
    sample_size: records.length,
    rate_sample_size: rates.length,
    numerator_total: totalsAreFinite ? numeratorTotal : null,
    denominator_total: totalsAreFinite ? denominatorTotal : null,
    aggregate_rate: aggregateRateIsFinite ? aggregateRate : null,
    robust_percentiles: {
      p10: percentile(rates, 0.1),
      p25: percentile(rates, 0.25),
      median: percentile(rates, 0.5),
      p75: percentile(rates, 0.75),
      p90: percentile(rates, 0.9),
    },
    median_completeness: medianCompleteness,
    warnings,
  };
}

function assertConsistentMetricDefinition(records: NumericMetric[]): void {
  const signatures = new Set(
    records.map((record) =>
      JSON.stringify([
        record.metric_family,
        record.metric_name,
        record.unit,
        record.method_version,
      ]),
    ),
  );
  if (signatures.size > 1) {
    throw new Error(
      "metric_definition_id resolves to inconsistent family, name, unit, or method metadata.",
    );
  }
}

export async function queryMarketingMetrics(store: AgencyDataStore, rawInput: unknown) {
  const input: MarketingMetricsInput = parseInput(
    marketingMetricsParameters,
    rawInput,
    "marketing_metrics",
  );
  const range = parseDateRange(input.from, input.to);
  const read = await visibleForTenant(store, input.tenant_id);
  const contentIds = input.content_ids ? new Set(input.content_ids) : undefined;
  const observations = sortedByTimestamp(
    read.records.filter(
      (record): record is NumericMetric =>
        record.object_type === "metric_observation" &&
        record.metric_definition_id === input.metric_definition_id &&
        record.distribution === input.distribution &&
        (input.account_id === undefined || record.account_id === input.account_id) &&
        (contentIds === undefined ||
          (typeof record.content_id === "string" && contentIds.has(record.content_id))) &&
        (input.metric_family === undefined || record.metric_family === input.metric_family) &&
        (input.metric_name === undefined || record.metric_name === input.metric_name) &&
        timestampInRange(record.observation_at, range) &&
        typeof record.account_id === "string" &&
        typeof record.metric_family === "string" &&
        typeof record.metric_name === "string" &&
        typeof record.numerator === "number" &&
        typeof record.denominator === "number" &&
        typeof record.unit === "string" &&
        typeof record.completeness === "number" &&
        typeof record.method_version === "string" &&
        typeof record.observation_at === "string",
    ),
    (record) => record.observation_at,
  );
  assertConsistentMetricDefinition(observations);

  const first = observations[0];
  const metric = first
    ? {
        metric_definition_id: first.metric_definition_id,
        metric_family: first.metric_family,
        metric_name: first.metric_name,
        unit: first.unit,
        method_version: first.method_version,
      }
    : { metric_definition_id: input.metric_definition_id };
  const summary = metricSummary(observations);
  const result = {
    metric,
    distribution: input.distribution,
    summary,
    scanned: read.scanned,
    malformed_rows: read.malformed_rows,
    truncated: read.truncated,
  };
  if (input.trend !== true) {
    return result;
  }

  const recordsByDay = new Map<string, NumericMetric[]>();
  for (const record of observations) {
    const day = new Date(Date.parse(record.observation_at)).toISOString().slice(0, 10);
    const records = recordsByDay.get(day) ?? [];
    records.push(record);
    recordsByDay.set(day, records);
  }
  const allTrend = [...recordsByDay.entries()]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([day, records]) => Object.assign({ day }, metricSummary(records)));
  const trendBudget = createResultBudget();
  trendBudget.remaining -= Buffer.byteLength(JSON.stringify(result), "utf8");
  const trend = takeWithinBudget(allTrend, MAX_TREND_BUCKETS, trendBudget, (entry) => entry);
  return {
    ...result,
    trend: trend.items,
    trend_truncated: trend.truncated,
  };
}

type ExperimentRecord = CanonicalRecord & { experiment_id: string; started_at: string };

export async function queryMarketingExperiments(store: AgencyDataStore, rawInput: unknown) {
  const input: MarketingExperimentsInput = parseInput(
    marketingExperimentsParameters,
    rawInput,
    "marketing_experiments",
  );
  const range = parseDateRange(input.from, input.to);
  const read = await visibleForTenant(store, input.tenant_id);
  const matchingExperiments = sortedByTimestamp(
    read.records.filter(
      (record): record is ExperimentRecord =>
        record.object_type === "experiment" &&
        typeof record.experiment_id === "string" &&
        typeof record.started_at === "string" &&
        (input.account_id === undefined || record.account_id === input.account_id) &&
        (input.status === undefined || record.status === input.status) &&
        timestampInRange(record.started_at, range),
    ),
    (record) => record.started_at,
  );
  const budget = createResultBudget();
  const experiments = takeWithinBudget(
    matchingExperiments,
    input.max_results ?? DEFAULT_RESULT_LIMIT,
    budget,
    safeCatalogRecord,
  );
  const experimentIds = new Set(experiments.items.map((record) => String(record.experiment_id)));
  const matchingRelated = sortedByTimestamp(
    read.records.filter(
      (record) =>
        [
          "campaign_variant_association",
          "recommendation",
          "operator_decision",
          "approved_learning",
        ].includes(record.object_type) &&
        typeof record.experiment_id === "string" &&
        experimentIds.has(record.experiment_id),
    ),
    (record) => record.event_at,
  );
  const related = takeWithinBudget(matchingRelated, MAX_RESULT_LIMIT, budget, safeCatalogRecord);
  return {
    experiments: experiments.items,
    related: related.items,
    returned: experiments.items.length,
    results_truncated: experiments.truncated,
    related_truncated: related.truncated,
    scanned: read.scanned,
    malformed_rows: read.malformed_rows,
    truncated: read.truncated,
  };
}
