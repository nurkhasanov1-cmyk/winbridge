## ADDED Requirements

### Requirement: Viewer control prompt stops after successful disconnect

The interactive viewer control prompt SHALL stop accepting further command
input after an exact `disconnect` command successfully invokes the managed
viewer local leave control. Prompt shutdown MUST be local to the CLI prompt and
MUST NOT send additional protocol messages, invoke host lifecycle controls,
emit workflow audit events, reconnect peers, suppress host visibility, grant
permissions, start capture, send input, sync clipboard, transfer files, expose
diagnostics, install services, configure startup persistence, collect
credentials, hide the session from the host, or bypass consent workflows. If
the managed viewer local leave control fails, the prompt MUST report the
sanitized error through the existing CLI error formatter and continue accepting
valid commands.

#### Scenario: Successful viewer disconnect stops prompt

- **WHEN** viewer control prompt mode receives exact command `disconnect`
- **AND** the managed viewer local leave control returns successfully
- **THEN** the prompt stops accepting further command input
- **AND** prompt shutdown does not invoke status, host pause, host resume, host
  revoke, host terminate, host disconnect, public runtime sends, or direct
  protocol construction

#### Scenario: Failed viewer disconnect keeps prompt available

- **WHEN** viewer control prompt mode receives exact command `disconnect`
- **AND** the managed viewer local leave control rejects or throws
- **THEN** the prompt reports a sanitized CLI error
- **AND** the prompt remains available for later exact valid commands such as
  `status`
- **AND** output MUST NOT echo the raw command line or expose private reasons,
  protocol payloads, tokens, pairing codes, signal payloads, keystrokes,
  screenshots, screen contents, clipboard contents, file-transfer contents,
  diagnostics dumps, or input contents
