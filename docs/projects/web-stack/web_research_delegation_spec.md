# Web Research Delegation Spec

Purpose:

- `web-researcher` is the designated external public-web retrieval surface.
- Canonical delegation target: `agent:web-researcher:main`
- Do not rely on the friendly label `web-researcher` alone.

When to delegate:

- external public web research
- page-fact retrieval
- JS-heavy site retrieval
- comparison or research tasks grounded in public pages

When not to delegate:

- local workspace or file reading
- internal skill or tool questions
- purely internal reasoning with no web retrieval need

Delegation modes:

- Canonical delegation mode:
  - use `agent:web-researcher:main`
  - for ongoing exploratory research
  - for follow-up expansion where previous research context is useful
- Fresh page-read delegation mode:
  - use a fresh temporary `web-researcher` session key
  - for explicit URL tasks
  - for “read this page/site” tasks
  - for exact visible-field tasks
  - for exact count, total, version, or date tasks
  - for cases where stale prior context would be a liability

Standard delegation behavior:

- caller sends a bounded research request
- `web-researcher` returns an evidence-based structured retrieval package
- caller finishes with that result instead of independently browsing again
- if the user supplies a specific URL or explicitly says “read this page/site”, the caller defaults to a fresh temporary `web-researcher` session, not `agent:web-researcher:main`
- do not reuse a prior delegated result for an explicit URL/page-read task unless the user explicitly allows reuse or asks for a recap

Standard request fields:

- objective
- why_this_matters
- target_urls_if_known
- required_fields
- adjacent_context_to_collect
- strictness
  - `fact_only`
  - `fact_plus_context`
  - `exploratory`
- stop_rule
- desired_output_shape

Standard response fields:

- direct_answer
- confidence
- required_fields_status
- retrieval_path
- supporting_evidence
- adjacent_findings
- open_questions
- recommended_next_step

Practical rule:

- do not duplicate browsing if `web-researcher` already retrieved what is needed
