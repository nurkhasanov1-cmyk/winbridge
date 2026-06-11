import { createServer } from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import { createRelayAuditSink, writeRelayAudit } from "./audit.js";
import { createDevelopmentRateLimiter, type RateLimitDecision } from "./rate-limit.js";
import {
  createMessageBase,
  decodeProtocolEnvelope,
  encodeProtocolEnvelope,
  JoinSessionMessageSchema,
  type ProtocolEnvelope
} from "@winbridge/protocol";
import { RoomRegistry, type RelayPeer } from "./rooms.js";

const port = Number.parseInt(process.env.WINBRIDGE_RELAY_PORT ?? "8787", 10);
const sharedToken = process.env.WINBRIDGE_RELAY_SHARED_TOKEN;
const rooms = new RoomRegistry();
const auditSink = createRelayAuditSink();
const invalidTokenLimiter = createDevelopmentRateLimiter(
  process.env,
  "WINBRIDGE_RELAY_INVALID_TOKEN"
);
const invalidMessageLimiter = createDevelopmentRateLimiter(
  process.env,
  "WINBRIDGE_RELAY_INVALID_MESSAGE"
);

if (!sharedToken) {
  console.warn(
    "[winbridge-relay] Development mode: WINBRIDGE_RELAY_SHARED_TOKEN is not set. Do not use this as production authorization."
  );
  writeRelayAudit(auditSink, {
    action: "relay.start.development-mode",
    outcome: "accepted",
    detail: { sharedTokenConfigured: false }
  });
}

const server = createServer();
const wss = new WebSocketServer({ server });

wss.on("connection", (socket, request) => {
  const requestUrl = new URL(request.url ?? "/", "ws://localhost");
  const token = requestUrl.searchParams.get("token");
  const remoteKey = request.socket.remoteAddress ?? "unknown-remote";

  if (sharedToken && token !== sharedToken) {
    const decision = invalidTokenLimiter.consume(remoteKey);
    writeRelayAudit(auditSink, {
      action: "relay.token.denied",
      outcome: "denied",
      detail: {
        tokenProvided: Boolean(token),
        rateLimit: rateLimitAuditDetail(decision)
      }
    });
    socket.close(1008, decision.allowed ? "Invalid relay token" : "Relay token rate limit exceeded");
    return;
  }

  let registeredPeer: RelayPeer | undefined;

  socket.on("message", (data) => {
    try {
      const envelope = decodeProtocolEnvelope(data.toString());

      if (!registeredPeer) {
        try {
          registeredPeer = registerFirstMessage(envelope, (payload) => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(payload);
            }
          });
        } catch (error) {
          const reason = error instanceof Error ? error.message : "Join rejected";
          writeRelayAudit(auditSink, {
            action: "relay.peer.join.denied",
            outcome: "denied",
            reason,
            detail: { messageType: envelope.type }
          });
          throw error;
        }

        const ready = encodeProtocolEnvelope({
          ...createMessageBase(registeredPeer.sessionId),
          type: "relay-ready",
          peerId: registeredPeer.peerId,
          roomSize: rooms.size(registeredPeer.sessionId)
        });
        socket.send(ready);
        writeRelayAudit(auditSink, {
          action: "relay.peer.join.accepted",
          outcome: "accepted",
          sessionId: registeredPeer.sessionId,
          peerId: registeredPeer.peerId,
          detail: { role: registeredPeer.role, roomSize: rooms.size(registeredPeer.sessionId) }
        });
        return;
      }

      if (envelope.sessionId !== registeredPeer.sessionId) {
        throw new Error("Message session does not match registered peer");
      }

      for (const peer of rooms.peers(registeredPeer.sessionId, registeredPeer.peerId)) {
        peer.send(encodeProtocolEnvelope(envelope));
      }
      writeRelayAudit(auditSink, {
        action: "relay.message.forwarded",
        outcome: "accepted",
        sessionId: registeredPeer.sessionId,
        peerId: registeredPeer.peerId,
        detail: { messageType: envelope.type }
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Invalid relay message";
      const decision = invalidMessageLimiter.consume(registeredPeer?.peerId ?? remoteKey);
      writeRelayAudit(auditSink, {
        action: "relay.message.rejected",
        outcome: "failed",
        sessionId: registeredPeer?.sessionId,
        peerId: registeredPeer?.peerId,
        reason,
        detail: {
          registered: Boolean(registeredPeer),
          rateLimit: rateLimitAuditDetail(decision)
        }
      });
      socket.send(
        JSON.stringify({
          type: "relay-error",
          reason
        })
      );
      if (!decision.allowed) {
        socket.close(1008, "Relay message rate limit exceeded");
      }
    }
  });

  socket.on("close", () => {
    if (registeredPeer) {
      rooms.leave(registeredPeer.sessionId, registeredPeer.peerId);
      writeRelayAudit(auditSink, {
        action: "relay.peer.disconnect",
        outcome: "accepted",
        sessionId: registeredPeer.sessionId,
        peerId: registeredPeer.peerId,
        detail: { role: registeredPeer.role }
      });
    }
  });
});

server.listen(port, () => {
  console.log(`[winbridge-relay] Listening on ws://localhost:${port}`);
});

function registerFirstMessage(envelope: ProtocolEnvelope, send: (data: string) => void): RelayPeer {
  const join = JoinSessionMessageSchema.parse(envelope);
  const peer: RelayPeer = {
    peerId: join.peerId,
    role: join.role,
    sessionId: join.sessionId,
    pairingCode: join.pairingCode,
    send
  };

  const peers = rooms.join(peer);
  const mismatch = peers.find((existing) => existing.pairingCode !== peer.pairingCode);

  if (mismatch) {
    rooms.leave(peer.sessionId, peer.peerId);
    throw new Error("Pairing code mismatch");
  }

  return peer;
}

function rateLimitAuditDetail(decision: RateLimitDecision) {
  return {
    allowed: decision.allowed,
    limit: decision.limit,
    remaining: decision.remaining,
    resetAt: decision.resetAt
  };
}
