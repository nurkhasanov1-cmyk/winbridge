## Context

The agent shell remains a non-native protocol exerciser. Direct lifecycle controls already exist on the managed runtime and are covered by integration tests, but CLI users must pre-schedule timers to exercise most controls. The goal is to expose those existing direct controls through a bounded command prompt while keeping all consent and authorization decisions inside the current runtime gates.

## Design

1. **Add a CLI flag and argument validation.**
   - `--host-control-prompt true|false` defaults to `false`.
   - The flag is valid only for host runtimes.
   - It is rejected when `--host-consent-prompt true` is also enabled, because this increment keeps a single stdin reader active at a time.
   - Boolean parsing uses the same exact `true`/`false` semantics as existing CLI flags.

2. **Introduce a small prompt helper outside `runtime.ts`.**
   - The helper reads line-delimited commands from stdin and writes static instructions/results to stdout.
   - It accepts only exact command grammar:
     - `pause`
     - `resume`
     - `terminate`
     - `disconnect`
     - `revoke <canonical-permission>`
   - It validates revoke permissions with the shared `PermissionSchema` before calling the runtime.
   - It never logs or echoes the raw input line.

3. **Reuse managed runtime controls.**
   - Valid commands call `runtime.pause()`, `runtime.resume()`, `runtime.revokePermission(permission)`, `runtime.terminate()`, or `runtime.disconnect()`.
   - No control command constructs lifecycle protocol messages directly.
   - Existing runtime gates continue to enforce host role, active/paused visible authorization, expiration, terminal state, audit-first lifecycle sends, indicator updates, and peer disconnect state.

4. **Keep diagnostics secret-safe.**
   - Invalid commands print a static rejection message with no raw command text.
   - Runtime failures are formatted through the existing CLI diagnostic formatter, which exposes message byte length rather than raw exception text.
   - Prompt close/end events stop the helper without changing runtime authorization state.

## Alternatives

- **Allow controls and interactive consent on the same stdin.** Rejected for this increment because two independent readline consumers can misinterpret `approve`, `deny`, or lifecycle commands. A later host UI/controller can combine consent and session controls in one stateful interface.
- **Send protocol messages directly from the prompt.** Rejected because public workflow-authority sends are intentionally blocked; prompt commands must reuse the audited internal host workflow gates.
- **Echo invalid commands for usability.** Rejected because command lines may accidentally contain secrets copied from terminals or scripts.

## Risks And Mitigations

- Prompt is enabled on a viewer: reject during argument parsing.
- Operator sends a command before visible authorization: runtime direct control rejects before audit or socket writes.
- Operator sends malformed `revoke` permission: prompt rejects before runtime call and does not echo the raw token.
- Runtime error text contains private data: CLI diagnostic output redacts raw exception text.
- Stdin closes while session is active: prompt stops only the control surface and does not mutate runtime authorization.
