---
summary: "Risk tiers, scanner policy, and autonomy ceilings for generated and third-party skills."
title: "Skill Vetting And Risk Policy"
---

# Skill Vetting And Risk Policy

## Objective

Define risk tiers and the maximum autonomy each tier may reach.

## Risk tiers

### Low

Traits:

- instruction-only
- no scripts
- no network
- no env or credentials
- no installers
- no hooks
- no broad runtime enablement
- bounded examples only

Autonomy ceiling:

- may reach Level 4 limited-scope auto-promotion after tests, vetting, and
  canary

### Medium

Traits:

- deterministic scripts
- local file reads or writes
- CLI use
- limited install metadata
- broader agent visibility

Autonomy ceiling:

- may auto-draft, auto-test, and sometimes auto-canary
- human approval required before install or promotion beyond narrow scopes

### High

Traits:

- network calls
- credentials or env requirements
- hooks
- package installation
- subprocess orchestration
- browser or session access
- mutating workspace behavior

Autonomy ceiling:

- Level 6 human approval required

### Blocked

Traits:

- credential grabs
- raw transcript persistence
- exfiltration
- obfuscated code
- unsafe eval or exec
- hidden outbound sends
- prompt-injection-prone external instruction ingestion

Autonomy ceiling:

- non-promotable

## Tier requirements

- scanner requirements scale with risk tier
- eval coverage scales with risk tier
- install scope narrows as risk increases
- provenance and rollback are mandatory for every promotable tier
- blocked findings fail closed
