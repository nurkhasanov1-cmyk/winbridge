## 1. Agent Shell Coverage

- [x] 1.1 Add a public-send integration test for access-key and SSH-key `signal.payload` rejection before socket write and sent-event emission.
- [x] 1.2 Add an inbound integration test for access-key and SSH-key `signal.payload` rejection before trusted received-event emission.
- [x] 1.3 Verify rejected public-send and inbound diagnostics omit raw access-key and SSH-key values from local events and logs.

## 2. Verification

- [x] 2.1 Run the focused agent-shell runtime integration test.
- [x] 2.2 Run strict OpenSpec validation for the change.
- [x] 2.3 Run the repository verification suite.
- [x] 2.4 Complete a security review of signal validation and local diagnostics impact.
