## ADDED Requirements

### Requirement: File transfer requires explicit capability review

The system SHALL keep file-transfer access out of the current remote-assistance
authorization vocabulary until a future OpenSpec change and security review
explicitly define legitimate consent-first file-transfer behavior, including
host consent text, visible active-session indication, revocation, audit events,
path and content redaction, abuse cases, and data-handling requirements.

#### Scenario: File-transfer permission shape is rejected

- **WHEN** a viewer, host, protocol message, CLI option, runtime option, authorization record, or consent-bound grant attempts to use `file-transfer`
- **THEN** the system rejects the permission before creating, granting, forwarding, restoring, revoking, or authorizing access
- **AND** rejection MUST NOT expose file contents, transfer files, start capture, send input, reconnect peers, suppress host visibility, or bypass consent workflows
