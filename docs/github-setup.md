# GitHub Setup

The public GitHub remote is:

```text
https://github.com/nurkhasanov1-cmyk/winbridge.git
```

Local verification before pushing:

```powershell
npm run verify
```

GitHub Actions runs the same verification stages on Windows with Node `20.19.0`
and Node `24`, covering both the minimum supported runtime and the current
project runtime.

The CI workflow is verification-only: it requests read-only repository contents
permission and bounds each Windows matrix job with a timeout.

Release documentation gates:

- [Release readiness checklist](release-checklist.md)
- [Bootstrap privacy notice](privacy-notice.md)

## Initial GitHub Project Setup

- Confirm Actions are enabled.
- Add branch protection for `main`.
- Require CI before merge.
- Require explicit security review before merging PRs that touch capture, input,
  authentication, authorization, relay routing, tokens, logging/audit, installer
  behavior, startup behavior, privilege elevation, background services, or
  native Windows APIs.
- Require release documentation review before tagging or publishing release
  candidates, including the release checklist and privacy notice.
- Enable private vulnerability reporting if available.
- Create labels:
  - `area:protocol`
  - `area:relay`
  - `area:windows`
  - `area:security`
  - `area:openspec`
  - `type:bug`
  - `type:feature`
  - `type:security`

## Suggested Initial Issues

Seed the public backlog with bootstrap-safe issues first:

1. Define identity and device pairing requirements.
2. Design host consent, visible session, pause, revoke, and disconnect UX.
3. Specify audit persistence and redaction requirements for development and future production use.
4. Harden relay and protocol negative tests for malformed messages, disconnects, authorization lifecycle, and audit safety.
5. Design WebRTC signaling and media transport requirements without implementing capture or input paths.
6. Keep release checklist, privacy notice, OpenSpec validation, and CI verification current.
7. Prepare native Windows architecture notes that list consent, visibility, revoke, audit, and security-review gates.

Do not seed implementation issues for Windows capture, input injection, installer,
startup persistence, background services, privilege elevation, or native Windows
APIs until a dedicated OpenSpec change and security review define the consent,
visibility, authorization, revocation, audit, and abuse-case requirements for
that capability.
