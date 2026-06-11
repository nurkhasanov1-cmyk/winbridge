import { readFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileAuditSink, MemoryAuditSink, type AuditSink } from "@winbridge/audit-log";
import { createMessageBase, type Permission, type ProtocolEnvelope } from "@winbridge/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { createRelayRuntime, type RelayRuntime } from "../../relay/src/server.js";
import {
  createAgentShellRuntime,
  type AgentShellEvent,
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

    const logOutput = viewerLogs.join("\n");
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

  it("surfaces audit sink write failures as runtime errors", async () => {
    const failingSink: AuditSink = {
      write: () => {
        throw new Error("audit sink failed");
      }
    };
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost({
      hostAuditSink: failingSink,
      hostDecision: "deny"
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-decision" &&
        message.decision === "denied"
    );
    const error = await waitForRuntimeError(hostEvents);
    await delay(50);

    expect(error.message).toBe("audit sink failed");
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
    const failingSink: AuditSink = {
      write: (input) => {
        if (input.action === "agent-shell.permission.revoked") {
          throw new Error("delayed audit sink failed");
        }

        return backingSink.write(input);
      }
    };
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost({
      hostAuditSink: failingSink,
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
        message.status === "active"
    );
    const error = await waitForRuntimeError(hostEvents);
    await delay(50);

    expect(error.message).toBe("delayed audit sink failed");
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
    await waitForRawMessage(hostEvents);

    const logOutput = hostLogs.join("\n");
    expect(logOutput).toContain("received non-protocol message bytes=");
    expect(logOutput).not.toContain("do-not-log");
    expect(logOutput).not.toContain("relay-error");
    expect(logOutput).not.toContain("Message session does not match registered peer");
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
    displayName: "Host",
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
  auditSink?: AuditSink
): Promise<AgentShellRuntime> {
  const viewer = createAgentShellRuntime({
    role: "viewer",
    relayUrl,
    sessionId: "session-demo",
    pairingCode: "123-456",
    peerId: "viewer-1",
    displayName: "Viewer",
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
  predicate: (message: ProtocolEnvelope) => boolean
): Promise<ProtocolEnvelope> {
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

function waitForRawMessage(events: AgentShellEvent[]): Promise<string> {
  return withTimeout(
    new Promise((resolve) => {
      const interval = setInterval(() => {
        const match = events.find((event) => event.direction === "raw");

        if (match?.direction === "raw") {
          clearInterval(interval);
          resolve(match.text);
        }
      }, 5);
    })
  );
}

function waitForRuntimeError(events: AgentShellEvent[]): Promise<Error> {
  return withTimeout(
    new Promise((resolve) => {
      const interval = setInterval(() => {
        const match = events.find((event) => event.direction === "error");

        if (match?.direction === "error") {
          clearInterval(interval);
          resolve(match.error);
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
