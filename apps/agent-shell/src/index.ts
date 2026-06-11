import { FileAuditSink } from "@winbridge/audit-log";
import { PairingCodeSchema, PermissionSchema, type Permission, type SessionRole } from "@winbridge/protocol";
import { createAgentShellRuntime, parsePermissions, type HostDecision } from "./runtime.js";

type Args = {
  role: SessionRole;
  relayUrl: string;
  sessionId: string;
  pairingCode: string;
  peerId: string;
  displayName: string;
  token?: string;
  deviceId: string;
  auditLogPath?: string;
  requestedPermissions: ReturnType<typeof parsePermissions>;
  hostDecision: HostDecision;
  visibleToHost: boolean;
  authorizationTtlMs?: number;
  hostRevokeAfterMs?: number;
  hostRevokePermission?: Permission;
  hostRevokeReason?: string;
  hostPauseAfterMs?: number;
  hostPauseReason?: string;
  hostResumeAfterMs?: number;
  hostResumeReason?: string;
  hostTerminateAfterMs?: number;
  hostTerminateReason?: string;
};

const args = parseArgs(process.argv.slice(2));
const runtime = createAgentShellRuntime({
  ...args,
  auditSink: args.auditLogPath ? new FileAuditSink(args.auditLogPath) : undefined
});

const shutdown = async () => {
  await runtime.stop();
};

process.on("SIGINT", () => {
  shutdown()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
});

process.on("SIGTERM", () => {
  shutdown()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
});

runtime.start().catch((error) => {
  console.error(error);
  process.exit(1);
});

function parseArgs(raw: string[]): Args {
  const role = raw[0] as SessionRole | undefined;

  if (role !== "host" && role !== "viewer") {
    printUsageAndExit();
  }

  const options = new Map<string, string>();

  for (let index = 1; index < raw.length; index += 2) {
    const key = raw[index];
    const value = raw[index + 1];

    if (!key?.startsWith("--") || !value) {
      printUsageAndExit();
    }

    options.set(key.slice(2), value);
  }

  const sessionId = options.get("session") ?? "demo";
  const pairingCode = options.get("pairing") ?? "123-456";
  PairingCodeSchema.parse(pairingCode);

  return {
    role,
    relayUrl: options.get("relay") ?? "ws://localhost:8787",
    sessionId,
    pairingCode,
    peerId: options.get("peer") ?? `${role}-${process.pid}`,
    displayName: options.get("name") ?? `${role} ${process.pid}`,
    token: options.get("token"),
    deviceId: options.get("device") ?? `dev_${role}_${process.pid}`,
    auditLogPath: options.get("audit-log") ?? process.env.WINBRIDGE_AGENT_AUDIT_LOG_PATH,
    requestedPermissions: parsePermissions(options.get("request")),
    hostDecision: parseHostDecision(options.get("host-decision")),
    visibleToHost: options.get("visible-session") === "true",
    authorizationTtlMs: parseOptionalNonNegativeInteger(options.get("authorization-ttl-ms")),
    hostRevokeAfterMs: parseOptionalNonNegativeInteger(options.get("revoke-after-ms")),
    hostRevokePermission: parseOptionalPermission(options.get("revoke-permission")),
    hostRevokeReason: options.get("revoke-reason"),
    hostPauseAfterMs: parseOptionalNonNegativeInteger(options.get("pause-after-ms")),
    hostPauseReason: options.get("pause-reason"),
    hostResumeAfterMs: parseOptionalNonNegativeInteger(options.get("resume-after-ms")),
    hostResumeReason: options.get("resume-reason"),
    hostTerminateAfterMs: parseOptionalNonNegativeInteger(options.get("terminate-after-ms")),
    hostTerminateReason: options.get("terminate-reason")
  };
}

function parseHostDecision(raw: string | undefined): HostDecision {
  if (!raw) {
    return "none";
  }

  if (raw === "approve" || raw === "deny" || raw === "none") {
    return raw;
  }

  printUsageAndExit();
}

function parseOptionalPermission(raw: string | undefined): Permission | undefined {
  if (!raw) {
    return undefined;
  }

  return PermissionSchema.parse(raw);
}

function parseOptionalNonNegativeInteger(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }

  const value = Number.parseInt(raw, 10);

  if (!Number.isInteger(value) || value < 0 || String(value) !== raw) {
    printUsageAndExit();
  }

  return value;
}

function printUsageAndExit(): never {
  console.error(
    "Usage: npm run dev:agent -- <host|viewer> [--relay ws://localhost:8787] [--session demo] [--pairing 123-456] [--peer peer-id] [--device device-id] [--name display-name] [--token token] [--audit-log logs\\agent-audit.jsonl] [--request screen:view,input:pointer] [--host-decision none|approve|deny] [--visible-session true|false] [--authorization-ttl-ms 600000] [--revoke-after-ms 1000] [--revoke-permission screen:view] [--revoke-reason reason] [--pause-after-ms 1000] [--pause-reason reason] [--resume-after-ms 1000] [--resume-reason reason] [--terminate-after-ms 1000] [--terminate-reason reason]"
  );
  process.exit(1);
}
