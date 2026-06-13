import { createHash } from "node:crypto";
import {
  assertAuditLogPath,
  ConsoleAuditSink,
  FileAuditSink,
  type AuditSink
} from "@winbridge/audit-log";
import {
  PROTOCOL_IDENTIFIER_MAX_LENGTH,
  type AuditActor,
  type AuditDetail,
  type AuditOutcome,
  type AuditRecord
} from "@winbridge/protocol";

const relayActor = { type: "relay", id: "development-relay" } as const;
const boundedRelayPeerActorPrefix = `${relayActor.id}:peer`;
const RELAY_AUDIT_LOG_PATH_ERROR_MESSAGE =
  "WINBRIDGE_RELAY_AUDIT_LOG_PATH must be non-blank, already trimmed, 1024 UTF-8 bytes or less, contain no ASCII control characters, and contain no Unicode bidi or zero-width formatting controls";

export function createRelayAuditSink(env: NodeJS.ProcessEnv = process.env): AuditSink {
  const auditLogPath = env.WINBRIDGE_RELAY_AUDIT_LOG_PATH;

  if (auditLogPath === undefined) {
    return new ConsoleAuditSink((line) => console.log(`[winbridge-audit] ${line}`));
  }

  assertAuditLogPath(auditLogPath, RELAY_AUDIT_LOG_PATH_ERROR_MESSAGE);
  return new FileAuditSink(auditLogPath);
}

export function writeRelayAudit(
  sink: AuditSink,
  input: {
    action: string;
    outcome: AuditOutcome;
    sessionId?: string;
    peerId?: string;
    reason?: string;
    detail?: AuditDetail;
  }
): AuditRecord {
  const actor = relayAuditActor(input.peerId);
  return sink.write({
    actor: actor.actor,
    action: input.action,
    outcome: input.outcome,
    sessionId: input.sessionId,
    reason: input.reason,
    detail: actor.detail ? { ...(input.detail ?? {}), ...actor.detail } : (input.detail ?? {})
  });
}

function relayAuditActor(peerId: string | undefined): {
  actor: AuditActor;
  detail?: AuditDetail;
} {
  if (!peerId) {
    return { actor: relayActor };
  }

  const readableId = `${relayActor.id}:${peerId}`;
  if (readableId.length <= PROTOCOL_IDENTIFIER_MAX_LENGTH) {
    return {
      actor: {
        ...relayActor,
        id: readableId
      }
    };
  }

  const peerIdHash = createHash("sha256").update(peerId, "utf8").digest("hex");
  return {
    actor: {
      ...relayActor,
      id: `${boundedRelayPeerActorPrefix}:${peerIdHash.slice(0, 16)}`
    },
    detail: {
      relayPeerIdBounded: true,
      relayPeerIdHash: peerIdHash,
      relayPeerIdLength: peerId.length
    }
  };
}
