## Context

The shared audit layer redacts sensitive values by key name before records are returned, emitted to console, persisted to JSONL, or encoded in protocol `audit-event` details. Keylogging is prohibited by the project safety boundary, and existing redaction already covers `keystroke` keys, but common key names such as `keylog` and `keylogger` are not currently part of the sensitive vocabulary.

## Goals / Non-Goals

**Goals:**

- Treat `keylog` and `keylogger` audit detail keys as sensitive input/keylogging content.
- Apply the new redaction recursively through the existing shared audit redaction path.
- Verify memory/protocol redaction and file audit persistence do not expose raw keylogging markers.

**Non-Goals:**

- No keylogging, input capture, screen capture, clipboard, file transfer, diagnostics collection, installer, startup, service, privilege, relay routing, or authentication change.
- No broad free-text audit reason heuristic change in this increment.
- No redaction of safe operational counters or lifecycle identifiers unless their key name matches the sensitive vocabulary.

## Decisions

- Add `keylog` and `keylogger` to the existing sensitive audit detail key vocabulary instead of creating a separate redaction path. This keeps memory, console, file, and protocol audit-event behavior consistent.
- Cover both exact and decorated names through the existing normalized substring matching, so names such as `rawKeylog`, `keyloggerOutput`, or `nested_keylog_data` are redacted.
- Keep non-keylogging operational metadata unchanged, preserving audit usefulness for investigation.

## Risks / Trade-offs

- [Risk] Over-redaction could hide useful metadata if a benign field happens to include `keylog`. -> Mitigation: keylogging is explicitly prohibited and keylog-like field names are unsafe in this domain; tests preserve unrelated metadata.
- [Risk] Only detail keys are covered, not arbitrary string values under safe keys. -> Mitigation: this change closes the key-name gap without introducing noisy free-text heuristics; top-level reason redaction remains separate.
- [Risk] Audit behavior is security-sensitive. -> Mitigation: run focused audit tests, full verification, OpenSpec validation, and focused security review before archive/release.
