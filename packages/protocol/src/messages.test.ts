import { describe, expect, it } from "vitest";
import {
  createMessageBase,
  encodeProtocolEnvelope,
  parseProtocolEnvelope
} from "./messages.js";
import { assertConsentBoundGrant } from "./session.js";

describe("protocol envelopes", () => {
  it("accepts a valid hello message", () => {
    const parsed = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "hello",
      peerId: "host-1",
      role: "host",
      displayName: "Host",
      capabilities: ["session:visible"]
    });

    expect(parsed.type).toBe("hello");
  });

  it("rejects unknown protocol messages", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "unknown",
        peerId: "host-1"
      })
    ).toThrow();
  });

  it("rejects blank hello display names", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "hello",
        peerId: "host-1",
        role: "host",
        displayName: "   ",
        capabilities: ["session:visible"]
      })
    ).toThrow("Display name must not be blank");
  });

  it("rejects blank hello capabilities", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "hello",
        peerId: "host-1",
        role: "host",
        displayName: "Host",
        capabilities: ["session:visible", "   "]
      })
    ).toThrow("Capability must not be blank");
  });

  it("rejects duplicate hello capabilities", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "hello",
        peerId: "host-1",
        role: "host",
        displayName: "Host",
        capabilities: ["session:visible", "session:visible"]
      })
    ).toThrow("capabilities must be unique");
  });

  it("encodes only schema-valid envelopes", () => {
    const encoded = encodeProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "relay-ready",
      peerId: "viewer-1",
      roomSize: 1
    });

    expect(JSON.parse(encoded)).toMatchObject({ type: "relay-ready" });
  });

  it("accepts safe non-empty signal payloads", () => {
    const parsed = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "signal",
      fromPeerId: "host-1",
      toPeerId: "viewer-1",
      payload: {
        authorizationId: "authz-demo",
        kind: "offer",
        sdp: "v=0",
        candidates: [{ candidate: "candidate:1 1 udp 1 127.0.0.1 9 typ host" }]
      }
    });

    expect(parsed).toMatchObject({
      type: "signal",
      fromPeerId: "host-1",
      payload: {
        authorizationId: "authz-demo",
        kind: "offer",
        sdp: "v=0"
      }
    });
  });

  it("rejects signal payloads without top-level authorization identifiers", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "signal",
        fromPeerId: "host-1",
        toPeerId: "viewer-1",
        payload: {
          kind: "offer"
        }
      })
    ).toThrow("Signal payload requires authorizationId");
  });

  it("rejects signal payloads with malformed authorization identifiers", () => {
    for (const authorizationId of ["", "   ", "authz/unsafe", "x"]) {
      expect(() =>
        parseProtocolEnvelope({
          ...createMessageBase("session-demo"),
          type: "signal",
          fromPeerId: "host-1",
          toPeerId: "viewer-1",
          payload: {
            authorizationId,
            kind: "offer"
          }
        })
      ).toThrow("Signal payload authorizationId must be a valid protocol identifier");
    }
  });

  it("rejects empty signal payloads", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "signal",
        fromPeerId: "host-1",
        toPeerId: "viewer-1",
        payload: {}
      })
    ).toThrow("Signal payload must not be empty");
  });

  it("rejects oversized signal payloads", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "signal",
        fromPeerId: "host-1",
        toPeerId: "viewer-1",
        payload: {
          authorizationId: "authz-demo",
          kind: "offer",
          sdp: "x".repeat(16 * 1024)
        }
      })
    ).toThrow("Signal payload must be 16384 bytes or less");
  });

  it("rejects signal payloads with nested sensitive keys", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "signal",
        fromPeerId: "host-1",
        toPeerId: "viewer-1",
        payload: {
          authorizationId: "authz-demo",
          kind: "offer",
          nested: [{ pairingCode: "123-456" }]
        }
      })
    ).toThrow("must not contain sensitive remote-assistance data");
  });

  it("rejects signal payloads with auth and session secret keys", () => {
    const unsafePayloads: Array<Record<string, unknown>> = [
      { apiKey: "raw-api-key" },
      { authorization: "Bearer raw-token" },
      { rawAuthorizationHeader: "Authorization: Bearer raw-token" },
      { authHeaderValue: "Bearer raw-token" },
      { proxyAuthorization: "Proxy raw-secret" },
      { sessionCookie: "sid=raw-cookie" },
      { privateKey: "raw-private-key" },
      { nested: [{ rawAuthorizationHeader: "Authorization: Bearer nested-token" }] }
    ];

    for (const payload of unsafePayloads) {
      expect(() =>
        parseProtocolEnvelope({
          ...createMessageBase("session-demo"),
          type: "signal",
          fromPeerId: "host-1",
          toPeerId: "viewer-1",
          payload: {
            authorizationId: "authz-demo",
            ...payload
          }
        })
      ).toThrow("must not contain sensitive remote-assistance data");
    }
  });

  it("rejects signal payloads with remote-assistance content keys", () => {
    const unsafePayloads: Array<Record<string, unknown>> = [
      { clipboardText: "raw-clipboard-text" },
      { fileContent: "raw-file-content" },
      { fileData: "raw-file-data" },
      { fileBytes: "raw-file-bytes" },
      { fileTransfer: { content: "raw-file-transfer" } },
      { diagnosticDump: "raw-diagnostic-dump" },
      { diagnostics: { content: "raw-diagnostics-content" } },
      { nested: [{ clipboardContents: "nested-clipboard-text" }] }
    ];

    for (const payload of unsafePayloads) {
      expect(() =>
        parseProtocolEnvelope({
          ...createMessageBase("session-demo"),
          type: "signal",
          fromPeerId: "host-1",
          toPeerId: "viewer-1",
          payload: {
            authorizationId: "authz-demo",
            ...payload
          }
        })
      ).toThrow("must not contain sensitive remote-assistance data");
    }
  });

  it("accepts signal payloads with non-secret lifecycle authorization identifiers", () => {
    const parsed = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "signal",
      fromPeerId: "host-1",
      toPeerId: "viewer-1",
      payload: {
        kind: "candidate",
        authorizationId: "authz-demo",
        nested: {
          authorizationId: "authz-nested"
        }
      }
    });

    expect(parsed).toMatchObject({
      type: "signal",
      payload: {
        authorizationId: "authz-demo",
        nested: {
          authorizationId: "authz-nested"
        }
      }
    });
  });

  it("rejects unsafe signal payloads when encoding protocol messages", () => {
    expect(() =>
      encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "signal",
        fromPeerId: "host-1",
        toPeerId: "viewer-1",
        payload: {
          authorizationId: "authz-demo",
          kind: "offer",
          screenContent: "raw screen"
        }
      })
    ).toThrow("must not contain sensitive remote-assistance data");
  });

  it("accepts peer disconnect notices with bounded reason codes", () => {
    const parsed = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "peer-disconnected",
      peerId: "host-1",
      role: "host",
      reasonCode: "peer-closed"
    });

    expect(parsed).toMatchObject({
      type: "peer-disconnected",
      peerId: "host-1",
      role: "host",
      reasonCode: "peer-closed"
    });
  });

  it("rejects peer disconnect notices with unsafe free-form reason codes", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "peer-disconnected",
        peerId: "viewer-1",
        role: "viewer",
        reasonCode: "raw close reason with local detail"
      })
    ).toThrow();
  });

  it("accepts join messages with local device identity", () => {
    const parsed = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "join-session",
      peerId: "viewer-1",
      role: "viewer",
      pairingCode: "123-456",
      deviceIdentity: {
        deviceId: "dev_viewer_1",
        displayName: "Viewer laptop",
        platform: "windows",
        trustLevel: "local-dev",
        createdAt: new Date().toISOString()
      }
    });

    expect(parsed.type).toBe("join-session");
  });

  it("accepts current development protocol identifiers", () => {
    const parsed = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      messageId: "msg_123e4567-e89b-12d3-a456-426614174000",
      type: "session-authorization-state",
      authorizationId: "authz_123e4567-e89b-12d3-a456-426614174000",
      actorPeerId: "host-1",
      status: "active",
      visibleToHost: true,
      permissions: ["screen:view"],
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    });

    expect(parsed).toMatchObject({
      type: "session-authorization-state",
      sessionId: "session-demo",
      authorizationId: "authz_123e4567-e89b-12d3-a456-426614174000",
      actorPeerId: "host-1"
    });
  });

  it("rejects oversized protocol identifiers", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("s".repeat(129)),
        type: "hello",
        peerId: "host-1",
        role: "host",
        displayName: "Host",
        capabilities: ["session:visible"]
      })
    ).toThrow();
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "relay-ready",
        peerId: "p".repeat(129),
        roomSize: 1
      })
    ).toThrow();
  });

  it("rejects unsafe protocol identifier characters", () => {
    for (const peerId of ["host 1", "host\n1", "../host-1", "{host-1}"]) {
      expect(() =>
        parseProtocolEnvelope({
          ...createMessageBase("session-demo"),
          type: "hello",
          peerId,
          role: "host",
          displayName: "Host",
          capabilities: ["session:visible"]
        })
      ).toThrow();
    }
  });

  it("accepts valid legacy host consent request and decision messages", () => {
    const request = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "host-consent-required",
      viewerPeerId: "viewer-1",
      viewerDisplayName: "Viewer",
      requestedPermissions: ["screen:view"]
    });
    const approval = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "host-consent-decision",
      hostPeerId: "host-1",
      viewerPeerId: "viewer-1",
      approved: true,
      grantedPermissions: ["screen:view"]
    });
    const denial = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "host-consent-decision",
      hostPeerId: "host-1",
      viewerPeerId: "viewer-1",
      approved: false,
      grantedPermissions: [],
      reason: "Host denied"
    });

    expect(request.type).toBe("host-consent-required");
    expect(approval.type).toBe("host-consent-decision");
    expect(denial.type).toBe("host-consent-decision");
  });

  it("rejects malformed legacy host consent request permissions", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "host-consent-required",
        viewerPeerId: "viewer-1",
        viewerDisplayName: "Viewer",
        requestedPermissions: []
      })
    ).toThrow();
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "host-consent-required",
        viewerPeerId: "viewer-1",
        viewerDisplayName: "Viewer",
        requestedPermissions: ["screen:view", "screen:view"]
      })
    ).toThrow("requestedPermissions must be unique");
  });

  it("rejects blank legacy host consent request display names", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "host-consent-required",
        viewerPeerId: "viewer-1",
        viewerDisplayName: "   ",
        requestedPermissions: ["screen:view"]
      })
    ).toThrow("Display name must not be blank");
  });

  it("rejects malformed legacy host consent decision grants", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "host-consent-decision",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        approved: true,
        grantedPermissions: []
      })
    ).toThrow("require granted permissions");
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "host-consent-decision",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        approved: true,
        grantedPermissions: ["screen:view", "screen:view"]
      })
    ).toThrow("grantedPermissions must be unique");
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "host-consent-decision",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        approved: false,
        grantedPermissions: ["screen:view"],
        reason: "Host denied"
      })
    ).toThrow("cannot grant permissions");
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "host-consent-decision",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        approved: false,
        grantedPermissions: []
      })
    ).toThrow("require a reason");
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "host-consent-decision",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        approved: false,
        grantedPermissions: [],
        reason: "   "
      })
    ).toThrow("must not be blank");
  });

  it("accepts session authorization request messages", () => {
    const parsed = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "session-authorization-request",
      viewerPeerId: "viewer-1",
      requestedPermissions: ["screen:view"],
      reason: "Support request"
    });

    expect(parsed.type).toBe("session-authorization-request");
  });

  it("rejects duplicate authorization request permissions", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-authorization-request",
        viewerPeerId: "viewer-1",
        requestedPermissions: ["screen:view", "screen:view"]
      })
    ).toThrow("requestedPermissions must be unique");
  });

  it("rejects blank authorization request reasons", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-authorization-request",
        viewerPeerId: "viewer-1",
        requestedPermissions: ["screen:view"],
        reason: "   "
      })
    ).toThrow("must not be blank");
  });

  it("accepts authorization request messages that omit optional reason", () => {
    const parsed = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "session-authorization-request",
      viewerPeerId: "viewer-1",
      requestedPermissions: ["screen:view"]
    });

    expect(parsed).toMatchObject({
      type: "session-authorization-request",
      requestedPermissions: ["screen:view"]
    });
  });

  it("accepts approved session authorization decisions with expiration", () => {
    const parsed = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "session-authorization-decision",
      authorizationId: "authz-demo",
      hostPeerId: "host-1",
      viewerPeerId: "viewer-1",
      decision: "approved",
      grantedPermissions: ["screen:view"],
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    });

    expect(parsed.type).toBe("session-authorization-decision");
  });

  it("rejects approved session authorization decisions without granted permissions", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-authorization-decision",
        authorizationId: "authz-demo",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        decision: "approved",
        grantedPermissions: [],
        expiresAt: new Date(Date.now() + 60_000).toISOString()
      })
    ).toThrow("require granted permissions");
  });

  it("rejects session authorization decisions with duplicate grants", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-authorization-decision",
        authorizationId: "authz-demo",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        decision: "approved",
        grantedPermissions: ["screen:view", "screen:view"],
        expiresAt: new Date(Date.now() + 60_000).toISOString()
      })
    ).toThrow("grantedPermissions must be unique");
  });

  it("accepts denied session authorization decisions with reason and no grants", () => {
    const parsed = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "session-authorization-decision",
      authorizationId: "authz-demo",
      hostPeerId: "host-1",
      viewerPeerId: "viewer-1",
      decision: "denied",
      grantedPermissions: [],
      reason: "Host denied"
    });

    expect(parsed.type).toBe("session-authorization-decision");
  });

  it("rejects denied session authorization decisions with granted permissions", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-authorization-decision",
        authorizationId: "authz-demo",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        decision: "denied",
        grantedPermissions: ["screen:view"],
        reason: "Host denied"
      })
    ).toThrow("cannot grant permissions");
  });

  it("rejects denied session authorization decisions with expiration", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-authorization-decision",
        authorizationId: "authz-demo",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        decision: "denied",
        grantedPermissions: [],
        reason: "Host denied",
        expiresAt: new Date(Date.now() + 60_000).toISOString()
      })
    ).toThrow("cannot include expiresAt");
  });

  it("rejects blank session authorization decision reasons", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-authorization-decision",
        authorizationId: "authz-demo",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        decision: "denied",
        grantedPermissions: [],
        reason: "   "
      })
    ).toThrow("must not be blank");
  });

  it("rejects approved session authorization decisions without expiration", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-authorization-decision",
        authorizationId: "authz-demo",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        decision: "approved",
        grantedPermissions: ["screen:view"]
      })
    ).toThrow();
  });

  it("accepts active visible session authorization state updates", () => {
    const parsed = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "session-authorization-state",
      authorizationId: "authz-demo",
      actorPeerId: "host-1",
      status: "active",
      visibleToHost: true,
      permissions: ["screen:view"],
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    });

    expect(parsed.type).toBe("session-authorization-state");
  });

  it("accepts terminal session authorization state updates with empty permissions", () => {
    const parsed = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "session-authorization-state",
      authorizationId: "authz-demo",
      actorPeerId: "host-1",
      status: "revoked",
      visibleToHost: true,
      permissions: [],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      reason: "Host revoked"
    });

    expect(parsed).toMatchObject({
      type: "session-authorization-state",
      status: "revoked",
      permissions: []
    });
  });

  it("rejects active session authorization state updates that are not visible to host", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-authorization-state",
        authorizationId: "authz-demo",
        actorPeerId: "host-1",
        status: "active",
        visibleToHost: false,
        permissions: ["screen:view"],
        expiresAt: new Date(Date.now() + 60_000).toISOString()
      })
    ).toThrow();
  });

  it("rejects pending, approved, or denied session authorization state updates that report host visibility", () => {
    const approved = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "session-authorization-state",
      authorizationId: "authz-demo",
      actorPeerId: "host-1",
      status: "approved",
      visibleToHost: false,
      permissions: ["screen:view"],
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    });

    expect(approved).toMatchObject({
      type: "session-authorization-state",
      status: "approved",
      visibleToHost: false
    });

    for (const state of [
      { status: "pending", permissions: [] },
      { status: "approved", permissions: ["screen:view"] },
      { status: "denied", permissions: [] }
    ] as const) {
      expect(() =>
        parseProtocolEnvelope({
          ...createMessageBase("session-demo"),
          type: "session-authorization-state",
          authorizationId: "authz-demo",
          actorPeerId: "host-1",
          status: state.status,
          visibleToHost: true,
          permissions: state.permissions,
          expiresAt: new Date(Date.now() + 60_000).toISOString()
        })
      ).toThrow("cannot be visible before activation");
    }
  });

  it("accepts visible terminal state updates after active sessions fail closed", () => {
    for (const status of ["revoked", "terminated", "expired"] as const) {
      const parsed = parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-authorization-state",
        authorizationId: "authz-demo",
        actorPeerId: "host-1",
        status,
        visibleToHost: true,
        permissions: [],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        reason: `Host ${status}`
      });

      expect(parsed).toMatchObject({
        type: "session-authorization-state",
        status,
        visibleToHost: true,
        permissions: []
      });
    }
  });

  it("rejects grant-bearing state updates without permissions", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-authorization-state",
        authorizationId: "authz-demo",
        actorPeerId: "host-1",
        status: "active",
        visibleToHost: true,
        permissions: [],
        expiresAt: new Date(Date.now() + 60_000).toISOString()
      })
    ).toThrow("requires permissions");
  });

  it("rejects state updates with duplicate permissions", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-authorization-state",
        authorizationId: "authz-demo",
        actorPeerId: "host-1",
        status: "active",
        visibleToHost: true,
        permissions: ["screen:view", "screen:view"],
        expiresAt: new Date(Date.now() + 60_000).toISOString()
      })
    ).toThrow("permissions must be unique");
  });

  it("rejects fail-closed state updates that carry permissions", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-authorization-state",
        authorizationId: "authz-demo",
        actorPeerId: "host-1",
        status: "terminated",
        visibleToHost: true,
        permissions: ["screen:view"],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        reason: "Host terminated"
      })
    ).toThrow("cannot carry permissions");
  });

  it("rejects blank session authorization state reasons", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-authorization-state",
        authorizationId: "authz-demo",
        actorPeerId: "host-1",
        status: "revoked",
        visibleToHost: true,
        permissions: [],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        reason: "   "
      })
    ).toThrow("must not be blank");
  });

  it("accepts paused visible session authorization state updates", () => {
    const parsed = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "session-authorization-state",
      authorizationId: "authz-demo",
      actorPeerId: "host-1",
      status: "paused",
      visibleToHost: true,
      permissions: ["screen:view"],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      reason: "Host paused"
    });

    expect(parsed).toMatchObject({
      type: "session-authorization-state",
      status: "paused",
      visibleToHost: true
    });
  });

  it("rejects paused session authorization state updates that are not visible to host", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-authorization-state",
        authorizationId: "authz-demo",
        actorPeerId: "host-1",
        status: "paused",
        visibleToHost: false,
        permissions: ["screen:view"],
        expiresAt: new Date(Date.now() + 60_000).toISOString()
      })
    ).toThrow();
  });

  it("accepts valid session control messages", () => {
    const pause = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "session-control",
      authorizationId: "authz-demo",
      actorPeerId: "host-1",
      action: "pause",
      reason: "Host paused"
    });
    const resume = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "session-control",
      authorizationId: "authz-demo",
      actorPeerId: "host-1",
      action: "resume",
      reason: "Host resumed"
    });
    const terminate = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "session-control",
      authorizationId: "authz-demo",
      actorPeerId: "host-1",
      action: "terminate",
      reason: "Host terminated"
    });
    const revokePermission = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "session-control",
      authorizationId: "authz-demo",
      actorPeerId: "host-1",
      action: "revoke-permission",
      permission: "screen:view",
      reason: "Host revoked screen"
    });

    expect(pause).toMatchObject({ type: "session-control", action: "pause" });
    expect(resume).toMatchObject({ type: "session-control", action: "resume" });
    expect(terminate).toMatchObject({ type: "session-control", action: "terminate" });
    expect(revokePermission).toMatchObject({
      type: "session-control",
      authorizationId: "authz-demo",
      action: "revoke-permission",
      permission: "screen:view"
    });
  });

  it("rejects session control messages without authorization binding", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-control",
        actorPeerId: "host-1",
        action: "pause",
        reason: "Host paused"
      })
    ).toThrow();
  });

  it("rejects ambiguous session control permission payloads", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-control",
        authorizationId: "authz-demo",
        actorPeerId: "host-1",
        action: "revoke-permission",
        reason: "Host revoked screen"
      })
    ).toThrow("require permission");

    for (const action of ["pause", "resume", "terminate"] as const) {
      expect(() =>
        parseProtocolEnvelope({
          ...createMessageBase("session-demo"),
          type: "session-control",
          authorizationId: "authz-demo",
          actorPeerId: "host-1",
          action,
          permission: "screen:view",
          reason: "Invalid permission payload"
        })
      ).toThrow("cannot include permission");
    }
  });

  it("rejects blank session control reasons", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-control",
        authorizationId: "authz-demo",
        actorPeerId: "host-1",
        action: "pause",
        reason: "   "
      })
    ).toThrow("must not be blank");
  });

  it("accepts permission revoke messages", () => {
    const parsed = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "permission-revoked",
      authorizationId: "authz-demo",
      actorPeerId: "host-1",
      revokedPermission: "input:keyboard",
      reason: "Host revoked keyboard"
    });

    expect(parsed.type).toBe("permission-revoked");
  });

  it("rejects blank permission revoke reasons", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "permission-revoked",
        authorizationId: "authz-demo",
        actorPeerId: "host-1",
        revokedPermission: "input:keyboard",
        reason: "   "
      })
    ).toThrow("must not be blank");
  });

  it("rejects malformed authorization permissions", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "permission-revoked",
        authorizationId: "authz-demo",
        actorPeerId: "host-1",
        revokedPermission: "input:keylogger",
        reason: "Invalid"
      })
    ).toThrow();
  });

  it("redacts sensitive audit-event detail fields when parsing protocol messages", () => {
    const parsed = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "audit-event",
      eventId: "audit-demo",
      actorPeerId: "host-1",
      action: "agent-shell.test",
      outcome: "accepted",
      detail: {
        token: "raw-token",
        credential: "raw-credential",
        password: "raw-password",
        pairingCode: "123-456",
        keystroke: "typed secret",
        screenshot: "image bytes",
        screenData: "screen bytes",
        screenContent: "visible data",
        clipboardText: "clipboard data",
        fileContent: "file data",
        fileBytes: "file bytes",
        diagnosticDump: "diagnostic data",
        secret: "raw-secret",
        safeCount: 2
      }
    });

    expect(parsed).toMatchObject({
      type: "audit-event",
      detail: {
        token: "[REDACTED]",
        credential: "[REDACTED]",
        password: "[REDACTED]",
        pairingCode: "[REDACTED]",
        keystroke: "[REDACTED]",
        screenshot: "[REDACTED]",
        screenData: "[REDACTED]",
        screenContent: "[REDACTED]",
        clipboardText: "[REDACTED]",
        fileContent: "[REDACTED]",
        fileBytes: "[REDACTED]",
        diagnosticDump: "[REDACTED]",
        secret: "[REDACTED]",
        safeCount: 2
      }
    });
    expect(JSON.stringify(parsed)).not.toContain("raw-token");
    expect(JSON.stringify(parsed)).not.toContain("123-456");
    expect(JSON.stringify(parsed)).not.toContain("clipboard data");
    expect(JSON.stringify(parsed)).not.toContain("file data");
    expect(JSON.stringify(parsed)).not.toContain("diagnostic data");
  });

  it("redacts nested sensitive audit-event detail fields in objects and arrays", () => {
    const parsed = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "audit-event",
      eventId: "audit-demo",
      actorPeerId: "host-1",
      action: "agent-shell.test",
      outcome: "accepted",
      detail: {
        nested: {
          safe: "kept",
          token: "nested-token"
        },
        attempts: [
          {
            credential: "nested-credential",
            remaining: 1
          }
        ]
      }
    });

    expect(parsed).toMatchObject({
      type: "audit-event",
      detail: {
        nested: {
          safe: "kept",
          token: "[REDACTED]"
        },
        attempts: [
          {
            credential: "[REDACTED]",
            remaining: 1
          }
        ]
      }
    });
    expect(JSON.stringify(parsed)).not.toContain("nested-token");
    expect(JSON.stringify(parsed)).not.toContain("nested-credential");
  });

  it("redacts expanded audit-event authentication detail fields while preserving safe identifiers", () => {
    const parsed = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "audit-event",
      eventId: "audit-demo",
      actorPeerId: "host-1",
      action: "agent-shell.test",
      outcome: "accepted",
      detail: {
        apiKey: "api-key-secret",
        authorization: "Bearer raw-token",
        authHeaderValue: "decorated-auth-header",
        rawAuthorizationHeader: "raw-authorization-header",
        proxyAuthorization: "proxy-authorization-secret",
        cookie: "sid=raw-cookie",
        privateKey: "raw-private-key",
        authorizationId: "authz-demo",
        attempts: [
          {
            sessionCookie: "array-cookie",
            authorizationId: "authz-array"
          }
        ]
      }
    });

    expect(parsed).toMatchObject({
      type: "audit-event",
      detail: {
        apiKey: "[REDACTED]",
        authorization: "[REDACTED]",
        authHeaderValue: "[REDACTED]",
        rawAuthorizationHeader: "[REDACTED]",
        proxyAuthorization: "[REDACTED]",
        cookie: "[REDACTED]",
        privateKey: "[REDACTED]",
        authorizationId: "authz-demo",
        attempts: [
          {
            sessionCookie: "[REDACTED]",
            authorizationId: "authz-array"
          }
        ]
      }
    });
    expect(JSON.stringify(parsed)).not.toContain("api-key-secret");
    expect(JSON.stringify(parsed)).not.toContain("raw-token");
    expect(JSON.stringify(parsed)).not.toContain("decorated-auth-header");
    expect(JSON.stringify(parsed)).not.toContain("raw-authorization-header");
    expect(JSON.stringify(parsed)).not.toContain("proxy-authorization-secret");
    expect(JSON.stringify(parsed)).not.toContain("raw-cookie");
    expect(JSON.stringify(parsed)).not.toContain("raw-private-key");
  });

  it("redacts audit-event detail fields when encoding protocol messages", () => {
    const encoded = encodeProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "audit-event",
      eventId: "audit-demo",
      actorPeerId: "host-1",
      action: "agent-shell.test",
      outcome: "accepted",
      detail: {
        token: "raw-token",
        safe: "kept"
      }
    });
    const decoded = JSON.parse(encoded);

    expect(decoded.detail).toEqual({
      token: "[REDACTED]",
      safe: "kept"
    });
    expect(encoded).not.toContain("raw-token");
  });

  it("redacts expanded audit-event authentication detail fields when encoding protocol messages", () => {
    const encoded = encodeProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "audit-event",
      eventId: "audit-demo",
      actorPeerId: "host-1",
      action: "agent-shell.test",
      outcome: "accepted",
      detail: {
        apiKey: "api-key-secret",
        authorization: "Bearer raw-token",
        rawAuthorizationHeader: "raw-authorization-header",
        cookie: "sid=raw-cookie",
        privateKey: "raw-private-key",
        clipboardContents: "raw-clipboard",
        fileData: "raw-file-data",
        diagnostics: "raw-diagnostics",
        authorizationId: "authz-demo"
      }
    });
    const decoded = JSON.parse(encoded);

    expect(decoded.detail).toEqual({
      apiKey: "[REDACTED]",
      authorization: "[REDACTED]",
      rawAuthorizationHeader: "[REDACTED]",
      cookie: "[REDACTED]",
      privateKey: "[REDACTED]",
      clipboardContents: "[REDACTED]",
      fileData: "[REDACTED]",
      diagnostics: "[REDACTED]",
      authorizationId: "authz-demo"
    });
    expect(encoded).not.toContain("api-key-secret");
    expect(encoded).not.toContain("raw-token");
    expect(encoded).not.toContain("raw-authorization-header");
    expect(encoded).not.toContain("raw-cookie");
    expect(encoded).not.toContain("raw-private-key");
    expect(encoded).not.toContain("raw-clipboard");
    expect(encoded).not.toContain("raw-file-data");
    expect(encoded).not.toContain("raw-diagnostics");
  });

  it("defaults omitted audit-event detail to an empty object", () => {
    const parsed = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "audit-event",
      eventId: "audit-demo",
      actorPeerId: "host-1",
      action: "agent-shell.test",
      outcome: "accepted"
    });

    expect(parsed).toMatchObject({
      type: "audit-event",
      detail: {}
    });
  });

  it("rejects blank audit-event actions", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "audit-event",
        eventId: "audit-demo",
        actorPeerId: "host-1",
        action: "   ",
        outcome: "failed"
      })
    ).toThrow("Audit event action must not be blank");
  });
});

describe("session grants", () => {
  it("requires explicit host approval and visible session", () => {
    const grant = assertConsentBoundGrant({
      sessionId: "session-demo",
      hostPeerId: "host-1",
      viewerPeerId: "viewer-1",
      permissions: ["screen:view"],
      requiresHostApproval: true,
      visibleSessionRequired: true,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      auditId: "audit-demo"
    });

    expect(grant.permissions).toContain("screen:view");
  });

  it("rejects expired grants", () => {
    expect(() =>
      assertConsentBoundGrant({
        sessionId: "session-demo",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        permissions: ["screen:view"],
        requiresHostApproval: true,
        visibleSessionRequired: true,
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
        auditId: "audit-demo"
      })
    ).toThrow("expired");
  });

  it("rejects session grants without permissions", () => {
    expect(() =>
      assertConsentBoundGrant({
        sessionId: "session-demo",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        permissions: [],
        requiresHostApproval: true,
        visibleSessionRequired: true,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        auditId: "audit-demo"
      })
    ).toThrow("Session grant requires at least one permission");
  });

  it("rejects session grants with duplicate permissions", () => {
    expect(() =>
      assertConsentBoundGrant({
        sessionId: "session-demo",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        permissions: ["screen:view", "screen:view"],
        requiresHostApproval: true,
        visibleSessionRequired: true,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        auditId: "audit-demo"
      })
    ).toThrow("Session grant permissions must be unique");
  });

  it("rejects session grants with malformed identifiers", () => {
    expect(() =>
      assertConsentBoundGrant({
        sessionId: "session demo",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        permissions: ["screen:view"],
        requiresHostApproval: true,
        visibleSessionRequired: true,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        auditId: "audit-demo"
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
        auditId: "a".repeat(129)
      })
    ).toThrow();
  });
});
