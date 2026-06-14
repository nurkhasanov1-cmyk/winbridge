## Context

`parseArgs()` is the CLI validation boundary, and `createAgentShellRuntime()` is the direct managed runtime boundary. Runtime validation intentionally rejects `hostSignalProbeAck` whenever it is defined for a viewer runtime, because host signal probe acknowledgement is host-only workflow state.

The CLI parser currently returns `hostSignalProbeAck: false` for viewer defaults. That value is not user intent; it is an omitted host-only option represented as an explicit no-op. Passing parsed viewer args directly into the runtime can therefore look like invalid host workflow configuration even when the user supplied no host-only option.

## Goals / Non-Goals

**Goals:**

- Represent omitted viewer `--host-signal-probe-ack` as `undefined`.
- Keep explicit viewer `--host-signal-probe-ack true` and `--host-signal-probe-ack false` rejected before runtime startup.
- Keep host default and explicit host acknowledgement parsing unchanged.
- Add focused parser and runtime-handoff tests.

**Non-Goals:**

- No change to host acknowledgement sending behavior.
- No change to viewer signal probe sending behavior.
- No new signal payload, authorization approval, permission, capture, input, reconnect, installer, service, startup persistence, credential, keylogging, evasion, or Windows prompt behavior.
- No broad CLI argument model rewrite.

## Decisions

1. Change the parsed type to allow an omitted acknowledgement option.

   `AgentShellRuntimeOptions` already treats `hostSignalProbeAck === undefined` as omitted configuration. Aligning `AgentShellArgs` with that shape makes the CLI-to-runtime handoff reflect user intent.

2. Keep explicit viewer host-only options rejected at parse time.

   `assertNoViewerHostWorkflowOptions()` already rejects `--host-signal-probe-ack` for viewer invocations before parsing values. This preserves the fail-closed boundary for explicit host-scoped no-op flags.

3. Do not relax runtime validation.

   Direct runtime construction with `{ role: "viewer", hostSignalProbeAck: false }` remains invalid. The fix belongs in CLI parsing so direct runtime callers still cannot smuggle host workflow state into viewer runtimes.

## Risks / Trade-offs

- [Risk] Code that expects `parseArgs(["viewer"]).hostSignalProbeAck` to be `false` must handle `undefined`. -> Mitigation: the only runtime consumer already treats `undefined` as omitted and falsey.
- [Risk] Changing a parsed arg type can hide accidental host workflow defaults. -> Mitigation: explicit viewer `--host-signal-probe-ack false` remains rejected and covered by tests.
- [Risk] A future host workflow option could repeat this pattern. -> Mitigation: add a regression test for parsed viewer defaults flowing into runtime creation.
