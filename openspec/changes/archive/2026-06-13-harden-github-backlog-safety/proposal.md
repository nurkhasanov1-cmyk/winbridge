## Why

The GitHub setup guide still suggests early issues for Windows capture and input adapters without restating the required OpenSpec and security-review gates. That backlog wording can steer autonomous work toward high-risk native capabilities before identity, consent, audit, and transport safety foundations are ready.

## What Changes

- Replace the suggested initial issues with bootstrap-safe issues focused on identity/pairing, consent visibility, audit persistence, relay/protocol hardening, documentation gates, and CI/OpenSpec hygiene.
- Add explicit backlog guidance that Windows capture/input/native work belongs behind future OpenSpec design and security review.
- Update roadmap wording to make native capture/input dependent on consent, revocation, audit, and security review gates.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-orchestration`: require GitHub backlog guidance to sequence high-risk native work behind safety gates.

## Impact

- Touches documentation and OpenSpec process guidance only.
- Does not change runtime behavior, protocol contracts, relay routing, authentication, authorization, tokens, logs, installer behavior, startup behavior, services, native Windows APIs, capture, input, privilege elevation, or persistence.
- Safety impact: reduces the chance that autonomous backlog execution starts capture/input work before consent-first prerequisites and explicit review gates are satisfied.
- Non-goals: no new remote capability, no native capture/input implementation, no production identity/auth implementation, no installer/service/startup work, and no weakening of existing safety boundaries.
