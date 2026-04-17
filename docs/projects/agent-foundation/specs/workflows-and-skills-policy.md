---
summary: "Spec for deciding when repeatable workflows should be skills versus standalone docs."
title: "Workflows And Skills Policy"
---

# Workflows And Skills Policy

## Goal

Avoid creating two overlapping canonical systems for repeatable behavior.

## Default rule

Repeatable executable workflows should canonize into skills by default.

## Implication

- `Workflows.md` is not part of the required base pack
- agent docs should point to required skills when those skills embody the
  repeatable workflow

## Allowed exception

Use a human-authored workflow doc only when:

- the process is primarily operator/human-governed
- it should not yet be encoded as a skill
- the extra prose is necessary and not duplicated elsewhere

## Success criteria

- skills remain the canonical repeatable workflow system
- durable docs do not become a parallel workflow framework accidentally
