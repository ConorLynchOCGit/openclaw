# X Manager Approval Queue Schema

Purpose:

- define the minimum operator-facing approval shape for the standalone X / Twitter Manager proof

Queue item fields:

- `account`
- `item_type`
- `draft_text`
- `core_objective`
- `risk_level`
- `reply_or_quote_target`
- `engagement_posture`
- `voice_rationale`
- `standing_to_post`
- `timing_sensitivity`
- `final_recommendation`

Field notes:

- `risk_level`: `low`, `medium`, or `high`
- `engagement_posture`: `lead`, `reply`, `quote_post`, or `do_not_engage`
- `reply_or_quote_target`: source post/account only when the item is a reply or quote-post candidate
- `standing_to_post`: concise read on whether the account has enough right to speak with authority
- `timing_sensitivity`: whether the item should move now, later, or only under a specific context window
- `final_recommendation`: one of `approve`, `revise`, `hold_for_timing`, or `drop`

Normalization rule:

- `engagement_posture` describes the move type
- `final_recommendation` describes the action now
- `hold_for_timing` must not appear as an `engagement_posture`
- `do_not_engage` means never worth it
- `hold_for_timing` means valid and in-lane, but not now

First-proof rule:

- every outbound candidate remains queued for manual approval before any publish path exists
