# Security Model

## Product Boundary

WinBridge is for authorized remote assistance. It is not a covert administration tool.

Every sensitive action must satisfy:

1. Authenticated viewer.
2. Authorized session.
3. Explicit host approval.
4. Active visible host session.
5. Permission grant for that action.
6. Audit event.
7. Immediate host revocation path.

## Sensitive Actions

Sensitive actions include:

- Viewing the host screen.
- Moving pointer or sending keyboard input.
- Clipboard reads or writes.
- File transfer.
- Restart/reconnect behavior.
- Installer, service, startup, or privilege changes.
- Access to logs, tokens, diagnostics, or identity data.

## Identity and Pairing Foundation

The current bootstrap models local device identity and expiring pairing tickets. This is not production account authentication.

Pairing tickets:

- Are short lived.
- Store a per-ticket salt and salted hash of the pairing code, not the raw code.
- Have limited remaining uses.
- Do not grant screen, input, clipboard, file, or diagnostic permissions by themselves.

Protocol pairing ticket factory inputs are bounded before ticket creation. TTL values must be non-negative exact integer milliseconds within the safe timer range, and max-use values must be exact integers from 1 through 10.

The development relay creates pairing tickets when the host joins a room. Viewer joins must consume that host-created ticket before relay registration. Viewer-first, mismatched, expired, or consumed tickets are rejected before message forwarding.
Pairing ticket TTL and maximum-use configuration is bounded and parsed as exact integers; malformed, empty, partial, negative, non-finite, null, or out-of-range configured values fail before the relay accepts peers or creates host pairing tickets.
The development relay room is two-party only: one host and one viewer. A second live host or second live viewer with a different peer id is rejected before registration with bounded same-role denial metadata, and the original peer remains registered.
Live peer ids are exclusive within a development relay session room. Duplicate joins for an already registered peer id are rejected before peer replacement, host pairing-ticket refresh, viewer ticket consumption, paired-device recording, or message forwarding. The same peer id can join again only after disconnect cleanup removes the previous live peer.

When `WINBRIDGE_RELAY_SHARED_TOKEN` is configured, it must be non-blank, already trimmed, 1024 UTF-8 bytes or less, contain no ASCII control characters, and contain no Unicode bidi/zero-width formatting controls; peers without exactly one matching canonical lowercase `token` query parameter are rejected before room registration. Missing, duplicate, case-variant, padded, or wrong token parameters fail closed with bounded denial handling. Omitted token configuration keeps the relay in documented development mode, and token-bearing connections, including case-variant `token` query names, are rejected before room registration instead of being silently treated as authorized. Empty, whitespace-only, untrimmed, control-character, bidi/zero-width-control, non-string runtime, or oversized configured tokens fail before accepting peers.

Unexpected relay CLI startup/shutdown errors are metadata-only and expose generic error text plus safe message-byte diagnostics, not raw exception messages, stacks, tokens, pairing codes, protocol payloads, or local file paths.

Remote actions still require an explicit host-approved active session grant.

Protocol display-name metadata in local device identity, `hello`, and legacy host consent request messages must be non-blank, already trimmed, 120 characters or less, contain no ASCII control characters, and contain no Unicode bidi or zero-width formatting controls before components use it as peer or consent UI metadata. These local display names are usability metadata only and are not production account authentication.

## Session Authorization Lifecycle

Remote assistance authorization is deny-by-default:

1. `pending`: viewer requested access; no remote action is allowed.
2. `approved`: host consented to scoped permissions; no remote action is allowed until the session is visible.
3. `active`: host consent and visible host session state are both present; only granted unexpired permissions are allowed.
4. `paused`: host temporarily paused the visible session; permissions are retained but all remote action checks fail closed until host resume.
5. `denied`, `revoked`, `terminated`, `expired`: all remote action checks fail closed and the authorization record carries no permissions.

Pairing is only a prerequisite relationship. It never grants screen viewing, pointer input, keyboard input, clipboard access, file transfer, or diagnostics by itself.

Pending, approved, and denied authorization records must not report host visible active-session state. Host visibility begins at activation, not at request, approval, or denial.
Pending, approved, and denied authorization records must also reject lifecycle timestamps from impossible later states so audit history cannot imply hidden activation, pause, revocation, termination, or expiration.
Authorization record timestamps must be ordered so `updatedAt` is not earlier than `createdAt`, `expiresAt` is after `createdAt`, and lifecycle timestamps stay within the record's creation-to-update window.

Protocol messages for session authorization lifecycle are explicit:

- `session-authorization-request`: viewer asks for scoped permissions.
- `session-authorization-decision`: host approves or denies with grants, approval expiration, and reason where applicable. Denials carry no grants and no expiration.
- `session-authorization-state`: peers receive current authorization state and host visibility.
- `session-control`: host controls pause, resume, termination, or permission-revocation workflow intent for a named `authorizationId`.
- `permission-revoked`: host or authorized actor revokes a specific permission.

Receiving one of these messages is not enough to perform a sensitive action. Components must still evaluate the shared authorization state and requested permission.

Authorization-related protocol reason fields must be non-blank when required, already trimmed, 240 characters or less, contain no ASCII control characters, and contain no Unicode bidi or zero-width formatting controls before relay forwarding or agent workflow processing.

Permission revocation is a host-visible live-session transition. The shared authorization state machine accepts it only for visible, unexpired `active` or `paused` authorizations that currently include the permission. Revocation from pending, approved, denied, revoked, terminated, expired, invisible, or missing-permission states is rejected and must not create or restore access.

Session termination is also a host-visible live-session transition. The shared authorization state machine accepts it only for visible, unexpired `active` or `paused` authorizations. Termination from pending, approved, denied, revoked, terminated, expired, invisible, or expired live-session states is rejected and must not create or restore access.

Host approval can narrow the viewer's requested permission scope, but it must not expand it. The shared authorization state machine rejects empty approval grants, duplicate grants, and grants for permissions that were not present in the pending viewer request.

Consent-bound session grant records must carry a non-empty unique permission scope before any remote action authorization check can use them.

Terminal authorization records clear permission scope on denial, final revocation, termination, and expiration so fail-closed states cannot be reused as grant-bearing data by future adapters. Later expiration checks preserve existing terminal status, timestamp, and reason instead of rewriting denial, revocation, or termination history.

Pending authorization TTL inputs are bounded exact positive integer milliseconds before a session authorization record is created, preventing invalid or timer-unsafe consent windows.

## Development Shell Consent Simulation

The non-native agent shell can simulate consent messages for development:

- Runtime startup sends `join-session` first and defers `hello` until a relay recipient is available through a two-peer `relay-ready` message or an inbound peer `hello`.
- Viewer requests are explicit through requested permissions and a paired two-peer relay room.
- Host approval is not automatic.
- Host approval requires either static `--host-decision approve` or an opt-in `--host-consent-prompt true` response of exactly `approve` before the bounded host consent timeout expires.
- Interactive host consent denial requires exactly `deny`; timeout, invalid input, cancellation, prompt failure, viewer prompt mode, or prompt mode combined with static approval/denial fails closed before granting access.
- Active session state is withheld unless `--visible-session true` is set.
- Inbound `relay-ready` messages that identify a peer other than the local runtime peer are ignored before local `received` protocol events or presence and authorization request workflow handling; ignored foreign relay-ready input is logged only as redacted summary metadata.
- Inbound `hello` messages that identify the local runtime peer are ignored before local `received` protocol events or presence workflow handling; ignored self-hello input is logged only as redacted summary metadata.
- Inbound protocol messages for any session other than the local runtime session are ignored before local `received` protocol events or consent workflow handling; ignored cross-session input is logged only as redacted summary metadata.
- Inbound authorization requests that identify the local host peer as the viewer are ignored before local `received` protocol events or consent workflow handling; ignored self-authority input is logged only as redacted summary metadata.
- CLI parsing rejects unknown, duplicate option, duplicate requested permission, whitespace-padded requested permission, missing-value, blank, untrimmed, control-character, bidi/zero-width-control, or oversized token, relay URLs with embedded credentials or canonical/case-variant `token` query values, malformed relay URL, malformed protocol identifier, blank, untrimmed, control-character, bidi/zero-width-control, or oversized display name, malformed permission, malformed pairing, zero or unsafe `--authorization-ttl-ms`, zero, unsafe, or prompt-disabled `--host-consent-timeout-ms`, blank, untrimmed, control-character, bidi/zero-width-control, or oversized lifecycle reason, non-`true`/`false` `--visible-session` or `--host-consent-prompt` values, viewer prompt mode, and prompt mode combined with static approval/denial before starting the runtime.
- The managed runtime rejects malformed direct options for relay URL, relay URLs with embedded credentials or canonical/case-variant `token` query values, identifiers, blank, untrimmed, control-character, bidi/zero-width-control, or oversized display name, blank, untrimmed, control-character, bidi/zero-width-control, non-string, or oversized token, requested permissions, revoke permission, visible-session flag, host decision, invalid host decision providers, host decision providers on viewer runtimes, host decision providers combined with static approval/denial, providerless, zero, or unsafe host consent timeout, zero or unsafe authorization TTL, workflow timers, and blank, untrimmed, control-character, bidi/zero-width-control, or oversized decision/lifecycle reasons before opening a relay connection or sending any authorization decision. Relay shared tokens must use the dedicated `--token`/runtime token path and are bounded before connection setup.
- Authorization expiration simulation uses positive `--authorization-ttl-ms` values and only runs after visible activation.
- Pause/resume simulation requires explicit visible approval plus `--pause-after-ms` and optional `--resume-after-ms`.
- Permission revocation simulation requires explicit visible approval plus `--revoke-after-ms` and `--revoke-permission`; it sends a bound revoke-permission `session-control` before `permission-revoked`, follow-up authorization state, and audit messages.
- Session termination simulation requires explicit visible approval plus `--terminate-after-ms`.
- Host local disconnect simulation requires explicit visible approval plus `--disconnect-after-ms`. It closes the host relay connection and relies on the relay to emit `peer-disconnected`; the host shell must not send forged disconnect notices.
- Delayed revocation, termination, pause, resume, and disconnect simulations are suppressed if authorization expiration wins before their timers send.
- Local host `indicator` runtime events activate only after explicit visible approval, update for pause/resume/permission lifecycle, and deactivate on final revocation, termination, expiration, local disconnect, runtime stop, socket close, or trusted remote peer disconnect. Indicator events are local UI metadata only and do not grant permissions, start capture, send input, reconnect peers, suppress host visibility, or bypass consent workflows.
- Development `audit-event` messages are emitted for host decisions, visible activation, revocation, termination, expiration, pause, and resume using secret-safe metadata only.
- Host workflow audit records can be persisted locally with `--audit-log` or `WINBRIDGE_AGENT_AUDIT_LOG_PATH`.
- Local runtime `sent` events expose a schema-validated event-safe protocol view; audit-event details and raw pairing codes are redacted from the local event surface.
- Local runtime `sent` events for `signal` messages expose peer routing metadata and redacted payload summaries, not raw signal payload contents.
- Viewer-originated `signal` sends are rejected before socket write and local `sent` event emission unless the viewer has observed an active, visible, unexpired `screen:view` authorization state and the signal payload carries the matching `authorizationId`; blocked-send errors, events, and logs do not include raw signal payload contents or payload keys.
- Viewer-side authorization lifecycle state is bound to the host authority and authorization id from a decision addressed to the local viewer; inbound legacy consent decisions plus unbound, mismatched-authority, mismatched-authorization, denied-to-active, prior-connection state, permission revocation, and session-control messages are ignored before local `received` event emission and cannot grant or restore signal-send authorization. A same-authority `permission-revoked` confirmation after a bound revoke control is accepted only as fail-closed confirmation and does not restore access.
- Local runtime `received` events for `signal` messages expose peer routing metadata and redacted payload summaries, not raw signal payload contents.
- Inbound `signal` messages are ignored before local `received` event emission unless the runtime has active visible `screen:view` authorization and the signal payload carries the matching `authorizationId`; ignored-signal events and logs remain redacted to summary metadata.
- Host-originated public runtime `signal` sends are rejected before socket write and local `sent` event emission unless the host has locally emitted an active, visible, unexpired `screen:view` authorization state and the signal payload carries the matching `authorizationId`; blocked-send errors, events, and logs do not include raw signal payload contents or payload keys.
- Public runtime sends for workflow-authority messages (`host-consent-decision`, `session-authorization-decision`, `session-authorization-state`, `permission-revoked`, `session-control`, and `audit-event`) are rejected before socket write and local `sent` event emission; blocked-send errors, events, and logs do not include raw protocol payloads, private reasons, or audit details. Legacy `host-consent-required` remains a request message and must not grant access by itself.
- Inbound `signal` messages not addressed to the local runtime peer or identifying the local runtime peer as sender are ignored before local `received` protocol events or received signal summary logging; ignored signal routing input is logged only as redacted summary metadata.
- Inbound legacy consent decisions, authorization lifecycle messages, and audit workflow messages that identify the local runtime peer as the authority actor are ignored before local `received` protocol events or workflow summary logging; ignored self-authority workflow input is logged only as redacted summary metadata.
- Local runtime `sent` and `received` events redact protocol `reason` text while preserving consent workflow metadata.
- Local runtime `raw` events for non-protocol inbound text are metadata-only and expose redacted text plus safe byte-length diagnostics.
- Local runtime `closed` events for WebSocket disconnects are metadata-only and expose redacted reason text plus safe reason-byte diagnostics.
- Local runtime `error` events and runtime/socket error logs expose generic error text plus safe byte-length diagnostics, not raw exception messages.
- Unexpected CLI startup/shutdown errors expose generic error text plus safe byte-length diagnostics, while expected usage errors remain static usage text.
- Received message logs use summaries and must not contain raw protocol payloads or raw non-protocol message text.
- Workflow timer values are exact integer milliseconds bounded to the safe JavaScript timer delay range before runtime startup.

The shell never captures the screen, injects input, syncs clipboard, transfers files, installs services, or enables unattended access.
Agent-shell `hello` is presence metadata only. Its capability hints must be bounded, non-blank, and unique before use as peer metadata. They must not authorize a session, activate host visibility, grant permissions, start capture, send input, reconnect a peer, suppress visibility, or bypass consent workflows.

When the shell receives `peer-disconnected`, it records remote peer disconnected state for the current development session. Host-side delayed workflow simulations and direct managed runtime sends for that peer fail closed after this state and do not send later revoke, pause, resume, termination, expiration, authorization-state, session-control, permission-revoked, workflow audit-event, or direct public runtime messages.

When host local disconnect simulation closes the host relay connection, later delayed host workflow simulations for that connection fail closed and do not send authorization-state, session-control, permission-revoked, or workflow audit-event messages. This disconnect path does not grant permissions, start capture, send input, reconnect peers, suppress host visibility, or bypass consent workflows.

Inbound `peer-disconnected` messages that identify the local runtime peer are ignored before local `received` protocol events or remote peer disconnected state handling; ignored self-disconnect input is logged only as redacted summary metadata.

Peer disconnect state is not authorization. It must not approve a session, activate visibility, grant permissions, start capture, send input, reconnect a peer, suppress host visibility, or bypass consent workflows.

## Abuse Prevention Rules

The implementation must reject:

- Hidden screen capture.
- Hidden input.
- Keylogging.
- Credential collection.
- Unapproved startup persistence.
- Evasion of security software.
- Bypassing UAC or Windows consent prompts.
- Silent install/uninstall flows that hide the product from the host user.

## Development Relay Pairing

The relay stores salted hashed in-memory pairing tickets rather than raw pairing codes in peer state. Pairing ticket audit details may record safe metadata such as ticket presence, mismatch/expired/consumed booleans, and remaining use counts.

Pairing ticket salts are not secrets, but they prevent the same development pairing code from producing a stable hash across tickets.

Relay pairing audit details must not include raw pairing codes, shared tokens, credentials, protocol payloads, keystrokes, screenshots, screen contents, or full secrets.

This is not production identity. Production pairing needs durable storage, account binding, device trust, revocation, and reconnect semantics specified in a future OpenSpec change.

## Development Relay Abuse Protection

The development relay includes in-memory rate limiting for repeated invalid or unconfigured shared-token attempts and malformed or rejected protocol messages.

Relay startup validates environment-derived and injected local TCP ports before opening a listener. Malformed, partial, negative, fractional, non-finite, or out-of-range port values fail before network binding.

Rate-limit limit and window environment variables are parsed as canonical exact integers with no leading zeros. Limits must be from `1` through `1000000`; windows must be exact milliseconds from `1000` through `2147483647`. Empty, partial, fractional, negative, zero-limit, too-small-window, over-bound, or leading-zero values fail before the limiter is used.

The relay rejects inbound WebSocket messages larger than the development message size bound at the transport boundary or before protocol decoding. Oversized message rejection is audited through the invalid-message path without storing raw bytes or payload contents.

Protocol-facing machine identifiers such as session ids, peer ids, message ids, authorization ids, pairing ids, device ids, and audit event ids are bounded and restricted to a safe printable profile before relay registration, forwarding, authorization, pairing, or audit-related protocol use.

`signal` protocol messages are restricted to bounded JSON-compatible object payloads with a valid top-level `authorizationId`. Missing or malformed signal authorization ids are rejected before forwarding. Payloads containing functions, symbols, bigint, `undefined`, non-finite numbers, cyclic values, symbol-keyed properties, non-enumerable properties, accessor properties, sparse arrays, non-index array properties, or inherited `toJSON` hooks that would change encoded output are rejected before parsing, encoding, forwarding, or treating them as trusted signaling metadata. Encoding uses canonical JSON snapshots so inherited `toJSON` hooks cannot change wire payloads after validation. Payloads containing obvious token, credential, pairing-code, API-key, authorization-header, auth-header, cookie, private-key, keystroke, screenshot, screen-data, screen-content, clipboard-content, file-transfer content/data/bytes, diagnostics content/dump, or secret keys are also rejected before forwarding. Non-secret lifecycle identifiers such as `authorizationId` remain permitted.

Accepted relay forwarding audit may include message type, the validated protocol `messageId`, and safe recipient peer id and role. For `signal` messages, it may also include the non-secret `authorizationId`, but must not include raw protocol payloads, display names, private reasons, SDP, ICE candidates, payload markers, tokens, pairing codes, credentials, keystrokes, screenshots, screen contents, clipboard contents, file-transfer contents/data/bytes, diagnostics content/dumps, or full secrets.

After a peer registers, the relay rejects peer messages that attempt to replay `join-session`, forge relay-originated lifecycle messages, spoof another peer's sender or actor id, or use host/viewer role-bound authorization fields from the wrong registered role. Rejections use bounded reasons and do not expose raw pairing codes or protocol payloads to the remaining peer. Legacy `host-consent-decision` is host-originated grant-bearing data and must not be forwarded from a registered viewer.
Host-only workflow authority messages, including authorization state, permission revocation, session control, and development workflow audit events, must originate from the registered host role in the current two-party product scope.

Registered-peer messages also require a concrete remaining recipient in the two-party room. If an explicit target such as `signal.toPeerId` or an authorization decision `viewerPeerId` is present, it must match the remaining registered peer or the relay rejects the message before forwarding.

Malformed relay messages receive bounded secret-safe rejection reasons such as `Invalid relay message`. Parser details and raw malformed message contents are not returned to peers or stored in invalid-message audit reasons.

Rate-limit audit details are secret-safe:

- They may include booleans, remaining attempts, limits, and reset times.
- They must not include raw tokens, raw pairing codes, credentials, raw payload secrets, keystrokes, screenshots, or screen contents.

This is not production abuse protection. Production relay design must use durable or distributed controls.

## Development Relay Heartbeat

The development relay sends WebSocket heartbeat pings and terminates peers that miss the configured heartbeat timeout.
Heartbeat enabled configuration must use an exact canonical value: `true`, `false`, `yes`, `no`, `1`, or `0`. Empty, whitespace-only, untrimmed, case-variant, or unknown enabled flag values fail before the relay accepts peers or schedules heartbeat timers.
Heartbeat interval and timeout configuration uses exact bounded integer milliseconds; malformed, partial, zero, or timer-unsafe values fail before the relay accepts peers.

Heartbeat timeout audit details are secret-safe:

- They may include registration state, peer role, interval, and timeout values.
- They must not include raw shared tokens, raw pairing codes, credentials, raw payload secrets, keystrokes, screenshots, or screen contents.

Heartbeat checks only verify transport liveness. They must not grant permissions, approve sessions, start capture, send input, suppress host visibility, or bypass consent workflows.

This is not production liveness management. Production relay design must cover distributed presence, reconnect policy, and stale-session cleanup.

## Development Relay Disconnect Notices

The development relay sends a `peer-disconnected` protocol message to the remaining room peer when a registered host or viewer disconnects.

`peer-disconnected` is relay-originated. Peers must not be allowed to send forged disconnect notices through the relay; peer-originated copies are rejected before forwarding and audited as invalid relay messages.

Disconnect notices:

- Identify the disconnected peer id and role.
- Use bounded reason codes such as `peer-closed` for ordinary close cleanup and `heartbeat-timeout` for relay heartbeat timeout cleanup.
- Do not include raw WebSocket close reasons.
- Do not grant permissions, approve sessions, start capture, send input, reconnect peers, suppress host visibility, or bypass consent workflows.

Disconnect audit details may include the peer role, bounded reason code, notification target count, notification sent count, and notification failure count. They must not include raw shared tokens, raw pairing codes, credentials, raw payload secrets, keystrokes, screenshots, screen contents, or full secrets.

## Development Audit Files

The relay can write local development audit records to JSONL when `WINBRIDGE_RELAY_AUDIT_LOG_PATH` is configured.

The agent shell can write local host workflow audit records to JSONL when `WINBRIDGE_AGENT_AUDIT_LOG_PATH` or `--audit-log` is configured.

Configured relay or agent audit file paths must be non-blank, already trimmed, 1024 UTF-8 bytes or less, contain no ASCII control characters, and contain no Unicode bidi/zero-width formatting controls. Omitted audit paths keep the documented development fallback behavior, but empty, whitespace-only, untrimmed, control-character, bidi/zero-width-control, or oversized configured paths fail before relay peer acceptance or agent runtime startup without exposing the raw configured path value.

File audit records use the same schema validation and redaction as memory and console sinks. Audit detail metadata must be JSON-compatible; functions, symbols, bigint, `undefined`, non-finite numbers, cyclic values, own symbol-keyed properties, own non-enumerable properties, accessor properties, sparse arrays, non-index array properties, and detail keys containing ASCII control or Unicode bidi/zero-width formatting controls are rejected before records are returned, emitted, or persisted. Top-level audit reasons that contain obvious sensitive material are redacted before records are returned, emitted, or persisted. Write failures are surfaced to the caller instead of silently dropping records.

In-memory audit records are immutable after write so development test code cannot mutate retained audit history through returned records.
Audit action, reason, and target type metadata must be non-blank, bounded, already trimmed, contain no ASCII control characters, and contain no Unicode bidi/zero-width formatting controls before records or protocol audit events are emitted, forwarded, or persisted.

Development audit files must not contain raw tokens, raw pairing codes, credentials, API keys, authorization headers, auth headers, cookies, private keys, raw display names, private reason text, keystrokes, screenshots, screen contents, clipboard contents, file-transfer contents/data/bytes, diagnostics content/dumps, or full secrets.
Audit detail redaction preserves non-secret lifecycle identifiers and bounded reason metadata such as `authorizationId`, `reasonCode`, and `reasonConfigured` while redacting obvious authentication/session secret keys, display-name keys, private-reason keys, and remote-assistance content keys.

Agent shell audit files must not persist arbitrary received protocol payloads, raw display names, signal payloads, raw private reason text, screen contents, or input contents.

## Review Gates

### Design Gate

Before implementation, confirm:

- Threat model.
- Consent flow.
- Visible session indicator.
- Disconnect/revoke control.
- Audit events.
- Failure behavior.

### Implementation Gate

Every PR touching remote capability code must verify:

- Denied consent blocks the action.
- Revoked permission stops the action.
- Session timeout stops the action.
- Local disconnect terminates the action.
- Audit events are emitted.
- Audit details do not include raw tokens, raw pairing codes, credentials, keystrokes, screenshots, screen contents, clipboard contents, file-transfer contents/data/bytes, or diagnostics content/dumps.

### Release Gate

Before release, documentation must describe:

- What data is transmitted.
- Who can connect.
- How the host sees and stops a session.
- How to revoke access.
- How to uninstall.
- Where audit records live.
