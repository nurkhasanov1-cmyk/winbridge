import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryAuditSink } from "@winbridge/audit-log";
import { describe, expect, it } from "vitest";
import { createRelayAuditSink, writeRelayAudit } from "./audit.js";

describe("relay audit", () => {
  it("redacts raw token and pairing code if a caller passes them by mistake", () => {
    const sink = new MemoryAuditSink();

    const record = writeRelayAudit(sink, {
      action: "relay.peer.join.denied",
      outcome: "denied",
      sessionId: "session-demo",
      peerId: "viewer-1",
      detail: {
        token: "secret-token",
        pairingCode: "123-456",
        role: "viewer"
      }
    });

    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("123-456");
    expect(record.detail).toMatchObject({
      token: "[REDACTED]",
      pairingCode: "[REDACTED]",
      role: "viewer"
    });
  });

  it("uses a file audit sink when WINBRIDGE_RELAY_AUDIT_LOG_PATH is configured", () => {
    const root = mkdtempSync(join(tmpdir(), "winbridge-relay-audit-"));
    const path = join(root, "relay-audit.jsonl");
    const sink = createRelayAuditSink({
      WINBRIDGE_RELAY_AUDIT_LOG_PATH: path
    });

    try {
      writeRelayAudit(sink, {
        action: "relay.peer.join.accepted",
        outcome: "accepted",
        sessionId: "session-demo",
        peerId: "host-1",
        detail: {
          token: "secret-token",
          role: "host"
        }
      });

      const content = readFileSync(path, "utf8");
      expect(content).toContain("relay.peer.join.accepted");
      expect(content).not.toContain("secret-token");
      expect(JSON.parse(content).detail).toMatchObject({
        token: "[REDACTED]",
        role: "host"
      });
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
