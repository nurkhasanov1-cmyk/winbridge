## Context

`host-consent-required` and `host-consent-decision` are legacy protocol messages that remain part of the shared protocol envelope. The newer session authorization messages already enforce stricter permission-scope invariants, but legacy host-consent messages can still parse malformed consent payloads.

## Goals / Non-Goals

**Goals:**

- Make legacy host-consent request and decision messages deny malformed permission scopes at schema parse and encode time.
- Align legacy consent behavior with the newer session authorization message safety posture.
- Preserve valid legacy approved and denied decisions for compatibility.

**Non-Goals:**

- No new remote assistance capability.
- No new screen capture, input, clipboard, file transfer, installer, service, startup, privilege, or native Windows behavior.
- No cross-message subset validation; state-machine authorization remains responsible for matching a grant to a prior request.

## Decisions

- Harden the existing legacy schemas instead of removing the messages. Removal would be a broader breaking protocol cleanup, while schema hardening closes the immediate permissive path safely.
- Require non-empty unique requested permissions in `host-consent-required`. A consent prompt without requested scope is ambiguous and should not be processed.
- Require approved host-consent decisions to carry unique non-empty granted permissions. Denied decisions must carry no grants and must include a reason.
- Reuse the existing protocol permission uniqueness helper so legacy and session authorization messages fail consistently.

## Risks / Trade-offs

- Legacy fixtures with empty permissions will fail. Mitigation: tests will document the stricter deny-by-default shape.
- The schema still cannot prove the approved grant is a subset of a specific request. Mitigation: this change only validates local wire invariants; cross-message authorization belongs in state-machine helpers.
- Keeping legacy messages may invite future use. Mitigation: architecture docs already point future clients to `session-authorization-*`; this hardening only makes the remaining legacy surface safer.
