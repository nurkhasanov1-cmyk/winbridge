## Context

The agent shell has two relevant surfaces today:

- `getViewerStatus()` on managed viewer runtimes, which returns a read-only bounded local status snapshot.
- Host control prompt `status`, which already formats bounded host status output without invoking lifecycle controls.

There is no CLI path for a viewer process to print its local status snapshot. That makes future viewer UI wiring harder to exercise from the existing non-native shell.

## Goals / Non-Goals

**Goals:**

- Add `--viewer-status-after-ms <delay>` for viewer CLI runs.
- Validate the delay as an exact integer from `0` through `2147483647`.
- Reject the option on host runs before relay startup.
- Print a bounded local viewer status line from `runtime.getViewerStatus()`.
- Preserve all existing protocol, authorization, audit, signal, redaction, and consent gates.

**Non-Goals:**

- No screen capture, input injection, clipboard sync, file transfer, diagnostics collection, reconnect, or production viewer UI.
- No new protocol message, relay behavior, authentication behavior, audit persistence behavior, token behavior, installer/startup/service behavior, or privilege behavior.
- No host control or lifecycle command surface for viewers.

## Decisions

1. Use a delayed one-shot CLI option instead of an interactive viewer prompt.

   The existing development shell already uses delayed one-shot options for viewer signal probes and host workflow simulations. A one-shot status read keeps the feature deterministic in tests and avoids introducing a second stdin prompt or command parser.

   Alternative considered: an interactive viewer prompt with `status`. Rejected for this increment because it adds prompt lifecycle complexity without needing new consent behavior.

2. Allow status printing without a requested permission.

   `getViewerStatus()` is read-only local metadata, and inactive status is useful for verifying fail-closed flows. Requiring `screen:view` would incorrectly treat status inspection as a sensitive remote action.

   Alternative considered: require `screen:view` like the signal probe. Rejected because signal probes write protocol messages while status reads do not.

3. Reuse host status formatting shape with a viewer-specific prefix.

   Output will include only `state`, `visibleToHost`, `permissionCount`, and optional authorization id/status. It will not include peer ids, display names, raw protocol payloads, private reasons, tokens, pairing codes, signal payloads, or content data.

   Alternative considered: JSON output. Rejected for now because the existing host status surface is line-oriented and adequate for development CLI verification.

## Risks / Trade-offs

- [Risk] A future reader could mistake viewer status for authorization to perform remote actions. -> Mitigation: spec, docs, and implementation state that status printing is read-only and does not grant permissions, start signaling, or invoke host controls.
- [Risk] A delayed print might race with authorization lifecycle messages in ad hoc manual runs. -> Mitigation: the delay is explicit, bounded, and one-shot; tests can choose deterministic delays.
- [Risk] Status output could grow to include sensitive metadata. -> Mitigation: formatting is centralized and tests assert the bounded field set.
