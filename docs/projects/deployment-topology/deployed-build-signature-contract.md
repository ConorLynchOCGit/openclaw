---
summary: "Defines the deployed build-signature fields and the gateway surfaces that expose them."
title: "Deployed Build Signature Contract"
---

# Deployed Build Signature Contract

## Canonical build metadata file

- `dist/build-info.json`

## Required fields

- `version`
- `commit`
- `commitShort`
- `buildSignature`
- `sourceTree`
- `builtAt`

## Current signature shape

`buildSignature = <version> + "+" + <commitShort>`

Example:

- `2026.4.15-beta.1+c5cb769d9a81`

## Gateway exposure

Probe responses now expose:

- `X-OpenClaw-Version`
- `X-OpenClaw-Commit`
- `X-OpenClaw-Build-Signature`

Detailed readiness payloads also include:

```json
{
  "build": {
    "version": "...",
    "commit": "...",
    "commitShort": "...",
    "buildSignature": "...",
    "builtAt": "...",
    "sourceTree": "..."
  }
}
```

## Why headers matter

Headers let shallow machine checks prove what build is running without exposing
full readiness internals.
