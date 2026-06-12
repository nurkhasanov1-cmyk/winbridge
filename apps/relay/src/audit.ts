import { ConsoleAuditSink, FileAuditSink, type AuditSink } from "@winbridge/audit-log";
import type { AuditDetail, AuditOutcome, AuditRecord } from "@winbridge/protocol";

const relayActor = { type: "relay", id: "development-relay" } as const;

export function createRelayAuditSink(env: NodeJS.ProcessEnv = process.env): AuditSink {
  const auditLogPath = env.WINBRIDGE_RELAY_AUDIT_LOG_PATH;

  if (auditLogPath === undefined) {
    return new ConsoleAuditSink((line) => console.log(`[winbridge-audit] ${line}`));
  }

  if (auditLogPath.trim().length === 0) {
    throw new Error("WINBRIDGE_RELAY_AUDIT_LOG_PATH must not be blank");
  }

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
  return sink.write({
    actor: {
      ...relayActor,
      id: input.peerId ? `${relayActor.id}:${input.peerId}` : relayActor.id
    },
    action: input.action,
    outcome: input.outcome,
    sessionId: input.sessionId,
    reason: input.reason,
    detail: input.detail ?? {}
  });
}
