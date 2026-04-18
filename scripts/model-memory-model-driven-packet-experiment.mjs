import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const DEFAULT_MODEL_REF =
  process.env.MODEL_MEMORY_PACKET_MODEL?.trim() || "openrouter/openai/gpt-5.4-nano";
const DEFAULT_EXPERIMENT_VARIANT = process.env.MODEL_MEMORY_PACKET_VARIANT?.trim() || "baseline";
const DEFAULT_BASKET_POLICY = process.env.MODEL_MEMORY_PACKET_BASKET_POLICY?.trim() || "baseline";
const DEFAULT_PACKET_TARGET_TOKENS =
  Number.parseInt(process.env.MODEL_MEMORY_PACKET_TARGET_TOKENS?.trim() ?? "", 10) || 1000;
const DEFAULT_SOURCE_TARGET_TOKENS =
  Number.parseInt(process.env.MODEL_MEMORY_PACKET_SOURCE_TOKENS?.trim() ?? "", 10) || 2600;
const DEFAULT_MIN_BASKET_ITEMS =
  Number.parseInt(process.env.MODEL_MEMORY_PACKET_MIN_ITEMS?.trim() ?? "", 10) || 24;
const DEFAULT_REQUEST_TIMEOUT_MS =
  Number.parseInt(process.env.MODEL_MEMORY_REQUEST_TIMEOUT_MS?.trim() ?? "", 10) || 180_000;
const DEFAULT_KIND_MINIMA = {
  rule: Number.parseInt(process.env.MODEL_MEMORY_PACKET_MIN_RULES?.trim() ?? "", 10) || 5,
  fact: Number.parseInt(process.env.MODEL_MEMORY_PACKET_MIN_FACTS?.trim() ?? "", 10) || 5,
  procedure: Number.parseInt(process.env.MODEL_MEMORY_PACKET_MIN_PROCEDURES?.trim() ?? "", 10) || 4,
  preference:
    Number.parseInt(process.env.MODEL_MEMORY_PACKET_MIN_PREFERENCES?.trim() ?? "", 10) || 4,
};
const DEFAULT_KIND_MAXIMA = {
  rule: Number.parseInt(process.env.MODEL_MEMORY_PACKET_MAX_RULES?.trim() ?? "", 10) || 6,
  fact: Number.parseInt(process.env.MODEL_MEMORY_PACKET_MAX_FACTS?.trim() ?? "", 10) || 12,
  procedure: Number.parseInt(process.env.MODEL_MEMORY_PACKET_MAX_PROCEDURES?.trim() ?? "", 10) || 4,
  preference:
    Number.parseInt(process.env.MODEL_MEMORY_PACKET_MAX_PREFERENCES?.trim() ?? "", 10) || 4,
};

function isKindQuotaVariant(variant) {
  return variant === "kind-quotas-v1" || variant.startsWith("kind-quotas-v1-");
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil((text || "").length / 4));
}

function readTrimmedString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

async function loadConfig() {
  const raw = await readFile("/root/.openclaw/openclaw.json", "utf8");
  return JSON.parse(raw);
}

function resolveDatabaseUrl(config) {
  const configUrl = config?.plugins?.entries?.["model-memory"]?.config?.database?.url;
  const url =
    readTrimmedString(process.env.MODEL_MEMORY_DATABASE_URL) ?? readTrimmedString(configUrl);
  if (!url) {
    throw new Error("model-memory database url not configured");
  }
  return url;
}

function resolveModel(modelRef) {
  const [provider, ...rest] = modelRef.split("/");
  if (!provider || rest.length === 0) {
    throw new Error(`invalid model ref: ${modelRef}`);
  }
  return {
    provider,
    model: rest.join("/"),
  };
}

function resolveProviderSettings(config, provider) {
  if (provider === "openrouter") {
    return {
      baseUrl:
        readTrimmedString(config?.models?.providers?.openrouter?.baseUrl) ||
        "https://openrouter.ai/api/v1",
      apiKey: readTrimmedString(process.env.OPENROUTER_API_KEY),
      headers: {
        "HTTP-Referer": "https://openclaw.ai",
        "X-Title": "OpenClaw Model Memory Packet Experiment",
      },
    };
  }
  if (provider === "openai") {
    return {
      baseUrl:
        readTrimmedString(config?.models?.providers?.openai?.baseUrl) ||
        "https://api.openai.com/v1",
      apiKey: readTrimmedString(process.env.OPENAI_API_KEY),
      headers: {},
    };
  }
  throw new Error(`unsupported provider for experiment: ${provider}`);
}

function summarizePayload(entry) {
  const payload = entry.payload || {};
  if (entry.kind === "fact") {
    return `${payload.subject ?? "fact"}: ${payload.value ?? ""}`.trim();
  }
  if (entry.kind === "rule") {
    const parts = [payload.subject ?? "rule"];
    if (payload.recommendedAction) {
      parts.push(`do: ${payload.recommendedAction}`);
    }
    if (payload.avoidAction) {
      parts.push(`avoid: ${payload.avoidAction}`);
    }
    if (payload.neededCapability) {
      parts.push(`needs: ${payload.neededCapability}`);
    }
    return parts.join(" | ");
  }
  if (entry.kind === "procedure") {
    const steps = Array.isArray(payload.steps) ? payload.steps.join(" -> ") : "";
    return `${payload.title ?? "procedure"}: ${steps}`.trim();
  }
  if (entry.kind === "reference") {
    return `${payload.task ?? "reference"} -> ${payload.primaryResource ?? ""}`.trim();
  }
  return `${payload.subject ?? "preference"}: ${payload.instruction ?? ""}`.trim();
}

function memorySortKey(entry) {
  const kindRank =
    {
      rule: 5,
      preference: 4,
      fact: 3,
      procedure: 2,
      reference: 1,
    }[entry.kind] ?? 0;
  const classRank =
    {
      user: 3,
      feedback: 2,
      project: 1,
    }[entry.canonicalClass] ?? 0;
  const recencyRank = Date.parse(entry.createdAt || "1970-01-01T00:00:00.000Z") || 0;
  return [kindRank, classRank, recencyRank];
}

function compareEntries(left, right) {
  const leftKey = memorySortKey(left);
  const rightKey = memorySortKey(right);
  for (let index = 0; index < leftKey.length; index += 1) {
    if (leftKey[index] !== rightKey[index]) {
      return rightKey[index] - leftKey[index];
    }
  }
  return `${left.normalizedSubject ?? left.normalizedTitle ?? left.id}`.localeCompare(
    `${right.normalizedSubject ?? right.normalizedTitle ?? right.id}`,
  );
}

function renderBasketEntry(entry) {
  return {
    id: entry.id,
    sourceType: entry.sourceType,
    sourceKey: entry.sourceKey,
    canonicalClass: entry.canonicalClass,
    kind: entry.kind,
    scopeKey: entry.scopeKey,
    confidence: entry.confidence,
    durability: entry.durability,
    createdAt: entry.createdAt,
    summary: summarizePayload(entry),
    payload: entry.payload,
  };
}

function selectByKindQuota(sorted, minima) {
  const selected = [];
  const selectedIds = new Set();
  for (const [kind, minimum] of Object.entries(minima)) {
    if (minimum <= 0) {
      continue;
    }
    const matches = sorted
      .filter((entry) => entry.kind === kind && !selectedIds.has(entry.id))
      .slice(0, minimum)
      .map(renderBasketEntry);
    for (const match of matches) {
      selected.push(match);
      selectedIds.add(match.id);
    }
  }
  return { selected, selectedIds };
}

function countSelectedByKind(selected) {
  return countBy(selected.map((entry) => entry.kind));
}

function buildBaselineBasket(sorted) {
  const selected = [];
  let runningTokens = 0;
  for (const record of sorted) {
    const rendered = renderBasketEntry(record);
    const renderedText = JSON.stringify(rendered);
    selected.push(rendered);
    runningTokens += estimateTokens(renderedText);
    if (
      selected.length >= DEFAULT_MIN_BASKET_ITEMS &&
      runningTokens >= DEFAULT_SOURCE_TARGET_TOKENS
    ) {
      break;
    }
  }

  const kinds = new Set(selected.map((entry) => entry.kind));
  if (!kinds.has("procedure")) {
    const procedures = sorted
      .filter(
        (entry) => entry.kind === "procedure" && !selected.some((picked) => picked.id === entry.id),
      )
      .slice(0, 4)
      .map(renderBasketEntry);
    for (const procedure of procedures) {
      selected.push(procedure);
    }
  }
  return selected;
}

function buildKindQuotaBasket(sorted) {
  const { selected, selectedIds } = selectByKindQuota(sorted, DEFAULT_KIND_MINIMA);
  let runningTokens = selected.reduce(
    (sum, entry) => sum + estimateTokens(JSON.stringify(entry)),
    0,
  );

  const kindCounts = countSelectedByKind(selected);
  const availableCounts = countBy(sorted.map((entry) => entry.kind));
  const primaryFillPass = sorted.filter((record) => !selectedIds.has(record.id));
  for (const record of primaryFillPass) {
    const currentKindCount = kindCounts[record.kind] ?? 0;
    const kindMaximum = DEFAULT_KIND_MAXIMA[record.kind] ?? Number.POSITIVE_INFINITY;
    if (currentKindCount >= kindMaximum) {
      continue;
    }
    const rendered = renderBasketEntry(record);
    selected.push(rendered);
    selectedIds.add(record.id);
    kindCounts[record.kind] = currentKindCount + 1;
    runningTokens += estimateTokens(JSON.stringify(rendered));
    if (
      selected.length >= DEFAULT_MIN_BASKET_ITEMS &&
      runningTokens >= DEFAULT_SOURCE_TARGET_TOKENS
    ) {
      break;
    }
  }

  if (
    selected.length >= DEFAULT_MIN_BASKET_ITEMS &&
    runningTokens >= DEFAULT_SOURCE_TARGET_TOKENS
  ) {
    return selected;
  }

  const overflowOrder = ["fact", "procedure"];
  for (const kind of overflowOrder) {
    if ((availableCounts[kind] ?? 0) <= (kindCounts[kind] ?? 0)) {
      continue;
    }
    for (const record of sorted) {
      if (record.kind !== kind || selectedIds.has(record.id)) {
        continue;
      }
      const rendered = renderBasketEntry(record);
      selected.push(rendered);
      selectedIds.add(record.id);
      kindCounts[record.kind] = (kindCounts[record.kind] ?? 0) + 1;
      runningTokens += estimateTokens(JSON.stringify(rendered));
      if (
        selected.length >= DEFAULT_MIN_BASKET_ITEMS &&
        runningTokens >= DEFAULT_SOURCE_TARGET_TOKENS
      ) {
        return selected;
      }
    }
  }
  return selected;
}

function buildCandidateBasket(records, policy) {
  const sorted = [...records].toSorted(compareEntries);
  let selected;
  if (policy === "kind-quotas") {
    selected = buildKindQuotaBasket(sorted);
  } else {
    selected = buildBaselineBasket(sorted);
  }

  return {
    basketPolicy: policy,
    selected,
    sourceTokenEstimate: selected.reduce(
      (sum, entry) => sum + estimateTokens(JSON.stringify(entry)),
      0,
    ),
    countsByKind: countBy(selected.map((entry) => entry.kind)),
    countsByClass: countBy(selected.map((entry) => entry.canonicalClass)),
  };
}

function countBy(values) {
  const counts = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function buildPrompts({ basket, targetTokens, modelRef, variant }) {
  const useKindQuotaPrompt = isKindQuotaVariant(variant);
  const contract = {
    contractName: "model_memory_packet_compiler",
    contractVersion: useKindQuotaPrompt
      ? "v0-kind-quotas-experiment-2026-04-17"
      : "v0-experiment-2026-04-17",
    modelId: modelRef,
  };
  const systemPrompt = useKindQuotaPrompt
    ? [
        "You are compiling a bootstrap MEMORY.md packet for OpenClaw.",
        "The packet must help a fresh session quickly understand who the user is, what is live right now, what constraints matter, and how to act safely.",
        "Preference overload is a failure. The packet must not collapse into only style or heartbeat preferences.",
        "Use only the provided memories.",
        "Preserve the most operationally useful rules, facts, current priorities, and procedures.",
        "Merge overlaps. Drop stale, niche, repetitive, or low-leverage items.",
        "Prefer memories that orient action at startup over memories that are merely true in the abstract.",
        "Return strict JSON only. No markdown code fence.",
      ].join("\n")
    : [
        "You are compiling a bootstrap memory packet for OpenClaw.",
        "The input basket intentionally exceeds the target budget.",
        "Your job is to compress it into a high-signal MEMORY.md packet for bootstrap use.",
        "Use only the provided memories.",
        "Preserve operator-critical rules, stable preferences, live priorities, and active procedures.",
        "Merge overlaps. Drop stale, niche, repetitive, or low-leverage items.",
        "Prefer recency and operational usefulness over historical completeness.",
        "Return strict JSON only. No markdown code fence.",
      ].join("\n");
  const sharedUserPrompt = [
    "Target output:",
    `- preferred size: 850-1100 tokens`,
    `- hard ceiling: 1200 tokens`,
    `- expected target: about ${targetTokens} tokens`,
    "",
    "Required markdown structure:",
    "- # MEMORY.md",
    "- ## Standing Context",
    "- ## Current Priorities",
    "- ## Active Procedures",
    "",
    "Return JSON with this shape:",
    "{",
    '  "packetMarkdown": "string",',
    '  "estimatedOutputTokens": 0,',
    '  "sections": [{"title": "string", "includedMemoryIds": ["id"]}],',
    '  "droppedMemoryIds": ["id"],',
    '  "qualityNotes": ["string"]',
    "}",
    "",
    "Rules:",
    "- packetMarkdown must be usable directly as a generated MEMORY.md block",
    "- do not invent facts, rules, or procedures",
    "- do not mention ids in packetMarkdown",
    "- if multiple memories overlap, synthesize them into one concise bullet",
    "- if conflicts appear, prefer the more recent operationally actionable memory and mention uncertainty only if it matters",
  ];
  const userPrompt = useKindQuotaPrompt
    ? [
        ...sharedUserPrompt,
        "- the final packet must visibly cover multiple kinds, not just preferences",
        "- include at least one actionable procedure if the basket contains one",
        "- include enough facts/rules to orient startup behavior, current work, and operational safety",
        "- prefer live project state and active operating constraints over historical implementation detail",
        "- hard section caps:",
        "  - Standing Context: at most 8 bullets",
        "  - Current Priorities: at most 5 bullets",
        "  - Active Procedures: at most 4 top-level procedures or procedure bullets total",
        "- if you cannot fit everything, drop lower-leverage items and record them in droppedMemoryIds",
        "",
        "BASKET:",
        JSON.stringify(basket, null, 2),
      ].join("\n")
    : [...sharedUserPrompt, "", "BASKET:", JSON.stringify(basket, null, 2)].join("\n");
  return { contract, systemPrompt, userPrompt };
}

async function fetchModelJson({ modelRef, systemPrompt, userPrompt, config }) {
  const { provider, model } = resolveModel(modelRef);
  const providerSettings = resolveProviderSettings(config, provider);
  if (!providerSettings.apiKey) {
    throw new Error(`missing API key for provider ${provider}`);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${providerSettings.baseUrl.replace(/\/+$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${providerSettings.apiKey}`,
          ...providerSettings.headers,
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
        signal: controller.signal,
      },
    );
    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(`model request failed (${response.status}): ${rawText}`);
    }
    const json = JSON.parse(rawText);
    const outputText = json?.choices?.[0]?.message?.content;
    if (typeof outputText !== "string" || outputText.trim().length === 0) {
      throw new Error("model response missing text content");
    }
    const candidate = extractStructuredJsonCandidate(outputText);
    return {
      rawResponse: json,
      parsed: JSON.parse(candidate),
      outputText,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractStructuredJsonCandidate(text) {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }
  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd > objectStart) {
    return text.slice(objectStart, objectEnd + 1).trim();
  }
  return text.trim();
}

function renderBasketMarkdown(report) {
  return [
    "# Model Driven `memory-md` Experiment Basket",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Model target: ${report.modelRef}`,
    `- Packet target tokens: ${report.packetTargetTokens}`,
    `- Basket token estimate: ${report.basket.sourceTokenEstimate}`,
    `- Basket size: ${report.basket.selected.length}`,
    "",
    "## Counts",
    "",
    `- By class: ${JSON.stringify(report.basket.countsByClass)}`,
    `- By kind: ${JSON.stringify(report.basket.countsByKind)}`,
    "",
    "## Entries",
    "",
    ...report.basket.selected.flatMap((entry, index) => [
      `### ${index + 1}. ${entry.id}`,
      `- class: ${entry.canonicalClass}`,
      `- kind: ${entry.kind}`,
      `- source: ${entry.sourceType}:${entry.sourceKey}`,
      `- scope: ${entry.scopeKey ?? "global"}`,
      `- createdAt: ${entry.createdAt}`,
      `- summary: ${entry.summary}`,
      "",
      "```json",
      JSON.stringify(entry.payload, null, 2),
      "```",
      "",
    ]),
  ].join("\n");
}

function renderFrontierReviewPrompt(report, nanoPacketMarkdown) {
  return [
    "# Frontier Review Prompt",
    "",
    "Paste the following prompt into a stronger frontier model along with the two generated artifacts:",
    "",
    `- basket: docs/projects/model-memory/evidence/${report.artifactPrefix}-basket.md`,
    `- nano packet: docs/projects/model-memory/evidence/${report.artifactPrefix}-nano-packet.md`,
    "",
    "Prompt:",
    "",
    "```text",
    "You are reviewing a model-generated bootstrap memory packet for OpenClaw.",
    "Evaluate whether the packet is good enough to justify replacing the current deterministic packet compiler for this packet class.",
    "",
    "Review rubric:",
    "1. Fidelity: does the packet stay faithful to the source basket without invention?",
    "2. Selection quality: does it preserve the highest-value standing context?",
    "3. Compression quality: does it remove redundancy while keeping operationally critical details?",
    "4. Bootstrap usability: would this be clearly more useful than a long raw projection during bootstrap?",
    "5. Failure modes: identify missing critical items, stale items that should have been dropped, contradictions, or overcompression.",
    "",
    "Return:",
    "- verdict: adopt / revise-and-retest / reject",
    "- qualitative score out of 10",
    "- strongest points",
    "- most serious defects",
    "- exact revisions you would require before rollout",
    "```",
    "",
    "Current nano output preview:",
    "",
    "```md",
    nanoPacketMarkdown.trim(),
    "```",
    "",
  ].join("\n");
}

async function queryCandidates(client) {
  const result = await client.query(
    `
    WITH slot_candidates AS (
      SELECT
        mo.id,
        'slot' AS source_type,
        ams.slot_key AS source_key,
        mo.canonical_class,
        mo.kind,
        mo.payload,
        mo.normalized_subject,
        mo.normalized_title,
        mo.scope_key,
        mo.confidence,
        mo.durability,
        mo.created_at
      FROM runtime_context.active_memory_slots ams
      JOIN model_memory.memory_objects mo ON mo.id = ams.current_object_id
      WHERE mo.canonical_class = ANY($1::text[])
        AND mo.kind = ANY($2::text[])
        AND COALESCE(mo.lifecycle_state, 'active') = 'active'
        AND mo.superseded_at IS NULL
    ),
    set_candidates AS (
      SELECT
        mo.id,
        'set' AS source_type,
        ams.set_key AS source_key,
        mo.canonical_class,
        mo.kind,
        mo.payload,
        mo.normalized_subject,
        mo.normalized_title,
        mo.scope_key,
        mo.confidence,
        mo.durability,
        mo.created_at
      FROM runtime_context.active_memory_sets ams
      JOIN model_memory.memory_objects mo ON mo.id = ams.memory_object_id
      WHERE ams.kind = 'procedure'
        AND COALESCE(mo.lifecycle_state, 'active') = 'active'
        AND mo.superseded_at IS NULL
    )
    SELECT * FROM slot_candidates
    UNION ALL
    SELECT * FROM set_candidates
  `,
    [
      ["user", "feedback", "project"],
      ["preference", "fact", "rule", "procedure"],
    ],
  );
  return result.rows.map((row) => ({
    id: row.id,
    sourceType: row.source_type,
    sourceKey: row.source_key,
    canonicalClass: row.canonical_class,
    kind: row.kind,
    payload: row.payload,
    normalizedSubject: row.normalized_subject,
    normalizedTitle: row.normalized_title,
    scopeKey: row.scope_key,
    confidence: row.confidence,
    durability: row.durability,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  }));
}

async function main() {
  const config = await loadConfig();
  const client = new Client({
    connectionString: resolveDatabaseUrl(config),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const candidates = await queryCandidates(client);
    const basket = buildCandidateBasket(candidates, DEFAULT_BASKET_POLICY);
    const prompts = buildPrompts({
      basket: basket.selected,
      targetTokens: DEFAULT_PACKET_TARGET_TOKENS,
      modelRef: DEFAULT_MODEL_REF,
      variant: DEFAULT_EXPERIMENT_VARIANT,
    });
    const result = await fetchModelJson({
      modelRef: DEFAULT_MODEL_REF,
      systemPrompt: prompts.systemPrompt,
      userPrompt: prompts.userPrompt,
      config,
    });
    const packetMarkdown = String(result.parsed?.packetMarkdown ?? "").trim();
    const dateSlug = new Date().toISOString().slice(0, 10);
    const variantSlug = DEFAULT_EXPERIMENT_VARIANT.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const modelSlug = DEFAULT_MODEL_REF.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const report = {
      generatedAt: new Date().toISOString(),
      experimentVariant: DEFAULT_EXPERIMENT_VARIANT,
      promptStyle: isKindQuotaVariant(DEFAULT_EXPERIMENT_VARIANT) ? "kind-quotas-v1" : "baseline",
      modelRef: DEFAULT_MODEL_REF,
      packetTargetTokens: DEFAULT_PACKET_TARGET_TOKENS,
      artifactPrefix: `memory-md-model-driven-experiment-${dateSlug}-${variantSlug}-${modelSlug}`,
      basket,
      prompts,
      modelOutput: {
        estimatedOutputTokens:
          result.parsed?.estimatedOutputTokens ?? estimateTokens(packetMarkdown),
        sections: result.parsed?.sections ?? [],
        droppedMemoryIds: result.parsed?.droppedMemoryIds ?? [],
        qualityNotes: result.parsed?.qualityNotes ?? [],
        packetMarkdown,
      },
    };

    const evidenceDir = path.join(repoRoot(), "docs/projects/model-memory/evidence");
    await mkdir(evidenceDir, { recursive: true });

    const base = path.join(evidenceDir, report.artifactPrefix);
    await writeFile(`${base}-basket.json`, `${JSON.stringify(report.basket, null, 2)}\n`, "utf8");
    await writeFile(`${base}-basket.md`, `${renderBasketMarkdown(report)}\n`, "utf8");
    await writeFile(`${base}-prompts.json`, `${JSON.stringify(report.prompts, null, 2)}\n`, "utf8");
    await writeFile(
      `${base}-output.json`,
      `${JSON.stringify(report.modelOutput, null, 2)}\n`,
      "utf8",
    );
    await writeFile(`${base}-packet.md`, `${report.modelOutput.packetMarkdown}\n`, "utf8");
    await writeFile(
      `${base}-frontier-review-prompt.md`,
      `${renderFrontierReviewPrompt(report, report.modelOutput.packetMarkdown)}\n`,
      "utf8",
    );

    process.stdout.write(
      [
        `${base}-basket.json`,
        `${base}-basket.md`,
        `${base}-prompts.json`,
        `${base}-output.json`,
        `${base}-packet.md`,
        `${base}-frontier-review-prompt.md`,
      ].join("\n") + "\n",
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
