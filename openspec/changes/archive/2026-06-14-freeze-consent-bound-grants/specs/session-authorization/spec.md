## ADDED Requirements

### Requirement: Immutable consent-bound grant snapshots
The shared consent-bound session grant validator SHALL return immutable grant snapshots after successful validation. Immutability MUST include the permission list and MUST prevent callers from widening permission scope, disabling host-approval requirement, or disabling visible-session requirement in place after validation.

#### Scenario: Valid grant snapshot cannot be widened
- **WHEN** a consent-bound grant is accepted with one or more valid permissions
- **THEN** the returned grant and its permission list are immutable
- **AND** callers cannot add another permission to that returned grant in place

#### Scenario: Consent flags cannot be weakened
- **WHEN** a consent-bound grant is accepted with `requiresHostApproval` and `visibleSessionRequired` set to true
- **THEN** callers cannot change those returned flags in place

#### Scenario: Immutable grant preserves existing rejection behavior
- **WHEN** a grant is expired, has empty permissions, duplicate permissions, unknown fields, or unavailable permission shapes
- **THEN** validation rejects the grant before returning any immutable snapshot
