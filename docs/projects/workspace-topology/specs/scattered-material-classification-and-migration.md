---
summary: "Spec for classifying and moving scattered project-like material into the canonical topology."
title: "Scattered Material Classification And Migration"
---

# Scattered Material Classification And Migration

## Goal

Classify and migrate scattered material intelligently rather than moving files
blindly.

## Required classifications

Every candidate file or doc set should be classified as one of:

- `system_control_doc`
- `project_workspace_doc`
- `agent_workspace_doc`
- `qa_asset`
- `public_product_doc`
- `package_local_doc`
- `archive_candidate`
- `leave_in_place`

## Rules

- keep executable QA assets in `qa/`
- move project workspaces into `docs/projects/`
- move global control docs into `docs/system/`
- move durable agent docs into `docs/agents/`
- keep code/package-local READMEs with their owning package unless they are
  actually project workspaces in disguise

## Additional requirement

Past and future roadmap items without project folders must be backfilled so the
main roadmap can point to real project workspaces instead of placeholder text.

## Success criteria

- scattered material is classified explicitly
- migration is durable and defensible
- no major doc class is left in an ad hoc location without a reason
