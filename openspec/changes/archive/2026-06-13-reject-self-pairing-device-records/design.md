## Context

The protocol identity layer creates paired-device records from a validated host-created pairing ticket and a viewer device id. The record is currently bounded to the ticket validity window, but it does not explicitly reject a viewer device id that is identical to the ticket's host device id.

## Goals / Non-Goals

**Goals:**

- Ensure paired-device records always represent distinct host and viewer devices.
- Fail closed before returning or using ambiguous self-pairing metadata.
- Keep denied self-pairing diagnostics bounded and free of raw device ids.
- Preserve the existing development pairing ticket lifecycle and non-authorizing pairing boundary.

**Non-Goals:**

- No production account model, device trust, MFA, RBAC, or authentication change.
- No change to relay forwarding, pairing ticket hashing, successful pairing ticket consumption, authorization grants, audit persistence, capture, input, clipboard, file transfer, diagnostics, installer, startup, services, tokens, or privilege behavior.

## Decisions

- Add the self-pairing guard in `createPairedDevice`, after parsing the source ticket and before constructing the paired-device record. This keeps the check in the protocol identity boundary used by relay and tests instead of duplicating it in callers.
- Compare the already schema-validated host device id from the ticket with the viewer device id after the viewer id passes the existing `PairedDeviceSchema` construction path. The rejection message will be static and will not include raw device ids.
- Keep relay pairing behavior otherwise unchanged: consuming a valid ticket still records a pair only when the host and viewer device ids are distinct, and pairing still grants no remote action.
- Preserve the static self-pairing rejection reason in relay denied-join responses and audit records, but force-redact the attempted viewer device id in the denied-join audit detail for this reason.

Alternatives considered:

- Allow self-pairing as a local development shortcut. Rejected because it weakens the two-party model and can hide integration mistakes in scripts or tests.
- Add the check only in the relay room layer. Rejected because `createPairedDevice` is the shared protocol API that should own paired-device invariants.

## Risks / Trade-offs

- Existing tests or development scripts that reuse one device id for both roles will fail closed. This is intentional and can be fixed by assigning distinct local device ids.
- The check is string equality, not production device identity proof. Production identity remains out of scope and still requires future OpenSpec work.
