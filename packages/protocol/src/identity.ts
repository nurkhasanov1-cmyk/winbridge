import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  PairingCodeSchema,
  PermissionSchema,
  type Permission,
  ProtocolIdentifierSchema,
  SessionGrantSchema,
  SessionIdSchema
} from "./session.js";
import { hasSecretBearingAuditMetadata } from "./audit.js";

export const DeviceTrustLevelSchema = z.enum(["unknown", "local-dev", "verified"]);
export type DeviceTrustLevel = z.infer<typeof DeviceTrustLevelSchema>;

export const DeviceDisplayNameSchema = z
  .string()
  .min(1)
  .max(120)
  .refine((displayName) => displayName.trim().length > 0, "Display name must not be blank")
  .refine((displayName) => displayName === displayName.trim(), "Display name must be trimmed")
  .refine(
    (displayName) => !hasAsciiControlCharacter(displayName),
    "Display name must not contain ASCII control characters"
  )
  .refine(
    (displayName) => !hasUnsafeDisplayFormatCharacter(displayName),
    "Display name must not contain Unicode bidi or zero-width formatting controls"
  )
  .refine(
    (displayName) => !hasSecretBearingAuditMetadata(displayName, { includeKeyAssignments: false }),
    "Display name must not contain sensitive metadata"
  );
export type DeviceDisplayName = z.infer<typeof DeviceDisplayNameSchema>;

export const DeviceIdentitySchema = z.object({
  deviceId: ProtocolIdentifierSchema.min(8),
  displayName: DeviceDisplayNameSchema,
  platform: z.enum(["windows", "linux", "macos", "unknown"]),
  trustLevel: DeviceTrustLevelSchema,
  createdAt: z.string().datetime()
}).strict();
export type DeviceIdentity = z.infer<typeof DeviceIdentitySchema>;

export const PairingTicketSchema = z.object({
  pairingId: ProtocolIdentifierSchema.min(8),
  sessionId: SessionIdSchema,
  hostDeviceId: ProtocolIdentifierSchema.min(8),
  pairingCodeSalt: z.string().regex(/^salt:[a-f0-9]{32}$/),
  pairingCodeHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  remainingUses: z.number().int().min(0).max(10)
}).strict();
export type PairingTicket = z.infer<typeof PairingTicketSchema>;

export const PairedDeviceSchema = z.object({
  pairingId: ProtocolIdentifierSchema.min(8),
  sessionId: SessionIdSchema,
  hostDeviceId: ProtocolIdentifierSchema.min(8),
  viewerDeviceId: ProtocolIdentifierSchema.min(8),
  pairedAt: z.string().datetime()
}).strict();
export type PairedDevice = z.infer<typeof PairedDeviceSchema>;

const DEFAULT_PAIRING_TICKET_TTL_MS = 5 * 60_000;
const DEFAULT_PAIRING_TICKET_MAX_USES = 1;
const MAX_PAIRING_TICKET_TTL_MS = 2_147_483_647;
const MAX_PAIRING_TICKET_MAX_USES = 10;
export const SELF_PAIRING_DEVICE_REJECTION_REASON =
  "Paired device viewer must differ from host device";

export function createDeviceIdentity(input: {
  displayName: string;
  platform?: DeviceIdentity["platform"];
  trustLevel?: DeviceTrustLevel;
  deviceId?: string;
  now?: Date;
}): DeviceIdentity {
  return DeviceIdentitySchema.parse({
    deviceId: input.deviceId ?? `dev_${randomUUID()}`,
    displayName: input.displayName,
    platform: input.platform ?? "unknown",
    trustLevel: input.trustLevel ?? "local-dev",
    createdAt: (input.now ?? new Date()).toISOString()
  });
}

export function createPairingCodeSalt(): string {
  return `salt:${randomBytes(16).toString("hex")}`;
}

export function hashPairingCode(pairingCode: string, salt: string): string {
  PairingCodeSchema.parse(pairingCode);
  const parsedSalt = z.string().regex(/^salt:[a-f0-9]{32}$/).parse(salt);

  return `sha256:${createHash("sha256").update(`${parsedSalt}:${pairingCode}`, "utf8").digest("hex")}`;
}

export function createPairingTicket(input: {
  sessionId: string;
  hostDeviceId: string;
  pairingCode: string;
  ttlMs?: number;
  maxUses?: number;
  now?: Date;
  pairingId?: string;
  pairingCodeSalt?: string;
}): PairingTicket {
  const now = input.now ?? new Date();
  const ttlMs = input.ttlMs ?? DEFAULT_PAIRING_TICKET_TTL_MS;
  const maxUses = input.maxUses ?? DEFAULT_PAIRING_TICKET_MAX_USES;
  assertBoundedInteger(
    ttlMs,
    "Pairing ticket TTL",
    0,
    MAX_PAIRING_TICKET_TTL_MS
  );
  assertBoundedInteger(
    maxUses,
    "Pairing ticket max uses",
    1,
    MAX_PAIRING_TICKET_MAX_USES
  );
  const pairingCodeSalt = input.pairingCodeSalt ?? createPairingCodeSalt();

  return PairingTicketSchema.parse({
    pairingId: input.pairingId ?? `pair_${randomUUID()}`,
    sessionId: input.sessionId,
    hostDeviceId: input.hostDeviceId,
    pairingCodeSalt,
    pairingCodeHash: hashPairingCode(input.pairingCode, pairingCodeSalt),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    remainingUses: maxUses
  });
}

export function isPairingTicketExpired(ticket: PairingTicket, now = new Date()): boolean {
  return Date.parse(ticket.expiresAt) <= now.getTime();
}

export function consumePairingTicket(
  ticket: PairingTicket,
  pairingCode: string,
  now = new Date()
): PairingTicket {
  const parsed = PairingTicketSchema.parse(ticket);

  if (isPairingTicketExpired(parsed, now)) {
    throw new Error("Pairing ticket is expired");
  }

  if (parsed.remainingUses <= 0) {
    throw new Error("Pairing ticket has no remaining uses");
  }

  if (
    !pairingCodeHashesMatch(
      parsed.pairingCodeHash,
      hashPairingCode(pairingCode, parsed.pairingCodeSalt)
    )
  ) {
    throw new Error("Pairing code does not match ticket");
  }

  return PairingTicketSchema.parse({
    ...parsed,
    remainingUses: parsed.remainingUses - 1
  });
}

export function createPairedDevice(input: {
  ticket: PairingTicket;
  viewerDeviceId: string;
  pairedAt?: Date;
}): PairedDevice {
  const ticket = PairingTicketSchema.parse(input.ticket);
  const viewerDeviceId = ProtocolIdentifierSchema.min(8).parse(input.viewerDeviceId);
  const pairedAt = input.pairedAt ?? new Date();
  const pairedAtTime = pairedAt.getTime();
  const createdAtTime = Date.parse(ticket.createdAt);
  const expiresAtTime = Date.parse(ticket.expiresAt);

  if (viewerDeviceId === ticket.hostDeviceId) {
    throw new Error(SELF_PAIRING_DEVICE_REJECTION_REASON);
  }

  if (pairedAtTime < createdAtTime) {
    throw new Error("Paired device timestamp must not be before pairing ticket creation");
  }

  if (pairedAtTime >= expiresAtTime) {
    throw new Error("Paired device timestamp must be before pairing ticket expiration");
  }

  return PairedDeviceSchema.parse({
    pairingId: ticket.pairingId,
    sessionId: ticket.sessionId,
    hostDeviceId: ticket.hostDeviceId,
    viewerDeviceId,
    pairedAt: pairedAt.toISOString()
  });
}

export function assertRemoteActionAuthorized(input: {
  permission: Permission;
  grant: unknown;
  now?: Date;
}): void {
  const grant = SessionGrantSchema.parse(input.grant);

  if (Date.parse(grant.expiresAt) <= (input.now ?? new Date()).getTime()) {
    throw new Error("Session grant is expired");
  }

  if (!grant.permissions.includes(PermissionSchema.parse(input.permission))) {
    throw new Error("Session grant does not include requested permission");
  }
}

function pairingCodeHashesMatch(storedHash: string, candidateHash: string): boolean {
  return timingSafeEqual(pairingCodeHashDigest(storedHash), pairingCodeHashDigest(candidateHash));
}

function pairingCodeHashDigest(hash: string): Buffer {
  const parsed = z.string().regex(/^sha256:[a-f0-9]{64}$/).parse(hash);

  return Buffer.from(parsed.slice("sha256:".length), "hex");
}

function assertBoundedInteger(
  value: number,
  label: string,
  min: number,
  max: number
): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer from ${min} through ${max}`);
  }
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

function hasUnsafeDisplayFormatCharacter(value: string): boolean {
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
