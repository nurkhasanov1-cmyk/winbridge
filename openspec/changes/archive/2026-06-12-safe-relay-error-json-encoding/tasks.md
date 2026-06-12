## Implementation

- [x] 1. Replace the relay runtime's direct `JSON.stringify` relay-error response encoding with the shared canonical JSON encoder.
- [x] 2. Add relay integration coverage proving inherited `Object.prototype.toJSON` hooks cannot alter relay-error response bodies or rejection audit metadata.
- [x] 3. Sync the accepted relay-runtime requirement into `openspec/specs/relay-runtime/spec.md`.

## Verification

- [x] 4. Run focused relay integration tests for relay-error encoding and malformed-message rejection.
- [x] 5. Run `npm run check`.
- [x] 6. Run `npm test`.
- [x] 7. Run `npm run build`.
- [x] 8. Run `npm run openspec:validate`.
- [x] 9. Complete focused security review for the relay/networking boundary change.
