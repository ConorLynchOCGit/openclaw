---
summary: "Spec for deterministic topology, pack, boundary, and runtime-sprawl drift enforcement."
title: "Drift Enforcement"
---

# Drift Enforcement

## Goal

Make the intended structure deterministic and enforceable.

## Required checks

1. document topology check
2. project pack compliance check
3. agent pack compliance check
4. durable/generated boundary check
5. runtime inventory / sprawl check

## Required scripts

- `scripts/check-doc-topology.mjs`
- `scripts/check-doc-packs.mjs`
- `scripts/check-durable-generated-boundaries.mjs`
- `scripts/check-runtime-inventory.mjs`

## Runtime inventory scope

The runtime inventory check should guard against the future emergence of:

- non-canonical repo trees in active deployment use
- non-canonical runtime containers
- non-canonical images

## Success criteria

- structural drift is surfaced automatically
- the repo no longer depends on operator memory alone for enforcement
