## Context

`createAuditRecord` is the shared validation and redaction boundary for audit evidence. It rejects malformed fixed fields, canonicalizes JSON-compatible detail metadata, redacts sensitive details and top-level reasons, and returns the trusted record consumed by relay, agent-shell, console, file, and memory audit sinks.

The in-memory sink already deep-freezes records before retaining them, but the shared factory and other sink return values remain mutable. That leaves a gap where caller code can accidentally alter validated audit evidence after redaction.

## Goals / Non-Goals

**Goals:**

- Freeze every audit record returned by `createAuditRecord`.
- Freeze nested actor, target, and detail data, including arrays and redacted nested objects.
- Preserve existing validation, redaction, JSONL output, console output, and protocol audit-event behavior.
- Add focused tests proving trusted audit evidence cannot be mutated after creation.

**Non-Goals:**

- No new audit sink, persistence backend, protocol message type, permission, relay route, capture, input, clipboard, file transfer, diagnostics, installer, service, startup persistence, credential access, keylogging, evasion, or Windows prompt behavior.
- No broad TypeScript `readonly` migration.
- No change to persisted JSONL or console record shape.

## Decisions

1. Freeze after schema validation and redaction.

   The audit factory remains the single source of truth for accepted records. Freezing the final parsed record ensures callers receive a stable snapshot without changing validation or redaction ordering.

2. Deep-freeze the current JSON-compatible object graph.

   Top-level freeze would not protect nested `actor`, `target`, `detail`, or detail arrays. A local recursive freezer is sufficient because audit schemas already reject non-JSON and cyclic detail values.

3. Keep sink serialization unchanged.

   Console and file sinks should continue calling `createAuditRecord` and serializing with `stringifyJson`. `Object.freeze` changes runtime mutability only; it does not add fields or alter JSON output.

## Risks / Trade-offs

- Existing caller mutates audit records after creation -> Current repository search shows inspection-only use, and post-validation mutation is unsafe for audit evidence.
- Extra recursive freeze work -> Audit records are bounded and small; this is acceptable for development relay and shell safety.
- MemoryAuditSink still calls its local freezer -> Harmless double-freeze; it can be simplified later, but avoiding a cross-package refactor keeps this change focused.
