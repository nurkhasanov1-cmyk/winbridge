import { assertAuditLogPath } from "@winbridge/audit-log";
import {
  DeviceIdentitySchema,
  hasSecretBearingAuditMetadata,
  hasSecretBearingProtocolIdentifierMetadata,
  PairingCodeSchema,
  PeerIdSchema,
  PermissionSchema,
  ProtocolIdentifierSchema,
  SessionIdSchema,
  type Permission,
  type SessionRole
} from "@winbridge/protocol";
import {
  MAX_AGENT_SHELL_DISCONNECT_REASON_BYTES,
  MAX_AGENT_SHELL_REASON_LENGTH,
  MAX_AGENT_SHELL_TOKEN_BYTES,
  MAX_AGENT_SHELL_TIMER_DELAY_MS,
  parsePermissions,
  type HostDecision
} from "./runtime.js";

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
  hostGrantPermissions?: ReturnType<typeof parsePermissions>;
  hostDecision: HostDecision;
  hostConsentPrompt: boolean;
  hostControlPrompt: boolean;
  hostStatusAfterMs?: number;
  viewerControlPrompt: boolean;
  hostSignalProbeAck: boolean;
  hostConsentTimeoutMs?: number;
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
  hostDisconnectAfterMs?: number;
  hostDisconnectReason?: string;
  viewerSignalProbeAfterMs?: number;
  viewerStatusAfterMs?: number;
  viewerDisconnectAfterMs?: number;
};

export const AGENT_SHELL_USAGE =
  "Usage: npm run dev:agent -- <host|viewer> [--relay ws://localhost:8787] [--session demo] [--pairing 123-456] [--peer peer-id] [--device device-id] [--name display-name] [--token token] [--audit-log logs\\agent-audit.jsonl] [--request screen:view,input:pointer] [--grant screen:view,input:pointer] [--host-decision none|approve|deny] [--host-consent-prompt true|false] [--host-control-prompt true|false] [--host-status-after-ms 1000] [--viewer-control-prompt true|false] [--host-signal-probe-ack true|false] [--host-consent-timeout-ms 60000] [--visible-session true|false] [--authorization-ttl-ms 600000] [--revoke-after-ms 1000] [--revoke-permission screen:view] [--revoke-reason reason] [--pause-after-ms 1000] [--pause-reason reason] [--resume-after-ms 1000] [--resume-reason reason] [--terminate-after-ms 1000] [--terminate-reason reason] [--disconnect-after-ms 1000] [--disconnect-reason reason] [--viewer-signal-probe-after-ms 1000] [--viewer-status-after-ms 1000] [--viewer-disconnect-after-ms 1000]";

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
  "grant",
  "host-decision",
  "host-consent-prompt",
  "host-control-prompt",
  "host-status-after-ms",
  "viewer-control-prompt",
  "host-signal-probe-ack",
  "host-consent-timeout-ms",
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
  "terminate-reason",
  "disconnect-after-ms",
  "disconnect-reason",
  "viewer-signal-probe-after-ms",
  "viewer-status-after-ms",
  "viewer-disconnect-after-ms"
]);

const hostRejectedViewerWorkflowOptions = ["request"] as const;

const viewerRejectedHostWorkflowOptions = [
  "grant",
  "host-decision",
  "host-consent-prompt",
  "host-consent-timeout-ms",
  "host-control-prompt",
  "host-status-after-ms",
  "host-signal-probe-ack",
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
  "terminate-reason",
  "disconnect-after-ms",
  "disconnect-reason"
] as const;

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
  assertNoHostViewerWorkflowOptions(role, options);
  assertNoViewerHostWorkflowOptions(role, options);
  const sessionId = parseSessionId(options.get("session") ?? "demo");
  const pairingCode = parsePairingCode(options.get("pairing") ?? "123-456");
  const peerId = parsePeerId(options.get("peer") ?? `${role}-${processId}`);

  const hostDecision = parseHostDecision(options.get("host-decision"));
  const hostConsentPrompt = parseHostConsentPrompt(role, hostDecision, options.get("host-consent-prompt"));
  const hostStatusAfterMs = parseHostStatusAfterMs(role, options.get("host-status-after-ms"));
  const hostControlPrompt = parseHostControlPrompt(
    role,
    hostConsentPrompt,
    hostStatusAfterMs,
    options.get("host-control-prompt")
  );
  const hostSignalProbeAck = parseHostSignalProbeAck(role, options.get("host-signal-probe-ack"));
  const hostGrantPermissions = parseHostGrantPermissions(
    role,
    hostDecision,
    hostConsentPrompt,
    options.get("grant")
  );
  const requestedPermissions = parseRequestedPermissions(options.get("request"));
  const viewerSignalProbeAfterMs = parseViewerSignalProbeAfterMs(
    role,
    requestedPermissions,
    options.get("viewer-signal-probe-after-ms")
  );
  const viewerStatusAfterMs = parseViewerStatusAfterMs(
    role,
    options.get("viewer-status-after-ms")
  );
  const viewerDisconnectAfterMs = parseViewerDisconnectAfterMs(
    role,
    options.get("viewer-disconnect-after-ms")
  );
  const viewerControlPrompt = parseViewerControlPrompt(
    role,
    viewerStatusAfterMs,
    viewerDisconnectAfterMs,
    options.get("viewer-control-prompt")
  );

  return {
    role,
    relayUrl: parseRelayUrl(options.get("relay") ?? "ws://localhost:8787"),
    sessionId,
    pairingCode,
    peerId,
    displayName: parseDisplayName(options.get("name") ?? `${role} ${processId}`),
    token: parseOptionalToken(options.get("token")),
    deviceId: parseDeviceId(options.get("device") ?? `dev_${role}_${processId}`),
    auditLogPath: parseOptionalAuditLogPath(
      options.get("audit-log") ?? env.WINBRIDGE_AGENT_AUDIT_LOG_PATH
    ),
    requestedPermissions,
    hostGrantPermissions,
    hostDecision,
    hostConsentPrompt,
    hostControlPrompt,
    hostStatusAfterMs,
    viewerControlPrompt,
    hostSignalProbeAck,
    hostConsentTimeoutMs: parseHostConsentTimeoutMs(
      hostConsentPrompt,
      options.get("host-consent-timeout-ms")
    ),
    visibleToHost: parseVisibleSession(options.get("visible-session")),
    authorizationTtlMs: parseOptionalAuthorizationTtlMs(options.get("authorization-ttl-ms")),
    hostRevokeAfterMs: parseOptionalTimerDelayMs(options.get("revoke-after-ms")),
    hostRevokePermission: parseOptionalPermission(options.get("revoke-permission")),
    hostRevokeReason: parseOptionalReason(options.get("revoke-reason")),
    hostPauseAfterMs: parseOptionalTimerDelayMs(options.get("pause-after-ms")),
    hostPauseReason: parseOptionalReason(options.get("pause-reason")),
    hostResumeAfterMs: parseOptionalTimerDelayMs(options.get("resume-after-ms")),
    hostResumeReason: parseOptionalReason(options.get("resume-reason")),
    hostTerminateAfterMs: parseOptionalTimerDelayMs(options.get("terminate-after-ms")),
    hostTerminateReason: parseOptionalReason(options.get("terminate-reason")),
    hostDisconnectAfterMs: parseOptionalTimerDelayMs(options.get("disconnect-after-ms")),
    hostDisconnectReason: parseHostDisconnectReason(role, options.get("disconnect-reason")),
    viewerSignalProbeAfterMs,
    viewerStatusAfterMs,
    viewerDisconnectAfterMs
  };
}

function assertNoHostViewerWorkflowOptions(role: SessionRole, options: Map<string, string>): void {
  if (role !== "host") {
    return;
  }

  for (const optionName of hostRejectedViewerWorkflowOptions) {
    if (options.has(optionName)) {
      throw new AgentShellUsageError();
    }
  }
}

function assertNoViewerHostWorkflowOptions(role: SessionRole, options: Map<string, string>): void {
  if (role !== "viewer") {
    return;
  }

  for (const optionName of viewerRejectedHostWorkflowOptions) {
    if (options.has(optionName)) {
      throw new AgentShellUsageError();
    }
  }
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

function parseRelayUrl(raw: string): string {
  let parsed: URL;

  try {
    parsed = new URL(raw);
  } catch {
    throw new AgentShellUsageError();
  }

  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
    throw new AgentShellUsageError();
  }

  if (parsed.username || parsed.password || relayUrlHasUserInfoMarker(raw)) {
    throw new AgentShellUsageError();
  }

  if (relayUrlHasTokenQueryParameter(parsed)) {
    throw new AgentShellUsageError();
  }

  return parsed.toString();
}

function relayUrlHasTokenQueryParameter(relayUrl: URL): boolean {
  for (const [name] of relayUrl.searchParams) {
    if (name.toLowerCase() === "token") {
      return true;
    }
  }

  return false;
}

function relayUrlHasUserInfoMarker(raw: string): boolean {
  const authorityStart = raw.indexOf("://");
  if (authorityStart === -1) {
    return false;
  }

  const authorityRemainder = raw.slice(authorityStart + 3);
  const authorityEnd = authorityRemainder.search(/[/?#]/);
  const authority =
    authorityEnd === -1 ? authorityRemainder : authorityRemainder.slice(0, authorityEnd);

  return authority.includes("@");
}

function parseSessionId(raw: string): string {
  try {
    const sessionId = SessionIdSchema.parse(raw);
    assertNoSecretBearingProtocolIdentifierMetadata(sessionId);

    return sessionId;
  } catch {
    throw new AgentShellUsageError();
  }
}

function parsePeerId(raw: string): string {
  try {
    const peerId = PeerIdSchema.parse(raw);
    assertNoSecretBearingProtocolIdentifierMetadata(peerId);

    return peerId;
  } catch {
    throw new AgentShellUsageError();
  }
}

function parseDeviceId(raw: string): string {
  try {
    const deviceId = ProtocolIdentifierSchema.min(8).parse(raw);
    assertNoSecretBearingProtocolIdentifierMetadata(deviceId);

    return deviceId;
  } catch {
    throw new AgentShellUsageError();
  }
}

function assertNoSecretBearingProtocolIdentifierMetadata(identifier: string): void {
  if (hasSecretBearingProtocolIdentifierMetadata(identifier)) {
    throw new Error("Protocol identifier must not contain secret-bearing metadata");
  }
}

function parsePairingCode(raw: string): string {
  try {
    return PairingCodeSchema.parse(raw);
  } catch {
    throw new AgentShellUsageError();
  }
}

function parseDisplayName(raw: string): string {
  if (raw.trim().length === 0) {
    throw new AgentShellUsageError();
  }

  try {
    return DeviceIdentitySchema.shape.displayName.parse(raw);
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

function parseHostGrantPermissions(
  role: SessionRole,
  hostDecision: HostDecision,
  hostConsentPrompt: boolean,
  raw: string | undefined
): Permission[] | undefined {
  if (raw === undefined) {
    return undefined;
  }

  if (role !== "host" || (hostDecision !== "approve" && !hostConsentPrompt)) {
    throw new AgentShellUsageError();
  }

  try {
    const permissions = parsePermissions(raw);
    if (permissions.length === 0) {
      throw new AgentShellUsageError();
    }

    return permissions;
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

function parseHostConsentPrompt(
  role: SessionRole,
  hostDecision: HostDecision,
  raw: string | undefined
): boolean {
  const enabled = parseBooleanFlag(raw, false);

  if (enabled && (role !== "host" || hostDecision === "approve" || hostDecision === "deny")) {
    throw new AgentShellUsageError();
  }

  return enabled;
}

function parseHostControlPrompt(
  role: SessionRole,
  hostConsentPrompt: boolean,
  hostStatusAfterMs: number | undefined,
  raw: string | undefined
): boolean {
  const enabled = parseBooleanFlag(raw, false);

  if (raw !== undefined && role !== "host") {
    throw new AgentShellUsageError();
  }

  if (enabled && hostConsentPrompt) {
    throw new AgentShellUsageError();
  }

  if (enabled && hostStatusAfterMs !== undefined) {
    throw new AgentShellUsageError();
  }

  return enabled;
}

function parseHostStatusAfterMs(role: SessionRole, raw: string | undefined): number | undefined {
  const delayMs = parseOptionalTimerDelayMs(raw);
  if (delayMs === undefined) {
    return undefined;
  }

  if (role !== "host") {
    throw new AgentShellUsageError();
  }

  return delayMs;
}

function parseViewerControlPrompt(
  role: SessionRole,
  viewerStatusAfterMs: number | undefined,
  viewerDisconnectAfterMs: number | undefined,
  raw: string | undefined
): boolean {
  const enabled = parseBooleanFlag(raw, false);

  if (raw !== undefined && role !== "viewer") {
    throw new AgentShellUsageError();
  }

  if (enabled && (viewerStatusAfterMs !== undefined || viewerDisconnectAfterMs !== undefined)) {
    throw new AgentShellUsageError();
  }

  return enabled;
}

function parseHostSignalProbeAck(role: SessionRole, raw: string | undefined): boolean {
  const enabled = parseBooleanFlag(raw, false);

  if (raw !== undefined && role !== "host") {
    throw new AgentShellUsageError();
  }

  return enabled;
}

function parseHostConsentTimeoutMs(
  hostConsentPrompt: boolean,
  raw: string | undefined
): number | undefined {
  if (raw === undefined) {
    return undefined;
  }

  if (!hostConsentPrompt) {
    throw new AgentShellUsageError();
  }

  const value = Number.parseInt(raw, 10);

  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_AGENT_SHELL_TIMER_DELAY_MS ||
    String(value) !== raw
  ) {
    throw new AgentShellUsageError();
  }

  return value;
}

function parseViewerSignalProbeAfterMs(
  role: SessionRole,
  requestedPermissions: Permission[],
  raw: string | undefined
): number | undefined {
  const delayMs = parseOptionalTimerDelayMs(raw);
  if (delayMs === undefined) {
    return undefined;
  }

  if (role !== "viewer" || !requestedPermissions.includes("screen:view")) {
    throw new AgentShellUsageError();
  }

  return delayMs;
}

function parseViewerStatusAfterMs(role: SessionRole, raw: string | undefined): number | undefined {
  const delayMs = parseOptionalTimerDelayMs(raw);
  if (delayMs === undefined) {
    return undefined;
  }

  if (role !== "viewer") {
    throw new AgentShellUsageError();
  }

  return delayMs;
}

function parseViewerDisconnectAfterMs(
  role: SessionRole,
  raw: string | undefined
): number | undefined {
  const delayMs = parseOptionalTimerDelayMs(raw);
  if (delayMs === undefined) {
    return undefined;
  }

  if (role !== "viewer") {
    throw new AgentShellUsageError();
  }

  return delayMs;
}

function parseHostDisconnectReason(role: SessionRole, raw: string | undefined): string | undefined {
  const reason = parseOptionalReason(raw);
  if (reason === undefined) {
    return undefined;
  }

  if (
    role !== "host" ||
    Buffer.byteLength(reason, "utf8") > MAX_AGENT_SHELL_DISCONNECT_REASON_BYTES
  ) {
    throw new AgentShellUsageError();
  }

  return reason;
}

function parseBooleanFlag(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined) {
    return defaultValue;
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

  if (
    raw.trim().length === 0 ||
    raw !== raw.trim() ||
    raw.length > MAX_AGENT_SHELL_REASON_LENGTH ||
    hasAsciiControlCharacter(raw) ||
    hasUnsafeFormatCharacter(raw) ||
    hasSecretBearingAuditMetadata(raw, { includeKeyAssignments: false })
  ) {
    throw new AgentShellUsageError();
  }

  return raw;
}

function parseOptionalAuditLogPath(raw: string | undefined): string | undefined {
  if (raw === undefined) {
    return undefined;
  }

  try {
    assertAuditLogPath(raw);
  } catch {
    throw new AgentShellUsageError();
  }

  return raw;
}

function parseOptionalToken(raw: string | undefined): string | undefined {
  if (raw === undefined) {
    return undefined;
  }

  if (
    raw.trim().length === 0 ||
    raw !== raw.trim() ||
    Buffer.byteLength(raw, "utf8") > MAX_AGENT_SHELL_TOKEN_BYTES ||
    hasAsciiControlCharacter(raw) ||
    hasUnsafeFormatCharacter(raw)
  ) {
    throw new AgentShellUsageError();
  }

  return raw;
}

function hasAsciiControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) {
      return true;
    }
  }

  return false;
}

function hasUnsafeFormatCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);

    if (
      codePoint === 0x061c ||
      codePoint === 0x200b ||
      codePoint === 0x200c ||
      codePoint === 0x200d ||
      codePoint === 0x200e ||
      codePoint === 0x200f ||
      codePoint === 0x2060 ||
      codePoint === 0xfeff ||
      (codePoint !== undefined && codePoint >= 0x202a && codePoint <= 0x202e) ||
      (codePoint !== undefined && codePoint >= 0x2066 && codePoint <= 0x2069)
    ) {
      return true;
    }
  }

  return false;
}

function parseOptionalTimerDelayMs(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }

  const value = Number.parseInt(raw, 10);

  if (
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_AGENT_SHELL_TIMER_DELAY_MS ||
    String(value) !== raw
  ) {
    throw new AgentShellUsageError();
  }

  return value;
}

function parseOptionalAuthorizationTtlMs(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }

  const value = Number.parseInt(raw, 10);

  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_AGENT_SHELL_TIMER_DELAY_MS ||
    String(value) !== raw
  ) {
    throw new AgentShellUsageError();
  }

  return value;
}
