## 1. Relay Forwarding

- [x] 1.1 Reorder registered-peer forwarding so accepted `relay.message.forwarded` audit writes before recipient delivery.
- [x] 1.2 Preserve successful forwarding output, routing checks, bounded relay-error behavior, rejection audit/rate-limit accounting, pairing, token, heartbeat, and authorization validation semantics.

## 2. Regression Coverage

- [x] 2.1 Add relay integration coverage proving accepted-forward audit failure blocks recipient delivery and emits only bounded secret-safe diagnostics/audit metadata.
- [x] 2.2 Run focused relay integration tests for successful forwarding and accepted-forward audit failure.

## 3. Documentation

- [x] 3.1 Update security documentation to state accepted relay forwarding audit is written before recipient delivery and failure blocks the forwarded message.

## 4. Review and Validation

- [x] 4.1 Perform security review for relay routing/logging impact and confirm no capture, input, auth semantics, installer, startup, service, token issuance, privilege, or native Windows behavior changed.
- [x] 4.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 4.3 Archive the completed OpenSpec change after implementation and verification.
