# X Manager Workflow Outline

Purpose:

- define the minimum workflow for the first standalone X / Twitter Manager proof

Flow:

1. Opportunity filter

- default to `do_not_engage`
- only continue if the account can add signal, reframe, sharpen, or redirect attention usefully
- stop early for ragebait, low-value pile-ons, weak late replies, and beneath-the-account targets

2. Intake

- account
- objective
- format
- source post/topic
- sensitivity

3. Context assembly

- load account voice anchor
- load current conversation context
- load risk notes if sensitivity is high
- load recent phrasing to avoid
- load ratio state if relevant

4. Draft generation

- single
- thread
- quote-post response
- reply draft
- campaign cluster
- engagement prompt

5. Judgment pass

- should we engage?
- is this native to X?
- does this improve the account’s position?
- does this create unnecessary risk?
- is silence the stronger move?
- does the reply make the account look sharp or weak?

6. Approval packaging

- draft
- core objective
- risk level
- engagement posture
- voice rationale
- standing to post
- timing sensitivity
- final recommendation

Packaging rule:

- `engagement_posture` describes the move type:
  - `lead`
  - `reply`
  - `quote_post`
  - `do_not_engage`
- `final_recommendation` describes the action now:
  - `approve`
  - `revise`
  - `hold_for_timing`
  - `drop`
- keep `do_not_engage` distinct from `hold_for_timing`
- for a held original idea, the posture remains `lead` while the recommendation becomes `hold_for_timing`

7. Human decision

- approve
- revise
- hold_for_timing
- drop

First-proof exclusions:

- no autonomous posting
- no outbound connector requirement
- no paid-media or analytics loop in this phase
