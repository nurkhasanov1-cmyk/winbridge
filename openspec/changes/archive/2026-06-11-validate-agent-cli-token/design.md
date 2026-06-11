## Context

The development relay can require an exact shared token for local/private sessions. The relay rejects blank configured shared-token values, but the agent shell currently stores `--token` directly from parsed options. A whitespace-only token can therefore be treated as configured client token material and placed into the relay connection URL before the relay rejects it or ignores it in development mode.

This change hardens the development CLI boundary. It is not production authentication and does not add accounts, refresh tokens, durable sessions, or authorization semantics.

## Goals / Non-Goals

**Goals:**

- Reject empty or whitespace-only `--token` values before runtime startup.
- Keep omitted `--token` as `undefined`.
- Preserve exact non-blank token values, including intentional internal, leading, or trailing spaces.
- Keep token values out of usage errors, logs, audit records, and OpenSpec artifacts.

**Non-Goals:**

- No production auth, token issuance, rotation, storage, or revocation.
- No relay protocol changes.
- No consent, permission, capture, input, installer, startup, service, or privilege changes.

## Decisions

1. Validate in `parseArgs`.

   Agent shell CLI parsing already rejects malformed or ambiguous user-supplied values before opening a WebSocket. Token validation belongs there so blank token material never reaches runtime URL construction. Alternative considered: validate inside runtime before mutating the relay URL. That would still leave CLI parsing inconsistent with other fail-fast configuration checks.

2. Reject only fully blank tokens and preserve exact non-blank values.

   Token material is exact-match shared secret material in the current development relay. Trimming non-blank tokens could silently change an intentionally configured value, so the parser only checks `trim().length > 0`. Alternative considered: normalize with trim. That is less predictable for secret material.

3. Use bounded usage errors.

   Invalid tokens map to `AgentShellUsageError`, which prints the usage string without echoing the supplied token value.

## Risks / Trade-offs

- Existing scripts that pass whitespace-only `--token` values will fail earlier. This is intended fail-closed behavior.
- Preserving leading/trailing spaces in non-blank token values can be visually confusing, but exact preservation is safer for secret material than implicit normalization.
