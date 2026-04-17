---
summary: "Startup brief for the deployment-topology project."
title: "Deployment Topology Startup"
---

# Deployment Topology Startup

## Mission

Keep the live OpenClaw environment on one unambiguous deployment posture:

- one canonical repo checkout
- one canonical runtime container
- one canonical runtime image

## Scope

This project covers:

- VPS runtime consolidation
- runtime inventory drift prevention
- git remote/auth workflow on the VPS
- PNPM/build hygiene specific to the deployment host

This project does not cover:

- model-memory semantics or retrieval quality
- agent durable-pack population
