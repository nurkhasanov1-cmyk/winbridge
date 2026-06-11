import {
  PairingCodeSchema,
  PeerIdSchema,
  PermissionSchema,
  ProtocolIdentifierSchema,
  SessionIdSchema,
  type Permission,
  type SessionRole
} from "@winbridge/protocol";
import { parsePermissions, type HostDecision } from "./runtime.js";

export type AgentShellArgs = {
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

export const AGENT_SHELL_USAGE =
  "Usage: npm run dev:agent -- <host|viewer> [--relay ws://localhost:8787] [--session demo] [--pairing 123-456] [--peer peer-id] [--device device-id] [--name display-name] [--token token] [--audit-log logs\\agent-audit.jsonl] [--request screen:view,input:pointer] [--host-decision none|approve|deny] [--visible-session true|false] [--authorization-ttl-ms 600000] [--revoke-after-ms 1000] [--revoke-permission screen:view] [--revoke-reason reason] [--pause-after-ms 1000] [--pause-reason reason] [--resume-after-ms 1000] [--resume-reason reason] [--terminate-after-ms 1000] [--terminate-reason reason]";

const knownOptions = new Set([
  "relay",
  "session",
  "pairing",
  "peer",
  "device",
  "name",
  "token",
  "audit-log",
  "request",
  "host-decision",
  "visible-session",
  "authorization-ttl-ms",
  "revoke-after-ms",
  "revoke-permission",
  "revoke-reason",
  "pause-after-ms",
  "pause-reason",
  "resume-after-ms",
  "resume-reason",
  "terminate-after-ms",
  "terminate-reason"
]);
const MAX_CLI_REASON_LENGTH = 240;

export class AgentShellUsageError extends Error {
  constructor() {
    super(AGENT_SHELL_USAGE);
    this.name = "AgentShellUsageError";
  }
}

export function parseArgs(
  raw: string[],
  env: NodeJS.ProcessEnv = process.env,
  processId = process.pid
): AgentShellArgs {
  const role = raw[0] as SessionRole | undefined;

  if (role !== "host" && role !== "viewer") {
    throw new AgentShellUsageError();
  }

  const options = parseOptionMap(raw.slice(1));
  const sessionId = parseSessionId(options.get("session") ?? "demo");
  const pairingCode = parsePairingCode(options.get("pairing") ?? "123-456");
  const peerId = parsePeerId(options.get("peer") ?? `${role}-${processId}`);

  return {
    role,
    relayUrl: options.get("relay") ?? "ws://localhost:8787",
    sessionId,
    pairingCode,
    peerId,
    displayName: options.get("name") ?? `${role} ${processId}`,
    token: options.get("token"),
    deviceId: parseProtocolIdentifier(options.get("device") ?? `dev_${role}_${processId}`),
    auditLogPath: options.get("audit-log") ?? env.WINBRIDGE_AGENT_AUDIT_LOG_PATH,
    requestedPermissions: parseRequestedPermissions(options.get("request")),
    hostDecision: parseHostDecision(options.get("host-decision")),
    visibleToHost: parseVisibleSession(options.get("visible-session")),
    authorizationTtlMs: parseOptionalNonNegativeInteger(options.get("authorization-ttl-ms")),
    hostRevokeAfterMs: parseOptionalNonNegativeInteger(options.get("revoke-after-ms")),
    hostRevokePermission: parseOptionalPermission(options.get("revoke-permission")),
    hostRevokeReason: parseOptionalReason(options.get("revoke-reason")),
    hostPauseAfterMs: parseOptionalNonNegativeInteger(options.get("pause-after-ms")),
    hostPauseReason: parseOptionalReason(options.get("pause-reason")),
    hostResumeAfterMs: parseOptionalNonNegativeInteger(options.get("resume-after-ms")),
    hostResumeReason: parseOptionalReason(options.get("resume-reason")),
    hostTerminateAfterMs: parseOptionalNonNegativeInteger(options.get("terminate-after-ms")),
    hostTerminateReason: parseOptionalReason(options.get("terminate-reason"))
  };
}

function parseOptionMap(rawOptions: string[]): Map<string, string> {
  const options = new Map<string, string>();

  for (let index = 0; index < rawOptions.length; index += 2) {
    const key = rawOptions[index];
    const value = rawOptions[index + 1];

    if (!key?.startsWith("--") || !value || value.startsWith("--")) {
      throw new AgentShellUsageError();
    }

    const optionName = key.slice(2);
    if (!knownOptions.has(optionName) || options.has(optionName)) {
      throw new AgentShellUsageError();
    }

    options.set(optionName, value);
  }

  return options;
}

function parseSessionId(raw: string): string {
  try {
    return SessionIdSchema.parse(raw);
  } catch {
    throw new AgentShellUsageError();
  }
}

function parsePeerId(raw: string): string {
  try {
    return PeerIdSchema.parse(raw);
  } catch {
    throw new AgentShellUsageError();
  }
}

function parseProtocolIdentifier(raw: string): string {
  try {
    return ProtocolIdentifierSchema.min(8).parse(raw);
  } catch {
    throw new AgentShellUsageError();
  }
}

function parsePairingCode(raw: string): string {
  try {
    return PairingCodeSchema.parse(raw);
  } catch {
    throw new AgentShellUsageError();
  }
}

function parseRequestedPermissions(raw: string | undefined): Permission[] {
  try {
    return parsePermissions(raw);
  } catch {
    throw new AgentShellUsageError();
  }
}

function parseHostDecision(raw: string | undefined): HostDecision {
  if (!raw) {
    return "none";
  }

  if (raw === "approve" || raw === "deny" || raw === "none") {
    return raw;
  }

  throw new AgentShellUsageError();
}

function parseVisibleSession(raw: string | undefined): boolean {
  if (raw === undefined) {
    return false;
  }

  if (raw === "true") {
    return true;
  }

  if (raw === "false") {
    return false;
  }

  throw new AgentShellUsageError();
}

function parseOptionalPermission(raw: string | undefined): Permission | undefined {
  if (!raw) {
    return undefined;
  }

  try {
    return PermissionSchema.parse(raw);
  } catch {
    throw new AgentShellUsageError();
  }
}

function parseOptionalReason(raw: string | undefined): string | undefined {
  if (raw === undefined) {
    return undefined;
  }

  if (raw.trim().length === 0 || raw.length > MAX_CLI_REASON_LENGTH) {
    throw new AgentShellUsageError();
  }

  return raw;
}

function parseOptionalNonNegativeInteger(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }

  const value = Number.parseInt(raw, 10);

  if (!Number.isInteger(value) || value < 0 || String(value) !== raw) {
    throw new AgentShellUsageError();
  }

  return value;
}
