---
summary: "Focused regression coverage for selector visibility, build fingerprint probes, and related gateway seams."
title: "Gateway Regression Test Matrix"
---

# Gateway Regression Test Matrix

## Focused automated coverage

| surface                                        | proof                                      |
| ---------------------------------------------- | ------------------------------------------ |
| selector hides unnamed proof sessions          | `src/gateway/session-utils.search.test.ts` |
| selector honors stored visibility metadata     | `src/gateway/session-utils.search.test.ts` |
| non-main internal worker sessions hide cleanly | `src/gateway/session-utils.search.test.ts` |
| probe headers expose build signature           | `src/gateway/server-http.probe.test.ts`    |
| detailed readiness payload exposes build block | `src/gateway/server-http.probe.test.ts`    |

## Low-overhead runtime proofs

| surface                                             | proof                                                   |
| --------------------------------------------------- | ------------------------------------------------------- |
| live gateway build signature matches local artifact | `node scripts/check-runtime-build-fingerprint.mjs`      |
| same-day continuity exists                          | `node scripts/check-daily-memory-continuity.mjs --json` |
| auth-path register resolves canonical paths         | `node scripts/check-auth-sources.mjs --provider <id>`   |
