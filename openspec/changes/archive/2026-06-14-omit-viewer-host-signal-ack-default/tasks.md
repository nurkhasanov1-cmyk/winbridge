## 1. CLI Runtime Handoff

- [x] 1.1 Update `AgentShellArgs` and host signal acknowledgement parsing so omitted viewer `--host-signal-probe-ack` is represented as absent configuration.
- [x] 1.2 Preserve host default acknowledgement behavior and explicit viewer host acknowledgement rejection.

## 2. Tests

- [x] 2.1 Update argument parser tests so viewer defaults omit host acknowledgement while explicit viewer host acknowledgement flags remain rejected.
- [x] 2.2 Add runtime handoff coverage proving parsed default viewer args can construct a managed runtime without host-only acknowledgement rejection.
- [x] 2.3 Keep direct runtime tests proving viewer `hostSignalProbeAck: false` and `true` remain rejected.

## 3. Review and Verification

- [x] 3.1 Review the CLI/runtime workflow change for consent boundary, host-only option enforcement, signal acknowledgement behavior, and abuse-resistance impact.
- [x] 3.2 Run focused agent-shell argument and runtime validation tests.
- [x] 3.3 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.4 Sync and archive the OpenSpec change after implementation is verified.
