import {
  consumePairingTicket,
  createPairedDevice,
  createPairingTicket,
  type PairedDevice,
  type PairingTicket,
  type SessionRole
} from "@winbridge/protocol";

export type RelayPeer = {
  peerId: string;
  role: SessionRole;
  sessionId: string;
  deviceId: string;
  send: (data: string) => boolean;
};

export type RelayPeerJoin = RelayPeer & {
  pairingCode: string;
};

export type RelayPairingConfig = {
  ticketTtlMs: number;
  maxUses: number;
  now?: () => Date;
};

export type RelayJoinResult = {
  peers: RelayPeer[];
  ticketCreated: boolean;
  ticketConsumed: boolean;
  ticketRemainingUses?: number;
  pairedDevice?: PairedDevice;
};

type RelayRoom = {
  peers: Map<string, RelayPeer>;
  pairingTicket?: PairingTicket;
};

export const DEFAULT_RELAY_PAIRING_TICKET_TTL_MS = 5 * 60_000;
export const DEFAULT_RELAY_PAIRING_TICKET_MAX_USES = 1;
export const MAX_RELAY_PAIRING_TICKET_TTL_MS = 24 * 60 * 60_000;
export const MAX_RELAY_PAIRING_TICKET_MAX_USES = 10;

export class RoomRegistry {
  private readonly rooms = new Map<string, RelayRoom>();
  private readonly pairingConfig: Required<RelayPairingConfig>;

  constructor(pairingConfig: Partial<RelayPairingConfig> = {}) {
    const normalizedPairingConfig = normalizeRelayPairingConfig(pairingConfig);
    this.pairingConfig = {
      ...normalizedPairingConfig,
      now: normalizedPairingConfig.now ?? (() => new Date())
    };
  }

  join(peer: RelayPeerJoin): RelayJoinResult {
    const room = this.rooms.get(peer.sessionId) ?? { peers: new Map<string, RelayPeer>() };
    const sameRole = [...room.peers.values()].find((existing) => existing.role === peer.role);

    if (sameRole && sameRole.peerId !== peer.peerId) {
      throw new Error(`A ${peer.role} is already connected to session ${peer.sessionId}`);
    }

    if (room.peers.size >= 2 && !room.peers.has(peer.peerId)) {
      throw new Error(`Session ${peer.sessionId} already has two peers`);
    }

    let ticketCreated = false;
    let ticketConsumed = false;
    let pairedDevice: PairedDevice | undefined;

    if (peer.role === "host") {
      room.pairingTicket = createPairingTicket({
        sessionId: peer.sessionId,
        hostDeviceId: peer.deviceId,
        pairingCode: peer.pairingCode,
        ttlMs: this.pairingConfig.ticketTtlMs,
        maxUses: this.pairingConfig.maxUses,
        now: this.pairingConfig.now()
      });
      ticketCreated = true;
    }

    if (peer.role === "viewer") {
      if (!room.pairingTicket) {
        throw new Error("Host pairing ticket required");
      }

      try {
        const consumedTicket = consumePairingTicket(
          room.pairingTicket,
          peer.pairingCode,
          this.pairingConfig.now()
        );
        pairedDevice = createPairedDevice({
          ticket: room.pairingTicket,
          viewerDeviceId: peer.deviceId,
          pairedAt: this.pairingConfig.now()
        });
        room.pairingTicket = consumedTicket;
        ticketConsumed = true;
      } catch (error) {
        if (error instanceof Error && error.message === "Pairing code does not match ticket") {
          throw new Error("Pairing code mismatch");
        }

        throw error;
      }
    }

    const registeredPeer: RelayPeer = {
      peerId: peer.peerId,
      role: peer.role,
      sessionId: peer.sessionId,
      deviceId: peer.deviceId,
      send: peer.send
    };
    room.peers.set(peer.peerId, registeredPeer);
    this.rooms.set(peer.sessionId, room);

    return {
      peers: [...room.peers.values()],
      ticketCreated,
      ticketConsumed,
      ticketRemainingUses: room.pairingTicket?.remainingUses,
      pairedDevice
    };
  }

  leave(sessionId: string, peerId: string): void {
    const room = this.rooms.get(sessionId);
    if (!room) {
      return;
    }

    room.peers.delete(peerId);

    if (room.peers.size === 0) {
      this.rooms.delete(sessionId);
    }
  }

  peers(sessionId: string, exceptPeerId?: string): RelayPeer[] {
    const room = this.rooms.get(sessionId);

    if (!room) {
      return [];
    }

    return [...room.peers.values()].filter((peer) => peer.peerId !== exceptPeerId);
  }

  size(sessionId: string): number {
    return this.rooms.get(sessionId)?.peers.size ?? 0;
  }
}

export function normalizeRelayPairingConfig(
  config: Partial<RelayPairingConfig> = {}
): RelayPairingConfig {
  const ticketTtlMs =
    config.ticketTtlMs === undefined
      ? DEFAULT_RELAY_PAIRING_TICKET_TTL_MS
      : config.ticketTtlMs;
  const maxUses =
    config.maxUses === undefined ? DEFAULT_RELAY_PAIRING_TICKET_MAX_USES : config.maxUses;

  assertBoundedInteger(
    ticketTtlMs,
    "Pairing ticket TTL",
    0,
    MAX_RELAY_PAIRING_TICKET_TTL_MS
  );
  assertBoundedInteger(
    maxUses,
    "Pairing ticket max uses",
    1,
    MAX_RELAY_PAIRING_TICKET_MAX_USES
  );

  return {
    ticketTtlMs,
    maxUses,
    now: config.now
  };
}

function assertBoundedInteger(
  value: unknown,
  label: string,
  min: number,
  max: number
): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer from ${min} through ${max}`);
  }
}
