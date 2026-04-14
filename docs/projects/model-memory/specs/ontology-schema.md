---
summary: "Canonical semantic contract and object schema for model-memory."
title: "Ontology And Schema"
---

# Ontology And Schema

## Canonical classes

The top-level business contract is fixed:

- `user`
- `feedback`
- `project`
- `reference`

## Internal kinds

The internal semantic kinds are fixed:

- `preference`
- `fact`
- `rule`
- `procedure`
- `reference`

## Canonical class mapping

- `preference` -> `user`
- `fact` -> `project`
- `rule`
  - user-facing output preference corrections -> `user`
  - workflow or project operational rules -> `feedback`
  - missing capability or project gap -> `project`
- `procedure` -> `feedback`
- `reference` -> `reference`

The schema will encode the canonical class explicitly rather than inferring it later.

## Object envelope

Every captured object must include:

- `id?`
- `canonicalClass`
- `kind`
- `payload`
- `scope?`
- `provenance`
- `confidence`
- `durability`
- `reviewMode`
- `rationaleCodes?`

## Payload by kind

### Preference

- `subject`
- `instruction`
- `operation`

### Fact

- `subject`
- `value`

### Rule

- `subject`
- `recommendedAction?`
- `avoidAction?`
- `neededCapability?`

### Procedure

- `title`
- `steps`
- `successShape?`
- `failureShape?`

### Reference

- `task`
- `primaryResource`
- `companionResources?`

## Scope

`scope` is optional and may include:

- `projectId`
- `projectScope`
- `workflowScope`
- `userScope`
- `contextualDependencies`

Scope is descriptive and provenance-linked. It is not a hidden semantic category system.

## Closed enums

### Confidence

- `weak`
- `medium`
- `strong`

### Durability

- `ephemeral`
- `durable`

### Review mode

- `auto_accept`
- `manual_review`
- `suppress`

In v1, these values are preserved in the schema for forward compatibility, but write execution remains governed by the v1 write-policy override.

## Audit metadata

`rationaleCodes` is optional audit metadata.

It exists to explain how the system handled an object, not what the object means.

Allowed properties:

- closed generic codes only
- no concrete memory content
- no compatibility-era category codes

`rationaleCodes` must never be used as authority for:

- canonical class
- kind
- semantic payload meaning
- dedupe
- supersession
- retrieval truth
- write policy
- review policy

## Provenance

Each object must include exact provenance spans into the source window.

Required provenance information:

- source id
- block ids or segment indexes
- line range when available
- heading path when available

## Fields explicitly excluded from v1 runtime truth

- `factFieldKey`
- `responseStyleFamily`
- `procedureFamily`
- `lessonFamily`
- `guidancePattern` as legacy compatibility output vocabulary
- compatibility category labels
- `ruleSubtype`

If any of these are needed later for external compatibility, they will be derived at the edge, not stored as primary semantic truth.
