## 1. Implementation

- [x] 1.1 Add a relay helper that sends peer-facing `relay-error` responses only when the WebSocket is open and treats send failures as best-effort transport failures.
- [x] 1.2 Keep invalid-message audit and rate-limit accounting mandatory before optional `relay-error` delivery.
- [x] 1.3 Add focused integration coverage for a rejection path where the sender transport is closed during rejection handling.

## 2. Verification

- [x] 2.1 Run the focused relay integration test coverage for the new rejection race.
- [x] 2.2 Run strict OpenSpec validation for `harden-relay-error-transport-send`.
- [x] 2.3 Complete security review for relay rejection, audit, and abuse-control impact.
- [x] 2.4 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 2.5 Sync completed OpenSpec deltas into main specs and archive the change.
