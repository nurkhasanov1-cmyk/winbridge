## MODIFIED Requirements

### Requirement: Explicit host decision
The host shell SHALL NOT approve or deny authorization requests unless an explicit valid host decision is configured, and the managed runtime SHALL reject malformed host decision values before starting a relay connection or sending authorization decisions.

#### Scenario: Host decision omitted
- **WHEN** the host shell receives an authorization request and no host decision is configured
- **THEN** it logs the request without sending an approval or denial

#### Scenario: Host approves request
- **WHEN** the host shell receives an authorization request and is explicitly configured to approve with visible session state
- **THEN** it sends an approved decision and active visible state update

#### Scenario: Malformed runtime host decision is rejected
- **WHEN** the managed runtime is configured with a host decision outside `none`, `approve`, or `deny`
- **THEN** it fails before connecting to the relay or sending any authorization decision
