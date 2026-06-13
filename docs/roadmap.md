# Roadmap

## Phase 0: Bootstrap

- OpenSpec workflow.
- Safety boundary.
- Protocol schemas.
- Development relay.
- Non-native agent shell.
- GitHub CI and templates.

## Phase 1: Identity and Consent

- Account or local-device identity model.
- Pairing code lifecycle.
- Host consent UI.
- Session indicator.
- Permission grant and revoke model.
- Audit persistence.

## Phase 2: Media Transport

- WebRTC signaling.
- Screen frame transport design after consent, authorization, visibility, revoke, and audit gates are specified.
- Bandwidth and quality controls.
- Pause/resume.
- Timeout and reconnect behavior.

## Phase 3: Windows Native Host

- Windows capture adapter after a dedicated OpenSpec design and security review.
- Visible host status surface.
- Disconnect hotkey or tray control.
- Permission enforcement.
- Installer without hidden behavior, unauthorized persistence, or service startup surprises.

## Phase 4: Windows Viewer

- Viewer UI.
- Viewer local status surface.
- Remote pointer/keyboard UX after a dedicated OpenSpec design and security review specify host-granted input permission, revocation, and audit gates.
- Permission request UX.
- Session logs.

## Phase 5: Hardening

- Threat model update.
- E2E tests.
- Abuse-case tests.
- Security review.
- Signed builds.
- Production relay deployment.
