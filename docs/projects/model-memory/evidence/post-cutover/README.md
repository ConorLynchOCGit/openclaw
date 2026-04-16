# Post Cutover Review Artifacts

Use this directory for the first 72 hours after the `model-memory` production
flip.

Expected files:

- `day-0-cutover-verification.md`
- `day-1-sampled-review.md`
- `day-2-sampled-review.md`
- `day-3-sampled-review.md`

Each daily sampled review should contain:

- run timestamp
- commands used to refresh audit/review/proof artifacts
- exact 20-case basket
- one label per case:
  - `clear_duplicate_should_attach`
  - `clear_distinct_should_stay_distinct`
  - `true_ambiguity`
  - `unsafe_merge_risk`
  - `followup_needed_cross_kind`
- issue classification summary:
  - `hotfix`
  - `next_day_fix`
  - `backlog`
