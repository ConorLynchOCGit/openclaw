---
summary: "Interaction model between human-owned USER.md and projected/generated user-context artifacts."
title: "USER.md And Projected Context Contract"
---

# USER.md And Projected Context Contract

`USER.md` is not a scratch projection target.

It is a human-owned context surface that may inform model-memory projections and
runtime context assembly, but it is not itself replaced by those projections.

## Ownership

| Surface                          | Owner                | Writable by          |
| -------------------------------- | -------------------- | -------------------- |
| workspace `USER.md`              | human/operator       | human/operator       |
| projected user context artifacts | runtime/model-memory | runtime/model-memory |

## Contract

1. `USER.md` remains the canonical operator-editable file.
2. Projected/generated user context must live either:
   - in an explicit generated zone inside `USER.md`, or
   - in a separate runtime artifact path.
3. If both a human-authored section and a generated section exist, the
   generated section cannot silently win by replacing the human section.
4. Retrieval and context assembly may use both surfaces, but they must preserve
   provenance so the system can distinguish:
   - human-authored user instruction
   - derived/generated summary or projection

## Recommended read posture

- bootstrap: read `USER.md` as a high-priority human continuity source
- context engine: include generated user-context artifacts only as derived
  support, not as an overwrite of `USER.md`
- model-memory ingest: ingest `USER.md` as a human-authored source envelope

## Forbidden behavior

- replacing the whole file with a generated packet
- treating a generated packet as more authoritative than explicit human notes
- writing back generated context into human sections without a visible boundary

## Current retirement implication

This contract is why legacy retirement cannot simply delete `USER.md`-adjacent
compatibility behavior without first preserving:

- human ownership
- generated-zone boundaries
- provenance in retrieval/context assembly
