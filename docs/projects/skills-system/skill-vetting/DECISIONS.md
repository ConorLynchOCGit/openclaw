---
summary: "Durable decisions for the Skill Vetting workstream."
title: "Skill Vetting Decisions"
---

# Skill Vetting Decisions

## Accepted decisions

### 2026-04-18 - Review must happen before install

Decision:

- no blind third-party skill install
- acquisition lands in quarantine first

### 2026-04-18 - Search and acquisition are intentionally split

Decision:

- allow search-only mode when native search exists
- acquisition requires a quarantine-safe path

### 2026-04-18 - Skill Vetting produces exactly three outcomes

Decision:

- `install`
- `inspire`
- `reject`

### 2026-04-18 - Missing acquisition tooling is a hard blocker, not a silent fallback

Decision:

- if quarantine-safe download is unavailable, record the review as blocked on
  acquisition rather than using the live workspace install path
