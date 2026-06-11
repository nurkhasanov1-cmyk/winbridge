import { MemoryAuditSink } from "@winbridge/audit-log";
import {
  type AuditRecord,
  createMessageBase,
  encodeProtocolEnvelope,
  type ProtocolEnvelope
} from "@winbridge/protocol";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket, { type ClientOptions, type RawData } from "ws";
import { SlidingWindowRateLimiter } from "./rate-limit.js";
import {
  createRelayPairingConfig,
  createRelayPortConfig,
  createRelayRuntime,
  createRelaySharedTokenConfig,
  type RelayRuntime,
  type RelayRuntimeOptions
} from "./server.js";

const runtimes: RelayRuntime[] = [];
const silentLogger = {
  log: () => undefined,
  warn: () => undefined
};

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.stop()));
});

describe("relay runtime integration", () => {
  it("starts on an ephemeral port and stops cleanly", async () => {
    const runtime = await startRuntime();

    expect(runtime.url()).toMatch(/^ws:\/\/127\.0\.0\.1:\d+$/);
  });

  it("accepts host and viewer joins and forwards protocol messages", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const host = await openSocket(runtime.url());
    const viewer = await openSocket(runtime.url());

    host.send(joinMessage("session-demo", "host-1", "host", "123-456"));
    expect(await waitForProtocolMessage(host, (message) => message.type === "relay-ready")).toMatchObject({
      type: "relay-ready",
      peerId: "host-1",
      roomSize: 1
    });

    viewer.send(joinMessage("session-demo", "viewer-1", "viewer", "123-456"));
    expect(
      await waitForProtocolMessage(viewer, (message) => message.type === "relay-ready")
    ).toMatchObject({
      type: "relay-ready",
      peerId: "viewer-1",
      roomSize: 2
    });

    host.send(
      encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "signal",
        fromPeerId: "host-1",
        toPeerId: "viewer-1",
        payload: { kind: "test-signal" }
      })
    );

    expect(await waitForProtocolMessage(viewer, (message) => message.type === "signal")).toMatchObject({
      type: "signal",
      fromPeerId: "host-1",
      payload: { kind: "test-signal" }
    });

    const auditRecords = auditSink.records().filter(
      (record) => record.action === "relay.peer.join.accepted"
    );
    expect(JSON.stringify(auditRecords)).not.toContain("123-456");
  });

  it("rejects unsafe signal payloads before forwarding", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const { host, viewer } = await joinPairedSession(runtime);

    host.send(
      JSON.stringify({
        ...createMessageBase("session-demo"),
        type: "signal",
        fromPeerId: "host-1",
        toPeerId: "viewer-1",
        payload: {
          kind: "offer",
          authorizationId: "authz-demo",
          nested: {
            apiKey: "raw-api-key",
            rawAuthorizationHeader: "Authorization: Bearer raw-token",
            sessionCookie: "sid=raw-cookie",
            privateKey: "raw-private-key",
            pairingCode: "123-456"
          }
        }
      })
    );

    const relayError = await waitForJsonMessage(host, (message) => message.type === "relay-error");
    expect(String(relayError.reason)).toContain("Signal payload must not contain sensitive");
    await expectNoProtocolMessage(viewer, (message) => message.type === "signal");

    const rejected = await waitForAuditRecord(
      auditSink,
      (record) =>
        record.action === "relay.message.rejected" &&
        typeof record.reason === "string" &&
        record.reason.includes("Signal payload must not contain sensitive")
    );
    expect(rejected).toMatchObject({
      action: "relay.message.rejected",
      outcome: "failed",
      sessionId: "session-demo",
      detail: {
        registered: true
      }
    });
    expect(JSON.stringify(rejected)).not.toContain("raw-api-key");
    expect(JSON.stringify(rejected)).not.toContain("raw-token");
    expect(JSON.stringify(rejected)).not.toContain("raw-cookie");
    expect(JSON.stringify(rejected)).not.toContain("raw-private-key");
    expect(JSON.stringify(rejected)).not.toContain("123-456");
  });

  it("rejects oversized relay messages before forwarding", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const { host, viewer } = await joinPairedSession(runtime);
    const oversizedMessage = JSON.stringify({
      ...createMessageBase("session-demo"),
      type: "signal",
      fromPeerId: "host-1",
      toPeerId: "viewer-1",
      payload: {
        kind: "oversized-offer-marker",
        sdp: "x".repeat(70 * 1024)
      }
    });

    expect(Buffer.byteLength(oversizedMessage, "utf8")).toBeGreaterThan(64 * 1024);

    host.send(oversizedMessage);

    await waitForClose(host);
    await expectNoProtocolMessage(viewer, (message) => message.type === "signal");

    const rejected = await waitForAuditRecord(
      auditSink,
      (record) =>
        record.action === "relay.message.rejected" &&
        record.reason === "Relay message exceeds 65536 bytes"
    );
    expect(rejected).toMatchObject({
      action: "relay.message.rejected",
      outcome: "failed",
      sessionId: "session-demo",
      detail: {
        registered: true
      }
    });
    expect(JSON.stringify(rejected)).not.toContain("oversized-offer-marker");
  });

  it("returns bounded relay errors for malformed messages", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const { host, viewer } = await joinPairedSession(runtime);

    host.send("not-json secret-token 123-456");

    expect(await waitForJsonMessage(host, (message) => message.type === "relay-error")).toEqual({
      type: "relay-error",
      reason: "Invalid relay message"
    });
    await expectNoProtocolMessage(viewer, (message) => message.type === "signal");

    const rejected = await waitForAuditRecord(
      auditSink,
      (record) => record.action === "relay.message.rejected" && record.reason === "Invalid relay message"
    );
    expect(rejected).toMatchObject({
      action: "relay.message.rejected",
      outcome: "failed",
      sessionId: "session-demo",
      detail: {
        registered: true
      }
    });
    expect(JSON.stringify(rejected)).not.toContain("secret-token");
    expect(JSON.stringify(rejected)).not.toContain("123-456");
    expect(JSON.stringify(rejected)).not.toContain("not-json");
  });

  it("rejects malformed join identifiers without reflecting them", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const cases: Array<{
      name: string;
      unsafeValue: string;
      buildMessage: () => Record<string, unknown>;
    }> = [
      {
        name: "session id",
        unsafeValue: "session secret-token 123-456",
        buildMessage: () => ({
          ...createMessageBase("session secret-token 123-456"),
          type: "join-session",
          peerId: "viewer-1",
          role: "viewer",
          pairingCode: "123-456"
        })
      },
      {
        name: "message id",
        unsafeValue: "message secret-token 123-456",
        buildMessage: () => ({
          ...createMessageBase("session-demo"),
          messageId: "message secret-token 123-456",
          type: "join-session",
          peerId: "viewer-1",
          role: "viewer",
          pairingCode: "123-456"
        })
      },
      {
        name: "peer id",
        unsafeValue: "viewer secret-token 123-456",
        buildMessage: () => ({
          ...createMessageBase("session-demo"),
          type: "join-session",
          peerId: "viewer secret-token 123-456",
          role: "viewer",
          pairingCode: "123-456"
        })
      },
      {
        name: "device id",
        unsafeValue: "device secret-token 123-456",
        buildMessage: () => ({
          ...createMessageBase("session-demo"),
          type: "join-session",
          peerId: "viewer-1",
          role: "viewer",
          pairingCode: "123-456",
          deviceIdentity: {
            deviceId: "device secret-token 123-456",
            displayName: "Viewer laptop",
            platform: "windows",
            trustLevel: "local-dev",
            createdAt: new Date().toISOString()
          }
        })
      }
    ];

    for (const { buildMessage, name, unsafeValue } of cases) {
      const socket = await openSocket(runtime.url());
      const auditStart = auditSink.records().length;

      socket.send(JSON.stringify(buildMessage()));

      expect(
        await waitForJsonMessage(socket, (message) => message.type === "relay-error")
      ).toEqual({
        type: "relay-error",
        reason: "Invalid relay message"
      });

      const rejected = await waitForAuditRecord(
        auditSink,
        (record) => record.action === "relay.message.rejected" && record.reason === "Invalid relay message",
        auditStart
      );
      expect(rejected, name).toMatchObject({
        action: "relay.message.rejected",
        outcome: "failed",
        detail: {
          registered: false
        }
      });
      expect(JSON.stringify(rejected), name).not.toContain(unsafeValue);
      expect(JSON.stringify(rejected), name).not.toContain("secret-token");
      expect(JSON.stringify(rejected), name).not.toContain("123-456");
      socket.close();
    }

    expect(auditSink.records().some((record) => record.action === "relay.peer.join.accepted")).toBe(false);
  });

  it("notifies the viewer when the host disconnects", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const { host, viewer } = await joinPairedSession(runtime);

    host.close();

    expect(
      await waitForProtocolMessage(viewer, (message) => message.type === "peer-disconnected")
    ).toMatchObject({
      type: "peer-disconnected",
      sessionId: "session-demo",
      peerId: "host-1",
      role: "host",
      reasonCode: "peer-closed"
    });

    const disconnect = await waitForAuditRecord(
      auditSink,
      (record) => record.action === "relay.peer.disconnect" && record.actor.id.endsWith(":host-1")
    );
    expect(disconnect).toMatchObject({
      action: "relay.peer.disconnect",
      outcome: "accepted",
      sessionId: "session-demo",
      detail: {
        role: "host",
        reasonCode: "peer-closed",
        notificationTargetCount: 1,
        notificationSentCount: 1,
        notificationFailedCount: 0
      }
    });
    expect(JSON.stringify(disconnect)).not.toContain("123-456");
  });

  it("notifies the host when the viewer disconnects", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const { host, viewer } = await joinPairedSession(runtime);

    viewer.close();

    expect(
      await waitForProtocolMessage(host, (message) => message.type === "peer-disconnected")
    ).toMatchObject({
      type: "peer-disconnected",
      sessionId: "session-demo",
      peerId: "viewer-1",
      role: "viewer",
      reasonCode: "peer-closed"
    });

    const disconnect = await waitForAuditRecord(
      auditSink,
      (record) => record.action === "relay.peer.disconnect" && record.actor.id.endsWith(":viewer-1")
    );
    expect(disconnect).toMatchObject({
      action: "relay.peer.disconnect",
      outcome: "accepted",
      sessionId: "session-demo",
      detail: {
        role: "viewer",
        reasonCode: "peer-closed",
        notificationTargetCount: 1,
        notificationSentCount: 1,
        notificationFailedCount: 0
      }
    });
    expect(JSON.stringify(disconnect)).not.toContain("123-456");
  });

  it("audits a disconnect without notifying when no peer remains", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const host = await openSocket(runtime.url());

    host.send(joinMessage("session-demo", "host-1", "host", "123-456"));
    await waitForProtocolMessage(host, (message) => message.type === "relay-ready");
    host.close();

    const disconnect = await waitForAuditRecord(
      auditSink,
      (record) => record.action === "relay.peer.disconnect" && record.actor.id.endsWith(":host-1")
    );
    expect(disconnect).toMatchObject({
      action: "relay.peer.disconnect",
      outcome: "accepted",
      sessionId: "session-demo",
      detail: {
        role: "host",
        reasonCode: "peer-closed",
        notificationTargetCount: 0,
        notificationSentCount: 0,
        notificationFailedCount: 0
      }
    });
    expect(JSON.stringify(disconnect)).not.toContain("123-456");
  });

  it("rejects peer-originated disconnect notices before forwarding", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const { host, viewer } = await joinPairedSession(runtime);

    viewer.send(
      encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "peer-disconnected",
        peerId: "host-1",
        role: "host",
        reasonCode: "peer-closed"
      })
    );

    expect(await waitForJsonMessage(viewer, (message) => message.type === "relay-error")).toMatchObject({
      type: "relay-error",
      reason: "Peer disconnect notices are relay-originated"
    });
    await expectNoProtocolMessage(host, (message) => message.type === "peer-disconnected");

    const rejected = auditSink.records().find(
      (record) =>
        record.action === "relay.message.rejected" &&
        record.reason === "Peer disconnect notices are relay-originated"
    );
    expect(rejected).toMatchObject({
      action: "relay.message.rejected",
      outcome: "failed",
      sessionId: "session-demo",
      detail: {
        registered: true
      }
    });
    expect(JSON.stringify(rejected)).not.toContain("123-456");
    expect(JSON.stringify(rejected)).not.toContain("peer-closed");
  });

  it("rejects registered join-session replay before forwarding", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const { host, viewer } = await joinPairedSession(runtime);

    host.send(joinMessage("session-demo", "host-1", "host", "987-654"));

    expect(await waitForJsonMessage(host, (message) => message.type === "relay-error")).toEqual({
      type: "relay-error",
      reason: "Registered peers cannot send join-session messages"
    });
    await expectNoProtocolMessage(viewer, (message) => message.type === "join-session");

    const rejected = await waitForAuditRecord(
      auditSink,
      (record) =>
        record.action === "relay.message.rejected" &&
        record.reason === "Registered peers cannot send join-session messages"
    );
    expect(rejected).toMatchObject({
      action: "relay.message.rejected",
      outcome: "failed",
      sessionId: "session-demo",
      detail: {
        registered: true
      }
    });
    expect(JSON.stringify(rejected)).not.toContain("987-654");
  });

  it("rejects peer-originated relay-ready messages before forwarding", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const { host, viewer } = await joinPairedSession(runtime);

    host.send(
      encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "relay-ready",
        peerId: "viewer-1",
        roomSize: 2
      })
    );

    expect(await waitForJsonMessage(host, (message) => message.type === "relay-error")).toEqual({
      type: "relay-error",
      reason: "Relay-ready messages are relay-originated"
    });
    await expectNoProtocolMessage(viewer, (message) => message.type === "relay-ready");

    const rejected = await waitForAuditRecord(
      auditSink,
      (record) =>
        record.action === "relay.message.rejected" &&
        record.reason === "Relay-ready messages are relay-originated"
    );
    expect(rejected).toMatchObject({
      action: "relay.message.rejected",
      outcome: "failed",
      sessionId: "session-demo",
      detail: {
        registered: true
      }
    });
  });

  it("rejects spoofed sender messages before forwarding", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const { host, viewer } = await joinPairedSession(runtime);

    host.send(
      encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "signal",
        fromPeerId: "viewer-1",
        toPeerId: "host-1",
        payload: {
          kind: "spoof-marker"
        }
      })
    );

    expect(await waitForJsonMessage(host, (message) => message.type === "relay-error")).toEqual({
      type: "relay-error",
      reason: "Message peer identity does not match registered peer"
    });
    await expectNoProtocolMessage(viewer, (message) => message.type === "signal");

    const rejected = await waitForAuditRecord(
      auditSink,
      (record) =>
        record.action === "relay.message.rejected" &&
        record.reason === "Message peer identity does not match registered peer"
    );
    expect(rejected).toMatchObject({
      action: "relay.message.rejected",
      outcome: "failed",
      sessionId: "session-demo",
      detail: {
        registered: true
      }
    });
    expect(JSON.stringify(rejected)).not.toContain("spoof-marker");
  });

  it("rejects spoofed actor messages before forwarding", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const { host, viewer } = await joinPairedSession(runtime);

    host.send(
      encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-control",
        actorPeerId: "viewer-1",
        action: "pause",
        reason: "actor-spoof-private-reason"
      })
    );

    expect(await waitForJsonMessage(host, (message) => message.type === "relay-error")).toEqual({
      type: "relay-error",
      reason: "Message peer identity does not match registered peer"
    });
    await expectNoProtocolMessage(viewer, (message) => message.type === "session-control");

    const rejected = await waitForAuditRecord(
      auditSink,
      (record) =>
        record.action === "relay.message.rejected" &&
        record.reason === "Message peer identity does not match registered peer"
    );
    expect(rejected).toMatchObject({
      action: "relay.message.rejected",
      outcome: "failed",
      sessionId: "session-demo",
      detail: {
        registered: true
      }
    });
    expect(JSON.stringify(rejected)).not.toContain("actor-spoof-private-reason");
  });

  it("rejects host-sent viewer authorization requests before forwarding", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const { host, viewer } = await joinPairedSession(runtime);

    host.send(
      encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-authorization-request",
        viewerPeerId: "host-1",
        requestedPermissions: ["screen:view"],
        reason: "role-mismatch-private-reason"
      })
    );

    expect(await waitForJsonMessage(host, (message) => message.type === "relay-error")).toEqual({
      type: "relay-error",
      reason: "Message role does not match registered peer"
    });
    await expectNoProtocolMessage(viewer, (message) => message.type === "session-authorization-request");

    const rejected = await waitForAuditRecord(
      auditSink,
      (record) =>
        record.action === "relay.message.rejected" &&
        record.reason === "Message role does not match registered peer"
    );
    expect(rejected).toMatchObject({
      action: "relay.message.rejected",
      outcome: "failed",
      sessionId: "session-demo",
      detail: {
        registered: true
      }
    });
    expect(JSON.stringify(rejected)).not.toContain("role-mismatch-private-reason");
  });

  it("rejects viewer-forged host authorization decisions before forwarding", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const { host, viewer } = await joinPairedSession(runtime);

    viewer.send(
      encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-authorization-decision",
        authorizationId: "authz-demo",
        hostPeerId: "viewer-1",
        viewerPeerId: "viewer-1",
        decision: "approved",
        grantedPermissions: ["screen:view"],
        expiresAt: new Date(Date.now() + 60_000).toISOString()
      })
    );

    expect(await waitForJsonMessage(viewer, (message) => message.type === "relay-error")).toEqual({
      type: "relay-error",
      reason: "Message role does not match registered peer"
    });
    await expectNoProtocolMessage(host, (message) => message.type === "session-authorization-decision");

    const rejected = await waitForAuditRecord(
      auditSink,
      (record) =>
        record.action === "relay.message.rejected" &&
        record.reason === "Message role does not match registered peer"
    );
    expect(rejected).toMatchObject({
      action: "relay.message.rejected",
      outcome: "failed",
      sessionId: "session-demo",
      detail: {
        registered: true
      }
    });
  });

  it("rejects a viewer before the host creates a pairing ticket", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const viewer = await openSocket(runtime.url());

    viewer.send(joinMessage("session-demo", "viewer-1", "viewer", "123-456"));

    expect(await waitForJsonMessage(viewer, (message) => message.type === "relay-error")).toMatchObject({
      type: "relay-error",
      reason: "Host pairing ticket required"
    });
    const denied = auditSink.records().find((record) => record.action === "relay.peer.join.denied");
    expect(denied).toMatchObject({
      action: "relay.peer.join.denied",
      outcome: "denied",
      detail: {
        pairing: {
          ticketMissing: true
        }
      }
    });
    expect(JSON.stringify(denied)).not.toContain("123-456");
  });

  it("rejects a viewer with mismatched pairing credentials", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const host = await openSocket(runtime.url());
    const viewer = await openSocket(runtime.url());

    host.send(joinMessage("session-demo", "host-1", "host", "123-456"));
    await waitForProtocolMessage(host, (message) => message.type === "relay-ready");

    viewer.send(joinMessage("session-demo", "viewer-1", "viewer", "999-000"));

    expect(await waitForJsonMessage(viewer, (message) => message.type === "relay-error")).toMatchObject({
      type: "relay-error",
      reason: "Pairing code mismatch"
    });
    expect(auditSink.records().some((record) => record.action === "relay.peer.join.denied")).toBe(
      true
    );
    expect(JSON.stringify(auditSink.records())).not.toContain("999-000");
  });

  it("rejects a viewer after the host pairing ticket expires", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({
      auditSink,
      pairing: {
        ticketTtlMs: 0
      }
    });
    const host = await openSocket(runtime.url());
    const viewer = await openSocket(runtime.url());

    host.send(joinMessage("session-demo", "host-1", "host", "123-456"));
    await waitForProtocolMessage(host, (message) => message.type === "relay-ready");

    viewer.send(joinMessage("session-demo", "viewer-1", "viewer", "123-456"));

    expect(await waitForJsonMessage(viewer, (message) => message.type === "relay-error")).toMatchObject({
      type: "relay-error",
      reason: "Pairing ticket is expired"
    });
    const denied = auditSink.records().find((record) => record.reason === "Pairing ticket is expired");
    expect(denied).toMatchObject({
      detail: {
        pairing: {
          ticketExpired: true
        }
      }
    });
    expect(JSON.stringify(denied)).not.toContain("123-456");
  });

  it("uses environment pairing settings when runtime options omit pairing", async () => {
    const previousTtlMs = process.env.WINBRIDGE_RELAY_PAIRING_TICKET_TTL_MS;
    const previousMaxUses = process.env.WINBRIDGE_RELAY_PAIRING_TICKET_MAX_USES;

    process.env.WINBRIDGE_RELAY_PAIRING_TICKET_TTL_MS = "0";
    process.env.WINBRIDGE_RELAY_PAIRING_TICKET_MAX_USES = "1";

    try {
      const runtime = await startRuntime();
      const host = await openSocket(runtime.url());
      const viewer = await openSocket(runtime.url());

      host.send(joinMessage("session-demo", "host-1", "host", "123-456"));
      await waitForProtocolMessage(host, (message) => message.type === "relay-ready");

      viewer.send(joinMessage("session-demo", "viewer-1", "viewer", "123-456"));

      expect(await waitForJsonMessage(viewer, (message) => message.type === "relay-error")).toMatchObject({
        type: "relay-error",
        reason: "Pairing ticket is expired"
      });
    } finally {
      restoreEnv("WINBRIDGE_RELAY_PAIRING_TICKET_TTL_MS", previousTtlMs);
      restoreEnv("WINBRIDGE_RELAY_PAIRING_TICKET_MAX_USES", previousMaxUses);
    }
  });

  it("rejects a new viewer after the host pairing ticket is consumed", async () => {
    const runtime = await startRuntime({
      pairing: {
        ticketTtlMs: 60_000,
        maxUses: 1
      }
    });
    const host = await openSocket(runtime.url());
    const viewer = await openSocket(runtime.url());

    host.send(joinMessage("session-demo", "host-1", "host", "123-456"));
    await waitForProtocolMessage(host, (message) => message.type === "relay-ready");
    viewer.send(joinMessage("session-demo", "viewer-1", "viewer", "123-456"));
    await waitForProtocolMessage(viewer, (message) => message.type === "relay-ready");
    viewer.close();
    await waitForClose(viewer);

    const secondViewer = await openSocket(runtime.url());
    secondViewer.send(joinMessage("session-demo", "viewer-2", "viewer", "123-456"));

    expect(await waitForJsonMessage(secondViewer, (message) => message.type === "relay-error")).toMatchObject({
      type: "relay-error",
      reason: "Pairing ticket has no remaining uses"
    });
  });

  it("audits invalid shared-token attempts without logging the raw token", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink, sharedToken: "correct-token" });
    const socket = await openSocket(`${runtime.url()}?token=wrong-token`);

    expect(await waitForClose(socket)).toMatchObject({ code: 1008 });

    const denied = auditSink.records().find((record) => record.action === "relay.token.denied");
    expect(denied).toBeDefined();
    expect(JSON.stringify(denied)).not.toContain("wrong-token");
    expect(denied?.detail).toMatchObject({
      accessPresented: true
    });
  });

  it("parses development shared-token environment configuration", () => {
    expect(createRelaySharedTokenConfig({})).toBeUndefined();
    expect(
      createRelaySharedTokenConfig({ WINBRIDGE_RELAY_SHARED_TOKEN: "correct-token" })
    ).toBe("correct-token");
    expect(
      createRelaySharedTokenConfig({ WINBRIDGE_RELAY_SHARED_TOKEN: "  padded-token  " })
    ).toBe("  padded-token  ");
  });

  it("rejects blank development shared-token configuration", () => {
    for (const token of ["", "   "]) {
      expect(() =>
        createRelaySharedTokenConfig({ WINBRIDGE_RELAY_SHARED_TOKEN: token })
      ).toThrow("WINBRIDGE_RELAY_SHARED_TOKEN");
      expect(() => createRelayRuntime({ port: 0, sharedToken: token })).toThrow(
        "WINBRIDGE_RELAY_SHARED_TOKEN"
      );
    }
  });

  it("closes a peer after invalid-message rate limit is exceeded", async () => {
    const runtime = await startRuntime({
      invalidMessageLimiter: new SlidingWindowRateLimiter({ limit: 1, windowMs: 60_000 })
    });
    const host = await openSocket(runtime.url());

    host.send(joinMessage("session-demo", "host-1", "host", "123-456"));
    await waitForProtocolMessage(host, (message) => message.type === "relay-ready");

    host.send("not-json");
    await waitForJsonMessage(host, (message) => message.type === "relay-error");
    host.send("not-json-again");

    expect(await waitForClose(host)).toMatchObject({ code: 1008 });
  });

  it("terminates and audits a registered peer after heartbeat timeout", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({
      auditSink,
      heartbeat: {
        intervalMs: 10,
        timeoutMs: 20
      }
    });
    const host = await openSocket(runtime.url(), { autoPong: false });

    host.send(joinMessage("session-demo", "host-1", "host", "123-456"));
    await waitForProtocolMessage(host, (message) => message.type === "relay-ready");
    await waitForClose(host);

    const timeout = auditSink.records().find((record) => record.action === "relay.peer.heartbeat.timeout");
    expect(timeout).toMatchObject({
      action: "relay.peer.heartbeat.timeout",
      outcome: "failed",
      sessionId: "session-demo",
      actor: {
        id: "development-relay:host-1"
      },
      detail: {
        registered: true,
        role: "host",
        intervalMs: 10,
        timeoutMs: 20
      }
    });
    expect(JSON.stringify(timeout)).not.toContain("123-456");
  });

  it("parses development pairing ticket environment configuration", () => {
    expect(createRelayPairingConfig({})).toEqual({
      ticketTtlMs: 5 * 60_000,
      maxUses: 1
    });
    expect(
      createRelayPairingConfig({
        WINBRIDGE_RELAY_PAIRING_TICKET_TTL_MS: "1000",
        WINBRIDGE_RELAY_PAIRING_TICKET_MAX_USES: "2"
      })
    ).toEqual({
      ticketTtlMs: 1000,
      maxUses: 2
    });
    expect(
      createRelayPairingConfig({
        WINBRIDGE_RELAY_PAIRING_TICKET_TTL_MS: "0",
        WINBRIDGE_RELAY_PAIRING_TICKET_MAX_USES: "10"
      })
    ).toEqual({
      ticketTtlMs: 0,
      maxUses: 10
    });
  });

  it("rejects malformed development pairing ticket environment configuration", () => {
    for (const ttlMs of ["", " ", "1000ms", "1.5", "-1", "001", "86400001"]) {
      expect(() =>
        createRelayPairingConfig({
          WINBRIDGE_RELAY_PAIRING_TICKET_TTL_MS: ttlMs
        })
      ).toThrow("WINBRIDGE_RELAY_PAIRING_TICKET_TTL_MS");
    }

    for (const maxUses of ["", " ", "2x", "1.5", "-1", "0", "01", "11"]) {
      expect(() =>
        createRelayPairingConfig({
          WINBRIDGE_RELAY_PAIRING_TICKET_MAX_USES: maxUses
        })
      ).toThrow("WINBRIDGE_RELAY_PAIRING_TICKET_MAX_USES");
    }
  });

  it("rejects unsafe injected pairing runtime settings before startup", () => {
    expect(() =>
      createRelayRuntime({
        port: 0,
        pairing: {
          ticketTtlMs: -1
        }
      })
    ).toThrow("Pairing ticket TTL");

    expect(() =>
      createRelayRuntime({
        port: 0,
        pairing: {
          maxUses: 0
        }
      })
    ).toThrow("Pairing ticket max uses");
  });

  it("parses development relay port environment configuration", () => {
    expect(createRelayPortConfig({})).toBe(8787);
    expect(createRelayPortConfig({ WINBRIDGE_RELAY_PORT: "0" })).toBe(0);
    expect(createRelayPortConfig({ WINBRIDGE_RELAY_PORT: "8788" })).toBe(8788);
  });

  it("rejects malformed development relay port configuration", () => {
    for (const port of ["", "abc", "8787abc", "-1", "1.5", "65536"]) {
      expect(() => createRelayPortConfig({ WINBRIDGE_RELAY_PORT: port })).toThrow(
        "WINBRIDGE_RELAY_PORT"
      );
    }
  });
});

async function startRuntime(
  options: Partial<RelayRuntimeOptions> = {}
): Promise<RelayRuntime> {
  const runtime = createRelayRuntime({
    port: 0,
    auditSink: new MemoryAuditSink(),
    heartbeat: false,
    logger: silentLogger,
    ...options
  });
  await runtime.start();
  runtimes.push(runtime);
  return runtime;
}

function joinMessage(
  sessionId: string,
  peerId: string,
  role: "host" | "viewer",
  pairingCode: string
): string {
  return encodeProtocolEnvelope({
    ...createMessageBase(sessionId),
    type: "join-session",
    peerId,
    role,
    pairingCode
  });
}

async function joinPairedSession(runtime: RelayRuntime): Promise<{
  host: WebSocket;
  viewer: WebSocket;
}> {
  const host = await openSocket(runtime.url());
  const viewer = await openSocket(runtime.url());

  host.send(joinMessage("session-demo", "host-1", "host", "123-456"));
  await waitForProtocolMessage(host, (message) => message.type === "relay-ready");
  viewer.send(joinMessage("session-demo", "viewer-1", "viewer", "123-456"));
  await waitForProtocolMessage(viewer, (message) => message.type === "relay-ready");

  return { host, viewer };
}

function openSocket(url: string, options: ClientOptions = {}): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, options);
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function waitForProtocolMessage(
  socket: WebSocket,
  predicate: (message: ProtocolEnvelope) => boolean
): Promise<ProtocolEnvelope> {
  return waitForJsonMessage(socket, (message): message is ProtocolEnvelope => {
    return typeof message.type === "string" && predicate(message as ProtocolEnvelope);
  });
}

function waitForJsonMessage<T extends Record<string, unknown>>(
  socket: WebSocket,
  predicate: (message: Record<string, unknown>) => boolean
): Promise<T> {
  return withTimeout(
    new Promise((resolve) => {
      const onMessage = (data: RawData) => {
        const parsed = JSON.parse(data.toString()) as Record<string, unknown>;

        if (predicate(parsed)) {
          socket.off("message", onMessage);
          resolve(parsed as T);
        }
      };

      socket.on("message", onMessage);
    })
  );
}

function expectNoProtocolMessage(
  socket: WebSocket,
  predicate: (message: ProtocolEnvelope) => boolean,
  durationMs = 100
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off("message", onMessage);
    };
    const onMessage = (data: RawData) => {
      let parsed: Record<string, unknown>;

      try {
        parsed = JSON.parse(data.toString()) as Record<string, unknown>;
      } catch {
        return;
      }

      if (typeof parsed.type === "string" && predicate(parsed as ProtocolEnvelope)) {
        cleanup();
        reject(new Error(`Unexpected protocol message ${parsed.type}`));
      }
    };
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, durationMs);

    socket.on("message", onMessage);
  });
}

function waitForAuditRecord(
  auditSink: MemoryAuditSink,
  predicate: (record: AuditRecord) => boolean,
  startIndex = 0
): Promise<AuditRecord> {
  return withTimeout(
    new Promise((resolve) => {
      const poll = () => {
        const record = auditSink.records().slice(startIndex).find(predicate);

        if (record) {
          resolve(record);
          return;
        }

        setTimeout(poll, 10);
      };

      poll();
    })
  );
}

function waitForClose(socket: WebSocket): Promise<{ code: number; reason: string }> {
  return withTimeout(
    new Promise((resolve) => {
      socket.once("close", (code, reason) => {
        resolve({ code, reason: reason.toString() });
      });
    })
  );
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for relay event")), 5000);

    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
    });
  });
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
