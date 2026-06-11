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
  terminateSessionAuthorization
} from "./authorization.js";
import { createPairingTicket, createPairedDevice } from "./identity.js";

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
    ).toThrow("visible host session");
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

    expect(expireSessionAuthorization(active, afterExpiry).status).toBe("expired");
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
