import { MemoryAuditSink } from "@winbridge/audit-log";
import {
  createMessageBase,
  encodeProtocolEnvelope,
  type ProtocolEnvelope
} from "@winbridge/protocol";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket, { type RawData } from "ws";
import { SlidingWindowRateLimiter } from "./rate-limit.js";
import { createRelayRuntime, type RelayRuntime, type RelayRuntimeOptions } from "./server.js";

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
    const runtime = await startRuntime();
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
});

async function startRuntime(
  options: Partial<RelayRuntimeOptions> = {}
): Promise<RelayRuntime> {
  const runtime = createRelayRuntime({
    port: 0,
    auditSink: new MemoryAuditSink(),
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

function openSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
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
