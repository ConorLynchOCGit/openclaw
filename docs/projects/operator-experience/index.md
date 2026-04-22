---
summary: "Operator-facing UX, run visibility, queueing, diagnostics, and permission-mode workflow."
title: "Operator Experience"
---

# Operator Experience

This project owns the OpenClaw operator experience: chat/run visibility, response card behavior, queue management, diagnostics, permission-mode UX, and operator workflow surfaces.

## Boundaries

- Owns chat feed progress, queue, run timeline, diagnostics, and operator dashboard behavior.
- Owns the UX layer for permission modes, including visible host-operator state and audit affordances.
- Does not own MMV2 memory truth, projection semantics, or retrieval ranking. Those remain under Model Memory.
- Does not own canonical path classification or host mount mechanics. Those remain under Workspace Topology.

## Current Slice

- [CURRENT_SLICE.md](CURRENT_SLICE.md)

## Status

- [STATUS.md](STATUS.md)

## Decisions

- [DECISIONS.md](DECISIONS.md)

## Roadmap

- [roadmap.md](roadmap.md)

## Specs

- [Operator UX QoL Roadmap](specs/operator-ux-qol-roadmap.md)
