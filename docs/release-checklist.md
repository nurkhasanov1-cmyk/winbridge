# Release Readiness Checklist

Use this checklist before publishing a release candidate, tagging a build, or promoting a GitHub artifact. The current project is a bootstrap foundation and is not production remote assistance software yet.

## Scope

- Confirm the release scope is documented in the changelog, PR, or release notes.
- Confirm every behavior-changing item has an OpenSpec change, archived spec update, and completed tasks.
- Confirm the release does not claim support for screen capture, input injection, unattended access, native Windows clients, installer behavior, startup persistence, services, production accounts, or production deployment unless those capabilities have been implemented through OpenSpec and reviewed.

## Consent And Visibility

- Host consent remains explicit before any session access.
- Active host sessions remain visible to the host.
- Host pause, revoke, terminate, and disconnect paths remain discoverable and tested where applicable.
- Viewer local leave paths close only the viewer connection and cannot invoke host lifecycle controls.
- Denied, expired, revoked, terminated, disconnected, invisible, or malformed authorization paths fail closed.

## Authorization And Audit

- Sensitive actions require authenticated or paired identity, active visible authorization, permission scope, and audit coverage appropriate to the implemented feature.
- New protocol or relay messages are schema-validated and bound to the current session, peer, role, and authorization where applicable.
- Audit records and diagnostics are secret-safe: no raw tokens, pairing codes, credentials, display names, private reasons, protocol payloads, signal payloads, keystrokes, screenshots, screen contents, clipboard contents, file-transfer contents, or diagnostics dumps.
- Audit write failure behavior is documented and tested for the affected component.

## Data Handling

- Review [Privacy Notice](privacy-notice.md) and update it when data handling changes.
- Confirm local development logs and audit files are documented as local artifacts controlled by the operator.
- Confirm no telemetry, production account data collection, crash upload, clipboard sync, file transfer, diagnostics collection, screen capture, or input capture is added without OpenSpec, consent, and security review.

## Installer And Native Boundaries

- Confirm the release does not add hidden sessions, stealth installation, unauthorized persistence, keylogging, AV/EDR evasion, Windows prompt bypass, hidden screen capture, or hidden remote input.
- Installer, startup, service, privilege, native Windows API, capture, and input changes require explicit OpenSpec design and security review before release.
- Uninstall, disable, revoke, and disconnect paths must be documented before any installer or native background component ships.

## Required Verification

Run locally before release:

```powershell
npm run check
npm test
npm run build
npm run openspec:validate
```

GitHub Actions must pass on Windows for Node `20.19.0` and Node `24`.

## Review Gates

- Security review is required for capture, input, authentication, authorization, relay routing, tokens, logging/audit, installer behavior, startup behavior, privilege elevation, background services, and native Windows APIs.
- Documentation review is required when user-visible workflow, data handling, privacy notice, release notes, or setup instructions change.
- Abuse-case review is required when a change could affect consent, visibility, revocation, disconnect, pairing, session authorization, audit, or diagnostics.
