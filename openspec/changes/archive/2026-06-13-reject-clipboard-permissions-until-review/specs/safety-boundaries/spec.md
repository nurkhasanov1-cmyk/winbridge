## ADDED Requirements

### Requirement: Clipboard access requires explicit capability review

The system SHALL keep clipboard read and clipboard write access out of the
current remote-assistance authorization vocabulary until a future OpenSpec
change and security review explicitly define legitimate consent-first clipboard
behavior, including host consent text, visible active-session indication,
revocation, audit events, abuse cases, and data-handling requirements.

#### Scenario: Clipboard permission shape is rejected

- **WHEN** a viewer, host, protocol message, CLI option, runtime option, authorization record, or consent-bound grant attempts to use `clipboard:read` or `clipboard:write`
- **THEN** the system rejects the permission before creating, granting, forwarding, restoring, revoking, or authorizing access
- **AND** rejection MUST NOT expose clipboard contents, start capture, send input, reconnect peers, suppress host visibility, or bypass consent workflows
