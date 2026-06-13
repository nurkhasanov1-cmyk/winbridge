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

1. Define identity and device pairing model.
2. Design host consent and visible session UX.
3. Choose Windows native stack.
4. Add WebRTC signaling and media transport.
5. Add audit persistence.
6. Add Windows capture adapter.
7. Add Windows input adapter with revocation tests.
