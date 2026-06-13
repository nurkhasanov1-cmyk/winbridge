## ADDED Requirements

### Requirement: Diagnostics access requires explicit capability review

The system SHALL keep diagnostics access out of the current remote-assistance
authorization vocabulary until a future OpenSpec change and security review
explicitly define legitimate consent-first diagnostics behavior, including host
consent text, visible active-session indication, revocation, audit events,
redaction, abuse cases, and data-handling requirements.

#### Scenario: Diagnostics permission shape is rejected

- **WHEN** a viewer, host, protocol message, CLI option, runtime option, host control command, authorization record, or consent-bound grant attempts to use `diagnostics:view`
- **THEN** the system rejects the permission before creating, granting, forwarding, restoring, revoking, controlling, or authorizing access
- **AND** rejection MUST NOT expose diagnostics contents or dumps, start capture, send input, reconnect peers, suppress host visibility, or bypass consent workflows
