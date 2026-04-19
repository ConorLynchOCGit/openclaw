---
summary: "Active slice for the deployment-topology project."
title: "Deployment Topology Current Slice"
---

# Deployment Topology Current Slice

## Active slice

`runtime-hardening-rollout-proof-and-session-classification`

## Goals

1. keep runtime-facing changes tied to live rollout proof instead of local-only
   validation
2. expose and verify a real deployed build signature on the live gateway
3. keep internal/proof sessions out of the normal operator selector through
   explicit metadata classification and retention
4. preserve the compose-run gateway RPC proof path while diagnosing the still
   broken host loopback RPC path
5. keep auth discovery, path parity, and runtime-assertion surfaces discoverable
6. keep the repo docs aligned with the new live runtime truth
7. preserve the Tailnet-safe operator posture while runtime proof evolves
