#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const cliEntrypoint = path.join(rootDir, "dist", "index.js");
const configPath = process.env.OPENCLAW_CONFIG_PATH?.trim() || "/root/.openclaw/openclaw.json";
const defaultReadyUrl = process.env.OPENCLAW_READY_URL?.trim() || "http://127.0.0.1:28789/readyz";
const args = new Set(process.argv.slice(2));
const outputJson = args.has("--json");

function runNode(commandArgs) {
  const result = spawnSync(process.execPath, commandArgs, {
    cwd: rootDir,
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(
      [
        `command failed: node ${commandArgs.join(" ")}`,
        result.stderr?.trim() || result.stdout?.trim() || `exit ${result.status ?? "unknown"}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return result.stdout.trim();
}

function parseJsonCommand(commandArgs) {
  const raw = runNode(commandArgs);
  return raw ? JSON.parse(raw) : null;
}

function tryParseJsonCommand(commandArgs) {
  try {
    return {
      ok: true,
      data: parseJsonCommand(commandArgs),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      data: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function loadControlUiConfig() {
  if (!fs.existsSync(configPath)) {
    return {
      configPath,
      exists: false,
      bind: null,
      allowedOrigins: [],
    };
  }
  const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  return {
    configPath,
    exists: true,
    bind: raw.gateway?.bind ?? null,
    allowedOrigins: Array.isArray(raw.gateway?.controlUi?.allowedOrigins)
      ? raw.gateway.controlUi.allowedOrigins.filter((entry) => typeof entry === "string")
      : [],
  };
}

function summarizeSessionRows(rows) {
  const codexRows = rows.filter((row) => {
    const fields = [row?.key, row?.displayName, row?.label]
      .filter((value) => typeof value === "string")
      .map((value) => value.toLowerCase());
    return fields.some(
      (value) =>
        value.includes("codex-") || value.includes("validation-") || value.includes("proof-"),
    );
  });
  return {
    count: rows.length,
    codexRowCount: codexRows.length,
    recent: rows.slice(0, 10).map((row) => ({
      key: row.key,
      visibilityClass: row.visibilityClass ?? null,
      retentionClass: row.retentionClass ?? null,
      updatedAt: row.updatedAt ?? null,
      status: row.status ?? null,
      displayName: row.displayName ?? row.label ?? null,
    })),
    codexRows: codexRows.map((row) => ({
      key: row.key,
      visibilityClass: row.visibilityClass ?? null,
      retentionClass: row.retentionClass ?? null,
      displayName: row.displayName ?? row.label ?? null,
    })),
  };
}

function resolveReadyUrl(probe) {
  const loopback = probe?.network?.localLoopbackUrl;
  if (typeof loopback !== "string" || !loopback.trim()) {
    return defaultReadyUrl;
  }
  return loopback.replace(/^ws/i, "http").replace(/\/?$/, "/readyz");
}

function fetchHeaders(readyUrl) {
  return fetch(readyUrl, {
    method: "GET",
    headers: { accept: "application/json" },
  }).then(async (response) => ({
    readyUrl,
    ok: response.ok,
    status: response.status,
    headers: {
      version: response.headers.get("x-openclaw-version"),
      commit: response.headers.get("x-openclaw-commit"),
      buildSignature: response.headers.get("x-openclaw-build-signature"),
      cacheControl: response.headers.get("cache-control"),
    },
    body: await response.text(),
  }));
}

async function main() {
  const config = loadControlUiConfig();
  const probeResult = tryParseJsonCommand([cliEntrypoint, "gateway", "probe", "--json"]);
  const probe = probeResult.data;
  const sessions = parseJsonCommand([
    cliEntrypoint,
    "gateway",
    "call",
    "sessions.list",
    "--params",
    '{"includeGlobal":true,"includeUnknown":true}',
    "--json",
  ]);
  const health = parseJsonCommand([cliEntrypoint, "gateway", "call", "health", "--json"]);
  const readyUrl = resolveReadyUrl(probe);
  const ready = await fetchHeaders(readyUrl);

  const report = {
    ok: Array.isArray(sessions?.sessions) && Array.isArray(health?.sessions?.recent) && ready.ok,
    helper: "scripts/operator-ui-proof.mjs",
    proofBoundary:
      "Sanctioned non-browser helper. Proves live gateway/session/build surfaces through repo-owned CLI and readiness HTTP only; does not replace browser validation.",
    config,
    probe: {
      ok: probe?.ok ?? false,
      commandOk: probeResult.ok,
      error: probeResult.error,
      degraded: probe?.degraded ?? null,
      primaryTargetId: probe?.primaryTargetId ?? null,
      localLoopbackUrl: probe?.network?.localLoopbackUrl ?? null,
      localTailnetUrl: probe?.network?.localTailnetUrl ?? null,
      tailnetIPv4: probe?.network?.tailnetIPv4 ?? null,
    },
    sessionsList: summarizeSessionRows(Array.isArray(sessions?.sessions) ? sessions.sessions : []),
    healthSummary: {
      ok: health?.ok ?? false,
      sessionCount: health?.sessions?.count ?? null,
      recentCount: Array.isArray(health?.sessions?.recent) ? health.sessions.recent.length : 0,
      recentCodexCount: Array.isArray(health?.sessions?.recent)
        ? health.sessions.recent.filter((row) => String(row?.key ?? "").includes("codex-")).length
        : 0,
      recent: Array.isArray(health?.sessions?.recent)
        ? health.sessions.recent.slice(0, 10).map((row) => ({
            key: row.key,
            updatedAt: row.updatedAt ?? null,
            age: row.age ?? null,
          }))
        : [],
    },
    ready,
  };

  if (outputJson) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  process.stdout.write(`operator proof helper: ${report.ok ? "ok" : "degraded"}\n`);
  process.stdout.write(`config: ${config.configPath}${config.exists ? "" : " (missing)"}\n`);
  process.stdout.write(`allowed origins: ${config.allowedOrigins.join(", ") || "(none)"}\n`);
  process.stdout.write(
    `probe: ${report.probe.primaryTargetId ?? "unknown"} ${report.probe.localLoopbackUrl ?? ""}\n`,
  );
  process.stdout.write(
    `sessions.list: count=${report.sessionsList.count} codexRows=${report.sessionsList.codexRowCount}\n`,
  );
  process.stdout.write(
    `health recent: count=${report.healthSummary.recentCount} codexRows=${report.healthSummary.recentCodexCount}\n`,
  );
  process.stdout.write(
    `readyz: ${ready.readyUrl} status=${ready.status} signature=${ready.headers.buildSignature ?? "(none)"}\n`,
  );
}

await main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
