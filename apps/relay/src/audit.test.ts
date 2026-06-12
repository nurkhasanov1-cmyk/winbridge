import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryAuditSink } from "@winbridge/audit-log";
import { PROTOCOL_IDENTIFIER_MAX_LENGTH } from "@winbridge/protocol";
import { describe, expect, it, vi } from "vitest";
import { createRelayAuditSink, writeRelayAudit } from "./audit.js";

describe("relay audit", () => {
  it("keeps readable relay actor ids for short peer ids", () => {
    const sink = new MemoryAuditSink();

    const record = writeRelayAudit(sink, {
      action: "relay.peer.join.accepted",
      outcome: "accepted",
      sessionId: "session-demo",
      peerId: "host-1"
    });

    expect(record.actor).toMatchObject({
      type: "relay",
      id: "development-relay:host-1"
    });
  });

  it("bounds relay actor ids for max-length peer ids", () => {
    const sink = new MemoryAuditSink();
    const peerId = "p".repeat(PROTOCOL_IDENTIFIER_MAX_LENGTH);

    const record = writeRelayAudit(sink, {
      action: "relay.peer.join.accepted",
      outcome: "accepted",
      sessionId: "session-demo",
      peerId
    });

    expect(record.actor.id).toMatch(/^development-relay:peer:[a-f0-9]{16}$/);
    expect(record.actor.id.length).toBeLessThanOrEqual(PROTOCOL_IDENTIFIER_MAX_LENGTH);
    expect(record.detail).toMatchObject({
      relayPeerIdBounded: true,
      relayPeerIdLength: PROTOCOL_IDENTIFIER_MAX_LENGTH
    });
    expect(record.detail.relayPeerIdHash).toEqual(expect.stringMatching(/^[a-f0-9]{64}$/));
    expect(JSON.stringify(record)).not.toContain(peerId);
  });

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

  it("uses console audit output when WINBRIDGE_RELAY_AUDIT_LOG_PATH is omitted", () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const sink = createRelayAuditSink({});

    try {
      writeRelayAudit(sink, {
        action: "relay.peer.join.accepted",
        outcome: "accepted",
        sessionId: "session-demo",
        peerId: "host-1"
      });

      expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining("[winbridge-audit]"));
    } finally {
      consoleLog.mockRestore();
    }
  });

  it("rejects malformed WINBRIDGE_RELAY_AUDIT_LOG_PATH values", () => {
    for (const auditLogPath of ["", "   ", " logs/relay-audit.jsonl", "logs/relay-audit.jsonl "]) {
      expect(() =>
        createRelayAuditSink({
          WINBRIDGE_RELAY_AUDIT_LOG_PATH: auditLogPath
        })
      ).toThrow("WINBRIDGE_RELAY_AUDIT_LOG_PATH must be non-blank and already trimmed");
    }
  });

  it("rejects untrimmed WINBRIDGE_RELAY_AUDIT_LOG_PATH without exposing raw path text", () => {
    const auditLogPath = " logs/relay-audit-private-marker.jsonl ";

    try {
      createRelayAuditSink({
        WINBRIDGE_RELAY_AUDIT_LOG_PATH: auditLogPath
      });
      throw new Error("Expected untrimmed relay audit log path to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain("relay-audit-private-marker");
      expect((error as Error).message).not.toContain(auditLogPath);
    }
  });
});
