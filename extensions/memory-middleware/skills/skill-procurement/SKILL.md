# Skill Procurement

Use this skill to govern third-party skill onboarding for the memory middleware
effort.

Current procurement rules:

- Skill Vetter is mandatory before any third-party skill is considered approved
  for normal use.
- `self-improving-agent` is the first intended learning-oriented external skill
  to evaluate.
- Proactive Agent remains out of scope for now.
- Third-party skills are accelerators only and do not replace the repo's
  authoritative memory architecture.
- This scaffold does not install or enable any third-party skill automatically.

Required workflow:

1. Read `docs/memory-system/SKILL_PROCUREMENT.md`.
2. Classify the candidate skill lifecycle state as one of:
   - `discovered`
   - `under_review`
   - `vetted`
   - `approved_limited`
   - `approved_normal`
   - `rejected`
   - `quarantined`
3. Require Skill Vetter findings before treating the skill as approved for
   normal use.
4. Record the minimum vetting outputs:
   - `source`
   - `scope`
   - `permissions_risk`
   - `suspicious_patterns`
   - `operational_fit`
   - `approval_recommendation`
5. Treat the following as install blockers:
   - missing Skill Vetter review
   - unresolved red flags
   - unclear permissions or risk
   - conflict with the repo's existing memory architecture
   - missing recorded recommendation

Recording locations:

- `docs/memory-system/SKILL_PROCUREMENT.md` is the canonical procurement policy.
- `docs/memory-system/SELF_IMPROVING_AGENT_INTEGRATION.md` defines the allowed
  role and guardrails for `self-improving-agent`.
- `docs/memory-system/STATUS.md` records current slice posture.
- `docs/memory-system/DECISIONS.md` records stable policy decisions.
- `docs/memory-system/OPEN_QUESTIONS.md` records unresolved approval blockers.

Source coverage:

- apply this workflow to ClawHub skills
- apply this workflow to GitHub or imported skills
- apply this workflow to any externally sourced skill

Self-improving-agent posture:

- treat `self-improving-agent` as a candidate-learning accelerator only
- do not treat it as the system of record for memory
- do not let it overwrite policy memory or bypass review
