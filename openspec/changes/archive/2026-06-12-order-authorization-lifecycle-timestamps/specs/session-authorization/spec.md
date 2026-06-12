## ADDED Requirements

### Requirement: Ordered authorization lifecycle timestamps
The system SHALL reject session authorization records whose lifecycle timestamps contradict the consent-first transition order, before any remote action authorization check can use those records.

#### Scenario: Activation cannot precede approval
- **WHEN** a parsed authorization record carries an `activatedAt`, `pausedAt`, `resumedAt`, `revokedAt`, `terminatedAt`, or `expiredAt` timestamp earlier than its `approvedAt` timestamp
- **THEN** the schema rejects the record before it can represent remote assistance access

#### Scenario: Resume cannot precede the represented pause
- **WHEN** a parsed active authorization record carries both `pausedAt` and `resumedAt`
- **THEN** the `resumedAt` timestamp MUST NOT be earlier than the `pausedAt` timestamp

#### Scenario: Live authorization cannot carry fail-closed lifecycle timestamps
- **WHEN** a parsed `active` or `paused` authorization record carries `deniedAt`, `terminatedAt`, or `expiredAt`
- **THEN** the schema rejects the record before any remote action check can treat it as active authorization
- **AND** a live `revokedAt` timestamp remains valid only as prior partial permission-revocation history for remaining permissions

#### Scenario: Terminal lifecycle cannot precede live authorization history
- **WHEN** a parsed authorization record carries a final `revokedAt`, `terminatedAt`, or `expiredAt` timestamp together with prerequisite approval, activation, pause, resume, or partial-revocation timestamps
- **THEN** the terminal lifecycle timestamp MUST NOT be earlier than the prerequisite lifecycle timestamps it records

#### Scenario: Terminal records cannot carry conflicting terminal timestamps
- **WHEN** a parsed `revoked`, `terminated`, or `expired` authorization record carries another mutually exclusive fail-closed lifecycle timestamp
- **THEN** the schema rejects the record so terminal history cannot imply multiple incompatible final outcomes

#### Scenario: Ordered partial revocation history remains valid
- **WHEN** a visible active or paused authorization carries `revokedAt` for a prior partial permission revocation after approval and activation while retaining remaining permissions
- **THEN** the schema accepts the record only if the lifecycle timestamps remain ordered and action checks still fail closed for revoked or missing permissions
- **AND** later pause or resume timestamps for the remaining permission scope MUST NOT make the prior partial `revokedAt` invalid by itself
