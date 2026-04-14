# Model Memory Large-Document Evidence

- Generated at: 2026-04-14T03:55:35.720Z
- Model: openrouter/openai/gpt-5.4-nano
- Candidate model: openrouter/openai/gpt-5-mini
- Request seed: 7
- Request timeout ms: 180000
- Database: model_memory
- Max words per window: 1500
- Rerun mode: first_run_only

## docs/gateway/protocol.md

- Line count: 257
- Purposes: reference_extraction, architecture_fact_extraction
- Classification: primary_large_source_proof_input
- First run captured objects: 8
- First run elapsed ms: 91476
- First run request seed: 7
- First run request timeout ms: 180000
- First run execution request count: 3
- First run resolved models: openai/gpt-5-mini-2025-08-07, openai/gpt-5.4-nano-20260317
- First run contract object counts: {"v2-candidate":[9],"v2-candidate-repair":[9],"v2-canonicalization":[9]}
- First run write decisions: {"write":8}
- Second run elapsed ms: 91476
- Second run request seed: 7
- Second run request timeout ms: 180000
- Second run execution request count: 3
- Second run resolved models: openai/gpt-5-mini-2025-08-07, openai/gpt-5.4-nano-20260317
- Second run contract object counts: {"v2-candidate":[9],"v2-candidate-repair":[9],"v2-canonicalization":[9]}
- Second run write decisions: {"write":8}
- Omission findings: none
- Provenance findings: all_captured_objects_have_structured_provenance
- Duplicate findings: rerun_skipped_after_no_persisted_objects, rerun_created_new_objects
- Rebuild findings: projection_hashes_stable_on_rerun, artifact_hashes_stable_on_rerun, derived_materialization_counts_stable_on_rerun, rebuild_rerun_skipped_after_no_persisted_objects

### First-run objects

- user/preference {"subject":"gateway websocket transport framing","operation":"connect","instruction":"Use WebSocket text frames carrying JSON payloads; ensure the first frame is a connect request."} scope={} provenance=Gateway protocol (WebSocket) > Transport
- user/rule {"subject":"connect handshake challenge signing","avoidAction":"Do not send connect without first receiving connect.challenge.","neededCapability":"Ability to generate the v2/v3 signature over the server nonce and include connect.params.device.nonce in the connect request.","recommendedAction":"Wait for connect.challenge, sign the server-provided nonce, and send a connect request including the signed nonce at connect.params.device.nonce."} scope={} provenance=Gateway protocol (WebSocket) > Handshake (connect)
- user/rule {"subject":"ws framing envelope shapes and idempotency","avoidAction":"Do not use framing shapes other than Request {type:'req', id, method, params}, Response {type:'res', id, ok, payload|error}, and Event {type:'event', event, payload, seq?, stateVersion?} or omit idempotency keys for side-effecting methods.","neededCapability":"Ability to construct messages using the required envelope fields and idempotency keys.","recommendedAction":"Use Request/Response/Event envelopes as specified and include idempotency keys for side-effecting methods."} scope={} provenance=Gateway protocol (WebSocket) > Framing
- project/fact {"value":"Role operator is the control plane client; role node is the capability host.","subject":"operator and node roles"} scope={} provenance=Gateway protocol (WebSocket) > Roles + scopes > Roles
- project/fact {"value":"Common operator scopes are operator.read, operator.write, operator.admin, operator.approvals, and operator.pairing.","subject":"common operator scopes"} scope={} provenance=Gateway protocol (WebSocket) > Roles + scopes > Scopes (operator)
- user/rule {"subject":"gateway token authentication and device token persistence/rotation","avoidAction":"Do not connect with a connect.params.auth.token that does not match OPENCLAW_GATEWAY_TOKEN (or --token), or the socket will be closed.","neededCapability":"Ability to persist the issued device token and call device.token.rotate/revoke when permitted.","recommendedAction":"If OPENCLAW_GATEWAY_TOKEN (or --token) is set, set connect.params.auth.token to match; after pairing, persist hello-ok.auth.deviceToken for future connects; for rotation/revocation use device.token.rotate and device.token.revoke with operator.pairing scope."} scope={} provenance=Gateway protocol (WebSocket) > Auth
- user/rule {"subject":"device identity, pairing approvals, and connect.challenge signing","avoidAction":"Do not omit device identity during connect except when gateway.controlUi.dangerouslyDisableDeviceAuth is enabled for break-glass use.","neededCapability":"Ability to derive stable device.id from a keypair fingerprint and sign the connect.challenge nonce; ability to handle pairing approvals when introducing new device IDs.","recommendedAction":"Include stable device identity (device.id from a keypair fingerprint) in connect for operator and node; ensure all connections sign the server-provided connect.challenge nonce; expect pairing approvals for new device IDs unless local auto-approval is enabled."} scope={} provenance=Gateway protocol (WebSocket) > Device identity + pairing
- user/rule {"subject":"exec approval flow and systemRunPlan requirement for host=node","avoidAction":"Do not submit an exec approval request for host=node without systemRunPlan; such requests are rejected.","neededCapability":"Ability to resolve exec approvals and supply systemRunPlan (canonical argv/cwd/rawCommand/session metadata) when host=node.","recommendedAction":"When exec requires approval, handle exec.approval.requested by calling exec.approval.resolve (requires operator.approvals scope); for host=node include systemRunPlan in exec.approval.request."} scope={} provenance=Gateway protocol (WebSocket) > Exec approvals
