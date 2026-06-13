## 1. Runtime Status

- [x] 1.1 Add `socket-closed` to bounded viewer local inactive causes.
- [x] 1.2 Record local socket-close cause only for unexpected viewer socket close and clear stale viewer authorization metadata.
- [x] 1.3 Preserve explicit viewer leave, ordinary stop, and trusted remote host disconnect status semantics.

## 2. Output And Docs

- [x] 2.1 Ensure viewer status formatting prints the bounded `socket-closed` local cause when present.
- [x] 2.2 Update README and security model text for local socket-close viewer status.

## 3. Verification

- [x] 3.1 Add focused runtime and formatter tests for socket-close viewer status and no side effects.
- [x] 3.2 Run focused tests, typecheck, full test suite, build, and strict OpenSpec validation.
