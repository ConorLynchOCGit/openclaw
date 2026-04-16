# Representative Pass-1 Model Comparison

- Generated at: 2026-04-14T03:57:43.875Z
- Request seed: 7
- Request timeout ms: 180000
- Max words per window: 1500
- Broader Tier 1 justified: no
- Proof admission justified: no

## docs/help/testing.md

- Control lane: pass1=openrouter/openai/gpt-5.4-nano, pass2=openrouter/openai/gpt-5.4-nano
- Comparison lane: pass1=openrouter/openai/gpt-5-mini, pass2=openrouter/openai/gpt-5.4-nano
- Control captured objects: 9 / 7
- Comparison captured objects: 9 / 9
- Control rejects: 0 / 0
- Comparison rejects: 0 / 0
- v2-candidate control counts=14/14 overlap=0
- v2-candidate comparison counts=19/13 overlap=1
- v2-candidate-repair control counts=14/14 overlap=0
- v2-candidate-repair comparison counts=19/13 overlap=1
- v2-canonicalization control counts=14/14 overlap=0
- v2-canonicalization comparison counts=17/13 overlap=0

## docs/gateway/protocol.md

- Control lane: pass1=openrouter/openai/gpt-5.4-nano, pass2=openrouter/openai/gpt-5.4-nano
- Comparison lane: pass1=openrouter/openai/gpt-5-mini, pass2=openrouter/openai/gpt-5.4-nano
- Control captured objects: 0 / 6
- Comparison captured objects: 9 / 8
- Control rejects: 1 / 0
- Comparison rejects: 0 / 0
- v2-candidate control counts=14/6 overlap=0
- v2-candidate comparison counts=10/9 overlap=0
- v2-candidate-repair control counts=10/6 overlap=1
- v2-candidate-repair comparison counts=10/9 overlap=0
- v2-canonicalization control counts=0/6 overlap=0
- v2-canonicalization comparison counts=10/9 overlap=0
- Control reject reasons: candidate headingPath ["Gateway protocol (WebSocket)","Device auth migration diagnostics"] does not exist in source window

## Conclusions

- Pass-1-on-mini materially reduced coarse instability versus nano by avoiding the protocol reject path and holding help/testing capture count steady.
- Pass-1-on-mini did not make candidate sets stable under the same seed; candidate overlap remained near zero across representative reruns.
- Canonicalization still drifted materially after the pass-1 upgrade because unstable candidate sets continued to feed pass 2.
- The lane remains blocked on candidate-layer determinism and is not ready for broader Tier 1 spend or proof admission.
