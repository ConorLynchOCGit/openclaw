import { createHash } from "node:crypto";
import type { PluginStateKeyedStore } from "openclaw/plugin-sdk/plugin-state-runtime";
import { redactSensitiveText } from "openclaw/plugin-sdk/security-runtime";

export const X_RESEARCH_ADMISSION_NAMESPACE = "x-research-admission-v1";
export const X_RESEARCH_LEGACY_BUDGET_NAMESPACE = "x-episode-request-budget-v1";
export const X_RESEARCH_STAGES = [
  "question_discovery",
  "question_verified_analysis",
  "topic_discovery",
  "influence_discovery",
  "influence_challenge",
  "format_analysis",
] as const;

export type XResearchStage = (typeof X_RESEARCH_STAGES)[number];
export type XResearchProfile = "full_hybrid_per_subject_v2" | "reduced_probe_v2";
export type XResearchRowKind = "product" | "probe_benchmark";
export type XResearchArm = "hybrid" | "raw_x_only" | "grok_only";
export type XResearchPriceAuthority = Readonly<{
  version: string;
  source: string;
  asOf: string;
  expiresAt: string;
  postUsd: number;
  userUsd: number;
  recentCountUsd: number;
  allCountUsd: number;
  fullGrokStageUsd: Readonly<Record<XResearchStage, number>>;
  reducedGrokStageUsd: Readonly<
    Pick<
      Record<XResearchStage, number>,
      "question_discovery" | "topic_discovery" | "influence_discovery"
    >
  >;
}>;

type StageState =
  | "reserved"
  | "complete"
  | "error"
  | "timed_out"
  | "cancelled"
  | "consumed_unknown";
type RowState = "held" | "active" | "closing" | "terminal";

type DirectResources = {
  requests: number;
  pages: number;
  posts: number;
  users: number;
  counts: number;
  media: number;
  bytes: number;
  dollars: number;
  acquisitionSeconds: number;
};
type GrokResources = { calls: number; dollars: number };
type ResourceCeiling = DirectResources & { grokCalls: number; grokDollars: number };
type StageCeiling = ResourceCeiling;
type StageSlot = {
  stage: XResearchStage;
  requestDigest: string;
  toolCallId: string;
  toolName: string;
  state: StageState;
  reservedAt: number;
  reservation: { direct: DirectResources; grok: GrokResources };
  settledAt?: number;
  receipt?: Record<string, unknown>;
};

export type XResearchAdmissionRow = Readonly<{
  kind: "row";
  rowKind: XResearchRowKind;
  state: RowState;
  runId: string;
  sessionKey: string;
  sessionId?: string;
  agentId: string;
  modelProviderId: string;
  modelId: string;
  workspaceDir: string;
  promptDigest: string;
  runtimePromptDigest?: string;
  profile: XResearchProfile;
  arm: XResearchArm;
  allowedStages: readonly XResearchStage[];
  ceiling: ResourceCeiling;
  stageCeilings: Partial<Record<XResearchStage, StageCeiling>>;
  subjectKey?: string;
  manifestDigest?: string;
  rowDigest?: string;
  caseId?: string;
  requestIdentityDigest?: string;
  priceAuthorityDigest: string;
  expiresAt: number;
  retentionUntil: number;
  createdAt: number;
  terminalAnchorAt?: number;
  closeoutDueAt?: number;
  terminalOutcome?: string;
  terminalDigest?: string;
  taskId?: string;
  launchedAt?: number;
  resourceOverrun?: boolean;
  legacyMigration?: {
    sourceNamespace: typeof X_RESEARCH_LEGACY_BUDGET_NAMESPACE;
    usedRequests: number;
    migratedAt: number;
  };
  direct: DirectResources;
  grok: GrokResources;
  stages: Record<string, StageSlot>;
}>;

type Root = Readonly<{
  kind: "root";
  manifestDigest: string;
  commitState: "held" | "ready";
  rows: number;
  rowDigests: Record<string, string>;
  expiresAt: number;
  notBefore: number;
  runtimeVersion: string;
  priceAuthorityDigest: string;
  sourceRef: string;
  configDigest: string;
  writer: string;
  approver: string;
  retentionUntil: number;
}>;
type RecordValue = Root | XResearchAdmissionRow;
type AtomicStore<T> = PluginStateKeyedStore<T> & {
  update?: (
    key: string,
    updateValue: (current: T | undefined) => T | undefined,
    opts?: { ttlMs?: number },
  ) => Promise<boolean>;
};
type LegacyBudget = Readonly<{ used: number; updatedAt: number }>;
type LegacyBudgetStore = Pick<PluginStateKeyedStore<LegacyBudget>, "lookup" | "consume">;
type WaitForRun = (params: {
  runId: string;
  timeoutMs?: number;
}) => Promise<{ status: "ok" | "error" | "timeout"; error?: string }>;

export type AdmissionResult =
  | { allowed: true; row: XResearchAdmissionRow }
  | { allowed: false; code: string; receipt?: Record<string, unknown> };

const DAY_MS = 24 * 60 * 60 * 1_000;
const RETENTION_MS = 31 * DAY_MS;
const EMPTY_DIRECT: DirectResources = {
  requests: 0,
  pages: 0,
  posts: 0,
  users: 0,
  counts: 0,
  media: 0,
  bytes: 0,
  dollars: 0,
  acquisitionSeconds: 0,
};

const DIRECT_REQUEST_ENVELOPE_BYTES = 4 * 1024;
const DIRECT_POST_ENVELOPE_BYTES = 32 * 1024;
const DIRECT_USER_ENVELOPE_BYTES = 16 * 1024;
const DIRECT_COUNT_ENVELOPE_BYTES = 64 * 1024;
const DIRECT_MEDIA_ENVELOPE_BYTES = 16 * 1024;

export function estimateXDirectResponseBytes(params: {
  requests?: number;
  posts?: number;
  users?: number;
  counts?: number;
  media?: number;
}): number {
  return (
    (params.requests ?? 0) * DIRECT_REQUEST_ENVELOPE_BYTES +
    (params.posts ?? 0) * DIRECT_POST_ENVELOPE_BYTES +
    (params.users ?? 0) * DIRECT_USER_ENVELOPE_BYTES +
    (params.counts ?? 0) * DIRECT_COUNT_ENVELOPE_BYTES +
    (params.media ?? 0) * DIRECT_MEDIA_ENVELOPE_BYTES
  );
}

const FULL_STAGE_CEILINGS: Record<XResearchStage, StageCeiling> = {
  question_discovery: ceiling(8, 2, 60, 20, 3, 0, 85),
  question_verified_analysis: ceiling(2, 0, 8, 8, 0, 0, 65),
  topic_discovery: ceiling(12, 0, 15, 15, 10, 0, 90),
  influence_discovery: ceiling(14, 12, 150, 30, 0, 0, 130),
  influence_challenge: ceiling(2, 0, 10, 10, 0, 0, 70),
  format_analysis: ceiling(10, 8, 290, 8, 0, 40, 185),
};
const REDUCED_STAGE_CEILINGS: Partial<Record<XResearchStage, StageCeiling>> = {
  question_discovery: ceiling(5, 1, 26, 8, 1, 0, 70),
  topic_discovery: ceiling(6, 0, 8, 8, 4, 0, 70),
  influence_discovery: ceiling(8, 6, 42, 12, 0, 0, 90),
};
const FULL_RAW_STAGE_CEILINGS: Partial<Record<XResearchStage, StageCeiling>> = {
  question_discovery: ceiling(17, 15, 180, 40, 0, 0, 140),
  topic_discovery: ceiling(18, 8, 80, 0, 10, 0, 120),
  influence_discovery: ceiling(9, 8, 110, 0, 0, 0, 100),
  format_analysis: ceiling(7, 6, 220, 0, 0, 40, 105),
};
const REDUCED_RAW_STAGE_CEILINGS: Partial<Record<XResearchStage, StageCeiling>> = {
  question_discovery: ceiling(6, 4, 48, 12, 0, 0, 50),
  topic_discovery: ceiling(5, 1, 10, 0, 4, 0, 30),
  influence_discovery: ceiling(3, 3, 15, 0, 0, 0, 40),
};
const FULL_HYBRID_CEILING = ceiling(48, 22, 533, 91, 13, 40, 625);
const REDUCED_HYBRID_CEILING = ceiling(19, 7, 76, 28, 5, 0, 230);
const FULL_RAW_CEILING = ceiling(51, 37, 590, 40, 10, 40, 465);
const REDUCED_RAW_CEILING = ceiling(14, 8, 73, 12, 4, 0, 120);
const FULL_GROK_ONLY_CEILING = ceiling(0, 0, 0, 0, 0, 0, 155);
const DEPENDENCY: Partial<Record<XResearchStage, XResearchStage>> = {
  question_verified_analysis: "question_discovery",
  influence_challenge: "influence_discovery",
  format_analysis: "influence_discovery",
};
const LEGACY_PURPOSES = [
  "question_research",
  "topic_pulse",
  "influence_map",
  "format_study",
  "source_verification",
  "owned_performance",
] as const;

function ceiling(
  requests: number,
  pages: number,
  posts: number,
  users: number,
  counts: number,
  media: number,
  acquisitionSeconds: number,
): ResourceCeiling {
  return {
    grokCalls: 0,
    grokDollars: 0,
    requests,
    pages,
    posts,
    users,
    counts,
    media,
    bytes: estimateXDirectResponseBytes({ requests, posts, users, counts, media }),
    dollars: 0,
    acquisitionSeconds,
  };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
function digestBytes(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
function terminalDigestFor(row: XResearchAdmissionRow): string {
  const { terminalDigest: _terminalDigest, ...content } = row;
  return digest({ ...content, state: "terminal" });
}

function rowKey(runId: string) {
  return `row:${runId}`;
}
function rootKey(manifestDigest: string) {
  return `root:${manifestDigest}`;
}
function legacyBudgetKey(sessionKey: string, purpose: string): string {
  return createHash("sha256").update(`${sessionKey}\0${purpose}`).digest("hex");
}
function isStage(value: unknown): value is XResearchStage {
  return typeof value === "string" && (X_RESEARCH_STAGES as readonly string[]).includes(value);
}
function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function money(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
function validPriceAuthority(
  value: XResearchPriceAuthority | undefined,
  activeAt: number,
  requiredThrough: number,
): value is XResearchPriceAuthority {
  if (!value?.version || !value.source) {
    return false;
  }
  const asOf = Date.parse(value.asOf);
  const expiresAt = Date.parse(value.expiresAt);
  const full = value.fullGrokStageUsd;
  const reduced = value.reducedGrokStageUsd;
  const positive = (price: unknown) =>
    typeof price === "number" && Number.isFinite(price) && price > 0;
  return (
    Number.isFinite(asOf) &&
    Number.isFinite(expiresAt) &&
    asOf <= activeAt &&
    expiresAt >= requiredThrough &&
    positive(value.postUsd) &&
    positive(value.userUsd) &&
    positive(value.recentCountUsd) &&
    positive(value.allCountUsd) &&
    X_RESEARCH_STAGES.every((stage) => positive(full?.[stage])) &&
    positive(reduced?.question_discovery) &&
    positive(reduced?.topic_discovery) &&
    positive(reduced?.influence_discovery)
  );
}

function sumPrices(values: readonly number[]): number {
  return money(values.reduce((total, value) => total + value, 0));
}

function pricedCeiling(
  template: ResourceCeiling,
  authority: XResearchPriceAuthority,
  grokDollars = 0,
  grokCalls = grokDollars > 0 ? 1 : 0,
): ResourceCeiling {
  return {
    ...template,
    grokCalls,
    grokDollars: money(grokDollars),
    dollars: money(
      template.posts * authority.postUsd +
        template.users * authority.userUsd +
        template.counts * authority.recentCountUsd,
    ),
  };
}

function pricedStageCeilings(
  templates: Partial<Record<XResearchStage, StageCeiling>>,
  prices: Partial<Record<XResearchStage, number>>,
  authority: XResearchPriceAuthority,
): Partial<Record<XResearchStage, StageCeiling>> {
  return Object.fromEntries(
    Object.entries(templates).map(([stage, template]) => [
      stage,
      pricedCeiling(template, authority, prices[stage as XResearchStage] ?? 0),
    ]),
  );
}
function addDirect(left: DirectResources, right: DirectResources): DirectResources {
  return {
    requests: left.requests + right.requests,
    pages: left.pages + right.pages,
    posts: left.posts + right.posts,
    users: left.users + right.users,
    counts: left.counts + right.counts,
    media: left.media + right.media,
    bytes: left.bytes + right.bytes,
    dollars: money(left.dollars + right.dollars),
    acquisitionSeconds: left.acquisitionSeconds + right.acquisitionSeconds,
  };
}
function exceedsDirect(value: DirectResources, limit: DirectResources): boolean {
  return (
    value.requests > limit.requests ||
    value.pages > limit.pages ||
    value.posts > limit.posts ||
    value.users > limit.users ||
    value.counts > limit.counts ||
    value.media > limit.media ||
    value.bytes > limit.bytes ||
    value.dollars > limit.dollars + 1e-9 ||
    value.acquisitionSeconds > limit.acquisitionSeconds
  );
}
function stageSlots(row: XResearchAdmissionRow, stage: XResearchStage): StageSlot[] {
  return Object.values(row.stages).filter((slot) => slot.stage === stage);
}
function earliestReservedAt(slots: readonly StageSlot[]): number | undefined {
  return slots.length > 0 ? Math.min(...slots.map((slot) => slot.reservedAt)) : undefined;
}
function aggregateStageDirect(row: XResearchAdmissionRow, stage: XResearchStage): DirectResources {
  return stageSlots(row, stage).reduce((total, slot) => addDirect(total, slot.reservation.direct), {
    ...EMPTY_DIRECT,
  });
}
function uniqueStringCount(value: unknown): number | undefined {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry.trim())) {
    return undefined;
  }
  const strings = value as string[];
  return new Set(strings).size === strings.length ? strings.length : undefined;
}
function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function directEstimate(
  toolName: string,
  params: Record<string, unknown>,
  authority: XResearchPriceAuthority,
): DirectResources | undefined {
  const operation = asString(params.operation);
  const maxResults = positiveInteger(params.max_results);
  let pages = 0;
  let posts = 0;
  let users = 0;
  let counts = 0;
  let media = 0;
  let requests = 1;
  let dollars: number;

  if (toolName === "x_posts") {
    if (["recent", "archive", "thread", "quotes", "replies"].includes(operation ?? "")) {
      if (!maxResults || maxResults < 10 || maxResults > 100) {
        return undefined;
      }
      pages = 1;
      posts = maxResults;
    } else if (operation === "exact") {
      if (!asString(params.id)) {
        return undefined;
      }
      posts = 1;
    } else if (operation === "batch") {
      posts = uniqueStringCount(params.ids) ?? 0;
      if (posts < 1 || posts > 100) {
        return undefined;
      }
    } else if (operation === "format_media") {
      posts = uniqueStringCount(params.post_ids) ?? 0;
      if (posts < 1 || posts > 10) {
        return undefined;
      }
      media = posts * 4;
    } else {
      return undefined;
    }
    dollars = posts * authority.postUsd;
  } else if (toolName === "x_users") {
    if (operation === "identity") {
      const ids = uniqueStringCount(params.ids);
      const usernames = uniqueStringCount(params.usernames);
      const id = asString(params.id);
      const username = asString(params.username);
      const selected = [
        ids !== undefined,
        usernames !== undefined,
        Boolean(id),
        Boolean(username),
      ].filter(Boolean).length;
      if (selected !== 1) {
        return undefined;
      }
      users = ids ?? usernames ?? 1;
    } else if (["search", "followers", "following"].includes(operation ?? "")) {
      if (!maxResults || maxResults < 1 || maxResults > 100) {
        return undefined;
      }
      pages = 1;
      users = maxResults;
    } else {
      return undefined;
    }
    if (users > 100) {
      return undefined;
    }
    dollars = users * authority.userUsd;
  } else if (toolName === "x_timelines") {
    if (
      !["authored", "reverse_chronological"].includes(operation ?? "") ||
      !maxResults ||
      maxResults < 5 ||
      maxResults > 100
    ) {
      return undefined;
    }
    pages = 1;
    posts = maxResults;
    dollars = posts * authority.postUsd;
  } else if (toolName === "x_counts") {
    if (operation !== "recent" || !asString(params.query)) {
      return undefined;
    }
    counts = 1;
    dollars = authority.recentCountUsd;
  } else if (toolName === "x_metrics") {
    if (operation !== "public" && operation !== "owned") {
      return undefined;
    }
    posts = uniqueStringCount(params.post_ids) ?? 0;
    if (posts < 1 || posts > 100) {
      return undefined;
    }
    if (operation === "owned") {
      requests = 3;
      users = 1;
    }
    dollars = posts * authority.postUsd + users * authority.userUsd;
  } else {
    return undefined;
  }

  return {
    requests,
    pages,
    posts,
    users,
    counts,
    media,
    bytes: estimateXDirectResponseBytes({ requests, posts, users, counts, media }),
    dollars,
    acquisitionSeconds: 0,
  };
}

function numberOrUnknown(source: Record<string, unknown>, key: string): number | "unknown" {
  return typeof source[key] === "number" && Number.isFinite(source[key]) ? source[key] : "unknown";
}
function receiptProjection(value: unknown, error?: string): Record<string, unknown> {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const details =
    source.details && typeof source.details === "object" && !Array.isArray(source.details)
      ? (source.details as Record<string, unknown>)
      : source;
  const resources =
    details.resources && typeof details.resources === "object" && !Array.isArray(details.resources)
      ? (details.resources as Record<string, unknown>)
      : details;
  const cost =
    details.cost && typeof details.cost === "object" && !Array.isArray(details.cost)
      ? (details.cost as Record<string, unknown>)
      : details;
  const providerReceipt =
    details.providerReceipt &&
    typeof details.providerReceipt === "object" &&
    !Array.isArray(details.providerReceipt)
      ? (details.providerReceipt as Record<string, unknown>)
      : {};
  const returnedError =
    typeof details.error === "string"
      ? details.error
      : details.error && typeof details.error === "object" && !Array.isArray(details.error)
        ? asString((details.error as Record<string, unknown>).code)
        : undefined;
  const directProviderCost = numberOrUnknown(cost, "provider_cost_usd");
  const xaiProviderCost = numberOrUnknown(providerReceipt, "providerCostUsd");
  const projectedError = error ?? returnedError;
  const elapsedMs =
    numberOrUnknown(resources, "duration_ms") === "unknown"
      ? numberOrUnknown(providerReceipt, "elapsedMs")
      : numberOrUnknown(resources, "duration_ms");
  return {
    status: error
      ? "error"
      : typeof details.status === "string"
        ? details.status
        : typeof source.status === "string"
          ? source.status
          : returnedError
            ? "failed"
            : "complete",
    ...(projectedError ? { error: redactSensitiveText(projectedError).slice(0, 240) } : {}),
    cache: typeof details.cache === "object" ? "reported" : "unknown",
    resources: {
      requests: numberOrUnknown(resources, "requests"),
      pages: numberOrUnknown(resources, "pages"),
      bytes: numberOrUnknown(resources, "serialized_bytes"),
      posts: numberOrUnknown(resources, "posts"),
      users: numberOrUnknown(resources, "users"),
      counts: numberOrUnknown(resources, "counts"),
      media: numberOrUnknown(resources, "media"),
    },
    providerCost: directProviderCost === "unknown" ? xaiProviderCost : directProviderCost,
    elapsedMs,
    innerReceipt:
      typeof details.receipt_ref === "string"
        ? details.receipt_ref
        : typeof providerReceipt.providerRequestId === "string"
          ? providerReceipt.providerRequestId
          : typeof details.provider_status === "string"
            ? details.provider_status
            : "unknown",
  };
}

function observedOverrun(receipt: Record<string, unknown>, slot: StageSlot): boolean {
  if (slot.toolName === "x_search") {
    const providerCost = receipt.providerCost;
    const elapsedMs = receipt.elapsedMs;
    return (
      (typeof providerCost === "number" && providerCost > slot.reservation.grok.dollars + 1e-9) ||
      (slot.reservation.direct.acquisitionSeconds > 0 &&
        typeof elapsedMs === "number" &&
        elapsedMs > slot.reservation.direct.acquisitionSeconds * 1_000)
    );
  }
  const resources = receipt.resources as Record<string, unknown> | undefined;
  if (resources) {
    for (const key of [
      "requests",
      "pages",
      "posts",
      "users",
      "counts",
      "media",
      "bytes",
    ] as const) {
      const observed = resources[key];
      if (typeof observed === "number" && observed > slot.reservation.direct[key]) {
        return true;
      }
    }
  }
  const providerCost = receipt.providerCost;
  const costOverrun =
    typeof providerCost === "number" && providerCost > slot.reservation.direct.dollars + 1e-9;
  const elapsedMs = receipt.elapsedMs;
  const elapsedOverrun =
    slot.reservation.direct.acquisitionSeconds > 0 &&
    typeof elapsedMs === "number" &&
    elapsedMs > slot.reservation.direct.acquisitionSeconds * 1_000;
  return costOverrun || elapsedOverrun;
}

function profileAuthority(
  profile: XResearchProfile,
  arm: XResearchArm,
  priceAuthority: XResearchPriceAuthority,
):
  | {
      allowedStages: readonly XResearchStage[];
      ceiling: ResourceCeiling;
      stageCeilings: Partial<Record<XResearchStage, StageCeiling>>;
    }
  | undefined {
  if (profile === "reduced_probe_v2") {
    const allowedStages = ["question_discovery", "topic_discovery", "influence_discovery"] as const;
    if (arm === "hybrid") {
      const grokDollars = sumPrices(Object.values(priceAuthority.reducedGrokStageUsd));
      return {
        allowedStages,
        ceiling: pricedCeiling(REDUCED_HYBRID_CEILING, priceAuthority, grokDollars, 3),
        stageCeilings: pricedStageCeilings(
          REDUCED_STAGE_CEILINGS,
          priceAuthority.reducedGrokStageUsd,
          priceAuthority,
        ),
      };
    }
    if (arm === "raw_x_only") {
      return {
        allowedStages,
        ceiling: pricedCeiling(REDUCED_RAW_CEILING, priceAuthority),
        stageCeilings: pricedStageCeilings(REDUCED_RAW_STAGE_CEILINGS, {}, priceAuthority),
      };
    }
    return undefined;
  }
  if (arm === "hybrid") {
    const grokDollars = sumPrices(Object.values(priceAuthority.fullGrokStageUsd));
    return {
      allowedStages: X_RESEARCH_STAGES,
      ceiling: pricedCeiling(FULL_HYBRID_CEILING, priceAuthority, grokDollars, 6),
      stageCeilings: pricedStageCeilings(
        FULL_STAGE_CEILINGS,
        priceAuthority.fullGrokStageUsd,
        priceAuthority,
      ),
    };
  }
  if (arm === "raw_x_only") {
    return {
      allowedStages: [
        "question_discovery",
        "topic_discovery",
        "influence_discovery",
        "format_analysis",
      ],
      ceiling: pricedCeiling(FULL_RAW_CEILING, priceAuthority),
      stageCeilings: pricedStageCeilings(FULL_RAW_STAGE_CEILINGS, {}, priceAuthority),
    };
  }
  const grokOnlyStages = ["question_discovery", "topic_discovery", "influence_discovery"] as const;
  const grokOnlyDollars = sumPrices(
    grokOnlyStages.map((stage) => priceAuthority.fullGrokStageUsd[stage]),
  );
  return {
    allowedStages: grokOnlyStages,
    ceiling: pricedCeiling(FULL_GROK_ONLY_CEILING, priceAuthority, grokOnlyDollars, 3),
    stageCeilings: Object.fromEntries(
      grokOnlyStages.map((stage) => [
        stage,
        pricedCeiling(
          ceiling(0, 0, 0, 0, 0, 0, stage === "influence_discovery" ? 55 : 50),
          priceAuthority,
          priceAuthority.fullGrokStageUsd[stage],
        ),
      ]),
    ),
  };
}

type ProofRowInput = {
  runId: string;
  sessionKey: string;
  agentId: string;
  modelProviderId: string;
  modelId: string;
  workspaceDir: string;
  promptDigest: string;
  profile: XResearchProfile;
  arm: XResearchArm;
  caseId: string;
};

function hasExactProofShape(rows: readonly ProofRowInput[]): boolean {
  const profiles = new Set(rows.map((row) => row.profile));
  if (profiles.size !== 1) {
    return false;
  }
  const profile = rows[0]?.profile;
  const expectedArms: readonly XResearchArm[] =
    profile === "reduced_probe_v2"
      ? ["hybrid", "raw_x_only"]
      : ["hybrid", "raw_x_only", "grok_only"];
  const expectedCases = profile === "reduced_probe_v2" ? 2 : 4;
  if (rows.length !== expectedCases * expectedArms.length) {
    return false;
  }
  const byCase = new Map<string, Set<XResearchArm>>();
  for (const row of rows) {
    const arms = byCase.get(row.caseId) ?? new Set<XResearchArm>();
    arms.add(row.arm);
    byCase.set(row.caseId, arms);
  }
  return (
    byCase.size === expectedCases &&
    [...byCase.values()].every(
      (arms) => arms.size === expectedArms.length && expectedArms.every((arm) => arms.has(arm)),
    )
  );
}

export class XResearchAdmission {
  readonly store: AtomicStore<RecordValue>;
  private readonly now: () => number;
  private readonly schedule: (fn: () => void, delayMs: number) => unknown;
  private readonly onCloseoutError: (error: unknown) => void;
  private readonly priceAuthority: XResearchPriceAuthority | undefined;
  private readonly legacyBudgetStore: LegacyBudgetStore | undefined;
  private readonly waitForRun: WaitForRun | undefined;

  constructor(params: {
    store: PluginStateKeyedStore<RecordValue>;
    now?: () => number;
    schedule?: (fn: () => void, delayMs: number) => unknown;
    onCloseoutError?: (error: unknown) => void;
    priceAuthority?: XResearchPriceAuthority;
    legacyBudgetStore?: LegacyBudgetStore;
    waitForRun?: WaitForRun;
  }) {
    this.store = params.store as AtomicStore<RecordValue>;
    this.now = params.now ?? Date.now;
    this.schedule = params.schedule ?? ((fn, delayMs) => setTimeout(fn, delayMs));
    this.onCloseoutError = params.onCloseoutError ?? (() => {});
    this.priceAuthority = params.priceAuthority;
    this.legacyBudgetStore = params.legacyBudgetStore;
    this.waitForRun = params.waitForRun;
  }

  private async update<T>(
    key: string,
    fn: (current: RecordValue | undefined) => { next?: RecordValue; result: T },
    ttlMs?: number,
  ): Promise<T> {
    if (!this.store.update) {
      throw new Error("admission_state_missing_or_invalid");
    }
    let result: T | undefined;
    const existing = ttlMs === undefined ? await this.store.lookup(key) : undefined;
    const retainedUntil =
      existing?.kind === "root" || existing?.kind === "row" ? existing.retentionUntil : undefined;
    const effectiveTtlMs =
      ttlMs ??
      (retainedUntil !== undefined ? Math.max(1, retainedUntil - this.now()) : RETENTION_MS);
    await this.store.update(
      key,
      (current: RecordValue | undefined) => {
        const resolved = fn(current);
        result = resolved.result;
        return resolved.next;
      },
      { ttlMs: effectiveTtlMs },
    );
    return result as T;
  }

  private scheduleCloseout(runId: string, dueAt: number): void {
    this.schedule(
      () => {
        void this.closeout(runId).catch(this.onCloseoutError);
      },
      Math.max(0, dueAt - this.now()),
    );
  }

  async activateProduct(input: {
    runId?: string;
    sessionKey?: string;
    sessionId?: string;
    agentId?: string;
    modelProviderId?: string;
    modelId?: string;
    workspaceDir?: string;
    prompt: string;
    researcherAgentId: string;
  }): Promise<AdmissionResult> {
    const runId = asString(input.runId);
    const sessionKey = asString(input.sessionKey);
    const sessionId = asString(input.sessionId);
    const agentId = asString(input.agentId);
    const modelProviderId = asString(input.modelProviderId);
    const modelId = asString(input.modelId);
    const workspaceDir = asString(input.workspaceDir);
    if (
      !runId ||
      !sessionKey ||
      !sessionId ||
      !agentId ||
      !modelProviderId ||
      !modelId ||
      !workspaceDir ||
      agentId !== input.researcherAgentId
    ) {
      return { allowed: false, code: "admission_identity_missing_or_unauthorized" };
    }
    const now = this.now();
    if (!validPriceAuthority(this.priceAuthority, now, now + DAY_MS)) {
      return { allowed: false, code: "admission_price_authority_missing_or_stale" };
    }
    const legacyEntries = this.legacyBudgetStore
      ? await Promise.all(
          LEGACY_PURPOSES.map(async (purpose) => ({
            key: legacyBudgetKey(sessionKey, purpose),
            value: await this.legacyBudgetStore!.lookup(legacyBudgetKey(sessionKey, purpose)),
          })),
        )
      : [];
    if (
      legacyEntries.some(
        ({ value }) => value !== undefined && (!Number.isSafeInteger(value.used) || value.used < 0),
      )
    ) {
      return { allowed: false, code: "admission_legacy_budget_migration_invalid" };
    }
    const legacyUsed = legacyEntries.reduce((total, { value }) => total + (value?.used ?? 0), 0);
    const activated = await this.update<AdmissionResult>(rowKey(runId), (current) => {
      if (current) {
        return { result: { allowed: false, code: "admission_duplicate_run" } as AdmissionResult };
      }
      const authority = profileAuthority(
        "full_hybrid_per_subject_v2",
        "hybrid",
        this.priceAuthority!,
      )!;
      const promptDigest = digest(input.prompt);
      const row: XResearchAdmissionRow = {
        kind: "row",
        rowKind: "product",
        state: "active",
        runId,
        sessionKey,
        sessionId,
        agentId,
        modelProviderId,
        modelId,
        workspaceDir,
        promptDigest,
        profile: "full_hybrid_per_subject_v2",
        arm: "hybrid",
        requestIdentityDigest: digest({
          rowKind: "product",
          runId,
          sessionKeyDigest: digestBytes(sessionKey),
          sessionId,
          agentId,
          modelProviderId,
          modelId,
          workspaceDir,
          promptDigest,
        }),
        priceAuthorityDigest: digest(this.priceAuthority),
        ...authority,
        expiresAt: now + DAY_MS,
        retentionUntil: now + RETENTION_MS,
        createdAt: now,
        ...(legacyUsed > 0
          ? {
              legacyMigration: {
                sourceNamespace: X_RESEARCH_LEGACY_BUDGET_NAMESPACE,
                usedRequests: legacyUsed,
                migratedAt: now,
              },
              resourceOverrun: true,
            }
          : {}),
        direct: { ...EMPTY_DIRECT, requests: legacyUsed },
        grok: { calls: 0, dollars: 0 },
        stages: {},
      };
      return { next: row, result: { allowed: true, row } as AdmissionResult };
    });
    if (activated.allowed && this.legacyBudgetStore) {
      await Promise.all(
        legacyEntries
          .filter(({ value }) => value)
          .map(({ key }) => this.legacyBudgetStore!.consume(key)),
      );
    }
    return activated;
  }

  async activateProof(input: {
    runId?: string;
    sessionKey?: string;
    sessionId?: string;
    agentId?: string;
    modelProviderId?: string;
    modelId?: string;
    workspaceDir?: string;
    prompt: string;
  }): Promise<AdmissionResult> {
    const runId = asString(input.runId);
    const sessionKey = asString(input.sessionKey);
    const sessionId = asString(input.sessionId);
    if (!runId || !sessionKey || !sessionId) {
      return { allowed: false, code: "admission_identity_missing_or_unauthorized" };
    }
    const held = await this.store.lookup(rowKey(runId));
    if (!held || held.kind !== "row" || !held.manifestDigest) {
      return { allowed: false, code: "admission_state_missing_or_invalid" };
    }
    const root = await this.store.lookup(rootKey(held.manifestDigest));
    if (
      !root ||
      root.kind !== "root" ||
      root.commitState !== "ready" ||
      root.expiresAt <= this.now()
    ) {
      return { allowed: false, code: "admission_state_missing_or_invalid" };
    }
    return await this.update(rowKey(runId), (current) => {
      if (
        !current ||
        current.kind !== "row" ||
        current.rowKind !== "probe_benchmark" ||
        current.state !== "held"
      ) {
        return {
          result: { allowed: false, code: "admission_state_missing_or_invalid" } as AdmissionResult,
        };
      }
      if (
        current.sessionKey !== sessionKey ||
        current.agentId !== input.agentId ||
        current.modelProviderId !== input.modelProviderId ||
        current.modelId !== input.modelId ||
        current.workspaceDir !== input.workspaceDir ||
        current.expiresAt <= this.now() ||
        root.rowDigests[current.runId] !== current.rowDigest
      ) {
        return {
          result: { allowed: false, code: "admission_proof_identity_mismatch" } as AdmissionResult,
        };
      }
      // Raw task bytes are authorized at launch; native context assembly produces
      // a distinct model prompt whose digest is evidence, not a second authority.
      const row = {
        ...current,
        state: "active" as const,
        sessionId,
        runtimePromptDigest: digest(input.prompt),
      };
      return { next: row, result: { allowed: true, row } };
    });
  }

  async isKnownProofRun(runId: string | undefined): Promise<boolean> {
    const normalized = asString(runId);
    if (!normalized) {
      return false;
    }
    const row = await this.store.lookup(rowKey(normalized));
    if (row?.kind === "row" && row.rowKind === "probe_benchmark") {
      return true;
    }
    const entries = await this.store.entries();
    return entries.some(
      (entry) => entry.value.kind === "root" && Object.hasOwn(entry.value.rowDigests, normalized),
    );
  }

  async reserve(input: {
    toolName: string;
    params: Record<string, unknown>;
    runId?: string;
    sessionKey?: string;
    sessionId?: string;
    agentId?: string;
    toolCallId?: string;
  }): Promise<AdmissionResult> {
    const runId = asString(input.runId);
    const sessionKey = asString(input.sessionKey);
    const sessionId = asString(input.sessionId);
    const agentId = asString(input.agentId);
    const toolCallId = asString(input.toolCallId);
    const stage = input.params.research_stage;
    const profile = input.params.research_profile;
    if (
      !runId ||
      !sessionKey ||
      !sessionId ||
      !agentId ||
      !toolCallId ||
      !isStage(stage) ||
      (profile !== "full_hybrid_per_subject_v2" && profile !== "reduced_probe_v2")
    ) {
      return { allowed: false, code: "admission_request_invalid" };
    }
    return await this.update(rowKey(runId), (current) => {
      if (!current || current.kind !== "row" || current.state !== "active") {
        return {
          result: {
            allowed: false,
            code:
              current?.kind === "row" &&
              (current.state === "closing" || current.state === "terminal")
                ? "admission_row_terminal"
                : "admission_state_missing_or_invalid",
          } as AdmissionResult,
        };
      }
      if (
        current.sessionKey !== sessionKey ||
        current.sessionId !== sessionId ||
        current.agentId !== agentId ||
        current.profile !== profile ||
        current.expiresAt <= this.now()
      ) {
        return {
          result: { allowed: false, code: "admission_identity_mismatch" } as AdmissionResult,
        };
      }
      if (current.resourceOverrun) {
        return {
          result: {
            allowed: false,
            code: current.legacyMigration
              ? "admission_legacy_budget_migrated_unknown"
              : "admission_inner_overrun",
          } as AdmissionResult,
        };
      }
      if (
        !validPriceAuthority(this.priceAuthority, this.now(), current.expiresAt) ||
        digest(this.priceAuthority) !== current.priceAuthorityDigest
      ) {
        return {
          result: {
            allowed: false,
            code: "admission_price_authority_missing_stale_or_changed",
          } as AdmissionResult,
        };
      }
      if (!current.allowedStages.includes(stage)) {
        return { result: { allowed: false, code: "admission_stage_forbidden" } as AdmissionResult };
      }
      if (current.arm === "raw_x_only" && input.toolName === "x_search") {
        return {
          result: { allowed: false, code: "admission_arm_tool_forbidden" } as AdmissionResult,
        };
      }
      if (current.arm === "grok_only" && input.toolName !== "x_search") {
        return {
          result: { allowed: false, code: "admission_arm_tool_forbidden" } as AdmissionResult,
        };
      }
      if (input.params.research_cache_control !== undefined) {
        return {
          result: {
            allowed: false,
            code: "admission_cache_control_not_model_authorized",
          } as AdmissionResult,
        };
      }
      const subjectKey = asString(input.params.subject_key);
      if (
        current.rowKind === "product" &&
        subjectKey &&
        current.subjectKey &&
        current.subjectKey !== subjectKey
      ) {
        return { result: { allowed: false, code: "admission_subject_changed" } as AdmissionResult };
      }
      const predecessor = DEPENDENCY[stage];
      if (predecessor) {
        const predecessors = stageSlots(current, predecessor);
        if (predecessors.length === 0) {
          return {
            result: { allowed: false, code: "stage_predecessor_missing" } as AdmissionResult,
          };
        }
        if (predecessors.some((slot) => slot.state === "reserved")) {
          return {
            result: { allowed: false, code: "stage_settlement_pending" } as AdmissionResult,
          };
        }
        if (predecessors.some((slot) => slot.state !== "complete")) {
          return {
            result: { allowed: false, code: "stage_predecessor_failed" } as AdmissionResult,
          };
        }
      }

      if (!current.requestIdentityDigest) {
        return {
          result: { allowed: false, code: "admission_request_identity_missing" } as AdmissionResult,
        };
      }
      const requestDigest = digest({ toolName: input.toolName, params: input.params });
      const slotKey =
        input.toolName === "x_search"
          ? `${stage}:grok:${requestDigest}`
          : `${stage}:direct:${requestDigest}`;
      const existing = current.stages[slotKey];
      if (existing) {
        return {
          result:
            existing.requestDigest === requestDigest
              ? { allowed: false, code: "admission_idempotent_receipt", receipt: existing.receipt }
              : { allowed: false, code: "admission_changed_request" },
        };
      }
      if (
        input.toolName === "x_search" &&
        stageSlots(current, stage).some((slot) => slot.toolName === "x_search")
      ) {
        return { result: { allowed: false, code: "admission_changed_request" } as AdmissionResult };
      }

      const stageCeiling = current.stageCeilings[stage];
      const now = this.now();
      const stageStartedAt = earliestReservedAt(stageSlots(current, stage));
      const rowStartedAt = earliestReservedAt(Object.values(current.stages));
      if (
        (stageCeiling &&
          stageStartedAt !== undefined &&
          now - stageStartedAt > stageCeiling.acquisitionSeconds * 1_000) ||
        (rowStartedAt !== undefined &&
          now - rowStartedAt > current.ceiling.acquisitionSeconds * 1_000)
      ) {
        return {
          result: { allowed: false, code: "admission_acquisition_deadline_exceeded" },
        };
      }
      const firstStageReservation = stageSlots(current, stage).length === 0;
      const grok: GrokResources =
        input.toolName === "x_search"
          ? { calls: 1, dollars: stageCeiling?.grokDollars ?? 0 }
          : { calls: 0, dollars: 0 };
      const direct =
        input.toolName === "x_search"
          ? { ...EMPTY_DIRECT }
          : directEstimate(input.toolName, input.params, this.priceAuthority);
      if (!direct || (input.toolName === "x_search" && grok.dollars <= 0)) {
        return { result: { allowed: false, code: "admission_request_invalid" } as AdmissionResult };
      }
      const reservationDirect = {
        ...direct,
        acquisitionSeconds: stageCeiling
          ? firstStageReservation
            ? stageCeiling.acquisitionSeconds
            : 0
          : Object.keys(current.stages).length === 0
            ? current.ceiling.acquisitionSeconds
            : 0,
      };
      const nextDirect = addDirect(current.direct, reservationDirect);
      const nextGrok = {
        calls: current.grok.calls + grok.calls,
        dollars: money(current.grok.dollars + grok.dollars),
      };
      if (
        exceedsDirect(nextDirect, current.ceiling) ||
        nextGrok.calls > current.ceiling.grokCalls ||
        nextGrok.dollars > current.ceiling.grokDollars + 1e-9
      ) {
        return {
          result: { allowed: false, code: "admission_ceiling_exceeded" } as AdmissionResult,
        };
      }
      if (stageCeiling) {
        const nextStageDirect = addDirect(aggregateStageDirect(current, stage), reservationDirect);
        const stageGrok = stageSlots(current, stage).reduce(
          (total, slot) => total + slot.reservation.grok.dollars,
          grok.dollars,
        );
        if (
          exceedsDirect(nextStageDirect, stageCeiling) ||
          stageGrok > stageCeiling.grokDollars + 1e-9
        ) {
          return {
            result: { allowed: false, code: "admission_stage_ceiling_exceeded" } as AdmissionResult,
          };
        }
      }
      const slot: StageSlot = {
        stage,
        requestDigest,
        toolCallId,
        toolName: input.toolName,
        state: "reserved",
        reservedAt: now,
        reservation: { direct: reservationDirect, grok },
      };
      const row: XResearchAdmissionRow = {
        ...current,
        ...(current.rowKind === "product" && subjectKey && !current.subjectKey
          ? { subjectKey }
          : {}),
        grok: nextGrok,
        direct: nextDirect,
        stages: { ...current.stages, [slotKey]: slot },
      };
      return { next: row, result: { allowed: true, row } };
    });
  }

  async settle(input: {
    toolName: string;
    params: Record<string, unknown>;
    runId?: string;
    toolCallId?: string;
    result?: unknown;
    error?: string;
  }): Promise<{ rejected?: string }> {
    const runId = asString(input.runId);
    const toolCallId = asString(input.toolCallId);
    const stage = input.params.research_stage;
    if (!runId || !toolCallId || !isStage(stage)) {
      return { rejected: "admission_request_invalid" };
    }
    return await this.update<{ rejected?: string }>(rowKey(runId), (current) => {
      if (!current || current.kind !== "row") {
        return { result: { rejected: "admission_state_missing_or_invalid" } };
      }
      if (current.state !== "active") {
        return { result: { rejected: "admission_row_terminal" } };
      }
      const now = this.now();
      if (current.closeoutDueAt !== undefined && now >= current.closeoutDueAt) {
        return { result: { rejected: "admission_closeout_deadline_elapsed" } };
      }
      const slotEntry = Object.entries(current.stages).find(
        ([, slot]) =>
          slot.stage === stage &&
          slot.toolName === input.toolName &&
          slot.toolCallId === toolCallId,
      );
      if (!slotEntry || slotEntry[1].state !== "reserved") {
        return { result: { rejected: "admission_settlement_mismatch" } };
      }
      const [key, slot] = slotEntry;
      const receipt = receiptProjection(input.result, input.error);
      const status = receipt.status;
      const stageCeiling = current.stageCeilings[stage];
      const stageStartedAt = earliestReservedAt(stageSlots(current, stage));
      const rowStartedAt = earliestReservedAt(Object.values(current.stages));
      const deadlineOverrun =
        (stageCeiling !== undefined &&
          stageStartedAt !== undefined &&
          now - stageStartedAt > stageCeiling.acquisitionSeconds * 1_000) ||
        (rowStartedAt !== undefined &&
          now - rowStartedAt > current.ceiling.acquisitionSeconds * 1_000);
      const state: StageState =
        status === "timeout" || status === "timed_out"
          ? "timed_out"
          : status === "cancelled"
            ? "cancelled"
            : input.error ||
                status === "failed" ||
                status === "error" ||
                status === "partial" ||
                deadlineOverrun
              ? "error"
              : "complete";
      return {
        next: {
          ...current,
          ...(observedOverrun(receipt, slot) || deadlineOverrun ? { resourceOverrun: true } : {}),
          stages: {
            ...current.stages,
            [key]: { ...slot, state, settledAt: now, receipt },
          },
        },
        result: {},
      };
    });
  }

  async terminal(input: {
    runId?: string;
    sessionKey?: string;
    sessionId?: string;
    outcome?: string;
  }): Promise<void> {
    const runId = asString(input.runId);
    const sessionKey = asString(input.sessionKey);
    const sessionId = asString(input.sessionId);
    if (!runId || !sessionKey) {
      return;
    }
    const due = await this.update(rowKey(runId), (current) => {
      if (
        !current ||
        current.kind !== "row" ||
        current.state !== "active" ||
        current.sessionKey !== sessionKey ||
        !current.sessionId ||
        (sessionId !== undefined && current.sessionId !== sessionId)
      ) {
        return { result: undefined as number | undefined };
      }
      const anchor = current.terminalAnchorAt ?? this.now();
      const closeoutDueAt = current.closeoutDueAt ?? anchor + 5_000;
      return {
        next: {
          ...current,
          terminalAnchorAt: anchor,
          closeoutDueAt,
          terminalOutcome: current.terminalOutcome ?? asString(input.outcome) ?? "unknown",
        },
        result: closeoutDueAt,
      };
    });
    if (due !== undefined) {
      this.scheduleCloseout(runId, due);
    }
  }

  async closeout(runId: string): Promise<void> {
    const prepared = await this.update(rowKey(runId), (current) => {
      if (
        !current ||
        current.kind !== "row" ||
        current.state === "terminal" ||
        !current.closeoutDueAt ||
        current.closeoutDueAt > this.now()
      ) {
        return { result: undefined as XResearchAdmissionRow | undefined };
      }
      if (current.state === "closing") {
        return { next: current, result: current };
      }
      const stages = Object.fromEntries(
        Object.entries(current.stages).map(([stage, slot]) => [
          stage,
          slot.state === "reserved"
            ? { ...slot, state: "consumed_unknown" as const, settledAt: this.now() }
            : slot,
        ]),
      ) as XResearchAdmissionRow["stages"];
      const closing: XResearchAdmissionRow = {
        ...current,
        state: "closing",
        stages,
      };
      const preparedRow = { ...closing, terminalDigest: terminalDigestFor(closing) };
      return { next: preparedRow, result: preparedRow };
    });
    if (prepared) {
      const startedAt = this.now();
      const reread = await this.store.lookup(rowKey(runId));
      const elapsedMs = this.now() - startedAt;
      if (
        elapsedMs > 1_000 ||
        !reread ||
        reread.kind !== "row" ||
        reread.state !== "closing" ||
        reread.terminalDigest !== prepared.terminalDigest ||
        terminalDigestFor(reread) !== prepared.terminalDigest
      ) {
        throw new Error("admission_closeout_reread_mismatch");
      }
      const finalized = await this.update(rowKey(runId), (current) => {
        if (
          !current ||
          current.kind !== "row" ||
          current.state !== "closing" ||
          current.terminalDigest !== prepared.terminalDigest ||
          terminalDigestFor(current) !== prepared.terminalDigest
        ) {
          return { result: false };
        }
        return { next: { ...current, state: "terminal" as const }, result: true };
      });
      if (!finalized) {
        throw new Error("admission_closeout_finalize_mismatch");
      }
    }
  }

  async provision(input: {
    manifestDigest: string;
    notBefore: number;
    expiresAt: number;
    runtimeVersion: string;
    priceAuthority: XResearchPriceAuthority;
    sourceRef: string;
    configDigest: string;
    writer: string;
    approver: string;
    retentionUntil: number;
    rows: ProofRowInput[];
  }): Promise<{ ok: boolean; code?: string }> {
    const now = this.now();
    if (
      !input.manifestDigest ||
      input.rows.length === 0 ||
      input.rows.length > 24 ||
      input.notBefore > now ||
      input.expiresAt !== input.notBefore + DAY_MS ||
      input.expiresAt <= now ||
      input.retentionUntil !== input.expiresAt + 30 * DAY_MS ||
      !input.runtimeVersion ||
      !input.sourceRef ||
      !input.configDigest ||
      !input.writer ||
      !input.approver
    ) {
      return { ok: false, code: "admission_provision_invalid" };
    }
    if (
      !validPriceAuthority(input.priceAuthority, input.notBefore, input.expiresAt) ||
      !validPriceAuthority(this.priceAuthority, input.notBefore, input.expiresAt) ||
      digest(input.priceAuthority) !== digest(this.priceAuthority)
    ) {
      return { ok: false, code: "admission_price_authority_missing_or_stale" };
    }
    const priceAuthorityDigest = digest(input.priceAuthority);
    const runs = new Set(input.rows.map((row) => row.runId));
    const sessions = new Set(input.rows.map((row) => row.sessionKey));
    const caseArms = new Set(input.rows.map((row) => `${row.caseId}\0${row.arm}`));
    const authorities = input.rows.map((row) =>
      profileAuthority(row.profile, row.arm, input.priceAuthority),
    );
    if (
      runs.size !== input.rows.length ||
      sessions.size !== input.rows.length ||
      caseArms.size !== input.rows.length ||
      !hasExactProofShape(input.rows) ||
      authorities.some((authority) => !authority) ||
      input.rows.some(
        (row) =>
          !row.runId ||
          !row.sessionKey ||
          !row.promptDigest ||
          !row.agentId ||
          !row.modelProviderId ||
          !row.modelId ||
          !row.workspaceDir ||
          !row.caseId,
      )
    ) {
      return { ok: false, code: "admission_provision_identity_invalid" };
    }

    const rows = input.rows.map((item, index): XResearchAdmissionRow => {
      const authority = authorities[index]!;
      const unsealed: XResearchAdmissionRow = {
        kind: "row",
        rowKind: "probe_benchmark",
        state: "held",
        runId: item.runId,
        sessionKey: item.sessionKey,
        agentId: item.agentId,
        modelProviderId: item.modelProviderId,
        modelId: item.modelId,
        workspaceDir: item.workspaceDir,
        promptDigest: item.promptDigest,
        profile: item.profile,
        arm: item.arm,
        priceAuthorityDigest,
        ...authority,
        manifestDigest: input.manifestDigest,
        caseId: item.caseId,
        requestIdentityDigest: digest({
          manifestDigest: input.manifestDigest,
          runId: item.runId,
          sessionKeyDigest: digestBytes(item.sessionKey),
          agentId: item.agentId,
          modelProviderId: item.modelProviderId,
          modelId: item.modelId,
          workspaceDir: item.workspaceDir,
          promptDigest: item.promptDigest,
          profile: item.profile,
          arm: item.arm,
          caseId: item.caseId,
        }),
        expiresAt: input.expiresAt,
        retentionUntil: input.retentionUntil,
        createdAt: input.notBefore,
        direct: { ...EMPTY_DIRECT },
        grok: { calls: 0, dollars: 0 },
        stages: {},
      };
      return { ...unsealed, rowDigest: digest(unsealed) };
    });
    const rowDigests = Object.fromEntries(rows.map((row) => [row.runId, row.rowDigest!])) as Record<
      string,
      string
    >;
    const root: Root = {
      kind: "root",
      manifestDigest: input.manifestDigest,
      commitState: "held",
      rows: rows.length,
      rowDigests,
      expiresAt: input.expiresAt,
      notBefore: input.notBefore,
      runtimeVersion: input.runtimeVersion,
      priceAuthorityDigest,
      sourceRef: input.sourceRef,
      configDigest: input.configDigest,
      writer: input.writer,
      approver: input.approver,
      retentionUntil: input.retentionUntil,
    };
    const absent = await this.store.registerIfAbsent(rootKey(input.manifestDigest), root, {
      ttlMs: Math.max(1, input.retentionUntil - now),
    });
    if (!absent) {
      const existing = await this.store.lookup(rootKey(input.manifestDigest));
      if (
        !existing ||
        existing.kind !== "root" ||
        canonical({ ...existing, commitState: "held" }) !== canonical(root)
      ) {
        return { ok: false, code: "admission_provision_changed" };
      }
    }
    for (const row of rows) {
      const inserted = await this.store.registerIfAbsent(rowKey(row.runId), row, {
        ttlMs: Math.max(1, input.retentionUntil - now),
      });
      if (!inserted) {
        const existing = await this.store.lookup(rowKey(row.runId));
        if (!existing || existing.kind !== "row" || canonical(existing) !== canonical(row)) {
          return { ok: false, code: "admission_row_conflict" };
        }
      }
    }
    const entries = await this.store.entries();
    const manifestRows = entries
      .map((entry) => entry.value)
      .filter(
        (value): value is XResearchAdmissionRow =>
          value.kind === "row" && value.manifestDigest === input.manifestDigest,
      );
    const rereadRoot = await this.store.lookup(rootKey(input.manifestDigest));
    if (
      !rereadRoot ||
      rereadRoot.kind !== "root" ||
      canonical({ ...rereadRoot, commitState: "held" }) !== canonical(root) ||
      manifestRows.length !== rows.length ||
      rows.some((row) => {
        const read = manifestRows.find((candidate) => candidate.runId === row.runId);
        return (
          !read || canonical(read) !== canonical(row) || read.rowDigest !== rowDigests[row.runId]
        );
      })
    ) {
      return { ok: false, code: "admission_provision_reread_failed" };
    }
    const flipped = await this.update(rootKey(input.manifestDigest), (current) => {
      if (!current || current.kind !== "root") {
        return { result: false };
      }
      if (current.commitState === "ready") {
        return { next: current, result: true };
      }
      if (canonical(current) !== canonical(root)) {
        return { result: false };
      }
      return { next: { ...current, commitState: "ready" }, result: true };
    });
    return flipped ? { ok: true } : { ok: false, code: "admission_root_flip_failed" };
  }

  async provisionSerialized(
    manifestJson: string,
    manifestDigest: string,
  ): Promise<{ ok: boolean; code?: string }> {
    const expected = manifestDigest.startsWith("sha256:")
      ? manifestDigest.slice("sha256:".length)
      : manifestDigest;
    if (!manifestJson || digestBytes(manifestJson) !== expected) {
      return { ok: false, code: "admission_manifest_digest_mismatch" };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(manifestJson);
    } catch {
      return { ok: false, code: "admission_provision_invalid" };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, code: "admission_provision_invalid" };
    }
    const manifest = parsed as Omit<
      Parameters<XResearchAdmission["provision"]>[0],
      "manifestDigest"
    >;
    return await this.provision({ ...manifest, manifestDigest });
  }

  async read(manifestDigest: string) {
    const root = await this.store.lookup(rootKey(manifestDigest));
    if (!root || root.kind !== "root") {
      return undefined;
    }
    const entries = await this.store.entries();
    const rows = entries
      .map((entry) => entry.value)
      .filter(
        (value): value is XResearchAdmissionRow =>
          value.kind === "row" && value.manifestDigest === manifestDigest,
      )
      .toSorted((left, right) => left.runId.localeCompare(right.runId));
    return { root, rows };
  }

  async launch(input: {
    manifestDigest: string;
    runId: string;
    run: (params: {
      sessionKey: string;
      message: string;
      provider: string;
      model: string;
      idempotencyKey: string;
    }) => Promise<{ runId: string; sessionKey?: string; taskId?: string }>;
    message: string;
  }): Promise<{ ok: boolean; code?: string }> {
    const root = await this.store.lookup(rootKey(input.manifestDigest));
    const row = await this.store.lookup(rowKey(input.runId));
    if (
      !root ||
      root.kind !== "root" ||
      root.commitState !== "ready" ||
      root.expiresAt <= this.now() ||
      !row ||
      row.kind !== "row" ||
      row.rowKind !== "probe_benchmark" ||
      (row.state !== "held" && row.state !== "active") ||
      row.manifestDigest !== input.manifestDigest ||
      row.promptDigest !== digest(input.message) ||
      root.rowDigests[row.runId] !== row.rowDigest
    ) {
      return { ok: false, code: "admission_launch_not_ready" };
    }
    if (row.launchedAt) {
      return { ok: true };
    }
    const result = await input.run({
      sessionKey: row.sessionKey,
      message: input.message,
      provider: row.modelProviderId,
      model: row.modelId,
      idempotencyKey: row.runId,
    });
    if (result.runId !== row.runId || result.sessionKey !== row.sessionKey) {
      return { ok: false, code: "admission_launch_identity_mismatch" };
    }
    return await this.update<{ ok: boolean; code?: string }>(rowKey(row.runId), (current) => {
      if (current?.kind === "row" && current.state === "terminal") {
        return { result: { ok: false, code: "admission_row_terminal" } };
      }
      if (
        !current ||
        current.kind !== "row" ||
        current.rowKind !== "probe_benchmark" ||
        (current.state !== "held" && current.state !== "active") ||
        current.manifestDigest !== input.manifestDigest ||
        current.rowDigest !== row.rowDigest ||
        current.sessionKey !== row.sessionKey ||
        current.promptDigest !== row.promptDigest ||
        current.modelProviderId !== row.modelProviderId ||
        current.modelId !== row.modelId
      ) {
        return { result: { ok: false, code: "admission_launch_state_changed" } };
      }
      return {
        next: {
          ...current,
          launchedAt: this.now(),
          ...(result.taskId ? { taskId: result.taskId } : {}),
        },
        result: { ok: true },
      };
    });
  }

  async recover(): Promise<void> {
    const entries = await this.store.entries();
    const rows = entries
      .map((entry) => entry.value)
      .filter(
        (value): value is XResearchAdmissionRow =>
          value.kind === "row" && (value.state === "active" || value.state === "closing"),
      );
    for (const value of rows) {
      if (value.state === "closing") {
        await this.closeout(value.runId);
        continue;
      }
      if (value.terminalAnchorAt !== undefined && value.closeoutDueAt !== undefined) {
        this.scheduleCloseout(value.runId, value.closeoutDueAt);
        continue;
      }
      if (!this.waitForRun) {
        continue;
      }
      try {
        const status = await this.waitForRun({ runId: value.runId, timeoutMs: 0 });
        if (status.status !== "timeout") {
          await this.terminal({
            runId: value.runId,
            sessionKey: value.sessionKey,
            sessionId: value.sessionId,
            outcome: status.status,
          });
        }
      } catch (error) {
        this.onCloseoutError(error);
      }
    }
  }
}
