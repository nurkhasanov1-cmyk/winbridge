## Implementation

- [x] 1. Replace direct signal payload byte-length serialization in `packages/protocol/src/messages.ts` with the shared canonical JSON encoder.
- [x] 2. Replace direct signal event byte-length serialization in `apps/agent-shell/src/runtime.ts` with the shared canonical JSON encoder.
- [x] 3. Add protocol coverage proving inherited `toJSON` hooks cannot alter oversized signal payload size enforcement.
- [x] 4. Add agent-shell coverage proving inherited `toJSON` hooks cannot alter redacted sent/received signal event byte lengths.
- [x] 5. Sync accepted requirements into `openspec/specs/session-broker/spec.md` and `openspec/specs/agent-shell-consent-workflow/spec.md`.

## Verification

- [x] 6. Run focused protocol and agent-shell tests for canonical signal byte lengths.
- [x] 7. Run `npm run check`.
- [x] 8. Run `npm test`.
- [x] 9. Run `npm run build`.
- [x] 10. Run `npm run openspec:validate`.
- [x] 11. Complete focused security review for signal payload validation and redacted event metadata.
