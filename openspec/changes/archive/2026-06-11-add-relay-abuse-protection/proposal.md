## Why

The development relay validates messages and emits audit records, but repeated invalid token, join, or malformed-message attempts are not throttled. Adding local abuse protection reduces accidental or hostile relay spam before production identity exists.

## What Changes

- Add a `relay-abuse-protection` capability for in-memory rate limiting of failed relay attempts.
- Add a reusable sliding-window rate limiter in `apps/relay`.
- Apply rate limiting to invalid relay tokens and repeated invalid relay messages.
- Include rate-limit state in audit details without logging raw tokens or pairing codes.

Safety impact:

- This change touches relay/networking and audit paths.
- It does not add capture, input, clipboard, file transfer, installer, startup, services, privilege elevation, or unattended access.

## Capabilities

### New Capabilities
- `relay-abuse-protection`: Development relay throttling for repeated invalid token, join, and malformed-message attempts.

### Modified Capabilities

None.

## Impact

- Adds relay rate limiter code and tests.
- Updates relay connection/message failure handling.
- Updates security docs with development rate limiting notes.
