## Context

Development components use `MemoryAuditSink` to collect audit records during tests and local runtime verification. The sink validates and redacts records through `createAuditRecord`, stores them in insertion order, and exposes them with `records()`.

The current array copy protects the internal array shape, but the returned audit record objects are still mutable references. For audit history, the safer default is immutable records after write.

## Goals / Non-Goals

**Goals:**

- Protect stored in-memory audit records from direct and nested mutation after write.
- Keep `MemoryAuditSink.records()` read-friendly for existing tests.
- Preserve existing schema validation, redaction, write order, and `clear()` behavior.

**Non-Goals:**

- No durable production audit store.
- No cryptographic audit log sealing or append-only file format.
- No changes to relay routing, authorization state, consent workflow, native capture, input, clipboard, file transfer, diagnostics, reconnect, installer, service, startup, privilege, evasion, or Windows prompt behavior.

## Decisions

- Deep-freeze the validated/redacted `AuditRecord` before storing it.
  Rationale: freezing preserves object identity and avoids adding clone serialization constraints to audit detail values.

- Reuse frozen records for `write()` return values and `records()` results.
  Rationale: callers can inspect records without copying cost, and mutation attempts fail instead of silently altering history.

- Keep `records()` returning a new array.
  Rationale: callers can sort or slice their view without affecting the sink's retained entry list.

## Risks / Trade-offs

- Existing callers that mutate returned audit records will fail after this change -> intended because audit history should be append-only after write.
- `Object.freeze` does not prevent mutation of exotic non-plain values that hide internal mutable state -> audit records are schema-normalized plain objects for current use, and this increment covers the practical record/detail structures used by WinBridge.
