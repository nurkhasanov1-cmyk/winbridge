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
import WebSocket, { WebSocketServer, type RawData } from "ws";
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
      [
        "relay URL token query",
        { relayUrl: "ws://127.0.0.1:8787/?token=raw-token" },
        "Runtime relay URL"
      ],
      [
        "relay URL credentials",
        { relayUrl: "ws://user:password@127.0.0.1:8787/" },
        "Runtime relay URL"
      ],
      [
        "empty relay URL credentials marker",
        { relayUrl: "ws://@127.0.0.1:8787/" },
        "Runtime relay URL"
      ],
      ["malformed role", { role: "controller" as AgentShellRuntimeOptions["role"] }, "Runtime role"],
      ["malformed session id", { sessionId: "session demo" }, "Runtime protocol identifiers"],
      ["malformed pairing code", { pairingCode: "secret" }, "Runtime protocol identifiers"],
      ["malformed peer id", { peerId: "host/1" }, "Runtime protocol identifiers"],
      ["malformed device id", { deviceId: "dev1" }, "Runtime protocol identifiers"],
      ["blank display name", { displayName: "   " }, "Runtime display name"],
      ["blank token", { token: "   " }, "Runtime token"],
      ["non-string token", { token: null as unknown as string }, "Runtime token"],
      ["control-character token", { token: "dev\ntoken" }, "Runtime token"],
      ["oversized token", { token: "x".repeat(1025) }, "Runtime token"],
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

  it("keeps relay tokens out of local connection logs and runtime events", async () => {
    const relayToken = "relay-token-private-marker";
    const hostLogs: string[] = [];
    const { hostEvents } = await startRelayAndHost({
      hostLogger: captureLogger(hostLogs),
      hostToken: relayToken,
      relaySharedToken: relayToken
    });

    await waitForMessage(
      hostEvents,
      (message) => message.type === "relay-ready" && message.peerId === "host-1"
    );

    expect(hostLogs.join("\n")).toContain("connected to ws://127.0.0.1");
    expect(hostLogs.join("\n")).not.toContain(relayToken);
    expect(JSON.stringify(hostEvents)).not.toContain(relayToken);
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

  it("ignores hello messages that identify the local peer before presence handling", async () => {
    const selfHelloServer = await startSelfHelloServer();
    const hostEvents: AgentShellEvent[] = [];
    const hostLogs: string[] = [];
    let host: AgentShellRuntime | undefined;

    try {
      host = createAgentShellRuntime(createRuntimeOptions({
        relayUrl: selfHelloServer.url,
        logger: captureLogger(hostLogs),
        onEvent: (event) => hostEvents.push(event)
      }));
      await host.start();

      const rawEvent = await waitForRawEvent(hostEvents);
      await delay(100);

      expect(rawEvent).toMatchObject({
        direction: "raw",
        text: "[REDACTED]",
        byteLength: expect.any(Number)
      });
      expect(rawEvent.byteLength).toBeGreaterThan(0);
      expect(hostEvents.some((event) => event.direction === "received")).toBe(false);
      expect(
        hostEvents.some((event) => event.direction === "sent" && event.message.type === "hello")
      ).toBe(false);

      const serializedRawEvents = JSON.stringify(hostEvents.filter((event) => event.direction === "raw"));
      const logOutput = hostLogs.join("\n");
      expect(logOutput).toContain("ignored unsafe inbound protocol message bytes=");
      expect(logOutput).not.toContain("hello");
      expect(logOutput).not.toContain("host-1");
      expect(logOutput).not.toContain("session-demo");
      expect(logOutput).not.toContain("self hello display");
      expect(serializedRawEvents).not.toContain("hello");
      expect(serializedRawEvents).not.toContain("host-1");
      expect(serializedRawEvents).not.toContain("session-demo");
      expect(serializedRawEvents).not.toContain("self hello display");
    } finally {
      await host?.stop();
      await selfHelloServer.stop();
    }
  });

  it("ignores same-role hello messages before presence handling", async () => {
    const sameRoleHelloServer = await startSameRoleHelloServer();
    const viewerEvents: AgentShellEvent[] = [];
    const viewerLogs: string[] = [];
    let viewer: AgentShellRuntime | undefined;

    try {
      viewer = createAgentShellRuntime(createRuntimeOptions({
        role: "viewer",
        relayUrl: sameRoleHelloServer.url,
        peerId: "viewer-1",
        displayName: "Viewer",
        deviceId: "dev_viewer_1",
        logger: captureLogger(viewerLogs),
        onEvent: (event) => viewerEvents.push(event)
      }));
      await viewer.start();

      const rawEvent = await waitForRawEvent(viewerEvents);
      await delay(100);

      expect(rawEvent).toMatchObject({
        direction: "raw",
        text: "[REDACTED]",
        byteLength: expect.any(Number)
      });
      expect(rawEvent.byteLength).toBeGreaterThan(0);
      expect(viewerEvents.some((event) => event.direction === "received")).toBe(false);
      expect(
        viewerEvents.some((event) => event.direction === "sent" && event.message.type === "hello")
      ).toBe(false);

      const sentCountBefore = viewerEvents.filter((event) => event.direction === "sent").length;
      const privateRequestMarker = "same-role-public-request-private-reason";
      expect(() =>
        viewer.send({
          ...createMessageBase("session-demo"),
          type: "session-authorization-request",
          viewerPeerId: "viewer-1",
          requestedPermissions: ["screen:view"],
          reason: privateRequestMarker
        })
      ).toThrow("Agent shell public send requires an observed recipient peer");
      expect(viewerEvents.filter((event) => event.direction === "sent")).toHaveLength(sentCountBefore);

      const serializedRawEvents = JSON.stringify(viewerEvents.filter((event) => event.direction === "raw"));
      const logOutput = viewerLogs.join("\n");
      expect(logOutput).toContain("ignored unsafe inbound protocol message bytes=");
      expect(logOutput).not.toContain("hello");
      expect(logOutput).not.toContain("viewer-2");
      expect(logOutput).not.toContain("session-demo");
      expect(logOutput).not.toContain("same-role hello display");
      expect(logOutput).not.toContain("same-role:private-capability");
      expect(logOutput).not.toContain(privateRequestMarker);
      expect(serializedRawEvents).not.toContain("hello");
      expect(serializedRawEvents).not.toContain("viewer-2");
      expect(serializedRawEvents).not.toContain("session-demo");
      expect(serializedRawEvents).not.toContain("same-role hello display");
      expect(serializedRawEvents).not.toContain("same-role:private-capability");
      expect(JSON.stringify(viewerEvents)).not.toContain(privateRequestMarker);
    } finally {
      await viewer?.stop();
      await sameRoleHelloServer.stop();
    }
  });

  it("allows host signal sends after active visible authorization and redacts payload contents", async () => {
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);
    await waitForSentMessage(
      hostEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "active" &&
        message.visibleToHost
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
    const receivedSignal = await waitForMessage(
      viewerEvents,
      (message) => message.type === "signal" && message.fromPeerId === "host-1"
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
    expect(receivedSignal).toMatchObject({
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
    expect(JSON.stringify(receivedSignal)).not.toContain("outbound-offer-data");
    expect(JSON.stringify(receivedSignal)).not.toContain("outbound-candidate");
  });

  it("blocks public signal sends with spoofed sender, explicit self target, or third-peer target", async () => {
    const hostLogs: string[] = [];
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      hostLogger: captureLogger(hostLogs),
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);
    await waitForSentMessage(
      hostEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "active" &&
        message.visibleToHost
    );

    const blockedMessages: Array<{
      name: string;
      privateMarker: string;
      message: ProtocolEnvelope;
    }> = [
      {
        name: "spoofed sender",
        privateMarker: "spoofed-outbound-signal-payload",
        message: {
          ...createMessageBase("session-demo"),
          type: "signal",
          fromPeerId: "viewer-1",
          toPeerId: "viewer-1",
          payload: {
            kind: "host-offer",
            safeMarker: "spoofed-outbound-signal-payload"
          }
        }
      },
      {
        name: "self target",
        privateMarker: "self-target-outbound-signal-payload",
        message: {
          ...createMessageBase("session-demo"),
          type: "signal",
          fromPeerId: "host-1",
          toPeerId: "host-1",
          payload: {
            kind: "host-offer",
            safeMarker: "self-target-outbound-signal-payload"
          }
        }
      },
      {
        name: "third peer target",
        privateMarker: "third-peer-outbound-signal-payload",
        message: {
          ...createMessageBase("session-demo"),
          type: "signal",
          fromPeerId: "host-1",
          toPeerId: "other-peer",
          payload: {
            kind: "host-offer",
            safeMarker: "third-peer-outbound-signal-payload"
          }
        }
      }
    ];

    for (const { message, name, privateMarker } of blockedMessages) {
      const sentSignalCountBefore = hostEvents.filter(
        (event) => event.direction === "sent" && event.message.type === "signal"
      ).length;
      const receivedSignalCountBefore = viewerEvents.filter(
        (event) => event.direction === "received" && event.message.type === "signal"
      ).length;

      let thrown: unknown;
      try {
        host.send(message);
      } catch (error) {
        thrown = error;
      }

      expect(thrown, name).toBeInstanceOf(Error);
      expect(thrown instanceof Error ? thrown.message : "", name).toBe(
        "Agent shell signal sender and target must match runtime peer routing"
      );
      expect(thrown instanceof Error ? thrown.message : "", name).not.toContain("host-1");
      expect(thrown instanceof Error ? thrown.message : "", name).not.toContain("viewer-1");
      await delay(50);

      expect(
        hostEvents.filter((event) => event.direction === "sent" && event.message.type === "signal"),
        name
      ).toHaveLength(sentSignalCountBefore);
      expect(
        viewerEvents.filter((event) => event.direction === "received" && event.message.type === "signal"),
        name
      ).toHaveLength(receivedSignalCountBefore);
      expect(JSON.stringify(hostEvents), name).not.toContain(privateMarker);
      expect(JSON.stringify(viewerEvents), name).not.toContain(privateMarker);
      expect(hostLogs.join("\n"), name).not.toContain(privateMarker);
    }
  });

  it("blocks viewer signal sends to explicit non-authorized targets after active authorization", async () => {
    const viewerLogs: string[] = [];
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      visibleToHost: true
    });
    const viewer = await startViewer(
      relay.url(),
      ["screen:view"],
      viewerEvents,
      captureLogger(viewerLogs)
    );

    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "active" &&
        message.visibleToHost
    );

    const sentSignalCountBefore = viewerEvents.filter(
      (event) => event.direction === "sent" && event.message.type === "signal"
    ).length;
    const receivedSignalCountBefore = hostEvents.filter(
      (event) => event.direction === "received" && event.message.type === "signal"
    ).length;
    const privateMarker = "viewer-third-peer-outbound-signal-payload";

    expect(() =>
      viewer.send({
        ...createMessageBase("session-demo"),
        type: "signal",
        fromPeerId: "viewer-1",
        toPeerId: "other-peer",
        payload: {
          kind: "viewer-offer",
          safeMarker: privateMarker
        }
      })
    ).toThrow("Agent shell signal sender and target must match runtime peer routing");
    await delay(50);

    expect(
      viewerEvents.filter((event) => event.direction === "sent" && event.message.type === "signal")
    ).toHaveLength(sentSignalCountBefore);
    expect(
      hostEvents.filter((event) => event.direction === "received" && event.message.type === "signal")
    ).toHaveLength(receivedSignalCountBefore);
    expect(JSON.stringify(viewerEvents)).not.toContain(privateMarker);
    expect(JSON.stringify(hostEvents)).not.toContain(privateMarker);
    expect(viewerLogs.join("\n")).not.toContain(privateMarker);
  });

  it("ignores signal messages that are not addressed to the local peer or originate locally", async () => {
    const signalServer = await startMisdirectedSignalServer();
    const hostEvents: AgentShellEvent[] = [];
    const hostLogs: string[] = [];
    let host: AgentShellRuntime | undefined;

    try {
      host = createAgentShellRuntime(createRuntimeOptions({
        relayUrl: signalServer.url,
        logger: captureLogger(hostLogs),
        onEvent: (event) => hostEvents.push(event)
      }));
      await host.start();

      const rawEvents = await waitForRawEventCount(hostEvents, 2);
      await delay(100);

      expect(rawEvents).toHaveLength(2);
      for (const rawEvent of rawEvents) {
        expect(rawEvent).toMatchObject({
          direction: "raw",
          text: "[REDACTED]",
          byteLength: expect.any(Number)
        });
        expect(rawEvent.byteLength).toBeGreaterThan(0);
      }
      expect(
        hostEvents.some((event) => event.direction === "received" && event.message.type === "signal")
      ).toBe(false);

      const serializedRawEvents = JSON.stringify(rawEvents);
      const logOutput = hostLogs.join("\n");
      expect(logOutput.match(/ignored unsafe inbound protocol message bytes=/g)).toHaveLength(2);
      expect(logOutput).not.toContain("received signal");
      expect(logOutput).not.toContain("signal");
      expect(logOutput).not.toContain("host-1");
      expect(logOutput).not.toContain("viewer-1");
      expect(logOutput).not.toContain("other-peer");
      expect(logOutput).not.toContain("session-demo");
      expect(logOutput).not.toContain("private-signal-payload-marker");
      expect(serializedRawEvents).not.toContain("signal");
      expect(serializedRawEvents).not.toContain("host-1");
      expect(serializedRawEvents).not.toContain("viewer-1");
      expect(serializedRawEvents).not.toContain("other-peer");
      expect(serializedRawEvents).not.toContain("session-demo");
      expect(serializedRawEvents).not.toContain("private-signal-payload-marker");
    } finally {
      await host?.stop();
      await signalServer.stop();
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

  it("ignores relay-ready messages for a different local peer before workflow handling", async () => {
    const foreignReadyServer = await startForeignRelayReadyServer();
    const viewerEvents: AgentShellEvent[] = [];
    const viewerLogs: string[] = [];
    let viewer: AgentShellRuntime | undefined;

    try {
      viewer = await startViewer(
        foreignReadyServer.url,
        ["screen:view"],
        viewerEvents,
        captureLogger(viewerLogs)
      );

      const rawEvent = await waitForRawEvent(viewerEvents);
      await delay(100);

      expect(rawEvent).toMatchObject({
        direction: "raw",
        text: "[REDACTED]",
        byteLength: expect.any(Number)
      });
      expect(rawEvent.byteLength).toBeGreaterThan(0);
      expect(viewerEvents.some((event) => event.direction === "received")).toBe(false);
      expect(
        viewerEvents.some((event) => event.direction === "sent" && event.message.type === "hello")
      ).toBe(false);
      expect(
        viewerEvents.some(
          (event) => event.direction === "sent" && event.message.type === "session-authorization-request"
        )
      ).toBe(false);

      const serializedRawEvents = JSON.stringify(viewerEvents.filter((event) => event.direction === "raw"));
      const logOutput = viewerLogs.join("\n");
      expect(logOutput).toContain("ignored unsafe inbound protocol message bytes=");
      expect(logOutput).not.toContain("relay-ready");
      expect(logOutput).not.toContain("host-1");
      expect(logOutput).not.toContain("session-demo");
      expect(serializedRawEvents).not.toContain("relay-ready");
      expect(serializedRawEvents).not.toContain("host-1");
      expect(serializedRawEvents).not.toContain("session-demo");
    } finally {
      await viewer?.stop();
      await foreignReadyServer.stop();
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

  it("ignores cross-session authorization requests before host workflow handling", async () => {
    const crossSessionServer = await startCrossSessionAuthorizationRequestServer();
    const hostEvents: AgentShellEvent[] = [];
    const hostLogs: string[] = [];
    let host: AgentShellRuntime | undefined;

    try {
      host = createAgentShellRuntime(createRuntimeOptions({
        relayUrl: crossSessionServer.url,
        hostDecision: "approve",
        visibleToHost: true,
        logger: captureLogger(hostLogs),
        onEvent: (event) => hostEvents.push(event)
      }));
      await host.start();

      const rawEvent = await waitForRawEvent(hostEvents);
      await delay(100);

      expect(rawEvent).toMatchObject({
        direction: "raw",
        text: "[REDACTED]",
        byteLength: expect.any(Number)
      });
      expect(rawEvent.byteLength).toBeGreaterThan(0);
      expect(hostEvents.some((event) => event.direction === "received")).toBe(false);
      expect(
        hostEvents.some(
          (event) =>
            event.direction === "sent" &&
            (event.message.type === "session-authorization-decision" ||
              event.message.type === "session-authorization-state" ||
              event.message.type === "audit-event")
        )
      ).toBe(false);

      const serializedEvents = JSON.stringify(hostEvents);
      const logOutput = hostLogs.join("\n");
      expect(logOutput).toContain("ignored unsafe inbound protocol message bytes=");
      expect(logOutput).not.toContain("session-authorization-request");
      expect(logOutput).not.toContain("other-session");
      expect(logOutput).not.toContain("private cross-session reason");
      expect(serializedEvents).not.toContain("other-session");
      expect(serializedEvents).not.toContain("private cross-session reason");
      expect(serializedEvents).not.toContain("raw-token");
    } finally {
      await host?.stop();
      await crossSessionServer.stop();
    }
  });

  it("ignores authorization requests that identify the local host as viewer", async () => {
    const selfRequestServer = await startSelfReferentialAuthorizationRequestServer();
    const hostEvents: AgentShellEvent[] = [];
    const hostLogs: string[] = [];
    let host: AgentShellRuntime | undefined;

    try {
      host = createAgentShellRuntime(createRuntimeOptions({
        relayUrl: selfRequestServer.url,
        hostDecision: "approve",
        visibleToHost: true,
        logger: captureLogger(hostLogs),
        onEvent: (event) => hostEvents.push(event)
      }));
      await host.start();

      const rawEvent = await waitForRawEvent(hostEvents);
      await delay(100);

      expect(rawEvent).toMatchObject({
        direction: "raw",
        text: "[REDACTED]",
        byteLength: expect.any(Number)
      });
      expect(rawEvent.byteLength).toBeGreaterThan(0);
      expect(hostEvents.some((event) => event.direction === "received")).toBe(false);
      expect(
        hostEvents.some(
          (event) =>
            event.direction === "sent" &&
            (event.message.type === "session-authorization-decision" ||
              event.message.type === "session-authorization-state" ||
              event.message.type === "audit-event")
        )
      ).toBe(false);

      const rawEvents = hostEvents.filter((event) => event.direction === "raw");
      const serializedRawEvents = JSON.stringify(rawEvents);
      const logOutput = hostLogs.join("\n");
      expect(logOutput).toContain("ignored unsafe inbound protocol message bytes=");
      expect(logOutput).not.toContain("session-authorization-request");
      expect(logOutput).not.toContain("host-1");
      expect(logOutput).not.toContain("private self-viewer reason");
      expect(logOutput).not.toContain("raw-token");
      expect(serializedRawEvents).not.toContain("session-authorization-request");
      expect(serializedRawEvents).not.toContain("host-1");
      expect(serializedRawEvents).not.toContain("private self-viewer reason");
      expect(serializedRawEvents).not.toContain("raw-token");
    } finally {
      await host?.stop();
      await selfRequestServer.stop();
    }
  });

  it("ignores workflow authority messages that identify the local peer as actor", async () => {
    const selfAuthorityServer = await startSelfAuthorityWorkflowServer();
    const hostEvents: AgentShellEvent[] = [];
    const hostLogs: string[] = [];
    let host: AgentShellRuntime | undefined;

    try {
      host = createAgentShellRuntime(createRuntimeOptions({
        relayUrl: selfAuthorityServer.url,
        logger: captureLogger(hostLogs),
        onEvent: (event) => hostEvents.push(event)
      }));
      await host.start();

      const rawEvents = await waitForRawEventCount(hostEvents, 6);
      await delay(100);

      expect(rawEvents).toHaveLength(6);
      for (const rawEvent of rawEvents) {
        expect(rawEvent).toMatchObject({
          direction: "raw",
          text: "[REDACTED]",
          byteLength: expect.any(Number)
        });
        expect(rawEvent.byteLength).toBeGreaterThan(0);
      }
      expect(hostEvents.some((event) => event.direction === "received")).toBe(false);
      expect(
        hostEvents.some(
          (event) =>
            event.direction === "sent" &&
            (event.message.type === "host-consent-decision" ||
              event.message.type === "session-authorization-decision" ||
              event.message.type === "session-authorization-state" ||
              event.message.type === "session-control" ||
              event.message.type === "permission-revoked" ||
              event.message.type === "audit-event")
        )
      ).toBe(false);

      const serializedRawEvents = JSON.stringify(rawEvents);
      const logOutput = hostLogs.join("\n");
      expect(logOutput.match(/ignored unsafe inbound protocol message bytes=/g)).toHaveLength(6);
      expect(logOutput).not.toContain("host-consent-decision");
      expect(logOutput).not.toContain("session-authorization-decision");
      expect(logOutput).not.toContain("session-authorization-state");
      expect(logOutput).not.toContain("session-control");
      expect(logOutput).not.toContain("permission-revoked");
      expect(logOutput).not.toContain("audit-event");
      expect(logOutput).not.toContain("host-1");
      expect(logOutput).not.toContain("self-decision-grant-marker");
      expect(logOutput).not.toContain("authz_self");
      expect(logOutput).not.toContain("audit_self");
      expect(logOutput).not.toContain("private self-authority reason");
      expect(logOutput).not.toContain("raw-token");
      expect(serializedRawEvents).not.toContain("host-consent-decision");
      expect(serializedRawEvents).not.toContain("session-authorization-decision");
      expect(serializedRawEvents).not.toContain("session-authorization-state");
      expect(serializedRawEvents).not.toContain("session-control");
      expect(serializedRawEvents).not.toContain("permission-revoked");
      expect(serializedRawEvents).not.toContain("audit-event");
      expect(serializedRawEvents).not.toContain("host-1");
      expect(serializedRawEvents).not.toContain("self-decision-grant-marker");
      expect(serializedRawEvents).not.toContain("authz_self");
      expect(serializedRawEvents).not.toContain("audit_self");
      expect(serializedRawEvents).not.toContain("private self-authority reason");
      expect(serializedRawEvents).not.toContain("raw-token");
    } finally {
      await host?.stop();
      await selfAuthorityServer.stop();
    }
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
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      visibleToHost: true
    });
    const viewerLogs: string[] = [];
    await startViewer(relay.url(), ["screen:view"], viewerEvents, captureLogger(viewerLogs));

    await waitForSentMessage(
      hostEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "active" &&
        message.visibleToHost
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

  it("blocks viewer signal sends before active visible screen authorization", async () => {
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost();
    const viewerLogs: string[] = [];
    const viewer = await startViewer(relay.url(), [], viewerEvents, captureLogger(viewerLogs));

    await waitForMessage(
      viewerEvents,
      (message) => message.type === "relay-ready" && message.peerId === "viewer-1"
    );

    const sentCountBefore = viewerEvents.filter((event) => event.direction === "sent").length;
    const blockedPayloadMarker = "blocked-viewer-signal-payload";

    expect(() =>
      viewer.send({
        ...createMessageBase("session-demo"),
        type: "signal",
        fromPeerId: "viewer-1",
        toPeerId: "host-1",
        payload: {
          kind: "viewer-offer",
          safeMarker: blockedPayloadMarker
        }
      })
    ).toThrow("Agent shell signal requires active visible screen authorization");

    await delay(100);

    expect(viewerEvents.filter((event) => event.direction === "sent")).toHaveLength(sentCountBefore);
    expect(hostEvents.some((event) => event.direction === "received" && event.message.type === "signal")).toBe(false);
    expect(JSON.stringify(viewerEvents)).not.toContain(blockedPayloadMarker);
    expect(viewerLogs.join("\n")).not.toContain(blockedPayloadMarker);
  });

  it("blocks host signal sends before active visible screen authorization", async () => {
    const hostLogs: string[] = [];
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
      hostLogger: captureLogger(hostLogs)
    });
    await startViewer(relay.url(), [], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) => message.type === "relay-ready" && message.peerId === "viewer-1"
    );

    const viewerSignalCountBefore = viewerEvents.filter(
      (event) => event.direction === "received" && event.message.type === "signal"
    ).length;

    await expectHostSignalSendBlocked(host, hostEvents, "blocked-host-signal-payload", hostLogs);

    expect(
      viewerEvents.filter((event) => event.direction === "received" && event.message.type === "signal")
    ).toHaveLength(viewerSignalCountBefore);
  });

  it("blocks public workflow-authority sends before socket write or sent events", async () => {
    const hostLogs: string[] = [];
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
      hostLogger: captureLogger(hostLogs)
    });
    await startViewer(relay.url(), [], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) => message.type === "relay-ready" && message.peerId === "viewer-1"
    );
    await delay(100);

    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const blockedMessages: Array<{
      name: string;
      privateMarker: string;
      message: ProtocolEnvelope;
    }> = [
      {
        name: "legacy host consent decision",
        privateMarker: "legacy-public-decision-private-reason",
        message: {
          ...createMessageBase("session-demo"),
          type: "host-consent-decision",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          approved: true,
          grantedPermissions: ["screen:view"],
          reason: "legacy-public-decision-private-reason"
        }
      },
      {
        name: "authorization decision",
        privateMarker: "public-decision-private-reason",
        message: {
          ...createMessageBase("session-demo"),
          type: "session-authorization-decision",
          authorizationId: "authz_public_decision",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          decision: "denied",
          grantedPermissions: [],
          reason: "public-decision-private-reason"
        }
      },
      {
        name: "authorization state",
        privateMarker: "public-state-private-reason",
        message: {
          ...createMessageBase("session-demo"),
          type: "session-authorization-state",
          authorizationId: "authz_public_state",
          actorPeerId: "host-1",
          status: "active",
          visibleToHost: true,
          permissions: ["screen:view"],
          expiresAt,
          reason: "public-state-private-reason"
        }
      },
      {
        name: "permission revoked",
        privateMarker: "public-revoke-private-reason",
        message: {
          ...createMessageBase("session-demo"),
          type: "permission-revoked",
          authorizationId: "authz_public_revoke",
          actorPeerId: "host-1",
          revokedPermission: "screen:view",
          reason: "public-revoke-private-reason"
        }
      },
      {
        name: "session control",
        privateMarker: "public-control-private-reason",
        message: {
          ...createMessageBase("session-demo"),
          type: "session-control",
          actorPeerId: "host-1",
          action: "pause",
          reason: "public-control-private-reason"
        }
      },
      {
        name: "workflow audit",
        privateMarker: "public-audit-private-marker",
        message: {
          ...createMessageBase("session-demo"),
          type: "audit-event",
          eventId: "audit_public_workflow",
          actorPeerId: "host-1",
          action: "agent-shell.authorization.active",
          outcome: "accepted",
          detail: {
            token: "public-audit-private-marker"
          }
        }
      }
    ];

    for (const { message, name, privateMarker } of blockedMessages) {
      const sentCountBefore = hostEvents.filter(
        (event) => event.direction === "sent" && event.message.type === message.type
      ).length;
      const receivedCountBefore = viewerEvents.filter(
        (event) => event.direction === "received" && event.message.type === message.type
      ).length;

      expect(() => host.send(message), name).toThrow(
        "Agent shell workflow authority messages require internal consent workflow"
      );

      await delay(50);

      expect(
        hostEvents.filter((event) => event.direction === "sent" && event.message.type === message.type),
        name
      ).toHaveLength(sentCountBefore);
      expect(
        viewerEvents.filter((event) => event.direction === "received" && event.message.type === message.type),
        name
      ).toHaveLength(receivedCountBefore);
      expect(JSON.stringify(hostEvents), name).not.toContain(privateMarker);
      expect(JSON.stringify(viewerEvents), name).not.toContain(privateMarker);
      expect(hostLogs.join("\n"), name).not.toContain(privateMarker);
    }
  });

  it("blocks public cross-session sends before socket write or sent events", async () => {
    const viewerLogs: string[] = [];
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost();
    const viewer = await startViewer(
      relay.url(),
      [],
      viewerEvents,
      captureLogger(viewerLogs)
    );

    await waitForMessage(
      viewerEvents,
      (message) => message.type === "relay-ready" && message.peerId === "viewer-1"
    );

    const sentCountBefore = viewerEvents.filter((event) => event.direction === "sent").length;
    const receivedRequestCountBefore = hostEvents.filter(
      (event) => event.direction === "received" && event.message.type === "host-consent-required"
    ).length;
    const privateMarker = "cross-session-public-request-private-marker";

    expect(() =>
      viewer.send({
        ...createMessageBase("other-session"),
        type: "host-consent-required",
        viewerPeerId: "viewer-1",
        viewerDisplayName: `Viewer ${privateMarker}`,
        requestedPermissions: ["screen:view"]
      })
    ).toThrow("Agent shell message must match runtime session");
    await delay(50);

    expect(viewerEvents.filter((event) => event.direction === "sent")).toHaveLength(sentCountBefore);
    expect(
      hostEvents.filter((event) => event.direction === "received" && event.message.type === "host-consent-required")
    ).toHaveLength(receivedRequestCountBefore);
    expect(JSON.stringify(viewerEvents)).not.toContain(privateMarker);
    expect(JSON.stringify(hostEvents)).not.toContain(privateMarker);
    expect(viewerLogs.join("\n")).not.toContain(privateMarker);
  });

  it("blocks public peer sends until a recipient is observed", async () => {
    const onePeerServer = await startOnePeerReadyServer();
    const viewerEvents: AgentShellEvent[] = [];
    const viewerLogs: string[] = [];
    let viewer: AgentShellRuntime | undefined;

    try {
      viewer = await startViewer(onePeerServer.url, [], viewerEvents, captureLogger(viewerLogs));

      await waitForMessage(
        viewerEvents,
        (message) => message.type === "relay-ready" && message.peerId === "viewer-1" && message.roomSize === 1
      );

      const blockedMessages: Array<{
        name: string;
        privateMarker: string;
        message: ProtocolEnvelope;
      }> = [
        {
          name: "hello",
          privateMarker: "unpaired-public-hello-private-marker",
          message: {
            ...createMessageBase("session-demo"),
            type: "hello",
            peerId: "viewer-1",
            role: "viewer",
            displayName: "unpaired-public-hello-private-marker",
            capabilities: ["agent-shell:test"]
          }
        },
        {
          name: "authorization request",
          privateMarker: "unpaired-public-request-private-reason",
          message: {
            ...createMessageBase("session-demo"),
            type: "session-authorization-request",
            viewerPeerId: "viewer-1",
            requestedPermissions: ["screen:view"],
            reason: "unpaired-public-request-private-reason"
          }
        },
        {
          name: "legacy request",
          privateMarker: "unpaired-public-legacy-request-private-marker",
          message: {
            ...createMessageBase("session-demo"),
            type: "host-consent-required",
            viewerPeerId: "viewer-1",
            viewerDisplayName: "unpaired-public-legacy-request-private-marker",
            requestedPermissions: ["screen:view"]
          }
        }
      ];

      for (const { message, name, privateMarker } of blockedMessages) {
        const sentCountBefore = viewerEvents.filter((event) => event.direction === "sent").length;

        let thrown: unknown;
        try {
          viewer.send(message);
        } catch (error) {
          thrown = error;
        }

        expect(thrown, name).toBeInstanceOf(Error);
        expect(thrown instanceof Error ? thrown.message : "", name).toBe(
          "Agent shell public send requires an observed recipient peer"
        );
        expect(thrown instanceof Error ? thrown.message : "", name).not.toContain("viewer-1");
        expect(thrown instanceof Error ? thrown.message : "", name).not.toContain("session-demo");
        await delay(50);

        expect(viewerEvents.filter((event) => event.direction === "sent"), name).toHaveLength(sentCountBefore);
        expect(JSON.stringify(viewerEvents), name).not.toContain(privateMarker);
        expect(viewerLogs.join("\n"), name).not.toContain(privateMarker);
      }
    } finally {
      await viewer?.stop();
      await onePeerServer.stop();
    }
  });

  it("blocks public cross-session signal sends after active authorization", async () => {
    const hostLogs: string[] = [];
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      hostLogger: captureLogger(hostLogs),
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForSentMessage(
      hostEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "active" &&
        message.visibleToHost
    );

    const sentSignalCountBefore = hostEvents.filter(
      (event) => event.direction === "sent" && event.message.type === "signal"
    ).length;
    const receivedSignalCountBefore = viewerEvents.filter(
      (event) => event.direction === "received" && event.message.type === "signal"
    ).length;
    const privateMarker = "cross-session-public-signal-private-marker";

    expect(() =>
      host.send({
        ...createMessageBase("other-session"),
        type: "signal",
        fromPeerId: "host-1",
        toPeerId: "viewer-1",
        payload: {
          kind: "host-offer",
          safeMarker: privateMarker
        }
      })
    ).toThrow("Agent shell message must match runtime session");
    await delay(50);

    expect(
      hostEvents.filter((event) => event.direction === "sent" && event.message.type === "signal")
    ).toHaveLength(sentSignalCountBefore);
    expect(
      viewerEvents.filter((event) => event.direction === "received" && event.message.type === "signal")
    ).toHaveLength(receivedSignalCountBefore);
    expect(JSON.stringify(hostEvents)).not.toContain(privateMarker);
    expect(JSON.stringify(viewerEvents)).not.toContain(privateMarker);
    expect(hostLogs.join("\n")).not.toContain(privateMarker);
  });

  it("blocks public join, relay lifecycle, spoofed hello, and role-mismatched request sends", async () => {
    const hostLogs: string[] = [];
    const viewerLogs: string[] = [];
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
      hostLogger: captureLogger(hostLogs)
    });
    const viewer = await startViewer(
      relay.url(),
      [],
      viewerEvents,
      captureLogger(viewerLogs)
    );

    await waitForMessage(
      viewerEvents,
      (message) => message.type === "relay-ready" && message.peerId === "viewer-1"
    );

    const blockedMessages: Array<{
      name: string;
      privateMarker?: string;
      message: ProtocolEnvelope;
    }> = [
      {
        name: "join replay",
        privateMarker: "public-join-private-marker",
        message: {
          ...createMessageBase("session-demo"),
          type: "join-session",
          peerId: "host-1",
          role: "host",
          pairingCode: "123-456",
          deviceIdentity: {
            deviceId: "dev_host_public_join",
            displayName: "public-join-private-marker",
            platform: "windows"
          }
        }
      },
      {
        name: "relay ready",
        message: {
          ...createMessageBase("session-demo"),
          type: "relay-ready",
          peerId: "host-1",
          roomSize: 2
        }
      },
      {
        name: "peer disconnect",
        message: {
          ...createMessageBase("session-demo"),
          type: "peer-disconnected",
          peerId: "host-1",
          role: "host",
          reasonCode: "peer-closed"
        }
      },
      {
        name: "spoofed hello peer",
        privateMarker: "public-hello-private-marker",
        message: {
          ...createMessageBase("session-demo"),
          type: "hello",
          peerId: "viewer-1",
          role: "host",
          displayName: "public-hello-private-marker",
          capabilities: ["agent-shell:test"]
        }
      },
      {
        name: "spoofed hello role",
        privateMarker: "public-hello-role-private-marker",
        message: {
          ...createMessageBase("session-demo"),
          type: "hello",
          peerId: "host-1",
          role: "viewer",
          displayName: "public-hello-role-private-marker",
          capabilities: ["agent-shell:test"]
        }
      },
      {
        name: "role mismatched authorization request",
        privateMarker: "public-request-private-marker",
        message: {
          ...createMessageBase("session-demo"),
          type: "session-authorization-request",
          viewerPeerId: "viewer-1",
          requestedPermissions: ["screen:view"],
          reason: "public-request-private-marker"
        }
      },
      {
        name: "role mismatched legacy request",
        privateMarker: "public-legacy-request-private-marker",
        message: {
          ...createMessageBase("session-demo"),
          type: "host-consent-required",
          viewerPeerId: "viewer-1",
          viewerDisplayName: "public-legacy-request-private-marker",
          requestedPermissions: ["screen:view"]
        }
      }
    ];

    for (const { message, name, privateMarker } of blockedMessages) {
      const sentCountBefore = hostEvents.filter((event) => event.direction === "sent").length;
      const receivedCountBefore = viewerEvents.filter((event) => event.direction === "received").length;

      let thrown: unknown;
      try {
        host.send(message);
      } catch (error) {
        thrown = error;
      }

      expect(thrown, name).toBeInstanceOf(Error);
      expect(thrown instanceof Error ? thrown.message : "", name).toBe(
        "Agent shell public send message authority is invalid"
      );
      expect(thrown instanceof Error ? thrown.message : "", name).not.toContain("host-1");
      expect(thrown instanceof Error ? thrown.message : "", name).not.toContain("viewer-1");
      await delay(50);

      expect(hostEvents.filter((event) => event.direction === "sent"), name).toHaveLength(sentCountBefore);
      expect(viewerEvents.filter((event) => event.direction === "received"), name).toHaveLength(receivedCountBefore);
      if (privateMarker) {
        expect(JSON.stringify(hostEvents), name).not.toContain(privateMarker);
        expect(JSON.stringify(viewerEvents), name).not.toContain(privateMarker);
        expect(hostLogs.join("\n"), name).not.toContain(privateMarker);
      }
    }

    const blockedViewerMessages: Array<{
      name: string;
      privateMarker: string;
      message: ProtocolEnvelope;
    }> = [
      {
        name: "spoofed viewer authorization request",
        privateMarker: "viewer-spoofed-request-private-marker",
        message: {
          ...createMessageBase("session-demo"),
          type: "session-authorization-request",
          viewerPeerId: "viewer-2",
          requestedPermissions: ["screen:view"],
          reason: "viewer-spoofed-request-private-marker"
        }
      },
      {
        name: "spoofed viewer legacy request",
        privateMarker: "viewer-spoofed-legacy-request-private-marker",
        message: {
          ...createMessageBase("session-demo"),
          type: "host-consent-required",
          viewerPeerId: "viewer-2",
          viewerDisplayName: "viewer-spoofed-legacy-request-private-marker",
          requestedPermissions: ["screen:view"]
        }
      }
    ];

    for (const { message, name, privateMarker } of blockedViewerMessages) {
      const sentCountBefore = viewerEvents.filter((event) => event.direction === "sent").length;
      const receivedCountBefore = hostEvents.filter((event) => event.direction === "received").length;

      let thrown: unknown;
      try {
        viewer.send(message);
      } catch (error) {
        thrown = error;
      }

      expect(thrown, name).toBeInstanceOf(Error);
      expect(thrown instanceof Error ? thrown.message : "", name).toBe(
        "Agent shell public send message authority is invalid"
      );
      expect(thrown instanceof Error ? thrown.message : "", name).not.toContain("viewer-2");
      await delay(50);

      expect(viewerEvents.filter((event) => event.direction === "sent"), name).toHaveLength(sentCountBefore);
      expect(hostEvents.filter((event) => event.direction === "received"), name).toHaveLength(receivedCountBefore);
      expect(JSON.stringify(viewerEvents), name).not.toContain(privateMarker);
      expect(JSON.stringify(hostEvents), name).not.toContain(privateMarker);
      expect(viewerLogs.join("\n"), name).not.toContain(privateMarker);
    }
  });

  it("keeps public legacy host consent requests non-granting", async () => {
    const viewerLogs: string[] = [];
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost();
    const viewer = await startViewer(relay.url(), [], viewerEvents, captureLogger(viewerLogs));

    await waitForMessage(
      viewerEvents,
      (message) => message.type === "relay-ready" && message.peerId === "viewer-1"
    );

    viewer.send({
      ...createMessageBase("session-demo"),
      type: "host-consent-required",
      viewerPeerId: "viewer-1",
      viewerDisplayName: "Viewer",
      requestedPermissions: ["screen:view"]
    });

    const sentRequest = await waitForSentMessage(
      viewerEvents,
      (message) => message.type === "host-consent-required"
    );
    const receivedRequest = await waitForMessage(
      hostEvents,
      (message) => message.type === "host-consent-required"
    );
    await delay(100);

    expect(sentRequest).toMatchObject({
      type: "host-consent-required",
      viewerPeerId: "viewer-1",
      requestedPermissions: ["screen:view"]
    });
    expect(receivedRequest).toMatchObject({
      type: "host-consent-required",
      viewerPeerId: "viewer-1",
      requestedPermissions: ["screen:view"]
    });
    expect(
      hostEvents.some(
        (event) =>
          event.direction === "sent" &&
          (event.message.type === "host-consent-decision" ||
            event.message.type === "session-authorization-decision" ||
            event.message.type === "session-authorization-state")
      )
    ).toBe(false);

    await expectViewerSignalSendBlocked(
      viewer,
      viewerEvents,
      "blocked-after-legacy-request-payload",
      viewerLogs
    );
  });

  it("allows reentrant host signal sends during active lifecycle sent event", async () => {
    let hostRuntime: AgentShellRuntime | undefined;
    const reentrantErrors: string[] = [];
    const signalPayload = {
      kind: "host-offer",
      safeMarker: "active-reentrant-host-signal-payload"
    };
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      visibleToHost: true,
      hostOnEvent: (event) => {
        if (
          event.direction !== "sent" ||
          event.message.type !== "session-authorization-state" ||
          event.message.status !== "active" ||
          !hostRuntime
        ) {
          return;
        }

        try {
          hostRuntime.send({
            ...createMessageBase("session-demo"),
            type: "signal",
            fromPeerId: "host-1",
            toPeerId: "viewer-1",
            payload: signalPayload
          });
        } catch (error) {
          reentrantErrors.push(error instanceof Error ? error.message : String(error));
        }
      }
    });
    hostRuntime = host;
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    const sentSignal = await waitForSentMessage(
      hostEvents,
      (message) => message.type === "signal" && message.fromPeerId === "host-1"
    );
    const receivedSignal = await waitForMessage(
      viewerEvents,
      (message) => message.type === "signal" && message.fromPeerId === "host-1"
    );

    expect(reentrantErrors).toEqual([]);
    expect(sentSignal).toMatchObject({
      type: "signal",
      fromPeerId: "host-1",
      toPeerId: "viewer-1",
      payload: {
        redacted: "[REDACTED]",
        byteLength: Buffer.byteLength(JSON.stringify(signalPayload))
      }
    });
    expect(receivedSignal).toMatchObject({
      type: "signal",
      fromPeerId: "host-1",
      toPeerId: "viewer-1",
      payload: {
        redacted: "[REDACTED]",
        byteLength: Buffer.byteLength(JSON.stringify(signalPayload))
      }
    });
    expect(JSON.stringify(sentSignal)).not.toContain("active-reentrant-host-signal-payload");
    expect(JSON.stringify(receivedSignal)).not.toContain("active-reentrant-host-signal-payload");
  });

  it("ignores unbound viewer authorization state before authorizing signal sends", async () => {
    const unboundServer = await startViewerAuthorizationLifecycleServer(() => [
      {
        ...createMessageBase("session-demo"),
        type: "session-authorization-state",
        authorizationId: "authz_unbound_state",
        actorPeerId: "host-1",
        status: "active",
        visibleToHost: true,
        permissions: ["screen:view"],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        reason: "private unbound state reason raw-token"
      }
    ]);
    const viewerEvents: AgentShellEvent[] = [];
    const viewerLogs: string[] = [];
    let viewer: AgentShellRuntime | undefined;

    try {
      viewer = await startViewer(
        unboundServer.url,
        ["screen:view"],
        viewerEvents,
        captureLogger(viewerLogs)
      );

      const rawEvent = await waitForRawEvent(viewerEvents);
      await delay(100);

      expect(rawEvent).toMatchObject({
        direction: "raw",
        text: "[REDACTED]",
        byteLength: expect.any(Number)
      });
      expect(rawEvent.byteLength).toBeGreaterThan(0);
      expect(
        viewerEvents.some(
          (event) =>
            event.direction === "received" &&
            event.message.type === "session-authorization-state"
        )
      ).toBe(false);

      await expectViewerSignalSendBlocked(
        viewer,
        viewerEvents,
        "blocked-after-unbound-state-payload",
        viewerLogs
      );
      expect(viewerLogs.join("\n")).toContain("ignored unsafe inbound protocol message bytes=");
      expect(viewerLogs.join("\n")).not.toContain("session-authorization-state");
      expect(viewerLogs.join("\n")).not.toContain("authz_unbound_state");
      expect(viewerLogs.join("\n")).not.toContain("private unbound state reason");
      expect(viewerLogs.join("\n")).not.toContain("raw-token");
      expect(JSON.stringify(viewerEvents.filter((event) => event.direction === "raw"))).not.toContain(
        "authz_unbound_state"
      );
    } finally {
      await viewer?.stop();
      await unboundServer.stop();
    }
  });

  it("ignores inbound legacy host consent decisions before authorizing signal sends", async () => {
    const legacyDecisionServer = await startViewerAuthorizationLifecycleServer(() => [
      {
        ...createMessageBase("session-demo"),
        type: "host-consent-decision",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        approved: true,
        grantedPermissions: ["screen:view"],
        reason: "private legacy decision reason legacy-grant-marker raw-token"
      }
    ]);
    const viewerEvents: AgentShellEvent[] = [];
    const viewerLogs: string[] = [];
    let viewer: AgentShellRuntime | undefined;

    try {
      viewer = await startViewer(
        legacyDecisionServer.url,
        ["screen:view"],
        viewerEvents,
        captureLogger(viewerLogs)
      );

      const rawEvent = await waitForRawEvent(viewerEvents);
      await delay(100);

      expect(rawEvent).toMatchObject({
        direction: "raw",
        text: "[REDACTED]",
        byteLength: expect.any(Number)
      });
      expect(rawEvent.byteLength).toBeGreaterThan(0);
      expect(
        viewerEvents.some(
          (event) =>
            event.direction === "received" && event.message.type === "host-consent-decision"
        )
      ).toBe(false);

      await expectViewerSignalSendBlocked(
        viewer,
        viewerEvents,
        "blocked-after-legacy-decision-payload",
        viewerLogs
      );
      const serializedEvents = JSON.stringify(viewerEvents);
      const logOutput = viewerLogs.join("\n");
      expect(logOutput).toContain("ignored unsafe inbound protocol message bytes=");
      expect(logOutput).not.toContain("host-consent-decision");
      expect(logOutput).not.toContain("host-1");
      expect(logOutput).not.toContain("private legacy decision reason");
      expect(logOutput).not.toContain("legacy-grant-marker");
      expect(logOutput).not.toContain("raw-token");
      expect(serializedEvents).not.toContain("host-consent-decision");
      expect(serializedEvents).not.toContain("host-1");
      expect(serializedEvents).not.toContain("private legacy decision reason");
      expect(serializedEvents).not.toContain("legacy-grant-marker");
      expect(serializedEvents).not.toContain("raw-token");
    } finally {
      await viewer?.stop();
      await legacyDecisionServer.stop();
    }
  });

  it("ignores mismatched viewer authorization authority before signal authorization", async () => {
    const mismatchedServer = await startViewerAuthorizationLifecycleServer(() => {
      const expiresAt = new Date(Date.now() + 60_000).toISOString();

      return [
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-decision",
          authorizationId: "authz_bound_authority",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          decision: "approved",
          grantedPermissions: ["screen:view"],
          expiresAt
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-state",
          authorizationId: "authz_bound_authority",
          actorPeerId: "host-2",
          status: "active",
          visibleToHost: true,
          permissions: ["screen:view"],
          expiresAt,
          reason: "private mismatched state reason raw-token"
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-control",
          actorPeerId: "host-2",
          action: "pause",
          reason: "private mismatched control reason raw-token"
        },
        {
          ...createMessageBase("session-demo"),
          type: "permission-revoked",
          authorizationId: "authz_bound_authority",
          actorPeerId: "host-2",
          revokedPermission: "screen:view",
          reason: "private mismatched revoke reason raw-token"
        }
      ];
    });
    const viewerEvents: AgentShellEvent[] = [];
    const viewerLogs: string[] = [];
    let viewer: AgentShellRuntime | undefined;

    try {
      viewer = await startViewer(
        mismatchedServer.url,
        ["screen:view"],
        viewerEvents,
        captureLogger(viewerLogs)
      );

      await waitForMessage(
        viewerEvents,
        (message) =>
          message.type === "session-authorization-decision" &&
          message.authorizationId === "authz_bound_authority"
      );
      const rawEvents = await waitForRawEventCount(viewerEvents, 3);
      await delay(100);

      expect(rawEvents).toHaveLength(3);
      expect(
        viewerEvents.some(
          (event) =>
            event.direction === "received" &&
            (event.message.type === "session-authorization-state" ||
              event.message.type === "session-control" ||
              event.message.type === "permission-revoked")
        )
      ).toBe(false);

      await expectViewerSignalSendBlocked(
        viewer,
        viewerEvents,
        "blocked-after-mismatched-authority-payload",
        viewerLogs
      );
      expect(viewerLogs.join("\n").match(/ignored unsafe inbound protocol message bytes=/g)).toHaveLength(3);
      expect(viewerLogs.join("\n")).not.toContain("host-2");
      expect(viewerLogs.join("\n")).not.toContain("private mismatched");
      expect(viewerLogs.join("\n")).not.toContain("raw-token");
      expect(JSON.stringify(rawEvents)).not.toContain("host-2");
      expect(JSON.stringify(rawEvents)).not.toContain("private mismatched");
      expect(JSON.stringify(rawEvents)).not.toContain("raw-token");
    } finally {
      await viewer?.stop();
      await mismatchedServer.stop();
    }
  });

  it("keeps viewer authorization denied when a later active state uses the same authority", async () => {
    const deniedThenActiveServer = await startViewerAuthorizationLifecycleServer(() => {
      const expiresAt = new Date(Date.now() + 60_000).toISOString();

      return [
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-decision",
          authorizationId: "authz_denied_then_active",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          decision: "denied",
          grantedPermissions: [],
          reason: "private denied decision reason raw-token"
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-state",
          authorizationId: "authz_denied_then_active",
          actorPeerId: "host-1",
          status: "active",
          visibleToHost: true,
          permissions: ["screen:view"],
          expiresAt,
          reason: "private denied-active state reason raw-token"
        }
      ];
    });
    const viewerEvents: AgentShellEvent[] = [];
    const viewerLogs: string[] = [];
    let viewer: AgentShellRuntime | undefined;

    try {
      viewer = await startViewer(
        deniedThenActiveServer.url,
        ["screen:view"],
        viewerEvents,
        captureLogger(viewerLogs)
      );

      await waitForMessage(
        viewerEvents,
        (message) =>
          message.type === "session-authorization-decision" &&
          message.authorizationId === "authz_denied_then_active" &&
          message.decision === "denied"
      );
      const rawEvent = await waitForRawEvent(viewerEvents);
      await delay(100);

      expect(rawEvent).toMatchObject({
        direction: "raw",
        text: "[REDACTED]",
        byteLength: expect.any(Number)
      });
      expect(
        viewerEvents.some(
          (event) =>
            event.direction === "received" &&
            event.message.type === "session-authorization-state"
        )
      ).toBe(false);

      await expectViewerSignalSendBlocked(
        viewer,
        viewerEvents,
        "blocked-after-denied-active-state-payload",
        viewerLogs
      );
      expect(viewerLogs.join("\n")).toContain("ignored unsafe inbound protocol message bytes=");
      expect(viewerLogs.join("\n")).not.toContain("private denied-active");
      expect(viewerLogs.join("\n")).not.toContain("raw-token");
      expect(JSON.stringify(viewerEvents.filter((event) => event.direction === "raw"))).not.toContain(
        "authz_denied_then_active"
      );
    } finally {
      await viewer?.stop();
      await deniedThenActiveServer.stop();
    }
  });

  it("ignores viewer authorization decisions addressed to another viewer", async () => {
    const wrongViewerServer = await startViewerAuthorizationLifecycleServer(() => {
      const expiresAt = new Date(Date.now() + 60_000).toISOString();

      return [
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-decision",
          authorizationId: "authz_other_viewer",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-2",
          decision: "approved",
          grantedPermissions: ["screen:view"],
          expiresAt
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-state",
          authorizationId: "authz_other_viewer",
          actorPeerId: "host-1",
          status: "active",
          visibleToHost: true,
          permissions: ["screen:view"],
          expiresAt,
          reason: "private wrong-viewer state reason raw-token"
        }
      ];
    });
    const viewerEvents: AgentShellEvent[] = [];
    const viewerLogs: string[] = [];
    let viewer: AgentShellRuntime | undefined;

    try {
      viewer = await startViewer(
        wrongViewerServer.url,
        ["screen:view"],
        viewerEvents,
        captureLogger(viewerLogs)
      );

      const rawEvents = await waitForRawEventCount(viewerEvents, 2);
      await delay(100);

      expect(rawEvents).toHaveLength(2);
      expect(
        viewerEvents.some(
          (event) =>
            event.direction === "received" &&
            (event.message.type === "session-authorization-decision" ||
              event.message.type === "session-authorization-state")
        )
      ).toBe(false);

      await expectViewerSignalSendBlocked(
        viewer,
        viewerEvents,
        "blocked-after-wrong-viewer-decision-payload",
        viewerLogs
      );
      expect(viewerLogs.join("\n").match(/ignored unsafe inbound protocol message bytes=/g)).toHaveLength(2);
      expect(viewerLogs.join("\n")).not.toContain("viewer-2");
      expect(viewerLogs.join("\n")).not.toContain("authz_other_viewer");
      expect(viewerLogs.join("\n")).not.toContain("private wrong-viewer");
      expect(viewerLogs.join("\n")).not.toContain("raw-token");
      expect(JSON.stringify(rawEvents)).not.toContain("viewer-2");
      expect(JSON.stringify(rawEvents)).not.toContain("authz_other_viewer");
    } finally {
      await viewer?.stop();
      await wrongViewerServer.stop();
    }
  });

  it("clears viewer authorization authority across runtime restart", async () => {
    let connectionCount = 0;
    const restartServer = await startViewerAuthorizationLifecycleServer(() => {
      connectionCount += 1;

      if (connectionCount > 1) {
        return [];
      }

      const expiresAt = new Date(Date.now() + 60_000).toISOString();

      return [
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-decision",
          authorizationId: "authz_restart_bound",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          decision: "approved",
          grantedPermissions: ["screen:view"],
          expiresAt
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-state",
          authorizationId: "authz_restart_bound",
          actorPeerId: "host-1",
          status: "active",
          visibleToHost: true,
          permissions: ["screen:view"],
          expiresAt
        }
      ];
    });
    const viewerEvents: AgentShellEvent[] = [];
    const viewerLogs: string[] = [];
    const viewer = createAgentShellRuntime(createRuntimeOptions({
      role: "viewer",
      relayUrl: restartServer.url,
      peerId: "viewer-1",
      displayName: "Viewer",
      deviceId: "dev_viewer_1",
      requestedPermissions: ["screen:view"],
      logger: captureLogger(viewerLogs),
      onEvent: (event) => viewerEvents.push(event)
    }));
    agentRuntimes.push(viewer);

    try {
      await viewer.start();
      await waitForMessage(
        viewerEvents,
        (message) =>
          message.type === "session-authorization-state" &&
          message.status === "active" &&
          message.visibleToHost
      );

      await viewer.stop();
      await viewer.start();
      await delay(100);

      await expectViewerSignalSendBlocked(
        viewer,
        viewerEvents,
        "blocked-after-viewer-restart-payload",
        viewerLogs
      );
      expect(connectionCount).toBe(2);
    } finally {
      await viewer.stop();
      await restartServer.stop();
    }
  });

  it("fails closed for host signal sends after revoke, pause, termination, or expiration", async () => {
    const scenarios: Array<{
      name: string;
      options: Parameters<typeof startRelayAndHost>[0];
      waitForClosedState: (message: AgentShellSentProtocolEnvelope) => boolean;
    }> = [
      {
        name: "revoke",
        options: {
          hostDecision: "approve",
          hostRevokeAfterMs: 10,
          hostRevokePermission: "screen:view",
          visibleToHost: true
        },
        waitForClosedState: (message) =>
          message.type === "session-authorization-state" && message.status === "revoked"
      },
      {
        name: "pause",
        options: {
          hostDecision: "approve",
          hostPauseAfterMs: 10,
          visibleToHost: true
        },
        waitForClosedState: (message) =>
          message.type === "session-authorization-state" && message.status === "paused"
      },
      {
        name: "termination",
        options: {
          hostDecision: "approve",
          hostTerminateAfterMs: 10,
          visibleToHost: true
        },
        waitForClosedState: (message) =>
          message.type === "session-authorization-state" && message.status === "terminated"
      },
      {
        name: "expiration",
        options: {
          authorizationTtlMs: 20,
          hostDecision: "approve",
          visibleToHost: true
        },
        waitForClosedState: (message) =>
          message.type === "session-authorization-state" && message.status === "expired"
      }
    ];

    for (const scenario of scenarios) {
      const hostLogs: string[] = [];
      const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
        ...scenario.options,
        hostLogger: captureLogger(hostLogs)
      });
      await startViewer(relay.url(), ["screen:view"], viewerEvents);

      await waitForSentMessage(
        hostEvents,
        (message) =>
          message.type === "session-authorization-state" &&
          message.status === "active" &&
          message.visibleToHost
      );
      await waitForSentMessage(hostEvents, scenario.waitForClosedState);

      const viewerSignalCountBefore = viewerEvents.filter(
        (event) => event.direction === "received" && event.message.type === "signal"
      ).length;

      await expectHostSignalSendBlocked(
        host,
        hostEvents,
        `blocked-host-after-${scenario.name}-payload`,
        hostLogs
      );

      expect(
        viewerEvents.filter((event) => event.direction === "received" && event.message.type === "signal")
      ).toHaveLength(viewerSignalCountBefore);
    }
  });

  it("blocks reentrant host signal sends during closing lifecycle sent events", async () => {
    const scenarios: Array<{
      name: string;
      options: Parameters<typeof startRelayAndHost>[0];
      isTrigger: (message: AgentShellSentProtocolEnvelope) => boolean;
    }> = [
      {
        name: "revoke",
        options: {
          hostDecision: "approve",
          hostRevokeAfterMs: 10,
          hostRevokePermission: "screen:view",
          visibleToHost: true
        },
        isTrigger: (message) => message.type === "permission-revoked"
      },
      {
        name: "pause",
        options: {
          hostDecision: "approve",
          hostPauseAfterMs: 10,
          visibleToHost: true
        },
        isTrigger: (message) => message.type === "session-control" && message.action === "pause"
      },
      {
        name: "termination",
        options: {
          hostDecision: "approve",
          hostTerminateAfterMs: 10,
          visibleToHost: true
        },
        isTrigger: (message) => message.type === "session-control" && message.action === "terminate"
      },
      {
        name: "expiration",
        options: {
          authorizationTtlMs: 20,
          hostDecision: "approve",
          visibleToHost: true
        },
        isTrigger: (message) =>
          message.type === "session-authorization-state" && message.status === "expired"
      }
    ];

    for (const scenario of scenarios) {
      let hostRuntime: AgentShellRuntime | undefined;
      const reentrantErrors: string[] = [];
      const blockedPayloadMarker = `blocked-reentrant-host-${scenario.name}-payload`;
      const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
        ...scenario.options,
        hostOnEvent: (event) => {
          if (event.direction !== "sent" || !scenario.isTrigger(event.message) || !hostRuntime) {
            return;
          }

          try {
            hostRuntime.send({
              ...createMessageBase("session-demo"),
              type: "signal",
              fromPeerId: "host-1",
              toPeerId: "viewer-1",
              payload: {
                kind: "host-offer",
                safeMarker: blockedPayloadMarker
              }
            });
          } catch (error) {
            reentrantErrors.push(error instanceof Error ? error.message : String(error));
          }
        }
      });
      hostRuntime = host;
      await startViewer(relay.url(), ["screen:view"], viewerEvents);

      await waitForSentMessage(
        hostEvents,
        (message) =>
          message.type === "session-authorization-state" &&
          message.status === "active" &&
          message.visibleToHost
      );
      await waitForSentMessage(hostEvents, scenario.isTrigger);
      await delay(100);

      expect(reentrantErrors).toEqual(["Agent shell signal requires active visible screen authorization"]);
      expect(
        hostEvents.some(
          (event) =>
            event.direction === "sent" &&
            event.message.type === "signal" &&
            JSON.stringify(event.message).includes(blockedPayloadMarker)
        )
      ).toBe(false);
      expect(JSON.stringify(hostEvents)).not.toContain(blockedPayloadMarker);
    }
  });

  it("clears host signal send authorization across runtime restart", async () => {
    const hostLogs: string[] = [];
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      hostLogger: captureLogger(hostLogs),
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForSentMessage(
      hostEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "active" &&
        message.visibleToHost
    );

    await host.stop();
    await host.start();

    await expectHostSignalSendBlocked(
      host,
      hostEvents,
      "blocked-host-after-restart-payload",
      hostLogs
    );
  });

  it("allows viewer signal sends after active visible screen authorization", async () => {
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      visibleToHost: true
    });
    const viewer = await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "active" &&
        message.visibleToHost
    );

    const signalPayload = {
      kind: "viewer-offer",
      safeMarker: "authorized-viewer-signal-payload"
    };
    viewer.send({
      ...createMessageBase("session-demo"),
      type: "signal",
      fromPeerId: "viewer-1",
      toPeerId: "host-1",
      payload: signalPayload
    });

    const sentSignal = await waitForSentMessage(
      viewerEvents,
      (message) => message.type === "signal" && message.fromPeerId === "viewer-1"
    );
    const receivedSignal = await waitForMessage(
      hostEvents,
      (message) => message.type === "signal" && message.fromPeerId === "viewer-1"
    );

    expect(sentSignal).toMatchObject({
      type: "signal",
      fromPeerId: "viewer-1",
      toPeerId: "host-1",
      payload: {
        redacted: "[REDACTED]",
        byteLength: Buffer.byteLength(JSON.stringify(signalPayload))
      }
    });
    expect(receivedSignal).toMatchObject({
      type: "signal",
      fromPeerId: "viewer-1",
      toPeerId: "host-1",
      payload: {
        redacted: "[REDACTED]",
        byteLength: Buffer.byteLength(JSON.stringify(signalPayload))
      }
    });
    expect(JSON.stringify(sentSignal)).not.toContain("authorized-viewer-signal-payload");
    expect(JSON.stringify(receivedSignal)).not.toContain("authorized-viewer-signal-payload");
  });

  it("fails closed for viewer signal sends after revoke, pause, termination, or expiration", async () => {
    const scenarios: Array<{
      name: string;
      options: Parameters<typeof startRelayAndHost>[0];
      waitForClosedState: (message: AgentShellReceivedProtocolEnvelope) => boolean;
    }> = [
      {
        name: "revoke",
        options: {
          hostDecision: "approve",
          hostRevokeAfterMs: 10,
          hostRevokePermission: "screen:view",
          visibleToHost: true
        },
        waitForClosedState: (message) => message.type === "permission-revoked"
      },
      {
        name: "pause",
        options: {
          hostDecision: "approve",
          hostPauseAfterMs: 10,
          visibleToHost: true
        },
        waitForClosedState: (message) =>
          message.type === "session-authorization-state" && message.status === "paused"
      },
      {
        name: "termination",
        options: {
          hostDecision: "approve",
          hostTerminateAfterMs: 10,
          visibleToHost: true
        },
        waitForClosedState: (message) =>
          message.type === "session-authorization-state" && message.status === "terminated"
      },
      {
        name: "expiration",
        options: {
          authorizationTtlMs: 20,
          hostDecision: "approve",
          visibleToHost: true
        },
        waitForClosedState: (message) =>
          message.type === "session-authorization-state" && message.status === "expired"
      }
    ];

    for (const scenario of scenarios) {
      const { relay, hostEvents, viewerEvents } = await startRelayAndHost(scenario.options);
      const viewer = await startViewer(relay.url(), ["screen:view"], viewerEvents);

      await waitForMessage(
        viewerEvents,
        (message) =>
          message.type === "session-authorization-state" &&
          message.status === "active" &&
          message.visibleToHost
      );
      await waitForMessage(viewerEvents, scenario.waitForClosedState);

      const sentCountBefore = viewerEvents.filter((event) => event.direction === "sent").length;
      const hostSignalCountBefore = hostEvents.filter(
        (event) => event.direction === "received" && event.message.type === "signal"
      ).length;
      const blockedPayloadMarker = `blocked-after-${scenario.name}-payload`;

      expect(() =>
        viewer.send({
          ...createMessageBase("session-demo"),
          type: "signal",
          fromPeerId: "viewer-1",
          toPeerId: "host-1",
          payload: {
            kind: "viewer-offer",
            safeMarker: blockedPayloadMarker
          }
        })
      ).toThrow("Agent shell signal requires active visible screen authorization");

      await delay(100);

      expect(viewerEvents.filter((event) => event.direction === "sent")).toHaveLength(sentCountBefore);
      expect(
        hostEvents.filter((event) => event.direction === "received" && event.message.type === "signal")
      ).toHaveLength(hostSignalCountBefore);
      expect(JSON.stringify(viewerEvents)).not.toContain(blockedPayloadMarker);
    }
  });

  it("ignores inbound viewer signals before host active visible screen authorization", async () => {
    const hostLogs: string[] = [];
    const { relay, hostEvents } = await startRelayAndHost({
      hostLogger: captureLogger(hostLogs)
    });
    const rawViewer = await startRawViewer(relay.url());

    try {
      const blockedPayloadMarker = "host-blocked-before-active-payload";
      sendRawViewerSignal(rawViewer, blockedPayloadMarker);

      const rawEvent = await waitForRawEvent(hostEvents);
      await delay(100);

      expect(rawEvent).toMatchObject({
        direction: "raw",
        text: "[REDACTED]",
        byteLength: expect.any(Number)
      });
      expect(rawEvent.byteLength).toBeGreaterThan(0);
      expect(hostEvents.some((event) => event.direction === "received" && event.message.type === "signal")).toBe(false);
      expect(hostLogs.join("\n")).toContain("ignored unsafe inbound protocol message bytes=");
      expect(hostLogs.join("\n")).not.toContain("received signal");
      expect(hostLogs.join("\n")).not.toContain(blockedPayloadMarker);
      expect(JSON.stringify(hostEvents)).not.toContain(blockedPayloadMarker);
    } finally {
      await closeRawSocket(rawViewer);
    }
  });

  it("accepts inbound viewer signals after host active visible screen authorization", async () => {
    const { relay, hostEvents } = await startRelayAndHost({
      hostDecision: "approve",
      visibleToHost: true
    });
    const rawViewer = await startRawViewer(relay.url());

    try {
      sendRawViewerAuthorizationRequest(rawViewer, ["screen:view"]);
      await waitForSentMessage(
        hostEvents,
        (message) =>
          message.type === "session-authorization-state" &&
          message.status === "active" &&
          message.visibleToHost
      );

      const signalPayloadMarker = "host-accepted-after-active-payload";
      const signalPayload = createRawViewerSignalPayload(signalPayloadMarker);
      sendRawViewerSignal(rawViewer, signalPayloadMarker);

      const receivedSignal = await waitForMessage(
        hostEvents,
        (message) => message.type === "signal" && message.fromPeerId === "viewer-1"
      );

      expect(receivedSignal).toMatchObject({
        type: "signal",
        fromPeerId: "viewer-1",
        toPeerId: "host-1",
        payload: {
          redacted: "[REDACTED]",
          byteLength: Buffer.byteLength(JSON.stringify(signalPayload))
        }
      });
      expect(JSON.stringify(receivedSignal)).not.toContain(signalPayloadMarker);
    } finally {
      await closeRawSocket(rawViewer);
    }
  });

  it("fails closed for inbound viewer signals after host revoke, pause, termination, or expiration", async () => {
    const scenarios: Array<{
      name: string;
      options: Parameters<typeof startRelayAndHost>[0];
      waitForClosedState: (message: AgentShellSentProtocolEnvelope) => boolean;
    }> = [
      {
        name: "revoke",
        options: {
          hostDecision: "approve",
          hostRevokeAfterMs: 10,
          hostRevokePermission: "screen:view",
          visibleToHost: true
        },
        waitForClosedState: (message) => message.type === "permission-revoked"
      },
      {
        name: "pause",
        options: {
          hostDecision: "approve",
          hostPauseAfterMs: 10,
          visibleToHost: true
        },
        waitForClosedState: (message) =>
          message.type === "session-authorization-state" && message.status === "paused"
      },
      {
        name: "termination",
        options: {
          hostDecision: "approve",
          hostTerminateAfterMs: 10,
          visibleToHost: true
        },
        waitForClosedState: (message) =>
          message.type === "session-authorization-state" && message.status === "terminated"
      },
      {
        name: "expiration",
        options: {
          authorizationTtlMs: 20,
          hostDecision: "approve",
          visibleToHost: true
        },
        waitForClosedState: (message) =>
          message.type === "session-authorization-state" && message.status === "expired"
      }
    ];

    for (const scenario of scenarios) {
      const hostLogs: string[] = [];
      const { relay, hostEvents } = await startRelayAndHost({
        ...scenario.options,
        hostLogger: captureLogger(hostLogs)
      });
      const rawViewer = await startRawViewer(relay.url());

      try {
        sendRawViewerAuthorizationRequest(rawViewer, ["screen:view"]);
        await waitForSentMessage(
          hostEvents,
          (message) =>
            message.type === "session-authorization-state" &&
            message.status === "active" &&
            message.visibleToHost
        );
        await waitForSentMessage(hostEvents, scenario.waitForClosedState);

        const rawCountBefore = hostEvents.filter((event) => event.direction === "raw").length;
        const receivedSignalCountBefore = hostEvents.filter(
          (event) => event.direction === "received" && event.message.type === "signal"
        ).length;
        const blockedPayloadMarker = `host-blocked-after-${scenario.name}-payload`;

        sendRawViewerSignal(rawViewer, blockedPayloadMarker);
        await waitForRawEventCount(hostEvents, rawCountBefore + 1);
        await delay(100);

        expect(
          hostEvents.filter((event) => event.direction === "received" && event.message.type === "signal")
        ).toHaveLength(receivedSignalCountBefore);
        expect(hostLogs.join("\n")).toContain("ignored unsafe inbound protocol message bytes=");
        expect(hostLogs.join("\n")).not.toContain("received signal");
        expect(hostLogs.join("\n")).not.toContain(blockedPayloadMarker);
        expect(JSON.stringify(hostEvents)).not.toContain(blockedPayloadMarker);
      } finally {
        await closeRawSocket(rawViewer);
      }
    }
  });

  it("clears host inbound signal authorization across runtime restart", async () => {
    const hostLogs: string[] = [];
    const { relay, host, hostEvents } = await startRelayAndHost({
      hostDecision: "approve",
      hostLogger: captureLogger(hostLogs),
      visibleToHost: true
    });
    const rawViewerBeforeRestart = await startRawViewer(relay.url());

    try {
      sendRawViewerAuthorizationRequest(rawViewerBeforeRestart, ["screen:view"]);
      await waitForSentMessage(
        hostEvents,
        (message) =>
          message.type === "session-authorization-state" &&
          message.status === "active" &&
          message.visibleToHost
      );
    } finally {
      await closeRawSocket(rawViewerBeforeRestart);
    }

    await host.stop();
    await host.start();

    const rawViewerAfterRestart = await startRawViewer(relay.url());
    try {
      const rawCountBefore = hostEvents.filter((event) => event.direction === "raw").length;
      const receivedSignalCountBefore = hostEvents.filter(
        (event) => event.direction === "received" && event.message.type === "signal"
      ).length;
      const blockedPayloadMarker = "host-blocked-after-restart-payload";

      sendRawViewerSignal(rawViewerAfterRestart, blockedPayloadMarker);
      await waitForRawEventCount(hostEvents, rawCountBefore + 1);
      await delay(100);

      expect(
        hostEvents.filter((event) => event.direction === "received" && event.message.type === "signal")
      ).toHaveLength(receivedSignalCountBefore);
      expect(hostLogs.join("\n")).toContain("ignored unsafe inbound protocol message bytes=");
      expect(hostLogs.join("\n")).not.toContain("received signal");
      expect(hostLogs.join("\n")).not.toContain(blockedPayloadMarker);
      expect(JSON.stringify(hostEvents)).not.toContain(blockedPayloadMarker);
    } finally {
      await closeRawSocket(rawViewerAfterRestart);
    }
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

  it("ignores peer-disconnected notices that identify the local peer", async () => {
    const selfDisconnectServer = await startSelfDisconnectNoticeServer();
    const hostEvents: AgentShellEvent[] = [];
    const hostLogs: string[] = [];
    let host: AgentShellRuntime | undefined;

    try {
      host = createAgentShellRuntime(createRuntimeOptions({
        relayUrl: selfDisconnectServer.url,
        logger: captureLogger(hostLogs),
        onEvent: (event) => hostEvents.push(event)
      }));
      await host.start();

      const rawEvent = await waitForRawEvent(hostEvents);
      await delay(100);

      expect(rawEvent).toMatchObject({
        direction: "raw",
        text: "[REDACTED]",
        byteLength: expect.any(Number)
      });
      expect(rawEvent.byteLength).toBeGreaterThan(0);
      expect(hostEvents.some((event) => event.direction === "received")).toBe(false);

      if (!host) {
        throw new Error("Host runtime was not started");
      }

      const sentCountBefore = hostEvents.filter((event) => event.direction === "sent").length;
      expect(() =>
        host.send({
          ...createMessageBase("session-demo"),
          type: "hello",
          peerId: "host-1",
          role: "host",
          displayName: "Host",
          capabilities: ["agent-shell:test"]
        })
      ).toThrow("Agent shell public send requires an observed recipient peer");
      expect(hostEvents.filter((event) => event.direction === "sent")).toHaveLength(sentCountBefore);

      const serializedRawEvents = JSON.stringify(hostEvents.filter((event) => event.direction === "raw"));
      const logOutput = hostLogs.join("\n");
      expect(logOutput).toContain("ignored unsafe inbound protocol message bytes=");
      expect(logOutput).not.toContain("peer-disconnected");
      expect(logOutput).not.toContain("host-1");
      expect(logOutput).not.toContain("session-demo");
      expect(serializedRawEvents).not.toContain("peer-disconnected");
      expect(serializedRawEvents).not.toContain("host-1");
      expect(serializedRawEvents).not.toContain("session-demo");
    } finally {
      await host?.stop();
      await selfDisconnectServer.stop();
    }
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
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents, silentLogger, viewerAuditSink);

    await waitForSentMessage(
      hostEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "active" &&
        message.visibleToHost
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

  it("blocks public workflow audit-event sends without leaking details", async () => {
    const { host, hostEvents } = await startRelayAndHost();
    await waitForMessage(
      hostEvents,
      (message) => message.type === "relay-ready" && message.peerId === "host-1"
    );

    const sentAuditCountBefore = hostEvents.filter(
      (event) => event.direction === "sent" && event.message.type === "audit-event"
    ).length;

    expect(() =>
      host.send({
        ...createMessageBase("session-demo"),
        type: "audit-event",
        eventId: "audit_sent_blocked",
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
      })
    ).toThrow("Agent shell workflow authority messages require internal consent workflow");

    await delay(50);

    expect(
      hostEvents.filter((event) => event.direction === "sent" && event.message.type === "audit-event")
    ).toHaveLength(sentAuditCountBefore);
    expect(JSON.stringify(hostEvents)).not.toContain("raw-token-value");
    expect(JSON.stringify(hostEvents)).not.toContain("raw-credential-value");
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
        type: "hello",
        peerId: "host-1",
        role: "host",
        displayName: "",
        capabilities: ["agent-shell:test"]
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
    const nonProtocolServer = await startNonProtocolMessageServer(
      "relay-error do-not-log Message session does not match registered peer"
    );
    const hostLogs: string[] = [];
    const hostEvents: AgentShellEvent[] = [];
    let host: AgentShellRuntime | undefined;

    try {
      host = createAgentShellRuntime(createRuntimeOptions({
        relayUrl: nonProtocolServer.url,
        logger: captureLogger(hostLogs),
        onEvent: (event) => hostEvents.push(event)
      }));
      await host.start();

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
    } finally {
      await host?.stop();
      await nonProtocolServer.stop();
    }
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
  hostOnEvent?: (event: AgentShellEvent) => void;
  hostPauseAfterMs?: number;
  hostPauseReason?: string;
  hostResumeAfterMs?: number;
  hostResumeReason?: string;
  hostRevokeAfterMs?: number;
  hostRevokePermission?: Permission;
  hostRevokeReason?: string;
  hostTerminateAfterMs?: number;
  hostTerminateReason?: string;
  hostToken?: string;
  relaySharedToken?: string;
  visibleToHost?: boolean;
} = {}) {
  const relay = createRelayRuntime({
    port: 0,
    auditSink: new MemoryAuditSink(),
    heartbeat: false,
    sharedToken: options.relaySharedToken,
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
    token: options.hostToken,
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
    onEvent: (event) => {
      hostEvents.push(event);
      options.hostOnEvent?.(event);
    }
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

async function startRawViewer(relayUrl: string): Promise<WebSocket> {
  const socket = await openRawSocket(relayUrl);
  socket.send(encodeProtocolEnvelope({
    ...createMessageBase("session-demo"),
    type: "join-session",
    peerId: "viewer-1",
    role: "viewer",
    pairingCode: "123-456"
  }));
  await waitForRawSocketProtocolMessage(
    socket,
    (message) => message.type === "relay-ready" && message.peerId === "viewer-1"
  );
  return socket;
}

function sendRawViewerAuthorizationRequest(
  socket: WebSocket,
  requestedPermissions: Permission[]
): void {
  socket.send(encodeProtocolEnvelope({
    ...createMessageBase("session-demo"),
    type: "session-authorization-request",
    viewerPeerId: "viewer-1",
    requestedPermissions,
    reason: "Raw viewer authorization request"
  }));
}

function sendRawViewerSignal(socket: WebSocket, payloadMarker: string): void {
  socket.send(encodeProtocolEnvelope({
    ...createMessageBase("session-demo"),
    type: "signal",
    fromPeerId: "viewer-1",
    toPeerId: "host-1",
    payload: createRawViewerSignalPayload(payloadMarker)
  }));
}

function createRawViewerSignalPayload(payloadMarker: string): Record<string, unknown> {
  return {
    kind: "viewer-offer",
    safeMarker: payloadMarker
  };
}

function openRawSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function closeRawSocket(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    socket.once("close", () => resolve());
    socket.close();
  });
}

function waitForRawSocketProtocolMessage(
  socket: WebSocket,
  predicate: (message: ProtocolEnvelope) => boolean
): Promise<ProtocolEnvelope> {
  return withTimeout(
    new Promise((resolve) => {
      const onMessage = (data: RawData) => {
        const parsed = JSON.parse(data.toString()) as ProtocolEnvelope;

        if (predicate(parsed)) {
          socket.off("message", onMessage);
          resolve(parsed);
        }
      };

      socket.on("message", onMessage);
    })
  );
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

function waitForRawEventCount(
  events: AgentShellEvent[],
  count: number
): Promise<Array<Extract<AgentShellEvent, { direction: "raw" }>>> {
  return withTimeout(
    new Promise((resolve) => {
      const interval = setInterval(() => {
        const matches = events.filter((event) => event.direction === "raw");

        if (matches.length >= count) {
          clearInterval(interval);
          resolve(matches.slice(0, count) as Array<Extract<AgentShellEvent, { direction: "raw" }>>);
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

async function expectViewerSignalSendBlocked(
  viewer: AgentShellRuntime,
  viewerEvents: AgentShellEvent[],
  blockedPayloadMarker: string,
  viewerLogs: string[] = []
): Promise<void> {
  const sentSignalCountBefore = viewerEvents.filter(
    (event) => event.direction === "sent" && event.message.type === "signal"
  ).length;

  expect(() =>
    viewer.send({
      ...createMessageBase("session-demo"),
      type: "signal",
      fromPeerId: "viewer-1",
      toPeerId: "host-1",
      payload: {
        kind: "viewer-offer",
        safeMarker: blockedPayloadMarker
      }
    })
  ).toThrow("Agent shell signal requires active visible screen authorization");

  await delay(100);

  expect(
    viewerEvents.filter((event) => event.direction === "sent" && event.message.type === "signal")
  ).toHaveLength(sentSignalCountBefore);
  expect(JSON.stringify(viewerEvents)).not.toContain(blockedPayloadMarker);
  expect(viewerLogs.join("\n")).not.toContain(blockedPayloadMarker);
}

async function expectHostSignalSendBlocked(
  host: AgentShellRuntime,
  hostEvents: AgentShellEvent[],
  blockedPayloadMarker: string,
  hostLogs: string[] = []
): Promise<void> {
  const sentSignalCountBefore = hostEvents.filter(
    (event) => event.direction === "sent" && event.message.type === "signal"
  ).length;

  expect(() =>
    host.send({
      ...createMessageBase("session-demo"),
      type: "signal",
      fromPeerId: "host-1",
      toPeerId: "viewer-1",
      payload: {
        kind: "host-offer",
        safeMarker: blockedPayloadMarker
      }
    })
  ).toThrow("Agent shell signal requires active visible screen authorization");

  await delay(100);

  expect(
    hostEvents.filter((event) => event.direction === "sent" && event.message.type === "signal")
  ).toHaveLength(sentSignalCountBefore);
  expect(JSON.stringify(hostEvents)).not.toContain(blockedPayloadMarker);
  expect(hostLogs.join("\n")).not.toContain(blockedPayloadMarker);
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

async function startNonProtocolMessageServer(text: string): Promise<{
  url: string;
  stop(): Promise<void>;
}> {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  wss.on("connection", (socket) => {
    socket.once("message", () => {
      socket.send(text);
    });
  });
  await once(wss, "listening");

  const address = wss.address() as AddressInfo | string | null;
  if (!address || typeof address === "string") {
    throw new Error("Non-protocol test server did not expose a TCP port");
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

async function startViewerAuthorizationLifecycleServer(createMessages: () => ProtocolEnvelope[]): Promise<{
  url: string;
  stop(): Promise<void>;
}> {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  wss.on("connection", (socket) => {
    socket.once("message", () => {
      for (const message of createMessages()) {
        socket.send(encodeProtocolEnvelope(message));
      }
    });
  });
  await once(wss, "listening");

  const address = wss.address() as AddressInfo | string | null;
  if (!address || typeof address === "string") {
    throw new Error("Viewer authorization lifecycle test server did not expose a TCP port");
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

async function startForeignRelayReadyServer(): Promise<{
  url: string;
  stop(): Promise<void>;
}> {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  wss.on("connection", (socket) => {
    socket.once("message", () => {
      socket.send(encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "relay-ready",
        peerId: "host-1",
        roomSize: 2
      }));
    });
  });
  await once(wss, "listening");

  const address = wss.address() as AddressInfo | string | null;
  if (!address || typeof address === "string") {
    throw new Error("Foreign relay-ready test server did not expose a TCP port");
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

async function startSelfHelloServer(): Promise<{
  url: string;
  stop(): Promise<void>;
}> {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  wss.on("connection", (socket) => {
    socket.once("message", () => {
      socket.send(encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "hello",
        peerId: "host-1",
        role: "host",
        displayName: "self hello display",
        capabilities: ["session:visible", "consent:required"]
      }));
    });
  });
  await once(wss, "listening");

  const address = wss.address() as AddressInfo | string | null;
  if (!address || typeof address === "string") {
    throw new Error("Self-hello test server did not expose a TCP port");
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

async function startSameRoleHelloServer(): Promise<{
  url: string;
  stop(): Promise<void>;
}> {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  wss.on("connection", (socket) => {
    socket.once("message", () => {
      socket.send(encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "hello",
        peerId: "viewer-2",
        role: "viewer",
        displayName: "same-role hello display",
        capabilities: ["same-role:private-capability"]
      }));
    });
  });
  await once(wss, "listening");

  const address = wss.address() as AddressInfo | string | null;
  if (!address || typeof address === "string") {
    throw new Error("Same-role hello test server did not expose a TCP port");
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

async function startMisdirectedSignalServer(): Promise<{
  url: string;
  stop(): Promise<void>;
}> {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  wss.on("connection", (socket) => {
    socket.once("message", () => {
      socket.send(encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "signal",
        fromPeerId: "viewer-1",
        toPeerId: "other-peer",
        payload: {
          kind: "offer",
          sdp: "private-signal-payload-marker"
        }
      }));
      socket.send(encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "signal",
        fromPeerId: "host-1",
        toPeerId: "host-1",
        payload: {
          kind: "answer",
          sdp: "private-signal-payload-marker"
        }
      }));
    });
  });
  await once(wss, "listening");

  const address = wss.address() as AddressInfo | string | null;
  if (!address || typeof address === "string") {
    throw new Error("Misdirected signal test server did not expose a TCP port");
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

async function startSelfAuthorityWorkflowServer(): Promise<{
  url: string;
  stop(): Promise<void>;
}> {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  wss.on("connection", (socket) => {
    socket.once("message", () => {
      const expiresAt = new Date(Date.now() + 60_000).toISOString();
      const messages: ProtocolEnvelope[] = [
        {
          ...createMessageBase("session-demo"),
          type: "host-consent-decision",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          approved: true,
          grantedPermissions: ["input:keyboard"],
          reason: "private self-authority reason self-decision-grant-marker raw-token"
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-decision",
          authorizationId: "authz_self_decision",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          decision: "denied",
          grantedPermissions: [],
          reason: "private self-authority reason raw-token"
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-state",
          authorizationId: "authz_self_state",
          actorPeerId: "host-1",
          status: "active",
          visibleToHost: true,
          permissions: ["screen:view"],
          expiresAt,
          reason: "private self-authority reason raw-token"
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-control",
          actorPeerId: "host-1",
          action: "pause",
          reason: "private self-authority reason raw-token"
        },
        {
          ...createMessageBase("session-demo"),
          type: "permission-revoked",
          authorizationId: "authz_self_revoke",
          actorPeerId: "host-1",
          revokedPermission: "screen:view",
          reason: "private self-authority reason raw-token"
        },
        {
          ...createMessageBase("session-demo"),
          type: "audit-event",
          eventId: "audit_self_authority",
          actorPeerId: "host-1",
          action: "agent-shell.self-authority.raw-token",
          outcome: "accepted",
          detail: {
            token: "raw-token"
          }
        }
      ];

      for (const message of messages) {
        socket.send(encodeProtocolEnvelope(message));
      }
    });
  });
  await once(wss, "listening");

  const address = wss.address() as AddressInfo | string | null;
  if (!address || typeof address === "string") {
    throw new Error("Self-authority workflow test server did not expose a TCP port");
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

async function startSelfDisconnectNoticeServer(): Promise<{
  url: string;
  stop(): Promise<void>;
}> {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  wss.on("connection", (socket) => {
    socket.once("message", () => {
      socket.send(encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "peer-disconnected",
        peerId: "host-1",
        role: "host",
        reasonCode: "peer-closed"
      }));
    });
  });
  await once(wss, "listening");

  const address = wss.address() as AddressInfo | string | null;
  if (!address || typeof address === "string") {
    throw new Error("Self-disconnect test server did not expose a TCP port");
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

async function startCrossSessionAuthorizationRequestServer(): Promise<{
  url: string;
  stop(): Promise<void>;
}> {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  wss.on("connection", (socket) => {
    socket.once("message", () => {
      socket.send(encodeProtocolEnvelope({
        ...createMessageBase("other-session"),
        type: "session-authorization-request",
        viewerPeerId: "viewer-1",
        requestedPermissions: ["screen:view"],
        reason: "private cross-session reason token raw-token"
      }));
    });
  });
  await once(wss, "listening");

  const address = wss.address() as AddressInfo | string | null;
  if (!address || typeof address === "string") {
    throw new Error("Cross-session request test server did not expose a TCP port");
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

async function startSelfReferentialAuthorizationRequestServer(): Promise<{
  url: string;
  stop(): Promise<void>;
}> {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  wss.on("connection", (socket) => {
    socket.once("message", () => {
      socket.send(encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-authorization-request",
        viewerPeerId: "host-1",
        requestedPermissions: ["screen:view"],
        reason: "private self-viewer reason token raw-token"
      }));
    });
  });
  await once(wss, "listening");

  const address = wss.address() as AddressInfo | string | null;
  if (!address || typeof address === "string") {
    throw new Error("Self-referential request test server did not expose a TCP port");
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
