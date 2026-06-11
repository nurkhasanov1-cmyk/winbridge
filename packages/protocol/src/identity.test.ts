import { describe, expect, it } from "vitest";
import {
  assertRemoteActionAuthorized,
  consumePairingTicket,
  createDeviceIdentity,
  createPairingCodeSalt,
  createPairingTicket,
  createPairedDevice,
  hashPairingCode
} from "./identity.js";

describe("device identity", () => {
  it("creates schema-valid local device metadata", () => {
    const identity = createDeviceIdentity({
      displayName: "Host workstation",
      platform: "windows",
      deviceId: "dev_host_1"
    });

    expect(identity).toMatchObject({
      deviceId: "dev_host_1",
      platform: "windows",
      trustLevel: "local-dev"
    });
  });

  it("rejects malformed local device identifiers", () => {
    expect(() =>
      createDeviceIdentity({
        displayName: "Host workstation",
        platform: "windows",
        deviceId: "dev host 1"
      })
    ).toThrow();
    expect(() =>
      createDeviceIdentity({
        displayName: "Host workstation",
        platform: "windows",
        deviceId: "d".repeat(129)
      })
    ).toThrow();
  });
});

describe("pairing tickets", () => {
  it("hashes pairing codes with a per-ticket salt and does not retain the raw code", () => {
    const pairingCodeSalt = "salt:00112233445566778899aabbccddeeff";
    const ticket = createPairingTicket({
      sessionId: "session-demo",
      hostDeviceId: "dev_host_1",
      pairingCode: "123-456",
      pairingCodeSalt,
      now: new Date("2026-06-11T00:00:00.000Z")
    });

    expect(ticket.pairingCodeSalt).toBe(pairingCodeSalt);
    expect(ticket.pairingCodeHash).toBe(hashPairingCode("123-456", pairingCodeSalt));
    expect(JSON.stringify(ticket)).not.toContain("123-456");
  });

  it("rejects pairing records with malformed identifiers", () => {
    expect(() =>
      createPairingTicket({
        sessionId: "session demo",
        hostDeviceId: "dev_host_1",
        pairingCode: "123-456"
      })
    ).toThrow();
    expect(() =>
      createPairingTicket({
        sessionId: "session-demo",
        hostDeviceId: "dev_host_1",
        pairingCode: "123-456",
        pairingId: "p".repeat(129)
      })
    ).toThrow();

    const ticket = createPairingTicket({
      sessionId: "session-demo",
      hostDeviceId: "dev_host_1",
      pairingCode: "123-456"
    });

    expect(() =>
      createPairedDevice({
        ticket,
        viewerDeviceId: "viewer/1"
      })
    ).toThrow();
  });

  it("creates distinct salts and hashes for the same pairing code", () => {
    const first = createPairingTicket({
      sessionId: "session-demo",
      hostDeviceId: "dev_host_1",
      pairingCode: "123-456"
    });
    const second = createPairingTicket({
      sessionId: "session-demo",
      hostDeviceId: "dev_host_1",
      pairingCode: "123-456"
    });

    expect(createPairingCodeSalt()).toMatch(/^salt:[a-f0-9]{32}$/);
    expect(first.pairingCodeSalt).not.toBe(second.pairingCodeSalt);
    expect(first.pairingCodeHash).not.toBe(second.pairingCodeHash);
    expect(JSON.stringify([first, second])).not.toContain("123-456");
  });

  it("rejects expired tickets", () => {
    const ticket = createPairingTicket({
      sessionId: "session-demo",
      hostDeviceId: "dev_host_1",
      pairingCode: "123-456",
      ttlMs: 1000,
      now: new Date("2026-06-11T00:00:00.000Z")
    });

    expect(() =>
      consumePairingTicket(ticket, "123-456", new Date("2026-06-11T00:00:01.001Z"))
    ).toThrow("expired");
  });

  it("prevents replay after remaining uses are consumed", () => {
    const ticket = createPairingTicket({
      sessionId: "session-demo",
      hostDeviceId: "dev_host_1",
      pairingCode: "123-456",
      maxUses: 1,
      now: new Date("2026-06-11T00:00:00.000Z")
    });

    const consumed = consumePairingTicket(
      ticket,
      "123-456",
      new Date("2026-06-11T00:00:00.500Z")
    );

    expect(consumed.remainingUses).toBe(0);
    expect(consumed.pairingCodeSalt).toBe(ticket.pairingCodeSalt);
    expect(consumed.pairingCodeHash).toBe(ticket.pairingCodeHash);
    expect(() =>
      consumePairingTicket(consumed, "123-456", new Date("2026-06-11T00:00:00.600Z"))
    ).toThrow("no remaining uses");
  });

  it("rejects mismatched pairing codes with salted ticket hashes", () => {
    const ticket = createPairingTicket({
      sessionId: "session-demo",
      hostDeviceId: "dev_host_1",
      pairingCode: "123-456",
      now: new Date("2026-06-11T00:00:00.000Z")
    });

    expect(() =>
      consumePairingTicket(ticket, "999-000", new Date("2026-06-11T00:00:00.500Z"))
    ).toThrow("does not match");
  });

  it("creates a pair relationship without granting remote action permission", () => {
    const ticket = createPairingTicket({
      sessionId: "session-demo",
      hostDeviceId: "dev_host_1",
      pairingCode: "123-456"
    });

    const pair = createPairedDevice({
      ticket,
      viewerDeviceId: "dev_viewer_1"
    });

    expect(pair.viewerDeviceId).toBe("dev_viewer_1");
    expect(() =>
      assertRemoteActionAuthorized({
        permission: "screen:view",
        grant: pair
      })
    ).toThrow();
  });

  it("allows remote action only with a consent-bound session grant", () => {
    expect(() =>
      assertRemoteActionAuthorized({
        permission: "screen:view",
        grant: {
          sessionId: "session-demo",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          permissions: ["screen:view"],
          requiresHostApproval: true,
          visibleSessionRequired: true,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          auditId: "audit-demo"
        }
      })
    ).not.toThrow();
  });
});
