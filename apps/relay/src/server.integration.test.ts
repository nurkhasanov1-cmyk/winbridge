import { MemoryAuditSink } from "@winbridge/audit-log";
import {
  type AuditRecord,
  createMessageBase,
  encodeProtocolEnvelope,
  PROTOCOL_IDENTIFIER_MAX_LENGTH,
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
import { SAME_ROLE_RELAY_PEER_JOIN_REASON } from "./rooms.js";

const runtimes: RelayRuntime[] = [];
const silentLogger = {
  log: () => undefined,
  warn: () => undefined
};
const INHERITED_TO_JSON_PRIVATE_MARKER = "inherited-to-json-private-marker";

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.stop()));
});

describe("relay runtime integration", () => {
  it("starts on an ephemeral port and stops cleanly", async () => {
    const runtime = await startRuntime();

    expect(runtime.url()).toMatch(/^ws:\/\/127\.0\.0\.1:\d+$/);
  });

  it("accepts an injected ephemeral port before startup", async () => {
    const runtime = createRelayRuntime({
      port: 0,
      auditSink: new MemoryAuditSink(),
      heartbeat: false,
      logger: silentLogger
    });

    await runtime.start();
    runtimes.push(runtime);

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
        payload: { authorizationId: "authz-demo", kind: "test-signal" }
      })
    );

    expect(await waitForProtocolMessage(viewer, (message) => message.type === "signal")).toMatchObject({
      type: "signal",
      fromPeerId: "host-1",
      payload: { authorizationId: "authz-demo", kind: "test-signal" }
    });

    const auditRecords = auditSink.records().filter(
      (record) => record.action === "relay.peer.join.accepted"
    );
    expect(JSON.stringify(auditRecords)).not.toContain("123-456");
  });

  it("rejects join messages with unknown fixed fields before registration", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const host = await openSocket(runtime.url());
    const privateMarker = "unknown-join-fixed-field-private-marker";

    host.send(
      JSON.stringify({
        ...createMessageBase("session-demo"),
        type: "join-session",
        peerId: "host-1",
        role: "host",
        pairingCode: "123-456",
        unknownFixedField: privateMarker
      })
    );

    expect(await waitForJsonMessage(host, (message) => message.type === "relay-error")).toEqual({
      type: "relay-error",
      reason: "Invalid relay message"
    });
    expect(auditSink.records().some((record) => record.action === "relay.peer.join.accepted")).toBe(false);

    const rejected = await waitForAuditRecord(
      auditSink,
      (record) => record.action === "relay.message.rejected" && record.reason === "Invalid relay message"
    );
    expect(rejected).toMatchObject({
      action: "relay.message.rejected",
      outcome: "failed",
      reason: "Invalid relay message",
      detail: {
        registered: false
      }
    });
    expect(JSON.stringify(rejected)).not.toContain(privateMarker);
    expect(JSON.stringify(rejected)).not.toContain("123-456");
  });

  it("rejects untrimmed device identity display names before registration", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const host = await openSocket(runtime.url());
    const privateMarker = "Host Private Display";

    host.send(
      JSON.stringify({
        ...createMessageBase("session-demo"),
        type: "join-session",
        peerId: "host-1",
        role: "host",
        pairingCode: "123-456",
        deviceIdentity: {
          deviceId: "dev_host_1",
          displayName: ` ${privateMarker} `,
          platform: "windows",
          trustLevel: "local-dev",
          createdAt: new Date("2026-06-12T00:00:00.000Z").toISOString()
        }
      })
    );

    expect(await waitForJsonMessage(host, (message) => message.type === "relay-error")).toEqual({
      type: "relay-error",
      reason: "Invalid relay message"
    });
    expect(auditSink.records().some((record) => record.action === "relay.peer.join.accepted")).toBe(false);

    const rejected = await waitForAuditRecord(
      auditSink,
      (record) => record.action === "relay.message.rejected" && record.reason === "Invalid relay message"
    );
    expect(rejected).toMatchObject({
      action: "relay.message.rejected",
      outcome: "failed",
      reason: "Invalid relay message",
      detail: {
        registered: false
      }
    });
    expect(JSON.stringify(rejected)).not.toContain(privateMarker);
    expect(JSON.stringify(rejected)).not.toContain("123-456");
  });

  it("emits schema-valid audit records for max-length peer ids", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const host = await openSocket(runtime.url());
    const peerId = "h".repeat(PROTOCOL_IDENTIFIER_MAX_LENGTH);

    host.send(joinMessage("session-demo", peerId, "host", "123-456"));
    expect(await waitForProtocolMessage(host, (message) => message.type === "relay-ready")).toMatchObject({
      type: "relay-ready",
      peerId,
      roomSize: 1
    });

    const accepted = await waitForAuditRecord(
      auditSink,
      (record) => record.action === "relay.peer.join.accepted"
    );
    expect(accepted.actor.id).toMatch(/^development-relay:peer:[a-f0-9]{16}$/);
    expect(accepted.actor.id.length).toBeLessThanOrEqual(PROTOCOL_IDENTIFIER_MAX_LENGTH);
    expect(accepted.detail).toMatchObject({
      relayPeerIdBounded: true,
      relayPeerIdLength: PROTOCOL_IDENTIFIER_MAX_LENGTH
    });
    expect(accepted.detail.relayPeerIdHash).toEqual(expect.stringMatching(/^[a-f0-9]{64}$/));
    expect(JSON.stringify(accepted)).not.toContain("123-456");
  });

  it("audits forwarded signal authorization ids without payload contents", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const { host, viewer } = await joinPairedSession(runtime);
    const authorizationId = "authz-audit-demo";
    const privateMarker = "accepted-signal-forward-private-marker";
    const signalPayload = {
      authorizationId,
      kind: "offer",
      sdp: "raw-forwarded-signal-sdp",
      candidates: [{ candidate: "raw-forwarded-signal-candidate" }],
      safeMarker: privateMarker
    };
    const signal = {
      ...createMessageBase("session-demo"),
      type: "signal",
      fromPeerId: "host-1",
      toPeerId: "viewer-1",
      payload: signalPayload
    } as const;

    host.send(encodeProtocolEnvelope(signal));

    expect(await waitForProtocolMessage(viewer, (message) => message.type === "signal")).toMatchObject({
      type: "signal",
      fromPeerId: "host-1",
      payload: signalPayload
    });

    const forwarded = await waitForAuditRecord(
      auditSink,
      (record) =>
        record.action === "relay.message.forwarded" &&
        record.detail?.messageType === "signal" &&
        record.detail?.authorizationId === authorizationId
    );

    expect(forwarded).toMatchObject({
      action: "relay.message.forwarded",
      actor: {
        id: "development-relay:host-1"
      },
      outcome: "accepted",
      sessionId: "session-demo",
      detail: {
        messageType: "signal",
        messageId: signal.messageId,
        authorizationId,
        recipientPeerId: "viewer-1",
        recipientRole: "viewer"
      }
    });
    expect(forwarded.detail).toEqual({
      messageType: "signal",
      messageId: signal.messageId,
      authorizationId,
      recipientPeerId: "viewer-1",
      recipientRole: "viewer"
    });
    expect(JSON.stringify(forwarded)).not.toContain(privateMarker);
    expect(JSON.stringify(forwarded)).not.toContain("raw-forwarded-signal-sdp");
    expect(JSON.stringify(forwarded)).not.toContain("raw-forwarded-signal-candidate");
  });

  it("audits forwarded hello messages without display or capability metadata", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const { host, viewer } = await joinPairedSession(runtime);
    const displayName = "Host Forwarded Hello Private Display";
    const privateCapability = "agent-shell:hello-private-marker";
    const hello = {
      ...createMessageBase("session-demo"),
      type: "hello",
      peerId: "host-1",
      role: "host",
      displayName,
      capabilities: ["agent-shell:test", privateCapability]
    } as const;

    host.send(encodeProtocolEnvelope(hello));

    expect(await waitForProtocolMessage(viewer, (message) => message.type === "hello")).toMatchObject({
      type: "hello",
      peerId: "host-1",
      role: "host",
      displayName,
      capabilities: ["agent-shell:test", privateCapability]
    });

    const forwarded = await waitForAuditRecord(
      auditSink,
      (record) =>
        record.action === "relay.message.forwarded" &&
        record.detail?.messageType === "hello" &&
        record.detail?.messageId === hello.messageId
    );
    expect(forwarded).toMatchObject({
      action: "relay.message.forwarded",
      actor: {
        id: "development-relay:host-1"
      },
      outcome: "accepted",
      sessionId: "session-demo",
      detail: {
        messageType: "hello",
        messageId: hello.messageId,
        recipientPeerId: "viewer-1",
        recipientRole: "viewer"
      }
    });
    expect(forwarded.detail).toEqual({
      messageType: "hello",
      messageId: hello.messageId,
      recipientPeerId: "viewer-1",
      recipientRole: "viewer"
    });
    expect(JSON.stringify(forwarded)).not.toContain(displayName);
    expect(JSON.stringify(forwarded)).not.toContain(privateCapability);
    expect(JSON.stringify(forwarded)).not.toContain("agent-shell:test");
  });

  it("audits forwarded audit-event messages without raw audit details", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const { host, viewer } = await joinPairedSession(runtime);
    const rawToken = "raw-forwarded-audit-token";
    const rawDisplayName = "Raw Forwarded Audit Host";
    const rawTerminationReason = "raw forwarded audit termination reason";
    const rawScreenContent = "raw-forwarded-audit-screen-content";
    const rawNestedScreenContent = "raw-forwarded-audit-nested-screen";
    const safeMarker = "forwarded-audit-detail-safe-marker";
    const auditEvent = {
      ...createMessageBase("session-demo"),
      type: "audit-event",
      eventId: "audit_forwarded_detail",
      actorPeerId: "host-1",
      action: "agent-shell.forwarded.audit",
      outcome: "accepted",
      detail: {
        authorizationId: "authz-forwarded-audit",
        token: rawToken,
        displayName: rawDisplayName,
        terminationReason: rawTerminationReason,
        screenContent: rawScreenContent,
        safeMarker,
        nested: {
          screenContent: rawNestedScreenContent
        }
      }
    } as const;

    host.send(JSON.stringify(auditEvent));

    const received = await waitForProtocolMessage(viewer, (message) => message.type === "audit-event");
    expect(received).toMatchObject({
      type: "audit-event",
      eventId: "audit_forwarded_detail",
      actorPeerId: "host-1",
      action: "agent-shell.forwarded.audit",
      outcome: "accepted",
      detail: {
        authorizationId: "authz-forwarded-audit",
        token: "[REDACTED]",
        displayName: "[REDACTED]",
        terminationReason: "[REDACTED]",
        screenContent: "[REDACTED]",
        safeMarker,
        nested: {
          screenContent: "[REDACTED]"
        }
      }
    });
    expect(JSON.stringify(received)).not.toContain(rawToken);
    expect(JSON.stringify(received)).not.toContain(rawDisplayName);
    expect(JSON.stringify(received)).not.toContain(rawTerminationReason);
    expect(JSON.stringify(received)).not.toContain(rawScreenContent);
    expect(JSON.stringify(received)).not.toContain(rawNestedScreenContent);

    const forwarded = await waitForAuditRecord(
      auditSink,
      (record) =>
        record.action === "relay.message.forwarded" &&
        record.detail?.messageType === "audit-event" &&
        record.detail?.messageId === auditEvent.messageId
    );
    expect(forwarded).toMatchObject({
      action: "relay.message.forwarded",
      actor: {
        id: "development-relay:host-1"
      },
      outcome: "accepted",
      sessionId: "session-demo",
      detail: {
        messageType: "audit-event",
        messageId: auditEvent.messageId,
        recipientPeerId: "viewer-1",
        recipientRole: "viewer"
      }
    });
    expect(forwarded.detail).toEqual({
      messageType: "audit-event",
      messageId: auditEvent.messageId,
      recipientPeerId: "viewer-1",
      recipientRole: "viewer"
    });
    expect(JSON.stringify(forwarded)).not.toContain("audit_forwarded_detail");
    expect(JSON.stringify(forwarded)).not.toContain("agent-shell.forwarded.audit");
    expect(JSON.stringify(forwarded)).not.toContain("authz-forwarded-audit");
    expect(JSON.stringify(forwarded)).not.toContain(rawToken);
    expect(JSON.stringify(forwarded)).not.toContain(rawDisplayName);
    expect(JSON.stringify(forwarded)).not.toContain(rawTerminationReason);
    expect(JSON.stringify(forwarded)).not.toContain(rawScreenContent);
    expect(JSON.stringify(forwarded)).not.toContain(rawNestedScreenContent);
    expect(JSON.stringify(forwarded)).not.toContain(safeMarker);
    expect(JSON.stringify(forwarded)).not.toContain("[REDACTED]");
  });

  it("rejects duplicate live host joins without replacing the original host or refreshing pairing", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const host = await openSocket(runtime.url());
    const duplicateHost = await openSocket(runtime.url());
    const viewer = await openSocket(runtime.url());

    host.send(joinMessage("session-demo", "host-1", "host", "123-456"));
    await waitForProtocolMessage(host, (message) => message.type === "relay-ready");

    duplicateHost.send(joinMessage("session-demo", "host-1", "host", "999-000"));
    expect(await waitForJsonMessage(duplicateHost, (message) => message.type === "relay-error")).toMatchObject({
      type: "relay-error",
      reason: "Peer is already connected to session"
    });

    const denied = await waitForAuditRecord(
      auditSink,
      (record) => record.action === "relay.peer.join.denied" && record.reason === "Peer is already connected to session"
    );
    expect(denied).toMatchObject({
      action: "relay.peer.join.denied",
      outcome: "denied",
      detail: {
        messageType: "join-session",
        pairing: {
          duplicatePeer: true
        }
      }
    });
    expect(JSON.stringify(denied)).not.toContain("999-000");
    expect(JSON.stringify(denied)).not.toContain("123-456");

    viewer.send(joinMessage("session-demo", "viewer-1", "viewer", "123-456"));
    await waitForProtocolMessage(viewer, (message) => message.type === "relay-ready");

    viewer.send(
      encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "signal",
        fromPeerId: "viewer-1",
        toPeerId: "host-1",
        payload: { authorizationId: "authz-demo", kind: "original-host-continuity" }
      })
    );

    expect(await waitForProtocolMessage(host, (message) => message.type === "signal")).toMatchObject({
      type: "signal",
      fromPeerId: "viewer-1",
      payload: { authorizationId: "authz-demo", kind: "original-host-continuity" }
    });
    await expectNoProtocolMessage(duplicateHost, (message) => message.type === "signal");
  });

  it("rejects second live host joins without replacing the original host", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const host = await openSocket(runtime.url());
    const secondHost = await openSocket(runtime.url());
    const viewer = await openSocket(runtime.url());

    host.send(joinMessage("session-demo", "host-1", "host", "123-456"));
    await waitForProtocolMessage(host, (message) => message.type === "relay-ready");

    const secondHostResponse = waitForJsonMessage(secondHost, () => true);
    secondHost.send(joinMessage("session-demo", "host-2", "host", "999-000"));
    expect(await secondHostResponse).toEqual({
      type: "relay-error",
      reason: SAME_ROLE_RELAY_PEER_JOIN_REASON
    });
    await expectNoProtocolMessage(secondHost, (message) => message.type === "relay-ready");

    const denied = await waitForAuditRecord(
      auditSink,
      (record) =>
        record.action === "relay.peer.join.denied" &&
        record.reason === SAME_ROLE_RELAY_PEER_JOIN_REASON
    );
    expectNoAcceptedJoinAudit(auditSink, "host-2");
    expect(denied).toMatchObject({
      action: "relay.peer.join.denied",
      outcome: "denied",
      detail: {
        messageType: "join-session",
        pairing: {
          duplicatePeer: false,
          roleConflict: true
        }
      }
    });
    expect(denied.detail).not.toHaveProperty("payload");
    expect(JSON.stringify(denied)).not.toContain("999-000");
    expect(JSON.stringify(denied)).not.toContain("123-456");

    viewer.send(joinMessage("session-demo", "viewer-1", "viewer", "123-456"));
    await waitForProtocolMessage(viewer, (message) => message.type === "relay-ready");

    viewer.send(
      encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "signal",
        fromPeerId: "viewer-1",
        toPeerId: "host-1",
        payload: { authorizationId: "authz-demo", kind: "original-host-after-role-denial" }
      })
    );

    expect(await waitForProtocolMessage(host, (message) => message.type === "signal")).toMatchObject({
      type: "signal",
      fromPeerId: "viewer-1",
      payload: { authorizationId: "authz-demo", kind: "original-host-after-role-denial" }
    });
    expectNoAcceptedJoinAudit(auditSink, "host-2");
    await expectNoProtocolMessage(secondHost, (message) => message.type === "signal");
  });

  it("rejects duplicate live viewer joins without replacing the original viewer", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const { host, viewer } = await joinPairedSession(runtime);
    const duplicateViewer = await openSocket(runtime.url());

    duplicateViewer.send(joinMessage("session-demo", "viewer-1", "viewer", "123-456"));
    expect(await waitForJsonMessage(duplicateViewer, (message) => message.type === "relay-error")).toMatchObject({
      type: "relay-error",
      reason: "Peer is already connected to session"
    });

    const denied = await waitForAuditRecord(
      auditSink,
      (record) => record.action === "relay.peer.join.denied" && record.reason === "Peer is already connected to session"
    );
    expect(denied).toMatchObject({
      action: "relay.peer.join.denied",
      outcome: "denied",
      detail: {
        messageType: "join-session",
        pairing: {
          duplicatePeer: true
        }
      }
    });
    expect(JSON.stringify(denied)).not.toContain("123-456");

    host.send(
      encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "signal",
        fromPeerId: "host-1",
        toPeerId: "viewer-1",
        payload: { authorizationId: "authz-demo", kind: "original-viewer-continuity" }
      })
    );

    expect(await waitForProtocolMessage(viewer, (message) => message.type === "signal")).toMatchObject({
      type: "signal",
      fromPeerId: "host-1",
      payload: { authorizationId: "authz-demo", kind: "original-viewer-continuity" }
    });
    await expectNoProtocolMessage(duplicateViewer, (message) => message.type === "signal");
  });

  it("rejects second live viewer joins without replacing the original viewer", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const { host, viewer } = await joinPairedSession(runtime);
    const secondViewer = await openSocket(runtime.url());

    const secondViewerResponse = waitForJsonMessage(secondViewer, () => true);
    secondViewer.send(joinMessage("session-demo", "viewer-2", "viewer", "999-000"));
    expect(await secondViewerResponse).toEqual({
      type: "relay-error",
      reason: SAME_ROLE_RELAY_PEER_JOIN_REASON
    });
    await expectNoProtocolMessage(secondViewer, (message) => message.type === "relay-ready");

    const denied = await waitForAuditRecord(
      auditSink,
      (record) =>
        record.action === "relay.peer.join.denied" &&
        record.reason === SAME_ROLE_RELAY_PEER_JOIN_REASON
    );
    expectNoAcceptedJoinAudit(auditSink, "viewer-2");
    expect(denied).toMatchObject({
      action: "relay.peer.join.denied",
      outcome: "denied",
      detail: {
        messageType: "join-session",
        pairing: {
          duplicatePeer: false,
          roleConflict: true
        }
      }
    });
    expect(denied.detail).not.toHaveProperty("payload");
    expect(JSON.stringify(denied)).not.toContain("999-000");
    expect(JSON.stringify(denied)).not.toContain("123-456");

    host.send(
      encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "signal",
        fromPeerId: "host-1",
        toPeerId: "viewer-1",
        payload: { authorizationId: "authz-demo", kind: "original-viewer-after-role-denial" }
      })
    );

    expect(await waitForProtocolMessage(viewer, (message) => message.type === "signal")).toMatchObject({
      type: "signal",
      fromPeerId: "host-1",
      payload: { authorizationId: "authz-demo", kind: "original-viewer-after-role-denial" }
    });
    expectNoAcceptedJoinAudit(auditSink, "viewer-2");
    await expectNoProtocolMessage(secondViewer, (message) => message.type === "signal");
  });

  it("allows the same peer id to rejoin after disconnect cleanup", async () => {
    const runtime = await startRuntime();
    const host = await openSocket(runtime.url());

    host.send(joinMessage("session-demo", "host-1", "host", "123-456"));
    await waitForProtocolMessage(host, (message) => message.type === "relay-ready");
    host.close();
    await waitForClose(host);

    const replacementHost = await openSocket(runtime.url());
    const viewer = await openSocket(runtime.url());

    replacementHost.send(joinMessage("session-demo", "host-1", "host", "999-000"));
    expect(await waitForProtocolMessage(replacementHost, (message) => message.type === "relay-ready")).toMatchObject({
      type: "relay-ready",
      peerId: "host-1",
      roomSize: 1
    });

    viewer.send(joinMessage("session-demo", "viewer-1", "viewer", "999-000"));
    expect(await waitForProtocolMessage(viewer, (message) => message.type === "relay-ready")).toMatchObject({
      type: "relay-ready",
      peerId: "viewer-1",
      roomSize: 2
    });
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

  it.each([
    ["accessKey", { nested: { accessKey: "raw-access-key" } }, ["raw-access-key"]],
    [
      "access_key",
      { nested: { access_key: "raw-access-key-underscore" } },
      ["raw-access-key-underscore"]
    ],
    [
      "access-key",
      { nested: { "access-key": "raw-access-key-dash" } },
      ["raw-access-key-dash"]
    ],
    ["array sshKey", { attempts: [{ sshKey: "raw-ssh-key" }] }, ["raw-ssh-key"]],
    [
      "array ssh_key",
      { attempts: [{ ssh_key: "raw-ssh-key-underscore" }] },
      ["raw-ssh-key-underscore"]
    ]
  ] satisfies Array<[string, Record<string, unknown>, string[]]>)(
    "rejects %s signal payloads before forwarding",
    async (_name, unsafePayload, rawValues) => {
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
            ...unsafePayload
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

      const serializedRelayError = JSON.stringify(relayError);
      const serializedRejected = JSON.stringify(rejected);
      for (const rawValue of rawValues) {
        expect(serializedRelayError).not.toContain(rawValue);
        expect(serializedRejected).not.toContain(rawValue);
      }
    }
  );

  it("rejects remote-assistance content signal payloads before forwarding", async () => {
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
            clipboardText: "raw-clipboard-text",
            fileContent: "raw-file-content",
            fileBytes: "raw-file-bytes",
            diagnosticDump: "raw-diagnostic-dump"
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
    expect(JSON.stringify(rejected)).not.toContain("raw-clipboard-text");
    expect(JSON.stringify(rejected)).not.toContain("raw-file-content");
    expect(JSON.stringify(rejected)).not.toContain("raw-file-bytes");
    expect(JSON.stringify(rejected)).not.toContain("raw-diagnostic-dump");
  });

  it("rejects keylogging signal payloads before forwarding", async () => {
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
            rawKeylog: "raw-keylog-marker",
            keyloggerOutput: "raw-keylogger-output"
          },
          attempts: [{ keyLoggerTrace: "array-keylogger-trace" }]
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
    expect(JSON.stringify(rejected)).not.toContain("raw-keylog-marker");
    expect(JSON.stringify(rejected)).not.toContain("raw-keylogger-output");
    expect(JSON.stringify(rejected)).not.toContain("array-keylogger-trace");
  });

  it("rejects non-JSON signal payloads before forwarding", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const { host, viewer } = await joinPairedSession(runtime);
    const privateMarker = "non-json-signal-private-marker";
    const base = createMessageBase("session-demo");

    host.send(
      [
        "{",
        `"protocolVersion":${base.protocolVersion},`,
        `"messageId":"${base.messageId}",`,
        `"sessionId":"${base.sessionId}",`,
        `"createdAt":"${base.createdAt}",`,
        "\"type\":\"signal\",",
        "\"fromPeerId\":\"host-1\",",
        "\"toPeerId\":\"viewer-1\",",
        "\"payload\":{",
        "\"authorizationId\":\"authz-demo\",",
        `"safeMarker":"${privateMarker}",`,
        "\"count\":NaN",
        "}}"
      ].join("")
    );

    const relayError = await waitForJsonMessage(host, (message) => message.type === "relay-error");
    expect(String(relayError.reason)).toBe("Invalid relay message");
    await expectNoProtocolMessage(viewer, (message) => message.type === "signal");

    const rejected = await waitForAuditRecord(
      auditSink,
      (record) =>
        record.action === "relay.message.rejected" &&
        record.reason === "Invalid relay message"
    );
    expect(rejected).toMatchObject({
      action: "relay.message.rejected",
      outcome: "failed",
      sessionId: "session-demo",
      reason: "Invalid relay message",
      detail: {
        registered: true
      }
    });
    expect(JSON.stringify(relayError)).not.toContain(privateMarker);
    expect(JSON.stringify(rejected)).not.toContain(privateMarker);
  });

  it("rejects registered messages with unknown fixed fields before forwarding", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const { host, viewer } = await joinPairedSession(runtime);
    const privateMarker = "unknown-registered-fixed-field-private-marker";

    host.send(
      JSON.stringify({
        ...createMessageBase("session-demo"),
        type: "signal",
        fromPeerId: "host-1",
        toPeerId: "viewer-1",
        payload: {
          authorizationId: "authz-demo",
          kind: "offer"
        },
        unknownFixedField: privateMarker
      })
    );

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
      reason: "Invalid relay message",
      detail: {
        registered: true
      }
    });
    expect(JSON.stringify(rejected)).not.toContain(privateMarker);
  });

  it("rejects hello messages with malformed capability metadata before forwarding", async () => {
    const cases: Array<{
      name: string;
      capabilities: string[];
      privateMarker: string;
    }> = [
      {
        name: "untrimmed capability",
        capabilities: ["agent-shell:test", "capability-private-marker "],
        privateMarker: "capability-private-marker"
      },
      {
        name: "trim-duplicate capability",
        capabilities: ["agent-shell:test", "agent-shell:test "],
        privateMarker: "agent-shell:test "
      }
    ];

    for (const { capabilities, name, privateMarker } of cases) {
      const auditSink = new MemoryAuditSink();
      const runtime = await startRuntime({ auditSink });
      const { host, viewer } = await joinPairedSession(runtime);

      host.send(
        JSON.stringify({
          ...createMessageBase("session-demo"),
          type: "hello",
          peerId: "host-1",
          role: "host",
          displayName: "Host Private Display",
          capabilities
        })
      );

      expect(await waitForJsonMessage(host, (message) => message.type === "relay-error"), name).toEqual({
        type: "relay-error",
        reason: "Invalid relay message"
      });
      await expectNoProtocolMessage(viewer, (message) => message.type === "hello");

      const rejected = await waitForAuditRecord(
        auditSink,
        (record) => record.action === "relay.message.rejected" && record.reason === "Invalid relay message"
      );
      expect(rejected, name).toMatchObject({
        action: "relay.message.rejected",
        outcome: "failed",
        sessionId: "session-demo",
        reason: "Invalid relay message",
        detail: {
          registered: true
        }
      });
      expect(JSON.stringify(rejected), name).not.toContain(privateMarker);
      expect(JSON.stringify(rejected), name).not.toContain("Host Private Display");
    }
  });

  it("rejects hello messages with untrimmed display names before forwarding", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const { host, viewer } = await joinPairedSession(runtime);
    const privateMarker = "Host Private Display";

    host.send(
      JSON.stringify({
        ...createMessageBase("session-demo"),
        type: "hello",
        peerId: "host-1",
        role: "host",
        displayName: ` ${privateMarker} `,
        capabilities: ["agent-shell:test"]
      })
    );

    expect(await waitForJsonMessage(host, (message) => message.type === "relay-error")).toEqual({
      type: "relay-error",
      reason: "Invalid relay message"
    });
    await expectNoProtocolMessage(viewer, (message) => message.type === "hello");

    const rejected = await waitForAuditRecord(
      auditSink,
      (record) => record.action === "relay.message.rejected" && record.reason === "Invalid relay message"
    );
    expect(rejected).toMatchObject({
      action: "relay.message.rejected",
      outcome: "failed",
      sessionId: "session-demo",
      reason: "Invalid relay message",
      detail: {
        registered: true
      }
    });
    expect(JSON.stringify(rejected)).not.toContain(privateMarker);
  });

  it("rejects signal payloads without valid authorization ids before forwarding", async () => {
    const cases: Array<{
      name: string;
      payload: Record<string, unknown>;
      privateMarker: string;
    }> = [
      {
        name: "missing authorization id",
        payload: {
          kind: "offer",
          safeMarker: "missing-signal-auth-id-private-marker"
        },
        privateMarker: "missing-signal-auth-id-private-marker"
      },
      {
        name: "malformed authorization id",
        payload: {
          authorizationId: "authz/unsafe",
          kind: "offer",
          safeMarker: "malformed-signal-auth-id-private-marker"
        },
        privateMarker: "malformed-signal-auth-id-private-marker"
      }
    ];

    for (const { name, payload, privateMarker } of cases) {
      const auditSink = new MemoryAuditSink();
      const runtime = await startRuntime({ auditSink });
      const { host, viewer } = await joinPairedSession(runtime);

      host.send(
        JSON.stringify({
          ...createMessageBase("session-demo"),
          type: "signal",
          fromPeerId: "host-1",
          toPeerId: "viewer-1",
          payload
        })
      );

      expect(await waitForJsonMessage(host, (message) => message.type === "relay-error"), name).toEqual({
        type: "relay-error",
        reason: "Invalid relay message"
      });
      await expectNoProtocolMessage(viewer, (message) => message.type === "signal");

      const rejected = await waitForAuditRecord(
        auditSink,
        (record) => record.action === "relay.message.rejected" && record.reason === "Invalid relay message"
      );
      expect(rejected, name).toMatchObject({
        action: "relay.message.rejected",
        outcome: "failed",
        sessionId: "session-demo",
        detail: {
          registered: true
        }
      });
      expect(JSON.stringify(rejected), name).not.toContain(privateMarker);
      expect(JSON.stringify(rejected), name).not.toContain("authz/unsafe");
    }
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
        authorizationId: "authz-demo",
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

  it("encodes relay errors without inherited toJSON hooks", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const { host, viewer } = await joinPairedSession(runtime);

    const result = await withInheritedObjectToJsonHook(async () => {
      host.send(`not-json secret-token 123-456 ${INHERITED_TO_JSON_PRIVATE_MARKER}`);

      const relayError = await waitForRawJsonMessage(host, (message) => message.type === "relay-error");
      await expectNoProtocolMessage(viewer, (message) => message.type === "signal");
      const rejected = await waitForAuditRecord(
        auditSink,
        (record) => record.action === "relay.message.rejected" && record.reason === "Invalid relay message"
      );

      return { relayError, rejected };
    });

    expect(result.relayError.message).toEqual({
      type: "relay-error",
      reason: "Invalid relay message"
    });
    expect(result.relayError.raw).not.toContain(INHERITED_TO_JSON_PRIVATE_MARKER);
    expect(result.relayError.raw).not.toContain("raw-screen-content");
    expect(JSON.stringify(result.rejected)).not.toContain(INHERITED_TO_JSON_PRIVATE_MARKER);
    expect(JSON.stringify(result.rejected)).not.toContain("secret-token");
    expect(JSON.stringify(result.rejected)).not.toContain("123-456");
  });

  it("encodes same-role join relay errors without inherited toJSON hooks", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const host = await openSocket(runtime.url());
    const secondHost = await openSocket(runtime.url());

    host.send(joinMessage("session-demo", "host-1", "host", "123-456"));
    await waitForProtocolMessage(host, (message) => message.type === "relay-ready");

    const result = await withInheritedObjectToJsonHook(async () => {
      const relayError = waitForRawJsonMessage(secondHost, (message) => message.type === "relay-error");

      secondHost.send(joinMessage("session-demo", "host-2", "host", "999-000"));

      const denied = await waitForAuditRecord(
        auditSink,
        (record) =>
          record.action === "relay.peer.join.denied" &&
          record.reason === SAME_ROLE_RELAY_PEER_JOIN_REASON
      );

      return { relayError: await relayError, denied };
    });

    expect(result.relayError.message).toEqual({
      type: "relay-error",
      reason: SAME_ROLE_RELAY_PEER_JOIN_REASON
    });
    expect(result.relayError.raw).not.toContain(INHERITED_TO_JSON_PRIVATE_MARKER);
    expect(result.relayError.raw).not.toContain("raw-screen-content");
    expect(result.relayError.raw).not.toContain("999-000");
    expect(result.relayError.raw).not.toContain("123-456");
    expect(result.denied).toMatchObject({
      action: "relay.peer.join.denied",
      outcome: "denied",
      detail: {
        messageType: "join-session",
        pairing: {
          roleConflict: true
        }
      }
    });
    expect(JSON.stringify(result.denied)).not.toContain(INHERITED_TO_JSON_PRIVATE_MARKER);
    expect(JSON.stringify(result.denied)).not.toContain("999-000");
    expect(JSON.stringify(result.denied)).not.toContain("123-456");
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
          authorizationId: "authz-demo",
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
        authorizationId: "authz-demo",
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
    const cases: Array<{
      name: string;
      buildMessage: () => ProtocolEnvelope;
      grantMarker: string;
      rejectedType: ProtocolEnvelope["type"];
      privateMarker: string;
    }> = [
      {
        name: "legacy host consent decision",
        grantMarker: "input:keyboard",
        rejectedType: "host-consent-decision",
        privateMarker: "legacy-decision-private-marker",
        buildMessage: () => ({
          ...createMessageBase("session-demo"),
          type: "host-consent-decision",
          hostPeerId: "viewer-1",
          viewerPeerId: "viewer-1",
          approved: true,
          grantedPermissions: ["input:keyboard"],
          reason: "legacy-decision-private-marker"
        })
      },
      {
        name: "session authorization decision",
        grantMarker: "clipboard:write",
        rejectedType: "session-authorization-decision",
        privateMarker: "authorization-decision-private-marker",
        buildMessage: () => ({
          ...createMessageBase("session-demo"),
          type: "session-authorization-decision",
          authorizationId: "authz-demo",
          hostPeerId: "viewer-1",
          viewerPeerId: "viewer-1",
          decision: "approved",
          grantedPermissions: ["clipboard:write"],
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          reason: "authorization-decision-private-marker"
        })
      }
    ];

    for (const { buildMessage, grantMarker, name, privateMarker, rejectedType } of cases) {
      const auditSink = new MemoryAuditSink();
      const runtime = await startRuntime({ auditSink });
      const { host, viewer } = await joinPairedSession(runtime);

      const relayError = waitForJsonMessage(viewer, (message) => message.type === "relay-error");
      const noForwardedDecision = expectNoProtocolMessage(host, (message) => message.type === rejectedType);
      viewer.send(encodeProtocolEnvelope(buildMessage()));

      const [error] = await Promise.all([relayError, noForwardedDecision]);
      expect(error, name).toEqual({
        type: "relay-error",
        reason: "Message role does not match registered peer"
      });

      const rejected = await waitForAuditRecord(
        auditSink,
        (record) =>
          record.action === "relay.message.rejected" &&
          record.reason === "Message role does not match registered peer"
      );
      expect(rejected, name).toMatchObject({
        action: "relay.message.rejected",
        outcome: "failed",
        sessionId: "session-demo",
        detail: {
          registered: true
        }
      });
      expect(JSON.stringify(rejected), name).not.toContain(privateMarker);
      expect(JSON.stringify(rejected), name).not.toContain(grantMarker);
    }
  });

  it("forwards legacy host consent requests as viewer requests", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const { host, viewer } = await joinPairedSession(runtime);
    const request = {
      ...createMessageBase("session-demo"),
      type: "host-consent-required",
      viewerPeerId: "viewer-1",
      viewerDisplayName: "Viewer Private Display",
      requestedPermissions: ["screen:view"]
    } as const;

    viewer.send(encodeProtocolEnvelope(request));

    expect(
      await waitForProtocolMessage(host, (message) => message.type === "host-consent-required")
    ).toMatchObject({
      type: "host-consent-required",
      viewerPeerId: "viewer-1",
      requestedPermissions: ["screen:view"]
    });

    const forwarded = await waitForAuditRecord(
      auditSink,
      (record) =>
        record.action === "relay.message.forwarded" &&
        record.detail?.messageType === "host-consent-required"
    );
    expect(forwarded).toMatchObject({
      action: "relay.message.forwarded",
      actor: {
        id: "development-relay:viewer-1"
      },
      outcome: "accepted",
      sessionId: "session-demo",
      detail: {
        messageType: "host-consent-required",
        messageId: request.messageId,
        recipientPeerId: "host-1",
        recipientRole: "host"
      }
    });
    expect(forwarded.detail).toEqual({
      messageType: "host-consent-required",
      messageId: request.messageId,
      recipientPeerId: "host-1",
      recipientRole: "host"
    });
    expect(JSON.stringify(forwarded)).not.toContain("Viewer Private Display");
    expect(JSON.stringify(forwarded)).not.toContain("screen:view");
    expect(auditSink.records().some((record) => record.reason === "Message role does not match registered peer")).toBe(
      false
    );
  });

  it("rejects legacy host consent requests with untrimmed display names before forwarding", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const { host, viewer } = await joinPairedSession(runtime);
    const privateMarker = "Viewer Private Display";

    viewer.send(
      JSON.stringify({
        ...createMessageBase("session-demo"),
        type: "host-consent-required",
        viewerPeerId: "viewer-1",
        viewerDisplayName: ` ${privateMarker} `,
        requestedPermissions: ["screen:view"]
      })
    );

    expect(await waitForJsonMessage(viewer, (message) => message.type === "relay-error")).toEqual({
      type: "relay-error",
      reason: "Invalid relay message"
    });
    await expectNoProtocolMessage(host, (message) => message.type === "host-consent-required");

    const rejected = await waitForAuditRecord(
      auditSink,
      (record) => record.action === "relay.message.rejected" && record.reason === "Invalid relay message"
    );
    expect(rejected).toMatchObject({
      action: "relay.message.rejected",
      outcome: "failed",
      sessionId: "session-demo",
      reason: "Invalid relay message",
      detail: {
        registered: true
      }
    });
    expect(JSON.stringify(rejected)).not.toContain(privateMarker);
    expect(JSON.stringify(rejected)).not.toContain("screen:view");
  });

  it("rejects viewer-originated host workflow messages before forwarding", async () => {
    const cases: Array<{
      name: string;
      buildMessage: () => ProtocolEnvelope;
      rejectedType: ProtocolEnvelope["type"];
      privateMarker: string;
    }> = [
      {
        name: "authorization state",
        rejectedType: "session-authorization-state",
        privateMarker: "viewer-state-private-reason",
        buildMessage: () => ({
          ...createMessageBase("session-demo"),
          type: "session-authorization-state",
          authorizationId: "authz-demo",
          actorPeerId: "viewer-1",
          status: "active",
          visibleToHost: true,
          permissions: ["screen:view"],
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          reason: "viewer-state-private-reason"
        })
      },
      {
        name: "permission revoked",
        rejectedType: "permission-revoked",
        privateMarker: "viewer-revoke-private-reason",
        buildMessage: () => ({
          ...createMessageBase("session-demo"),
          type: "permission-revoked",
          authorizationId: "authz-demo",
          actorPeerId: "viewer-1",
          revokedPermission: "screen:view",
          reason: "viewer-revoke-private-reason"
        })
      },
      {
        name: "session control",
        rejectedType: "session-control",
        privateMarker: "viewer-control-private-reason",
        buildMessage: () => ({
          ...createMessageBase("session-demo"),
          type: "session-control",
          authorizationId: "authz-demo",
          actorPeerId: "viewer-1",
          action: "pause",
          reason: "viewer-control-private-reason"
        })
      },
      {
        name: "audit event",
        rejectedType: "audit-event",
        privateMarker: "viewer-audit-private-marker",
        buildMessage: () => ({
          ...createMessageBase("session-demo"),
          type: "audit-event",
          eventId: "audit_viewer_workflow",
          actorPeerId: "viewer-1",
          action: "agent-shell.viewer.workflow",
          outcome: "accepted",
          detail: {
            note: "viewer-audit-private-marker"
          }
        })
      }
    ];

    for (const { buildMessage, name, privateMarker, rejectedType } of cases) {
      const auditSink = new MemoryAuditSink();
      const runtime = await startRuntime({ auditSink });
      const { host, viewer } = await joinPairedSession(runtime);

      viewer.send(encodeProtocolEnvelope(buildMessage()));

      expect(await waitForJsonMessage(viewer, (message) => message.type === "relay-error"), name).toEqual({
        type: "relay-error",
        reason: "Message role does not match registered peer"
      });
      await expectNoProtocolMessage(host, (message) => message.type === rejectedType);

      const rejected = await waitForAuditRecord(
        auditSink,
        (record) =>
          record.action === "relay.message.rejected" &&
          record.reason === "Message role does not match registered peer"
      );
      expect(rejected, name).toMatchObject({
        action: "relay.message.rejected",
        outcome: "failed",
        sessionId: "session-demo",
        detail: {
          registered: true
        }
      });
      expect(JSON.stringify(rejected), name).not.toContain(privateMarker);
    }
  });

  it("rejects registered messages when no recipient peer is registered", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const host = await openSocket(runtime.url());

    host.send(joinMessage("session-demo", "host-1", "host", "123-456"));
    await waitForProtocolMessage(host, (message) => message.type === "relay-ready");
    const auditStart = auditSink.records().length;

    host.send(
      encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "signal",
        fromPeerId: "host-1",
        toPeerId: "viewer-1",
        payload: {
          authorizationId: "authz-demo",
          kind: "missing-recipient-private-marker"
        }
      })
    );

    expect(await waitForJsonMessage(host, (message) => message.type === "relay-error")).toEqual({
      type: "relay-error",
      reason: "No recipient peer is registered"
    });

    const rejected = await waitForAuditRecord(
      auditSink,
      (record) =>
        record.action === "relay.message.rejected" &&
        record.reason === "No recipient peer is registered",
      auditStart
    );
    expect(rejected).toMatchObject({
      action: "relay.message.rejected",
      outcome: "failed",
      sessionId: "session-demo",
      detail: {
        registered: true
      }
    });
    expect(auditSink.records().slice(auditStart).some((record) => record.action === "relay.message.forwarded")).toBe(false);
    expect(JSON.stringify(rejected)).not.toContain("missing-recipient-private-marker");
  });

  it("rejects registered messages after the recipient peer leaves", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const { host, viewer } = await joinPairedSession(runtime);

    viewer.close();
    await waitForProtocolMessage(host, (message) => message.type === "peer-disconnected");
    const auditStart = auditSink.records().length;

    host.send(
      encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "signal",
        fromPeerId: "host-1",
        toPeerId: "viewer-1",
        payload: {
          authorizationId: "authz-demo",
          kind: "departed-recipient-private-marker"
        }
      })
    );

    expect(await waitForJsonMessage(host, (message) => message.type === "relay-error")).toEqual({
      type: "relay-error",
      reason: "No recipient peer is registered"
    });

    const rejected = await waitForAuditRecord(
      auditSink,
      (record) =>
        record.action === "relay.message.rejected" &&
        record.reason === "No recipient peer is registered",
      auditStart
    );
    expect(rejected).toMatchObject({
      action: "relay.message.rejected",
      outcome: "failed",
      sessionId: "session-demo",
      detail: {
        registered: true
      }
    });
    expect(auditSink.records().slice(auditStart).some((record) => record.action === "relay.message.forwarded")).toBe(false);
    expect(JSON.stringify(rejected)).not.toContain("departed-recipient-private-marker");
  });

  it("rejects misaddressed signal targets before forwarding", async () => {
    const cases = [
      { name: "self target", toPeerId: "host-1" },
      { name: "unknown target", toPeerId: "viewer-2" }
    ];

    for (const { name, toPeerId } of cases) {
      const auditSink = new MemoryAuditSink();
      const runtime = await startRuntime({ auditSink });
      const { host, viewer } = await joinPairedSession(runtime);

      host.send(
        encodeProtocolEnvelope({
          ...createMessageBase("session-demo"),
          type: "signal",
          fromPeerId: "host-1",
          toPeerId,
          payload: {
            authorizationId: "authz-demo",
            kind: `wrong-target-private-marker-${toPeerId}`
          }
        })
      );

      expect(await waitForJsonMessage(host, (message) => message.type === "relay-error"), name).toEqual({
        type: "relay-error",
        reason: "Message target does not match registered recipient"
      });
      await expectNoProtocolMessage(viewer, (message) => message.type === "signal");

      const rejected = await waitForAuditRecord(
        auditSink,
        (record) =>
          record.action === "relay.message.rejected" &&
          record.reason === "Message target does not match registered recipient"
      );
      expect(rejected, name).toMatchObject({
        action: "relay.message.rejected",
        outcome: "failed",
        sessionId: "session-demo",
        detail: {
          registered: true
        }
      });
      expect(JSON.stringify(rejected), name).not.toContain(`wrong-target-private-marker-${toPeerId}`);
    }
  });

  it("rejects misaddressed authorization decisions before forwarding", async () => {
    const cases: Array<{
      name: string;
      buildMessage: () => ProtocolEnvelope;
      rejectedType: ProtocolEnvelope["type"];
      privateMarker: string;
    }> = [
      {
        name: "legacy host consent decision",
        rejectedType: "host-consent-decision",
        privateMarker: "legacy-target-private-marker",
        buildMessage: () => ({
          ...createMessageBase("session-demo"),
          type: "host-consent-decision",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-2",
          approved: true,
          grantedPermissions: ["screen:view"],
          reason: "legacy-target-private-marker"
        })
      },
      {
        name: "session authorization decision",
        rejectedType: "session-authorization-decision",
        privateMarker: "authorization-target-private-marker",
        buildMessage: () => ({
          ...createMessageBase("session-demo"),
          type: "session-authorization-decision",
          authorizationId: "authz-demo",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-2",
          decision: "approved",
          grantedPermissions: ["screen:view"],
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          reason: "authorization-target-private-marker"
        })
      }
    ];

    for (const { buildMessage, name, privateMarker, rejectedType } of cases) {
      const auditSink = new MemoryAuditSink();
      const runtime = await startRuntime({ auditSink });
      const { host, viewer } = await joinPairedSession(runtime);

      host.send(encodeProtocolEnvelope(buildMessage()));

      expect(await waitForJsonMessage(host, (message) => message.type === "relay-error"), name).toEqual({
        type: "relay-error",
        reason: "Message target does not match registered recipient"
      });
      await expectNoProtocolMessage(viewer, (message) => message.type === rejectedType);

      const rejected = await waitForAuditRecord(
        auditSink,
        (record) =>
          record.action === "relay.message.rejected" &&
          record.reason === "Message target does not match registered recipient"
      );
      expect(rejected, name).toMatchObject({
        action: "relay.message.rejected",
        outcome: "failed",
        sessionId: "session-demo",
        detail: {
          registered: true
        }
      });
      expect(JSON.stringify(rejected), name).not.toContain(privateMarker);
    }
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

  it("accepts joins with exactly one matching shared token", async () => {
    const auditSink = new MemoryAuditSink();
    const sharedToken = "correct-token";
    const runtime = await startRuntime({ auditSink, sharedToken });
    const tokenQuery = `token=${encodeURIComponent(sharedToken)}`;
    const host = await openSocket(`${runtime.url()}?${tokenQuery}`);
    const viewer = await openSocket(`${runtime.url()}?${tokenQuery}`);

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

    expect(auditSink.records().some((record) => record.action === "relay.token.denied")).toBe(
      false
    );
  });

  it("rejects token query parameters when no shared token is configured without logging raw tokens", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({ auditSink });
    const cases = [
      {
        name: "single token",
        query: "token=unexpected-token%20single-token-marker",
        markers: ["unexpected-token", "single-token-marker"]
      },
      {
        name: "case-variant token",
        query: "Token=unexpected-token%20case-token-marker",
        markers: ["unexpected-token", "case-token-marker"]
      },
      {
        name: "duplicate tokens",
        query: "token=unexpected-token%20duplicate-token-marker&token=second-token%20second-token-marker",
        markers: [
          "unexpected-token",
          "duplicate-token-marker",
          "second-token",
          "second-token-marker"
        ]
      }
    ];

    for (const { name, query, markers } of cases) {
      const auditStart = auditSink.records().length;
      const socket = await openSocket(`${runtime.url()}?${query}`);

      const close = await waitForClose(socket);
      expect(close, name).toEqual({
        code: 1008,
        reason: "Relay token is not configured"
      });

      const denied = auditSink
        .records()
        .slice(auditStart)
        .find((record) => record.action === "relay.token.denied");
      expect(denied, name).toBeDefined();
      expect(denied?.detail, name).toMatchObject({
        accessPresented: true,
        accessConfigured: false
      });
      expect(
        auditSink
          .records()
          .slice(auditStart)
          .some((record) => record.action === "relay.peer.join.accepted"),
        name
      ).toBe(false);

      const serialized = JSON.stringify(denied);
      for (const marker of markers) {
        expect(serialized, name).not.toContain(marker);
        expect(close.reason, name).not.toContain(marker);
      }
    }
  });

  it("rejects case-variant shared-token query names without logging raw tokens", async () => {
    const auditSink = new MemoryAuditSink();
    const configuredToken = "correct-token configured-token-marker";
    const runtime = await startRuntime({ auditSink, sharedToken: configuredToken });

    for (const tokenName of ["Token", "TOKEN"]) {
      const auditStart = auditSink.records().length;
      const socket = await openSocket(
        `${runtime.url()}?${tokenName}=${encodeURIComponent(configuredToken)}`
      );

      expect(await waitForClose(socket)).toEqual({
        code: 1008,
        reason: "Invalid relay token"
      });

      const denied = auditSink
        .records()
        .slice(auditStart)
        .find((record) => record.action === "relay.token.denied");
      expect(denied, tokenName).toBeDefined();
      expect(denied?.detail, tokenName).toMatchObject({
        accessPresented: true,
        accessConfigured: true
      });
      expect(
        auditSink
          .records()
          .slice(auditStart)
          .some((record) => record.action === "relay.peer.join.accepted"),
        tokenName
      ).toBe(false);

      const serialized = JSON.stringify(denied);
      expect(serialized, tokenName).not.toContain(configuredToken);
      expect(serialized, tokenName).not.toContain("configured-token-marker");
    }
  });

  it("audits invalid shared-token attempts without logging the raw token", async () => {
    const auditSink = new MemoryAuditSink();
    const configuredToken = "correct-token configured-token-marker";
    const presentedToken = "wrong-token presented-token-marker";
    const runtime = await startRuntime({ auditSink, sharedToken: configuredToken });
    const socket = await openSocket(`${runtime.url()}?token=${encodeURIComponent(presentedToken)}`);

    expect(await waitForClose(socket)).toEqual({
      code: 1008,
      reason: "Invalid relay token"
    });

    const denied = auditSink.records().find((record) => record.action === "relay.token.denied");
    expect(denied).toBeDefined();
    expect(JSON.stringify(denied)).not.toContain(presentedToken);
    expect(JSON.stringify(denied)).not.toContain(configuredToken);
    expect(JSON.stringify(denied)).not.toContain("presented-token-marker");
    expect(JSON.stringify(denied)).not.toContain("configured-token-marker");
    expect(denied?.detail).toMatchObject({
      accessPresented: true
    });
  });

  it("rejects padded presented shared tokens without logging raw tokens", async () => {
    const auditSink = new MemoryAuditSink();
    const configuredToken = "correct-token configured-token-marker";
    const presentedToken = ` ${configuredToken} `;
    const runtime = await startRuntime({ auditSink, sharedToken: configuredToken });
    const socket = await openSocket(`${runtime.url()}?token=${encodeURIComponent(presentedToken)}`);

    expect(await waitForClose(socket)).toEqual({
      code: 1008,
      reason: "Invalid relay token"
    });

    const denied = auditSink.records().find((record) => record.action === "relay.token.denied");
    expect(denied).toBeDefined();
    expect(denied?.detail).toMatchObject({
      accessPresented: true,
      accessConfigured: true
    });
    expect(JSON.stringify(denied)).not.toContain(configuredToken);
    expect(JSON.stringify(denied)).not.toContain(presentedToken);
    expect(JSON.stringify(denied)).not.toContain("configured-token-marker");
    expect(auditSink.records().some((record) => record.action === "relay.peer.join.accepted")).toBe(
      false
    );
  });

  it("rate-limits repeated invalid shared-token attempts without logging raw tokens", async () => {
    const auditSink = new MemoryAuditSink();
    const configuredToken = "correct-token configured-token-marker";
    const firstToken = "wrong-token first-presented-token-marker";
    const secondToken = "wrong-token second-presented-token-marker";
    const runtime = await startRuntime({
      auditSink,
      sharedToken: configuredToken,
      invalidTokenLimiter: new SlidingWindowRateLimiter({ limit: 1, windowMs: 60_000 })
    });

    const first = await openSocket(`${runtime.url()}?token=${encodeURIComponent(firstToken)}`);
    expect(await waitForClose(first)).toEqual({
      code: 1008,
      reason: "Invalid relay token"
    });

    const second = await openSocket(`${runtime.url()}?token=${encodeURIComponent(secondToken)}`);
    expect(await waitForClose(second)).toEqual({
      code: 1008,
      reason: "Relay token rate limit exceeded"
    });

    const denied = auditSink.records().filter((record) => record.action === "relay.token.denied");
    expect(denied).toHaveLength(2);
    expect(denied[0]?.detail).toMatchObject({
      accessPresented: true,
      accessConfigured: true,
      rateLimit: {
        allowed: true,
        limit: 1,
        remaining: 0
      }
    });
    expect(denied[1]?.detail).toMatchObject({
      accessPresented: true,
      accessConfigured: true,
      rateLimit: {
        allowed: false,
        limit: 1,
        remaining: 0
      }
    });

    const serialized = JSON.stringify(auditSink.records());
    expect(serialized).not.toContain(configuredToken);
    expect(serialized).not.toContain(firstToken);
    expect(serialized).not.toContain(secondToken);
    expect(serialized).not.toContain("configured-token-marker");
    expect(serialized).not.toContain("first-presented-token-marker");
    expect(serialized).not.toContain("second-presented-token-marker");
    expect(auditSink.records().some((record) => record.action === "relay.peer.join.accepted")).toBe(
      false
    );
  });

  it("rejects duplicate shared-token query parameters without logging raw tokens", async () => {
    const auditSink = new MemoryAuditSink();
    const configuredToken = "correct-token configured-token-marker";
    const duplicateToken = "duplicate-token duplicate-token-marker";
    const runtime = await startRuntime({ auditSink, sharedToken: configuredToken });
    const socket = await openSocket(
      `${runtime.url()}?token=${encodeURIComponent(configuredToken)}&token=${encodeURIComponent(duplicateToken)}`
    );

    expect(await waitForClose(socket)).toEqual({
      code: 1008,
      reason: "Invalid relay token"
    });

    const denied = auditSink.records().find((record) => record.action === "relay.token.denied");
    expect(denied).toBeDefined();
    expect(JSON.stringify(denied)).not.toContain(configuredToken);
    expect(JSON.stringify(denied)).not.toContain(duplicateToken);
    expect(JSON.stringify(denied)).not.toContain("configured-token-marker");
    expect(JSON.stringify(denied)).not.toContain("duplicate-token-marker");
    expect(denied?.detail).toMatchObject({
      accessPresented: true
    });
    expect(auditSink.records().some((record) => record.action === "relay.peer.join.accepted")).toBe(
      false
    );
  });

  it("parses development shared-token environment configuration", () => {
    expect(createRelaySharedTokenConfig({})).toBeUndefined();
    expect(
      createRelaySharedTokenConfig({ WINBRIDGE_RELAY_SHARED_TOKEN: "correct-token" })
    ).toBe("correct-token");
    expect(
      createRelaySharedTokenConfig({ WINBRIDGE_RELAY_SHARED_TOKEN: "x".repeat(1024) })
    ).toBe("x".repeat(1024));
  });

  it("rejects malformed development shared-token configuration", () => {
    for (const token of [
      "",
      "   ",
      " padded-token",
      "padded-token ",
      "dev\ntoken",
      "dev\u202etoken",
      "dev\u200btoken",
      "x".repeat(1025)
    ]) {
      expect(() =>
        createRelaySharedTokenConfig({ WINBRIDGE_RELAY_SHARED_TOKEN: token })
      ).toThrow("WINBRIDGE_RELAY_SHARED_TOKEN");
      expect(() => createRelayRuntime({ port: 0, sharedToken: token })).toThrow(
        "WINBRIDGE_RELAY_SHARED_TOKEN"
      );
    }

    for (const token of [null, 123]) {
      expect(() =>
        createRelayRuntime({ port: 0, sharedToken: token as unknown as string })
      ).toThrow("WINBRIDGE_RELAY_SHARED_TOKEN");
    }
  });

  it("rejects format-control shared-token configuration without exposing raw token text", () => {
    const token = "relay-secret\u202etoken-marker";

    expect(() =>
      createRelaySharedTokenConfig({ WINBRIDGE_RELAY_SHARED_TOKEN: token })
    ).toThrow("WINBRIDGE_RELAY_SHARED_TOKEN");

    try {
      createRelayRuntime({ port: 0, sharedToken: token });
      throw new Error("Expected format-control shared token to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain("relay-secret");
      expect((error as Error).message).not.toContain("token-marker");
      expect((error as Error).message).not.toContain(token);
    }
  });

  it("rejects untrimmed shared-token configuration without exposing raw token text", () => {
    const token = " relay-secret-token-marker ";

    expect(() =>
      createRelaySharedTokenConfig({ WINBRIDGE_RELAY_SHARED_TOKEN: token })
    ).toThrow("WINBRIDGE_RELAY_SHARED_TOKEN");

    try {
      createRelayRuntime({ port: 0, sharedToken: token });
      throw new Error("Expected untrimmed shared token to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain("relay-secret-token-marker");
      expect((error as Error).message).not.toContain(token);
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

  it("notifies the remaining peer with heartbeat timeout reason", async () => {
    const auditSink = new MemoryAuditSink();
    const runtime = await startRuntime({
      auditSink,
      heartbeat: {
        intervalMs: 20,
        timeoutMs: 60
      }
    });
    const host = await openSocket(runtime.url());
    const viewer = await openSocket(runtime.url(), { autoPong: false });

    host.send(joinMessage("session-demo", "host-1", "host", "123-456"));
    await waitForProtocolMessage(host, (message) => message.type === "relay-ready");
    viewer.send(joinMessage("session-demo", "viewer-1", "viewer", "123-456"));
    await waitForProtocolMessage(viewer, (message) => message.type === "relay-ready");

    const disconnectNotice = await waitForProtocolMessage(
      host,
      (message) => message.type === "peer-disconnected"
    );
    const disconnectAudit = await waitForAuditRecord(
      auditSink,
      (record) =>
        record.action === "relay.peer.disconnect" &&
        record.detail.reasonCode === "heartbeat-timeout"
    );

    expect(disconnectNotice).toMatchObject({
      type: "peer-disconnected",
      peerId: "viewer-1",
      role: "viewer",
      reasonCode: "heartbeat-timeout"
    });
    expect(disconnectAudit).toMatchObject({
      action: "relay.peer.disconnect",
      outcome: "accepted",
      sessionId: "session-demo",
      actor: {
        id: "development-relay:viewer-1"
      },
      detail: {
        role: "viewer",
        reasonCode: "heartbeat-timeout",
        notificationTargetCount: 1,
        notificationSentCount: 1,
        notificationFailedCount: 0
      }
    });
    expect(JSON.stringify(disconnectNotice)).not.toContain("123-456");
    expect(JSON.stringify(disconnectAudit)).not.toContain("123-456");
    expect(JSON.stringify(disconnectAudit)).not.toContain("Peer missed relay heartbeat");
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
    expect(() =>
      createRelayRuntime({
        port: 0,
        pairing: {
          ticketTtlMs: null as unknown as number
        }
      })
    ).toThrow("Pairing ticket TTL");
    expect(() =>
      createRelayRuntime({
        port: 0,
        pairing: {
          maxUses: Number.POSITIVE_INFINITY
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

  it("rejects malformed heartbeat enabled environment before relay startup", () => {
    const previousHeartbeatEnabled = process.env.WINBRIDGE_RELAY_HEARTBEAT_ENABLED;
    process.env.WINBRIDGE_RELAY_HEARTBEAT_ENABLED = " false ";

    try {
      expect(() =>
        createRelayRuntime({
          port: 0,
          auditSink: new MemoryAuditSink(),
          logger: silentLogger
        })
      ).toThrow("Heartbeat enabled flag");
    } finally {
      restoreEnv("WINBRIDGE_RELAY_HEARTBEAT_ENABLED", previousHeartbeatEnabled);
    }
  });

  it("rejects unsafe injected relay runtime ports before startup", () => {
    for (const port of [
      -1,
      1.5,
      65_536,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "8787",
      null
    ]) {
      expect(() =>
        createRelayRuntime({
          port: port as number,
          auditSink: new MemoryAuditSink(),
          heartbeat: false,
          logger: silentLogger
        })
      ).toThrow("Relay port");
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
  return waitForRawJsonMessage<T>(socket, predicate).then((result) => result.message);
}

function waitForRawJsonMessage<T extends Record<string, unknown>>(
  socket: WebSocket,
  predicate: (message: Record<string, unknown>) => boolean
): Promise<{ raw: string; message: T }> {
  return withTimeout(
    new Promise((resolve) => {
      const onMessage = (data: RawData) => {
        const raw = data.toString();
        const parsed = JSON.parse(raw) as Record<string, unknown>;

        if (predicate(parsed)) {
          socket.off("message", onMessage);
          resolve({ raw, message: parsed as T });
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

function expectNoAcceptedJoinAudit(auditSink: MemoryAuditSink, peerId: string): void {
  expect(
    auditSink.records().some((record) => {
      return (
        record.action === "relay.peer.join.accepted" &&
        record.actor.id === `development-relay:${peerId}`
      );
    })
  ).toBe(false);
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

async function withInheritedObjectToJsonHook<T>(callback: () => Promise<T>): Promise<T> {
  const objectToJson = Object.getOwnPropertyDescriptor(Object.prototype, "toJSON");
  Object.defineProperty(Object.prototype, "toJSON", {
    configurable: true,
    value: function inheritedRelayErrorToJson(this: Record<string, unknown>) {
      if (this.type !== "relay-error") {
        return this;
      }

      return {
        type: "relay-error",
        reason: "Injected relay error",
        injectedPrivateMarker: INHERITED_TO_JSON_PRIVATE_MARKER,
        screenContent: "raw-screen-content"
      };
    }
  });

  try {
    return await callback();
  } finally {
    restorePropertyDescriptor(Object.prototype, "toJSON", objectToJson);
  }
}

function restorePropertyDescriptor(
  target: object,
  key: string,
  descriptor: PropertyDescriptor | undefined
): void {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
    return;
  }

  delete (target as Record<string, unknown>)[key];
}
