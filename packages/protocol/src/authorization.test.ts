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
const unsafePermissionShapes = [
  "remote-shell",
  "admin:run",
  "unattended:access",
  "persistence:install",
  "service:install",
  "startup:persist",
  "privilege:elevate",
  "credential:read",
  "keylog:capture",
  "stealth:session",
  "windows-prompt:bypass"
] as const;
const secretBearingReasons = [
  "Authorization: Bearer raw-authz-token",
  "credential: raw-authz-credential",
  "pairing code: raw-authz-pairing-code",
  "diagnostics dump: raw-authz-diagnostics",
  "screen content: raw-authz-screen"
] as const;

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

  it("rejects secret-bearing authorization identifiers", () => {
    expect(() =>
      createPendingSessionAuthorization({
        sessionId: "session-demo",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        requestedPermissions: ["screen:view"],
        authorizationId: "token:raw-authz-secret",
        now: baseTime
      })
    ).toThrow("Authorization id must not contain sensitive metadata");

    for (const authorizationId of [
      "sshKey:raw-authz-secret",
      "token-raw-authz-secret",
      "token_raw_authz_secret",
      "cookie.raw.authz.secret",
      "ssh-key-raw-authz-secret"
    ]) {
      expect(() =>
        SessionAuthorizationSchema.parse({
          ...pending(),
          authorizationId
        })
      ).toThrow("Authorization id must not contain sensitive metadata");
    }

    expect(
      createPendingSessionAuthorization({
        sessionId: "session-demo",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        requestedPermissions: ["screen:view"],
        authorizationId: "authz-public-metadata",
        now: baseTime
      }).authorizationId
    ).toBe("authz-public-metadata");
  });

  it("rejects authorization records and grants with unknown fixed fields", () => {
    expect(() =>
      SessionAuthorizationSchema.parse({
        ...pending(),
        unknownFixedField: "must-fail"
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
        auditId: "audit-demo",
        unknownFixedField: "must-fail"
      } as unknown as Parameters<typeof assertConsentBoundGrant>[0])
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

  it("rejects pending, approved, or denied authorization records with non-active host visibility", () => {
    const pendingAuthorization = pending();
    const approved = approveSessionAuthorization(pendingAuthorization, {
      grantedPermissions: ["screen:view"],
      now: baseTime
    });
    const denied = denySessionAuthorization(pending(), {
      reason: "Host denied",
      now: baseTime
    });

    for (const authorization of [pendingAuthorization, approved, denied]) {
      expect(() =>
        SessionAuthorizationSchema.parse({
          ...authorization,
          visibleToHost: true
        })
      ).toThrow("cannot be visible before activation");
    }
  });

  it("preserves visible terminal history after active sessions fail closed", () => {
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
    const terminated = terminateSessionAuthorization(active, {
      reason: "Host disconnected",
      now: baseTime
    });
    const expired = expireSessionAuthorization(active, new Date("2026-06-11T00:31:00.000Z"));

    for (const authorization of [revoked, terminated, expired]) {
      expect(SessionAuthorizationSchema.parse(authorization)).toMatchObject({
        visibleToHost: true,
        permissions: []
      });
    }
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

  it("rejects conflicting lifecycle timestamps for pending, approved, and denied records", () => {
    const timestamp = baseTime.toISOString();
    const pendingAuthorization = pending();
    const approved = approveSessionAuthorization(pendingAuthorization, {
      grantedPermissions: ["screen:view"],
      now: baseTime
    });
    const denied = denySessionAuthorization(pending(), {
      reason: "Host denied",
      now: baseTime
    });

    for (const field of [
      "deniedAt",
      "approvedAt",
      "activatedAt",
      "pausedAt",
      "resumedAt",
      "revokedAt",
      "terminatedAt",
      "expiredAt"
    ] as const) {
      expect(() =>
        SessionAuthorizationSchema.parse({
          ...pendingAuthorization,
          [field]: timestamp
        })
      ).toThrow(`pending session authorization cannot include ${field}`);
    }

    for (const field of [
      "deniedAt",
      "activatedAt",
      "pausedAt",
      "resumedAt",
      "revokedAt",
      "terminatedAt",
      "expiredAt"
    ] as const) {
      expect(() =>
        SessionAuthorizationSchema.parse({
          ...approved,
          [field]: timestamp
        })
      ).toThrow(`approved session authorization cannot include ${field}`);
    }

    for (const field of [
      "approvedAt",
      "activatedAt",
      "pausedAt",
      "resumedAt",
      "revokedAt",
      "terminatedAt",
      "expiredAt"
    ] as const) {
      expect(() =>
        SessionAuthorizationSchema.parse({
          ...denied,
          [field]: timestamp
        })
      ).toThrow(`denied session authorization cannot include ${field}`);
    }
  });

  it("rejects out-of-order authorization timestamps", () => {
    const approved = approveSessionAuthorization(pending(), {
      grantedPermissions: ["screen:view"],
      now: new Date("2026-06-11T00:01:00.000Z")
    });
    const active = activateSessionAuthorization(approved, {
      visibleToHost: true,
      now: new Date("2026-06-11T00:02:00.000Z")
    });

    expect(() =>
      SessionAuthorizationSchema.parse({
        ...pending(),
        updatedAt: "2026-06-10T23:59:59.999Z"
      })
    ).toThrow("updatedAt must not be before createdAt");

    expect(() =>
      SessionAuthorizationSchema.parse({
        ...pending(),
        expiresAt: baseTime.toISOString()
      })
    ).toThrow("expiresAt must be after createdAt");

    expect(() =>
      SessionAuthorizationSchema.parse({
        ...approved,
        approvedAt: "2026-06-10T23:59:59.999Z"
      })
    ).toThrow("approvedAt must not be before createdAt");

    expect(() =>
      SessionAuthorizationSchema.parse({
        ...active,
        approvedAt: "2026-06-11T00:03:00.000Z"
      })
    ).toThrow("approvedAt must not be after updatedAt");

    expect(SessionAuthorizationSchema.parse(active)).toMatchObject({
      status: "active",
      approvedAt: "2026-06-11T00:01:00.000Z",
      activatedAt: "2026-06-11T00:02:00.000Z"
    });
  });

  it("rejects lifecycle timestamp sequences that contradict authorization transitions", () => {
    const approved = approveSessionAuthorization(pending(), {
      grantedPermissions: ["screen:view", "input:pointer"],
      now: new Date("2026-06-11T00:01:00.000Z")
    });
    const active = activateSessionAuthorization(approved, {
      visibleToHost: true,
      now: new Date("2026-06-11T00:02:00.000Z")
    });
    const paused = pauseSessionAuthorization(active, {
      now: new Date("2026-06-11T00:03:00.000Z")
    });
    const resumed = resumeSessionAuthorization(paused, {
      now: new Date("2026-06-11T00:04:00.000Z")
    });
    const terminated = terminateSessionAuthorization(resumed, {
      reason: "Host disconnected",
      now: new Date("2026-06-11T00:05:00.000Z")
    });

    expect(() =>
      SessionAuthorizationSchema.parse({
        ...active,
        approvedAt: "2026-06-11T00:03:00.000Z",
        updatedAt: "2026-06-11T00:03:00.000Z"
      })
    ).toThrow("activatedAt must not be before approvedAt");

    expect(() =>
      SessionAuthorizationSchema.parse({
        ...resumed,
        resumedAt: "2026-06-11T00:02:30.000Z"
      })
    ).toThrow("resumedAt must not be before pausedAt");

    expect(() =>
      SessionAuthorizationSchema.parse({
        ...terminated,
        terminatedAt: "2026-06-11T00:01:30.000Z"
      })
    ).toThrow("terminatedAt must not be before activatedAt");
  });

  it("rejects live authorization records with fail-closed lifecycle timestamps", () => {
    const active = activateSessionAuthorization(
      approveSessionAuthorization(pending(), {
        grantedPermissions: ["screen:view"],
        now: new Date("2026-06-11T00:01:00.000Z")
      }),
      {
        visibleToHost: true,
        now: new Date("2026-06-11T00:02:00.000Z")
      }
    );
    const paused = pauseSessionAuthorization(active, {
      now: new Date("2026-06-11T00:03:00.000Z")
    });

    for (const authorization of [active, paused]) {
      for (const field of ["deniedAt", "terminatedAt", "expiredAt"] as const) {
        expect(() =>
          SessionAuthorizationSchema.parse({
            ...authorization,
            [field]: "2026-06-11T00:04:00.000Z",
            updatedAt: "2026-06-11T00:04:00.000Z"
          })
        ).toThrow(`${authorization.status} session authorization cannot include ${field}`);
      }
    }
  });

  it("rejects terminal authorization records with conflicting terminal timestamps", () => {
    const active = activateSessionAuthorization(
      approveSessionAuthorization(pending(), {
        grantedPermissions: ["screen:view"],
        now: new Date("2026-06-11T00:01:00.000Z")
      }),
      {
        visibleToHost: true,
        now: new Date("2026-06-11T00:02:00.000Z")
      }
    );
    const revoked = revokeSessionPermission(active, {
      permission: "screen:view",
      now: new Date("2026-06-11T00:03:00.000Z")
    });
    const terminated = terminateSessionAuthorization(active, {
      reason: "Host disconnected",
      now: new Date("2026-06-11T00:03:00.000Z")
    });
    const expired = expireSessionAuthorization(active, new Date("2026-06-11T00:31:00.000Z"));

    expect(() =>
      SessionAuthorizationSchema.parse({
        ...revoked,
        terminatedAt: "2026-06-11T00:04:00.000Z",
        updatedAt: "2026-06-11T00:04:00.000Z"
      })
    ).toThrow("revoked session authorization cannot include terminatedAt");
    expect(() =>
      SessionAuthorizationSchema.parse({
        ...terminated,
        expiredAt: "2026-06-11T00:04:00.000Z",
        updatedAt: "2026-06-11T00:04:00.000Z"
      })
    ).toThrow("terminated session authorization cannot include expiredAt");
    expect(() =>
      SessionAuthorizationSchema.parse({
        ...expired,
        terminatedAt: "2026-06-11T00:30:00.000Z"
      })
    ).toThrow("expired session authorization cannot include terminatedAt");
  });

  it("accepts ordered partial revocation timestamps while denying revoked permissions", () => {
    const active = activateSessionAuthorization(
      approveSessionAuthorization(pending(), {
        grantedPermissions: ["screen:view", "input:pointer"],
        now: new Date("2026-06-11T00:01:00.000Z")
      }),
      {
        visibleToHost: true,
        now: new Date("2026-06-11T00:02:00.000Z")
      }
    );
    const partialRevocation = revokeSessionPermission(active, {
      permission: "screen:view",
      now: new Date("2026-06-11T00:03:00.000Z")
    });

    expect(SessionAuthorizationSchema.parse(partialRevocation)).toMatchObject({
      status: "active",
      permissions: ["input:pointer"],
      approvedAt: "2026-06-11T00:01:00.000Z",
      activatedAt: "2026-06-11T00:02:00.000Z",
      revokedAt: "2026-06-11T00:03:00.000Z"
    });
    expect(() =>
      assertSessionActionAuthorized({
        authorization: partialRevocation,
        permission: "screen:view",
        now: new Date("2026-06-11T00:03:00.000Z")
      })
    ).toThrow("requested permission");
    expect(
      assertSessionActionAuthorized({
        authorization: partialRevocation,
        permission: "input:pointer",
        now: new Date("2026-06-11T00:03:00.000Z")
      }).status
    ).toBe("active");

    const pausedAfterPartialRevocation = pauseSessionAuthorization(partialRevocation, {
      now: new Date("2026-06-11T00:04:00.000Z")
    });
    const resumedAfterPartialRevocation = resumeSessionAuthorization(pausedAfterPartialRevocation, {
      now: new Date("2026-06-11T00:05:00.000Z")
    });

    expect(SessionAuthorizationSchema.parse(resumedAfterPartialRevocation)).toMatchObject({
      status: "active",
      permissions: ["input:pointer"],
      revokedAt: "2026-06-11T00:03:00.000Z",
      pausedAt: "2026-06-11T00:04:00.000Z",
      resumedAt: "2026-06-11T00:05:00.000Z"
    });
    expect(
      assertSessionActionAuthorized({
        authorization: resumedAfterPartialRevocation,
        permission: "input:pointer",
        now: new Date("2026-06-11T00:05:00.000Z")
      }).status
    ).toBe("active");
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

  it("rejects untrimmed lifecycle reasons in state-machine transitions", () => {
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
        reason: " Host denied",
        now: baseTime
      })
    ).toThrow("reason must be trimmed");
    expect(() =>
      revokeSessionPermission(active, {
        permission: "screen:view",
        reason: "Host revoked ",
        now: baseTime
      })
    ).toThrow("reason must be trimmed");
    expect(() =>
      pauseSessionAuthorization(active, {
        reason: " Host paused ",
        now: baseTime
      })
    ).toThrow("reason must be trimmed");
    expect(() =>
      resumeSessionAuthorization(paused, {
        reason: "Host resumed ",
        now: baseTime
      })
    ).toThrow("reason must be trimmed");
    expect(() =>
      terminateSessionAuthorization(active, {
        reason: " Host disconnected",
        now: baseTime
      })
    ).toThrow("reason must be trimmed");
  });

  it("rejects control-character lifecycle reasons in state-machine transitions", () => {
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
        reason: "Host\ndenied",
        now: baseTime
      })
    ).toThrow("reason must not contain ASCII control characters");
    expect(() =>
      revokeSessionPermission(active, {
        permission: "screen:view",
        reason: "Host\nrevoked",
        now: baseTime
      })
    ).toThrow("reason must not contain ASCII control characters");
    expect(() =>
      pauseSessionAuthorization(active, {
        reason: "Host\npaused",
        now: baseTime
      })
    ).toThrow("reason must not contain ASCII control characters");
    expect(() =>
      resumeSessionAuthorization(paused, {
        reason: "Host\nresumed",
        now: baseTime
      })
    ).toThrow("reason must not contain ASCII control characters");
    expect(() =>
      terminateSessionAuthorization(active, {
        reason: "Host\nterminated",
        now: baseTime
      })
    ).toThrow("reason must not contain ASCII control characters");
  });

  it("rejects format-control lifecycle reasons in state-machine transitions", () => {
    const active = activateSessionAuthorization(
      approveSessionAuthorization(pending(), {
        grantedPermissions: ["screen:view"],
        now: baseTime
      }),
      { visibleToHost: true, now: baseTime }
    );
    const paused = pauseSessionAuthorization(active, { now: baseTime });

    for (const reason of ["Host\u202edenied", "Host\u200bdenied", "Host\ufeffdenied"]) {
      expect(() =>
        denySessionAuthorization(pending(), {
          reason,
          now: baseTime
        })
      ).toThrow("reason must not contain Unicode bidi or zero-width formatting controls");
    }
    expect(() =>
      revokeSessionPermission(active, {
        permission: "screen:view",
        reason: "Host\u202erevoked",
        now: baseTime
      })
    ).toThrow("reason must not contain Unicode bidi or zero-width formatting controls");
    expect(() =>
      pauseSessionAuthorization(active, {
        reason: "Host\u200bpaused",
        now: baseTime
      })
    ).toThrow("reason must not contain Unicode bidi or zero-width formatting controls");
    expect(() =>
      resumeSessionAuthorization(paused, {
        reason: "Host\ufeffresumed",
        now: baseTime
      })
    ).toThrow("reason must not contain Unicode bidi or zero-width formatting controls");
    expect(() =>
      terminateSessionAuthorization(active, {
        reason: "Host\u202eterminated",
        now: baseTime
      })
    ).toThrow("reason must not contain Unicode bidi or zero-width formatting controls");
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

  it("rejects parsed authorization records with untrimmed reasons", () => {
    const denied = denySessionAuthorization(pending(), {
      reason: "Host denied",
      now: baseTime
    });

    expect(() =>
      SessionAuthorizationSchema.parse({
        ...denied,
        reason: " Host denied "
      })
    ).toThrow("reason must be trimmed");
  });

  it("rejects parsed authorization records with control-character reasons", () => {
    const denied = denySessionAuthorization(pending(), {
      reason: "Host denied",
      now: baseTime
    });

    expect(() =>
      SessionAuthorizationSchema.parse({
        ...denied,
        reason: "Host\ndenied"
      })
    ).toThrow("reason must not contain ASCII control characters");
  });

  it("rejects parsed authorization records with format-control reasons", () => {
    const denied = denySessionAuthorization(pending(), {
      reason: "Host denied",
      now: baseTime
    });

    for (const reason of ["Host\u202edenied", "Host\u200bdenied", "Host\ufeffdenied"]) {
      expect(() =>
        SessionAuthorizationSchema.parse({
          ...denied,
          reason
        })
      ).toThrow("reason must not contain Unicode bidi or zero-width formatting controls");
    }
  });

  it("rejects unsafe authorization reasons without exposing raw private text", () => {
    const denied = denySessionAuthorization(pending(), {
      reason: "Host denied",
      now: baseTime
    });

    for (const reason of [
      "Host\nprivate-reason-marker",
      "Host\u202eprivate-reason-marker",
      "Host\u200bprivate-reason-marker",
      "Host\ufeffprivate-reason-marker"
    ]) {
      try {
        SessionAuthorizationSchema.parse({
          ...denied,
          reason
        });
        throw new Error("Expected unsafe authorization reason to be rejected");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).not.toContain("private-reason-marker");
        expect((error as Error).message).not.toContain(reason);
      }
    }
  });

  it("rejects secret-bearing lifecycle reasons without exposing raw reason text", () => {
    const active = activateSessionAuthorization(
      approveSessionAuthorization(pending(), {
        grantedPermissions: ["screen:view"],
        now: baseTime
      }),
      { visibleToHost: true, now: baseTime }
    );
    const paused = pauseSessionAuthorization(active, { now: baseTime });
    const denied = denySessionAuthorization(pending(), {
      reason: "Host denied",
      now: baseTime
    });

    for (const reason of secretBearingReasons) {
      const operations = [
        () => denySessionAuthorization(pending(), { reason, now: baseTime }),
        () =>
          revokeSessionPermission(active, {
            permission: "screen:view",
            reason,
            now: baseTime
          }),
        () => pauseSessionAuthorization(active, { reason, now: baseTime }),
        () => resumeSessionAuthorization(paused, { reason, now: baseTime }),
        () => terminateSessionAuthorization(active, { reason, now: baseTime }),
        () =>
          SessionAuthorizationSchema.parse({
            ...denied,
            reason
          })
      ];

      for (const operation of operations) {
        try {
          operation();
          throw new Error("Expected secret-bearing authorization reason to be rejected");
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toContain("sensitive metadata");
          expect((error as Error).message).not.toContain("raw-authz");
          expect((error as Error).message).not.toContain(reason);
        }
      }
    }
  });

  it("accepts safe non-secret lifecycle reasons", () => {
    const active = activateSessionAuthorization(
      approveSessionAuthorization(pending(), {
        grantedPermissions: ["screen:view"],
        now: baseTime
      }),
      { visibleToHost: true, now: baseTime }
    );
    const denied = denySessionAuthorization(pending(), {
      reason: "Host denied",
      now: baseTime
    });
    const paused = pauseSessionAuthorization(active, {
      reason: "Host paused",
      now: baseTime
    });

    expect(denied.reason).toBe("Host denied");
    expect(paused.reason).toBe("Host paused");
    expect(
      SessionAuthorizationSchema.parse({
        ...denied,
        reason: "Host denied support request"
      }).reason
    ).toBe("Host denied support request");
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

  it("terminates paused visible sessions fail closed", () => {
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
    const terminated = terminateSessionAuthorization(paused, {
      reason: "Host disconnected",
      now: baseTime
    });

    expect(terminated).toMatchObject({
      status: "terminated",
      permissions: [],
      terminatedAt: baseTime.toISOString()
    });
    expect(() =>
      assertSessionActionAuthorized({
        authorization: terminated,
        permission: "screen:view",
        now: baseTime
      })
    ).toThrow("terminated");
  });

  it("rejects unsafe session termination transitions", () => {
    const approved = approveSessionAuthorization(pending(), {
      grantedPermissions: ["screen:view"],
      now: baseTime
    });
    const active = activateSessionAuthorization(approved, {
      visibleToHost: true,
      now: baseTime
    });
    const paused = pauseSessionAuthorization(active, {
      reason: "Host paused",
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
    const expiredTime = new Date("2026-06-11T00:31:00.000Z");
    const expired = expireSessionAuthorization(active, expiredTime);

    for (const authorization of [pending(), approved, denied, revoked, terminated, expired]) {
      expect(() =>
        terminateSessionAuthorization(authorization, {
          reason: "Host disconnected",
          now: baseTime
        })
      ).toThrow(authorization.status);
    }

    expect(() =>
      terminateSessionAuthorization(
        {
          ...active,
          visibleToHost: false
        },
        {
          reason: "Host disconnected",
          now: baseTime
        }
      )
    ).toThrow("visible");
    expect(() =>
      terminateSessionAuthorization(active, {
        reason: "Host disconnected",
        now: expiredTime
      })
    ).toThrow("expired");
    expect(() =>
      terminateSessionAuthorization(paused, {
        reason: "Host disconnected",
        now: expiredTime
      })
    ).toThrow("expired");
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

  it("preserves terminal authorization status after later expiration checks", () => {
    const active = activateSessionAuthorization(
      approveSessionAuthorization(pending(), {
        grantedPermissions: ["screen:view"],
        now: baseTime
      }),
      { visibleToHost: true, now: baseTime }
    );
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
    const firstExpiredAt = new Date("2026-06-11T00:31:00.000Z");
    const expired = expireSessionAuthorization(active, firstExpiredAt);
    const later = new Date("2026-06-11T00:45:00.000Z");

    for (const authorization of [denied, revoked, terminated, expired]) {
      const checked = expireSessionAuthorization(authorization, later);

      expect(checked).toEqual(authorization);
      expect(checked.permissions).toEqual([]);
      expect(() =>
        assertSessionActionAuthorized({
          authorization: checked,
          permission: "screen:view",
          now: later
        })
      ).toThrow(authorization.status);
    }
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

  it("rejects clipboard permissions until an explicit clipboard capability exists", () => {
    const active = activateSessionAuthorization(
      approveSessionAuthorization(pending(), {
        grantedPermissions: ["screen:view"],
        now: baseTime
      }),
      { visibleToHost: true, now: baseTime }
    );

    for (const rawPermission of ["clipboard:read", "clipboard:write"] as const) {
      const clipboardPermissions = [rawPermission] as unknown as Parameters<
        typeof createPendingSessionAuthorization
      >[0]["requestedPermissions"];
      const clipboardGrant = [rawPermission] as unknown as Parameters<
        typeof approveSessionAuthorization
      >[1]["grantedPermissions"];
      const clipboardPermission = rawPermission as unknown as Parameters<
        typeof revokeSessionPermission
      >[1]["permission"];

      expect(() =>
        createPendingSessionAuthorization({
          sessionId: "session-demo",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          requestedPermissions: clipboardPermissions,
          now: baseTime
        })
      ).toThrow();
      expect(() =>
        approveSessionAuthorization(pending(), {
          grantedPermissions: clipboardGrant,
          now: baseTime
        })
      ).toThrow();
      expect(() =>
        SessionAuthorizationSchema.parse({
          ...pending(),
          permissions: clipboardPermissions
        })
      ).toThrow();
      expect(() =>
        assertConsentBoundGrant({
          sessionId: "session-demo",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          permissions: clipboardPermissions,
          requiresHostApproval: true,
          visibleSessionRequired: true,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          auditId: "audit-demo"
        })
      ).toThrow();
      expect(() =>
        revokeSessionPermission(active, {
          permission: clipboardPermission,
          now: baseTime
        })
      ).toThrow();
      expect(() =>
        assertSessionActionAuthorized({
          authorization: active,
          permission: clipboardPermission,
          now: baseTime
        })
      ).toThrow();
    }
  });

  it("rejects diagnostics permissions until an explicit diagnostics capability exists", () => {
    const active = activateSessionAuthorization(
      approveSessionAuthorization(pending(), {
        grantedPermissions: ["screen:view"],
        now: baseTime
      }),
      { visibleToHost: true, now: baseTime }
    );
    const diagnosticsPermissions = ["diagnostics:view"] as unknown as Parameters<
      typeof createPendingSessionAuthorization
    >[0]["requestedPermissions"];
    const diagnosticsGrant = ["diagnostics:view"] as unknown as Parameters<
      typeof approveSessionAuthorization
    >[1]["grantedPermissions"];
    const diagnosticsPermission = "diagnostics:view" as unknown as Parameters<
      typeof revokeSessionPermission
    >[1]["permission"];

    expect(() =>
      createPendingSessionAuthorization({
        sessionId: "session-demo",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        requestedPermissions: diagnosticsPermissions,
        now: baseTime
      })
    ).toThrow();
    expect(() =>
      approveSessionAuthorization(pending(), {
        grantedPermissions: diagnosticsGrant,
        now: baseTime
      })
    ).toThrow();
    expect(() =>
      SessionAuthorizationSchema.parse({
        ...pending(),
        permissions: diagnosticsPermissions
      })
    ).toThrow();
    expect(() =>
      assertConsentBoundGrant({
        sessionId: "session-demo",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        permissions: diagnosticsPermissions,
        requiresHostApproval: true,
        visibleSessionRequired: true,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        auditId: "audit-demo"
      })
    ).toThrow();
    expect(() =>
      revokeSessionPermission(active, {
        permission: diagnosticsPermission,
        now: baseTime
      })
    ).toThrow();
    expect(() =>
      assertSessionActionAuthorized({
        authorization: active,
        permission: diagnosticsPermission,
        now: baseTime
      })
    ).toThrow();
  });

  it("rejects covert and high-risk administrative permission shapes", () => {
    const active = activateSessionAuthorization(
      approveSessionAuthorization(pending(), {
        grantedPermissions: ["screen:view"],
        now: baseTime
      }),
      { visibleToHost: true, now: baseTime }
    );

    for (const rawPermission of unsafePermissionShapes) {
      const unsafePermissions = [rawPermission] as unknown as Parameters<
        typeof createPendingSessionAuthorization
      >[0]["requestedPermissions"];
      const unsafeGrant = [rawPermission] as unknown as Parameters<
        typeof approveSessionAuthorization
      >[1]["grantedPermissions"];
      const unsafePermission = rawPermission as unknown as Parameters<
        typeof revokeSessionPermission
      >[1]["permission"];

      expect(() =>
        createPendingSessionAuthorization({
          sessionId: "session-demo",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          requestedPermissions: unsafePermissions,
          now: baseTime
        })
      ).toThrow();
      expect(() =>
        approveSessionAuthorization(pending(), {
          grantedPermissions: unsafeGrant,
          now: baseTime
        })
      ).toThrow();
      expect(() =>
        SessionAuthorizationSchema.parse({
          ...pending(),
          permissions: unsafePermissions
        })
      ).toThrow();
      expect(() =>
        assertConsentBoundGrant({
          sessionId: "session-demo",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          permissions: unsafePermissions,
          requiresHostApproval: true,
          visibleSessionRequired: true,
          expiresAt: new Date(baseTime.getTime() + 60_000).toISOString(),
          auditId: "audit-demo"
        })
      ).toThrow();
      expect(() =>
        revokeSessionPermission(active, {
          permission: unsafePermission,
          now: baseTime
        })
      ).toThrow();
      expect(() =>
        assertSessionActionAuthorized({
          authorization: active,
          permission: unsafePermission,
          now: baseTime
        })
      ).toThrow();
    }
  });
});
