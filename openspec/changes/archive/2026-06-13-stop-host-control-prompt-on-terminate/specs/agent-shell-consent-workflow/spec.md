## ADDED Requirements

### Requirement: Host control prompt stops after successful terminate

The interactive host control prompt SHALL stop accepting further command input
after an exact `terminate` command successfully invokes the managed host
runtime termination control. Prompt shutdown MUST be local to the CLI prompt
and MUST NOT send additional protocol messages, invoke other lifecycle
controls, emit additional workflow audit events, reconnect peers, suppress
host visibility, grant permissions, start capture, send input, sync clipboard,
transfer files, expose diagnostics, install services, configure startup
persistence, collect credentials, hide the session from the host, or bypass
consent workflows. If the managed runtime termination control fails, the prompt
MUST report the sanitized error through the existing CLI error formatter and
continue accepting valid commands.

#### Scenario: Successful host terminate stops prompt

- **WHEN** host control prompt mode receives exact command `terminate`
- **AND** the managed runtime termination control returns successfully
- **THEN** the prompt stops accepting further command input
- **AND** prompt shutdown does not invoke status, pause, resume, revoke,
  disconnect, viewer leave, public runtime sends, or direct protocol
  construction

#### Scenario: Failed host terminate keeps prompt available

- **WHEN** host control prompt mode receives exact command `terminate`
- **AND** the managed runtime termination control rejects or throws
- **THEN** the prompt reports a sanitized CLI error
- **AND** the prompt remains available for later exact valid commands such as
  `status`
- **AND** output MUST NOT echo the raw command line or expose private reasons,
  protocol payloads, tokens, pairing codes, signal payloads, keystrokes,
  screenshots, screen contents, clipboard contents, file-transfer contents,
  diagnostics dumps, or input contents
