import { describe, expect, it } from "vitest";
import {
  MAX_RELAY_PAIRING_TICKET_TTL_MS,
  RoomRegistry,
  normalizeRelayPairingConfig,
  type RelayPairingConfig,
  type RelayPeer
} from "./rooms.js";

function peer(overrides: Partial<RelayPeer>): RelayPeer {
  return {
    peerId: "host-1",
    role: "host",
    sessionId: "session-demo",
    deviceId: "dev_host_1",
    send: () => true,
    ...overrides
  };
}

function joinPeer(
  overrides: Partial<RelayPeer> & { pairingCode?: string } = {}
): RelayPeer & { pairingCode: string } {
  const { pairingCode, ...peerOverrides } = overrides;

  return {
    ...peer(peerOverrides),
    pairingCode: pairingCode ?? "123-456"
  };
}

describe("RoomRegistry", () => {
  it("allows one host and one viewer in a room", () => {
    const rooms = new RoomRegistry();

    const hostJoin = rooms.join(joinPeer({ peerId: "host-1", role: "host" }));
    const viewerJoin = rooms.join(
      joinPeer({ peerId: "viewer-1", role: "viewer", deviceId: "dev_viewer_1" })
    );

    expect(rooms.size("session-demo")).toBe(2);
    expect(hostJoin).toMatchObject({
      ticketCreated: true,
      ticketConsumed: false,
      ticketRemainingUses: 1
    });
    expect(viewerJoin).toMatchObject({
      ticketCreated: false,
      ticketConsumed: true,
      ticketRemainingUses: 0,
      pairedDevice: {
        sessionId: "session-demo",
        hostDeviceId: "dev_host_1",
        viewerDeviceId: "dev_viewer_1"
      }
    });
    expect(JSON.stringify(rooms.peers("session-demo"))).not.toContain("123-456");
  });

  it("rejects a second peer with the same role", () => {
    const rooms = new RoomRegistry();

    rooms.join(joinPeer({ peerId: "host-1", role: "host" }));

    expect(() => rooms.join(joinPeer({ peerId: "host-2", role: "host" }))).toThrow(
      "already connected"
    );
  });

  it("rejects viewer joins before the host creates pairing material", () => {
    const rooms = new RoomRegistry();

    expect(() =>
      rooms.join(joinPeer({ peerId: "viewer-1", role: "viewer", deviceId: "dev_viewer_1" }))
    ).toThrow("Host pairing ticket required");
    expect(rooms.size("session-demo")).toBe(0);
  });

  it("rejects mismatched viewer pairing codes before registration", () => {
    const rooms = new RoomRegistry();

    rooms.join(joinPeer({ peerId: "host-1", role: "host" }));

    expect(() =>
      rooms.join(
        joinPeer({
          peerId: "viewer-1",
          role: "viewer",
          deviceId: "dev_viewer_1",
          pairingCode: "999-000"
        })
      )
    ).toThrow("Pairing code mismatch");
    expect(rooms.size("session-demo")).toBe(1);
  });

  it("rejects expired pairing tickets before viewer registration", () => {
    let now = new Date("2026-06-11T00:00:00.000Z");
    const rooms = new RoomRegistry({
      ticketTtlMs: 10,
      maxUses: 1,
      now: () => now
    });

    rooms.join(joinPeer({ peerId: "host-1", role: "host" }));
    now = new Date("2026-06-11T00:00:00.010Z");

    expect(() =>
      rooms.join(joinPeer({ peerId: "viewer-1", role: "viewer", deviceId: "dev_viewer_1" }))
    ).toThrow("Pairing ticket is expired");
    expect(rooms.size("session-demo")).toBe(1);
  });

  it("rejects consumed pairing tickets after all uses are spent", () => {
    const rooms = new RoomRegistry({ ticketTtlMs: 60_000, maxUses: 1 });

    rooms.join(joinPeer({ peerId: "host-1", role: "host" }));
    rooms.join(joinPeer({ peerId: "viewer-1", role: "viewer", deviceId: "dev_viewer_1" }));
    rooms.leave("session-demo", "viewer-1");

    expect(() =>
      rooms.join(joinPeer({ peerId: "viewer-2", role: "viewer", deviceId: "dev_viewer_2" }))
    ).toThrow("Pairing ticket has no remaining uses");
    expect(rooms.size("session-demo")).toBe(1);
  });

  it("validates injected pairing settings before ticket creation", () => {
    expect(normalizeRelayPairingConfig()).toMatchObject({
      ticketTtlMs: 5 * 60_000,
      maxUses: 1
    });
    expect(
      normalizeRelayPairingConfig({
        ticketTtlMs: 0,
        maxUses: 10
      })
    ).toMatchObject({
      ticketTtlMs: 0,
      maxUses: 10
    });

    const unsafeConfigs: Array<Partial<RelayPairingConfig>> = [
      { ticketTtlMs: -1 },
      { ticketTtlMs: 1.5 },
      { ticketTtlMs: Number.NaN },
      { ticketTtlMs: Number.POSITIVE_INFINITY },
      { ticketTtlMs: MAX_RELAY_PAIRING_TICKET_TTL_MS + 1 },
      { ticketTtlMs: "60000" as unknown as number },
      { ticketTtlMs: null as unknown as number },
      { maxUses: 0 },
      { maxUses: 1.5 },
      { maxUses: Number.NaN },
      { maxUses: Number.POSITIVE_INFINITY },
      { maxUses: 11 },
      { maxUses: "1" as unknown as number },
      { maxUses: null as unknown as number }
    ];

    for (const config of unsafeConfigs) {
      expect(() => new RoomRegistry(config)).toThrow("Pairing ticket");
    }
  });

  it("removes empty rooms", () => {
    const rooms = new RoomRegistry();

    rooms.join(joinPeer({ peerId: "host-1", role: "host" }));
    rooms.leave("session-demo", "host-1");

    expect(rooms.size("session-demo")).toBe(0);
  });
});
