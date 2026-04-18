# X Manager Approval Policy

- every output is draft-only
- every output remains manual-approval only
- no autonomous posting
- no connector-triggered posting
- package each candidate with:
  - account
  - item_type
  - draft_text
  - core_objective
  - risk_level
  - reply_or_quote_target
  - engagement_posture
  - voice_rationale
  - standing_to_post
  - timing_sensitivity
  - final_recommendation

- normalize `engagement_posture` to one of:
  - `lead`
  - `reply`
  - `quote_post`
  - `do_not_engage`

- normalize `final_recommendation` to one of:
  - `approve`
  - `revise`
  - `hold_for_timing`
  - `drop`

- keep `voice_rationale` compact but explicit:
  - why this posture beats silence
  - why the line is in-lane
  - why now or not now, when timing matters

- quote-post terseness rule:
  - quote-post drafts should be one notch shorter and harder than reply drafts unless high-stakes context genuinely requires more explanation

- hold distinction:
  - `do_not_engage` = never worth it
  - `hold_for_timing` = valid idea or in-lane move, but not now
  - for a held original idea, `engagement_posture` must still describe the move type, usually `lead`
  - `hold_for_timing` is recommendation only and must never appear in `engagement_posture`

- canonical hold example:
  - valid original idea worth saving for later
  - `engagement_posture: lead`
  - `final_recommendation: hold_for_timing`
