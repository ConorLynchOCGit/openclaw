---
summary: "External research and repo-adapted recommendations for OpenClaw agent identity, tool/permission separation, skills policy, and prompt-injection defense."
title: "Identity And Agent Pack Research"
---

# Identity And Agent Pack Research

This note records the external sources actually used to shape the durable agent
pack and the `web-researcher` defense contract.

## Sources used

1. Anthropic, [Building Effective AI Agents](https://www.anthropic.com/engineering/building-effective-agents)
2. OpenAI, [Safety in building agents](https://developers.openai.com/api/docs/guides/agent-builder-safety)
3. OpenAI, [A practical guide to building agents](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf)
4. Simon Willison, [Design Patterns for Securing LLM Agents against Prompt Injections](https://simonwillison.net/2025/Jun/13/prompt-injection-design-patterns/)
5. Simon Willison, [Prompt injection explained](https://simonwillison.net/2023/May/2/prompt-injection-explained/)
6. Anthropic, [Writing effective tools for AI agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
7. Anthropic, [Subagents](https://docs.anthropic.com/en/docs/claude-code/sub-agents)
8. Anthropic, [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
9. Microsoft, [Defend against indirect prompt injection attacks](https://learn.microsoft.com/en-us/security/zero-trust/sfi/defend-indirect-prompt-injection)

## Source-backed takeaways

### Identity and tool design

- Anthropic emphasizes that agents improve when toolsets and tool
  documentation are designed clearly and tested against real mistakes. That
  argues for durable `Tools.md` and `Permissions.md`, not just a single role
  blurb.
- Anthropic’s tool-writing guidance is even more explicit: tool descriptions
  should read like instructions to a new hire, with unambiguous parameter
  names, explicit input/output contracts, and evaluation-backed refinement.
  That supports richer role packs with clearer tool routing and verification
  contracts.
- Anthropic also treats agent usefulness as a combination of clear task
  boundaries, good tool interfaces, and explicit checkpoints with environmental
  ground truth. That supports richer `Identity.md` and `Startup.md`.
- Anthropic’s subagent guidance reinforces that specialized agents need their
  own bounded context and purpose so the main agent stays focused on the
  high-level objective. That supports stronger in-bounds/out-of-bounds and
  re-entry sections in the durable packs.
- OpenAI’s practical guide recommends standardized tool definitions and
  reusable many-to-many relationships between tools and agents. That supports a
  registry-backed durable pack rather than re-describing tools ad hoc.
- OpenAI’s current agent-instruction guidance says good routines come from
  existing policy docs, clearer smaller steps, explicit actions, and captured
  edge cases. That means a good `Identity.md` cannot stop at mission blurbs; it
  needs verification, edge-case, and escalation content.

### Safety and prompt injection

- OpenAI’s agent safety guidance explicitly treats prompt injection as
  untrusted text attempting to override agent instructions, and recommends
  structured outputs, approvals, and isolating untrusted data from downstream
  behavior.
- Microsoft’s current indirect-prompt-injection guidance adds practical system
  layers beyond prompt text alone: data marking, plan-drift detection, tool
  chain analysis, least privilege, and human review for risky paths.
- Simon Willison’s design-pattern review is directionally stricter than most
  vendor guidance: once an agent ingests untrusted content, consequential
  actions should be constrained. That is directly relevant to browsing and
  research roles.
- Simon’s earlier prompt-injection explainer reinforces the exfiltration risk
  when untrusted content and private context coexist inside a tool-using
  agent.

### Workflows vs skills

- OpenAI’s practical guide treats tools and orchestration as reusable building
  blocks rather than duplicating operating logic in prose for every agent.
- Anthropic’s guidance similarly pushes clarity into the tool/agent interface,
  not into redundant per-role process manuals.
- Repo judgment: repeatable executable behavior belongs in skills first, with
  `Workflows.md` reserved for genuinely operator-governed exceptions.

### Pack quality

- Anthropic’s context-engineering guidance implies that every line in an agent
  pack competes for attention. Good packs should therefore be dense with
  operational signal rather than generic role prose.
- OpenAI’s instruction guidance and Anthropic’s tool guidance both point toward
  the same quality bar: explicit actions, edge-case handling, and evaluation
  hooks beat long aspirational descriptions.

## Recommendations adopted

### 1. Split durable intent from runtime mechanics

Adopted:

- `docs/agents/` is the durable human-readable contract
- `.agents/` stays machine-readable
- runtime compatibility files remain explicit compatibility surfaces, not the
  only durable truth

Why:

- this cleanly separates meaning from config
- it matches the repo’s broader durable-vs-generated discipline

### 2. Keep the durable base pack small but complete

Adopted required files:

- `index.md`
- `Identity.md`
- `Startup.md`
- `Tools.md`
- `Permissions.md`
- `Skills.md`
- `Status.md`

Repo judgment:

- every file above answers a distinct operational question
- forcing `Memory.md`, `roadmap.md`, or `Decisions.md` into every agent pack by
  default would create filler and drift

### 3. Make `Identity.md` operational, not biographical

Adopted minimum contents:

- mission in the OpenClaw system
- optimization target
- in-bounds requests
- out-of-bounds requests
- escalation boundaries
- quality bar
- failure modes to avoid

Why:

- this is the smallest shape that actually constrains agent behavior
- and it aligns with current vendor guidance that agents need explicit steps,
  edge cases, and actions rather than vague mission text

### 4. Make prompt-injection defense explicit for research roles

Adopted for `web-researcher`:

- page content is untrusted input, never instruction authority
- user objective and runtime policy stay primary
- suspicious credential, secret, cross-origin, or hidden-prompt requests are
  refused or escalated
- page text must not choose tools or execution steps by itself

Why:

- browsing roles are the clearest place where untrusted content can shape tool
  behavior unless the contract says otherwise

### 5. Add a quality rubric beyond file existence

Adopted:

- verification contract
- evidence hierarchy
- tool-routing guidance
- re-entry checklist
- failure modes to avoid

Why:

- structural completeness alone does not produce good agent behavior
- the strongest current guidance emphasizes context quality, explicit actions,
  and evaluation-ready contracts

### 6. Prefer skills over `Workflows.md`

Adopted rule:

- repeatable executable behavior becomes a skill by default
- `Workflows.md` is only for durable operator-facing process that should not yet
  be encoded as a skill

Why:

- one executable workflow system is maintainable
- two overlapping ones drift

## Recommendations explicitly rejected

### Rejected: require `Workflows.md` for every agent

Reason:

- this would duplicate skill behavior in prose
- it creates a second workflow system without adding authority or safety

### Rejected: require per-agent `Memory.md` and `roadmap.md` by default

Reason:

- most agents do not own long-lived per-agent planning or memory yet
- requiring those files would incentivize filler rather than durable guidance

### Rejected: rely on a doc-only browsing safety note

Reason:

- `web-researcher` needed a runtime seam change too
- the defense had to land in both durable docs and the live prompt contract

### Rejected: pretend general browsing agents can be made fully safe

Reason:

- the external research does not support that claim
- the repo should instead use bounded behavior, tool constraints, and explicit
  refusal rules

## Repo-specific judgment

OpenClaw does not need the most complex possible agent architecture here. The
highest-value move is:

1. explicit role identity
2. explicit permissions/tools/skills
3. deterministic drift checks
4. stricter browsing trust boundaries where untrusted content can steer tools

That gives the repo a durable agent layer without inventing unnecessary
additional machinery.
