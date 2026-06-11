import { ConsoleAuditSink, FileAuditSink, type AuditSink } from "@winbridge/audit-log";
import type { AuditOutcome, AuditRecord } from "@winbridge/protocol";

const relayActor = { type: "relay", id: "development-relay" } as const;

export function createRelayAuditSink(env: NodeJS.ProcessEnv = process.env): AuditSink {
  if (env.WINBRIDGE_RELAY_AUDIT_LOG_PATH) {
    return new FileAuditSink(env.WINBRIDGE_RELAY_AUDIT_LOG_PATH);
  }

  return new ConsoleAuditSink((line) => console.log(`[winbridge-audit] ${line}`));
}

export function writeRelayAudit(
  sink: AuditSink,
  input: {
    action: string;
    outcome: AuditOutcome;
    sessionId?: string;
    peerId?: string;
    reason?: string;
    detail?: Record<string, unknown>;
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
