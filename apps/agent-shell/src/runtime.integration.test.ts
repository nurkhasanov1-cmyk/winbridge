import { once } from "node:events";
import { readFileSync, rmSync, mkdtempSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileAuditSink, MemoryAuditSink, type AuditSink } from "@winbridge/audit-log";
import {
  createMessageBase,
  encodeProtocolEnvelope,
  type Permission,
  type ProtocolEnvelope
} from "@winbridge/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { createRelayRuntime, type RelayRuntime } from "../../relay/src/server.js";
import {
  createAgentShellRuntime,
  formatAgentShellErrorLog,
  type AgentShellEvent,
  type AgentShellReceivedProtocolEnvelope,
  type AgentShellSentProtocolEnvelope,
  type AgentShellRuntimeOptions,
  type AgentShellRuntime,
  type HostDecision
} from "./runtime.js";

type TestLogger = {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
};

const silentLogger: TestLogger = {
  log: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

const relayRuntimes: RelayRuntime[] = [];
const agentRuntimes: AgentShellRuntime[] = [];

afterEach(async () => {
  await Promise.all(agentRuntimes.splice(0).map((runtime) => runtime.stop()));
  await Promise.all(relayRuntimes.splice(0).map((runtime) => runtime.stop()));
});

describe("agent shell consent workflow", () => {
  it("rejects malformed runtime host decisions before relay startup", () => {
    expect(() =>
      createAgentShellRuntime(createRuntimeOptions({
        hostDecision: "approve-later" as HostDecision,
        logger: silentLogger
      }))
    ).toThrow("Host decision must be one of: none, approve, deny");
  });

  it("rejects malformed direct runtime options before relay startup", () => {
    const cases: Array<[string, Partial<AgentShellRuntimeOptions>, string]> = [
      [
        "non-websocket relay URL",
        { relayUrl: "http://127.0.0.1:8787" },
        "Runtime relay URL"
      ],
      ["malformed role", { role: "controller" as AgentShellRuntimeOptions["role"] }, "Runtime role"],
      ["malformed session id", { sessionId: "session demo" }, "Runtime protocol identifiers"],
      ["malformed pairing code", { pairingCode: "secret" }, "Runtime protocol identifiers"],
      ["malformed peer id", { peerId: "host/1" }, "Runtime protocol identifiers"],
      ["malformed device id", { deviceId: "dev1" }, "Runtime protocol identifiers"],
      ["blank display name", { displayName: "   " }, "Runtime display name"],
      ["blank token", { token: "   " }, "Runtime token"],
      [
        "invalid requested permission",
        { requestedPermissions: ["input:keylogger" as Permission] },
        "Runtime requested permissions"
      ],
      [
        "duplicate requested permission",
        { requestedPermissions: ["screen:view", "screen:view"] },
        "Runtime requested permissions"
      ],
      [
        "oversized requested permissions",
        { requestedPermissions: new Array<Permission>(17).fill("screen:view") },
        "Runtime requested permissions"
      ],
      [
        "invalid revoke permission",
        { hostRevokePermission: "input:keylogger" as Permission },
        "Runtime revoke permission"
      ],
      [
        "non-boolean visible state",
        { visibleToHost: "false" as unknown as boolean },
        "Runtime visibleToHost"
      ],
      ["unsafe workflow timer", { hostPauseAfterMs: 2_147_483_648 }, "Runtime workflow timer"],
      ["blank decision reason", { decisionReason: "   " }, "Runtime workflow reasons"],
      [
        "oversized lifecycle reason",
        { hostTerminateReason: "x".repeat(241) },
        "Runtime workflow reasons"
      ]
    ];

    for (const [name, overrides, expectedMessage] of cases) {
      expect(
        () => createAgentShellRuntime(createRuntimeOptions(overrides)),
        name
      ).toThrow(expectedMessage);
    }
  });

  it("redacts pairing codes from sent join-session events", async () => {
    const { hostEvents } = await startRelayAndHost();

    const sentJoin = hostEvents.find(
      (event) => event.direction === "sent" && event.message.type === "join-session"
    );

    expect(sentJoin).toBeDefined();
    expect(sentJoin?.direction === "sent" && sentJoin.message.type === "join-session"
      ? sentJoin.message.pairingCode
      : "").toBe("[REDACTED]");
    expect(JSON.stringify(hostEvents.filter((event) => event.direction === "sent"))).not.toContain(
      "123-456"
    );
  });

  it("defers hello until the relay reports a recipient", async () => {
    const hostLogs: string[] = [];
    const { hostEvents } = await startRelayAndHost({
      hostLogger: captureLogger(hostLogs)
    });

    await waitForMessage(
      hostEvents,
      (message) => message.type === "relay-ready" && message.peerId === "host-1" && message.roomSize === 1
    );
    await delay(100);

    expect(
      hostEvents.filter((event) => event.direction === "sent" && event.message.type === "join-session")
    ).toHaveLength(1);
    expect(
      hostEvents.filter((event) => event.direction === "sent" && event.message.type === "hello")
    ).toHaveLength(0);
    expect(hostEvents.some((event) => event.direction === "raw")).toBe(false);
    expect(hostEvents.some((event) => event.direction === "error")).toBe(false);
    expect(hostLogs.join("\n")).not.toContain("received non-protocol message");
    expect(hostLogs.join("\n")).not.toContain("relay-error");
  });

  it("exchanges hello once after peers are paired before authorization requests", async () => {
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost();
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    const viewerHello = await waitForSentMessage(viewerEvents, (message) => message.type === "hello");
    const hostReceivedViewerHello = await waitForMessage(
      hostEvents,
      (message) => message.type === "hello" && message.peerId === "viewer-1"
    );
    const hostHello = await waitForSentMessage(hostEvents, (message) => message.type === "hello");
    const viewerReceivedHostHello = await waitForMessage(
      viewerEvents,
      (message) => message.type === "hello" && message.peerId === "host-1"
    );
    const request = await waitForMessage(
      hostEvents,
      (message) => message.type === "session-authorization-request"
    );

    expect(viewerHello).toMatchObject({ type: "hello", peerId: "viewer-1", role: "viewer" });
    expect(hostReceivedViewerHello).toMatchObject({ type: "hello", peerId: "viewer-1", role: "viewer" });
    expect(hostHello).toMatchObject({ type: "hello", peerId: "host-1", role: "host" });
    expect(viewerReceivedHostHello).toMatchObject({ type: "hello", peerId: "host-1", role: "host" });
    expect(request).toMatchObject({
      type: "session-authorization-request",
      viewerPeerId: "viewer-1",
      requestedPermissions: ["screen:view"]
    });

    expect(
      hostEvents.filter((event) => event.direction === "sent" && event.message.type === "hello")
    ).toHaveLength(1);
    expect(
      viewerEvents.filter((event) => event.direction === "sent" && event.message.type === "hello")
    ).toHaveLength(1);

    const hostReceivedHelloIndex = hostEvents.findIndex(
      (event) => event.direction === "received" && event.message.type === "hello"
    );
    const hostSentHelloIndex = hostEvents.findIndex(
      (event) => event.direction === "sent" && event.message.type === "hello"
    );
    const hostReceivedRequestIndex = hostEvents.findIndex(
      (event) => event.direction === "received" && event.message.type === "session-authorization-request"
    );

    expect(hostReceivedHelloIndex).toBeGreaterThanOrEqual(0);
    expect(hostSentHelloIndex).toBeGreaterThan(hostReceivedHelloIndex);
    expect(hostReceivedRequestIndex).toBeGreaterThan(hostSentHelloIndex);
  });

  it("emits sent signal events without raw payload contents", async () => {
    const { host, hostEvents } = await startRelayAndHost();
    await waitForMessage(
      hostEvents,
      (message) => message.type === "relay-ready" && message.peerId === "host-1"
    );

    const signalPayload = {
      kind: "offer",
      sdp: "outbound-offer-data",
      nested: { candidate: "outbound-candidate" }
    };
    host.send({
      ...createMessageBase("session-demo"),
      type: "signal",
      fromPeerId: "host-1",
      toPeerId: "viewer-1",
      payload: signalPayload
    });

    const sentSignal = hostEvents.find(
      (event) => event.direction === "sent" && event.message.type === "signal"
    );

    expect(sentSignal).toBeDefined();
    expect(sentSignal?.direction === "sent" && sentSignal.message.type === "signal"
      ? sentSignal.message
      : {}).toMatchObject({
      type: "signal",
      fromPeerId: "host-1",
      toPeerId: "viewer-1",
      payload: {
        redacted: "[REDACTED]",
        byteLength: Buffer.byteLength(JSON.stringify(signalPayload))
      }
    });
    expect(JSON.stringify(sentSignal)).not.toContain("outbound-offer-data");
    expect(JSON.stringify(sentSignal)).not.toContain("outbound-candidate");
  });

  it("sends viewer authorization requests through the relay to the host", async () => {
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost();
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    const request = await waitForMessage(
      hostEvents,
      (message) => message.type === "session-authorization-request"
    );

    expect(request).toMatchObject({
      type: "session-authorization-request",
      viewerPeerId: "viewer-1",
      requestedPermissions: ["screen:view"]
    });
  });

  it("does not send viewer authorization requests before the room is paired", async () => {
    const onePeerServer = await startOnePeerReadyServer();
    const viewerEvents: AgentShellEvent[] = [];
    let viewer: AgentShellRuntime | undefined;

    try {
      viewer = await startViewer(onePeerServer.url, ["screen:view"], viewerEvents);

      await waitForMessage(
        viewerEvents,
        (message) => message.type === "relay-ready" && message.peerId === "viewer-1" && message.roomSize === 1
      );
      await delay(100);

      expect(
        viewerEvents.filter((event) => event.direction === "sent" && event.message.type === "hello")
      ).toHaveLength(0);
      expect(
        viewerEvents.filter(
          (event) => event.direction === "sent" && event.message.type === "session-authorization-request"
        )
      ).toHaveLength(0);
    } finally {
      await viewer?.stop();
      await onePeerServer.stop();
    }
  });

  it("does not send a host decision when host decision is omitted", async () => {
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost();
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(hostEvents, (message) => message.type === "session-authorization-request");
    await delay(100);

    expect(
      viewerEvents.some(
        (event) =>
          event.direction === "received" &&
          event.message.type === "session-authorization-decision"
      )
    ).toBe(false);
  });

  it("sends approved decision and active visible state when host explicitly approves visibly", async () => {
    const { relay, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    const decision = await waitForMessage(
      viewerEvents,
      (message) => message.type === "session-authorization-decision"
    );
    const state = await waitForMessage(
      viewerEvents,
      (message) => message.type === "session-authorization-state"
    );

    expect(decision).toMatchObject({
      type: "session-authorization-decision",
      decision: "approved",
      grantedPermissions: ["screen:view"]
    });
    expect(state).toMatchObject({
      type: "session-authorization-state",
      status: "active",
      visibleToHost: true,
      permissions: ["screen:view"]
    });
  });

  it("withholds active state when host approves without visible session state", async () => {
    const { relay, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      visibleToHost: false
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(viewerEvents, (message) => message.type === "session-authorization-decision");
    await delay(100);

    expect(
      viewerEvents.some(
        (event) => event.direction === "received" && event.message.type === "session-authorization-state"
      )
    ).toBe(false);
  });

  it("sends audit events for approval and visible activation", async () => {
    const { relay, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    const approvalAudit = await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "audit-event" &&
        message.action === "agent-shell.authorization.approved"
    );
    const activeAudit = await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "audit-event" &&
        message.action === "agent-shell.authorization.active"
    );

    expect(approvalAudit).toMatchObject({
      type: "audit-event",
      outcome: "accepted",
      detail: {
        requestedPermissionCount: 1,
        grantedPermissionCount: 1
      }
    });
    expect(activeAudit).toMatchObject({
      type: "audit-event",
      outcome: "accepted",
      detail: {
        grantedPermissionCount: 1,
        visibleToHost: true
      }
    });
    expect(JSON.stringify([approvalAudit, activeAudit])).not.toContain("123-456");
  });

  it("persists host approval and visible activation audit records", async () => {
    const hostAuditSink = new MemoryAuditSink();
    const { relay, viewerEvents } = await startRelayAndHost({
      hostAuditSink,
      hostDecision: "approve",
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    const approvalAudit = await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "audit-event" &&
        message.action === "agent-shell.authorization.approved"
    );
    const activeAudit = await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "audit-event" &&
        message.action === "agent-shell.authorization.active"
    );

    expect(hostAuditSink.records()).toEqual([
      expect.objectContaining({
        eventId: approvalAudit.type === "audit-event" ? approvalAudit.eventId : "",
        actor: {
          type: "host",
          id: "host-1",
          deviceId: "dev_host_1"
        },
        sessionId: "session-demo",
        action: "agent-shell.authorization.approved",
        outcome: "accepted",
        detail: {
          requestedPermissionCount: 1,
          grantedPermissionCount: 1
        }
      }),
      expect.objectContaining({
        eventId: activeAudit.type === "audit-event" ? activeAudit.eventId : "",
        actor: {
          type: "host",
          id: "host-1",
          deviceId: "dev_host_1"
        },
        sessionId: "session-demo",
        action: "agent-shell.authorization.active",
        outcome: "accepted",
        detail: {
          grantedPermissionCount: 1,
          visibleToHost: true
        }
      })
    ]);
    expect(JSON.stringify(hostAuditSink.records())).not.toContain("123-456");
  });

  it("sends a secret-safe audit event when host denies authorization", async () => {
    const { relay, viewerEvents } = await startRelayAndHost({
      decisionReason: "private denial reason",
      hostDecision: "deny"
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    const denialAudit = await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "audit-event" &&
        message.action === "agent-shell.authorization.denied"
    );

    expect(denialAudit).toMatchObject({
      type: "audit-event",
      outcome: "denied",
      detail: {
        requestedPermissionCount: 1,
        reasonConfigured: true
      }
    });
    expect(JSON.stringify(denialAudit)).not.toContain("private denial reason");
  });

  it("redacts protocol reason text from sent and received runtime events", async () => {
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost({
      decisionReason: "private denial reason",
      hostDecision: "deny"
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    const sentDecision = await waitForSentMessage(
      hostEvents,
      (message) =>
        message.type === "session-authorization-decision" &&
        message.decision === "denied"
    );
    const receivedDecision = await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-decision" &&
        message.decision === "denied"
    );

    expect(sentDecision).toMatchObject({
      type: "session-authorization-decision",
      decision: "denied",
      reason: "[REDACTED]"
    });
    expect(receivedDecision).toMatchObject({
      type: "session-authorization-decision",
      decision: "denied",
      reason: "[REDACTED]"
    });
    expect(JSON.stringify(sentDecision)).not.toContain("private denial reason");
    expect(JSON.stringify(receivedDecision)).not.toContain("private denial reason");
  });

  it("persists host denial audit records without raw private reason text", async () => {
    const root = mkdtempSync(join(tmpdir(), "winbridge-agent-audit-"));
    const auditPath = join(root, "agent-audit.jsonl");

    try {
      const { relay, viewerEvents } = await startRelayAndHost({
        decisionReason: "private denial reason",
        hostAuditSink: new FileAuditSink(auditPath),
        hostDecision: "deny"
      });
      await startViewer(relay.url(), ["screen:view"], viewerEvents);

      const denialAudit = await waitForMessage(
        viewerEvents,
        (message) =>
          message.type === "audit-event" &&
          message.action === "agent-shell.authorization.denied"
      );
      const lines = readFileSync(auditPath, "utf8").trim().split(/\r?\n/);
      const persisted = JSON.parse(lines[0] ?? "{}");

      expect(lines).toHaveLength(1);
      expect(persisted).toMatchObject({
        eventId: denialAudit.type === "audit-event" ? denialAudit.eventId : "",
        actor: {
          type: "host",
          id: "host-1",
          deviceId: "dev_host_1"
        },
        sessionId: "session-demo",
        action: "agent-shell.authorization.denied",
        outcome: "denied",
        detail: {
          requestedPermissionCount: 1,
          reasonConfigured: true
        }
      });
      expect(JSON.stringify(persisted)).not.toContain("private denial reason");
      expect(JSON.stringify(persisted)).not.toContain("123-456");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("sends revoked state after host revokes the only granted permission", async () => {
    const { relay, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      hostRevokeAfterMs: 10,
      hostRevokePermission: "screen:view",
      hostRevokeReason: "private revoke reason",
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) => message.type === "session-authorization-state" && message.status === "active"
    );
    const revoked = await waitForMessage(
      viewerEvents,
      (message) => message.type === "permission-revoked"
    );
    const revokedState = await waitForMessage(
      viewerEvents,
      (message) => message.type === "session-authorization-state" && message.status === "revoked"
    );
    const revokeAudit = await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "audit-event" &&
        message.action === "agent-shell.permission.revoked"
    );

    expect(revoked).toMatchObject({
      type: "permission-revoked",
      revokedPermission: "screen:view"
    });
    expect(revokedState).toMatchObject({
      type: "session-authorization-state",
      status: "revoked",
      visibleToHost: true,
      permissions: []
    });
    expect(revokeAudit).toMatchObject({
      type: "audit-event",
      outcome: "accepted",
      detail: {
        revokedPermission: "screen:view",
        remainingPermissionCount: 0,
        finalGrantRevoked: true
      }
    });
    expect(JSON.stringify(revokeAudit)).not.toContain("private revoke reason");
  });

  it("keeps remaining permissions active after host revokes one granted permission", async () => {
    const { relay, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      hostRevokeAfterMs: 10,
      hostRevokePermission: "screen:view",
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view", "input:pointer"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) => message.type === "permission-revoked" && message.revokedPermission === "screen:view"
    );
    const partialState = await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "active" &&
        !message.permissions.includes("screen:view")
    );
    const revokeAudit = await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "audit-event" &&
        message.action === "agent-shell.permission.revoked"
    );

    expect(partialState).toMatchObject({
      type: "session-authorization-state",
      status: "active",
      visibleToHost: true,
      permissions: ["input:pointer"]
    });
    expect(revokeAudit).toMatchObject({
      type: "audit-event",
      outcome: "accepted",
      detail: {
        revokedPermission: "screen:view",
        remainingPermissionCount: 1,
        finalGrantRevoked: false
      }
    });
  });

  it("does not send revoke messages when visible active state is withheld", async () => {
    const { relay, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      hostRevokeAfterMs: 10,
      hostRevokePermission: "screen:view",
      visibleToHost: false
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(viewerEvents, (message) => message.type === "session-authorization-decision");
    await delay(50);

    expect(
      viewerEvents.some(
        (event) => event.direction === "received" && event.message.type === "permission-revoked"
      )
    ).toBe(false);
  });

  it("does not send revoke when authorization reaches the ttl boundary first", async () => {
    const { relay, viewerEvents } = await startRelayAndHost({
      authorizationTtlMs: 0,
      hostDecision: "approve",
      hostRevokeAfterMs: 0,
      hostRevokePermission: "screen:view",
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "expired"
    );
    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "audit-event" &&
        message.action === "agent-shell.authorization.expired"
    );
    await delay(40);

    expect(
      viewerEvents.some(
        (event) => event.direction === "received" && event.message.type === "permission-revoked"
      )
    ).toBe(false);
    expect(
      viewerEvents.some(
        (event) =>
          event.direction === "received" &&
          event.message.type === "session-authorization-state" &&
          event.message.status === "revoked"
      )
    ).toBe(false);
    expect(
      viewerEvents.some(
        (event) =>
          event.direction === "received" &&
          event.message.type === "audit-event" &&
          event.message.action === "agent-shell.permission.revoked"
      )
    ).toBe(false);
  });

  it("sends terminated state and audit after host terminates visible session", async () => {
    const { relay, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      hostTerminateAfterMs: 10,
      hostTerminateReason: "private terminate reason",
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view", "input:pointer"], viewerEvents);

    const control = await waitForMessage(
      viewerEvents,
      (message) => message.type === "session-control" && message.action === "terminate"
    );
    const terminatedState = await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "terminated"
    );
    const terminateAudit = await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "audit-event" &&
        message.action === "agent-shell.authorization.terminated"
    );

    expect(control).toMatchObject({
      type: "session-control",
      action: "terminate",
      actorPeerId: "host-1"
    });
    expect(terminatedState).toMatchObject({
      type: "session-authorization-state",
      status: "terminated",
      visibleToHost: true,
      permissions: []
    });
    expect(terminateAudit).toMatchObject({
      type: "audit-event",
      outcome: "accepted",
      detail: {
        previouslyGrantedPermissionCount: 2,
        visibleToHost: true,
        terminated: true
      }
    });
    expect(JSON.stringify(terminateAudit)).not.toContain("private terminate reason");
  });

  it("does not send terminate messages when visible active state is withheld", async () => {
    const { relay, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      hostTerminateAfterMs: 10,
      visibleToHost: false
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(viewerEvents, (message) => message.type === "session-authorization-decision");
    await delay(50);

    expect(
      viewerEvents.some(
        (event) =>
          event.direction === "received" &&
          event.message.type === "session-control" &&
          event.message.action === "terminate"
      )
    ).toBe(false);
    expect(
      viewerEvents.some(
        (event) =>
          event.direction === "received" &&
          event.message.type === "session-authorization-state" &&
          event.message.status === "terminated"
      )
    ).toBe(false);
  });

  it("does not send terminate when authorization reaches the ttl boundary first", async () => {
    const { relay, viewerEvents } = await startRelayAndHost({
      authorizationTtlMs: 0,
      hostDecision: "approve",
      hostTerminateAfterMs: 0,
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "expired"
    );
    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "audit-event" &&
        message.action === "agent-shell.authorization.expired"
    );
    await delay(40);

    expect(
      viewerEvents.some(
        (event) =>
          event.direction === "received" &&
          event.message.type === "session-control" &&
          event.message.action === "terminate"
      )
    ).toBe(false);
    expect(
      viewerEvents.some(
        (event) =>
          event.direction === "received" &&
          event.message.type === "session-authorization-state" &&
          event.message.status === "terminated"
      )
    ).toBe(false);
    expect(
      viewerEvents.some(
        (event) =>
          event.direction === "received" &&
          event.message.type === "audit-event" &&
          event.message.action === "agent-shell.authorization.terminated"
      )
    ).toBe(false);
  });

  it("does not send later revoke messages after termination", async () => {
    const { relay, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      hostRevokeAfterMs: 30,
      hostRevokePermission: "screen:view",
      hostTerminateAfterMs: 10,
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "terminated"
    );
    await delay(60);

    expect(
      viewerEvents.some(
        (event) => event.direction === "received" && event.message.type === "permission-revoked"
      )
    ).toBe(false);
  });

  it("sends paused state and audit after host pauses visible session", async () => {
    const { relay, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      hostPauseAfterMs: 10,
      hostPauseReason: "private pause reason",
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view", "input:pointer"], viewerEvents);

    const control = await waitForMessage(
      viewerEvents,
      (message) => message.type === "session-control" && message.action === "pause"
    );
    const pausedState = await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "paused"
    );
    const pauseAudit = await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "audit-event" &&
        message.action === "agent-shell.authorization.paused"
    );

    expect(control).toMatchObject({
      type: "session-control",
      action: "pause",
      actorPeerId: "host-1"
    });
    expect(pausedState).toMatchObject({
      type: "session-authorization-state",
      status: "paused",
      visibleToHost: true,
      permissions: ["screen:view", "input:pointer"]
    });
    expect(pauseAudit).toMatchObject({
      type: "audit-event",
      outcome: "accepted",
      detail: {
        grantedPermissionCount: 2,
        visibleToHost: true,
        paused: true,
        reasonConfigured: true
      }
    });
    expect(JSON.stringify(pauseAudit)).not.toContain("private pause reason");
  });

  it("sends active state and audit after host resumes paused session", async () => {
    const { relay, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      hostPauseAfterMs: 10,
      hostResumeAfterMs: 10,
      hostResumeReason: "private resume reason",
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) => message.type === "session-control" && message.action === "pause"
    );
    const resumeControl = await waitForMessage(
      viewerEvents,
      (message) => message.type === "session-control" && message.action === "resume"
    );
    const resumeAudit = await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "audit-event" &&
        message.action === "agent-shell.authorization.resumed"
    );
    const activeStates = viewerEvents.flatMap((event) =>
      event.direction === "received" &&
      event.message.type === "session-authorization-state" &&
      event.message.status === "active"
        ? [event.message]
        : []
    );

    expect(resumeControl).toMatchObject({
      type: "session-control",
      action: "resume",
      actorPeerId: "host-1"
    });
    expect(activeStates).toHaveLength(2);
    expect(activeStates.at(-1)).toMatchObject({
      type: "session-authorization-state",
      status: "active",
      visibleToHost: true,
      permissions: ["screen:view"]
    });
    expect(resumeAudit).toMatchObject({
      type: "audit-event",
      outcome: "accepted",
      detail: {
        grantedPermissionCount: 1,
        visibleToHost: true,
        resumed: true,
        reasonConfigured: true
      }
    });
    expect(JSON.stringify(resumeAudit)).not.toContain("private resume reason");
  });

  it("persists configured pause and resume lifecycle audit records", async () => {
    const hostAuditSink = new MemoryAuditSink();
    const { relay, viewerEvents } = await startRelayAndHost({
      hostAuditSink,
      hostDecision: "approve",
      hostPauseAfterMs: 10,
      hostResumeAfterMs: 10,
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "audit-event" &&
        message.action === "agent-shell.authorization.resumed"
    );

    expect(hostAuditSink.records().map((record) => record.action)).toEqual([
      "agent-shell.authorization.approved",
      "agent-shell.authorization.active",
      "agent-shell.authorization.paused",
      "agent-shell.authorization.resumed"
    ]);
    expect(JSON.stringify(hostAuditSink.records())).not.toContain("123-456");
  });

  it("persists host workflow audit records without raw display names or lifecycle markers", async () => {
    const root = mkdtempSync(join(tmpdir(), "winbridge-agent-audit-"));
    const auditPath = join(root, "agent-audit.jsonl");
    const hostDisplayName = "Private Host Display signal-payload-marker";
    const viewerDisplayName = "Private Viewer Display protocol-payload-marker";
    const pauseReason = "private-pause-reason signal-payload-marker";
    const resumeReason = "private-resume-reason protocol-payload-marker";
    const terminateReason = "private-terminate-reason lifecycle-marker";

    try {
      const { relay, viewerEvents } = await startRelayAndHost({
        hostAuditSink: new FileAuditSink(auditPath),
        hostDecision: "approve",
        hostDisplayName,
        hostPauseAfterMs: 10,
        hostPauseReason: pauseReason,
        hostResumeAfterMs: 10,
        hostResumeReason: resumeReason,
        hostTerminateAfterMs: 45,
        hostTerminateReason: terminateReason,
        visibleToHost: true
      });
      await startViewer(
        relay.url(),
        ["screen:view"],
        viewerEvents,
        silentLogger,
        undefined,
        viewerDisplayName
      );

      const terminatedAudit = await waitForMessage(
        viewerEvents,
        (message) =>
          message.type === "audit-event" &&
          message.action === "agent-shell.authorization.terminated"
      );
      const persisted = readFileSync(auditPath, "utf8")
        .trim()
        .split(/\r?\n/)
        .map((line) => JSON.parse(line));

      expect(persisted.map((record) => record.action)).toEqual([
        "agent-shell.authorization.approved",
        "agent-shell.authorization.active",
        "agent-shell.authorization.paused",
        "agent-shell.authorization.resumed",
        "agent-shell.authorization.terminated"
      ]);
      expect(persisted).toEqual([
        expect.objectContaining({
          actor: {
            type: "host",
            id: "host-1",
            deviceId: "dev_host_1"
          },
          sessionId: "session-demo",
          action: "agent-shell.authorization.approved",
          outcome: "accepted",
          detail: {
            requestedPermissionCount: 1,
            grantedPermissionCount: 1
          }
        }),
        expect.objectContaining({
          actor: {
            type: "host",
            id: "host-1",
            deviceId: "dev_host_1"
          },
          sessionId: "session-demo",
          action: "agent-shell.authorization.active",
          outcome: "accepted",
          detail: {
            grantedPermissionCount: 1,
            visibleToHost: true
          }
        }),
        expect.objectContaining({
          actor: {
            type: "host",
            id: "host-1",
            deviceId: "dev_host_1"
          },
          sessionId: "session-demo",
          action: "agent-shell.authorization.paused",
          outcome: "accepted",
          detail: {
            grantedPermissionCount: 1,
            visibleToHost: true,
            paused: true,
            reasonConfigured: true
          }
        }),
        expect.objectContaining({
          actor: {
            type: "host",
            id: "host-1",
            deviceId: "dev_host_1"
          },
          sessionId: "session-demo",
          action: "agent-shell.authorization.resumed",
          outcome: "accepted",
          detail: {
            grantedPermissionCount: 1,
            visibleToHost: true,
            resumed: true,
            reasonConfigured: true
          }
        }),
        expect.objectContaining({
          eventId: terminatedAudit.type === "audit-event" ? terminatedAudit.eventId : "",
          actor: {
            type: "host",
            id: "host-1",
            deviceId: "dev_host_1"
          },
          sessionId: "session-demo",
          action: "agent-shell.authorization.terminated",
          outcome: "accepted",
          detail: {
            previouslyGrantedPermissionCount: 1,
            visibleToHost: true,
            terminated: true
          }
        })
      ]);

      const persistedJson = JSON.stringify(persisted);
      for (const unsafeMarker of [
        "Private Host Display",
        "Private Viewer Display",
        "private-pause-reason",
        "private-resume-reason",
        "private-terminate-reason",
        "lifecycle-marker",
        "signal-payload-marker",
        "protocol-payload-marker",
        "123-456"
      ]) {
        expect(persistedJson).not.toContain(unsafeMarker);
      }
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("does not send pause or resume messages when visible active state is withheld", async () => {
    const { relay, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      hostPauseAfterMs: 10,
      hostResumeAfterMs: 10,
      visibleToHost: false
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(viewerEvents, (message) => message.type === "session-authorization-decision");
    await delay(50);

    expect(
      viewerEvents.some(
        (event) =>
          event.direction === "received" &&
          event.message.type === "session-control" &&
          (event.message.action === "pause" || event.message.action === "resume")
      )
    ).toBe(false);
    expect(
      viewerEvents.some(
        (event) =>
          event.direction === "received" &&
          event.message.type === "session-authorization-state" &&
          event.message.status === "paused"
      )
    ).toBe(false);
  });

  it("keeps authorization paused after partial permission revocation", async () => {
    const { relay, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      hostPauseAfterMs: 10,
      hostRevokeAfterMs: 20,
      hostRevokePermission: "screen:view",
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view", "input:pointer"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "paused"
    );
    const partialRevokeState = await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "paused" &&
        !message.permissions.includes("screen:view")
    );

    expect(partialRevokeState).toMatchObject({
      type: "session-authorization-state",
      status: "paused",
      visibleToHost: true,
      permissions: ["input:pointer"]
    });
  });

  it("does not send pause or resume after expiration", async () => {
    const { relay, viewerEvents } = await startRelayAndHost({
      authorizationTtlMs: 10,
      hostDecision: "approve",
      hostPauseAfterMs: 30,
      hostResumeAfterMs: 10,
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "expired"
    );
    await delay(60);

    expect(
      viewerEvents.some(
        (event) =>
          event.direction === "received" &&
          event.message.type === "session-control" &&
          (event.message.action === "pause" || event.message.action === "resume")
      )
    ).toBe(false);
  });

  it("does not send pause when authorization reaches the ttl boundary first", async () => {
    const { relay, viewerEvents } = await startRelayAndHost({
      authorizationTtlMs: 0,
      hostDecision: "approve",
      hostPauseAfterMs: 0,
      hostResumeAfterMs: 10,
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "expired"
    );
    await delay(40);

    expect(
      viewerEvents.some(
        (event) =>
          event.direction === "received" &&
          event.message.type === "session-control" &&
          event.message.action === "pause"
      )
    ).toBe(false);
    expect(
      viewerEvents.some(
        (event) =>
          event.direction === "received" &&
          event.message.type === "session-authorization-state" &&
          event.message.status === "paused"
      )
    ).toBe(false);
  });

  it("does not send resume after authorization expires while paused", async () => {
    const { relay, viewerEvents } = await startRelayAndHost({
      authorizationTtlMs: 120,
      hostDecision: "approve",
      hostPauseAfterMs: 10,
      hostResumeAfterMs: 180,
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "paused"
    );
    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "expired"
    );
    await delay(220);

    expect(
      viewerEvents.some(
        (event) =>
          event.direction === "received" &&
          event.message.type === "session-control" &&
          event.message.action === "resume"
      )
    ).toBe(false);
  });

  it("does not send resume after session termination", async () => {
    const { relay, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      hostPauseAfterMs: 10,
      hostResumeAfterMs: 40,
      hostTerminateAfterMs: 20,
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "terminated"
    );
    await delay(70);

    expect(
      viewerEvents.some(
        (event) =>
          event.direction === "received" &&
          event.message.type === "session-control" &&
          event.message.action === "resume"
      )
    ).toBe(false);
  });

  it("sends expired state and audit after authorization ttl elapses", async () => {
    const { relay, viewerEvents } = await startRelayAndHost({
      authorizationTtlMs: 10,
      hostDecision: "approve",
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view", "input:pointer"], viewerEvents);

    const expiredState = await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "expired"
    );
    const expiredAudit = await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "audit-event" &&
        message.action === "agent-shell.authorization.expired"
    );

    expect(expiredState).toMatchObject({
      type: "session-authorization-state",
      status: "expired",
      visibleToHost: true,
      permissions: []
    });
    expect(expiredAudit).toMatchObject({
      type: "audit-event",
      outcome: "accepted",
      detail: {
        previouslyGrantedPermissionCount: 2,
        ttlMs: 10,
        visibleToHost: true,
        expired: true
      }
    });
  });

  it("does not send expired state when visible active state is withheld", async () => {
    const { relay, viewerEvents } = await startRelayAndHost({
      authorizationTtlMs: 10,
      hostDecision: "approve",
      visibleToHost: false
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(viewerEvents, (message) => message.type === "session-authorization-decision");
    await delay(50);

    expect(
      viewerEvents.some(
        (event) =>
          event.direction === "received" &&
          event.message.type === "session-authorization-state" &&
          event.message.status === "expired"
      )
    ).toBe(false);
  });

  it("does not send expired state after final permission revocation", async () => {
    const { relay, viewerEvents } = await startRelayAndHost({
      authorizationTtlMs: 30,
      hostDecision: "approve",
      hostRevokeAfterMs: 10,
      hostRevokePermission: "screen:view",
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "revoked"
    );
    await delay(60);

    expect(
      viewerEvents.some(
        (event) =>
          event.direction === "received" &&
          event.message.type === "session-authorization-state" &&
          event.message.status === "expired"
      )
    ).toBe(false);
  });

  it("does not send expired state after session termination", async () => {
    const { relay, viewerEvents } = await startRelayAndHost({
      authorizationTtlMs: 30,
      hostDecision: "approve",
      hostTerminateAfterMs: 10,
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "terminated"
    );
    await delay(60);

    expect(
      viewerEvents.some(
        (event) =>
          event.direction === "received" &&
          event.message.type === "session-authorization-state" &&
          event.message.status === "expired"
      )
    ).toBe(false);
  });

  it("logs protocol message summaries without raw payloads", async () => {
    const { relay, host, viewerEvents } = await startRelayAndHost();
    const viewerLogs: string[] = [];
    await startViewer(relay.url(), [], viewerEvents, captureLogger(viewerLogs));

    await waitForMessage(
      viewerEvents,
      (message) => message.type === "relay-ready" && message.peerId === "viewer-1"
    );
    const signalPayload = {
      kind: "offer",
      sdp: "safe-offer-data",
      nested: { candidate: "safe-candidate" }
    };
    host.send({
      ...createMessageBase("session-demo"),
      type: "signal",
      fromPeerId: "host-1",
      toPeerId: "viewer-1",
      payload: signalPayload
    });
    const signal = await waitForMessage(viewerEvents, (message) => message.type === "signal");

    const logOutput = viewerLogs.join("\n");
    expect(signal).toMatchObject({
      type: "signal",
      fromPeerId: "host-1",
      toPeerId: "viewer-1",
      payload: {
        redacted: "[REDACTED]",
        byteLength: Buffer.byteLength(JSON.stringify(signalPayload))
      }
    });
    expect(JSON.stringify(signal)).not.toContain("safe-offer-data");
    expect(JSON.stringify(signal)).not.toContain("safe-candidate");
    expect(logOutput).toContain("received signal");
    expect(logOutput).not.toContain("safe-offer-data");
    expect(logOutput).not.toContain("safe-candidate");
    expect(logOutput).not.toContain("payload");
  });

  it("receives host disconnect notices through the agent shell runtime", async () => {
    const { relay, host, viewerEvents } = await startRelayAndHost();
    const viewerLogs: string[] = [];
    await startViewer(relay.url(), [], viewerEvents, captureLogger(viewerLogs));

    await waitForMessage(
      viewerEvents,
      (message) => message.type === "relay-ready" && message.peerId === "viewer-1"
    );
    await host.stop();

    const disconnect = await waitForMessage(
      viewerEvents,
      (message) => message.type === "peer-disconnected"
    );

    expect(disconnect).toMatchObject({
      type: "peer-disconnected",
      peerId: "host-1",
      role: "host",
      reasonCode: "peer-closed"
    });

    const logOutput = viewerLogs.join("\n");
    expect(logOutput).toContain("received peer-disconnected");
    expect(logOutput).toContain("peerId=host-1");
    expect(logOutput).toContain("role=host");
    expect(logOutput).toContain("reasonCode=peer-closed");
    expect(logOutput).not.toContain("123-456");
    expect(logOutput).not.toContain("payload");
  });

  it("suppresses delayed host workflow messages after the viewer disconnects", async () => {
    const hostLogs: string[] = [];
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost({
      authorizationTtlMs: 200,
      hostDecision: "approve",
      hostLogger: captureLogger(hostLogs),
      hostPauseAfterMs: 200,
      hostRevokeAfterMs: 200,
      hostRevokePermission: "screen:view",
      hostTerminateAfterMs: 200,
      visibleToHost: true
    });
    const viewer = await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "active"
    );
    await viewer.stop();
    await waitForMessage(hostEvents, (message) => message.type === "peer-disconnected");
    const eventCountAtDisconnect = hostEvents.length;
    await delay(260);

    const sentAfterDisconnect = hostEvents
      .slice(eventCountAtDisconnect)
      .filter((event) => event.direction === "sent");

    expect(sentAfterDisconnect).toHaveLength(0);
    expect(hostLogs.join("\n")).toContain("skipped because peer disconnected");
  });

  it("blocks direct runtime sends after the peer disconnects", async () => {
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost();
    const viewer = await startViewer(relay.url(), [], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) => message.type === "relay-ready" && message.peerId === "viewer-1"
    );
    await viewer.stop();
    await waitForMessage(hostEvents, (message) => message.type === "peer-disconnected");

    const sentCountAtDisconnect = hostEvents.filter((event) => event.direction === "sent").length;

    expect(() =>
      host.send({
        ...createMessageBase("session-demo"),
        type: "signal",
        fromPeerId: "host-1",
        toPeerId: "viewer-1",
        payload: {
          kind: "offer",
          sdp: "post-disconnect-offer"
        }
      })
    ).toThrow("Agent shell peer is disconnected");

    expect(hostEvents.filter((event) => event.direction === "sent")).toHaveLength(sentCountAtDisconnect);
    expect(JSON.stringify(hostEvents)).not.toContain("post-disconnect-offer");
  });

  it("does not persist arbitrary received protocol payloads through the workflow audit sink", async () => {
    const viewerAuditSink = new MemoryAuditSink();
    const { relay, host, viewerEvents } = await startRelayAndHost();
    await startViewer(relay.url(), [], viewerEvents, silentLogger, viewerAuditSink);

    await waitForMessage(
      viewerEvents,
      (message) => message.type === "relay-ready" && message.peerId === "viewer-1"
    );
    host.send({
      ...createMessageBase("session-demo"),
      type: "signal",
      fromPeerId: "host-1",
      toPeerId: "viewer-1",
      payload: {
        kind: "offer",
        sdp: "safe-offer-data",
        nested: { candidate: "safe-candidate" }
      }
    });
    await waitForMessage(viewerEvents, (message) => message.type === "signal");

    expect(viewerAuditSink.records()).toHaveLength(0);
  });

  it("emits sent events with redacted audit-event details", async () => {
    const { host, hostEvents } = await startRelayAndHost();
    await waitForMessage(
      hostEvents,
      (message) => message.type === "relay-ready" && message.peerId === "host-1"
    );

    host.send({
      ...createMessageBase("session-demo"),
      type: "audit-event",
      eventId: "audit_sent_redacted",
      actorPeerId: "host-1",
      action: "agent-shell.test.sent-redaction",
      outcome: "accepted",
      detail: {
        token: "raw-token-value",
        nested: {
          credential: "raw-credential-value"
        },
        safeCount: 1
      }
    });

    const sentAudit = hostEvents.find(
      (event) =>
        event.direction === "sent" &&
        event.message.type === "audit-event" &&
        event.message.action === "agent-shell.test.sent-redaction"
    );

    expect(sentAudit).toBeDefined();
    expect(sentAudit?.direction === "sent" && sentAudit.message.type === "audit-event"
      ? sentAudit.message.detail
      : {}).toEqual({
      token: "[REDACTED]",
      nested: {
        credential: "[REDACTED]"
      },
      safeCount: 1
    });
    expect(JSON.stringify(sentAudit)).not.toContain("raw-token-value");
    expect(JSON.stringify(sentAudit)).not.toContain("raw-credential-value");
  });

  it("does not emit sent events for invalid outbound messages", async () => {
    const { host, hostEvents } = await startRelayAndHost();
    await waitForMessage(
      hostEvents,
      (message) => message.type === "relay-ready" && message.peerId === "host-1"
    );

    const sentCountBefore = hostEvents.filter((event) => event.direction === "sent").length;

    expect(() =>
      host.send({
        ...createMessageBase("session-demo"),
        type: "audit-event",
        eventId: "audit_invalid",
        actorPeerId: "host-1",
        action: "",
        outcome: "accepted",
        detail: {}
      } as ProtocolEnvelope)
    ).toThrow();

    expect(hostEvents.filter((event) => event.direction === "sent")).toHaveLength(sentCountBefore);
  });

  it("surfaces audit sink write failures as runtime errors", async () => {
    const hostLogs: string[] = [];
    const rawErrorMessage = "audit sink failed with raw-token";
    const failingSink: AuditSink = {
      write: () => {
        throw new Error(rawErrorMessage);
      }
    };
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost({
      hostAuditSink: failingSink,
      hostDecision: "deny",
      hostLogger: captureLogger(hostLogs)
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-decision" &&
        message.decision === "denied"
    );
    const errorEvent = await waitForRuntimeError(hostEvents);
    await delay(50);

    expect(errorEvent.error.message).toBe("Agent shell runtime error");
    expect(errorEvent.error.stack).toBeUndefined();
    expect(errorEvent.messageBytes).toBe(Buffer.byteLength(rawErrorMessage));
    expect(JSON.stringify(errorEvent)).not.toContain(rawErrorMessage);
    expect(hostLogs.join("\n")).toContain("runtime error messageBytes=");
    expect(hostLogs.join("\n")).not.toContain(rawErrorMessage);
    expect(hostLogs.join("\n")).not.toContain("raw-token");
    expect(
      viewerEvents.some(
        (event) =>
          event.direction === "received" &&
          event.message.type === "audit-event" &&
          event.message.action === "agent-shell.authorization.denied"
      )
    ).toBe(false);
  });

  it("surfaces delayed audit sink write failures as runtime errors", async () => {
    const backingSink = new MemoryAuditSink();
    const hostLogs: string[] = [];
    const rawErrorMessage = "delayed audit sink failed with raw-token";
    const failingSink: AuditSink = {
      write: (input) => {
        if (input.action === "agent-shell.permission.revoked") {
          throw new Error(rawErrorMessage);
        }

        return backingSink.write(input);
      }
    };
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost({
      hostAuditSink: failingSink,
      hostDecision: "approve",
      hostLogger: captureLogger(hostLogs),
      hostRevokeAfterMs: 10,
      hostRevokePermission: "screen:view",
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "active"
    );
    const errorEvent = await waitForRuntimeError(hostEvents);
    await delay(50);

    expect(errorEvent.error.message).toBe("Agent shell runtime error");
    expect(errorEvent.error.stack).toBeUndefined();
    expect(errorEvent.messageBytes).toBe(Buffer.byteLength(rawErrorMessage));
    expect(JSON.stringify(errorEvent)).not.toContain(rawErrorMessage);
    expect(hostLogs.join("\n")).toContain("runtime error messageBytes=");
    expect(hostLogs.join("\n")).not.toContain(rawErrorMessage);
    expect(hostLogs.join("\n")).not.toContain("raw-token");
    expect(backingSink.records().map((record) => record.action)).toEqual([
      "agent-shell.authorization.approved",
      "agent-shell.authorization.active"
    ]);
    expect(
      viewerEvents.some(
        (event) =>
          event.direction === "received" &&
          event.message.type === "audit-event" &&
          event.message.action === "agent-shell.permission.revoked"
      )
    ).toBe(false);
  });

  it("formats socket error logs without raw error text", () => {
    const rawErrorMessage = "socket failed with raw-token at C:\\Users\\Nur\\secret";
    const logLine = formatAgentShellErrorLog("socket", new Error(rawErrorMessage));

    expect(logLine).toBe(`[winbridge-agent] socket error messageBytes=${Buffer.byteLength(rawErrorMessage)}`);
    expect(logLine).not.toContain(rawErrorMessage);
    expect(logLine).not.toContain("raw-token");
    expect(logLine).not.toContain("C:\\Users\\Nur");
  });

  it("logs non-protocol message summaries without raw text", async () => {
    const hostLogs: string[] = [];
    const { host, hostEvents } = await startRelayAndHost({
      hostLogger: captureLogger(hostLogs)
    });

    await waitForMessage(
      hostEvents,
      (message) => message.type === "relay-ready" && message.peerId === "host-1"
    );
    host.send({
      ...createMessageBase("different-session"),
      type: "signal",
      fromPeerId: "host-1",
      payload: { kind: "offer", sdp: "do-not-log" }
    });
    const rawEvent = await waitForRawEvent(hostEvents);

    const logOutput = hostLogs.join("\n");
    expect(logOutput).toContain("received non-protocol message bytes=");
    expect(logOutput).not.toContain("do-not-log");
    expect(logOutput).not.toContain("relay-error");
    expect(logOutput).not.toContain("Message session does not match registered peer");
    expect(rawEvent).toMatchObject({
      direction: "raw",
      text: "[REDACTED]",
      byteLength: expect.any(Number)
    });
    expect(rawEvent.byteLength).toBeGreaterThan(0);
    expect(JSON.stringify(rawEvent)).not.toContain("do-not-log");
    expect(JSON.stringify(rawEvent)).not.toContain("relay-error");
    expect(JSON.stringify(rawEvent)).not.toContain("Message session does not match registered peer");
  });

  it("emits closed events without raw websocket close reason text", async () => {
    const privateCloseReason = "private close token raw-close-token";
    const closeServer = await startCloseReasonServer(privateCloseReason);
    const closeEvents: AgentShellEvent[] = [];
    const closeLogs: string[] = [];

    try {
      const runtime = createAgentShellRuntime(createRuntimeOptions({
        relayUrl: closeServer.url,
        logger: captureLogger(closeLogs),
        onEvent: (event) => closeEvents.push(event)
      }));
      await runtime.start();
      agentRuntimes.push(runtime);

      const closedEvent = await waitForClosedEvent(closeEvents);
      const logOutput = closeLogs.join("\n");

      expect(closedEvent).toMatchObject({
        direction: "closed",
        code: 4000,
        reason: "[REDACTED]",
        reasonBytes: Buffer.byteLength(privateCloseReason)
      });
      expect(JSON.stringify(closedEvent)).not.toContain(privateCloseReason);
      expect(JSON.stringify(closedEvent)).not.toContain("raw-close-token");
      expect(logOutput).toContain("disconnected code=4000 reasonBytes=");
      expect(logOutput).not.toContain(privateCloseReason);
      expect(logOutput).not.toContain("raw-close-token");
    } finally {
      await closeServer.stop();
    }
  });
});

function createRuntimeOptions(
  overrides: Partial<AgentShellRuntimeOptions> = {}
): AgentShellRuntimeOptions {
  return {
    role: "host",
    relayUrl: "ws://127.0.0.1:9",
    sessionId: "session-demo",
    pairingCode: "123-456",
    peerId: "host-1",
    displayName: "Host",
    deviceId: "dev_host_1",
    ...overrides
  };
}

async function startRelayAndHost(options: {
  authorizationTtlMs?: number;
  decisionReason?: string;
  hostAuditSink?: AuditSink;
  hostDecision?: "none" | "approve" | "deny";
  hostDisplayName?: string;
  hostLogger?: TestLogger;
  hostPauseAfterMs?: number;
  hostPauseReason?: string;
  hostResumeAfterMs?: number;
  hostResumeReason?: string;
  hostRevokeAfterMs?: number;
  hostRevokePermission?: Permission;
  hostRevokeReason?: string;
  hostTerminateAfterMs?: number;
  hostTerminateReason?: string;
  visibleToHost?: boolean;
} = {}) {
  const relay = createRelayRuntime({
    port: 0,
    auditSink: new MemoryAuditSink(),
    heartbeat: false,
    logger: silentLogger
  });
  await relay.start();
  relayRuntimes.push(relay);

  const hostEvents: AgentShellEvent[] = [];
  const viewerEvents: AgentShellEvent[] = [];
  const host = createAgentShellRuntime({
    role: "host",
    relayUrl: relay.url(),
    sessionId: "session-demo",
    pairingCode: "123-456",
    peerId: "host-1",
    displayName: options.hostDisplayName ?? "Host",
    deviceId: "dev_host_1",
    auditSink: options.hostAuditSink,
    hostDecision: options.hostDecision ?? "none",
    decisionReason: options.decisionReason,
    authorizationTtlMs: options.authorizationTtlMs,
    hostPauseAfterMs: options.hostPauseAfterMs,
    hostPauseReason: options.hostPauseReason,
    hostResumeAfterMs: options.hostResumeAfterMs,
    hostResumeReason: options.hostResumeReason,
    hostRevokeAfterMs: options.hostRevokeAfterMs,
    hostRevokePermission: options.hostRevokePermission,
    hostRevokeReason: options.hostRevokeReason,
    hostTerminateAfterMs: options.hostTerminateAfterMs,
    hostTerminateReason: options.hostTerminateReason,
    visibleToHost: options.visibleToHost ?? false,
    logger: options.hostLogger ?? silentLogger,
    onEvent: (event) => hostEvents.push(event)
  });
  await host.start();
  agentRuntimes.push(host);

  return { relay, host, hostEvents, viewerEvents };
}

async function startViewer(
  relayUrl: string,
  requestedPermissions: Permission[],
  viewerEvents: AgentShellEvent[] = [],
  logger: TestLogger = silentLogger,
  auditSink?: AuditSink,
  displayName = "Viewer"
): Promise<AgentShellRuntime> {
  const viewer = createAgentShellRuntime({
    role: "viewer",
    relayUrl,
    sessionId: "session-demo",
    pairingCode: "123-456",
    peerId: "viewer-1",
    displayName,
    deviceId: "dev_viewer_1",
    requestedPermissions,
    auditSink,
    logger,
    onEvent: (event) => viewerEvents.push(event)
  });
  await viewer.start();
  agentRuntimes.push(viewer);
  return viewer;
}

function waitForMessage(
  events: AgentShellEvent[],
  predicate: (message: AgentShellReceivedProtocolEnvelope) => boolean
): Promise<AgentShellReceivedProtocolEnvelope> {
  return withTimeout(
    new Promise((resolve) => {
      const interval = setInterval(() => {
        const match = events.find(
          (event) => event.direction === "received" && predicate(event.message)
        );

        if (match?.direction === "received") {
          clearInterval(interval);
          resolve(match.message);
        }
      }, 5);
    })
  );
}

function waitForSentMessage(
  events: AgentShellEvent[],
  predicate: (message: AgentShellSentProtocolEnvelope) => boolean
): Promise<AgentShellSentProtocolEnvelope> {
  return withTimeout(
    new Promise((resolve) => {
      const interval = setInterval(() => {
        const match = events.find(
          (event) => event.direction === "sent" && predicate(event.message)
        );

        if (match?.direction === "sent") {
          clearInterval(interval);
          resolve(match.message);
        }
      }, 5);
    })
  );
}

function waitForRawEvent(
  events: AgentShellEvent[]
): Promise<Extract<AgentShellEvent, { direction: "raw" }>> {
  return withTimeout(
    new Promise((resolve) => {
      const interval = setInterval(() => {
        const match = events.find((event) => event.direction === "raw");

        if (match?.direction === "raw") {
          clearInterval(interval);
          resolve(match);
        }
      }, 5);
    })
  );
}

function waitForClosedEvent(
  events: AgentShellEvent[]
): Promise<Extract<AgentShellEvent, { direction: "closed" }>> {
  return withTimeout(
    new Promise((resolve) => {
      const interval = setInterval(() => {
        const match = events.find((event) => event.direction === "closed");

        if (match?.direction === "closed") {
          clearInterval(interval);
          resolve(match);
        }
      }, 5);
    })
  );
}

function waitForRuntimeError(
  events: AgentShellEvent[]
): Promise<Extract<AgentShellEvent, { direction: "error" }>> {
  return withTimeout(
    new Promise((resolve) => {
      const interval = setInterval(() => {
        const match = events.find((event) => event.direction === "error");

        if (match?.direction === "error") {
          clearInterval(interval);
          resolve(match);
        }
      }, 5);
    })
  );
}

function captureLogger(logs: string[]): TestLogger {
  return {
    log: (message) => logs.push(message),
    warn: (message) => logs.push(message),
    error: (message) => logs.push(message)
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startCloseReasonServer(closeReason: string): Promise<{
  url: string;
  stop(): Promise<void>;
}> {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  wss.on("connection", (socket) => {
    setTimeout(() => socket.close(4000, closeReason), 10);
  });
  await once(wss, "listening");

  const address = wss.address() as AddressInfo | string | null;
  if (!address || typeof address === "string") {
    throw new Error("Close reason test server did not expose a TCP port");
  }

  return {
    url: `ws://127.0.0.1:${address.port}`,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        wss.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      })
  };
}

async function startOnePeerReadyServer(): Promise<{
  url: string;
  stop(): Promise<void>;
}> {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  wss.on("connection", (socket) => {
    socket.once("message", () => {
      socket.send(encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "relay-ready",
        peerId: "viewer-1",
        roomSize: 1
      }));
    });
  });
  await once(wss, "listening");

  const address = wss.address() as AddressInfo | string | null;
  if (!address || typeof address === "string") {
    throw new Error("One-peer ready test server did not expose a TCP port");
  }

  return {
    url: `ws://127.0.0.1:${address.port}`,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        wss.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      })
  };
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for agent event")), 5000);

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
