## Why

The shared protocol `createPairingTicket` helper accepts caller-provided TTL and max-use values before producing host-created pairing material. Those values should be validated explicitly before timestamps and ticket records are created.

## What Changes

- Validate pairing ticket factory TTL values as exact bounded integer milliseconds.
- Validate pairing ticket factory max-use values as exact bounded integers from `1` through `10`.
- Preserve existing defaults when callers omit TTL or max-use values.
- Preserve `ttlMs: 0` support for immediate-expiration tests and relay denial scenarios.
- Non-goals: no production identity system, no durable pairing storage, no relay admission semantics change, no token/auth changes, no consent authorization changes, and no capture/input behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `identity-pairing`: pairing ticket creation must reject malformed or unsafe TTL and max-use values before creating ticket records.

## Impact

- Affected code: `packages/protocol/src/identity.ts`, identity tests, security documentation, and OpenSpec specs.
- Affected systems: shared pairing ticket construction used by relay and protocol tests.
- Safety impact: prevents invalid or overly permissive pairing material from being created by the shared protocol helper while preserving pairing as a prerequisite that does not grant remote action access.
- Security review: required because this touches identity/pairing material.
