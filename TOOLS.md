# TOOLS.md

## Purpose

Reference file for stable tool-related notes, integration conventions, and repeated operational details.

Do not store secrets here.

## Current Tooling

### OpenClaw

- Private admin is exposed through Tailscale Serve
- Main private URL: `https://srv1425839.tailbcf154.ts.net`

### Webhook Gateway

- n8n private admin: `https://srv1425839.tailbcf154.ts.net:4443`
- Public webhook ingress: `https://srv1425839.tailbcf154.ts.net:8443`
- Public webhook routing currently uses `/webhook/*`

## Model Policy

Primary default model:

- openrouter/anthropic/claude-sonnet-4.6

Fallbacks:

- openrouter/openai/gpt-5.4-mini
- openrouter/anthropic/claude-haiku-4.5

Manual escalation model:

- openrouter/openai/gpt-5.4

Cheap future scheduled-task / digest model:

- openrouter/openai/gpt-5.4-mini
- later, openrouter/openai/gpt-5.4-nano for lightweight routing/classification

Policy:

- use the strong balanced model by default
- keep the most expensive model for manual escalation
- keep cheap models for heartbeat, digest, and scheduled work
- avoid broad auto-routing as the main default

## Operational Conventions

- Keep admin surfaces private
- Keep public ingress narrow
- Persist state outside containers
- Freeze working states after major milestones
- Prefer host-level Tailscale Serve/Funnel over exposing app containers directly

## Future Integrations To Track Here

- Telegram integration
- GitHub integration details
- generic intake endpoint conventions
- browser/search tooling conventions
- model fallback policy

## Telegram Direct-Send Rule

- For `message` tool sends to Telegram with `action: send`, always include `buttons: []` unless real buttons are intentionally required.
- Default direct-send shape is plain text only:
  - no media
  - no attachments
  - no buttons unless explicitly needed
- Do not expose schema/debug chatter to the user.
- If a Telegram send shape is wrong, correct it silently once.
- If the send still fails, return a short plain failure instead of verbose retry or validation narration.

## Browsing Routing Rule

- Follow `projects/web_stack/browsing_routing_spec.md` for detailed browsing policy.
- Follow `projects/web_stack/web_research_delegation_spec.md` for agent-to-agent web retrieval delegation.
- Intended order:
  - for external public web research, prefer delegating to `agent:web-researcher:main` for exploratory follow-up work
  - `web_search` for discovery only
  - `web_fetch` first for clearly public non-interactive pages
  - Firecrawl-backed render/extraction when fetch is thin or clearly client-rendered
  - browser for interactive pages or final escalation
- Do not conclude a page is empty from thin fetch alone on a JS-heavy site.
- Do not use local `/app/skills/*.md` as part of ordinary external web browsing.
- Use `agent:web-researcher:main` for exploratory follow-up work where prior research context is useful.
- If the user gives a specific URL or says “read this page/site”, prefer a fresh temporary `web-researcher` session instead of `agent:web-researcher:main` or any reused delegated output.
- Reuse of prior delegated output is only for explicit recap/reuse tasks or when the user clearly allows it.
- Send delegation requests with enough context to make the retrieval useful:
  - `objective`
  - `why_this_matters`
  - `required_fields`
  - `adjacent_context_to_collect`
  - `desired_output_shape`
- Do not re-browse unnecessarily after a sufficient delegated `web-researcher` result.

<!-- OPENCLAW:MEMORY-PROJECTION:START memory-projection:tool-preferences -->

## Compiled Tool Preferences

- No eligible approved memory is currently projected.
<!-- OPENCLAW:MEMORY-PROJECTION:END memory-projection:tool-preferences -->

<!-- BEGIN GENERATED: openclaw-canonical -->

## Canonical Durable Sources

- Runtime path: TOOLS.md
- Structural mode: lean_operational_document
- Keep this file local and operational: environment-specific notes belong here, not in shared skills.
- Active workspace: Workspace Topology
- workspace docs/projects/workspace-topology
- startup docs/projects/workspace-topology/STARTUP.md
- current slice docs/projects/workspace-topology/CURRENT_SLICE.md
- status docs/projects/workspace-topology/STATUS.md
- Active workspace: Model Memory
- workspace docs/projects/model-memory
- startup docs/projects/model-memory/STARTUP.md
- current slice docs/projects/model-memory/CURRENT_SLICE.md
- status docs/projects/model-memory/STATUS.md
- Active workspace: Operator Experience
- workspace docs/projects/operator-experience
- startup docs/projects/operator-experience/STARTUP.md
- current slice docs/projects/operator-experience/CURRENT_SLICE.md
- status docs/projects/operator-experience/STATUS.md
- Active workspace: Deployment Topology
- workspace docs/projects/deployment-topology
- startup docs/projects/deployment-topology/STARTUP.md
- current slice docs/projects/deployment-topology/CURRENT_SLICE.md
- status docs/projects/deployment-topology/STATUS.md
- Active workspace: QA Program
- workspace docs/projects/qa-program
- startup docs/projects/qa-program/STARTUP.md
- current slice docs/projects/qa-program/CURRENT_SLICE.md
- status docs/projects/qa-program/STATUS.md
- Active workspace: Maintenance
- workspace docs/projects/maintenance
- startup docs/projects/maintenance/STARTUP.md
- current slice docs/projects/maintenance/CURRENT_SLICE.md
- status docs/projects/maintenance/STATUS.md
- Active workspace: Skills System
- workspace docs/projects/skills-system
- startup docs/projects/skills-system/STARTUP.md
- current slice docs/projects/skills-system/CURRENT_SLICE.md
- status docs/projects/skills-system/STATUS.md
- Active workspace: Build Performance
- workspace docs/projects/build-performance
- startup docs/projects/build-performance/STARTUP.md
- current slice docs/projects/build-performance/CURRENT_SLICE.md
- status docs/projects/build-performance/STATUS.md
- Active workspace: Channel Identity
- workspace docs/projects/channel-identity
- startup docs/projects/channel-identity/STARTUP.md
- current slice docs/projects/channel-identity/CURRENT_SLICE.md
- status docs/projects/channel-identity/STATUS.md
- Active workspace: GitHub
- workspace docs/projects/github
- startup docs/projects/github/STARTUP.md
- current slice docs/projects/github/CURRENT_SLICE.md
- status docs/projects/github/STATUS.md
- Active workspace: Live App Patches
- workspace docs/projects/live-app-patches
- startup docs/projects/live-app-patches/STARTUP.md
- current slice docs/projects/live-app-patches/CURRENT_SLICE.md
- status docs/projects/live-app-patches/STATUS.md
- Active workspace: Ops
- workspace docs/projects/ops
- startup docs/projects/ops/STARTUP.md
- current slice docs/projects/ops/CURRENT_SLICE.md
- status docs/projects/ops/STATUS.md
- Active workspace: Roles
- workspace docs/projects/roles
- startup docs/projects/roles/STARTUP.md
- current slice docs/projects/roles/CURRENT_SLICE.md
- status docs/projects/roles/STATUS.md
- Active workspace: Web Stack
- workspace docs/projects/web-stack
- startup docs/projects/web-stack/STARTUP.md
- current slice docs/projects/web-stack/CURRENT_SLICE.md
- status docs/projects/web-stack/STATUS.md
- Active workspace: Workflows
- workspace docs/projects/workflows
- startup docs/projects/workflows/STARTUP.md
- current slice docs/projects/workflows/CURRENT_SLICE.md
- status docs/projects/workflows/STATUS.md
<!-- END GENERATED: openclaw-canonical -->
