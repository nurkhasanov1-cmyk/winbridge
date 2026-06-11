import { describe, expect, it } from "vitest";
import {
  activateSessionAuthorization,
  approveSessionAuthorization,
  assertSessionActionAuthorized,
  createPendingSessionAuthorization,
  denySessionAuthorization,
  expireSessionAuthorization,
  pauseSessionAuthorization,
  resumeSessionAuthorization,
  revokeSessionPermission,
  SessionAuthorizationSchema,
  terminateSessionAuthorization
} from "./authorization.js";
import { createPairingTicket, createPairedDevice } from "./identity.js";
import { assertConsentBoundGrant } from "./session.js";

const baseTime = new Date("2026-06-11T00:00:00.000Z");

function pending() {
  return createPendingSessionAuthorization({
    sessionId: "session-demo",
    hostPeerId: "host-1",
    viewerPeerId: "viewer-1",
    requestedPermissions: ["screen:view", "input:pointer"],
    now: baseTime
  });
}

function withoutField(value: object, field: string): unknown {
  const next = { ...value } as Record<string, unknown>;
  delete next[field];
  return next;
}

describe("session authorization state machine", () => {
  it("does not authorize actions while pending", () => {
    expect(() =>
      assertSessionActionAuthorized({
        authorization: pending(),
        permission: "screen:view",
        now: baseTime
      })
    ).toThrow("not active");
  });

  it("denies actions after host denial", () => {
    const denied = denySessionAuthorization(pending(), {
      reason: "Host denied",
      now: baseTime
    });

    expect(denied.status).toBe("denied");
    expect(denied.permissions).toEqual([]);
    expect(denied.deniedAt).toBe(baseTime.toISOString());
    expect(() =>
      assertSessionActionAuthorized({
        authorization: denied,
        permission: "screen:view",
        now: baseTime
      })
    ).toThrow("denied");
  });

  it("requires visible host session state before activation", () => {
    const approved = approveSessionAuthorization(pending(), {
      grantedPermissions: ["screen:view"],
      now: baseTime
    });

    expect(() =>
      activateSessionAuthorization(approved, {
        // @ts-expect-error Runtime guard matters for external input.
        visibleToHost: false,
        now: baseTime
      })
    ).toThrow("visible host session");
  });

  it("allows host approval to grant the exact requested scope", () => {
    const approved = approveSessionAuthorization(pending(), {
      grantedPermissions: ["screen:view", "input:pointer"],
      now: baseTime
    });

    expect(approved).toMatchObject({
      status: "approved",
      permissions: ["screen:view", "input:pointer"]
    });
  });

  it("allows host approval to narrow the requested scope", () => {
    const approved = approveSessionAuthorization(pending(), {
      grantedPermissions: ["screen:view"],
      now: baseTime
    });

    expect(approved).toMatchObject({
      status: "approved",
      permissions: ["screen:view"]
    });
  });

  it("rejects approval grants that exceed the requested scope", () => {
    expect(() =>
      approveSessionAuthorization(pending(), {
        grantedPermissions: ["screen:view", "input:keyboard"],
        now: baseTime
      })
    ).toThrow("not requested");
  });

  it("rejects empty or duplicate approval grants", () => {
    expect(() =>
      approveSessionAuthorization(pending(), {
        grantedPermissions: [],
        now: baseTime
      })
    ).toThrow("at least one granted permission");
    expect(() =>
      approveSessionAuthorization(pending(), {
        grantedPermissions: ["screen:view", "screen:view"],
        now: baseTime
      })
    ).toThrow("unique");
  });

  it("rejects pending authorization requests without requested permissions", () => {
    expect(() =>
      createPendingSessionAuthorization({
        sessionId: "session-demo",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        requestedPermissions: [],
        now: baseTime
      })
    ).toThrow("at least one requested permission");
    expect(() =>
      createPendingSessionAuthorization({
        sessionId: "session-demo",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        requestedPermissions: ["screen:view", "screen:view"],
        now: baseTime
      })
    ).toThrow("unique");
  });

  it("uses bounded authorization TTL values when creating pending requests", () => {
    expect(pending().expiresAt).toBe("2026-06-11T00:30:00.000Z");
    expect(
      createPendingSessionAuthorization({
        sessionId: "session-demo",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        requestedPermissions: ["screen:view"],
        ttlMs: 1,
        now: baseTime
      }).expiresAt
    ).toBe("2026-06-11T00:00:00.001Z");
    expect(
      createPendingSessionAuthorization({
        sessionId: "session-demo",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        requestedPermissions: ["screen:view"],
        ttlMs: 2_147_483_647,
        now: baseTime
      }).expiresAt
    ).toBe("2026-07-05T20:31:23.647Z");
  });

  it("rejects malformed authorization TTL values before creating pending requests", () => {
    for (const ttlMs of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648]) {
      expect(() =>
        createPendingSessionAuthorization({
          sessionId: "session-demo",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          requestedPermissions: ["screen:view"],
          ttlMs,
          now: baseTime
        })
      ).toThrow("Authorization TTL");
    }
  });

  it("rejects authorization records and grants with malformed identifiers", () => {
    expect(() =>
      createPendingSessionAuthorization({
        sessionId: "session demo",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        requestedPermissions: ["screen:view"],
        now: baseTime
      })
    ).toThrow();
    expect(() =>
      createPendingSessionAuthorization({
        sessionId: "session-demo",
        hostPeerId: "host-1",
        viewerPeerId: "v".repeat(129),
        requestedPermissions: ["screen:view"],
        now: baseTime
      })
    ).toThrow();
    expect(() =>
      SessionAuthorizationSchema.parse({
        ...pending(),
        authorizationId: "authz/unsafe"
      })
    ).toThrow();
    expect(() =>
      assertConsentBoundGrant({
        sessionId: "session-demo",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        permissions: ["screen:view"],
        requiresHostApproval: true,
        visibleSessionRequired: true,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        auditId: "audit demo"
      })
    ).toThrow();
  });

  it("rejects malformed authorization records at schema parse time", () => {
    const active = activateSessionAuthorization(
      approveSessionAuthorization(pending(), {
        grantedPermissions: ["screen:view"],
        now: baseTime
      }),
      { visibleToHost: true, now: baseTime }
    );
    const revoked = revokeSessionPermission(active, {
      permission: "screen:view",
      now: baseTime
    });

    expect(() =>
      SessionAuthorizationSchema.parse({
        ...pending(),
        permissions: ["screen:view", "screen:view"]
      })
    ).toThrow("permissions must be unique");
    expect(() =>
      SessionAuthorizationSchema.parse({
        ...active,
        permissions: []
      })
    ).toThrow("at least one permission");
    expect(SessionAuthorizationSchema.parse(revoked)).toMatchObject({
      status: "revoked",
      permissions: []
    });
    for (const status of ["denied", "revoked", "terminated", "expired"] as const) {
      expect(() =>
        SessionAuthorizationSchema.parse({
          ...active,
          status,
          deniedAt: status === "denied" ? baseTime.toISOString() : undefined,
          revokedAt: status === "revoked" ? baseTime.toISOString() : undefined,
          terminatedAt: status === "terminated" ? baseTime.toISOString() : undefined,
          expiredAt: status === "expired" ? baseTime.toISOString() : undefined,
          permissions: ["screen:view"]
        })
      ).toThrow("cannot carry permissions");
    }
  });

  it("rejects active or paused authorization records without host visibility", () => {
    const active = activateSessionAuthorization(
      approveSessionAuthorization(pending(), {
        grantedPermissions: ["screen:view"],
        now: baseTime
      }),
      { visibleToHost: true, now: baseTime }
    );
    const paused = pauseSessionAuthorization(active, { now: baseTime });

    expect(() =>
      SessionAuthorizationSchema.parse({
        ...active,
        visibleToHost: false
      })
    ).toThrow("visible to host");
    expect(() =>
      SessionAuthorizationSchema.parse({
        ...paused,
        visibleToHost: false
      })
    ).toThrow("visible to host");
  });

  it("requires lifecycle timestamps for parsed authorization records", () => {
    const approved = approveSessionAuthorization(pending(), {
      grantedPermissions: ["screen:view"],
      now: baseTime
    });
    const active = activateSessionAuthorization(approved, {
      visibleToHost: true,
      now: baseTime
    });
    const paused = pauseSessionAuthorization(active, { now: baseTime });
    const denied = denySessionAuthorization(pending(), {
      reason: "Host denied",
      now: baseTime
    });
    const revoked = revokeSessionPermission(active, {
      permission: "screen:view",
      now: baseTime
    });
    const terminated = terminateSessionAuthorization(active, {
      reason: "Host disconnected",
      now: baseTime
    });
    const expired = expireSessionAuthorization(active, new Date("2026-06-11T00:31:00.000Z"));

    expect(() => SessionAuthorizationSchema.parse(withoutField(denied, "deniedAt"))).toThrow("deniedAt");
    expect(() => SessionAuthorizationSchema.parse(withoutField(approved, "approvedAt"))).toThrow("approvedAt");
    expect(() => SessionAuthorizationSchema.parse(withoutField(active, "activatedAt"))).toThrow("activatedAt");
    expect(() => SessionAuthorizationSchema.parse(withoutField(paused, "pausedAt"))).toThrow("pausedAt");
    expect(() => SessionAuthorizationSchema.parse(withoutField(revoked, "revokedAt"))).toThrow("revokedAt");
    expect(() => SessionAuthorizationSchema.parse(withoutField(terminated, "terminatedAt"))).toThrow("terminatedAt");
    expect(() => SessionAuthorizationSchema.parse(withoutField(expired, "expiredAt"))).toThrow("expiredAt");
  });

  it("requires auditable resume history for parsed active authorization records", () => {
    const active = activateSessionAuthorization(
      approveSessionAuthorization(pending(), {
        grantedPermissions: ["screen:view"],
        now: baseTime
      }),
      { visibleToHost: true, now: baseTime }
    );
    const paused = pauseSessionAuthorization(active, {
      now: new Date("2026-06-11T00:01:00.000Z")
    });
    const resumed = resumeSessionAuthorization(paused, {
      now: new Date("2026-06-11T00:02:00.000Z")
    });

    expect(SessionAuthorizationSchema.parse(resumed)).toMatchObject({
      status: "active",
      pausedAt: "2026-06-11T00:01:00.000Z",
      resumedAt: "2026-06-11T00:02:00.000Z"
    });
    expect(() =>
      SessionAuthorizationSchema.parse({
        ...active,
        pausedAt: "2026-06-11T00:01:00.000Z"
      })
    ).toThrow("resumedAt");
    expect(() =>
      SessionAuthorizationSchema.parse({
        ...active,
        resumedAt: "2026-06-11T00:02:00.000Z"
      })
    ).toThrow("pausedAt");
  });

  it("rejects blank lifecycle reasons in state-machine transitions", () => {
    const active = activateSessionAuthorization(
      approveSessionAuthorization(pending(), {
        grantedPermissions: ["screen:view"],
        now: baseTime
      }),
      { visibleToHost: true, now: baseTime }
    );
    const paused = pauseSessionAuthorization(active, { now: baseTime });

    expect(() =>
      denySessionAuthorization(pending(), {
        reason: "   ",
        now: baseTime
      })
    ).toThrow("reason must not be blank");
    expect(() =>
      revokeSessionPermission(active, {
        permission: "screen:view",
        reason: "   ",
        now: baseTime
      })
    ).toThrow("reason must not be blank");
    expect(() =>
      pauseSessionAuthorization(active, {
        reason: "   ",
        now: baseTime
      })
    ).toThrow("reason must not be blank");
    expect(() =>
      resumeSessionAuthorization(paused, {
        reason: "   ",
        now: baseTime
      })
    ).toThrow("reason must not be blank");
    expect(() =>
      terminateSessionAuthorization(active, {
        reason: "   ",
        now: baseTime
      })
    ).toThrow("reason must not be blank");
  });

  it("rejects parsed authorization records with blank reasons", () => {
    const denied = denySessionAuthorization(pending(), {
      reason: "Host denied",
      now: baseTime
    });

    expect(() =>
      SessionAuthorizationSchema.parse({
        ...denied,
        reason: "   "
      })
    ).toThrow("reason must not be blank");
  });

  it("authorizes granted actions only when active and visible", () => {
    const active = activateSessionAuthorization(
      approveSessionAuthorization(pending(), {
        grantedPermissions: ["screen:view"],
        now: baseTime
      }),
      {
        visibleToHost: true,
        now: baseTime
      }
    );

    expect(
      assertSessionActionAuthorized({
        authorization: active,
        permission: "screen:view",
        now: baseTime
      }).status
    ).toBe("active");
    expect(() =>
      assertSessionActionAuthorized({
        authorization: active,
        permission: "input:keyboard",
        now: baseTime
      })
    ).toThrow("requested permission");
  });

  it("denies revoked permissions immediately", () => {
    const active = activateSessionAuthorization(
      approveSessionAuthorization(pending(), {
        grantedPermissions: ["screen:view", "input:pointer"],
        now: baseTime
      }),
      { visibleToHost: true, now: baseTime }
    );
    const revoked = revokeSessionPermission(active, {
      permission: "screen:view",
      now: baseTime
    });

    expect(() =>
      assertSessionActionAuthorized({
        authorization: revoked,
        permission: "screen:view",
        now: baseTime
      })
    ).toThrow("requested permission");
    expect(
      assertSessionActionAuthorized({
        authorization: revoked,
        permission: "input:pointer",
        now: baseTime
      }).status
    ).toBe("active");
  });

  it("keeps paused authorizations paused after partial permission revocation", () => {
    const active = activateSessionAuthorization(
      approveSessionAuthorization(pending(), {
        grantedPermissions: ["screen:view", "input:pointer"],
        now: baseTime
      }),
      { visibleToHost: true, now: baseTime }
    );
    const paused = pauseSessionAuthorization(active, { now: baseTime });
    const revoked = revokeSessionPermission(paused, {
      permission: "screen:view",
      now: baseTime
    });

    expect(revoked).toMatchObject({
      status: "paused",
      visibleToHost: true,
      permissions: ["input:pointer"]
    });
    expect(() =>
      assertSessionActionAuthorized({
        authorization: revoked,
        permission: "input:pointer",
        now: baseTime
      })
    ).toThrow("paused");
  });

  it("marks authorization revoked when the final permission is revoked", () => {
    const active = activateSessionAuthorization(
      approveSessionAuthorization(pending(), {
        grantedPermissions: ["screen:view"],
        now: baseTime
      }),
      { visibleToHost: true, now: baseTime }
    );
    const revoked = revokeSessionPermission(active, {
      permission: "screen:view",
      now: baseTime
    });

    expect(revoked).toMatchObject({
      status: "revoked",
      permissions: []
    });
    expect(() =>
      assertSessionActionAuthorized({
        authorization: revoked,
        permission: "screen:view",
        now: baseTime
      })
    ).toThrow("revoked");
  });

  it("rejects unsafe permission revocation transitions", () => {
    const approved = approveSessionAuthorization(pending(), {
      grantedPermissions: ["screen:view"],
      now: baseTime
    });
    const active = activateSessionAuthorization(approved, {
      visibleToHost: true,
      now: baseTime
    });
    const denied = denySessionAuthorization(pending(), {
      reason: "Host denied",
      now: baseTime
    });
    const revoked = revokeSessionPermission(active, {
      permission: "screen:view",
      now: baseTime
    });
    const terminated = terminateSessionAuthorization(active, {
      reason: "Host disconnected",
      now: baseTime
    });
    const expired = expireSessionAuthorization(active, new Date("2026-06-11T00:31:00.000Z"));

    expect(() =>
      revokeSessionPermission(pending(), {
        permission: "screen:view",
        now: baseTime
      })
    ).toThrow("pending");
    expect(() =>
      revokeSessionPermission(approved, {
        permission: "screen:view",
        now: baseTime
      })
    ).toThrow("approved");
    expect(() =>
      revokeSessionPermission(denied, {
        permission: "screen:view",
        now: baseTime
      })
    ).toThrow("denied");
    expect(() =>
      revokeSessionPermission(revoked, {
        permission: "screen:view",
        now: baseTime
      })
    ).toThrow("revoked");
    expect(() =>
      revokeSessionPermission(terminated, {
        permission: "screen:view",
        now: baseTime
      })
    ).toThrow("terminated");
    expect(() =>
      revokeSessionPermission(expired, {
        permission: "screen:view",
        now: baseTime
      })
    ).toThrow("expired");
  });

  it("rejects permission revocation without visible unexpired matching grant", () => {
    const active = activateSessionAuthorization(
      approveSessionAuthorization(pending(), {
        grantedPermissions: ["screen:view"],
        now: baseTime
      }),
      { visibleToHost: true, now: baseTime }
    );
    const invisibleActive = {
      ...active,
      visibleToHost: false
    };
    const expiredTime = new Date("2026-06-11T00:31:00.000Z");

    expect(() =>
      revokeSessionPermission(invisibleActive, {
        permission: "screen:view",
        now: baseTime
      })
    ).toThrow("visible");
    expect(() =>
      revokeSessionPermission(active, {
        permission: "screen:view",
        now: expiredTime
      })
    ).toThrow("expired");
    expect(() =>
      revokeSessionPermission(active, {
        permission: "input:keyboard",
        now: baseTime
      })
    ).toThrow("revoked permission");
  });

  it("denies all actions after termination", () => {
    const active = activateSessionAuthorization(
      approveSessionAuthorization(pending(), {
        grantedPermissions: ["screen:view"],
        now: baseTime
      }),
      { visibleToHost: true, now: baseTime }
    );
    const terminated = terminateSessionAuthorization(active, {
      reason: "Host disconnected",
      now: baseTime
    });

    expect(terminated).toMatchObject({
      status: "terminated",
      permissions: []
    });
    expect(() =>
      assertSessionActionAuthorized({
        authorization: terminated,
        permission: "screen:view",
        now: baseTime
      })
    ).toThrow("terminated");
  });

  it("expires active authorizations fail closed", () => {
    const soon = createPendingSessionAuthorization({
      sessionId: "session-demo",
      hostPeerId: "host-1",
      viewerPeerId: "viewer-1",
      requestedPermissions: ["screen:view"],
      ttlMs: 1000,
      now: baseTime
    });
    const active = activateSessionAuthorization(
      approveSessionAuthorization(soon, {
        grantedPermissions: ["screen:view"],
        now: baseTime
      }),
      { visibleToHost: true, now: baseTime }
    );
    const afterExpiry = new Date("2026-06-11T00:00:01.001Z");
    const expired = expireSessionAuthorization(active, afterExpiry);

    expect(expired.status).toBe("expired");
    expect(expired.permissions).toEqual([]);
    expect(expired.expiredAt).toBe(afterExpiry.toISOString());
    expect(() =>
      assertSessionActionAuthorized({
        authorization: active,
        permission: "screen:view",
        now: afterExpiry
      })
    ).toThrow("expired");
  });

  it("denies actions while paused and resumes granted permissions", () => {
    const active = activateSessionAuthorization(
      approveSessionAuthorization(pending(), {
        grantedPermissions: ["screen:view", "input:pointer"],
        now: baseTime
      }),
      { visibleToHost: true, now: baseTime }
    );
    const paused = pauseSessionAuthorization(active, {
      reason: "Host paused",
      now: baseTime
    });

    expect(paused).toMatchObject({
      status: "paused",
      permissions: ["screen:view", "input:pointer"],
      visibleToHost: true
    });
    expect(() =>
      assertSessionActionAuthorized({
        authorization: paused,
        permission: "screen:view",
        now: baseTime
      })
    ).toThrow("paused");

    const resumed = resumeSessionAuthorization(paused, {
      reason: "Host resumed",
      now: baseTime
    });

    expect(resumed.status).toBe("active");
    expect(
      assertSessionActionAuthorized({
        authorization: resumed,
        permission: "screen:view",
        now: baseTime
      }).status
    ).toBe("active");
  });

  it("rejects unsafe pause and resume transitions", () => {
    const approved = approveSessionAuthorization(pending(), {
      grantedPermissions: ["screen:view"],
      now: baseTime
    });
    const active = activateSessionAuthorization(approved, {
      visibleToHost: true,
      now: baseTime
    });
    const paused = pauseSessionAuthorization(active, { now: baseTime });
    const expiredTime = new Date("2026-06-11T00:31:00.000Z");

    expect(() => pauseSessionAuthorization(approved, { now: baseTime })).toThrow("approved");
    expect(() => resumeSessionAuthorization(active, { now: baseTime })).toThrow("active");
    expect(() => resumeSessionAuthorization(paused, { now: expiredTime })).toThrow("expired");
  });

  it("does not treat pairing as active session authorization", () => {
    const ticket = createPairingTicket({
      sessionId: "session-demo",
      hostDeviceId: "dev_host_1",
      pairingCode: "123-456"
    });
    const paired = createPairedDevice({
      ticket,
      viewerDeviceId: "dev_viewer_1"
    });

    expect(() =>
      assertSessionActionAuthorized({
        authorization: paired,
        permission: "screen:view",
        now: baseTime
      })
    ).toThrow();
  });
});
