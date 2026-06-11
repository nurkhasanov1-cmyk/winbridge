import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  PairingCodeSchema,
  PermissionSchema,
  type Permission,
  ProtocolIdentifierSchema,
  SessionGrantSchema,
  SessionIdSchema
} from "./session.js";

export const DeviceTrustLevelSchema = z.enum(["unknown", "local-dev", "verified"]);
export type DeviceTrustLevel = z.infer<typeof DeviceTrustLevelSchema>;

export const DeviceIdentitySchema = z.object({
  deviceId: ProtocolIdentifierSchema.min(8),
  displayName: z.string().min(1).max(120),
  platform: z.enum(["windows", "linux", "macos", "unknown"]),
  trustLevel: DeviceTrustLevelSchema,
  createdAt: z.string().datetime()
});
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
});
export type PairingTicket = z.infer<typeof PairingTicketSchema>;

export const PairedDeviceSchema = z.object({
  pairingId: ProtocolIdentifierSchema.min(8),
  sessionId: SessionIdSchema,
  hostDeviceId: ProtocolIdentifierSchema.min(8),
  viewerDeviceId: ProtocolIdentifierSchema.min(8),
  pairedAt: z.string().datetime()
});
export type PairedDevice = z.infer<typeof PairedDeviceSchema>;

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
  const ttlMs = input.ttlMs ?? 5 * 60_000;
  const maxUses = input.maxUses ?? 1;
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

  if (parsed.pairingCodeHash !== hashPairingCode(pairingCode, parsed.pairingCodeSalt)) {
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
  return PairedDeviceSchema.parse({
    pairingId: input.ticket.pairingId,
    sessionId: input.ticket.sessionId,
    hostDeviceId: input.ticket.hostDeviceId,
    viewerDeviceId: input.viewerDeviceId,
    pairedAt: (input.pairedAt ?? new Date()).toISOString()
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
