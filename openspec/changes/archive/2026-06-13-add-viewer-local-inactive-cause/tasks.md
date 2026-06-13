## 1. Runtime Status

- [x] 1.1 Add bounded viewer local inactive cause state and expose it only after explicit viewer local leave.
- [x] 1.2 Ensure ordinary stop/start clears the local inactive cause and does not preserve left authorization metadata.

## 2. CLI And Prompt Output

- [x] 2.1 Include optional local inactive cause in one-shot viewer status formatting.
- [x] 2.2 Cover viewer control prompt status output for local inactive cause without invoking controls or public sends.

## 3. Verification And Docs

- [x] 3.1 Add focused runtime, formatter, and prompt tests for local leave inactive cause and no side effects.
- [x] 3.2 Update README and security model docs for local-only viewer inactive cause metadata.
- [x] 3.3 Run focused tests, typecheck, full test suite, build, and strict OpenSpec validation.
