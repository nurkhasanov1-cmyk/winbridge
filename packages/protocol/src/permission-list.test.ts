import { describe, expect, it } from "vitest";
import {
  createPendingSessionAuthorization,
  SessionAuthorizationSchema
} from "./authorization.js";
import { createMessageBase, parseProtocolEnvelope } from "./messages.js";
import { assertConsentBoundGrant, parsePermissionList, type Permission } from "./session.js";

const baseTime = new Date("2026-06-14T00:00:00.000Z");
const onePermission = ["screen:view"] satisfies Permission[];

describe("shared permission list validation", () => {
  it("parses safe unique permission lists and rejects ambiguous lists", () => {
    expect(parsePermissionList(onePermission, {
      allowEmpty: false,
      duplicateMessage: "custom duplicate",
      emptyMessage: "custom empty"
    })).toEqual(onePermission);
    expect(parsePermissionList([], {
      duplicateMessage: "custom duplicate"
    })).toEqual([]);
    expect(() =>
      parsePermissionList([], {
        allowEmpty: false,
        duplicateMessage: "custom duplicate",
        emptyMessage: "custom empty"
      })
    ).toThrow("custom empty");
    expect(() =>
      parsePermissionList(["screen:view", "screen:view"], {
        duplicateMessage: "custom duplicate"
      })
    ).toThrow("custom duplicate");
    expect(() =>
      parsePermissionList(new Array<Permission>(17).fill("screen:view"), {
        duplicateMessage: "custom duplicate"
      })
    ).toThrow();
    expect(() =>
      parsePermissionList(["clipboard:read"] as unknown as Permission[], {
        duplicateMessage: "custom duplicate"
      })
    ).toThrow("Permission requires an explicit capability review");
    expect(() =>
      parsePermissionList(["remote-shell"] as unknown as Permission[], {
        duplicateMessage: "custom duplicate"
      })
    ).toThrow("Permission is not supported");
  });

  it("rejects high-risk permission-shaped strings without echoing raw values", () => {
    for (const unsafePermission of ["remote-shell", "keylog:capture"] as const) {
      expectThrownMessageWithoutRaw(
        () =>
          parsePermissionList([unsafePermission] as unknown as Permission[], {
            duplicateMessage: "custom duplicate"
          }),
        unsafePermission
      );

      expectThrownMessageWithoutRaw(
        () =>
          parseProtocolEnvelope({
            ...createMessageBase("session-demo"),
            type: "session-authorization-request",
            viewerPeerId: "viewer-1",
            requestedPermissions: [unsafePermission]
          }),
        unsafePermission
      );

      expectThrownMessageWithoutRaw(
        () =>
          parseProtocolEnvelope({
            ...createMessageBase("session-demo"),
            type: "permission-revoked",
            authorizationId: "authz-demo",
            actorPeerId: "host-1",
            revokedPermission: unsafePermission,
            reason: "Host revoked unsafe permission"
          }),
        unsafePermission
      );
    }
  });

  it("keeps authorization and grant callers on the shared permission constraints", () => {
    expect(() =>
      createPendingSessionAuthorization({
        sessionId: "session-demo",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        requestedPermissions: [],
        now: baseTime
      })
    ).toThrow("Session authorization requires at least one requested permission");
    expect(() =>
      createPendingSessionAuthorization({
        sessionId: "session-demo",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        requestedPermissions: ["screen:view", "screen:view"],
        now: baseTime
      })
    ).toThrow("Requested permissions must be unique");
    expect(() =>
      SessionAuthorizationSchema.parse({
        ...createPendingSessionAuthorization({
          sessionId: "session-demo",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          requestedPermissions: onePermission,
          now: baseTime
        }),
        permissions: ["screen:view", "screen:view"]
      })
    ).toThrow("Session authorization permissions must be unique");
    expect(() =>
      assertConsentBoundGrant({
        sessionId: "session-demo",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        permissions: ["screen:view", "screen:view"],
        requiresHostApproval: true,
        visibleSessionRequired: true,
        expiresAt: "2099-01-01T00:00:00.000Z",
        auditId: "audit-demo"
      })
    ).toThrow("Session grant permissions must be unique");
  });

  it("keeps authorization protocol callers on the shared permission constraints", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-authorization-request",
        viewerPeerId: "viewer-1",
        requestedPermissions: ["screen:view", "screen:view"]
      })
    ).toThrow("requestedPermissions must be unique");
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-authorization-decision",
        authorizationId: "authz-demo",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        decision: "approved",
        grantedPermissions: ["screen:view", "screen:view"],
        expiresAt: "2099-01-01T00:00:00.000Z"
      })
    ).toThrow("grantedPermissions must be unique");
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-authorization-state",
        authorizationId: "authz-demo",
        actorPeerId: "host-1",
        status: "active",
        visibleToHost: true,
        permissions: ["screen:view", "screen:view"],
        expiresAt: "2099-01-01T00:00:00.000Z"
      })
    ).toThrow("permissions must be unique");
  });
});

function expectThrownMessageWithoutRaw(action: () => void, rawValue: string): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain("Permission is not supported");
    expect(message).not.toContain(rawValue);
    return;
  }

  throw new Error("Expected action to throw");
}
