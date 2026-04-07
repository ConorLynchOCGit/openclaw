# Cross-Domain Memory Families

## Purpose

This doc separates three different ideas that were previously getting mixed
together:

1. memory families that are already real and landed
2. memory families that were explicitly enumerated somewhere in the older
   roadmap or specs
3. memory families that are likely still necessary if OpenClaw is meant to
   work across many knowledge domains rather than software development only

Use this doc when deciding whether a proposed slice is:

- finishing an already-landed family
- completing a previously named but still incomplete family
- or introducing a truly new domain-neutral family needed for long-run
  completion

## Design rule

The roadmap should prefer a small number of domain-neutral families over a
long tail of domain-specific vertical families.

Examples:

- geology should not require a dedicated "geology memory" family
- marketing should not require a dedicated "marketing memory" family
- physical science should not require a dedicated "science memory" family

Instead, those domains should map onto reusable families such as:

- facts
- procedures
- lessons
- rules
- unmet needs
- decisions
- hypotheses
- findings
- risks
- terminology

## Matrix

| Family concept                                                     | Implemented now | Previously enumerated anywhere | Likely needed for cross-domain completion                                         | Notes                                                                                                            |
| ------------------------------------------------------------------ | --------------- | ------------------------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Response-style preference / requirement                            | yes             | yes                            | yes                                                                               | Landed in a bounded form; still software-agnostic and worth keeping as a universal preference family.            |
| Project fact / bounded named-project fact                          | yes             | yes                            | yes, but likely as part of broader entity profiles later                          | Landed for explicit named-project facts only; broader non-software use likely needs general entity profiles.     |
| Recurring procedure / checklist                                    | yes             | yes                            | yes                                                                               | Landed in a bounded form and clearly cross-domain.                                                               |
| Workflow lesson / tool gotcha / operational improvement            | yes             | yes                            | yes                                                                               | Landed in bounded and generic workflow forms; software-heavy examples today, but the family shape is general.    |
| Project rule / operating rule                                      | yes             | partially                      | yes                                                                               | Landed for named-project operating rules; later broader entity or domain rules may reuse this shape.             |
| Missing capability / unmet need                                    | yes             | yes                            | yes                                                                               | Landed for recommendation-only named-project missing workflow support; still valuable across domains.            |
| User correction as a standalone family                             | no              | yes                            | partially, but probably as a cross-family repair layer rather than its own family | Repair exists in bounded families already.                                                                       |
| Project fact correction as a standalone family                     | no              | yes                            | partially, but probably as repair/supersede behavior rather than its own family   | Likely absorbed by broader repair rules.                                                                         |
| External API failure lesson                                        | no              | yes                            | yes, but likely absorbed by broader lesson / workaround families                  | Historically software-shaped.                                                                                    |
| Outdated knowledge correction                                      | no              | yes                            | yes                                                                               | Likely matters later as fact/decision/terminology correction rather than a software-only family.                 |
| Better approach discovered                                         | no              | yes                            | yes                                                                               | Likely a lesson or decision-update family rather than a separate niche lane.                                     |
| Recurring environment constraint                                   | partly          | yes                            | yes                                                                               | Bounded software examples are live; a broader risk/constraint family is still missing.                           |
| Recurring deployment/runtime constraint                            | no              | yes                            | yes                                                                               | Likely absorbed by a broader risk/constraint family.                                                             |
| Recurring debugging preference                                     | no              | yes                            | yes, but likely absorbed by preference / audience / working-style memory          | Historically software-shaped.                                                                                    |
| Recurring review preference                                        | no              | yes                            | yes                                                                               | Likely part of audience or stakeholder model memory.                                                             |
| Repeated anti-pattern to avoid                                     | no              | yes                            | yes                                                                               | Likely overlaps lesson, risk, and exception families.                                                            |
| Similar-to-existing-memory merge suggestion                        | no              | yes                            | no, this is an operator-assist meta family, not a core content family             | Still useful later, but not part of the core cross-domain family set.                                            |
| Stale-memory supersede suggestion outside bounded correction lanes | no              | yes                            | no, operator-assist meta family                                                   | Separate from user-facing content families.                                                                      |
| Candidate dedupe / alias suggestion                                | no              | yes                            | no, operator-assist meta family                                                   | Important hygiene, not a core memory family.                                                                     |
| Retrieval miss / memory-gap signal                                 | no              | yes                            | no, operator-assist meta family                                                   | Useful for monitoring and future capture, not content itself.                                                    |
| Phrase-pattern suggestion for deterministic matcher expansion      | partly          | yes                            | no, operator-assist / quality family                                              | Phrase induction exists in one bounded lane today.                                                               |
| Decision + rationale                                               | no              | no                             | yes                                                                               | High-value cross-domain family for "we chose X because Y".                                                       |
| Hypothesis / open question                                         | no              | no                             | yes                                                                               | Needed for research-heavy work where uncertainty must stay explicit.                                             |
| Observation / result / finding                                     | no              | no                             | yes                                                                               | Needed for experiments, field work, marketing outcomes, and scientific results.                                  |
| Metric / baseline / threshold                                      | no              | no                             | yes                                                                               | Important for evaluating performance, quality, risk, and scientific measurements.                                |
| Risk / hazard / safety constraint                                  | no              | no                             | yes                                                                               | Distinct enough from ordinary workflow lessons to deserve explicit handling.                                     |
| Audience / stakeholder model                                       | no              | no                             | yes                                                                               | Broader than response style; useful for clients, reviewers, audiences, and collaborators.                        |
| Terminology / ontology / canonical definition                      | no              | no                             | yes                                                                               | Important once work spans multiple technical domains.                                                            |
| Entity profile                                                     | no              | no                             | yes                                                                               | Generalizes beyond "project facts" to clients, sites, campaigns, samples, instruments, and other named entities. |
| Exception / edge-case rule                                         | no              | no                             | yes                                                                               | Becomes necessary once a system knows enough rules to encounter structured exceptions.                           |
| Source trust / authority ranking                                   | no              | no                             | yes                                                                               | Needed when multiple notes, reports, labs, dashboards, or documents disagree.                                    |

## Implications

### What is already real

The current live system already has the beginnings of a domain-general memory
stack:

- preferences
- facts
- procedures
- lessons
- rules
- unmet needs

That is enough to prove a real generalized learning loop, but not enough to
cover the full contemplated cross-domain use case.

### What the older roadmap overemphasized

The older event-family list was useful for early software-oriented slices, but
it leaned too heavily toward repo-operating examples such as:

- API failures
- deployment constraints
- debugging preferences
- review preferences

Those remain valid examples, but they should no longer define the long-run
family taxonomy by themselves.

### What likely still needs to exist

If OpenClaw is meant to support software work plus broader domains such as
marketing, geology, and physical science, the remaining likely family set is:

1. decision + rationale
2. hypothesis / open question
3. observation / result / finding
4. metric / baseline / threshold
5. risk / hazard / safety constraint
6. audience / stakeholder model
7. terminology / ontology / canonical definition
8. entity profile
9. exception / edge-case rule
10. source trust / authority ranking

## Near-term roadmap impact

The near-term roadmap now has an explicit parity gate:

1. existing-family parity and genericization completion
2. reduced-profile self-improving capture integration
3. learned-guidance advisory planning

Only after those three steps should family expansion prefer domain-neutral families
from this matrix rather than replaying a software-only long tail.

## Suggested post-advisory family order

After family parity, self-improving capture, and advisory planning are live, the best
cross-domain expansion order is likely:

1. decision + rationale
2. observation / result / finding
3. terminology / ontology / canonical definition
4. entity profile
5. risk / hazard / safety constraint
6. metric / baseline / threshold
7. hypothesis / open question
8. audience / stakeholder model
9. source trust / authority ranking
10. exception / edge-case rule

This order is recommended because:

- decisions and findings create immediate value in many domains
- terminology and entity profiles reduce ambiguity early
- risk and metric families become more useful once decisions and findings
  exist
- hypotheses, audience models, source trust, and exceptions become more
  valuable once the base factual and procedural landscape is larger
