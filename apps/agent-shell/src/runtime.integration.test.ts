import { once } from "node:events";
import { readFileSync, rmSync, mkdtempSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileAuditSink, MemoryAuditSink, type AuditSink } from "@winbridge/audit-log";
import {
  createMessageBase,
  encodeProtocolEnvelope,
  stringifyJson,
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
  type AgentShellHostIndicatorEvent,
  type AgentShellReceivedProtocolEnvelope,
  type AgentShellSentProtocolEnvelope,
  type AgentShellRuntimeOptions,
  type AgentShellRuntime,
  type HostDecision,
  type HostDecisionProvider
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
const KEY_MATERIAL_SIGNAL_PAYLOAD_CASES = [
  {
    name: "accessKey",
    payload: { nested: { accessKey: "raw-agent-access-key" } },
    rawValues: ["raw-agent-access-key"]
  },
  {
    name: "access_key",
    payload: { nested: { access_key: "raw-agent-access-key-underscore" } },
    rawValues: ["raw-agent-access-key-underscore"]
  },
  {
    name: "access-key",
    payload: { nested: { "access-key": "raw-agent-access-key-dash" } },
    rawValues: ["raw-agent-access-key-dash"]
  },
  {
    name: "array sshKey",
    payload: { attempts: [{ sshKey: "raw-agent-ssh-key" }] },
    rawValues: ["raw-agent-ssh-key"]
  },
  {
    name: "array ssh_key",
    payload: { attempts: [{ ssh_key: "raw-agent-ssh-key-underscore" }] },
    rawValues: ["raw-agent-ssh-key-underscore"]
  }
] satisfies Array<{ name: string; payload: Record<string, unknown>; rawValues: string[] }>;
const UNSAFE_SIGNAL_PAYLOAD_KEY_CASES = [
  {
    name: "ASCII control key",
    payload: { ["unsafe\nagent-private-signal-key"]: "agent-private-signal-value" },
    expectedMessage: "Signal payload keys must not contain ASCII control characters",
    rawValues: ["agent-private-signal-key", "agent-private-signal-value"]
  },
  {
    name: "nested bidi key",
    payload: { nested: { ["unsafe\u202eagent-private-signal-key"]: "agent-private-signal-value" } },
    expectedMessage:
      "Signal payload keys must not contain Unicode bidi or zero-width formatting controls",
    rawValues: ["agent-private-signal-key", "agent-private-signal-value"]
  },
  {
    name: "array zero-width key",
    payload: { candidates: [{ ["unsafe\ufeffagent-private-signal-key"]: "agent-private-signal-value" }] },
    expectedMessage:
      "Signal payload keys must not contain Unicode bidi or zero-width formatting controls",
    rawValues: ["agent-private-signal-key", "agent-private-signal-value"]
  }
] satisfies Array<{
  name: string;
  payload: Record<string, unknown>;
  expectedMessage: string;
  rawValues: string[];
}>;

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
        "case-variant relay URL token query",
        { relayUrl: "ws://127.0.0.1:8787/?Token=raw-token" },
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
      ["untrimmed display name", { displayName: " Host" }, "Runtime display name"],
      ["control-character display name", { displayName: "Host\nName" }, "Runtime display name"],
      ["bidi-control display name", { displayName: "Host\u202eName" }, "Runtime display name"],
      ["zero-width display name", { displayName: "Host\ufeffName" }, "Runtime display name"],
      ["providerless host consent timeout", { hostConsentTimeoutMs: 5000 }, "Host consent timeout"],
      [
        "zero host consent timeout",
        { hostDecisionProvider: () => "deny", hostConsentTimeoutMs: 0 },
        "Host consent timeout"
      ],
      [
        "fractional host consent timeout",
        { hostDecisionProvider: () => "deny", hostConsentTimeoutMs: 1.5 },
        "Host consent timeout"
      ],
      [
        "unsafe host consent timeout",
        { hostDecisionProvider: () => "deny", hostConsentTimeoutMs: 2_147_483_648 },
        "Host consent timeout"
      ],
      ["blank token", { token: "   " }, "Runtime token"],
      ["untrimmed token", { token: " relay-token " }, "Runtime token"],
      ["non-string token", { token: null as unknown as string }, "Runtime token"],
      ["control-character token", { token: "dev\ntoken" }, "Runtime token"],
      ["bidi-control token", { token: "dev\u202etoken" }, "Runtime token"],
      ["zero-width token", { token: "dev\u200btoken" }, "Runtime token"],
      ["feff token", { token: "dev\ufefftoken" }, "Runtime token"],
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
      ["zero authorization TTL", { authorizationTtlMs: 0 }, "Runtime authorization TTL"],
      ["unsafe workflow timer", { hostPauseAfterMs: 2_147_483_648 }, "Runtime workflow timer"],
      [
        "unsafe viewer signal probe timer",
        {
          role: "viewer",
          peerId: "viewer-1",
          displayName: "Viewer",
          deviceId: "dev_viewer_1",
          requestedPermissions: ["screen:view"],
          viewerSignalProbeAfterMs: 2_147_483_648
        },
        "Runtime workflow timer"
      ],
      [
        "host viewer signal probe",
        { viewerSignalProbeAfterMs: 0 },
        "Runtime viewer signal probe"
      ],
      [
        "viewer signal probe without screen view",
        {
          role: "viewer",
          peerId: "viewer-1",
          displayName: "Viewer",
          deviceId: "dev_viewer_1",
          requestedPermissions: ["input:pointer"],
          viewerSignalProbeAfterMs: 0
        },
        "Runtime viewer signal probe"
      ],
      ["blank decision reason", { decisionReason: "   " }, "Runtime workflow reasons"],
      ["untrimmed decision reason", { decisionReason: " Host denied" }, "Runtime workflow reasons"],
      ["control-character decision reason", { decisionReason: "Host\ndenied" }, "Runtime workflow reasons"],
      ["bidi-control decision reason", { decisionReason: "Host\u202edenied" }, "Runtime workflow reasons"],
      ["zero-width decision reason", { decisionReason: "Host\u200bdenied" }, "Runtime workflow reasons"],
      ["feff decision reason", { decisionReason: "Host\ufeffdenied" }, "Runtime workflow reasons"],
      ["untrimmed revoke reason", { hostRevokeReason: "Host revoked " }, "Runtime workflow reasons"],
      ["control-character revoke reason", { hostRevokeReason: "Host\nrevoked" }, "Runtime workflow reasons"],
      ["untrimmed pause reason", { hostPauseReason: " Host paused" }, "Runtime workflow reasons"],
      ["bidi-control pause reason", { hostPauseReason: "Host\u202epaused" }, "Runtime workflow reasons"],
      ["untrimmed resume reason", { hostResumeReason: "Host resumed " }, "Runtime workflow reasons"],
      ["zero-width resume reason", { hostResumeReason: "Host\u200bresumed" }, "Runtime workflow reasons"],
      [
        "untrimmed terminate reason",
        { hostTerminateReason: " Host terminated " },
        "Runtime workflow reasons"
      ],
      [
        "feff terminate reason",
        { hostTerminateReason: "Host\ufeffterminated" },
        "Runtime workflow reasons"
      ],
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

  it("rejects unsafe runtime workflow reasons without exposing raw reason text", () => {
    for (const reason of [
      "runtime-private-reason-marker\n",
      "runtime-private-reason-marker\u202e",
      "runtime-private-reason-marker\u200b",
      "runtime-private-reason-marker\ufeff"
    ]) {
      try {
        createAgentShellRuntime(createRuntimeOptions({
          hostTerminateReason: reason,
          logger: silentLogger
        }));
        throw new Error("Expected unsafe runtime workflow reason to be rejected");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("Runtime workflow reasons");
        expect((error as Error).message).not.toContain("runtime-private-reason-marker");
        expect((error as Error).message).not.toContain(reason);
      }
    }
  });

  it("accepts zero direct runtime lifecycle delays before relay startup", async () => {
    const runtime = createAgentShellRuntime(createRuntimeOptions({
      hostDisconnectAfterMs: 0,
      hostPauseAfterMs: 0,
      hostResumeAfterMs: 0,
      hostRevokeAfterMs: 0,
      hostTerminateAfterMs: 0
    }));

    await runtime.stop();
  });

  it("rejects untrimmed runtime tokens without exposing raw token text", () => {
    const token = " runtime-token-private-marker ";

    try {
      createAgentShellRuntime(createRuntimeOptions({
        token,
        logger: silentLogger
      }));
      throw new Error("Expected untrimmed runtime token to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("Runtime token");
      expect((error as Error).message).not.toContain("runtime-token-private-marker");
      expect((error as Error).message).not.toContain(token);
    }
  });

  it("rejects format-control runtime tokens without exposing raw token text", () => {
    for (const token of ["runtime-token\u202eprivate-marker", "runtime-token\ufeffprivate-marker"]) {
      try {
        createAgentShellRuntime(createRuntimeOptions({
          token,
          logger: silentLogger
        }));
        throw new Error("Expected format-control runtime token to be rejected");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("Runtime token");
        expect((error as Error).message).not.toContain("runtime-token");
        expect((error as Error).message).not.toContain("private-marker");
        expect((error as Error).message).not.toContain(token);
      }
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

  it("treats inbound messages with unknown fixed fields as raw unsafe input", async () => {
    const privateMarker = "agent-inbound-unknown-fixed-field-private-marker";
    const server = await startViewerAuthorizationLifecycleServer(() => [
      JSON.stringify({
        ...createMessageBase("session-demo"),
        type: "hello",
        peerId: "viewer-1",
        role: "viewer",
        displayName: "Viewer",
        capabilities: ["session:visible", "consent:required"],
        unknownFixedField: privateMarker
      })
    ]);
    const hostEvents: AgentShellEvent[] = [];
    const hostLogs: string[] = [];
    let host: AgentShellRuntime | undefined;

    try {
      host = createAgentShellRuntime(createRuntimeOptions({
        relayUrl: server.url,
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
      expect(hostEvents.some((event) => event.direction === "received")).toBe(false);
      expect(hostEvents.some((event) => event.direction === "sent" && event.message.type === "hello")).toBe(false);

      const serializedEvents = JSON.stringify(hostEvents);
      const logOutput = hostLogs.join("\n");
      expect(logOutput).toContain("received non-protocol message bytes=");
      expect(logOutput).not.toContain(privateMarker);
      expect(logOutput).not.toContain("unknownFixedField");
      expect(serializedEvents).not.toContain(privateMarker);
      expect(serializedEvents).not.toContain("unknownFixedField");
    } finally {
      await host?.stop();
      await server.stop();
    }
  });

  it("treats inbound hello messages with malformed capabilities as raw unsafe input", async () => {
    const cases: Array<{
      name: string;
      capabilities: string[];
      privateMarker: string;
    }> = [
      {
        name: "untrimmed capability",
        capabilities: ["session:visible", "capability-private-marker "],
        privateMarker: "capability-private-marker"
      },
      {
        name: "trim-duplicate capability",
        capabilities: ["session:visible", "session:visible "],
        privateMarker: "session:visible "
      },
      {
        name: "control-character capability",
        capabilities: ["session:visible", "capability\ninbound-private-marker"],
        privateMarker: "inbound-private-marker"
      },
      {
        name: "bidi-control capability",
        capabilities: ["session:visible", "capability\u202einbound-private-marker"],
        privateMarker: "inbound-private-marker"
      },
      {
        name: "zero-width capability",
        capabilities: ["session:visible", "capability\ufeffinbound-private-marker"],
        privateMarker: "inbound-private-marker"
      }
    ];

    for (const { capabilities, name, privateMarker } of cases) {
      const server = await startViewerAuthorizationLifecycleServer(() => [
        JSON.stringify({
          ...createMessageBase("session-demo"),
          type: "hello",
          peerId: "viewer-1",
          role: "viewer",
          displayName: "Viewer Private Display",
          capabilities
        })
      ]);
      const hostEvents: AgentShellEvent[] = [];
      const hostLogs: string[] = [];
      let host: AgentShellRuntime | undefined;

      try {
        host = createAgentShellRuntime(createRuntimeOptions({
          relayUrl: server.url,
          logger: captureLogger(hostLogs),
          onEvent: (event) => hostEvents.push(event)
        }));
        await host.start();

        const rawEvent = await waitForRawEvent(hostEvents);
        await delay(100);

        expect(rawEvent, name).toMatchObject({
          direction: "raw",
          text: "[REDACTED]",
          byteLength: expect.any(Number)
        });
        expect(hostEvents.some((event) => event.direction === "received"), name).toBe(false);
        expect(
          hostEvents.some((event) => event.direction === "sent" && event.message.type === "hello"),
          name
        ).toBe(false);

        const serializedEvents = JSON.stringify(hostEvents);
        const logOutput = hostLogs.join("\n");
        expect(logOutput, name).toContain("received non-protocol message bytes=");
        expect(logOutput, name).not.toContain(privateMarker);
        for (const capability of capabilities) {
          expect(logOutput, name).not.toContain(capability);
          expect(serializedEvents, name).not.toContain(capability);
        }
        expect(logOutput, name).not.toContain("Viewer Private Display");
        expect(serializedEvents, name).not.toContain(privateMarker);
        expect(serializedEvents, name).not.toContain("Viewer Private Display");
      } finally {
        await host?.stop();
        await server.stop();
      }
    }
  });

  it("treats inbound hello messages with untrimmed display names as raw unsafe input", async () => {
    const privateMarker = "Viewer Private Display";
    const server = await startViewerAuthorizationLifecycleServer(() => [
      JSON.stringify({
        ...createMessageBase("session-demo"),
        type: "hello",
        peerId: "viewer-1",
        role: "viewer",
        displayName: ` ${privateMarker} `,
        capabilities: ["session:visible"]
      })
    ]);
    const hostEvents: AgentShellEvent[] = [];
    const hostLogs: string[] = [];
    let host: AgentShellRuntime | undefined;

    try {
      host = createAgentShellRuntime(createRuntimeOptions({
        relayUrl: server.url,
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
      expect(hostEvents.some((event) => event.direction === "received")).toBe(false);
      expect(hostEvents.some((event) => event.direction === "sent" && event.message.type === "hello")).toBe(false);

      const serializedEvents = JSON.stringify(hostEvents);
      const logOutput = hostLogs.join("\n");
      expect(logOutput).toContain("received non-protocol message bytes=");
      expect(logOutput).not.toContain(privateMarker);
      expect(serializedEvents).not.toContain(privateMarker);
    } finally {
      await host?.stop();
      await server.stop();
    }
  });

  it("treats inbound hello messages with control-character display names as raw unsafe input", async () => {
    const privateMarker = "Viewer Private Display";
    const server = await startViewerAuthorizationLifecycleServer(() => [
      JSON.stringify({
        ...createMessageBase("session-demo"),
        type: "hello",
        peerId: "viewer-1",
        role: "viewer",
        displayName: `${privateMarker}\nControl`,
        capabilities: ["session:visible"]
      })
    ]);
    const hostEvents: AgentShellEvent[] = [];
    const hostLogs: string[] = [];
    let host: AgentShellRuntime | undefined;

    try {
      host = createAgentShellRuntime(createRuntimeOptions({
        relayUrl: server.url,
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
      expect(hostEvents.some((event) => event.direction === "received")).toBe(false);
      expect(hostEvents.some((event) => event.direction === "sent" && event.message.type === "hello")).toBe(false);

      const serializedEvents = JSON.stringify(hostEvents);
      const logOutput = hostLogs.join("\n");
      expect(logOutput).toContain("received non-protocol message bytes=");
      expect(logOutput).not.toContain(privateMarker);
      expect(serializedEvents).not.toContain(privateMarker);
    } finally {
      await host?.stop();
      await server.stop();
    }
  });

  it("treats inbound hello messages with bidi-control display names as raw unsafe input", async () => {
    const privateMarker = "Viewer Private Display";
    const server = await startViewerAuthorizationLifecycleServer(() => [
      JSON.stringify({
        ...createMessageBase("session-demo"),
        type: "hello",
        peerId: "viewer-1",
        role: "viewer",
        displayName: `${privateMarker}\u202eControl`,
        capabilities: ["session:visible"]
      })
    ]);
    const hostEvents: AgentShellEvent[] = [];
    const hostLogs: string[] = [];
    let host: AgentShellRuntime | undefined;

    try {
      host = createAgentShellRuntime(createRuntimeOptions({
        relayUrl: server.url,
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
      expect(hostEvents.some((event) => event.direction === "received")).toBe(false);
      expect(hostEvents.some((event) => event.direction === "sent" && event.message.type === "hello")).toBe(false);

      const serializedEvents = JSON.stringify(hostEvents);
      const logOutput = hostLogs.join("\n");
      expect(logOutput).toContain("received non-protocol message bytes=");
      expect(logOutput).not.toContain(privateMarker);
      expect(serializedEvents).not.toContain(privateMarker);
    } finally {
      await host?.stop();
      await server.stop();
    }
  });

  it("allows host signal sends after active visible authorization and redacts payload contents", async () => {
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);
    const authorizationId = await waitForSentActiveAuthorizationId(hostEvents);

    const signalPayload = {
      authorizationId,
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

  it("blocks public signal sends with non-JSON payloads before sent events", async () => {
    const hostLogs: string[] = [];
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      hostLogger: captureLogger(hostLogs),
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);
    const authorizationId = await waitForSentActiveAuthorizationId(hostEvents);
    const beforeSentSignals = hostEvents.filter(
      (event) => event.direction === "sent" && event.message.type === "signal"
    ).length;
    const privateMarker = "non-json-agent-signal-private-marker";

    expect(() =>
      host.send({
        ...createMessageBase("session-demo"),
        type: "signal",
        fromPeerId: "host-1",
        toPeerId: "viewer-1",
        payload: {
          authorizationId,
          safeMarker: privateMarker,
          handler: () => "handled"
        } as never
      })
    ).toThrow("JSON-compatible");

    expect(
      hostEvents.filter((event) => event.direction === "sent" && event.message.type === "signal")
    ).toHaveLength(beforeSentSignals);
    expect(viewerEvents.some((event) => event.direction === "received" && event.message.type === "signal")).toBe(false);
    expect(JSON.stringify(hostEvents)).not.toContain(privateMarker);
    expect(JSON.stringify(viewerEvents)).not.toContain(privateMarker);
    expect(hostLogs.join("\n")).not.toContain(privateMarker);
  });

  it("blocks public signal sends with access-key and SSH-key payloads before sent events", async () => {
    const hostLogs: string[] = [];
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      hostLogger: captureLogger(hostLogs),
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);
    const authorizationId = await waitForSentActiveAuthorizationId(hostEvents);

    for (const testCase of KEY_MATERIAL_SIGNAL_PAYLOAD_CASES) {
      const beforeSentSignals = hostEvents.filter(
        (event) => event.direction === "sent" && event.message.type === "signal"
      ).length;
      const beforeReceivedSignals = viewerEvents.filter(
        (event) => event.direction === "received" && event.message.type === "signal"
      ).length;

      let thrown: unknown;
      try {
        host.send({
          ...createMessageBase("session-demo"),
          type: "signal",
          fromPeerId: "host-1",
          toPeerId: "viewer-1",
          payload: {
            authorizationId,
            kind: "offer",
            ...testCase.payload
          }
        });
      } catch (error) {
        thrown = error;
      }
      await delay(50);

      expect(thrown, testCase.name).toBeInstanceOf(Error);
      expect(thrown instanceof Error ? thrown.message : "", testCase.name).toContain(
        "sensitive remote-assistance data"
      );
      expect(
        hostEvents.filter((event) => event.direction === "sent" && event.message.type === "signal"),
        testCase.name
      ).toHaveLength(beforeSentSignals);
      expect(
        viewerEvents.filter((event) => event.direction === "received" && event.message.type === "signal"),
        testCase.name
      ).toHaveLength(beforeReceivedSignals);

      const serializedThrown = thrown instanceof Error ? thrown.message : String(thrown);
      const serializedHostEvents = JSON.stringify(hostEvents);
      const serializedViewerEvents = JSON.stringify(viewerEvents);
      const serializedHostLogs = hostLogs.join("\n");
      for (const rawValue of testCase.rawValues) {
        expect(serializedThrown, testCase.name).not.toContain(rawValue);
        expect(serializedHostEvents, testCase.name).not.toContain(rawValue);
        expect(serializedViewerEvents, testCase.name).not.toContain(rawValue);
        expect(serializedHostLogs, testCase.name).not.toContain(rawValue);
      }
    }
  });

  it("blocks public signal sends with unsafe payload keys before sent events", async () => {
    const hostLogs: string[] = [];
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      hostLogger: captureLogger(hostLogs),
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);
    const authorizationId = await waitForSentActiveAuthorizationId(hostEvents);

    for (const testCase of UNSAFE_SIGNAL_PAYLOAD_KEY_CASES) {
      const beforeSentSignals = hostEvents.filter(
        (event) => event.direction === "sent" && event.message.type === "signal"
      ).length;
      const beforeReceivedSignals = viewerEvents.filter(
        (event) => event.direction === "received" && event.message.type === "signal"
      ).length;

      let thrown: unknown;
      try {
        host.send({
          ...createMessageBase("session-demo"),
          type: "signal",
          fromPeerId: "host-1",
          toPeerId: "viewer-1",
          payload: {
            authorizationId,
            kind: "offer",
            ...testCase.payload
          }
        });
      } catch (error) {
        thrown = error;
      }
      await delay(50);

      expect(thrown, testCase.name).toBeInstanceOf(Error);
      expect(thrown instanceof Error ? thrown.message : "", testCase.name).toContain(
        testCase.expectedMessage
      );
      expect(
        hostEvents.filter((event) => event.direction === "sent" && event.message.type === "signal"),
        testCase.name
      ).toHaveLength(beforeSentSignals);
      expect(
        viewerEvents.filter((event) => event.direction === "received" && event.message.type === "signal"),
        testCase.name
      ).toHaveLength(beforeReceivedSignals);

      const serializedThrown = thrown instanceof Error ? thrown.message : String(thrown);
      const serializedHostEvents = JSON.stringify(hostEvents);
      const serializedViewerEvents = JSON.stringify(viewerEvents);
      const serializedHostLogs = hostLogs.join("\n");
      for (const rawValue of testCase.rawValues) {
        expect(serializedThrown, testCase.name).not.toContain(rawValue);
        expect(serializedHostEvents, testCase.name).not.toContain(rawValue);
        expect(serializedViewerEvents, testCase.name).not.toContain(rawValue);
        expect(serializedHostLogs, testCase.name).not.toContain(rawValue);
      }
    }
  });

  it("treats inbound access-key and SSH-key signal payloads as raw unsafe input", async () => {
    const hostLogs: string[] = [];
    const hostEvents: AgentShellEvent[] = [];
    const safePayloadMarker = "agent-authorized-safe-signal-payload";
    const server = await startHostAuthorizedSignalPayloadServer((authorizationId) => [
      ...KEY_MATERIAL_SIGNAL_PAYLOAD_CASES.map((testCase) => ({
        authorizationId,
        kind: "viewer-offer",
        ...testCase.payload
      })),
      {
        authorizationId,
        kind: "viewer-offer",
        safeMarker: safePayloadMarker
      }
    ]);
    let host: AgentShellRuntime | undefined;

    try {
      host = createAgentShellRuntime(createRuntimeOptions({
        hostDecision: "approve",
        relayUrl: server.url,
        logger: captureLogger(hostLogs),
        onEvent: (event) => hostEvents.push(event),
        visibleToHost: true
      }));
      await host.start();

      const authorizationId = await waitForSentActiveAuthorizationId(hostEvents);
      const rawEvents = await waitForRawEventCount(hostEvents, KEY_MATERIAL_SIGNAL_PAYLOAD_CASES.length);
      const receivedSignal = await waitForMessage(
        hostEvents,
        (message) => message.type === "signal" && message.fromPeerId === "viewer-1"
      );
      await delay(100);

      for (const rawEvent of rawEvents) {
        expect(rawEvent).toMatchObject({
          direction: "raw",
          text: "[REDACTED]",
          byteLength: expect.any(Number)
        });
        expect(rawEvent.byteLength).toBeGreaterThan(0);
      }
      expect(hostEvents.filter((event) => event.direction === "received" && event.message.type === "signal")).toHaveLength(1);
      expect(receivedSignal).toMatchObject({
        type: "signal",
        fromPeerId: "viewer-1",
        toPeerId: "host-1",
        payload: {
          redacted: "[REDACTED]",
          byteLength: Buffer.byteLength(
            JSON.stringify({
              authorizationId,
              kind: "viewer-offer",
              safeMarker: safePayloadMarker
            })
          )
        }
      });

      const serializedEvents = JSON.stringify(hostEvents);
      const serializedLogs = hostLogs.join("\n");
      for (const testCase of KEY_MATERIAL_SIGNAL_PAYLOAD_CASES) {
        for (const rawValue of testCase.rawValues) {
          expect(serializedEvents, testCase.name).not.toContain(rawValue);
          expect(serializedLogs, testCase.name).not.toContain(rawValue);
        }
      }
      expect(serializedEvents).not.toContain(safePayloadMarker);
    } finally {
      await host?.stop();
      await server.stop();
    }
  });

  it("treats inbound signal payloads with unsafe keys as raw unsafe input", async () => {
    const hostLogs: string[] = [];
    const hostEvents: AgentShellEvent[] = [];
    const safePayloadMarker = "agent-authorized-safe-signal-after-unsafe-keys";
    const server = await startHostAuthorizedSignalPayloadServer((authorizationId) => [
      ...UNSAFE_SIGNAL_PAYLOAD_KEY_CASES.map((testCase) => ({
        authorizationId,
        kind: "viewer-offer",
        ...testCase.payload
      })),
      {
        authorizationId,
        kind: "viewer-offer",
        safeMarker: safePayloadMarker
      }
    ]);
    let host: AgentShellRuntime | undefined;

    try {
      host = createAgentShellRuntime(createRuntimeOptions({
        hostDecision: "approve",
        relayUrl: server.url,
        logger: captureLogger(hostLogs),
        onEvent: (event) => hostEvents.push(event),
        visibleToHost: true
      }));
      await host.start();

      const authorizationId = await waitForSentActiveAuthorizationId(hostEvents);
      const rawEvents = await waitForRawEventCount(hostEvents, UNSAFE_SIGNAL_PAYLOAD_KEY_CASES.length);
      const receivedSignal = await waitForMessage(
        hostEvents,
        (message) => message.type === "signal" && message.fromPeerId === "viewer-1"
      );
      await delay(100);

      for (const rawEvent of rawEvents) {
        expect(rawEvent).toMatchObject({
          direction: "raw",
          text: "[REDACTED]",
          byteLength: expect.any(Number)
        });
        expect(rawEvent.byteLength).toBeGreaterThan(0);
      }
      expect(hostEvents.filter((event) => event.direction === "received" && event.message.type === "signal")).toHaveLength(1);
      expect(receivedSignal).toMatchObject({
        type: "signal",
        fromPeerId: "viewer-1",
        toPeerId: "host-1",
        payload: {
          redacted: "[REDACTED]",
          byteLength: Buffer.byteLength(
            JSON.stringify({
              authorizationId,
              kind: "viewer-offer",
              safeMarker: safePayloadMarker
            })
          )
        }
      });

      const serializedEvents = JSON.stringify(hostEvents);
      const serializedLogs = hostLogs.join("\n");
      for (const testCase of UNSAFE_SIGNAL_PAYLOAD_KEY_CASES) {
        for (const rawValue of testCase.rawValues) {
          expect(serializedEvents, testCase.name).not.toContain(rawValue);
          expect(serializedLogs, testCase.name).not.toContain(rawValue);
        }
      }
      expect(serializedEvents).not.toContain(safePayloadMarker);
    } finally {
      await host?.stop();
      await server.stop();
    }
  });

  it("sends public signal payloads from a canonical JSON snapshot", async () => {
    const hostLogs: string[] = [];
    const viewerLogs: string[] = [];
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      hostLogger: captureLogger(hostLogs),
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents, captureLogger(viewerLogs));
    const authorizationId = await waitForSentActiveAuthorizationId(hostEvents);
    const safePayloadSnapshot = {
      authorizationId,
      kind: "offer"
    };
    const payload = createLateSensitiveAgentSignalPayloadProxy(authorizationId);

    host.send({
      ...createMessageBase("session-demo"),
      type: "signal",
      fromPeerId: "host-1",
      toPeerId: "viewer-1",
      payload: payload as never
    });

    const sentSignal = await waitForSentMessage(
      hostEvents,
      (message) => message.type === "signal" && message.fromPeerId === "host-1"
    );
    const receivedSignal = await waitForMessage(
      viewerEvents,
      (message) => message.type === "signal" && message.fromPeerId === "host-1"
    );
    const safePayloadByteLength = Buffer.byteLength(JSON.stringify(safePayloadSnapshot));

    expect(sentSignal).toMatchObject({
      type: "signal",
      payload: {
        redacted: "[REDACTED]",
        byteLength: safePayloadByteLength
      }
    });
    expect(receivedSignal).toMatchObject({
      type: "signal",
      payload: {
        redacted: "[REDACTED]",
        byteLength: safePayloadByteLength
      }
    });
    expect(JSON.stringify(hostEvents)).not.toContain("raw-screen-content");
    expect(JSON.stringify(viewerEvents)).not.toContain("raw-screen-content");
    expect(hostLogs.join("\n")).not.toContain("raw-screen-content");
    expect(viewerLogs.join("\n")).not.toContain("raw-screen-content");
  });

  it("measures signal event byte lengths without inherited toJSON hooks", async () => {
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);
    const authorizationId = await waitForSentActiveAuthorizationId(hostEvents);
    const payload = {
      authorizationId,
      kind: "offer",
      nested: { safe: "kept" }
    };
    const expectedByteLength = Buffer.byteLength(stringifyJson(payload), "utf8");

    const result = await withInheritedSignalPayloadToJsonHook(authorizationId, async () => {
      host.send({
        ...createMessageBase("session-demo"),
        type: "signal",
        fromPeerId: "host-1",
        toPeerId: "viewer-1",
        payload
      });

      const sentSignal = await waitForSentMessage(
        hostEvents,
        (message) => message.type === "signal" && message.fromPeerId === "host-1"
      );
      const receivedSignal = await waitForMessage(
        viewerEvents,
        (message) => message.type === "signal" && message.fromPeerId === "host-1"
      );

      return { sentSignal, receivedSignal };
    });

    expect(result.sentSignal).toMatchObject({
      type: "signal",
      payload: {
        redacted: "[REDACTED]",
        byteLength: expectedByteLength
      }
    });
    expect(result.receivedSignal).toMatchObject({
      type: "signal",
      payload: {
        redacted: "[REDACTED]",
        byteLength: expectedByteLength
      }
    });
    expect(JSON.stringify(result)).not.toContain("raw-screen-content");
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

  it("ignores host authorization requests before viewer peer binding", async () => {
    const unboundRequestServer = await startUnboundHostAuthorizationRequestServer();
    const hostEvents: AgentShellEvent[] = [];
    const hostLogs: string[] = [];
    let host: AgentShellRuntime | undefined;

    try {
      host = createAgentShellRuntime(createRuntimeOptions({
        relayUrl: unboundRequestServer.url,
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
      expect(logOutput).not.toContain("viewer-1");
      expect(logOutput).not.toContain("unbound request private reason");
      expect(logOutput).not.toContain("raw-token");
      expect(serializedEvents).not.toContain("session-authorization-request");
      expect(serializedEvents).not.toContain("viewer-1");
      expect(serializedEvents).not.toContain("unbound request private reason");
      expect(serializedEvents).not.toContain("raw-token");
    } finally {
      await host?.stop();
      await unboundRequestServer.stop();
    }
  });

  it("ignores host authorization requests for a viewer that was not observed", async () => {
    const mismatchedRequestServer = await startMismatchedHostAuthorizationRequestServer();
    const hostEvents: AgentShellEvent[] = [];
    const hostLogs: string[] = [];
    let host: AgentShellRuntime | undefined;

    try {
      host = createAgentShellRuntime(createRuntimeOptions({
        relayUrl: mismatchedRequestServer.url,
        hostDecision: "approve",
        visibleToHost: true,
        logger: captureLogger(hostLogs),
        onEvent: (event) => hostEvents.push(event)
      }));
      await host.start();

      const observedHello = await waitForMessage(
        hostEvents,
        (message) => message.type === "hello" && message.peerId === "viewer-1"
      );
      const rawEvent = await waitForRawEvent(hostEvents);
      await delay(100);

      expect(observedHello).toMatchObject({
        type: "hello",
        peerId: "viewer-1",
        role: "viewer"
      });
      expect(rawEvent).toMatchObject({
        direction: "raw",
        text: "[REDACTED]",
        byteLength: expect.any(Number)
      });
      expect(
        hostEvents.some(
          (event) => event.direction === "received" && event.message.type === "session-authorization-request"
        )
      ).toBe(false);
      expect(
        hostEvents.some(
          (event) =>
            event.direction === "sent" &&
            (event.message.type === "session-authorization-decision" ||
              event.message.type === "session-authorization-state" ||
              event.message.type === "audit-event")
        )
      ).toBe(false);

      const serializedRawEvents = JSON.stringify(hostEvents.filter((event) => event.direction === "raw"));
      const logOutput = hostLogs.join("\n");
      expect(logOutput).toContain("ignored unsafe inbound protocol message bytes=");
      expect(logOutput).not.toContain("viewer-2");
      expect(logOutput).not.toContain("mismatched request private reason");
      expect(logOutput).not.toContain("raw-token");
      expect(serializedRawEvents).not.toContain("session-authorization-request");
      expect(serializedRawEvents).not.toContain("viewer-2");
      expect(serializedRawEvents).not.toContain("mismatched request private reason");
      expect(serializedRawEvents).not.toContain("raw-token");
    } finally {
      await host?.stop();
      await mismatchedRequestServer.stop();
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

  it("rejects invalid host decision provider configuration before relay startup", () => {
    const provider: HostDecisionProvider = () => "approve";

    expect(() =>
      createAgentShellRuntime(createRuntimeOptions({
        role: "viewer",
        hostDecisionProvider: provider
      }))
    ).toThrow("Host decision provider is only valid");

    expect(() =>
      createAgentShellRuntime(createRuntimeOptions({
        hostDecision: "approve",
        hostDecisionProvider: provider
      }))
    ).toThrow("Host decision provider is only valid");

    expect(() =>
      createAgentShellRuntime(createRuntimeOptions({
        hostDecisionProvider: "approve" as unknown as HostDecisionProvider
      }))
    ).toThrow("Host decision provider is only valid");
  });

  it("sends approved decision and active visible state when interactive host consent approves", async () => {
    const { relay, viewerEvents } = await startRelayAndHost({
      hostDecisionProvider: (request) => {
        expect(request).toEqual({
          requestedPermissions: ["screen:view"],
          requestedPermissionCount: 1
        });
        return "approve";
      },
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

  it("sends denied decision when interactive host consent denies", async () => {
    const { relay, viewerEvents } = await startRelayAndHost({
      hostDecisionProvider: () => Promise.resolve("deny"),
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    const decision = await waitForMessage(
      viewerEvents,
      (message) => message.type === "session-authorization-decision"
    );
    await delay(100);

    expect(decision).toMatchObject({
      type: "session-authorization-decision",
      decision: "denied",
      grantedPermissions: []
    });
    expect(
      viewerEvents.some(
        (event) => event.direction === "received" && event.message.type === "session-authorization-state"
      )
    ).toBe(false);
  });

  it("withholds active state when interactive host consent approves without visible session", async () => {
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost({
      hostDecisionProvider: () => "approve",
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
    expect(hostEvents.some((event) => event.direction === "indicator")).toBe(false);
  });

  it("fails closed when interactive host consent returns an invalid decision", async () => {
    const hostLogs: string[] = [];
    const invalidProvider = (() => "allow") as unknown as HostDecisionProvider;
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost({
      hostDecisionProvider: invalidProvider,
      hostLogger: captureLogger(hostLogs),
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(hostEvents, (message) => message.type === "session-authorization-request");
    await delay(100);

    expect(hostLogs.join("\n")).toContain("interactive host consent returned no accepted decision");
    expect(
      [...hostEvents, ...viewerEvents].some(
        (event) =>
          event.direction !== "indicator" &&
          "message" in event &&
          (event.message.type === "session-authorization-decision" ||
            event.message.type === "session-authorization-state" ||
            event.message.type === "audit-event")
      )
    ).toBe(false);
  });

  it("fails closed when interactive host consent times out", async () => {
    const hostLogs: string[] = [];
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost({
      hostDecisionProvider: () => new Promise<HostDecision>(() => undefined),
      hostConsentTimeoutMs: 5,
      hostLogger: captureLogger(hostLogs),
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(hostEvents, (message) => message.type === "session-authorization-request");
    await delay(100);

    expect(hostLogs.join("\n")).toContain("interactive host consent timed out timeoutMs=5");
    expect(
      [...hostEvents, ...viewerEvents].some(
        (event) =>
          event.direction !== "indicator" &&
          "message" in event &&
          (event.message.type === "session-authorization-decision" ||
            event.message.type === "session-authorization-state" ||
            event.message.type === "session-control" ||
            event.message.type === "permission-revoked" ||
            event.message.type === "signal" ||
            event.message.type === "audit-event")
      )
    ).toBe(false);
    expect(hostEvents.some((event) => event.direction === "indicator")).toBe(false);
  });

  it("fails closed with secret-safe diagnostics when interactive host consent throws", async () => {
    const hostLogs: string[] = [];
    const privateErrorText = "private prompt token raw-token";
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost({
      hostDecisionProvider: () => {
        throw new Error(privateErrorText);
      },
      hostLogger: captureLogger(hostLogs),
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    const errorEvent = await waitForRuntimeError(hostEvents);
    await delay(100);

    expect(errorEvent.error.message).toBe("Agent shell runtime error");
    expect(JSON.stringify(errorEvent)).not.toContain(privateErrorText);
    expect(hostLogs.join("\n")).toContain("interactive host consent failed closed");
    expect(hostLogs.join("\n")).not.toContain(privateErrorText);
    expect(
      viewerEvents.some(
        (event) =>
          event.direction === "received" &&
          (event.message.type === "session-authorization-decision" ||
            event.message.type === "session-authorization-state" ||
            event.message.type === "audit-event")
      )
    ).toBe(false);
  });

  it("fails closed when interactive host consent resolves after the viewer disconnects", async () => {
    const hostLogs: string[] = [];
    let resolveDecision: (decision: HostDecision) => void = () => undefined;
    let resolveProviderStarted: () => void = () => undefined;
    const providerStarted = new Promise<void>((resolve) => {
      resolveProviderStarted = resolve;
    });
    const pendingDecision = new Promise<HostDecision>((resolve) => {
      resolveDecision = resolve;
    });
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost({
      hostDecisionProvider: () => {
        resolveProviderStarted();
        return pendingDecision;
      },
      hostLogger: captureLogger(hostLogs),
      visibleToHost: true
    });
    const viewer = await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(hostEvents, (message) => message.type === "session-authorization-request");
    await providerStarted;
    await viewer.stop();
    await waitForMessage(hostEvents, (message) => message.type === "peer-disconnected");

    resolveDecision("approve");
    await delay(100);

    expect(hostLogs.join("\n")).toContain("authorization decision skipped because peer disconnected");
    expect(
      hostEvents.some(
        (event) =>
          event.direction === "sent" &&
          (event.message.type === "session-authorization-decision" ||
            event.message.type === "session-authorization-state" ||
            event.message.type === "audit-event")
      )
    ).toBe(false);
    expect(
      viewerEvents.some(
        (event) =>
          event.direction === "received" &&
          (event.message.type === "session-authorization-decision" ||
            event.message.type === "session-authorization-state" ||
            event.message.type === "audit-event")
      )
    ).toBe(false);
    expect(hostEvents.some((event) => event.direction === "indicator")).toBe(false);
  });

  it("emits a secret-safe host indicator after visible activation", async () => {
    const hostLogs: string[] = [];
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      hostDisplayName: "Private Host raw-token",
      hostLogger: captureLogger(hostLogs),
      visibleToHost: true
    });
    await startViewer(
      relay.url(),
      ["screen:view"],
      viewerEvents,
      silentLogger,
      undefined,
      "Private Viewer raw-token"
    );

    const activeState = await waitForMessage(
      viewerEvents,
      (message) => message.type === "session-authorization-state" && message.status === "active"
    );
    const indicator = await waitForIndicatorEvent(
      hostEvents,
      (event) => event.state === "active" && event.cause === "activated"
    );

    expect(indicator).toMatchObject({
      direction: "indicator",
      role: "host",
      state: "active",
      authorizationId: activeState.type === "session-authorization-state" ? activeState.authorizationId : "",
      authorizationStatus: "active",
      visibleToHost: true,
      permissionCount: 1,
      cause: "activated"
    });
    expect(viewerEvents.some((event) => event.direction === "indicator")).toBe(false);

    const serializedIndicator = JSON.stringify(indicator);
    const logOutput = hostLogs.join("\n");
    expect(logOutput).toContain("host indicator state=active");
    expect(logOutput).toContain("permissionCount=1");
    expect(serializedIndicator).not.toContain("raw-token");
    expect(serializedIndicator).not.toContain("123-456");
    expect(logOutput).not.toContain("raw-token");
    expect(logOutput).not.toContain("123-456");
    expect(logOutput).not.toContain("Private Host");
    expect(logOutput).not.toContain("Private Viewer");
  });

  it("withholds active state when host approves without visible session state", async () => {
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost({
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
    expect(hostEvents.some((event) => event.direction === "indicator")).toBe(false);
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

  it("fails closed for viewer signal sends after host denial", async () => {
    const privateDenialReason = "private denial reason raw-token";
    const blockedPayloadMarker = "blocked-after-denial-payload";
    const viewerLogs: string[] = [];
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost({
      decisionReason: privateDenialReason,
      hostDecision: "deny"
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
        message.type === "session-authorization-decision" &&
        message.decision === "denied"
    );

    const sentCountBefore = viewerEvents.filter((event) => event.direction === "sent").length;
    const hostSignalCountBefore = hostEvents.filter(
      (event) => event.direction === "received" && event.message.type === "signal"
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

    expect(viewerEvents.filter((event) => event.direction === "sent")).toHaveLength(sentCountBefore);
    expect(
      hostEvents.filter((event) => event.direction === "received" && event.message.type === "signal")
    ).toHaveLength(hostSignalCountBefore);
    expect(JSON.stringify(viewerEvents)).not.toContain(blockedPayloadMarker);
    expect(JSON.stringify(viewerEvents)).not.toContain(privateDenialReason);
    expect(viewerLogs.join("\n")).not.toContain(blockedPayloadMarker);
    expect(viewerLogs.join("\n")).not.toContain(privateDenialReason);
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
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost({
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
    const revokeControl = await waitForMessage(
      viewerEvents,
      (message) => message.type === "session-control" && message.action === "revoke-permission"
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
    expect(revokeControl).toMatchObject({
      type: "session-control",
      authorizationId: revoked.type === "permission-revoked" ? revoked.authorizationId : "",
      actorPeerId: "host-1",
      action: "revoke-permission",
      permission: "screen:view",
      reason: "[REDACTED]"
    });
    expect(revokedState).toMatchObject({
      type: "session-authorization-state",
      authorizationId: revoked.type === "permission-revoked" ? revoked.authorizationId : "",
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
    expect(JSON.stringify(revokeControl)).not.toContain("private revoke reason");
    expect(JSON.stringify(revokeAudit)).not.toContain("private revoke reason");
    expect(messageIndex(viewerEvents, revokeControl)).toBeLessThan(messageIndex(viewerEvents, revoked));
    expect(messageIndex(viewerEvents, revoked)).toBeLessThan(messageIndex(viewerEvents, revokedState));

    const inactiveIndicator = await waitForIndicatorEvent(
      hostEvents,
      (event) => event.state === "inactive" && event.cause === "revoked"
    );
    expect(inactiveIndicator).toMatchObject({
      direction: "indicator",
      state: "inactive",
      authorizationId: revoked.type === "permission-revoked" ? revoked.authorizationId : "",
      authorizationStatus: "revoked",
      visibleToHost: false,
      permissionCount: 0,
      cause: "revoked"
    });
    expect(JSON.stringify(inactiveIndicator)).not.toContain("private revoke reason");
  });

  it("keeps remaining permissions active after host revokes one granted permission", async () => {
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      hostRevokeAfterMs: 10,
      hostRevokePermission: "screen:view",
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view", "input:pointer"], viewerEvents);

    const revokeControl = await waitForMessage(
      viewerEvents,
      (message) => message.type === "session-control" && message.action === "revoke-permission"
    );
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
      authorizationId:
        revokeControl.type === "session-control" ? revokeControl.authorizationId : "",
      status: "active",
      visibleToHost: true,
      permissions: ["input:pointer"]
    });
    expect(revokeControl).toMatchObject({
      type: "session-control",
      authorizationId: partialState.type === "session-authorization-state" ? partialState.authorizationId : "",
      actorPeerId: "host-1",
      action: "revoke-permission",
      permission: "screen:view"
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

    const indicator = await waitForIndicatorEvent(
      hostEvents,
      (event) => event.cause === "permission-revoked"
    );
    expect(indicator).toMatchObject({
      direction: "indicator",
      state: "active",
      authorizationId: partialState.type === "session-authorization-state" ? partialState.authorizationId : "",
      authorizationStatus: "active",
      visibleToHost: true,
      permissionCount: 1,
      cause: "permission-revoked"
    });
  });

  it("revokes the only granted permission through direct host control", async () => {
    const hostAuditSink = new MemoryAuditSink();
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
      hostAuditSink,
      hostDecision: "approve",
      hostRevokeReason: "private direct revoke reason",
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    const activeState = await waitForMessage(
      viewerEvents,
      (message) => message.type === "session-authorization-state" && message.status === "active"
    );
    host.revokePermission("screen:view");

    const revokeControl = await waitForMessage(
      viewerEvents,
      (message) => message.type === "session-control" && message.action === "revoke-permission"
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
    const inactiveIndicator = await waitForIndicatorEvent(
      hostEvents,
      (event) => event.state === "inactive" && event.cause === "revoked"
    );

    expect(revokeControl).toMatchObject({
      type: "session-control",
      authorizationId: activeState.type === "session-authorization-state" ? activeState.authorizationId : "",
      actorPeerId: "host-1",
      action: "revoke-permission",
      permission: "screen:view",
      reason: "[REDACTED]"
    });
    expect(revoked).toMatchObject({
      type: "permission-revoked",
      authorizationId: activeState.type === "session-authorization-state" ? activeState.authorizationId : "",
      revokedPermission: "screen:view",
      reason: "[REDACTED]"
    });
    expect(revokedState).toMatchObject({
      type: "session-authorization-state",
      authorizationId: activeState.type === "session-authorization-state" ? activeState.authorizationId : "",
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
    expect(inactiveIndicator).toMatchObject({
      direction: "indicator",
      state: "inactive",
      authorizationStatus: "revoked",
      visibleToHost: false,
      permissionCount: 0,
      cause: "revoked"
    });
    expect(messageIndex(viewerEvents, revokeControl)).toBeLessThan(messageIndex(viewerEvents, revoked));
    expect(messageIndex(viewerEvents, revoked)).toBeLessThan(messageIndex(viewerEvents, revokedState));
    expect(hostAuditSink.records().map((record) => record.action)).toEqual([
      "agent-shell.authorization.approved",
      "agent-shell.authorization.active",
      "agent-shell.permission.revoked"
    ]);
    expect(JSON.stringify(hostAuditSink.records())).not.toContain("private direct revoke reason");
    expect(JSON.stringify(viewerEvents)).not.toContain("private direct revoke reason");
    expect(JSON.stringify(hostAuditSink.records())).not.toContain("123-456");
  });

  it("keeps remaining permissions paused after direct host revocation while paused", async () => {
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view", "input:pointer"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) => message.type === "session-authorization-state" && message.status === "active"
    );
    host.pause();
    await waitForMessage(
      viewerEvents,
      (message) => message.type === "session-authorization-state" && message.status === "paused"
    );
    host.revokePermission("screen:view");

    await waitForMessage(
      viewerEvents,
      (message) => message.type === "permission-revoked" && message.revokedPermission === "screen:view"
    );
    const partialState = await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "paused" &&
        !message.permissions.includes("screen:view")
    );
    const indicator = await waitForIndicatorEvent(
      hostEvents,
      (event) => event.cause === "permission-revoked"
    );

    expect(partialState).toMatchObject({
      type: "session-authorization-state",
      status: "paused",
      visibleToHost: true,
      permissions: ["input:pointer"]
    });
    expect(indicator).toMatchObject({
      direction: "indicator",
      state: "paused",
      authorizationStatus: "paused",
      visibleToHost: true,
      permissionCount: 1,
      cause: "permission-revoked"
    });
  });

  it("rejects direct host revocation before visible authorization", async () => {
    const hostAuditSink = new MemoryAuditSink();
    const { host, hostEvents } = await startRelayAndHost({
      hostAuditSink
    });

    await waitForMessage(
      hostEvents,
      (message) => message.type === "relay-ready" && message.peerId === "host-1"
    );

    expect(() => host.revokePermission("screen:view")).toThrow(
      "Agent shell revoke control requires active or paused visible host authorization"
    );
    await delay(50);

    expect(
      hostEvents.some(
        (event) =>
          event.direction === "sent" &&
          (event.message.type === "session-control" ||
            event.message.type === "permission-revoked" ||
            event.message.type === "audit-event")
      )
    ).toBe(false);
    expect(hostAuditSink.records()).toHaveLength(0);
  });

  it("rejects direct host revocation for permissions that are not granted", async () => {
    const hostAuditSink = new MemoryAuditSink();
    const { relay, host, viewerEvents } = await startRelayAndHost({
      hostAuditSink,
      hostDecision: "approve",
      visibleToHost: true
    });
    await startViewer(relay.url(), ["input:pointer"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) => message.type === "session-authorization-state" && message.status === "active"
    );
    expect(() => host.revokePermission("screen:view")).toThrow(
      "Agent shell revoke control requires a currently granted host permission"
    );
    await delay(50);

    expect(
      viewerEvents.some(
        (event) =>
          event.direction === "received" &&
          (event.message.type === "permission-revoked" ||
            (event.message.type === "session-control" &&
              event.message.action === "revoke-permission") ||
            (event.message.type === "audit-event" &&
              event.message.action === "agent-shell.permission.revoked"))
      )
    ).toBe(false);
    expect(hostAuditSink.records().map((record) => record.action)).toEqual([
      "agent-shell.authorization.approved",
      "agent-shell.authorization.active"
    ]);
  });

  it("rejects direct revocation controls for viewer runtimes", async () => {
    const { relay, viewerEvents } = await startRelayAndHost();
    const viewer = await startViewer(relay.url(), [], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) => message.type === "relay-ready" && message.peerId === "viewer-1"
    );

    expect(() => viewer.revokePermission("screen:view")).toThrow(
      "Agent shell revoke control is only valid for host runtimes"
    );
    await delay(50);

    expect(
      viewerEvents.some(
        (event) =>
          event.direction === "sent" &&
          (event.message.type === "permission-revoked" ||
            (event.message.type === "session-control" &&
              event.message.action === "revoke-permission"))
      )
    ).toBe(false);
  });

  it("shares direct revocation state with delayed revoke timers", async () => {
    const { relay, host, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      hostRevokeAfterMs: 40,
      hostRevokePermission: "screen:view",
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view", "input:pointer"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) => message.type === "session-authorization-state" && message.status === "active"
    );
    host.revokePermission("screen:view");
    await waitForMessage(
      viewerEvents,
      (message) => message.type === "permission-revoked" && message.revokedPermission === "screen:view"
    );
    await delay(90);

    const revokeControls = viewerEvents.filter(
      (event) =>
        event.direction === "received" &&
        event.message.type === "session-control" &&
        event.message.action === "revoke-permission"
    );
    const revokedMessages = viewerEvents.filter(
      (event) => event.direction === "received" && event.message.type === "permission-revoked"
    );
    const revokeAudits = viewerEvents.filter(
      (event) =>
        event.direction === "received" &&
        event.message.type === "audit-event" &&
        event.message.action === "agent-shell.permission.revoked"
    );
    expect(revokeControls).toHaveLength(1);
    expect(revokedMessages).toHaveLength(1);
    expect(revokeAudits).toHaveLength(1);
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
      authorizationTtlMs: 1,
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
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost({
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
      authorizationId: terminatedState.type === "session-authorization-state" ? terminatedState.authorizationId : "",
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

    const inactiveIndicator = await waitForIndicatorEvent(
      hostEvents,
      (event) => event.state === "inactive" && event.cause === "terminated"
    );
    expect(inactiveIndicator).toMatchObject({
      direction: "indicator",
      state: "inactive",
      authorizationId: terminatedState.type === "session-authorization-state" ? terminatedState.authorizationId : "",
      authorizationStatus: "terminated",
      visibleToHost: false,
      permissionCount: 0,
      cause: "terminated"
    });
    expect(JSON.stringify(inactiveIndicator)).not.toContain("private terminate reason");
  });

  it("terminates a visible active session through direct host control", async () => {
    const hostAuditSink = new MemoryAuditSink();
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
      hostAuditSink,
      hostDecision: "approve",
      hostTerminateReason: "private direct terminate reason",
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view", "input:pointer"], viewerEvents);

    const activeState = await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "active"
    );

    host.terminate();

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
    const inactiveIndicator = await waitForIndicatorEvent(
      hostEvents,
      (event) => event.state === "inactive" && event.cause === "terminated"
    );

    expect(control).toMatchObject({
      type: "session-control",
      authorizationId: activeState.type === "session-authorization-state" ? activeState.authorizationId : "",
      action: "terminate",
      actorPeerId: "host-1"
    });
    expect(terminatedState).toMatchObject({
      type: "session-authorization-state",
      authorizationId: activeState.type === "session-authorization-state" ? activeState.authorizationId : "",
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
        terminated: true,
        reasonConfigured: true
      }
    });
    expect(inactiveIndicator).toMatchObject({
      direction: "indicator",
      state: "inactive",
      authorizationId: activeState.type === "session-authorization-state" ? activeState.authorizationId : "",
      authorizationStatus: "terminated",
      visibleToHost: false,
      permissionCount: 0,
      cause: "terminated"
    });
    expect(hostAuditSink.records().map((record) => record.action)).toEqual([
      "agent-shell.authorization.approved",
      "agent-shell.authorization.active",
      "agent-shell.authorization.terminated"
    ]);
    expect(messageIndex(viewerEvents, control)).toBeLessThan(messageIndex(viewerEvents, terminatedState));
    expect(messageIndex(viewerEvents, terminatedState)).toBeLessThan(messageIndex(viewerEvents, terminateAudit));
    expect(JSON.stringify(terminateAudit)).not.toContain("private direct terminate reason");
    expect(JSON.stringify(hostAuditSink.records())).not.toContain("private direct terminate reason");
    expect(JSON.stringify(inactiveIndicator)).not.toContain("private direct terminate reason");
    expect(JSON.stringify(hostAuditSink.records())).not.toContain("123-456");
  });

  it("terminates a visible paused session through direct host control", async () => {
    const hostAuditSink = new MemoryAuditSink();
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
      hostAuditSink,
      hostDecision: "approve",
      hostTerminateReason: "private paused terminate reason",
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view", "input:pointer"], viewerEvents);

    const activeState = await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "active"
    );
    host.pause();
    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "paused"
    );

    host.terminate();

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
    const inactiveIndicator = await waitForIndicatorEvent(
      hostEvents,
      (event) => event.state === "inactive" && event.cause === "terminated"
    );

    expect(control).toMatchObject({
      type: "session-control",
      authorizationId: activeState.type === "session-authorization-state" ? activeState.authorizationId : "",
      action: "terminate",
      actorPeerId: "host-1"
    });
    expect(terminatedState).toMatchObject({
      type: "session-authorization-state",
      authorizationId: activeState.type === "session-authorization-state" ? activeState.authorizationId : "",
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
        terminated: true,
        reasonConfigured: true
      }
    });
    expect(inactiveIndicator).toMatchObject({
      direction: "indicator",
      state: "inactive",
      authorizationId: activeState.type === "session-authorization-state" ? activeState.authorizationId : "",
      authorizationStatus: "terminated",
      visibleToHost: false,
      permissionCount: 0,
      cause: "terminated"
    });
    expect(hostAuditSink.records().map((record) => record.action)).toEqual([
      "agent-shell.authorization.approved",
      "agent-shell.authorization.active",
      "agent-shell.authorization.paused",
      "agent-shell.authorization.terminated"
    ]);
    expect(JSON.stringify(terminateAudit)).not.toContain("private paused terminate reason");
    expect(JSON.stringify(hostAuditSink.records())).not.toContain("private paused terminate reason");
  });

  it("rejects direct host termination before visible authorization", async () => {
    const hostAuditSink = new MemoryAuditSink();
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
      hostAuditSink,
      hostDecision: "approve",
      visibleToHost: true
    });

    await waitForMessage(
      hostEvents,
      (message) => message.type === "relay-ready" && message.peerId === "host-1"
    );
    expect(() => host.terminate()).toThrow(
      "Agent shell terminate control requires active or paused visible host authorization"
    );

    await startViewer(relay.url(), ["screen:view"], viewerEvents);
    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "active"
    );
    await delay(50);

    expect(
      viewerEvents.some(
        (event) =>
          event.direction === "received" &&
          event.message.type === "session-control" &&
          event.message.action === "terminate"
      )
    ).toBe(false);
    expect(hostAuditSink.records().map((record) => record.action)).toEqual([
      "agent-shell.authorization.approved",
      "agent-shell.authorization.active"
    ]);
  });

  it("rejects direct termination controls for viewer runtimes", async () => {
    const { relay, viewerEvents } = await startRelayAndHost();
    const viewer = await startViewer(relay.url(), [], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) => message.type === "relay-ready" && message.peerId === "viewer-1"
    );
    expect(() => viewer.terminate()).toThrow(
      "Agent shell terminate control is only valid for host runtimes"
    );
    await delay(50);

    expect(
      viewerEvents.some(
        (event) =>
          event.direction === "sent" &&
          event.message.type === "session-control" &&
          event.message.action === "terminate"
      )
    ).toBe(false);
  });

  it("shares direct termination state with delayed terminate timers", async () => {
    const { relay, host, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      hostTerminateAfterMs: 50,
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "active"
    );
    host.terminate();
    await waitForMessage(
      viewerEvents,
      (message) => message.type === "session-control" && message.action === "terminate"
    );
    await delay(90);

    const terminateControls = viewerEvents.filter(
      (event) =>
        event.direction === "received" &&
        event.message.type === "session-control" &&
        event.message.action === "terminate"
    );
    const terminatedStates = viewerEvents.filter(
      (event) =>
        event.direction === "received" &&
        event.message.type === "session-authorization-state" &&
        event.message.status === "terminated"
    );
    const terminateAudits = viewerEvents.filter(
      (event) =>
        event.direction === "received" &&
        event.message.type === "audit-event" &&
        event.message.action === "agent-shell.authorization.terminated"
    );
    expect(terminateControls).toHaveLength(1);
    expect(terminatedStates).toHaveLength(1);
    expect(terminateAudits).toHaveLength(1);
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
      authorizationTtlMs: 1,
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

  it("rejects direct host termination after authorization expires", async () => {
    const hostAuditSink = new MemoryAuditSink();
    const { relay, host, viewerEvents } = await startRelayAndHost({
      authorizationTtlMs: 1,
      hostAuditSink,
      hostDecision: "approve",
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

    expect(() => host.terminate()).toThrow(
      "Agent shell terminate control requires active or paused visible host authorization"
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
    expect(hostAuditSink.records().map((record) => record.action)).toEqual([
      "agent-shell.authorization.approved",
      "agent-shell.authorization.active",
      "agent-shell.authorization.expired"
    ]);
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
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost({
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
      authorizationId: pausedState.type === "session-authorization-state" ? pausedState.authorizationId : "",
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

    const indicator = await waitForIndicatorEvent(
      hostEvents,
      (event) => event.state === "paused" && event.cause === "paused"
    );
    expect(indicator).toMatchObject({
      direction: "indicator",
      state: "paused",
      authorizationId: pausedState.type === "session-authorization-state" ? pausedState.authorizationId : "",
      authorizationStatus: "paused",
      visibleToHost: true,
      permissionCount: 2,
      cause: "paused"
    });
    expect(JSON.stringify(indicator)).not.toContain("private pause reason");
  });

  it("sends active state and audit after host resumes paused session", async () => {
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost({
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
      authorizationId: activeStates.at(-1)?.authorizationId,
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

    const resumedIndicator = await waitForIndicatorEvent(
      hostEvents,
      (event) => event.state === "active" && event.cause === "resumed"
    );
    expect(resumedIndicator).toMatchObject({
      direction: "indicator",
      state: "active",
      authorizationId: activeStates.at(-1)?.authorizationId,
      authorizationStatus: "active",
      visibleToHost: true,
      permissionCount: 1,
      cause: "resumed"
    });
    expect(JSON.stringify(resumedIndicator)).not.toContain("private resume reason");
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

  it("pauses and resumes a visible session through direct host controls", async () => {
    const hostAuditSink = new MemoryAuditSink();
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
      hostAuditSink,
      hostDecision: "approve",
      hostPauseReason: "private direct pause reason",
      hostResumeReason: "private direct resume reason",
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view", "input:pointer"], viewerEvents);

    const activeState = await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "active"
    );

    host.pause();

    const pauseControl = await waitForMessage(
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
    const pausedIndicator = await waitForIndicatorEvent(
      hostEvents,
      (event) => event.state === "paused" && event.cause === "paused"
    );

    expect(pauseControl).toMatchObject({
      type: "session-control",
      authorizationId: activeState.type === "session-authorization-state" ? activeState.authorizationId : "",
      action: "pause",
      actorPeerId: "host-1"
    });
    expect(pausedState).toMatchObject({
      type: "session-authorization-state",
      authorizationId: activeState.type === "session-authorization-state" ? activeState.authorizationId : "",
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
    expect(pausedIndicator).toMatchObject({
      direction: "indicator",
      state: "paused",
      authorizationStatus: "paused",
      visibleToHost: true,
      permissionCount: 2,
      cause: "paused"
    });

    host.resume();

    const resumeControl = await waitForMessage(
      viewerEvents,
      (message) => message.type === "session-control" && message.action === "resume"
    );
    const activeStates = await waitForReceivedMessageCount(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "active",
      2
    );
    const resumedState = activeStates.at(-1);
    const resumeAudit = await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "audit-event" &&
        message.action === "agent-shell.authorization.resumed"
    );
    const resumedIndicator = await waitForIndicatorEvent(
      hostEvents,
      (event) => event.state === "active" && event.cause === "resumed"
    );

    expect(resumeControl).toMatchObject({
      type: "session-control",
      authorizationId: activeState.type === "session-authorization-state" ? activeState.authorizationId : "",
      action: "resume",
      actorPeerId: "host-1"
    });
    expect(resumedState).toMatchObject({
      type: "session-authorization-state",
      authorizationId: activeState.type === "session-authorization-state" ? activeState.authorizationId : "",
      status: "active",
      visibleToHost: true,
      permissions: ["screen:view", "input:pointer"]
    });
    expect(resumeAudit).toMatchObject({
      type: "audit-event",
      outcome: "accepted",
      detail: {
        grantedPermissionCount: 2,
        visibleToHost: true,
        resumed: true,
        reasonConfigured: true
      }
    });
    expect(resumedIndicator).toMatchObject({
      direction: "indicator",
      state: "active",
      authorizationStatus: "active",
      visibleToHost: true,
      permissionCount: 2,
      cause: "resumed"
    });
    expect(hostAuditSink.records().map((record) => record.action)).toEqual([
      "agent-shell.authorization.approved",
      "agent-shell.authorization.active",
      "agent-shell.authorization.paused",
      "agent-shell.authorization.resumed"
    ]);
    expect(JSON.stringify(hostAuditSink.records())).not.toContain("private direct pause reason");
    expect(JSON.stringify(hostAuditSink.records())).not.toContain("private direct resume reason");
    expect(JSON.stringify(hostAuditSink.records())).not.toContain("123-456");
  });

  it("rejects direct host pause and resume before required visible states", async () => {
    const hostAuditSink = new MemoryAuditSink();
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
      hostAuditSink,
      hostDecision: "approve",
      visibleToHost: true
    });

    await waitForMessage(
      hostEvents,
      (message) => message.type === "relay-ready" && message.peerId === "host-1"
    );
    expect(() => host.pause()).toThrow(
      "Agent shell pause control requires active visible host authorization"
    );
    expect(() => host.resume()).toThrow(
      "Agent shell resume control requires paused visible host authorization"
    );

    await startViewer(relay.url(), ["screen:view"], viewerEvents);
    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "active"
    );
    expect(() => host.resume()).toThrow(
      "Agent shell resume control requires paused visible host authorization"
    );
    await delay(50);

    expect(
      viewerEvents.some(
        (event) =>
          event.direction === "received" &&
          event.message.type === "session-control" &&
          (event.message.action === "pause" || event.message.action === "resume")
      )
    ).toBe(false);
    expect(hostAuditSink.records().map((record) => record.action)).toEqual([
      "agent-shell.authorization.approved",
      "agent-shell.authorization.active"
    ]);
  });

  it("rejects direct pause and resume controls for viewer runtimes", async () => {
    const { relay, viewerEvents } = await startRelayAndHost();
    const viewer = await startViewer(relay.url(), [], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) => message.type === "relay-ready" && message.peerId === "viewer-1"
    );

    expect(() => viewer.pause()).toThrow("Agent shell pause control is only valid for host runtimes");
    expect(() => viewer.resume()).toThrow("Agent shell resume control is only valid for host runtimes");
    await delay(50);

    expect(
      viewerEvents.some(
        (event) =>
          event.direction === "sent" &&
          event.message.type === "session-control" &&
          (event.message.action === "pause" || event.message.action === "resume")
      )
    ).toBe(false);
  });

  it("shares direct pause state with delayed pause timers", async () => {
    const { relay, host, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      hostPauseAfterMs: 40,
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "active"
    );
    host.pause();
    await waitForMessage(
      viewerEvents,
      (message) => message.type === "session-control" && message.action === "pause"
    );
    await delay(90);

    const pauseControls = viewerEvents.filter(
      (event) =>
        event.direction === "received" &&
        event.message.type === "session-control" &&
        event.message.action === "pause"
    );
    const pausedStates = viewerEvents.filter(
      (event) =>
        event.direction === "received" &&
        event.message.type === "session-authorization-state" &&
        event.message.status === "paused"
    );
    expect(pauseControls).toHaveLength(1);
    expect(pausedStates).toHaveLength(1);
  });

  it("shares direct resume state with delayed resume timers", async () => {
    const { relay, host, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      hostPauseAfterMs: 10,
      hostResumeAfterMs: 50,
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "paused"
    );
    host.resume();
    await waitForMessage(
      viewerEvents,
      (message) => message.type === "session-control" && message.action === "resume"
    );
    await delay(90);

    const resumeControls = viewerEvents.filter(
      (event) =>
        event.direction === "received" &&
        event.message.type === "session-control" &&
        event.message.action === "resume"
    );
    const activeStates = viewerEvents.filter(
      (event) =>
        event.direction === "received" &&
        event.message.type === "session-authorization-state" &&
        event.message.status === "active"
    );
    expect(resumeControls).toHaveLength(1);
    expect(activeStates).toHaveLength(2);
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
            terminated: true,
            reasonConfigured: true
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
      authorizationTtlMs: 1,
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
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost({
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

    const inactiveIndicator = await waitForIndicatorEvent(
      hostEvents,
      (event) => event.state === "inactive" && event.cause === "expired"
    );
    expect(inactiveIndicator).toMatchObject({
      direction: "indicator",
      state: "inactive",
      authorizationId: expiredState.type === "session-authorization-state" ? expiredState.authorizationId : "",
      authorizationStatus: "expired",
      visibleToHost: false,
      permissionCount: 0,
      cause: "expired"
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

    const authorizationId = await waitForSentActiveAuthorizationId(hostEvents);
    const signalPayload = {
      authorizationId,
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
          authorizationId: "authz_public_control",
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
    await waitForMessage(hostEvents, (message) => message.type === "hello" && message.peerId === "viewer-1");
    await waitForMessage(viewerEvents, (message) => message.type === "hello" && message.peerId === "host-1");

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
    let signalPayload: Record<string, unknown> | undefined;
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
          signalPayload = {
            authorizationId: event.message.authorizationId,
            kind: "host-offer",
            safeMarker: "active-reentrant-host-signal-payload"
          };
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
    expect(signalPayload).toBeDefined();
    if (!signalPayload) {
      throw new Error("Expected reentrant signal payload");
    }
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

  it("ignores viewer authorization decisions before observing host authority", async () => {
    const unobservedDecisionServer = await startViewerAuthorizationLifecycleServer(() => {
      const expiresAt = new Date(Date.now() + 60_000).toISOString();

      return [
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-decision",
          authorizationId: "authz_unobserved_host",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          decision: "approved",
          grantedPermissions: ["screen:view"],
          expiresAt,
          reason: "private unobserved decision reason raw-token"
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-state",
          authorizationId: "authz_unobserved_host",
          actorPeerId: "host-1",
          status: "active",
          visibleToHost: true,
          permissions: ["screen:view"],
          expiresAt,
          reason: "private unobserved state reason raw-token"
        }
      ];
    });
    const viewerEvents: AgentShellEvent[] = [];
    const viewerLogs: string[] = [];
    let viewer: AgentShellRuntime | undefined;

    try {
      viewer = await startViewer(
        unobservedDecisionServer.url,
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
        "blocked-after-unobserved-decision-payload",
        viewerLogs
      );
      const serializedRawEvents = JSON.stringify(rawEvents);
      const logOutput = viewerLogs.join("\n");
      expect(logOutput.match(/ignored unsafe inbound protocol message bytes=/g)).toHaveLength(2);
      expect(logOutput).not.toContain("session-authorization-decision");
      expect(logOutput).not.toContain("session-authorization-state");
      expect(logOutput).not.toContain("host-1");
      expect(logOutput).not.toContain("authz_unobserved_host");
      expect(logOutput).not.toContain("screen:view");
      expect(logOutput).not.toContain("private unobserved");
      expect(logOutput).not.toContain("raw-token");
      expect(serializedRawEvents).not.toContain("session-authorization-decision");
      expect(serializedRawEvents).not.toContain("session-authorization-state");
      expect(serializedRawEvents).not.toContain("host-1");
      expect(serializedRawEvents).not.toContain("authz_unobserved_host");
      expect(serializedRawEvents).not.toContain("screen:view");
      expect(serializedRawEvents).not.toContain("private unobserved");
      expect(serializedRawEvents).not.toContain("raw-token");
    } finally {
      await viewer?.stop();
      await unobservedDecisionServer.stop();
    }
  });

  it("ignores viewer authorization decisions from a mismatched observed host", async () => {
    const mismatchedDecisionServer = await startObservedHostViewerAuthorizationLifecycleServer(() => {
      const expiresAt = new Date(Date.now() + 60_000).toISOString();

      return [
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-decision",
          authorizationId: "authz_mismatched_decision_host",
          hostPeerId: "host-2",
          viewerPeerId: "viewer-1",
          decision: "approved",
          grantedPermissions: ["screen:view"],
          expiresAt,
          reason: "private mismatched decision reason raw-token"
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-state",
          authorizationId: "authz_mismatched_decision_host",
          actorPeerId: "host-2",
          status: "active",
          visibleToHost: true,
          permissions: ["screen:view"],
          expiresAt,
          reason: "private mismatched decision state reason raw-token"
        }
      ];
    });
    const viewerEvents: AgentShellEvent[] = [];
    const viewerLogs: string[] = [];
    let viewer: AgentShellRuntime | undefined;

    try {
      viewer = await startViewer(
        mismatchedDecisionServer.url,
        ["screen:view"],
        viewerEvents,
        captureLogger(viewerLogs)
      );

      await waitForMessage(viewerEvents, (message) => message.type === "hello" && message.peerId === "host-1");
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
        "blocked-after-mismatched-decision-host-payload",
        viewerLogs
      );
      const serializedRawEvents = JSON.stringify(rawEvents);
      const logOutput = viewerLogs.join("\n");
      expect(logOutput.match(/ignored unsafe inbound protocol message bytes=/g)).toHaveLength(2);
      expect(logOutput).not.toContain("host-2");
      expect(logOutput).not.toContain("authz_mismatched_decision_host");
      expect(logOutput).not.toContain("screen:view");
      expect(logOutput).not.toContain("private mismatched decision");
      expect(logOutput).not.toContain("raw-token");
      expect(serializedRawEvents).not.toContain("host-2");
      expect(serializedRawEvents).not.toContain("authz_mismatched_decision_host");
      expect(serializedRawEvents).not.toContain("screen:view");
      expect(serializedRawEvents).not.toContain("private mismatched decision");
      expect(serializedRawEvents).not.toContain("raw-token");
    } finally {
      await viewer?.stop();
      await mismatchedDecisionServer.stop();
    }
  });

  it("ignores viewer audit events before observing host authority", async () => {
    const unobservedAuditServer = await startViewerAuthorizationLifecycleServer(() => [
      {
        ...createMessageBase("session-demo"),
        type: "audit-event",
        eventId: "audit_unobserved_host",
        actorPeerId: "host-1",
        action: "agent-shell.private-unobserved-audit",
        outcome: "accepted",
        detail: {
          token: "raw-token",
          safeMarker: "private unobserved audit detail marker",
          screenContent: "raw-screen-content"
        }
      }
    ]);
    const viewerEvents: AgentShellEvent[] = [];
    const viewerLogs: string[] = [];
    let viewer: AgentShellRuntime | undefined;

    try {
      viewer = await startViewer(
        unobservedAuditServer.url,
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
          (event) => event.direction === "received" && event.message.type === "audit-event"
        )
      ).toBe(false);

      await expectViewerSignalSendBlocked(
        viewer,
        viewerEvents,
        "blocked-after-unobserved-audit-payload",
        viewerLogs
      );
      const serializedRawEvents = JSON.stringify(viewerEvents.filter((event) => event.direction === "raw"));
      const logOutput = viewerLogs.join("\n");
      expect(logOutput).toContain("ignored unsafe inbound protocol message bytes=");
      expect(logOutput).not.toContain("audit-event");
      expect(logOutput).not.toContain("host-1");
      expect(logOutput).not.toContain("audit_unobserved_host");
      expect(logOutput).not.toContain("agent-shell.private-unobserved-audit");
      expect(logOutput).not.toContain("private unobserved audit detail marker");
      expect(logOutput).not.toContain("raw-token");
      expect(logOutput).not.toContain("raw-screen-content");
      expect(serializedRawEvents).not.toContain("audit-event");
      expect(serializedRawEvents).not.toContain("host-1");
      expect(serializedRawEvents).not.toContain("audit_unobserved_host");
      expect(serializedRawEvents).not.toContain("agent-shell.private-unobserved-audit");
      expect(serializedRawEvents).not.toContain("private unobserved audit detail marker");
      expect(serializedRawEvents).not.toContain("raw-token");
      expect(serializedRawEvents).not.toContain("raw-screen-content");
    } finally {
      await viewer?.stop();
      await unobservedAuditServer.stop();
    }
  });

  it("ignores viewer audit events from a mismatched observed host", async () => {
    const mismatchedAuditServer = await startObservedHostViewerAuthorizationLifecycleServer(() => [
      {
        ...createMessageBase("session-demo"),
        type: "audit-event",
        eventId: "audit_mismatched_host",
        actorPeerId: "host-2",
        action: "agent-shell.private-mismatched-audit",
        outcome: "accepted",
        detail: {
          token: "raw-token",
          safeMarker: "private mismatched audit detail marker",
          screenContent: "raw-screen-content"
        }
      }
    ]);
    const viewerEvents: AgentShellEvent[] = [];
    const viewerLogs: string[] = [];
    let viewer: AgentShellRuntime | undefined;

    try {
      viewer = await startViewer(
        mismatchedAuditServer.url,
        ["screen:view"],
        viewerEvents,
        captureLogger(viewerLogs)
      );

      await waitForMessage(viewerEvents, (message) => message.type === "hello" && message.peerId === "host-1");
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
          (event) => event.direction === "received" && event.message.type === "audit-event"
        )
      ).toBe(false);

      await expectViewerSignalSendBlocked(
        viewer,
        viewerEvents,
        "blocked-after-mismatched-audit-payload",
        viewerLogs
      );
      const serializedRawEvents = JSON.stringify(viewerEvents.filter((event) => event.direction === "raw"));
      const logOutput = viewerLogs.join("\n");
      expect(logOutput).toContain("ignored unsafe inbound protocol message bytes=");
      expect(logOutput).not.toContain("host-2");
      expect(logOutput).not.toContain("audit_mismatched_host");
      expect(logOutput).not.toContain("agent-shell.private-mismatched-audit");
      expect(logOutput).not.toContain("private mismatched audit detail marker");
      expect(logOutput).not.toContain("raw-token");
      expect(logOutput).not.toContain("raw-screen-content");
      expect(serializedRawEvents).not.toContain("host-2");
      expect(serializedRawEvents).not.toContain("audit_mismatched_host");
      expect(serializedRawEvents).not.toContain("agent-shell.private-mismatched-audit");
      expect(serializedRawEvents).not.toContain("private mismatched audit detail marker");
      expect(serializedRawEvents).not.toContain("raw-token");
      expect(serializedRawEvents).not.toContain("raw-screen-content");
    } finally {
      await viewer?.stop();
      await mismatchedAuditServer.stop();
    }
  });

  it("accepts redacted viewer audit events from the observed host without authorizing signals", async () => {
    const observedAuditServer = await startObservedHostViewerAuthorizationLifecycleServer(() => [
      {
        ...createMessageBase("session-demo"),
        type: "audit-event",
        eventId: "audit_observed_host",
        actorPeerId: "host-1",
        action: "agent-shell.authorization.active",
        outcome: "accepted",
        detail: {
          token: "raw-token",
          safeMarker: "observed audit detail marker",
          nested: {
            screenContent: "raw-screen-content"
          }
        }
      }
    ]);
    const viewerEvents: AgentShellEvent[] = [];
    const viewerLogs: string[] = [];
    let viewer: AgentShellRuntime | undefined;

    try {
      viewer = await startViewer(
        observedAuditServer.url,
        ["screen:view"],
        viewerEvents,
        captureLogger(viewerLogs)
      );

      await waitForMessage(viewerEvents, (message) => message.type === "hello" && message.peerId === "host-1");
      const auditEvent = await waitForMessage(
        viewerEvents,
        (message) => message.type === "audit-event" && message.eventId === "audit_observed_host"
      );
      await delay(100);

      expect(auditEvent).toMatchObject({
        type: "audit-event",
        eventId: "audit_observed_host",
        actorPeerId: "host-1",
        action: "agent-shell.authorization.active",
        outcome: "accepted",
        detail: {
          token: "[REDACTED]",
          safeMarker: "observed audit detail marker",
          nested: {
            screenContent: "[REDACTED]"
          }
        }
      });
      expect(viewerEvents.some((event) => event.direction === "raw")).toBe(false);

      await expectViewerSignalSendBlocked(
        viewer,
        viewerEvents,
        "blocked-after-observed-audit-payload",
        viewerLogs
      );
      const serializedEvents = JSON.stringify(viewerEvents);
      expect(serializedEvents).not.toContain("raw-token");
      expect(serializedEvents).not.toContain("raw-screen-content");
      expect(viewerLogs.join("\n")).toContain("received audit-event");
      expect(viewerLogs.join("\n")).not.toContain("raw-token");
      expect(viewerLogs.join("\n")).not.toContain("raw-screen-content");
    } finally {
      await viewer?.stop();
      await observedAuditServer.stop();
    }
  });

  it("ignores mismatched viewer authorization authority before signal authorization", async () => {
    const mismatchedServer = await startObservedHostViewerAuthorizationLifecycleServer(() => {
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
          authorizationId: "authz_bound_authority",
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

  it("ignores viewer session controls with mismatched authorization ids", async () => {
    const controlBindingServer = await startObservedHostViewerAuthorizationLifecycleServer(() => {
      const expiresAt = new Date(Date.now() + 60_000).toISOString();

      return [
        {
          ...createMessageBase("session-demo"),
          type: "relay-ready",
          peerId: "viewer-1",
          roomSize: 2
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-decision",
          authorizationId: "authz_control_bound",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          decision: "approved",
          grantedPermissions: ["screen:view"],
          expiresAt
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-state",
          authorizationId: "authz_control_bound",
          actorPeerId: "host-1",
          status: "active",
          visibleToHost: true,
          permissions: ["screen:view"],
          expiresAt
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-control",
          authorizationId: "authz_control_other",
          actorPeerId: "host-1",
          action: "pause",
          reason: "private mismatched control id reason raw-token"
        }
      ];
    });
    const viewerEvents: AgentShellEvent[] = [];
    const viewerLogs: string[] = [];
    let viewer: AgentShellRuntime | undefined;

    try {
      viewer = await startViewer(
        controlBindingServer.url,
        ["screen:view"],
        viewerEvents,
        captureLogger(viewerLogs)
      );

      await waitForMessage(
        viewerEvents,
        (message) =>
          message.type === "session-authorization-state" &&
          message.authorizationId === "authz_control_bound" &&
          message.status === "active"
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
          (event) => event.direction === "received" && event.message.type === "session-control"
        )
      ).toBe(false);

      const signalPayload = {
        authorizationId: "authz_control_bound",
        kind: "offer",
        safeMarker: "allowed-after-mismatched-control-id"
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
      expect(sentSignal).toMatchObject({
        type: "signal",
        fromPeerId: "viewer-1",
        toPeerId: "host-1",
        payload: {
          redacted: "[REDACTED]",
          byteLength: Buffer.byteLength(JSON.stringify(signalPayload))
        }
      });
      expect(viewerLogs.join("\n")).toContain("ignored unsafe inbound protocol message bytes=");
      expect(viewerLogs.join("\n")).not.toContain("authz_control_other");
      expect(viewerLogs.join("\n")).not.toContain("private mismatched control id");
      expect(viewerLogs.join("\n")).not.toContain("raw-token");
      expect(JSON.stringify(viewerEvents)).not.toContain("allowed-after-mismatched-control-id");
    } finally {
      await viewer?.stop();
      await controlBindingServer.stop();
    }
  });

  it("keeps viewer authorization denied when a later active state uses the same authority", async () => {
    const deniedThenActiveServer = await startObservedHostViewerAuthorizationLifecycleServer(() => {
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
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-control",
          authorizationId: "authz_denied_then_active",
          actorPeerId: "host-1",
          action: "resume",
          reason: "private denied-control reason raw-token"
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
      const rawEvents = await waitForRawEventCount(viewerEvents, 2);
      await delay(100);

      expect(rawEvents).toHaveLength(2);
      expect(rawEvents[0]).toMatchObject({
        direction: "raw",
        text: "[REDACTED]",
        byteLength: expect.any(Number)
      });
      expect(
        viewerEvents.some(
          (event) =>
            event.direction === "received" &&
            (event.message.type === "session-authorization-state" ||
              event.message.type === "session-control")
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
      expect(viewerLogs.join("\n")).not.toContain("private denied-control");
      expect(viewerLogs.join("\n")).not.toContain("raw-token");
      expect(JSON.stringify(viewerEvents.filter((event) => event.direction === "raw"))).not.toContain(
        "authz_denied_then_active"
      );
    } finally {
      await viewer?.stop();
      await deniedThenActiveServer.stop();
    }
  });

  it("ignores approved decision replay after a denied same-authorization decision", async () => {
    const decisionReplayServer = await startObservedHostViewerAuthorizationLifecycleServer(() => {
      const expiresAt = new Date(Date.now() + 60_000).toISOString();

      return [
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-decision",
          authorizationId: "authz_denied_decision_replay",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          decision: "denied",
          grantedPermissions: [],
          reason: "private denied decision replay reason raw-token"
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-decision",
          authorizationId: "authz_denied_decision_replay",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          decision: "approved",
          grantedPermissions: ["screen:view"],
          expiresAt,
          reason: "private approved decision replay reason raw-token"
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-state",
          authorizationId: "authz_denied_decision_replay",
          actorPeerId: "host-1",
          status: "active",
          visibleToHost: true,
          permissions: ["screen:view"],
          expiresAt,
          reason: "private active decision replay reason raw-token"
        }
      ];
    });
    const viewerEvents: AgentShellEvent[] = [];
    const viewerLogs: string[] = [];
    let viewer: AgentShellRuntime | undefined;

    try {
      viewer = await startViewer(
        decisionReplayServer.url,
        ["screen:view"],
        viewerEvents,
        captureLogger(viewerLogs)
      );

      await waitForMessage(
        viewerEvents,
        (message) =>
          message.type === "session-authorization-decision" &&
          message.authorizationId === "authz_denied_decision_replay" &&
          message.decision === "denied"
      );
      await waitForRawEventCount(viewerEvents, 2);
      await delay(100);

      expect(
        viewerEvents.some(
          (event) =>
            event.direction === "received" &&
            ((event.message.type === "session-authorization-decision" &&
              event.message.authorizationId === "authz_denied_decision_replay" &&
              event.message.decision === "approved") ||
              (event.message.type === "session-authorization-state" &&
                event.message.authorizationId === "authz_denied_decision_replay"))
        )
      ).toBe(false);

      await expectViewerSignalSendBlocked(
        viewer,
        viewerEvents,
        "blocked-after-denied-decision-replay",
        viewerLogs
      );
      expect(viewerLogs.join("\n")).toContain("ignored unsafe inbound protocol message bytes=");
      expect(viewerLogs.join("\n")).not.toContain("private approved decision replay");
      expect(viewerLogs.join("\n")).not.toContain("private active decision replay");
      expect(viewerLogs.join("\n")).not.toContain("raw-token");
      expect(JSON.stringify(viewerEvents.filter((event) => event.direction === "raw"))).not.toContain(
        "authz_denied_decision_replay"
      );
    } finally {
      await viewer?.stop();
      await decisionReplayServer.stop();
    }
  });

  it.each([
    ["revoked", "authz_revoked_decision_replay"],
    ["terminated", "authz_terminated_decision_replay"],
    ["expired", "authz_expired_decision_replay"]
  ] as const)(
    "ignores approved decision replay after %s same-authorization state",
    async (terminalStatus, authorizationId) => {
      const terminalReplayServer = await startObservedHostViewerAuthorizationLifecycleServer(() => {
        const expiresAt = new Date(Date.now() + 60_000).toISOString();

        return [
          {
            ...createMessageBase("session-demo"),
            type: "session-authorization-decision",
            authorizationId,
            hostPeerId: "host-1",
            viewerPeerId: "viewer-1",
            decision: "approved",
            grantedPermissions: ["screen:view"],
            expiresAt
          },
          {
            ...createMessageBase("session-demo"),
            type: "session-authorization-state",
            authorizationId,
            actorPeerId: "host-1",
            status: "active",
            visibleToHost: true,
            permissions: ["screen:view"],
            expiresAt
          },
          {
            ...createMessageBase("session-demo"),
            type: "session-authorization-state",
            authorizationId,
            actorPeerId: "host-1",
            status: terminalStatus,
            visibleToHost: false,
            permissions: [],
            expiresAt,
            reason: `private ${terminalStatus} state replay reason raw-token`
          },
          {
            ...createMessageBase("session-demo"),
            type: "session-authorization-decision",
            authorizationId,
            hostPeerId: "host-1",
            viewerPeerId: "viewer-1",
            decision: "approved",
            grantedPermissions: ["screen:view"],
            expiresAt,
            reason: `private ${terminalStatus} approved replay reason raw-token`
          },
          {
            ...createMessageBase("session-demo"),
            type: "session-authorization-state",
            authorizationId,
            actorPeerId: "host-1",
            status: "active",
            visibleToHost: true,
            permissions: ["screen:view"],
            expiresAt,
            reason: `private ${terminalStatus} active replay reason raw-token`
          }
        ];
      });
      const viewerEvents: AgentShellEvent[] = [];
      const viewerLogs: string[] = [];
      let viewer: AgentShellRuntime | undefined;

      try {
        viewer = await startViewer(
          terminalReplayServer.url,
          ["screen:view"],
          viewerEvents,
          captureLogger(viewerLogs)
        );

        await waitForMessage(
          viewerEvents,
          (message) =>
            message.type === "session-authorization-state" &&
            message.authorizationId === authorizationId &&
            message.status === terminalStatus
        );
        await waitForRawEventCount(viewerEvents, 2);
        await delay(100);

        expect(
          viewerEvents.filter(
            (event) =>
              event.direction === "received" &&
              event.message.type === "session-authorization-decision" &&
              event.message.authorizationId === authorizationId &&
              event.message.decision === "approved"
          )
        ).toHaveLength(1);
        expect(
          viewerEvents.filter(
            (event) =>
              event.direction === "received" &&
              event.message.type === "session-authorization-state" &&
              event.message.authorizationId === authorizationId &&
              event.message.status === "active"
          )
        ).toHaveLength(1);

        await expectViewerSignalSendBlocked(
          viewer,
          viewerEvents,
          `blocked-after-${terminalStatus}-decision-replay`,
          viewerLogs
        );
        expect(viewerLogs.join("\n")).toContain("ignored unsafe inbound protocol message bytes=");
        expect(viewerLogs.join("\n")).not.toContain(`private ${terminalStatus} approved replay`);
        expect(viewerLogs.join("\n")).not.toContain(`private ${terminalStatus} active replay`);
        expect(viewerLogs.join("\n")).not.toContain("raw-token");
        expect(JSON.stringify(viewerEvents.filter((event) => event.direction === "raw"))).not.toContain(
          authorizationId
        );
      } finally {
        await viewer?.stop();
        await terminalReplayServer.stop();
      }
    }
  );

  it("allows a new authorization id after terminal state from the observed host", async () => {
    const newDecisionServer = await startObservedHostViewerAuthorizationLifecycleServer(() => {
      const expiresAt = new Date(Date.now() + 60_000).toISOString();

      return [
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-decision",
          authorizationId: "authz_terminal_old",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          decision: "approved",
          grantedPermissions: ["screen:view"],
          expiresAt
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-state",
          authorizationId: "authz_terminal_old",
          actorPeerId: "host-1",
          status: "active",
          visibleToHost: true,
          permissions: ["screen:view"],
          expiresAt
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-state",
          authorizationId: "authz_terminal_old",
          actorPeerId: "host-1",
          status: "terminated",
          visibleToHost: false,
          permissions: [],
          expiresAt,
          reason: "private old terminal reason raw-token"
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-decision",
          authorizationId: "authz_terminal_new",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          decision: "approved",
          grantedPermissions: ["screen:view"],
          expiresAt
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-state",
          authorizationId: "authz_terminal_new",
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
    let viewer: AgentShellRuntime | undefined;

    try {
      viewer = await startViewer(
        newDecisionServer.url,
        ["screen:view"],
        viewerEvents,
        captureLogger(viewerLogs)
      );

      await waitForMessage(
        viewerEvents,
        (message) =>
          message.type === "session-authorization-state" &&
          message.authorizationId === "authz_terminal_new" &&
          message.status === "active"
      );

      const signalPayload = {
        authorizationId: "authz_terminal_new",
        kind: "viewer-offer",
        safeMarker: "allowed-after-terminal-new-decision"
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
        (message) =>
          message.type === "signal" &&
          message.fromPeerId === "viewer-1" &&
          message.toPeerId === "host-1"
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
      expect(JSON.stringify(viewerEvents)).not.toContain("allowed-after-terminal-new-decision");
      expect(JSON.stringify(viewerEvents)).not.toContain("private old terminal reason");
      expect(viewerLogs.join("\n")).not.toContain("private old terminal reason");
      expect(viewerLogs.join("\n")).not.toContain("raw-token");
    } finally {
      await viewer?.stop();
      await newDecisionServer.stop();
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
    const restartServer = await startObservedHostViewerAuthorizationLifecycleServer(() => {
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

    const authorizationId = await waitForReceivedActiveAuthorizationId(viewerEvents);

    const signalPayload = {
      authorizationId,
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

  it("sends viewer signal probe after active visible screen authorization and redacts payload contents", async () => {
    const viewerLogs: string[] = [];
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      visibleToHost: true
    });
    await startViewer(
      relay.url(),
      ["screen:view"],
      viewerEvents,
      captureLogger(viewerLogs),
      undefined,
      "Viewer",
      { viewerSignalProbeAfterMs: 0 }
    );

    const authorizationId = await waitForReceivedActiveAuthorizationId(viewerEvents);
    const signalPayload = {
      authorizationId,
      probe: "viewer-signal-probe-v1"
    };
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
    expect(JSON.stringify(sentSignal)).not.toContain("viewer-signal-probe-v1");
    expect(JSON.stringify(receivedSignal)).not.toContain("viewer-signal-probe-v1");
    expect(viewerLogs.join("\n")).not.toContain("viewer-signal-probe-v1");
  });

  it("withholds viewer signal probe before active visible authorization", async () => {
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      visibleToHost: false
    });
    await startViewer(
      relay.url(),
      ["screen:view"],
      viewerEvents,
      silentLogger,
      undefined,
      "Viewer",
      { viewerSignalProbeAfterMs: 0 }
    );

    await waitForMessage(
      viewerEvents,
      (message) => message.type === "session-authorization-decision"
    );
    await delay(80);

    expect(
      viewerEvents.some((event) => event.direction === "sent" && event.message.type === "signal")
    ).toBe(false);
    expect(
      hostEvents.some((event) => event.direction === "received" && event.message.type === "signal")
    ).toBe(false);
  });

  it("skips viewer signal probe after lifecycle loss before the probe fires", async () => {
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
      },
      {
        name: "disconnect",
        options: {
          hostDecision: "approve",
          hostDisconnectAfterMs: 10,
          visibleToHost: true
        },
        waitForClosedState: (message) => message.type === "peer-disconnected"
      }
    ];

    for (const scenario of scenarios) {
      const viewerLogs: string[] = [];
      const { relay, hostEvents, viewerEvents } = await startRelayAndHost(scenario.options);
      await startViewer(
        relay.url(),
        ["screen:view"],
        viewerEvents,
        captureLogger(viewerLogs),
        undefined,
        "Viewer",
        { viewerSignalProbeAfterMs: 80 }
      );

      await waitForMessage(
        viewerEvents,
        (message) =>
          message.type === "session-authorization-state" &&
          message.status === "active" &&
          message.visibleToHost
      );
      await waitForMessage(viewerEvents, scenario.waitForClosedState);
      await delay(130);

      expect(
        viewerEvents.filter((event) => event.direction === "sent" && event.message.type === "signal"),
        scenario.name
      ).toHaveLength(0);
      expect(
        hostEvents.filter((event) => event.direction === "received" && event.message.type === "signal"),
        scenario.name
      ).toHaveLength(0);
      expect(JSON.stringify(viewerEvents), scenario.name).not.toContain("viewer-signal-probe-v1");
      expect(viewerLogs.join("\n"), scenario.name).not.toContain("viewer-signal-probe-v1");
    }
  });

  it("does not revive a pending viewer signal probe after pause and resume", async () => {
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      hostPauseAfterMs: 10,
      hostResumeAfterMs: 10,
      visibleToHost: true
    });
    await startViewer(
      relay.url(),
      ["screen:view"],
      viewerEvents,
      silentLogger,
      undefined,
      "Viewer",
      { viewerSignalProbeAfterMs: 80 }
    );

    await waitForReceivedMessageCount(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "active" &&
        message.visibleToHost,
      2
    );
    await delay(130);

    expect(
      viewerEvents.filter((event) => event.direction === "sent" && event.message.type === "signal")
    ).toHaveLength(0);
    expect(
      hostEvents.filter((event) => event.direction === "received" && event.message.type === "signal")
    ).toHaveLength(0);
    expect(JSON.stringify(viewerEvents)).not.toContain("viewer-signal-probe-v1");
  });

  it("cancels a pending viewer signal probe when the viewer runtime stops locally", async () => {
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      visibleToHost: true
    });
    const viewer = await startViewer(
      relay.url(),
      ["screen:view"],
      viewerEvents,
      silentLogger,
      undefined,
      "Viewer",
      { viewerSignalProbeAfterMs: 80 }
    );

    await waitForReceivedActiveAuthorizationId(viewerEvents);
    await viewer.stop();
    await delay(130);

    expect(
      viewerEvents.filter((event) => event.direction === "sent" && event.message.type === "signal")
    ).toHaveLength(0);
    expect(
      hostEvents.filter((event) => event.direction === "received" && event.message.type === "signal")
    ).toHaveLength(0);
    expect(JSON.stringify(viewerEvents)).not.toContain("viewer-signal-probe-v1");
  });

  it("blocks host and viewer signal sends with missing or mismatched authorization ids", async () => {
    const hostLogs: string[] = [];
    const viewerLogs: string[] = [];
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      hostLogger: captureLogger(hostLogs),
      visibleToHost: true
    });
    const viewer = await startViewer(
      relay.url(),
      ["screen:view"],
      viewerEvents,
      captureLogger(viewerLogs)
    );

    const hostAuthorizationId = await waitForSentActiveAuthorizationId(hostEvents);
    const viewerAuthorizationId = await waitForReceivedActiveAuthorizationId(viewerEvents);
    expect(viewerAuthorizationId).toBe(hostAuthorizationId);

    const blockedSends: Array<{
      name: string;
      runtime: AgentShellRuntime;
      localEvents: AgentShellEvent[];
      remoteEvents: AgentShellEvent[];
      localLogs: string[];
      fromPeerId: string;
      toPeerId: string;
      kind: string;
      payload: Record<string, unknown>;
      marker: string;
    }> = [
      {
        name: "host missing authorization id",
        runtime: host,
        localEvents: hostEvents,
        remoteEvents: viewerEvents,
        localLogs: hostLogs,
        fromPeerId: "host-1",
        toPeerId: "viewer-1",
        kind: "host-offer",
        payload: {
          kind: "host-offer",
          safeMarker: "host-missing-signal-auth-id"
        },
        marker: "host-missing-signal-auth-id"
      },
      {
        name: "host mismatched authorization id",
        runtime: host,
        localEvents: hostEvents,
        remoteEvents: viewerEvents,
        localLogs: hostLogs,
        fromPeerId: "host-1",
        toPeerId: "viewer-1",
        kind: "host-offer",
        payload: {
          authorizationId: "authz_other_signal",
          kind: "host-offer",
          safeMarker: "host-mismatch-signal-auth-id"
        },
        marker: "host-mismatch-signal-auth-id"
      },
      {
        name: "viewer missing authorization id",
        runtime: viewer,
        localEvents: viewerEvents,
        remoteEvents: hostEvents,
        localLogs: viewerLogs,
        fromPeerId: "viewer-1",
        toPeerId: "host-1",
        kind: "viewer-offer",
        payload: {
          kind: "viewer-offer",
          safeMarker: "viewer-missing-signal-auth-id"
        },
        marker: "viewer-missing-signal-auth-id"
      },
      {
        name: "viewer mismatched authorization id",
        runtime: viewer,
        localEvents: viewerEvents,
        remoteEvents: hostEvents,
        localLogs: viewerLogs,
        fromPeerId: "viewer-1",
        toPeerId: "host-1",
        kind: "viewer-offer",
        payload: {
          authorizationId: "authz_other_signal",
          kind: "viewer-offer",
          safeMarker: "viewer-mismatch-signal-auth-id"
        },
        marker: "viewer-mismatch-signal-auth-id"
      }
    ];

    for (const blocked of blockedSends) {
      const sentSignalCountBefore = blocked.localEvents.filter(
        (event) => event.direction === "sent" && event.message.type === "signal"
      ).length;
      const receivedSignalCountBefore = blocked.remoteEvents.filter(
        (event) => event.direction === "received" && event.message.type === "signal"
      ).length;

      expect(() =>
        blocked.runtime.send({
          ...createMessageBase("session-demo"),
          type: "signal",
          fromPeerId: blocked.fromPeerId,
          toPeerId: blocked.toPeerId,
          payload: blocked.payload
        })
      , blocked.name).toThrow("Agent shell signal requires active visible screen authorization");
      await delay(50);

      expect(
        blocked.localEvents.filter((event) => event.direction === "sent" && event.message.type === "signal"),
        blocked.name
      ).toHaveLength(sentSignalCountBefore);
      expect(
        blocked.remoteEvents.filter((event) => event.direction === "received" && event.message.type === "signal"),
        blocked.name
      ).toHaveLength(receivedSignalCountBefore);
      expect(JSON.stringify(blocked.localEvents), blocked.name).not.toContain(blocked.marker);
      expect(JSON.stringify(blocked.remoteEvents), blocked.name).not.toContain(blocked.marker);
      expect(blocked.localLogs.join("\n"), blocked.name).not.toContain(blocked.marker);
      expect(blocked.localLogs.join("\n"), blocked.name).not.toContain("authz_other_signal");
    }
  });

  it("fails closed for viewer signal sends after a bound revoke control", async () => {
    const revokeControlServer = await startObservedHostViewerAuthorizationLifecycleServer(() => {
      const expiresAt = new Date(Date.now() + 60_000).toISOString();

      return [
        {
          ...createMessageBase("session-demo"),
          type: "relay-ready",
          peerId: "viewer-1",
          roomSize: 2
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-decision",
          authorizationId: "authz_revoke_control",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          decision: "approved",
          grantedPermissions: ["screen:view"],
          expiresAt
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-state",
          authorizationId: "authz_revoke_control",
          actorPeerId: "host-1",
          status: "active",
          visibleToHost: true,
          permissions: ["screen:view"],
          expiresAt
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-control",
          authorizationId: "authz_revoke_control",
          actorPeerId: "host-1",
          action: "revoke-permission",
          permission: "screen:view",
          reason: "private revoke control reason raw-token"
        }
      ];
    });
    const viewerEvents: AgentShellEvent[] = [];
    const viewerLogs: string[] = [];
    let viewer: AgentShellRuntime | undefined;

    try {
      viewer = await startViewer(
        revokeControlServer.url,
        ["screen:view"],
        viewerEvents,
        captureLogger(viewerLogs)
      );

      await waitForMessage(
        viewerEvents,
        (message) =>
          message.type === "session-authorization-state" &&
          message.authorizationId === "authz_revoke_control" &&
          message.status === "active"
      );
      const revokeControl = await waitForMessage(
        viewerEvents,
        (message) =>
          message.type === "session-control" &&
          message.authorizationId === "authz_revoke_control" &&
          message.action === "revoke-permission"
      );

      expect(revokeControl).toMatchObject({
        type: "session-control",
        authorizationId: "authz_revoke_control",
        actorPeerId: "host-1",
        action: "revoke-permission",
        permission: "screen:view",
        reason: "[REDACTED]"
      });

      await expectViewerSignalSendBlocked(
        viewer,
        viewerEvents,
        "blocked-after-revoke-control-payload",
        viewerLogs
      );
      expect(JSON.stringify(revokeControl)).not.toContain("private revoke control reason");
      expect(JSON.stringify(revokeControl)).not.toContain("raw-token");
    } finally {
      await viewer?.stop();
      await revokeControlServer.stop();
    }
  });

  it("accepts revoke confirmation after revoke control without restoring viewer signal access", async () => {
    const revokeConfirmationServer = await startObservedHostViewerAuthorizationLifecycleServer(() => {
      const expiresAt = new Date(Date.now() + 60_000).toISOString();

      return [
        {
          ...createMessageBase("session-demo"),
          type: "relay-ready",
          peerId: "viewer-1",
          roomSize: 2
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-decision",
          authorizationId: "authz_revoke_confirmation",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          decision: "approved",
          grantedPermissions: ["screen:view"],
          expiresAt
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-state",
          authorizationId: "authz_revoke_confirmation",
          actorPeerId: "host-1",
          status: "active",
          visibleToHost: true,
          permissions: ["screen:view"],
          expiresAt
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-control",
          authorizationId: "authz_revoke_confirmation",
          actorPeerId: "host-1",
          action: "revoke-permission",
          permission: "screen:view",
          reason: "private revoke control reason raw-token"
        },
        {
          ...createMessageBase("session-demo"),
          type: "permission-revoked",
          authorizationId: "authz_revoke_confirmation",
          actorPeerId: "host-1",
          revokedPermission: "screen:view",
          reason: "private revoke confirmation reason raw-token"
        }
      ];
    });
    const viewerEvents: AgentShellEvent[] = [];
    const viewerLogs: string[] = [];
    let viewer: AgentShellRuntime | undefined;

    try {
      viewer = await startViewer(
        revokeConfirmationServer.url,
        ["screen:view"],
        viewerEvents,
        captureLogger(viewerLogs)
      );

      const activeState = await waitForMessage(
        viewerEvents,
        (message) =>
          message.type === "session-authorization-state" &&
          message.authorizationId === "authz_revoke_confirmation" &&
          message.status === "active" &&
          message.visibleToHost
      );
      await waitForMessage(
        viewerEvents,
        (message) =>
          message.type === "session-control" &&
          message.authorizationId === "authz_revoke_confirmation" &&
          message.action === "revoke-permission"
      );
      const revokeConfirmation = await waitForMessage(
        viewerEvents,
        (message) =>
          message.type === "permission-revoked" &&
          message.authorizationId === "authz_revoke_confirmation"
      );

      expect(activeState).toMatchObject({
        type: "session-authorization-state",
        authorizationId: "authz_revoke_confirmation",
        actorPeerId: "host-1",
        status: "active",
        visibleToHost: true,
        permissions: ["screen:view"]
      });
      expect(revokeConfirmation).toMatchObject({
        type: "permission-revoked",
        authorizationId: "authz_revoke_confirmation",
        actorPeerId: "host-1",
        revokedPermission: "screen:view",
        reason: "[REDACTED]"
      });

      await expectViewerSignalSendBlocked(
        viewer,
        viewerEvents,
        "blocked-after-revoke-confirmation-payload",
        viewerLogs
      );
      expect(JSON.stringify(revokeConfirmation)).not.toContain("private revoke confirmation reason");
      expect(JSON.stringify(viewerEvents)).not.toContain("private revoke confirmation reason");
      expect(JSON.stringify(viewerEvents)).not.toContain("raw-token");
      expect(viewerLogs.join("\n")).not.toContain("private revoke confirmation reason");
      expect(viewerLogs.join("\n")).not.toContain("raw-token");
    } finally {
      await viewer?.stop();
      await revokeConfirmationServer.stop();
    }
  });

  it("keeps viewer signal blocked when stale active state follows a partial revoke control", async () => {
    const revocationFloorServer = await startObservedHostViewerAuthorizationLifecycleServer(() => {
      const expiresAt = new Date(Date.now() + 60_000).toISOString();

      return [
        {
          ...createMessageBase("session-demo"),
          type: "relay-ready",
          peerId: "viewer-1",
          roomSize: 2
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-decision",
          authorizationId: "authz_floor_control",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          decision: "approved",
          grantedPermissions: ["screen:view", "input:pointer"],
          expiresAt
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-state",
          authorizationId: "authz_floor_control",
          actorPeerId: "host-1",
          status: "active",
          visibleToHost: true,
          permissions: ["screen:view", "input:pointer"],
          expiresAt
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-control",
          authorizationId: "authz_floor_control",
          actorPeerId: "host-1",
          action: "revoke-permission",
          permission: "screen:view",
          reason: "private floor control reason raw-token"
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-state",
          authorizationId: "authz_floor_control",
          actorPeerId: "host-1",
          status: "active",
          visibleToHost: true,
          permissions: ["screen:view", "input:pointer"],
          expiresAt
        }
      ];
    });
    const viewerEvents: AgentShellEvent[] = [];
    const viewerLogs: string[] = [];
    let viewer: AgentShellRuntime | undefined;

    try {
      viewer = await startViewer(
        revocationFloorServer.url,
        ["screen:view", "input:pointer"],
        viewerEvents,
        captureLogger(viewerLogs)
      );

      await waitForMessage(
        viewerEvents,
        (message) =>
          message.type === "session-control" &&
          message.authorizationId === "authz_floor_control" &&
          message.action === "revoke-permission"
      );
      const activeStates = await waitForReceivedMessageCount(
        viewerEvents,
        (message) =>
          message.type === "session-authorization-state" &&
          message.authorizationId === "authz_floor_control" &&
          message.status === "active",
        2
      );

      expect(activeStates[1]).toMatchObject({
        type: "session-authorization-state",
        authorizationId: "authz_floor_control",
        actorPeerId: "host-1",
        status: "active",
        visibleToHost: true,
        permissions: ["screen:view", "input:pointer"]
      });
      await expectViewerSignalSendBlocked(
        viewer,
        viewerEvents,
        "blocked-after-stale-revoke-control-state",
        viewerLogs
      );
      expect(JSON.stringify(viewerEvents)).not.toContain("revokedPermissions");
      expect(JSON.stringify(viewerEvents)).not.toContain("private floor control reason");
      expect(viewerLogs.join("\n")).not.toContain("private floor control reason");
      expect(viewerLogs.join("\n")).not.toContain("raw-token");
    } finally {
      await viewer?.stop();
      await revocationFloorServer.stop();
    }
  });

  it("keeps viewer signal blocked when stale active state follows a revoke confirmation", async () => {
    const confirmationFloorServer = await startObservedHostViewerAuthorizationLifecycleServer(() => {
      const expiresAt = new Date(Date.now() + 60_000).toISOString();

      return [
        {
          ...createMessageBase("session-demo"),
          type: "relay-ready",
          peerId: "viewer-1",
          roomSize: 2
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-decision",
          authorizationId: "authz_floor_confirmation",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          decision: "approved",
          grantedPermissions: ["screen:view", "input:pointer"],
          expiresAt
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-state",
          authorizationId: "authz_floor_confirmation",
          actorPeerId: "host-1",
          status: "active",
          visibleToHost: true,
          permissions: ["screen:view", "input:pointer"],
          expiresAt
        },
        {
          ...createMessageBase("session-demo"),
          type: "permission-revoked",
          authorizationId: "authz_floor_confirmation",
          actorPeerId: "host-1",
          revokedPermission: "screen:view",
          reason: "private floor confirmation reason raw-token"
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-state",
          authorizationId: "authz_floor_confirmation",
          actorPeerId: "host-1",
          status: "active",
          visibleToHost: true,
          permissions: ["screen:view", "input:pointer"],
          expiresAt
        }
      ];
    });
    const viewerEvents: AgentShellEvent[] = [];
    const viewerLogs: string[] = [];
    let viewer: AgentShellRuntime | undefined;

    try {
      viewer = await startViewer(
        confirmationFloorServer.url,
        ["screen:view", "input:pointer"],
        viewerEvents,
        captureLogger(viewerLogs)
      );

      await waitForMessage(
        viewerEvents,
        (message) =>
          message.type === "permission-revoked" &&
          message.authorizationId === "authz_floor_confirmation"
      );
      await waitForReceivedMessageCount(
        viewerEvents,
        (message) =>
          message.type === "session-authorization-state" &&
          message.authorizationId === "authz_floor_confirmation" &&
          message.status === "active",
        2
      );

      await expectViewerSignalSendBlocked(
        viewer,
        viewerEvents,
        "blocked-after-stale-revoke-confirmation-state",
        viewerLogs
      );
      expect(JSON.stringify(viewerEvents)).not.toContain("revokedPermissions");
      expect(JSON.stringify(viewerEvents)).not.toContain("private floor confirmation reason");
      expect(viewerLogs.join("\n")).not.toContain("private floor confirmation reason");
      expect(viewerLogs.join("\n")).not.toContain("raw-token");
    } finally {
      await viewer?.stop();
      await confirmationFloorServer.stop();
    }
  });

  it("preserves the revocation floor for same-id decisions and resets it for a new authorization id", async () => {
    const resetFloorServer = await startObservedHostViewerAuthorizationLifecycleServer(() => {
      const expiresAt = new Date(Date.now() + 60_000).toISOString();

      return [
        {
          ...createMessageBase("session-demo"),
          type: "relay-ready",
          peerId: "viewer-1",
          roomSize: 2
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-decision",
          authorizationId: "authz_floor_same",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          decision: "approved",
          grantedPermissions: ["screen:view", "input:pointer"],
          expiresAt
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-state",
          authorizationId: "authz_floor_same",
          actorPeerId: "host-1",
          status: "active",
          visibleToHost: true,
          permissions: ["screen:view", "input:pointer"],
          expiresAt
        },
        {
          ...createMessageBase("session-demo"),
          type: "permission-revoked",
          authorizationId: "authz_floor_same",
          actorPeerId: "host-1",
          revokedPermission: "screen:view",
          reason: "private same-id reset reason raw-token"
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-decision",
          authorizationId: "authz_floor_same",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          decision: "approved",
          grantedPermissions: ["screen:view", "input:pointer"],
          expiresAt
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-state",
          authorizationId: "authz_floor_same",
          actorPeerId: "host-1",
          status: "active",
          visibleToHost: true,
          permissions: ["screen:view", "input:pointer"],
          expiresAt
        }
      ];
    });
    const viewerEvents: AgentShellEvent[] = [];
    const viewerLogs: string[] = [];
    let viewer: AgentShellRuntime | undefined;

    try {
      viewer = await startViewer(
        resetFloorServer.url,
        ["screen:view", "input:pointer"],
        viewerEvents,
        captureLogger(viewerLogs)
      );

      await waitForReceivedMessageCount(
        viewerEvents,
        (message) =>
          message.type === "session-authorization-decision" &&
          message.authorizationId === "authz_floor_same",
        2
      );
      await waitForReceivedMessageCount(
        viewerEvents,
        (message) =>
          message.type === "session-authorization-state" &&
          message.authorizationId === "authz_floor_same" &&
          message.status === "active",
        2
      );

      await expectViewerSignalSendBlocked(
        viewer,
        viewerEvents,
        "blocked-after-same-id-decision-reset",
        viewerLogs
      );
      expect(JSON.stringify(viewerEvents)).not.toContain("revokedPermissions");
      expect(JSON.stringify(viewerEvents)).not.toContain("private same-id reset reason");
      expect(viewerLogs.join("\n")).not.toContain("private same-id reset reason");
      expect(viewerLogs.join("\n")).not.toContain("raw-token");
    } finally {
      await viewer?.stop();
      await resetFloorServer.stop();
    }

    const newAuthorizationServer = await startObservedHostViewerAuthorizationLifecycleServer(() => {
      const expiresAt = new Date(Date.now() + 60_000).toISOString();

      return [
        {
          ...createMessageBase("session-demo"),
          type: "relay-ready",
          peerId: "viewer-1",
          roomSize: 2
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-decision",
          authorizationId: "authz_floor_old",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          decision: "approved",
          grantedPermissions: ["screen:view", "input:pointer"],
          expiresAt
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-state",
          authorizationId: "authz_floor_old",
          actorPeerId: "host-1",
          status: "active",
          visibleToHost: true,
          permissions: ["screen:view", "input:pointer"],
          expiresAt
        },
        {
          ...createMessageBase("session-demo"),
          type: "permission-revoked",
          authorizationId: "authz_floor_old",
          actorPeerId: "host-1",
          revokedPermission: "screen:view",
          reason: "private new-id reset reason raw-token"
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-decision",
          authorizationId: "authz_floor_new",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          decision: "approved",
          grantedPermissions: ["screen:view"],
          expiresAt
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-state",
          authorizationId: "authz_floor_new",
          actorPeerId: "host-1",
          status: "active",
          visibleToHost: true,
          permissions: ["screen:view"],
          expiresAt
        }
      ];
    });
    const newViewerEvents: AgentShellEvent[] = [];
    const newViewerLogs: string[] = [];
    let newViewer: AgentShellRuntime | undefined;

    try {
      newViewer = await startViewer(
        newAuthorizationServer.url,
        ["screen:view", "input:pointer"],
        newViewerEvents,
        captureLogger(newViewerLogs)
      );

      await waitForMessage(
        newViewerEvents,
        (message) =>
          message.type === "permission-revoked" &&
          message.authorizationId === "authz_floor_old"
      );
      await waitForMessage(
        newViewerEvents,
        (message) =>
          message.type === "session-authorization-state" &&
          message.authorizationId === "authz_floor_new" &&
          message.status === "active"
      );

      const signalPayload = {
        authorizationId: "authz_floor_new",
        kind: "viewer-offer",
        safeMarker: "allowed-after-new-authorization-id"
      };
      newViewer.send({
        ...createMessageBase("session-demo"),
        type: "signal",
        fromPeerId: "viewer-1",
        toPeerId: "host-1",
        payload: signalPayload
      });

      const sentSignal = await waitForSentMessage(
        newViewerEvents,
        (message) =>
          message.type === "signal" &&
          message.fromPeerId === "viewer-1" &&
          message.toPeerId === "host-1"
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
      expect(JSON.stringify(newViewerEvents)).not.toContain("allowed-after-new-authorization-id");
      expect(JSON.stringify(newViewerEvents)).not.toContain("revokedPermissions");
      expect(JSON.stringify(newViewerEvents)).not.toContain("private new-id reset reason");
      expect(newViewerLogs.join("\n")).not.toContain("private new-id reset reason");
      expect(newViewerLogs.join("\n")).not.toContain("raw-token");
    } finally {
      await newViewer?.stop();
      await newAuthorizationServer.stop();
    }
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
      sendRawViewerSignal(rawViewer, blockedPayloadMarker, "authz_before_active");

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
      const authorizationId = await waitForSentActiveAuthorizationId(hostEvents);

      const signalPayloadMarker = "host-accepted-after-active-payload";
      const signalPayload = createRawViewerSignalPayload(signalPayloadMarker, authorizationId);
      sendRawViewerSignal(rawViewer, signalPayloadMarker, authorizationId);

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

  it("ignores inbound viewer signals with missing or mismatched authorization ids after host active authorization", async () => {
    const hostLogs: string[] = [];
    const { relay, hostEvents } = await startRelayAndHost({
      hostDecision: "approve",
      hostLogger: captureLogger(hostLogs),
      visibleToHost: true
    });
    const rawViewer = await startRawViewer(relay.url());

    try {
      sendRawViewerAuthorizationRequest(rawViewer, ["screen:view"]);
      const authorizationId = await waitForSentActiveAuthorizationId(hostEvents);
      const rawCountBefore = hostEvents.filter((event) => event.direction === "raw").length;
      const receivedSignalCountBefore = hostEvents.filter(
        (event) => event.direction === "received" && event.message.type === "signal"
      ).length;

      const relayErrorPromise = waitForRawSocketJsonMessage(
        rawViewer,
        (message) => message.type === "relay-error"
      );
      sendRawViewerSignal(rawViewer, "host-missing-inbound-signal-auth-id");
      const relayError = await relayErrorPromise;
      sendRawViewerSignal(rawViewer, "host-mismatch-inbound-signal-auth-id", "authz_other_signal");
      await waitForRawEventCount(hostEvents, rawCountBefore + 1);
      await delay(100);

      expect(relayError).toEqual({
        type: "relay-error",
        reason: "Invalid relay message"
      });
      expect(
        hostEvents.filter((event) => event.direction === "received" && event.message.type === "signal")
      ).toHaveLength(receivedSignalCountBefore);
      expect(hostLogs.join("\n")).toContain("ignored unsafe inbound protocol message bytes=");
      expect(hostLogs.join("\n")).not.toContain("host-missing-inbound-signal-auth-id");
      expect(hostLogs.join("\n")).not.toContain("host-mismatch-inbound-signal-auth-id");
      expect(hostLogs.join("\n")).not.toContain("authz_other_signal");
      expect(JSON.stringify(hostEvents)).not.toContain("host-missing-inbound-signal-auth-id");
      expect(JSON.stringify(hostEvents)).not.toContain("host-mismatch-inbound-signal-auth-id");

      const allowedPayloadMarker = "host-matching-inbound-signal-auth-id";
      sendRawViewerSignal(rawViewer, allowedPayloadMarker, authorizationId);
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
          byteLength: Buffer.byteLength(
            JSON.stringify(createRawViewerSignalPayload(allowedPayloadMarker, authorizationId))
          )
        }
      });
      expect(JSON.stringify(receivedSignal)).not.toContain(allowedPayloadMarker);
    } finally {
      await closeRawSocket(rawViewer);
    }
  });

  it("ignores inbound host signals with missing or mismatched authorization ids before viewer received events", async () => {
    const viewerLogs: string[] = [];
    const authorizationId = "authz_viewer_signal_binding";
    const missingMarker = "viewer-missing-inbound-signal-auth-id";
    const mismatchedMarker = "viewer-mismatch-inbound-signal-auth-id";
    const allowedMarker = "viewer-matching-inbound-signal-auth-id";
    const lifecycleServer = await startObservedHostViewerAuthorizationLifecycleServer(() => {
      const expiresAt = new Date(Date.now() + 60_000).toISOString();

      return [
        {
          ...createMessageBase("session-demo"),
          type: "relay-ready",
          peerId: "viewer-1",
          roomSize: 2
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-decision",
          authorizationId,
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          decision: "approved",
          grantedPermissions: ["screen:view"],
          expiresAt
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-state",
          authorizationId,
          actorPeerId: "host-1",
          status: "active",
          visibleToHost: true,
          permissions: ["screen:view"],
          expiresAt
        },
        JSON.stringify({
          ...createMessageBase("session-demo"),
          type: "signal",
          fromPeerId: "host-1",
          toPeerId: "viewer-1",
          payload: {
            kind: "host-offer",
            safeMarker: missingMarker
          }
        }),
        {
          ...createMessageBase("session-demo"),
          type: "signal",
          fromPeerId: "host-1",
          toPeerId: "viewer-1",
          payload: {
            authorizationId: "authz_other_signal",
            kind: "host-offer",
            safeMarker: mismatchedMarker
          }
        },
        {
          ...createMessageBase("session-demo"),
          type: "signal",
          fromPeerId: "host-1",
          toPeerId: "viewer-1",
          payload: {
            authorizationId,
            kind: "host-offer",
            safeMarker: allowedMarker
          }
        }
      ];
    });
    const viewerEvents: AgentShellEvent[] = [];
    let viewer: AgentShellRuntime | undefined;

    try {
      viewer = await startViewer(
        lifecycleServer.url,
        ["screen:view"],
        viewerEvents,
        captureLogger(viewerLogs)
      );

      await waitForReceivedActiveAuthorizationId(viewerEvents);
      await waitForRawEventCount(viewerEvents, 2);
      const receivedSignal = await waitForMessage(
        viewerEvents,
        (message) => message.type === "signal" && message.fromPeerId === "host-1"
      );

      expect(receivedSignal).toMatchObject({
        type: "signal",
        fromPeerId: "host-1",
        toPeerId: "viewer-1",
        payload: {
          redacted: "[REDACTED]",
          byteLength: Buffer.byteLength(
            JSON.stringify({
              authorizationId,
              kind: "host-offer",
              safeMarker: allowedMarker
            })
          )
        }
      });
      expect(viewerEvents.filter((event) => event.direction === "raw")).toHaveLength(2);
      expect(viewerEvents.filter((event) => event.direction === "received" && event.message.type === "signal")).toHaveLength(1);
      expect(viewerLogs.join("\n")).toContain("ignored unsafe inbound protocol message bytes=");
      expect(viewerLogs.join("\n")).not.toContain(missingMarker);
      expect(viewerLogs.join("\n")).not.toContain(mismatchedMarker);
      expect(viewerLogs.join("\n")).not.toContain("authz_other_signal");
      expect(JSON.stringify(viewerEvents)).not.toContain(missingMarker);
      expect(JSON.stringify(viewerEvents)).not.toContain(mismatchedMarker);
      expect(JSON.stringify(receivedSignal)).not.toContain(allowedMarker);
    } finally {
      await viewer?.stop();
      await lifecycleServer.stop();
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
        const authorizationId = await waitForSentActiveAuthorizationId(hostEvents);
        await waitForSentMessage(hostEvents, scenario.waitForClosedState);

        const rawCountBefore = hostEvents.filter((event) => event.direction === "raw").length;
        const receivedSignalCountBefore = hostEvents.filter(
          (event) => event.direction === "received" && event.message.type === "signal"
        ).length;
        const blockedPayloadMarker = `host-blocked-after-${scenario.name}-payload`;

        sendRawViewerSignal(rawViewer, blockedPayloadMarker, authorizationId);
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
      await waitForSentActiveAuthorizationId(hostEvents);
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

      sendRawViewerSignal(rawViewerAfterRestart, blockedPayloadMarker, "authz_after_restart_stale");
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

  it("deactivates the host indicator when the host runtime stops", async () => {
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    const activeIndicator = await waitForIndicatorEvent(
      hostEvents,
      (event) => event.state === "active" && event.cause === "activated"
    );
    await host.stop();
    const inactiveIndicator = await waitForIndicatorEvent(
      hostEvents,
      (event) => event.state === "inactive" && event.cause === "runtime-stop"
    );

    expect(inactiveIndicator).toMatchObject({
      direction: "indicator",
      state: "inactive",
      authorizationId: activeIndicator.authorizationId,
      authorizationStatus: "active",
      visibleToHost: false,
      permissionCount: 0,
      cause: "runtime-stop"
    });
  });

  it("deactivates the host indicator when the host socket closes", async () => {
    const socketCloseServer = await startHostSocketCloseAfterActiveServer();
    const hostEvents: AgentShellEvent[] = [];
    const hostLogs: string[] = [];
    let host: AgentShellRuntime | undefined;

    try {
      host = createAgentShellRuntime(createRuntimeOptions({
        relayUrl: socketCloseServer.url,
        hostDecision: "approve",
        logger: captureLogger(hostLogs),
        visibleToHost: true,
        onEvent: (event) => hostEvents.push(event)
      }));
      await host.start();

      const activeIndicator = await waitForIndicatorEvent(
        hostEvents,
        (event) => event.state === "active" && event.cause === "activated"
      );
      const inactiveIndicator = await waitForIndicatorEvent(
        hostEvents,
        (event) => event.state === "inactive" && event.cause === "socket-closed"
      );

      expect(inactiveIndicator).toMatchObject({
        direction: "indicator",
        state: "inactive",
        authorizationId: activeIndicator.authorizationId,
        authorizationStatus: "active",
        visibleToHost: false,
        permissionCount: 0,
        cause: "socket-closed"
      });

      const sentCountAtClose = hostEvents.filter((event) => event.direction === "sent").length;
      const privatePayloadMarker = "post-socket-close-private-signal-marker";
      expect(() =>
        host?.send({
          ...createMessageBase("session-demo"),
          type: "signal",
          fromPeerId: "host-1",
          toPeerId: "viewer-1",
          payload: {
            authorizationId: activeIndicator.authorizationId,
            kind: "offer",
            safeMarker: privatePayloadMarker
          }
        })
      ).toThrow("Agent shell local peer is disconnected");
      expect(hostEvents.filter((event) => event.direction === "sent")).toHaveLength(sentCountAtClose);
      expect(JSON.stringify(hostEvents)).not.toContain(privatePayloadMarker);
      expect(hostLogs.join("\n")).not.toContain(privatePayloadMarker);
    } finally {
      await host?.stop();
      await socketCloseServer.stop();
    }
  });

  it("clears local socket close state across runtime restart", async () => {
    const socketRestartServer = await startFirstSocketCloseThenReadyServer();
    const hostEvents: AgentShellEvent[] = [];
    let host: AgentShellRuntime | undefined;

    try {
      host = createAgentShellRuntime(createRuntimeOptions({
        relayUrl: socketRestartServer.url,
        hostDecision: "approve",
        logger: silentLogger,
        visibleToHost: true,
        onEvent: (event) => hostEvents.push(event)
      }));
      await host.start();
      await waitForClosedEvent(hostEvents);

      expect(() =>
        host?.send({
          ...createMessageBase("session-demo"),
          type: "hello",
          peerId: "host-1",
          role: "host",
          displayName: "Host",
          capabilities: ["agent-shell:test"]
        })
      ).toThrow("Agent shell local peer is disconnected");

      await host.start();
      await waitForReceivedMessageCount(
        hostEvents,
        (message) => message.type === "relay-ready" && message.peerId === "host-1",
        2
      );

      const sentCountBeforePublicSend = hostEvents.filter((event) => event.direction === "sent").length;
      host.send({
        ...createMessageBase("session-demo"),
        type: "hello",
        peerId: "host-1",
        role: "host",
        displayName: "Host",
        capabilities: ["agent-shell:restart"]
      });
      const sentAfterPublicSend = hostEvents.filter((event) => event.direction === "sent");
      expect(sentAfterPublicSend).toHaveLength(sentCountBeforePublicSend + 1);
      expect(sentAfterPublicSend.at(-1)?.message).toMatchObject({
        type: "hello",
        peerId: "host-1",
        role: "host",
        capabilities: ["agent-shell:restart"]
      });
    } finally {
      await host?.stop();
      await socketRestartServer.stop();
    }
  });

  it("closes the host connection through direct local disconnect control after visible pause", async () => {
    const hostLogs: string[] = [];
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
      hostDecision: "approve",
      hostLogger: captureLogger(hostLogs),
      hostPauseAfterMs: 10,
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "paused"
    );
    host.disconnect();

    const closed = await waitForClosedEvent(hostEvents);
    const disconnect = await waitForMessage(
      viewerEvents,
      (message) => message.type === "peer-disconnected"
    );
    const inactiveIndicator = await waitForIndicatorEvent(
      hostEvents,
      (event) => event.state === "inactive" && event.cause === "local-disconnect"
    );
    const sentCountAtDisconnect = hostEvents.filter((event) => event.direction === "sent").length;

    expect(closed).toMatchObject({
      direction: "closed",
      code: 1000,
      reason: "[REDACTED]",
      reasonBytes: Buffer.byteLength("Host disconnect control")
    });
    expect(disconnect).toMatchObject({
      type: "peer-disconnected",
      peerId: "host-1",
      role: "host",
      reasonCode: "peer-closed"
    });
    expect(inactiveIndicator).toMatchObject({
      direction: "indicator",
      state: "inactive",
      authorizationStatus: "paused",
      visibleToHost: false,
      permissionCount: 0,
      cause: "local-disconnect"
    });
    expect(hostEvents.some((event) => event.direction === "sent" && event.message.type === "peer-disconnected")).toBe(
      false
    );
    expect(hostLogs.join("\n")).toContain("disconnect control closing local relay connection");
    expect(() =>
      host.send({
        ...createMessageBase("session-demo"),
        type: "signal",
        fromPeerId: "host-1",
        toPeerId: "viewer-1",
        payload: {
          kind: "offer",
          sdp: "post-direct-disconnect-offer"
        }
      })
    ).toThrow("Agent shell local peer is disconnected");
    expect(hostEvents.filter((event) => event.direction === "sent")).toHaveLength(sentCountAtDisconnect);
    expect(JSON.stringify(hostEvents)).not.toContain("post-direct-disconnect-offer");
  });

  it("rejects direct local disconnect control before visible activation", async () => {
    const hostAuditSink = new MemoryAuditSink();
    const { host, hostEvents } = await startRelayAndHost({
      hostAuditSink
    });

    await waitForMessage(
      hostEvents,
      (message) => message.type === "relay-ready" && message.peerId === "host-1"
    );

    expect(() => host.disconnect()).toThrow(
      "Agent shell local disconnect control requires active visible host authorization"
    );
    await delay(50);

    expect(hostEvents.some((event) => event.direction === "closed")).toBe(false);
    expect(hostAuditSink.records()).toHaveLength(0);
  });

  it("rejects direct local disconnect control for viewer runtimes", async () => {
    const { relay, viewerEvents } = await startRelayAndHost();
    const viewer = await startViewer(relay.url(), [], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) => message.type === "relay-ready" && message.peerId === "viewer-1"
    );

    expect(() => viewer.disconnect()).toThrow(
      "Agent shell local disconnect control is only valid for host runtimes"
    );
    await delay(50);

    expect(viewerEvents.some((event) => event.direction === "closed")).toBe(false);
  });

  it("closes the host connection after visible disconnect simulation", async () => {
    const hostAuditSink = new MemoryAuditSink();
    const hostLogs: string[] = [];
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
      hostAuditSink,
      hostDecision: "approve",
      hostDisconnectAfterMs: 10,
      hostLogger: captureLogger(hostLogs),
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "active"
    );
    const closed = await waitForClosedEvent(hostEvents);
    const disconnect = await waitForMessage(
      viewerEvents,
      (message) => message.type === "peer-disconnected"
    );
    const inactiveIndicator = await waitForIndicatorEvent(
      hostEvents,
      (event) => event.state === "inactive" && event.cause === "local-disconnect"
    );
    const sentCountAtDisconnect = hostEvents.filter((event) => event.direction === "sent").length;

    expect(closed).toMatchObject({
      direction: "closed",
      code: 1000,
      reason: "[REDACTED]",
      reasonBytes: Buffer.byteLength("Host disconnect simulation")
    });
    expect(disconnect).toMatchObject({
      type: "peer-disconnected",
      peerId: "host-1",
      role: "host",
      reasonCode: "peer-closed"
    });
    expect(inactiveIndicator).toMatchObject({
      direction: "indicator",
      state: "inactive",
      authorizationStatus: "active",
      visibleToHost: false,
      permissionCount: 0,
      cause: "local-disconnect"
    });
    expect(hostEvents.some((event) => event.direction === "sent" && event.message.type === "peer-disconnected")).toBe(
      false
    );
    expect(hostAuditSink.records().map((record) => record.action)).toEqual([
      "agent-shell.authorization.approved",
      "agent-shell.authorization.active",
      "agent-shell.session.disconnected"
    ]);
    expect(hostAuditSink.records().at(-1)).toEqual(expect.objectContaining({
      actor: {
        type: "host",
        id: "host-1",
        deviceId: "dev_host_1"
      },
      sessionId: "session-demo",
      action: "agent-shell.session.disconnected",
      outcome: "accepted",
      detail: expect.objectContaining({
        authorizationStatus: "active",
        cause: "local-disconnect",
        visibleToHost: true,
        permissionCount: 1
      })
    }));
    expect(hostEvents.some(
      (event) =>
        event.direction === "sent" &&
        event.message.type === "audit-event" &&
        event.message.action === "agent-shell.session.disconnected"
    )).toBe(false);
    expect(JSON.stringify(hostAuditSink.records())).not.toContain("123-456");
    expect(JSON.stringify(hostAuditSink.records())).not.toContain("Host disconnect simulation");
    expect(hostLogs.join("\n")).toContain("disconnect simulation closing local relay connection");
    expect(() =>
      host.send({
        ...createMessageBase("session-demo"),
        type: "signal",
        fromPeerId: "host-1",
        toPeerId: "viewer-1",
        payload: {
          kind: "offer",
          sdp: "post-local-disconnect-offer"
        }
      })
    ).toThrow("Agent shell local peer is disconnected");
    expect(hostEvents.filter((event) => event.direction === "sent")).toHaveLength(sentCountAtDisconnect);
    expect(JSON.stringify(hostEvents)).not.toContain("post-local-disconnect-offer");
  });

  it("does not run disconnect simulation without visible activation", async () => {
    const hostAuditSink = new MemoryAuditSink();
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost({
      hostAuditSink,
      hostDecision: "approve",
      hostDisconnectAfterMs: 10,
      visibleToHost: false
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-decision" &&
        message.decision === "approved"
    );
    await delay(80);

    expect(hostEvents.some((event) => event.direction === "closed")).toBe(false);
    expect(
      viewerEvents.some(
        (event) => event.direction === "received" && event.message.type === "peer-disconnected"
      )
    ).toBe(false);
    expect(hostAuditSink.records().map((record) => record.action)).toEqual([
      "agent-shell.authorization.approved"
    ]);
    expect(hostAuditSink.records().some(
      (record) => record.action === "agent-shell.session.disconnected"
    )).toBe(false);
  });

  it("closes the host connection when local disconnect audit persistence fails", async () => {
    const backingSink = new MemoryAuditSink();
    const hostLogs: string[] = [];
    const rawErrorMessage = "local disconnect audit sink failed with raw-token";
    const failingSink: AuditSink = {
      write: (input) => {
        if (input.action === "agent-shell.session.disconnected") {
          throw new Error(rawErrorMessage);
        }

        return backingSink.write(input);
      }
    };
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost({
      hostAuditSink: failingSink,
      hostDecision: "approve",
      hostDisconnectAfterMs: 10,
      hostLogger: captureLogger(hostLogs),
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
    const closed = await waitForClosedEvent(hostEvents);
    const disconnect = await waitForMessage(
      viewerEvents,
      (message) => message.type === "peer-disconnected"
    );
    const inactiveIndicator = await waitForIndicatorEvent(
      hostEvents,
      (event) => event.state === "inactive" && event.cause === "local-disconnect"
    );

    expect(errorEvent.error.message).toBe("Agent shell runtime error");
    expect(errorEvent.error.stack).toBeUndefined();
    expect(errorEvent.messageBytes).toBe(Buffer.byteLength(rawErrorMessage));
    expect(closed).toMatchObject({
      direction: "closed",
      code: 1000,
      reason: "[REDACTED]",
      reasonBytes: Buffer.byteLength("Host disconnect simulation")
    });
    expect(disconnect).toMatchObject({
      type: "peer-disconnected",
      peerId: "host-1",
      role: "host",
      reasonCode: "peer-closed"
    });
    expect(inactiveIndicator).toMatchObject({
      direction: "indicator",
      state: "inactive",
      authorizationStatus: "active",
      visibleToHost: false,
      permissionCount: 0,
      cause: "local-disconnect"
    });
    expect(backingSink.records().map((record) => record.action)).toEqual([
      "agent-shell.authorization.approved",
      "agent-shell.authorization.active"
    ]);
    expect(hostLogs.join("\n")).toContain("runtime error messageBytes=");
    expect(hostLogs.join("\n")).toContain("disconnect simulation closing local relay connection");
    expect(hostLogs.join("\n")).not.toContain(rawErrorMessage);
    expect(hostLogs.join("\n")).not.toContain("raw-token");
    expect(JSON.stringify(hostEvents)).not.toContain(rawErrorMessage);
    expect(JSON.stringify(hostEvents)).not.toContain("raw-token");
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

  it("ignores unbound peer-disconnected notices before recording remote disconnect state", async () => {
    const unboundDisconnectServer = await startUnboundPeerDisconnectNoticeServer();
    const hostEvents: AgentShellEvent[] = [];
    const hostLogs: string[] = [];
    let host: AgentShellRuntime | undefined;

    try {
      host = createAgentShellRuntime(createRuntimeOptions({
        relayUrl: unboundDisconnectServer.url,
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
      expect(
        hostEvents.some(
          (event) => event.direction === "received" && event.message.type === "peer-disconnected"
        )
      ).toBe(false);

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
      expect(logOutput).not.toContain("viewer-1");
      expect(logOutput).not.toContain("session-demo");
      expect(serializedRawEvents).not.toContain("peer-disconnected");
      expect(serializedRawEvents).not.toContain("viewer-1");
      expect(serializedRawEvents).not.toContain("session-demo");
    } finally {
      await host?.stop();
      await unboundDisconnectServer.stop();
    }
  });

  it("ignores mismatched peer-disconnected notices without suppressing delayed host workflow", async () => {
    const mismatchedDisconnectServer = await startMismatchedDisconnectAfterHostActiveServer();
    const hostEvents: AgentShellEvent[] = [];
    const hostLogs: string[] = [];
    let host: AgentShellRuntime | undefined;

    try {
      host = createAgentShellRuntime(createRuntimeOptions({
        relayUrl: mismatchedDisconnectServer.url,
        hostDecision: "approve",
        hostRevokeAfterMs: 80,
        hostRevokePermission: "screen:view",
        logger: captureLogger(hostLogs),
        visibleToHost: true,
        onEvent: (event) => hostEvents.push(event)
      }));
      await host.start();

      await waitForSentMessage(
        hostEvents,
        (message) =>
          message.type === "session-authorization-state" &&
          message.status === "active" &&
          message.visibleToHost
      );
      const rawEvent = await waitForRawEvent(hostEvents);
      await delay(40);

      expect(rawEvent).toMatchObject({
        direction: "raw",
        text: "[REDACTED]",
        byteLength: expect.any(Number)
      });
      expect(
        hostEvents.some(
          (event) => event.direction === "received" && event.message.type === "peer-disconnected"
        )
      ).toBe(false);
      expect(
        hostEvents.some(
          (event) =>
            event.direction === "indicator" &&
            event.state === "inactive" &&
            event.cause === "peer-disconnected"
        )
      ).toBe(false);

      const revokeControl = await waitForSentMessage(
        hostEvents,
        (message) => message.type === "session-control" && message.action === "revoke-permission"
      );
      const revoked = await waitForSentMessage(
        hostEvents,
        (message) => message.type === "permission-revoked"
      );

      expect(revokeControl).toMatchObject({
        type: "session-control",
        action: "revoke-permission",
        permission: "screen:view"
      });
      expect(revoked).toMatchObject({
        type: "permission-revoked",
        revokedPermission: "screen:view"
      });
      expect(
        hostEvents.some(
          (event) =>
            event.direction === "indicator" &&
            event.state === "inactive" &&
            event.cause === "revoked"
        )
      ).toBe(true);

      const serializedRawEvents = JSON.stringify(hostEvents.filter((event) => event.direction === "raw"));
      const logOutput = hostLogs.join("\n");
      expect(logOutput).toContain("ignored unsafe inbound protocol message bytes=");
      expect(logOutput).not.toContain("peer-disconnected");
      expect(logOutput).not.toContain("viewer-2");
      expect(logOutput).not.toContain("session-demo");
      expect(serializedRawEvents).not.toContain("peer-disconnected");
      expect(serializedRawEvents).not.toContain("viewer-2");
      expect(serializedRawEvents).not.toContain("session-demo");
    } finally {
      await host?.stop();
      await mismatchedDisconnectServer.stop();
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
    const inactiveIndicator = await waitForIndicatorEvent(
      hostEvents,
      (event) => event.state === "inactive" && event.cause === "peer-disconnected"
    );
    const eventCountAtDisconnect = hostEvents.length;
    await delay(260);

    const sentAfterDisconnect = hostEvents
      .slice(eventCountAtDisconnect)
      .filter((event) => event.direction === "sent");

    expect(sentAfterDisconnect).toHaveLength(0);
    expect(inactiveIndicator).toMatchObject({
      direction: "indicator",
      state: "inactive",
      authorizationStatus: "active",
      visibleToHost: false,
      permissionCount: 0,
      cause: "peer-disconnected"
    });
    expect(hostLogs.join("\n")).toContain("skipped because peer disconnected");
  });

  it("suppresses delayed host workflow messages after local disconnect simulation", async () => {
    const hostLogs: string[] = [];
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost({
      authorizationTtlMs: 70,
      hostDecision: "approve",
      hostDisconnectAfterMs: 10,
      hostLogger: captureLogger(hostLogs),
      hostPauseAfterMs: 50,
      hostRevokeAfterMs: 40,
      hostRevokePermission: "screen:view",
      hostTerminateAfterMs: 60,
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "active"
    );
    await waitForMessage(viewerEvents, (message) => message.type === "peer-disconnected");
    const eventCountAtDisconnect = hostEvents.length;
    await delay(100);

    const sentAfterDisconnect = hostEvents
      .slice(eventCountAtDisconnect)
      .filter((event) => event.direction === "sent");

    expect(sentAfterDisconnect).toHaveLength(0);
    expect(hostLogs.join("\n")).toContain("skipped because local peer disconnected");
    expect(
      [...hostEvents, ...viewerEvents].some(
        (event) =>
          (event.direction === "sent" || event.direction === "received") &&
          (event.message.type === "permission-revoked" ||
            event.message.type === "session-control" ||
            (event.message.type === "session-authorization-state" &&
              event.message.status !== "active") ||
            (event.message.type === "audit-event" &&
              [
                "agent-shell.permission.revoked",
                "agent-shell.authorization.paused",
                "agent-shell.authorization.terminated",
                "agent-shell.authorization.expired"
              ].includes(event.message.action)))
      )
    ).toBe(false);
  });

  it("suppresses delayed host workflow messages after direct local disconnect control", async () => {
    const hostLogs: string[] = [];
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
      authorizationTtlMs: 90,
      hostDecision: "approve",
      hostLogger: captureLogger(hostLogs),
      hostPauseAfterMs: 50,
      hostRevokeAfterMs: 40,
      hostRevokePermission: "screen:view",
      hostTerminateAfterMs: 60,
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "active"
    );
    host.disconnect();
    await waitForMessage(viewerEvents, (message) => message.type === "peer-disconnected");
    const eventCountAtDisconnect = hostEvents.length;
    await delay(120);

    const sentAfterDisconnect = hostEvents
      .slice(eventCountAtDisconnect)
      .filter((event) => event.direction === "sent");

    expect(sentAfterDisconnect).toHaveLength(0);
    expect(hostLogs.join("\n")).toContain("skipped because local peer disconnected");
    expect(
      [...hostEvents, ...viewerEvents].some(
        (event) =>
          (event.direction === "sent" || event.direction === "received") &&
          (event.message.type === "permission-revoked" ||
            event.message.type === "session-control" ||
            (event.message.type === "session-authorization-state" &&
              event.message.status !== "active") ||
            (event.message.type === "audit-event" &&
              [
                "agent-shell.permission.revoked",
                "agent-shell.authorization.paused",
                "agent-shell.authorization.terminated",
                "agent-shell.authorization.expired"
              ].includes(event.message.action)))
      )
    ).toBe(false);
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

    const authorizationId = await waitForSentActiveAuthorizationId(hostEvents);
    host.send({
      ...createMessageBase("session-demo"),
      type: "signal",
      fromPeerId: "host-1",
      toPeerId: "viewer-1",
      payload: {
        authorizationId,
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

  it("blocks public hello sends with malformed capabilities before socket write or sent events", async () => {
    const cases: Array<{
      name: string;
      capabilities: string[];
      privateMarker: string;
    }> = [
      {
        name: "untrimmed capability",
        capabilities: ["agent-shell:test", "capability-public-private-marker "],
        privateMarker: "capability-public-private-marker"
      },
      {
        name: "trim-duplicate capability",
        capabilities: ["agent-shell:test", "agent-shell:test "],
        privateMarker: "agent-shell:test "
      },
      {
        name: "control-character capability",
        capabilities: ["agent-shell:test", "capability\npublic-private-marker"],
        privateMarker: "public-private-marker"
      },
      {
        name: "bidi-control capability",
        capabilities: ["agent-shell:test", "capability\u202epublic-private-marker"],
        privateMarker: "public-private-marker"
      },
      {
        name: "zero-width capability",
        capabilities: ["agent-shell:test", "capability\ufeffpublic-private-marker"],
        privateMarker: "public-private-marker"
      }
    ];

    for (const { capabilities, name, privateMarker } of cases) {
      const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost();
      await startViewer(relay.url(), [], viewerEvents);
      await waitForMessage(hostEvents, (message) => message.type === "hello");
      await waitForMessage(viewerEvents, (message) => message.type === "hello");

      const sentCountBefore = hostEvents.filter((event) => event.direction === "sent").length;
      const viewerReceivedHelloCountBefore = viewerEvents.filter(
        (event) => event.direction === "received" && event.message.type === "hello"
      ).length;

      let blockedError: unknown;
      try {
        host.send({
          ...createMessageBase("session-demo"),
          type: "hello",
          peerId: "host-1",
          role: "host",
          displayName: "Host Private Display",
          capabilities
        } as ProtocolEnvelope)
      } catch (error) {
        blockedError = error;
      }

      expect(blockedError, name).toBeInstanceOf(Error);

      await delay(50);

      expect(hostEvents.filter((event) => event.direction === "sent"), name).toHaveLength(sentCountBefore);
      expect(
        viewerEvents.filter((event) => event.direction === "received" && event.message.type === "hello"),
        name
      ).toHaveLength(viewerReceivedHelloCountBefore);
      expect((blockedError as Error).message, name).not.toContain(privateMarker);
      expect(JSON.stringify(hostEvents), name).not.toContain(privateMarker);
      expect(JSON.stringify(viewerEvents), name).not.toContain(privateMarker);
      for (const capability of capabilities) {
        expect((blockedError as Error).message, name).not.toContain(capability);
        expect(JSON.stringify(hostEvents), name).not.toContain(capability);
        expect(JSON.stringify(viewerEvents), name).not.toContain(capability);
      }
      expect(JSON.stringify(hostEvents), name).not.toContain("Host Private Display");
      expect(JSON.stringify(viewerEvents), name).not.toContain("Host Private Display");
    }
  });

  it("blocks public hello sends with untrimmed display names before socket write or sent events", async () => {
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost();
    await startViewer(relay.url(), [], viewerEvents);
    await waitForMessage(hostEvents, (message) => message.type === "hello");
    await waitForMessage(viewerEvents, (message) => message.type === "hello");

    const privateMarker = "Host Private Display";
    const sentCountBefore = hostEvents.filter((event) => event.direction === "sent").length;
    const viewerReceivedHelloCountBefore = viewerEvents.filter(
      (event) => event.direction === "received" && event.message.type === "hello"
    ).length;

    let blockedError: unknown;
    try {
      host.send({
        ...createMessageBase("session-demo"),
        type: "hello",
        peerId: "host-1",
        role: "host",
        displayName: ` ${privateMarker} `,
        capabilities: ["agent-shell:test"]
      } as ProtocolEnvelope);
    } catch (error) {
      blockedError = error;
    }

    await delay(50);

    expect(blockedError).toBeInstanceOf(Error);
    expect(String(blockedError)).not.toContain(privateMarker);
    expect(hostEvents.filter((event) => event.direction === "sent")).toHaveLength(sentCountBefore);
    expect(
      viewerEvents.filter((event) => event.direction === "received" && event.message.type === "hello")
    ).toHaveLength(viewerReceivedHelloCountBefore);
    expect(JSON.stringify(hostEvents)).not.toContain(privateMarker);
    expect(JSON.stringify(viewerEvents)).not.toContain(privateMarker);
  });

  it("blocks public hello sends with control-character display names before socket write or sent events", async () => {
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost();
    await startViewer(relay.url(), [], viewerEvents);
    await waitForMessage(hostEvents, (message) => message.type === "hello");
    await waitForMessage(viewerEvents, (message) => message.type === "hello");

    const privateMarker = "Host Private Display";
    const sentCountBefore = hostEvents.filter((event) => event.direction === "sent").length;
    const viewerReceivedHelloCountBefore = viewerEvents.filter(
      (event) => event.direction === "received" && event.message.type === "hello"
    ).length;

    let blockedError: unknown;
    try {
      host.send({
        ...createMessageBase("session-demo"),
        type: "hello",
        peerId: "host-1",
        role: "host",
        displayName: `${privateMarker}\nControl`,
        capabilities: ["agent-shell:test"]
      } as ProtocolEnvelope);
    } catch (error) {
      blockedError = error;
    }

    await delay(50);

    expect(blockedError).toBeInstanceOf(Error);
    expect(String(blockedError)).not.toContain(privateMarker);
    expect(hostEvents.filter((event) => event.direction === "sent")).toHaveLength(sentCountBefore);
    expect(
      viewerEvents.filter((event) => event.direction === "received" && event.message.type === "hello")
    ).toHaveLength(viewerReceivedHelloCountBefore);
    expect(JSON.stringify(hostEvents)).not.toContain(privateMarker);
    expect(JSON.stringify(viewerEvents)).not.toContain(privateMarker);
  });

  it("blocks public hello sends with bidi-control display names before socket write or sent events", async () => {
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost();
    await startViewer(relay.url(), [], viewerEvents);
    await waitForMessage(hostEvents, (message) => message.type === "hello");
    await waitForMessage(viewerEvents, (message) => message.type === "hello");

    const privateMarker = "Host Private Display";
    const sentCountBefore = hostEvents.filter((event) => event.direction === "sent").length;
    const viewerReceivedHelloCountBefore = viewerEvents.filter(
      (event) => event.direction === "received" && event.message.type === "hello"
    ).length;

    let blockedError: unknown;
    try {
      host.send({
        ...createMessageBase("session-demo"),
        type: "hello",
        peerId: "host-1",
        role: "host",
        displayName: `${privateMarker}\u202eControl`,
        capabilities: ["agent-shell:test"]
      } as ProtocolEnvelope);
    } catch (error) {
      blockedError = error;
    }

    await delay(50);

    expect(blockedError).toBeInstanceOf(Error);
    expect(String(blockedError)).not.toContain(privateMarker);
    expect(hostEvents.filter((event) => event.direction === "sent")).toHaveLength(sentCountBefore);
    expect(
      viewerEvents.filter((event) => event.direction === "received" && event.message.type === "hello")
    ).toHaveLength(viewerReceivedHelloCountBefore);
    expect(JSON.stringify(hostEvents)).not.toContain(privateMarker);
    expect(JSON.stringify(viewerEvents)).not.toContain(privateMarker);
  });

  it("blocks public sends with unknown fixed fields before socket write or sent events", async () => {
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost();
    const viewerLogs: string[] = [];
    const viewer = await startViewer(
      relay.url(),
      ["screen:view"],
      viewerEvents,
      captureLogger(viewerLogs)
    );
    await waitForMessage(hostEvents, (message) => message.type === "session-authorization-request");

    const privateMarker = "agent-public-send-unknown-fixed-field-private-marker";
    const sentCountBefore = viewerEvents.filter((event) => event.direction === "sent").length;
    const receivedRequestCountBefore = hostEvents.filter(
      (event) => event.direction === "received" && event.message.type === "session-authorization-request"
    ).length;

    expect(() =>
      viewer.send({
        ...createMessageBase("session-demo"),
        type: "session-authorization-request",
        viewerPeerId: "viewer-1",
        requestedPermissions: ["screen:view"],
        reason: "Viewer requested access",
        unknownFixedField: privateMarker
      } as unknown as ProtocolEnvelope)
    ).toThrow();

    await delay(50);

    expect(viewerEvents.filter((event) => event.direction === "sent")).toHaveLength(sentCountBefore);
    expect(
      hostEvents.filter(
        (event) => event.direction === "received" && event.message.type === "session-authorization-request"
      )
    ).toHaveLength(receivedRequestCountBefore);
    expect(JSON.stringify(viewerEvents)).not.toContain(privateMarker);
    expect(JSON.stringify(hostEvents)).not.toContain(privateMarker);
    expect(viewerLogs.join("\n")).not.toContain(privateMarker);
    expect(viewerLogs.join("\n")).not.toContain("unknownFixedField");
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
          event.message.type === "session-authorization-decision" &&
          event.message.decision === "denied"
      )
    ).toBe(false);
    expect(
      viewerEvents.some(
        (event) =>
          event.direction === "received" &&
          event.message.type === "audit-event" &&
          event.message.action === "agent-shell.authorization.denied"
      )
    ).toBe(false);
    expect(
      hostEvents.some(
        (event) =>
          event.direction === "sent" &&
          ((event.message.type === "session-authorization-decision" &&
            event.message.decision === "denied") ||
            (event.message.type === "audit-event" &&
              event.message.action === "agent-shell.authorization.denied"))
      )
    ).toBe(false);
  });

  it("withholds active state when active audit persistence fails", async () => {
    const backingSink = new MemoryAuditSink();
    const rawErrorMessage = "active audit sink failed with raw-token";
    const failingSink: AuditSink = {
      write: (input) => {
        if (input.action === "agent-shell.authorization.active") {
          throw new Error(rawErrorMessage);
        }

        return backingSink.write(input);
      }
    };
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
      hostAuditSink: failingSink,
      hostDecision: "approve",
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-decision" &&
        message.decision === "approved"
    );
    const errorEvent = await waitForRuntimeError(hostEvents);
    await delay(50);

    expect(errorEvent.error.message).toBe("Agent shell runtime error");
    expect(errorEvent.messageBytes).toBe(Buffer.byteLength(rawErrorMessage));
    expect(backingSink.records().map((record) => record.action)).toEqual([
      "agent-shell.authorization.approved"
    ]);
    expect(
      viewerEvents.some(
        (event) =>
          event.direction === "received" &&
          event.message.type === "session-authorization-state" &&
          event.message.status === "active"
      )
    ).toBe(false);
    expect(
      viewerEvents.some(
        (event) =>
          event.direction === "received" &&
          event.message.type === "audit-event" &&
          event.message.action === "agent-shell.authorization.active"
      )
    ).toBe(false);
    expect(() =>
      host.send({
        ...createMessageBase("session-demo"),
        type: "signal",
        fromPeerId: "host-1",
        toPeerId: "viewer-1",
        payload: {
          kind: "offer",
          sdp: "blocked-active-audit-failure"
        }
      })
    ).toThrow("Agent shell signal requires active visible screen authorization");
    expect(JSON.stringify(hostEvents)).not.toContain("blocked-active-audit-failure");
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
    expect(
      hostEvents.some(
        (event) =>
          event.direction === "sent" &&
          (event.message.type === "permission-revoked" ||
            (event.message.type === "session-authorization-state" &&
              event.message.status === "revoked") ||
            (event.message.type === "audit-event" &&
              event.message.action === "agent-shell.permission.revoked"))
      )
    ).toBe(false);
  });

  it("does not send direct revoke messages when revoke audit persistence fails", async () => {
    const backingSink = new MemoryAuditSink();
    const hostLogs: string[] = [];
    const rawErrorMessage = "direct revoke audit sink failed with raw-token";
    const failingSink: AuditSink = {
      write: (input) => {
        if (input.action === "agent-shell.permission.revoked") {
          throw new Error(rawErrorMessage);
        }

        return backingSink.write(input);
      }
    };
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
      hostAuditSink: failingSink,
      hostDecision: "approve",
      hostLogger: captureLogger(hostLogs),
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "active"
    );
    expect(() => host.revokePermission("screen:view")).toThrow("Agent shell runtime error");
    const errorEvent = await waitForRuntimeError(hostEvents);
    await delay(50);

    const protocolEvents = [...hostEvents, ...viewerEvents].filter(
      (event): event is Extract<AgentShellEvent, { direction: "received" | "sent" }> =>
        event.direction === "received" || event.direction === "sent"
    );

    expect(errorEvent.error.message).toBe("Agent shell runtime error");
    expect(errorEvent.error.stack).toBeUndefined();
    expect(errorEvent.messageBytes).toBe(Buffer.byteLength(rawErrorMessage));
    expect(JSON.stringify(errorEvent)).not.toContain(rawErrorMessage);
    expect(hostLogs.join("\n")).not.toContain(rawErrorMessage);
    expect(hostLogs.join("\n")).not.toContain("raw-token");
    expect(backingSink.records().map((record) => record.action)).toEqual([
      "agent-shell.authorization.approved",
      "agent-shell.authorization.active"
    ]);
    expect(
      protocolEvents.some(
        (event) =>
          event.message.type === "permission-revoked" ||
          (event.message.type === "session-control" &&
            event.message.action === "revoke-permission") ||
          (event.message.type === "session-authorization-state" &&
            event.message.status === "revoked") ||
          (event.message.type === "audit-event" &&
            event.message.action === "agent-shell.permission.revoked")
      )
    ).toBe(false);
  });

  it.each([
    [
      "pause",
      "agent-shell.authorization.paused",
      { hostPauseAfterMs: 10 },
      (message: AgentShellReceivedProtocolEnvelope | AgentShellSentProtocolEnvelope) =>
        (message.type === "session-control" && message.action === "pause") ||
        (message.type === "session-authorization-state" && message.status === "paused") ||
        (message.type === "audit-event" && message.action === "agent-shell.authorization.paused")
    ],
    [
      "termination",
      "agent-shell.authorization.terminated",
      { hostTerminateAfterMs: 10 },
      (message: AgentShellReceivedProtocolEnvelope | AgentShellSentProtocolEnvelope) =>
        (message.type === "session-control" && message.action === "terminate") ||
        (message.type === "session-authorization-state" && message.status === "terminated") ||
        (message.type === "audit-event" && message.action === "agent-shell.authorization.terminated")
    ],
    [
      "expiration",
      "agent-shell.authorization.expired",
      { authorizationTtlMs: 10 },
      (message: AgentShellReceivedProtocolEnvelope | AgentShellSentProtocolEnvelope) =>
        (message.type === "session-authorization-state" && message.status === "expired") ||
        (message.type === "audit-event" && message.action === "agent-shell.authorization.expired")
    ]
  ])(
    "does not send %s lifecycle messages when audit persistence fails",
    async (_name, failingAction, lifecycleOptions, blockedMessage) => {
      const backingSink = new MemoryAuditSink();
      const hostLogs: string[] = [];
      const rawErrorMessage = `${failingAction} failed with raw-token`;
      const failingSink: AuditSink = {
        write: (input) => {
          if (input.action === failingAction) {
            throw new Error(rawErrorMessage);
          }

          return backingSink.write(input);
        }
      };
      const { relay, hostEvents, viewerEvents } = await startRelayAndHost({
        ...lifecycleOptions,
        hostAuditSink: failingSink,
        hostDecision: "approve",
        hostLogger: captureLogger(hostLogs),
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

      const protocolEvents = [...hostEvents, ...viewerEvents].filter(
        (event): event is Extract<AgentShellEvent, { direction: "received" | "sent" }> =>
          event.direction === "received" || event.direction === "sent"
      );

      expect(errorEvent.error.message).toBe("Agent shell runtime error");
      expect(errorEvent.messageBytes).toBe(Buffer.byteLength(rawErrorMessage));
      expect(hostLogs.join("\n")).not.toContain(rawErrorMessage);
      expect(hostLogs.join("\n")).not.toContain("raw-token");
      expect(backingSink.records().map((record) => record.action)).toEqual([
        "agent-shell.authorization.approved",
        "agent-shell.authorization.active"
      ]);
      expect(protocolEvents.some((event) => blockedMessage(event.message))).toBe(false);
    }
  );

  it("does not send resume messages when resume audit persistence fails", async () => {
    const backingSink = new MemoryAuditSink();
    const rawErrorMessage = "resume audit sink failed with raw-token";
    const failingSink: AuditSink = {
      write: (input) => {
        if (input.action === "agent-shell.authorization.resumed") {
          throw new Error(rawErrorMessage);
        }

        return backingSink.write(input);
      }
    };
    const { relay, hostEvents, viewerEvents } = await startRelayAndHost({
      hostAuditSink: failingSink,
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
        message.action === "agent-shell.authorization.paused"
    );
    const errorEvent = await waitForRuntimeError(hostEvents);
    await delay(50);

    const protocolEvents = [...hostEvents, ...viewerEvents].filter(
      (event): event is Extract<AgentShellEvent, { direction: "received" | "sent" }> =>
        event.direction === "received" || event.direction === "sent"
    );
    const viewerActiveStates = viewerEvents.filter(
      (event) =>
        event.direction === "received" &&
        event.message.type === "session-authorization-state" &&
        event.message.status === "active"
    );

    expect(errorEvent.error.message).toBe("Agent shell runtime error");
    expect(errorEvent.messageBytes).toBe(Buffer.byteLength(rawErrorMessage));
    expect(backingSink.records().map((record) => record.action)).toEqual([
      "agent-shell.authorization.approved",
      "agent-shell.authorization.active",
      "agent-shell.authorization.paused"
    ]);
    expect(viewerActiveStates).toHaveLength(1);
    expect(
      protocolEvents.some(
        (event) =>
          (event.message.type === "session-control" && event.message.action === "resume") ||
          (event.message.type === "audit-event" &&
            event.message.action === "agent-shell.authorization.resumed")
      )
    ).toBe(false);
  });

  it("does not send direct pause messages when pause audit persistence fails", async () => {
    const backingSink = new MemoryAuditSink();
    const hostLogs: string[] = [];
    const rawErrorMessage = "direct pause audit sink failed with raw-token";
    const failingSink: AuditSink = {
      write: (input) => {
        if (input.action === "agent-shell.authorization.paused") {
          throw new Error(rawErrorMessage);
        }

        return backingSink.write(input);
      }
    };
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
      hostAuditSink: failingSink,
      hostDecision: "approve",
      hostLogger: captureLogger(hostLogs),
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "active"
    );
    expect(() => host.pause()).toThrow("Agent shell runtime error");
    const errorEvent = await waitForRuntimeError(hostEvents);
    await delay(50);

    const protocolEvents = [...hostEvents, ...viewerEvents].filter(
      (event): event is Extract<AgentShellEvent, { direction: "received" | "sent" }> =>
        event.direction === "received" || event.direction === "sent"
    );

    expect(errorEvent.error.message).toBe("Agent shell runtime error");
    expect(errorEvent.error.stack).toBeUndefined();
    expect(errorEvent.messageBytes).toBe(Buffer.byteLength(rawErrorMessage));
    expect(JSON.stringify(errorEvent)).not.toContain(rawErrorMessage);
    expect(hostLogs.join("\n")).not.toContain(rawErrorMessage);
    expect(hostLogs.join("\n")).not.toContain("raw-token");
    expect(backingSink.records().map((record) => record.action)).toEqual([
      "agent-shell.authorization.approved",
      "agent-shell.authorization.active"
    ]);
    expect(
      protocolEvents.some(
        (event) =>
          (event.message.type === "session-control" && event.message.action === "pause") ||
          (event.message.type === "session-authorization-state" &&
            event.message.status === "paused") ||
          (event.message.type === "audit-event" &&
            event.message.action === "agent-shell.authorization.paused")
      )
    ).toBe(false);
  });

  it("does not send direct resume messages when resume audit persistence fails", async () => {
    const backingSink = new MemoryAuditSink();
    const rawErrorMessage = "direct resume audit sink failed with raw-token";
    const failingSink: AuditSink = {
      write: (input) => {
        if (input.action === "agent-shell.authorization.resumed") {
          throw new Error(rawErrorMessage);
        }

        return backingSink.write(input);
      }
    };
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
      hostAuditSink: failingSink,
      hostDecision: "approve",
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "active"
    );
    host.pause();
    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "audit-event" &&
        message.action === "agent-shell.authorization.paused"
    );
    expect(() => host.resume()).toThrow("Agent shell runtime error");
    const errorEvent = await waitForRuntimeError(hostEvents);
    await delay(50);

    const protocolEvents = [...hostEvents, ...viewerEvents].filter(
      (event): event is Extract<AgentShellEvent, { direction: "received" | "sent" }> =>
        event.direction === "received" || event.direction === "sent"
    );
    const viewerActiveStates = viewerEvents.filter(
      (event) =>
        event.direction === "received" &&
        event.message.type === "session-authorization-state" &&
        event.message.status === "active"
    );

    expect(errorEvent.error.message).toBe("Agent shell runtime error");
    expect(errorEvent.error.stack).toBeUndefined();
    expect(errorEvent.messageBytes).toBe(Buffer.byteLength(rawErrorMessage));
    expect(JSON.stringify(errorEvent)).not.toContain(rawErrorMessage);
    expect(backingSink.records().map((record) => record.action)).toEqual([
      "agent-shell.authorization.approved",
      "agent-shell.authorization.active",
      "agent-shell.authorization.paused"
    ]);
    expect(viewerActiveStates).toHaveLength(1);
    expect(
      protocolEvents.some(
        (event) =>
          (event.message.type === "session-control" && event.message.action === "resume") ||
          (event.message.type === "audit-event" &&
            event.message.action === "agent-shell.authorization.resumed")
      )
    ).toBe(false);
  });

  it("does not send direct terminate messages when terminate audit persistence fails", async () => {
    const backingSink = new MemoryAuditSink();
    const hostLogs: string[] = [];
    const rawErrorMessage = "direct terminate audit sink failed with raw-token";
    const failingSink: AuditSink = {
      write: (input) => {
        if (input.action === "agent-shell.authorization.terminated") {
          throw new Error(rawErrorMessage);
        }

        return backingSink.write(input);
      }
    };
    const { relay, host, hostEvents, viewerEvents } = await startRelayAndHost({
      hostAuditSink: failingSink,
      hostDecision: "approve",
      hostLogger: captureLogger(hostLogs),
      visibleToHost: true
    });
    await startViewer(relay.url(), ["screen:view"], viewerEvents);

    await waitForMessage(
      viewerEvents,
      (message) =>
        message.type === "session-authorization-state" &&
        message.status === "active"
    );
    expect(() => host.terminate()).toThrow("Agent shell runtime error");
    const errorEvent = await waitForRuntimeError(hostEvents);
    await delay(50);

    const protocolEvents = [...hostEvents, ...viewerEvents].filter(
      (event): event is Extract<AgentShellEvent, { direction: "received" | "sent" }> =>
        event.direction === "received" || event.direction === "sent"
    );

    expect(errorEvent.error.message).toBe("Agent shell runtime error");
    expect(errorEvent.error.stack).toBeUndefined();
    expect(errorEvent.messageBytes).toBe(Buffer.byteLength(rawErrorMessage));
    expect(JSON.stringify(errorEvent)).not.toContain(rawErrorMessage);
    expect(hostLogs.join("\n")).not.toContain(rawErrorMessage);
    expect(hostLogs.join("\n")).not.toContain("raw-token");
    expect(backingSink.records().map((record) => record.action)).toEqual([
      "agent-shell.authorization.approved",
      "agent-shell.authorization.active"
    ]);
    expect(
      protocolEvents.some(
        (event) =>
          (event.message.type === "session-control" && event.message.action === "terminate") ||
          (event.message.type === "session-authorization-state" &&
            event.message.status === "terminated") ||
          (event.message.type === "audit-event" &&
            event.message.action === "agent-shell.authorization.terminated")
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

  it("uses websocket payload bytes for binary non-protocol messages", async () => {
    const binaryPayload = Buffer.concat([
      Buffer.from([0xff, 0xfe, 0xfd]),
      Buffer.from("raw-binary-token", "utf8")
    ]);
    const nonProtocolServer = await startNonProtocolMessageServer(binaryPayload);
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

      expect(rawEvent).toMatchObject({
        direction: "raw",
        text: "[REDACTED]",
        byteLength: binaryPayload.byteLength
      });
      expect(logOutput).toContain(`received non-protocol message bytes=${binaryPayload.byteLength}`);
      expect(JSON.stringify(rawEvent)).not.toContain("raw-binary-token");
      expect(logOutput).not.toContain("raw-binary-token");
    } finally {
      await host?.stop();
      await nonProtocolServer.stop();
    }
  });

  it("emits closed events without raw websocket close reason text", async () => {
    const privateCloseReason = "private close token raw-close-token строка";
    const closeServer = await startCloseReasonServer(privateCloseReason);
    const closeEvents: AgentShellEvent[] = [];
    const closeLogs: string[] = [];
    const privateCloseReasonBytes = Buffer.byteLength(privateCloseReason);

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
        reasonBytes: privateCloseReasonBytes
      });
      expect(JSON.stringify(closedEvent)).not.toContain(privateCloseReason);
      expect(JSON.stringify(closedEvent)).not.toContain("raw-close-token");
      expect(logOutput).toContain(`disconnected code=4000 reasonBytes=${privateCloseReasonBytes}`);
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
  hostDisconnectAfterMs?: number;
  hostDisplayName?: string;
  hostDecisionProvider?: HostDecisionProvider;
  hostConsentTimeoutMs?: number;
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
    hostDecisionProvider: options.hostDecisionProvider,
    hostConsentTimeoutMs: options.hostConsentTimeoutMs,
    hostDisconnectAfterMs: options.hostDisconnectAfterMs,
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
  displayName = "Viewer",
  options: Pick<AgentShellRuntimeOptions, "viewerSignalProbeAfterMs"> = {}
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
    viewerSignalProbeAfterMs: options.viewerSignalProbeAfterMs,
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
    type: "hello",
    peerId: "viewer-1",
    role: "viewer",
    displayName: "Raw Viewer",
    capabilities: ["session:visible", "consent:required", "audit:stdout"]
  }));
  socket.send(encodeProtocolEnvelope({
    ...createMessageBase("session-demo"),
    type: "session-authorization-request",
    viewerPeerId: "viewer-1",
    requestedPermissions,
    reason: "Raw viewer authorization request"
  }));
}

function sendRawViewerSignal(
  socket: WebSocket,
  payloadMarker: string,
  authorizationId?: string
): void {
  socket.send(JSON.stringify({
    ...createMessageBase("session-demo"),
    type: "signal",
    fromPeerId: "viewer-1",
    toPeerId: "host-1",
    payload: createRawViewerSignalPayload(payloadMarker, authorizationId)
  }));
}

function createRawViewerSignalPayload(
  payloadMarker: string,
  authorizationId?: string
): Record<string, unknown> {
  return {
    ...(authorizationId ? { authorizationId } : {}),
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
  return waitForRawSocketJsonMessage(
    socket,
    (message) => predicate(message as ProtocolEnvelope)
  ) as Promise<ProtocolEnvelope>;
}

function waitForRawSocketJsonMessage(
  socket: WebSocket,
  predicate: (message: Record<string, unknown>) => boolean
): Promise<Record<string, unknown>> {
  return withTimeout(
    new Promise((resolve) => {
      const onMessage = (data: RawData) => {
        const parsed = JSON.parse(data.toString()) as Record<string, unknown>;

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

function waitForReceivedMessageCount(
  events: AgentShellEvent[],
  predicate: (message: AgentShellReceivedProtocolEnvelope) => boolean,
  count: number
): Promise<AgentShellReceivedProtocolEnvelope[]> {
  return withTimeout(
    new Promise((resolve) => {
      const interval = setInterval(() => {
        const matches = events.filter(
          (event): event is Extract<AgentShellEvent, { direction: "received" }> =>
            event.direction === "received" && predicate(event.message)
        );

        if (matches.length >= count) {
          clearInterval(interval);
          resolve(matches.slice(0, count).map((event) => event.message));
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

async function waitForSentActiveAuthorizationId(events: AgentShellEvent[]): Promise<string> {
  const message = await waitForSentMessage(
    events,
    (candidate) =>
      candidate.type === "session-authorization-state" &&
      candidate.status === "active" &&
      candidate.visibleToHost
  );

  if (message.type !== "session-authorization-state") {
    throw new Error("Expected sent active authorization state");
  }

  return message.authorizationId;
}

async function waitForReceivedActiveAuthorizationId(events: AgentShellEvent[]): Promise<string> {
  const message = await waitForMessage(
    events,
    (candidate) =>
      candidate.type === "session-authorization-state" &&
      candidate.status === "active" &&
      candidate.visibleToHost
  );

  if (message.type !== "session-authorization-state") {
    throw new Error("Expected received active authorization state");
  }

  return message.authorizationId;
}

function waitForIndicatorEvent(
  events: AgentShellEvent[],
  predicate: (event: AgentShellHostIndicatorEvent) => boolean
): Promise<AgentShellHostIndicatorEvent> {
  return withTimeout(
    new Promise((resolve) => {
      const interval = setInterval(() => {
        const match = events.find(
          (event): event is AgentShellHostIndicatorEvent =>
            event.direction === "indicator" && predicate(event)
        );

        if (match) {
          clearInterval(interval);
          resolve(match);
        }
      }, 5);
    })
  );
}

function messageIndex(events: AgentShellEvent[], message: AgentShellReceivedProtocolEnvelope): number {
  return events.findIndex((event) => event.direction === "received" && event.message === message);
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

function createLateSensitiveAgentSignalPayloadProxy(authorizationId: string): Record<string, unknown> {
  let ownKeysCalls = 0;

  return new Proxy(
    {},
    {
      getPrototypeOf: () => Object.prototype,
      ownKeys: () => {
        ownKeysCalls += 1;
        return ownKeysCalls > 6
          ? ["authorizationId", "kind", "screenContent"]
          : ["authorizationId", "kind"];
      },
      getOwnPropertyDescriptor: (_target, key) => {
        if (key === "authorizationId") {
          return {
            configurable: true,
            enumerable: true,
            value: authorizationId
          };
        }

        if (key === "kind") {
          return {
            configurable: true,
            enumerable: true,
            value: "offer"
          };
        }

        if (key === "screenContent") {
          return {
            configurable: true,
            enumerable: true,
            value: "raw-screen-content"
          };
        }

        return undefined;
      },
      get: (_target, key) => {
        if (key === "authorizationId") {
          return authorizationId;
        }

        if (key === "kind") {
          return "offer";
        }

        if (key === "screenContent") {
          return "raw-screen-content";
        }

        return undefined;
      }
    }
  );
}

async function withInheritedSignalPayloadToJsonHook<T>(
  authorizationId: string,
  callback: () => Promise<T>
): Promise<T> {
  const objectToJson = Object.getOwnPropertyDescriptor(Object.prototype, "toJSON");
  Object.defineProperty(Object.prototype, "toJSON", {
    configurable: true,
    value: function inheritedSignalPayloadToJson(this: Record<string, unknown>) {
      if (this.authorizationId !== authorizationId) {
        return this;
      }

      return {
        authorizationId,
        kind: "offer",
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

async function startHostSocketCloseAfterActiveServer(): Promise<{
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
      socket.send(encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "hello",
        peerId: "viewer-1",
        role: "viewer",
        displayName: "Viewer",
        capabilities: ["session:visible", "consent:required", "audit:stdout"]
      }));
      socket.send(encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-authorization-request",
        viewerPeerId: "viewer-1",
        requestedPermissions: ["screen:view"],
        reason: "Development test request"
      }));
    });

    socket.on("message", (data) => {
      const parsed = JSON.parse(data.toString()) as ProtocolEnvelope;
      if (parsed.type === "session-authorization-state" && parsed.status === "active") {
        socket.close(1000, "Host socket close test");
      }
    });
  });
  await once(wss, "listening");

  const address = wss.address() as AddressInfo | string | null;
  if (!address || typeof address === "string") {
    throw new Error("Host socket close test server did not expose a TCP port");
  }

  return {
    url: `ws://127.0.0.1:${address.port}`,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        for (const client of wss.clients) {
          client.close();
        }

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

async function startFirstSocketCloseThenReadyServer(): Promise<{
  url: string;
  stop(): Promise<void>;
}> {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  let connectionCount = 0;

  wss.on("connection", (socket) => {
    connectionCount += 1;
    const connectionNumber = connectionCount;

    socket.once("message", () => {
      socket.send(encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "relay-ready",
        peerId: "host-1",
        roomSize: 2
      }));
      socket.send(encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "hello",
        peerId: "viewer-1",
        role: "viewer",
        displayName: "Viewer",
        capabilities: ["session:visible", "consent:required", "audit:stdout"]
      }));

      if (connectionNumber !== 1) {
        return;
      }

      socket.send(encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-authorization-request",
        viewerPeerId: "viewer-1",
        requestedPermissions: ["screen:view"],
        reason: "Development test request"
      }));
    });

    socket.on("message", (data) => {
      const parsed = JSON.parse(data.toString()) as ProtocolEnvelope;
      if (connectionNumber === 1 && parsed.type === "session-authorization-state" && parsed.status === "active") {
        socket.close(1000, "Host socket close test");
      }
    });
  });
  await once(wss, "listening");

  const address = wss.address() as AddressInfo | string | null;
  if (!address || typeof address === "string") {
    throw new Error("Socket restart test server did not expose a TCP port");
  }

  return {
    url: `ws://127.0.0.1:${address.port}`,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        for (const client of wss.clients) {
          client.close();
        }

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

async function startNonProtocolMessageServer(message: string | Buffer): Promise<{
  url: string;
  stop(): Promise<void>;
}> {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  wss.on("connection", (socket) => {
    socket.once("message", () => {
      socket.send(message);
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

async function startObservedHostViewerAuthorizationLifecycleServer(
  createMessages: () => Array<ProtocolEnvelope | string>
): Promise<{
  url: string;
  stop(): Promise<void>;
}> {
  return startViewerAuthorizationLifecycleServer(() => [trustedHostHelloMessage(), ...createMessages()]);
}

function trustedHostHelloMessage(): ProtocolEnvelope {
  return {
    ...createMessageBase("session-demo"),
    type: "hello",
    peerId: "host-1",
    role: "host",
    displayName: "Host",
    capabilities: ["session:visible", "consent:required", "audit:stdout"]
  };
}

async function startViewerAuthorizationLifecycleServer(createMessages: () => Array<ProtocolEnvelope | string>): Promise<{
  url: string;
  stop(): Promise<void>;
}> {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  wss.on("connection", (socket) => {
    socket.once("message", () => {
      for (const message of createMessages()) {
        socket.send(typeof message === "string" ? message : encodeProtocolEnvelope(message));
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

async function startHostAuthorizedSignalPayloadServer(
  createPayloads: (authorizationId: string) => Array<Record<string, unknown>>
): Promise<{
  url: string;
  stop(): Promise<void>;
}> {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  wss.on("connection", (socket) => {
    let sentSignals = false;

    socket.once("message", () => {
      socket.send(encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "relay-ready",
        peerId: "host-1",
        roomSize: 2
      }));
      socket.send(encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "hello",
        peerId: "viewer-1",
        role: "viewer",
        displayName: "Viewer",
        capabilities: ["session:visible", "consent:required"]
      }));
      socket.send(encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-authorization-request",
        viewerPeerId: "viewer-1",
        requestedPermissions: ["screen:view"],
        reason: "Development viewer request"
      }));
    });

    socket.on("message", (data) => {
      if (sentSignals) {
        return;
      }

      const parsed = JSON.parse(data.toString()) as Record<string, unknown>;
      if (
        parsed.type !== "session-authorization-state" ||
        parsed.status !== "active" ||
        !parsed.visibleToHost ||
        typeof parsed.authorizationId !== "string"
      ) {
        return;
      }

      sentSignals = true;
      for (const payload of createPayloads(parsed.authorizationId)) {
        socket.send(JSON.stringify({
          ...createMessageBase("session-demo"),
          type: "signal",
          fromPeerId: "viewer-1",
          toPeerId: "host-1",
          payload
        }));
      }
    });
  });
  await once(wss, "listening");

  const address = wss.address() as AddressInfo | string | null;
  if (!address || typeof address === "string") {
    throw new Error("Host authorized signal payload test server did not expose a TCP port");
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
          authorizationId: "authz_misdirected_signal",
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
          authorizationId: "authz_self_signal",
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
          authorizationId: "authz_self_control",
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

async function startUnboundPeerDisconnectNoticeServer(): Promise<{
  url: string;
  stop(): Promise<void>;
}> {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  wss.on("connection", (socket) => {
    socket.once("message", () => {
      socket.send(encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "peer-disconnected",
        peerId: "viewer-1",
        role: "viewer",
        reasonCode: "peer-closed"
      }));
    });
  });
  await once(wss, "listening");

  const address = wss.address() as AddressInfo | string | null;
  if (!address || typeof address === "string") {
    throw new Error("Unbound disconnect test server did not expose a TCP port");
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

async function startMismatchedDisconnectAfterHostActiveServer(): Promise<{
  url: string;
  stop(): Promise<void>;
}> {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  wss.on("connection", (socket) => {
    let sentMismatchedDisconnect = false;

    socket.once("message", () => {
      socket.send(encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "relay-ready",
        peerId: "host-1",
        roomSize: 2
      }));
      socket.send(encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "hello",
        peerId: "viewer-1",
        role: "viewer",
        displayName: "Viewer",
        capabilities: ["session:visible", "consent:required", "audit:stdout"]
      }));
      socket.send(encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-authorization-request",
        viewerPeerId: "viewer-1",
        requestedPermissions: ["screen:view"],
        reason: "Development viewer request"
      }));
    });

    socket.on("message", (data) => {
      if (sentMismatchedDisconnect) {
        return;
      }

      const parsed = JSON.parse(data.toString()) as ProtocolEnvelope;
      if (
        parsed.type !== "session-authorization-state" ||
        parsed.status !== "active" ||
        !parsed.visibleToHost
      ) {
        return;
      }

      sentMismatchedDisconnect = true;
      socket.send(encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "peer-disconnected",
        peerId: "viewer-2",
        role: "viewer",
        reasonCode: "peer-closed"
      }));
    });
  });
  await once(wss, "listening");

  const address = wss.address() as AddressInfo | string | null;
  if (!address || typeof address === "string") {
    throw new Error("Mismatched disconnect test server did not expose a TCP port");
  }

  return {
    url: `ws://127.0.0.1:${address.port}`,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        for (const client of wss.clients) {
          client.close();
        }

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

async function startUnboundHostAuthorizationRequestServer(): Promise<{
  url: string;
  stop(): Promise<void>;
}> {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  wss.on("connection", (socket) => {
    socket.once("message", () => {
      socket.send(encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-authorization-request",
        viewerPeerId: "viewer-1",
        requestedPermissions: ["screen:view"],
        reason: "unbound request private reason token raw-token"
      }));
    });
  });
  await once(wss, "listening");

  const address = wss.address() as AddressInfo | string | null;
  if (!address || typeof address === "string") {
    throw new Error("Unbound request test server did not expose a TCP port");
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

async function startMismatchedHostAuthorizationRequestServer(): Promise<{
  url: string;
  stop(): Promise<void>;
}> {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  wss.on("connection", (socket) => {
    socket.once("message", () => {
      socket.send(encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "hello",
        peerId: "viewer-1",
        role: "viewer",
        displayName: "Viewer",
        capabilities: ["session:visible", "consent:required"]
      }));
      socket.send(encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-authorization-request",
        viewerPeerId: "viewer-2",
        requestedPermissions: ["screen:view"],
        reason: "mismatched request private reason token raw-token"
      }));
    });
  });
  await once(wss, "listening");

  const address = wss.address() as AddressInfo | string | null;
  if (!address || typeof address === "string") {
    throw new Error("Mismatched request test server did not expose a TCP port");
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
