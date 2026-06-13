## ADDED Requirements

### Requirement: Safe GitHub backlog sequencing
The repository SHALL keep GitHub setup and backlog guidance aligned with the current bootstrap safety scope. Suggested initial issues MUST prioritize identity/pairing, consent visibility, revocation, auditability, relay/protocol hardening, documentation gates, and CI/OpenSpec verification before native capture, input, installer, startup, service, or privilege work. Backlog guidance that mentions high-risk native or sensitive areas MUST state that those items require explicit OpenSpec design and security review before implementation.

#### Scenario: Initial backlog avoids premature native implementation
- **WHEN** maintainers use the repository GitHub setup guide to seed initial issues
- **THEN** the initial issue list prioritizes bootstrap-safe work before Windows capture, input, installer, startup, service, or privilege implementation

#### Scenario: Native work remains gated
- **WHEN** repository documentation mentions future Windows capture, input, native APIs, installer, startup, service, or privilege work
- **THEN** it states that implementation requires a future OpenSpec change and security review before coding

#### Scenario: Backlog guidance preserves safety boundaries
- **WHEN** suggested issues are reviewed for the current bootstrap scope
- **THEN** they MUST NOT imply hidden sessions, unattended access, stealth installation, unauthorized persistence, credential theft, keylogging, AV/EDR evasion, Windows prompt bypass, hidden capture, hidden input, or remote actions without explicit host consent
