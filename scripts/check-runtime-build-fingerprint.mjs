#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const buildInfoPath = path.join(rootDir, "dist", "build-info.json");
const readyUrl = process.env.OPENCLAW_READY_URL?.trim() || "http://127.0.0.1:28789/readyz";

function fail(message, extra) {
  const payload = { ok: false, message, ...(extra ? { extra } : {}) };
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}

if (!fs.existsSync(buildInfoPath)) {
  fail("missing local dist/build-info.json", { buildInfoPath });
}

const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, "utf8"));
const localSignature =
  typeof buildInfo.buildSignature === "string" && buildInfo.buildSignature.trim()
    ? buildInfo.buildSignature.trim()
    : null;

if (!localSignature) {
  fail("local build info does not include buildSignature", { buildInfoPath });
}

let response;
try {
  response = await fetch(readyUrl, {
    method: "GET",
    headers: { accept: "application/json" },
  });
} catch (error) {
  fail("failed to reach live readiness endpoint", {
    readyUrl,
    error: error instanceof Error ? error.message : String(error),
  });
}

const liveSignature = response.headers.get("x-openclaw-build-signature");
const liveVersion = response.headers.get("x-openclaw-version");
const liveCommit = response.headers.get("x-openclaw-commit");

const report = {
  ok: response.ok && liveSignature === localSignature,
  readyUrl,
  status: response.status,
  local: {
    version: buildInfo.version ?? null,
    commit: buildInfo.commit ?? null,
    buildSignature: localSignature,
  },
  live: {
    version: liveVersion,
    commit: liveCommit,
    buildSignature: liveSignature,
  },
};

console.log(JSON.stringify(report, null, 2));

if (!report.ok) {
  process.exit(1);
}
