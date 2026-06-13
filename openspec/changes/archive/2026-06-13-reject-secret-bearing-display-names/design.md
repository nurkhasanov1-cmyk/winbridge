## Overview

Add secret-bearing metadata rejection to the shared `DeviceDisplayNameSchema`. The existing schema is the common validation point for local device identity display names, `hello.displayName`, legacy `host-consent-required.viewerDisplayName`, agent-shell CLI `--name`, and direct runtime display-name validation.

## Security Rationale

Display names can be shown in host-facing prompts, appear in local runtime state, and transit protocol messages. They are usability metadata, not authentication or authorization material. Rejecting obvious secret-bearing strings at the shared schema prevents secrets from becoming trusted peer metadata without adding any access capability.

The change remains fail-closed:

- malformed display names are rejected before relay connection setup or socket writes in local agent-shell configuration paths;
- malformed inbound/public `hello` and legacy consent request display names are rejected by protocol schema validation before trusted events or consent workflow processing;
- rejection diagnostics remain generic and must not echo the raw display-name value.

## Non-Goals

- Do not introduce account authentication or production identity.
- Do not add capture, input, clipboard, file-transfer, diagnostics, remote shell, service, startup, installer, persistence, privilege elevation, or Windows prompt behavior.
- Do not parse arbitrary secrets out of display names; only reject obvious secret-bearing metadata using the existing shared detector.

## Implementation Notes

- Reuse `hasSecretBearingAuditMetadata(displayName, { includeKeyAssignments: false })` so common `Authorization: Bearer`, credential, pairing-code, diagnostics dump, and screen/clipboard/file content markers with values are rejected while ordinary names remain accepted.
- Keep error messages bounded: `Display name must not contain sensitive metadata`.
- Add tests that assert both rejection and absence of raw secret text in errors/events/logs where applicable.
