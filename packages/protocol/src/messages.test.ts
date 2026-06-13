import { describe, expect, it } from "vitest";
import {
  createMessageBase,
  encodeProtocolEnvelope,
  parseProtocolEnvelope
} from "./messages.js";
import type { AuditDetail } from "./audit.js";
import type { JsonObject } from "./json.js";
import { assertConsentBoundGrant } from "./session.js";

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
  "Authorization: Bearer raw-protocol-token",
  "credential: raw-protocol-credential",
  "pairing code: raw-protocol-pairing-code",
  "diagnostics dump: raw-protocol-diagnostics",
  "screen content: raw-protocol-screen"
] as const;
const secretBearingDisplayNames = [
  "Authorization: Bearer raw-display-token",
  "credential: raw-display-credential",
  "pairing code: raw-display-pairing-code",
  "diagnostics dump: raw-display-diagnostics",
  "screen content: raw-display-screen"
] as const;

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

  it("rejects unknown fixed top-level protocol fields", () => {
    const validMessages = [
      {
        ...createMessageBase("session-demo"),
        type: "hello",
        peerId: "host-1",
        role: "host",
        displayName: "Host",
        capabilities: ["session:visible"]
      },
      {
        ...createMessageBase("session-demo"),
        type: "join-session",
        peerId: "viewer-1",
        role: "viewer",
        pairingCode: "123-456"
      },
      {
        ...createMessageBase("session-demo"),
        type: "host-consent-required",
        viewerPeerId: "viewer-1",
        viewerDisplayName: "Viewer",
        requestedPermissions: ["screen:view"]
      },
      {
        ...createMessageBase("session-demo"),
        type: "host-consent-decision",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        approved: true,
        grantedPermissions: ["screen:view"]
      },
      {
        ...createMessageBase("session-demo"),
        type: "session-authorization-request",
        viewerPeerId: "viewer-1",
        requestedPermissions: ["screen:view"]
      },
      {
        ...createMessageBase("session-demo"),
        type: "session-authorization-decision",
        authorizationId: "authz-demo",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        decision: "approved",
        grantedPermissions: ["screen:view"],
        expiresAt: new Date(Date.now() + 60_000).toISOString()
      },
      {
        ...createMessageBase("session-demo"),
        type: "session-authorization-state",
        authorizationId: "authz-demo",
        actorPeerId: "host-1",
        status: "active",
        visibleToHost: true,
        permissions: ["screen:view"],
        expiresAt: new Date(Date.now() + 60_000).toISOString()
      },
      {
        ...createMessageBase("session-demo"),
        type: "permission-revoked",
        authorizationId: "authz-demo",
        actorPeerId: "host-1",
        revokedPermission: "screen:view",
        reason: "Host revoked screen"
      },
      {
        ...createMessageBase("session-demo"),
        type: "relay-ready",
        peerId: "host-1",
        roomSize: 1
      },
      {
        ...createMessageBase("session-demo"),
        type: "peer-disconnected",
        peerId: "viewer-1",
        role: "viewer",
        reasonCode: "peer-closed"
      },
      {
        ...createMessageBase("session-demo"),
        type: "signal",
        fromPeerId: "host-1",
        toPeerId: "viewer-1",
        payload: {
          authorizationId: "authz-demo",
          kind: "offer"
        }
      },
      {
        ...createMessageBase("session-demo"),
        type: "session-control",
        authorizationId: "authz-demo",
        actorPeerId: "host-1",
        action: "pause"
      },
      {
        ...createMessageBase("session-demo"),
        type: "audit-event",
        eventId: "audit-demo",
        actorPeerId: "host-1",
        action: "agent-shell.test",
        outcome: "accepted"
      }
    ];

    for (const message of validMessages) {
      expect(() =>
        parseProtocolEnvelope({
          ...message,
          unknownFixedField: "must-fail"
        })
      ).toThrow();
    }
  });

  it("preserves extensible signal payload and audit detail metadata", () => {
    const signal = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "signal",
      fromPeerId: "host-1",
      toPeerId: "viewer-1",
      payload: {
        authorizationId: "authz-demo",
        kind: "offer",
        applicationMetadata: {
          safe: "kept"
        }
      }
    });
    const auditEvent = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "audit-event",
      eventId: "audit-demo",
      actorPeerId: "host-1",
      action: "agent-shell.test",
      outcome: "accepted",
      detail: {
        customMetadata: "kept",
        nested: {
          safe: true
        }
      }
    });

    expect(signal).toMatchObject({
      type: "signal",
      payload: {
        applicationMetadata: {
          safe: "kept"
        }
      }
    });
    expect(auditEvent).toMatchObject({
      type: "audit-event",
      detail: {
        customMetadata: "kept",
        nested: {
          safe: true
        }
      }
    });
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

  it("rejects untrimmed hello display names", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "hello",
        peerId: "host-1",
        role: "host",
        displayName: " Host ",
        capabilities: ["session:visible"]
      })
    ).toThrow("Display name must be trimmed");
  });

  it("rejects hello display names with ASCII control characters", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "hello",
        peerId: "host-1",
        role: "host",
        displayName: "Host\nname",
        capabilities: ["session:visible"]
      })
    ).toThrow("Display name must not contain ASCII control characters");
  });

  it("rejects hello display names with Unicode bidi or zero-width controls", () => {
    for (const displayName of ["Host\u202ename", "Host\u200bname", "Host\ufeffname"]) {
      expect(() =>
        parseProtocolEnvelope({
          ...createMessageBase("session-demo"),
          type: "hello",
          peerId: "host-1",
          role: "host",
          displayName,
          capabilities: ["session:visible"]
        })
      ).toThrow("Display name must not contain Unicode bidi or zero-width formatting controls");
    }
  });

  it("rejects secret-bearing hello display names without exposing raw text", () => {
    for (const displayName of secretBearingDisplayNames) {
      const message = {
        ...createMessageBase("session-demo"),
        type: "hello",
        peerId: "host-1",
        role: "host",
        displayName,
        capabilities: ["session:visible"]
      } as const;

      for (const operation of [
        () => parseProtocolEnvelope(message),
        () => encodeProtocolEnvelope(message as Parameters<typeof encodeProtocolEnvelope>[0])
      ]) {
        try {
          operation();
          throw new Error("Expected secret-bearing hello display name to be rejected");
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toContain("sensitive metadata");
          expect((error as Error).message).not.toContain("raw-display");
          expect((error as Error).message).not.toContain(displayName);
        }
      }
    }
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

  it("rejects untrimmed hello capabilities", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "hello",
        peerId: "host-1",
        role: "host",
        displayName: "Host",
        capabilities: ["session:visible", " consent:required"]
      })
    ).toThrow("Capability must be trimmed");
  });

  it("rejects hello capabilities with ASCII control characters", () => {
    const message = {
      ...createMessageBase("session-demo"),
      type: "hello",
      peerId: "host-1",
      role: "host",
      displayName: "Host",
      capabilities: ["session:visible", "capability\nprivate-marker"]
    } as const;

    expect(() => parseProtocolEnvelope(message)).toThrow(
      "Capability must not contain ASCII control characters"
    );
    expect(() =>
      encodeProtocolEnvelope(message as Parameters<typeof encodeProtocolEnvelope>[0])
    ).toThrow("Capability must not contain ASCII control characters");
  });

  it("rejects hello capabilities with Unicode bidi or zero-width controls", () => {
    for (const capability of [
      "capability\u202eprivate-marker",
      "capability\u200bprivate-marker",
      "capability\ufeffprivate-marker"
    ]) {
      const message = {
        ...createMessageBase("session-demo"),
        type: "hello",
        peerId: "host-1",
        role: "host",
        displayName: "Host",
        capabilities: ["session:visible", capability]
      } as const;

      expect(() => parseProtocolEnvelope(message)).toThrow(
        "Capability must not contain Unicode bidi or zero-width formatting controls"
      );
      expect(() =>
        encodeProtocolEnvelope(message as Parameters<typeof encodeProtocolEnvelope>[0])
      ).toThrow("Capability must not contain Unicode bidi or zero-width formatting controls");
    }
  });

  it("rejects unsafe hello capabilities without exposing raw private text", () => {
    for (const capability of [
      "capability-private-marker\n",
      "capability-private-marker\u202e",
      "capability-private-marker\u200b",
      "capability-private-marker\ufeff"
    ]) {
      const message = {
        ...createMessageBase("session-demo"),
        type: "hello",
        peerId: "host-1",
        role: "host",
        displayName: "Host",
        capabilities: ["session:visible", capability]
      } as const;

      try {
        parseProtocolEnvelope(message);
        throw new Error("Expected unsafe capability metadata to be rejected");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).not.toContain("capability-private-marker");
        expect((error as Error).message).not.toContain(capability);
      }
    }
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

  it("rejects trim-duplicate hello capabilities", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "hello",
        peerId: "host-1",
        role: "host",
        displayName: "Host",
        capabilities: ["session:visible", "session:visible "]
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
    const sharedMetadata = {
      relay: "local-dev"
    };
    const parsed = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "signal",
      fromPeerId: "host-1",
      toPeerId: "viewer-1",
      payload: {
        authorizationId: "authz-demo",
        kind: "offer",
        sdp: "v=0",
        revision: 1,
        trickle: true,
        optional: null,
        metadata: sharedMetadata,
        mirroredMetadata: sharedMetadata,
        candidates: [{ candidate: "candidate:1 1 udp 1 127.0.0.1 9 typ host" }]
      }
    });

    expect(parsed).toMatchObject({
      type: "signal",
      fromPeerId: "host-1",
      payload: {
        authorizationId: "authz-demo",
        kind: "offer",
        sdp: "v=0",
        revision: 1,
        trickle: true,
        optional: null,
        metadata: {
          relay: "local-dev"
        },
        mirroredMetadata: {
          relay: "local-dev"
        }
      }
    });
  });

  it("rejects non-JSON signal payload values when parsing protocol messages", () => {
    const circularPayload: Record<string, unknown> = { authorizationId: "authz-demo" };
    circularPayload.self = circularPayload;
    const symbolKeyPayload = {
      authorizationId: "authz-demo",
      safe: "kept",
      [Symbol("hidden")]: "hidden"
    };
    const nonEnumerablePayload: Record<string, unknown> = { authorizationId: "authz-demo" };
    Object.defineProperty(nonEnumerablePayload, "hidden", {
      value: "hidden",
      enumerable: false
    });
    const accessorPayload: Record<string, unknown> = { authorizationId: "authz-demo" };
    Object.defineProperty(accessorPayload, "hidden", {
      get: () => "hidden",
      enumerable: true
    });
    const sparseArrayPayload: Record<string, unknown> = {
      authorizationId: "authz-demo",
      candidates: []
    };
    (sparseArrayPayload.candidates as unknown[])[1] = { candidate: "second" };
    const arrayExtraPropertyPayload: Record<string, unknown> = {
      authorizationId: "authz-demo",
      candidates: [{ candidate: "first" }]
    };
    Object.defineProperty(arrayExtraPropertyPayload.candidates as object, "hidden", {
      value: "hidden",
      enumerable: true
    });
    const invalidPayloads: Array<Record<string, unknown>> = [
      { authorizationId: "authz-demo", handler: () => "handled" },
      { authorizationId: "authz-demo", marker: Symbol("marker") },
      { authorizationId: "authz-demo", count: BigInt(1) },
      { authorizationId: "authz-demo", omitted: undefined },
      { authorizationId: "authz-demo", count: NaN },
      { authorizationId: "authz-demo", count: Infinity },
      { authorizationId: "authz-demo", count: -Infinity },
      { authorizationId: "authz-demo", nested: { handler: () => "handled" } },
      { authorizationId: "authz-demo", candidates: [undefined] },
      symbolKeyPayload,
      nonEnumerablePayload,
      accessorPayload,
      sparseArrayPayload,
      arrayExtraPropertyPayload,
      circularPayload
    ];

    for (const payload of invalidPayloads) {
      expect(() =>
        parseProtocolEnvelope({
          ...createMessageBase("session-demo"),
          type: "signal",
          fromPeerId: "host-1",
          toPeerId: "viewer-1",
          payload
        })
      ).toThrow("JSON-compatible");
    }
  });

  it("rejects non-JSON signal payload values when encoding protocol messages", () => {
    const invalidPayloads: Array<Record<string, unknown>> = [
      { authorizationId: "authz-demo", handler: () => "handled" },
      { authorizationId: "authz-demo", count: BigInt(1) },
      { authorizationId: "authz-demo", omitted: undefined },
      { authorizationId: "authz-demo", count: NaN },
      { authorizationId: "authz-demo", count: Infinity },
      { authorizationId: "authz-demo", count: -Infinity },
      { authorizationId: "authz-demo", candidates: [undefined] }
    ];

    for (const payload of invalidPayloads) {
      expect(() =>
        encodeProtocolEnvelope({
          ...createMessageBase("session-demo"),
          type: "signal",
          fromPeerId: "host-1",
          toPeerId: "viewer-1",
          payload: payload as JsonObject
        })
      ).toThrow("JSON-compatible");
    }
  });

  it("rejects unsafe signal payload keys without exposing raw private text", () => {
    const cases = [
      {
        name: "ASCII control key",
        payload: { ["unsafe\nprivate-signal-key"]: "private-signal-value" },
        expectedMessage: "Signal payload keys must not contain ASCII control characters"
      },
      {
        name: "nested bidi key",
        payload: { nested: { ["unsafe\u202eprivate-signal-key"]: "private-signal-value" } },
        expectedMessage:
          "Signal payload keys must not contain Unicode bidi or zero-width formatting controls"
      },
      {
        name: "array zero-width key",
        payload: { candidates: [{ ["unsafe\ufeffprivate-signal-key"]: "private-signal-value" }] },
        expectedMessage:
          "Signal payload keys must not contain Unicode bidi or zero-width formatting controls"
      }
    ] satisfies Array<{
      name: string;
      payload: Record<string, unknown>;
      expectedMessage: string;
    }>;

    for (const testCase of cases) {
      const signalMessage = {
        ...createMessageBase("session-demo"),
        type: "signal",
        fromPeerId: "host-1",
        toPeerId: "viewer-1",
        payload: {
          authorizationId: "authz-demo",
          kind: "offer",
          ...testCase.payload
        }
      } as const;

      for (const operation of [
        () => parseProtocolEnvelope(signalMessage),
        () => encodeProtocolEnvelope(signalMessage as Parameters<typeof encodeProtocolEnvelope>[0])
      ]) {
        let thrown: unknown;
        try {
          operation();
        } catch (error) {
          thrown = error;
        }

        expect(thrown, testCase.name).toBeInstanceOf(Error);
        const message = thrown instanceof Error ? thrown.message : String(thrown);
        expect(message, testCase.name).toContain(testCase.expectedMessage);
        expect(message, testCase.name).not.toContain("private-signal-key");
        expect(message, testCase.name).not.toContain("private-signal-value");
      }
    }
  });

  it("encodes signal payloads from a canonical JSON snapshot", () => {
    const payload = createLateSensitiveSignalPayloadProxy();
    const encoded = encodeProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "signal",
      fromPeerId: "host-1",
      toPeerId: "viewer-1",
      payload: payload as JsonObject
    });

    expect(encoded).not.toContain("raw-screen-content");
    expect(JSON.parse(encoded)).toMatchObject({
      type: "signal",
      payload: {
        authorizationId: "authz-demo",
        kind: "offer"
      }
    });
  });

  it("encodes signal payloads without inherited toJSON hooks", () => {
    let encoded = "";
    withPrototypeToJsonHooks(() => {
      encoded = encodeProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "signal",
        fromPeerId: "host-1",
        toPeerId: "viewer-1",
        payload: {
          authorizationId: "authz-demo",
          kind: "offer",
          candidates: [{ candidate: "safe-candidate" }],
          nested: { safe: "kept" }
        }
      });
    });

    expect(encoded).not.toContain("raw-screen-content");
    expect(JSON.parse(encoded)).toMatchObject({
      type: "signal",
      payload: {
        authorizationId: "authz-demo",
        kind: "offer",
        candidates: [{ candidate: "safe-candidate" }],
        nested: { safe: "kept" }
      }
    });
  });

  it("does not treat own __proto__ signal payload data as inherited authorization", () => {
    const payload = createSignalPayloadWithOwnProto({ authorizationId: "authz-demo" }, {
      kind: "offer"
    });

    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "signal",
        fromPeerId: "host-1",
        toPeerId: "viewer-1",
        payload
      })
    ).toThrow("Signal payload requires authorizationId");
  });

  it("rejects sensitive keys inside own __proto__ signal payload data", () => {
    const payload = createSignalPayloadWithOwnProto({
      screenContent: "raw-screen-content"
    }, {
      authorizationId: "authz-demo",
      kind: "offer"
    });

    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "signal",
        fromPeerId: "host-1",
        toPeerId: "viewer-1",
        payload
      })
    ).toThrow("must not contain sensitive remote-assistance data");
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

  it("rejects signal payloads with secret-bearing authorization identifiers", () => {
    for (const authorizationId of [
      "token:raw-signal-authz-secret",
      "token-raw-signal-authz-secret",
      "token_raw_signal_authz_secret",
      "cookie.raw.signal.authz.secret",
      "ssh-key-raw-signal-authz-secret"
    ]) {
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

  it("measures oversized signal payloads without inherited toJSON hooks", () => {
    expect(() =>
      withPrototypeToJsonHooks(() => {
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
        });
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
      { accessKey: "raw-access-key" },
      { access_key: "raw-access-key-underscore" },
      { "access-key": "raw-access-key-dash" },
      { sessionCookie: "sid=raw-cookie" },
      { privateKey: "raw-private-key" },
      { sshKey: "raw-ssh-key" },
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

  it("rejects signal payloads with passphrase credential keys", () => {
    const unsafePayloads: Array<Record<string, unknown>> = [
      { passphrase: "raw-passphrase" },
      { passPhrase: "raw-camel-passphrase" },
      { "pass-phrase": "raw-dashed-passphrase" },
      { nested: [{ raw_passphrase: "raw-nested-passphrase" }] }
    ];

    for (const payload of unsafePayloads) {
      const signalMessage = {
        ...createMessageBase("session-demo"),
        type: "signal",
        fromPeerId: "host-1",
        toPeerId: "viewer-1",
        payload: {
          authorizationId: "authz-demo",
          kind: "offer",
          ...payload
        }
      } as const;

      for (const operation of [
        () => parseProtocolEnvelope(signalMessage),
        () => encodeProtocolEnvelope(signalMessage as Parameters<typeof encodeProtocolEnvelope>[0])
      ]) {
        try {
          operation();
          throw new Error("Expected passphrase-bearing signal payload to be rejected");
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          const message = (error as Error).message;
          expect(message).toContain("must not contain sensitive remote-assistance data");
          expect(message).not.toContain("raw-passphrase");
          expect(message).not.toContain("raw-camel-passphrase");
          expect(message).not.toContain("raw-dashed-passphrase");
          expect(message).not.toContain("raw-nested-passphrase");
        }
      }
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

  it("rejects signal payloads with keylogging content keys", () => {
    const unsafePayloads: Array<Record<string, unknown>> = [
      { keylog: "raw-keylog" },
      { rawKeylog: "raw-keylog-marker" },
      { keylogger: "raw-keylogger" },
      { keyloggerOutput: "raw-keylogger-output" },
      { nested: { keylogData: "nested-keylog-data" } },
      { attempts: [{ keyLoggerTrace: "array-keylogger-trace" }] }
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
    const unsafePayloads: Array<Record<string, unknown>> = [
      { screenContent: "raw screen" },
      { accessKey: "raw-access-key" },
      { nested: [{ ssh_key: "raw-ssh-key" }] }
    ];

    for (const payload of unsafePayloads) {
      expect(() =>
        encodeProtocolEnvelope({
          ...createMessageBase("session-demo"),
          type: "signal",
          fromPeerId: "host-1",
          toPeerId: "viewer-1",
          payload: {
            authorizationId: "authz-demo",
            kind: "offer",
            ...payload
          }
        })
      ).toThrow("must not contain sensitive remote-assistance data");
    }
  });

  it("accepts signal payloads with safe key exchange metadata", () => {
    const parsed = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "signal",
      fromPeerId: "host-1",
      toPeerId: "viewer-1",
      payload: {
        authorizationId: "authz-demo",
        kind: "candidate",
        keyExchangeId: "kx-demo",
        nested: {
          publicKeyFingerprint: "sha256-demo"
        }
      }
    });

    expect(parsed).toMatchObject({
      type: "signal",
      payload: {
        authorizationId: "authz-demo",
        keyExchangeId: "kx-demo",
        nested: {
          publicKeyFingerprint: "sha256-demo"
        }
      }
    });
  });

  it.each(["peer-closed", "heartbeat-timeout"] as const)(
    "accepts peer disconnect notices with bounded reason code %s",
    (reasonCode) => {
      const parsed = parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "peer-disconnected",
        peerId: "host-1",
        role: "host",
        reasonCode
      });

      expect(parsed).toMatchObject({
        type: "peer-disconnected",
        peerId: "host-1",
        role: "host",
        reasonCode
      });
    }
  );

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

  it("rejects untrimmed legacy host consent request display names", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "host-consent-required",
        viewerPeerId: "viewer-1",
        viewerDisplayName: " Viewer ",
        requestedPermissions: ["screen:view"]
      })
    ).toThrow("Display name must be trimmed");
  });

  it("rejects legacy host consent request display names with ASCII control characters", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "host-consent-required",
        viewerPeerId: "viewer-1",
        viewerDisplayName: "Viewer\nname",
        requestedPermissions: ["screen:view"]
      })
    ).toThrow("Display name must not contain ASCII control characters");
  });

  it("rejects legacy host consent request display names with Unicode bidi or zero-width controls", () => {
    for (const viewerDisplayName of ["Viewer\u2066name", "Viewer\ufeffname"]) {
      expect(() =>
        parseProtocolEnvelope({
          ...createMessageBase("session-demo"),
          type: "host-consent-required",
          viewerPeerId: "viewer-1",
          viewerDisplayName,
          requestedPermissions: ["screen:view"]
        })
      ).toThrow("Display name must not contain Unicode bidi or zero-width formatting controls");
    }
  });

  it("rejects secret-bearing legacy host consent request display names without exposing raw text", () => {
    for (const viewerDisplayName of secretBearingDisplayNames) {
      const message = {
        ...createMessageBase("session-demo"),
        type: "host-consent-required",
        viewerPeerId: "viewer-1",
        viewerDisplayName,
        requestedPermissions: ["screen:view"]
      } as const;

      for (const operation of [
        () => parseProtocolEnvelope(message),
        () => encodeProtocolEnvelope(message as Parameters<typeof encodeProtocolEnvelope>[0])
      ]) {
        try {
          operation();
          throw new Error("Expected secret-bearing legacy display name to be rejected");
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toContain("sensitive metadata");
          expect((error as Error).message).not.toContain("raw-display");
          expect((error as Error).message).not.toContain(viewerDisplayName);
        }
      }
    }
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

  it("rejects untrimmed workflow reasons", () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const messages = [
      {
        ...createMessageBase("session-demo"),
        type: "host-consent-decision",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        approved: false,
        grantedPermissions: [],
        reason: " Host denied"
      },
      {
        ...createMessageBase("session-demo"),
        type: "session-authorization-request",
        viewerPeerId: "viewer-1",
        requestedPermissions: ["screen:view"],
        reason: "Support request "
      },
      {
        ...createMessageBase("session-demo"),
        type: "session-authorization-decision",
        authorizationId: "authz-demo",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        decision: "denied",
        grantedPermissions: [],
        reason: " Host denied "
      },
      {
        ...createMessageBase("session-demo"),
        type: "session-authorization-state",
        authorizationId: "authz-demo",
        actorPeerId: "host-1",
        status: "revoked",
        visibleToHost: true,
        permissions: [],
        expiresAt,
        reason: "Host revoked "
      },
      {
        ...createMessageBase("session-demo"),
        type: "permission-revoked",
        authorizationId: "authz-demo",
        actorPeerId: "host-1",
        revokedPermission: "input:keyboard",
        reason: " Host revoked keyboard"
      },
      {
        ...createMessageBase("session-demo"),
        type: "session-control",
        authorizationId: "authz-demo",
        actorPeerId: "host-1",
        action: "pause",
        reason: "Host paused "
      }
    ];

    for (const message of messages) {
      expect(() => parseProtocolEnvelope(message)).toThrow("Reason must be trimmed");
      expect(() =>
        encodeProtocolEnvelope(message as Parameters<typeof encodeProtocolEnvelope>[0])
      ).toThrow("Reason must be trimmed");
    }
  });

  it("rejects workflow reasons with ASCII control characters", () => {
    for (const message of authorizationReasonMessages("Host\nreason")) {
      expect(() => parseProtocolEnvelope(message)).toThrow(
        "Reason must not contain ASCII control characters"
      );
      expect(() =>
        encodeProtocolEnvelope(message as Parameters<typeof encodeProtocolEnvelope>[0])
      ).toThrow("Reason must not contain ASCII control characters");
    }
  });

  it("rejects workflow reasons with Unicode bidi or zero-width controls", () => {
    for (const reason of ["Host\u202ereason", "Host\u200breason", "Host\ufeffreason"]) {
      for (const message of authorizationReasonMessages(reason)) {
        expect(() => parseProtocolEnvelope(message)).toThrow(
          "Reason must not contain Unicode bidi or zero-width formatting controls"
        );
        expect(() =>
          encodeProtocolEnvelope(message as Parameters<typeof encodeProtocolEnvelope>[0])
        ).toThrow("Reason must not contain Unicode bidi or zero-width formatting controls");
      }
    }
  });

  it("rejects unsafe workflow reasons without exposing raw private text", () => {
    for (const reason of [
      "protocol-private-reason-marker\n",
      "protocol-private-reason-marker\u202e",
      "protocol-private-reason-marker\u200b",
      "protocol-private-reason-marker\ufeff"
    ]) {
      for (const message of authorizationReasonMessages(reason)) {
        try {
          parseProtocolEnvelope(message);
          throw new Error("Expected unsafe protocol reason to be rejected");
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).not.toContain("protocol-private-reason-marker");
          expect((error as Error).message).not.toContain(reason);
        }
      }
    }
  });

  it("rejects secret-bearing workflow reasons without exposing raw reason text", () => {
    for (const reason of secretBearingReasons) {
      for (const message of authorizationReasonMessages(reason)) {
        for (const operation of [
          () => parseProtocolEnvelope(message),
          () => encodeProtocolEnvelope(message as Parameters<typeof encodeProtocolEnvelope>[0])
        ]) {
          try {
            operation();
            throw new Error("Expected secret-bearing protocol reason to be rejected");
          } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toContain("sensitive metadata");
            expect((error as Error).message).not.toContain("raw-protocol");
            expect((error as Error).message).not.toContain(reason);
          }
        }
      }
    }
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

  it("accepts safe non-secret workflow reasons", () => {
    for (const message of authorizationReasonMessages("Host denied support request")) {
      expect(parseProtocolEnvelope(message)).toMatchObject({
        reason: "Host denied support request"
      });
    }
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

  it("rejects approved session authorization decisions with stale expiration", () => {
    const createdAt = "2026-06-13T09:00:00.000Z";

    for (const expiresAt of ["2026-06-13T08:59:59.999Z", createdAt]) {
      expect(() =>
        parseProtocolEnvelope({
          ...createMessageBase("session-demo"),
          createdAt,
          type: "session-authorization-decision",
          authorizationId: "authz-demo",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          decision: "approved",
          grantedPermissions: ["screen:view"],
          expiresAt
        })
      ).toThrow("expiresAt after createdAt");
    }
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

  it("rejects authorization lifecycle and control messages with secret-bearing authorization ids", () => {
    const secretAuthorizationId = "ssh-key-raw-lifecycle-authz-secret";
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const messages = [
      {
        ...createMessageBase("session-demo"),
        type: "session-authorization-decision",
        authorizationId: secretAuthorizationId,
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        decision: "approved",
        grantedPermissions: ["screen:view"],
        expiresAt
      },
      {
        ...createMessageBase("session-demo"),
        type: "session-authorization-state",
        authorizationId: secretAuthorizationId,
        actorPeerId: "host-1",
        status: "active",
        visibleToHost: true,
        permissions: ["screen:view"],
        expiresAt
      },
      {
        ...createMessageBase("session-demo"),
        type: "permission-revoked",
        authorizationId: secretAuthorizationId,
        actorPeerId: "host-1",
        revokedPermission: "screen:view",
        reason: "Host revoked screen"
      },
      {
        ...createMessageBase("session-demo"),
        type: "session-control",
        authorizationId: secretAuthorizationId,
        actorPeerId: "host-1",
        action: "pause"
      }
    ] as const;

    for (const message of messages) {
      expect(() => parseProtocolEnvelope(message)).toThrow(
        "Authorization id must not contain sensitive metadata"
      );
    }
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

  it("rejects grant-bearing session authorization state updates with stale expiration", () => {
    const createdAt = "2026-06-13T09:00:00.000Z";

    for (const status of ["approved", "active", "paused"] as const) {
      expect(() =>
        parseProtocolEnvelope({
          ...createMessageBase("session-demo"),
          createdAt,
          type: "session-authorization-state",
          authorizationId: "authz-demo",
          actorPeerId: "host-1",
          status,
          visibleToHost: status !== "approved",
          permissions: ["screen:view"],
          expiresAt: createdAt
        })
      ).toThrow("expiresAt after createdAt");
    }
  });

  it("accepts terminal session authorization state updates with reasons and empty permissions", () => {
    for (const state of [
      { status: "denied", visibleToHost: false, reason: "Host denied" },
      { status: "revoked", visibleToHost: true, reason: "Host revoked" },
      { status: "terminated", visibleToHost: true, reason: "Host terminated" },
      { status: "expired", visibleToHost: true, reason: "Authorization expired" }
    ] as const) {
      const parsed = parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-authorization-state",
        authorizationId: "authz-demo",
        actorPeerId: "host-1",
        status: state.status,
        visibleToHost: state.visibleToHost,
        permissions: [],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        reason: state.reason
      });

      expect(parsed).toMatchObject({
        type: "session-authorization-state",
        status: state.status,
        visibleToHost: state.visibleToHost,
        permissions: []
      });
    }
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
      { status: "pending", permissions: [], reason: undefined },
      { status: "approved", permissions: ["screen:view"], reason: undefined },
      { status: "denied", permissions: [], reason: "Host denied" }
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
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          ...(state.reason ? { reason: state.reason } : {})
        })
      ).toThrow("cannot be visible before activation");
    }
  });

  it("rejects terminal session authorization state updates without reasons", () => {
    for (const state of [
      { status: "denied", visibleToHost: false },
      { status: "revoked", visibleToHost: true },
      { status: "terminated", visibleToHost: true },
      { status: "expired", visibleToHost: true }
    ] as const) {
      expect(() =>
        parseProtocolEnvelope({
          ...createMessageBase("session-demo"),
          type: "session-authorization-state",
          authorizationId: "authz-demo",
          actorPeerId: "host-1",
          status: state.status,
          visibleToHost: state.visibleToHost,
          permissions: [],
          expiresAt: new Date(Date.now() + 60_000).toISOString()
        })
      ).toThrow(`${state.status} session authorization state requires reason`);
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

  it("accepts expired session authorization state updates with past expiration", () => {
    const parsed = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      createdAt: "2026-06-13T09:00:00.000Z",
      type: "session-authorization-state",
      authorizationId: "authz-demo",
      actorPeerId: "host-1",
      status: "expired",
      visibleToHost: true,
      permissions: [],
      expiresAt: "2026-06-13T08:59:59.999Z",
      reason: "Authorization expired"
    });

    expect(parsed).toMatchObject({
      type: "session-authorization-state",
      status: "expired",
      permissions: []
    });
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

  it("accepts session control messages without optional reasons for reversible actions", () => {
    for (const action of ["pause", "resume"] as const) {
      const parsed = parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-control",
        authorizationId: "authz-demo",
        actorPeerId: "host-1",
        action
      });

      expect(parsed).toMatchObject({ type: "session-control", action });
    }
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

  it("rejects revoke-permission session control messages without reason", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-control",
        authorizationId: "authz-demo",
        actorPeerId: "host-1",
        action: "revoke-permission",
        permission: "screen:view"
      })
    ).toThrow("require reason");
  });

  it("rejects terminate session control messages without reason", () => {
    expect(() =>
      parseProtocolEnvelope({
        ...createMessageBase("session-demo"),
        type: "session-control",
        authorizationId: "authz-demo",
        actorPeerId: "host-1",
        action: "terminate"
      })
    ).toThrow("require reason");
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

  it("rejects clipboard permissions in authorization protocol messages", () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();

    for (const permission of ["clipboard:read", "clipboard:write"] as const) {
      const messages = [
        {
          ...createMessageBase("session-demo"),
          type: "host-consent-required",
          viewerPeerId: "viewer-1",
          viewerDisplayName: "Viewer",
          requestedPermissions: [permission]
        },
        {
          ...createMessageBase("session-demo"),
          type: "host-consent-decision",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          approved: true,
          grantedPermissions: [permission]
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-request",
          viewerPeerId: "viewer-1",
          requestedPermissions: [permission]
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-decision",
          authorizationId: "authz-demo",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          decision: "approved",
          grantedPermissions: [permission],
          expiresAt
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-state",
          authorizationId: "authz-demo",
          actorPeerId: "host-1",
          status: "active",
          visibleToHost: true,
          permissions: [permission],
          expiresAt
        },
        {
          ...createMessageBase("session-demo"),
          type: "permission-revoked",
          authorizationId: "authz-demo",
          actorPeerId: "host-1",
          revokedPermission: permission,
          reason: "Host revoked clipboard"
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-control",
          authorizationId: "authz-demo",
          actorPeerId: "host-1",
          action: "revoke-permission",
          permission,
          reason: "Host revoked clipboard"
        }
      ];

      for (const message of messages) {
        expect(() => parseProtocolEnvelope(message)).toThrow();
      }
    }
  });

  it("rejects diagnostics permissions in authorization protocol messages", () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const messages = [
      {
        ...createMessageBase("session-demo"),
        type: "session-authorization-request",
        viewerPeerId: "viewer-1",
        requestedPermissions: ["diagnostics:view"]
      },
      {
        ...createMessageBase("session-demo"),
        type: "session-authorization-decision",
        authorizationId: "authz-demo",
        hostPeerId: "host-1",
        viewerPeerId: "viewer-1",
        decision: "approved",
        grantedPermissions: ["diagnostics:view"],
        expiresAt
      },
      {
        ...createMessageBase("session-demo"),
        type: "session-authorization-state",
        authorizationId: "authz-demo",
        actorPeerId: "host-1",
        status: "active",
        visibleToHost: true,
        permissions: ["diagnostics:view"],
        expiresAt
      },
      {
        ...createMessageBase("session-demo"),
        type: "permission-revoked",
        authorizationId: "authz-demo",
        actorPeerId: "host-1",
        revokedPermission: "diagnostics:view",
        reason: "Host revoked diagnostics"
      },
      {
        ...createMessageBase("session-demo"),
        type: "session-control",
        authorizationId: "authz-demo",
        actorPeerId: "host-1",
        action: "revoke-permission",
        permission: "diagnostics:view",
        reason: "Host revoked diagnostics"
      }
    ];

    for (const message of messages) {
      expect(() => parseProtocolEnvelope(message)).toThrow();
    }
  });

  it("rejects covert and high-risk administrative permission shapes in authorization protocol messages", () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();

    for (const permission of unsafePermissionShapes) {
      const messages = [
        {
          ...createMessageBase("session-demo"),
          type: "host-consent-required",
          viewerPeerId: "viewer-1",
          viewerDisplayName: "Viewer",
          requestedPermissions: [permission]
        },
        {
          ...createMessageBase("session-demo"),
          type: "host-consent-decision",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          approved: true,
          grantedPermissions: [permission]
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-request",
          viewerPeerId: "viewer-1",
          requestedPermissions: [permission]
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-decision",
          authorizationId: "authz-demo",
          hostPeerId: "host-1",
          viewerPeerId: "viewer-1",
          decision: "approved",
          grantedPermissions: [permission],
          expiresAt
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-authorization-state",
          authorizationId: "authz-demo",
          actorPeerId: "host-1",
          status: "active",
          visibleToHost: true,
          permissions: [permission],
          expiresAt
        },
        {
          ...createMessageBase("session-demo"),
          type: "permission-revoked",
          authorizationId: "authz-demo",
          actorPeerId: "host-1",
          revokedPermission: permission,
          reason: "Host revoked unsafe permission"
        },
        {
          ...createMessageBase("session-demo"),
          type: "session-control",
          authorizationId: "authz-demo",
          actorPeerId: "host-1",
          action: "revoke-permission",
          permission,
          reason: "Host revoked unsafe permission"
        }
      ];

      for (const message of messages) {
        expect(() => parseProtocolEnvelope(message)).toThrow();
      }
    }
  });

  it("accepts JSON-compatible audit-event detail values", () => {
    const parsed = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "audit-event",
      eventId: "audit-demo",
      actorPeerId: "host-1",
      action: "agent-shell.test",
      outcome: "accepted",
      detail: {
        status: "active",
        attempts: 2,
        visible: true,
        optional: null,
        nested: {
          values: ["screen:view", 1, false, null]
        }
      }
    });

    expect(parsed).toMatchObject({
      type: "audit-event",
      detail: {
        status: "active",
        attempts: 2,
        visible: true,
        optional: null,
        nested: {
          values: ["screen:view", 1, false, null]
        }
      }
    });
  });

  it("rejects non-JSON audit-event detail values when parsing protocol messages", () => {
    const circularDetail: Record<string, unknown> = {};
    circularDetail.self = circularDetail;
    const symbolKeyDetail = { safe: "kept", [Symbol("hidden")]: "hidden" };
    const nonEnumerableDetail: Record<string, unknown> = { safe: "kept" };
    Object.defineProperty(nonEnumerableDetail, "hidden", {
      value: "hidden",
      enumerable: false
    });
    const accessorDetail: Record<string, unknown> = { safe: "kept" };
    Object.defineProperty(accessorDetail, "hidden", {
      get: () => "hidden",
      enumerable: true
    });
    const sparseArrayDetail: Record<string, unknown> = { attempts: [] };
    (sparseArrayDetail.attempts as unknown[])[1] = "second";
    const arrayExtraPropertyDetail: Record<string, unknown> = { attempts: ["first"] };
    Object.defineProperty(arrayExtraPropertyDetail.attempts as object, "hidden", {
      value: "hidden",
      enumerable: true
    });
    const invalidDetails: Array<Record<string, unknown>> = [
      { handler: () => "handled" },
      { marker: Symbol("marker") },
      { count: BigInt(1) },
      { omitted: undefined },
      { count: NaN },
      { count: Infinity },
      { count: -Infinity },
      { nested: { handler: () => "handled" } },
      { attempts: [undefined] },
      { token: () => "secret-token" },
      symbolKeyDetail,
      nonEnumerableDetail,
      accessorDetail,
      sparseArrayDetail,
      arrayExtraPropertyDetail,
      circularDetail
    ];

    for (const detail of invalidDetails) {
      expect(() =>
        parseProtocolEnvelope({
          ...createMessageBase("session-demo"),
          type: "audit-event",
          eventId: "audit-demo",
          actorPeerId: "host-1",
          action: "agent-shell.test",
          outcome: "accepted",
          detail
        })
      ).toThrow("JSON-compatible");
    }
  });

  it("rejects non-JSON audit-event detail values when encoding protocol messages", () => {
    const invalidDetails: Array<Record<string, unknown>> = [
      { handler: () => "handled" },
      { count: BigInt(1) },
      { omitted: undefined },
      { count: NaN },
      { count: Infinity },
      { count: -Infinity },
      { attempts: [undefined] }
    ];

    for (const detail of invalidDetails) {
      expect(() =>
        encodeProtocolEnvelope({
          ...createMessageBase("session-demo"),
          type: "audit-event",
          eventId: "audit-demo",
          actorPeerId: "host-1",
          action: "agent-shell.test",
          outcome: "accepted",
          detail: detail as AuditDetail
        })
      ).toThrow("JSON-compatible");
    }
  });

  it("rejects unsafe audit-event detail keys when parsing and encoding without raw key leakage", () => {
    const cases: Array<{
      name: string;
      detail: Record<string, unknown>;
      rawKey: string;
      message: string;
    }> = [
      {
        name: "control-character key",
        rawKey: "unsafe\nprivate-audit-detail-key",
        detail: {
          "unsafe\nprivate-audit-detail-key": "value"
        },
        message: "Audit detail keys must not contain ASCII control characters"
      },
      {
        name: "bidi-control nested key",
        rawKey: "unsafe\u202eprivate-audit-detail-key",
        detail: {
          nested: {
            "unsafe\u202eprivate-audit-detail-key": "value"
          }
        },
        message: "Audit detail keys must not contain Unicode bidi or zero-width formatting controls"
      },
      {
        name: "zero-width array object key",
        rawKey: "unsafe\ufeffprivate-audit-detail-key",
        detail: {
          attempts: [
            {
              "unsafe\ufeffprivate-audit-detail-key": "value"
            }
          ]
        },
        message: "Audit detail keys must not contain Unicode bidi or zero-width formatting controls"
      }
    ];

    for (const { detail, message, name, rawKey } of cases) {
      const messageWithUnsafeDetail = {
        ...createMessageBase("session-demo"),
        type: "audit-event",
        eventId: "audit-demo",
        actorPeerId: "host-1",
        action: "agent-shell.test",
        outcome: "failed",
        detail
      } as const;

      for (const operation of [
        () => parseProtocolEnvelope(messageWithUnsafeDetail),
        () =>
          encodeProtocolEnvelope(
            messageWithUnsafeDetail as Parameters<typeof encodeProtocolEnvelope>[0]
          )
      ]) {
        try {
          operation();
          throw new Error(`Expected unsafe audit-event detail key to be rejected for ${name}`);
        } catch (error) {
          expect(error, name).toBeInstanceOf(Error);
          expect((error as Error).message, name).toContain(message);
          expect((error as Error).message, name).not.toContain("private-audit-detail-key");
          expect((error as Error).message, name).not.toContain(rawKey);
        }
      }
    }
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
        passphrase: "raw-passphrase",
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
        passphrase: "[REDACTED]",
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
    expect(JSON.stringify(parsed)).not.toContain("raw-passphrase");
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
        accessKey: "raw-access-key",
        cookie: "sid=raw-cookie",
        privateKey: "raw-private-key",
        sshKey: "raw-ssh-key",
        authorizationId: "authz-demo",
        attempts: [
          {
            sessionCookie: "array-cookie",
            ssh_key: "array-ssh-key",
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
        accessKey: "[REDACTED]",
        cookie: "[REDACTED]",
        privateKey: "[REDACTED]",
        sshKey: "[REDACTED]",
        authorizationId: "authz-demo",
        attempts: [
          {
            sessionCookie: "[REDACTED]",
            ssh_key: "[REDACTED]",
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
    expect(JSON.stringify(parsed)).not.toContain("raw-access-key");
    expect(JSON.stringify(parsed)).not.toContain("raw-cookie");
    expect(JSON.stringify(parsed)).not.toContain("raw-private-key");
    expect(JSON.stringify(parsed)).not.toContain("raw-ssh-key");
    expect(JSON.stringify(parsed)).not.toContain("array-ssh-key");
  });

  it("redacts secret-bearing audit-event authorization id detail values", () => {
    const parsed = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "audit-event",
      eventId: "audit-demo",
      actorPeerId: "host-1",
      action: "agent-shell.test",
      outcome: "accepted",
      detail: {
        authorizationId: "token-raw-audit-authz-secret",
        nested: {
          authorizationId: "cookie.raw.audit.authz.secret",
          objectAttempt: {
            authorizationId: {
              value: "token-raw-object-authz-secret"
            }
          }
        },
        attempts: [
          {
            authorizationId: "ssh-key-raw-audit-authz-secret"
          },
          {
            authorizationId: "authz-array"
          }
        ]
      }
    });

    expect(parsed).toMatchObject({
      type: "audit-event",
      detail: {
        authorizationId: "[REDACTED]",
        nested: {
          authorizationId: "[REDACTED]",
          objectAttempt: {
            authorizationId: "[REDACTED]"
          }
        },
        attempts: [
          {
            authorizationId: "[REDACTED]"
          },
          {
            authorizationId: "authz-array"
          }
        ]
      }
    });
    expect(JSON.stringify(parsed)).not.toContain("token-raw-audit-authz-secret");
    expect(JSON.stringify(parsed)).not.toContain("cookie.raw.audit.authz.secret");
    expect(JSON.stringify(parsed)).not.toContain("ssh-key-raw-audit-authz-secret");
    expect(JSON.stringify(parsed)).not.toContain("token-raw-object-authz-secret");
  });

  it("redacts audit-event display-name and private reason detail fields while preserving safe metadata", () => {
    const parsed = parseProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "audit-event",
      eventId: "audit-demo",
      actorPeerId: "host-1",
      action: "agent-shell.test",
      outcome: "accepted",
      detail: {
        displayName: "Raw Host",
        viewerDisplayName: "Raw Viewer",
        reason: "private reason",
        reasonText: "private reason text",
        rawReason: "raw reason",
        denialReason: "private denial",
        reasonCode: "peer-closed",
        reasonConfigured: true,
        authorizationId: "authz-demo",
        nested: {
          hostDisplayName: "Nested Host",
          lifecycleReason: "nested reason"
        },
        attempts: [
          {
            deviceDisplayName: "Array Device",
            pauseReason: "array pause reason"
          }
        ]
      }
    });

    expect(parsed).toMatchObject({
      type: "audit-event",
      detail: {
        displayName: "[REDACTED]",
        viewerDisplayName: "[REDACTED]",
        reason: "[REDACTED]",
        reasonText: "[REDACTED]",
        rawReason: "[REDACTED]",
        denialReason: "[REDACTED]",
        reasonCode: "peer-closed",
        reasonConfigured: true,
        authorizationId: "authz-demo",
        nested: {
          hostDisplayName: "[REDACTED]",
          lifecycleReason: "[REDACTED]"
        },
        attempts: [
          {
            deviceDisplayName: "[REDACTED]",
            pauseReason: "[REDACTED]"
          }
        ]
      }
    });
    expect(JSON.stringify(parsed)).not.toContain("Raw Host");
    expect(JSON.stringify(parsed)).not.toContain("Raw Viewer");
    expect(JSON.stringify(parsed)).not.toContain("private reason");
    expect(JSON.stringify(parsed)).not.toContain("nested reason");
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
        accessKey: "raw-access-key",
        passPhrase: "raw-passphrase",
        authorization: "Bearer raw-token",
        rawAuthorizationHeader: "raw-authorization-header",
        cookie: "sid=raw-cookie",
        privateKey: "raw-private-key",
        ssh_key: "raw-ssh-key",
        clipboardContents: "raw-clipboard",
        fileData: "raw-file-data",
        diagnostics: "raw-diagnostics",
        authorizationId: "authz-demo"
      }
    });
    const decoded = JSON.parse(encoded);

    expect(decoded.detail).toEqual({
      apiKey: "[REDACTED]",
      accessKey: "[REDACTED]",
      passPhrase: "[REDACTED]",
      authorization: "[REDACTED]",
      rawAuthorizationHeader: "[REDACTED]",
      cookie: "[REDACTED]",
      privateKey: "[REDACTED]",
      ssh_key: "[REDACTED]",
      clipboardContents: "[REDACTED]",
      fileData: "[REDACTED]",
      diagnostics: "[REDACTED]",
      authorizationId: "authz-demo"
    });
    expect(encoded).not.toContain("api-key-secret");
    expect(encoded).not.toContain("raw-access-key");
    expect(encoded).not.toContain("raw-passphrase");
    expect(encoded).not.toContain("raw-token");
    expect(encoded).not.toContain("raw-authorization-header");
    expect(encoded).not.toContain("raw-cookie");
    expect(encoded).not.toContain("raw-private-key");
    expect(encoded).not.toContain("raw-ssh-key");
    expect(encoded).not.toContain("raw-clipboard");
    expect(encoded).not.toContain("raw-file-data");
    expect(encoded).not.toContain("raw-diagnostics");
  });

  it("redacts audit-event display-name and private reason detail fields when encoding protocol messages", () => {
    const encoded = encodeProtocolEnvelope({
      ...createMessageBase("session-demo"),
      type: "audit-event",
      eventId: "audit-demo",
      actorPeerId: "host-1",
      action: "agent-shell.test",
      outcome: "accepted",
      detail: {
        displayName: "Raw Host",
        terminateReason: "private terminate reason",
        reasonCode: "peer-closed",
        reasonConfigured: true,
        authorizationId: "authz-demo"
      }
    });
    const decoded = JSON.parse(encoded);

    expect(decoded.detail).toEqual({
      displayName: "[REDACTED]",
      terminateReason: "[REDACTED]",
      reasonCode: "peer-closed",
      reasonConfigured: true,
      authorizationId: "authz-demo"
    });
    expect(encoded).not.toContain("Raw Host");
    expect(encoded).not.toContain("private terminate reason");
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

  it("rejects untrimmed audit-event actions", () => {
    const message = {
      ...createMessageBase("session-demo"),
      type: "audit-event",
      eventId: "audit-demo",
      actorPeerId: "host-1",
      action: " agent-shell.test ",
      outcome: "failed"
    } as const;

    expect(() => parseProtocolEnvelope(message)).toThrow("Audit event action must be trimmed");
    expect(() =>
      encodeProtocolEnvelope(message as Parameters<typeof encodeProtocolEnvelope>[0])
    ).toThrow("Audit event action must be trimmed");
  });

  it("rejects audit-event actions with ASCII control characters", () => {
    const message = {
      ...createMessageBase("session-demo"),
      type: "audit-event",
      eventId: "audit-demo",
      actorPeerId: "host-1",
      action: "agent-shell\nprivate-action-marker",
      outcome: "failed"
    } as const;

    expect(() => parseProtocolEnvelope(message)).toThrow(
      "Audit event action must not contain ASCII control characters"
    );
    expect(() =>
      encodeProtocolEnvelope(message as Parameters<typeof encodeProtocolEnvelope>[0])
    ).toThrow("Audit event action must not contain ASCII control characters");
  });

  it("rejects audit-event actions with Unicode bidi or zero-width controls", () => {
    for (const action of [
      "agent-shell\u202eprivate-action-marker",
      "agent-shell\u200bprivate-action-marker",
      "agent-shell\ufeffprivate-action-marker"
    ]) {
      const message = {
        ...createMessageBase("session-demo"),
        type: "audit-event",
        eventId: "audit-demo",
        actorPeerId: "host-1",
        action,
        outcome: "failed"
      } as const;

      expect(() => parseProtocolEnvelope(message)).toThrow(
        "Audit event action must not contain Unicode bidi or zero-width formatting controls"
      );
      expect(() =>
        encodeProtocolEnvelope(message as Parameters<typeof encodeProtocolEnvelope>[0])
      ).toThrow("Audit event action must not contain Unicode bidi or zero-width formatting controls");
    }
  });

  it("rejects unsafe audit-event actions without exposing raw private text", () => {
    for (const action of [
      "agent-shell-private-action-marker\n",
      "agent-shell-private-action-marker\u202e",
      "agent-shell-private-action-marker\u200b",
      "agent-shell-private-action-marker\ufeff"
    ]) {
      const message = {
        ...createMessageBase("session-demo"),
        type: "audit-event",
        eventId: "audit-demo",
        actorPeerId: "host-1",
        action,
        outcome: "failed"
      } as const;

      try {
        parseProtocolEnvelope(message);
        throw new Error("Expected unsafe audit-event action to be rejected");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).not.toContain("agent-shell-private-action-marker");
        expect((error as Error).message).not.toContain(action);
      }
    }
  });

  it("rejects secret-bearing audit-event actions without exposing raw action text", () => {
    for (const action of [
      "agent-shell.token raw-token-secret",
      "Authorization: Bearer protocol-raw-token",
      "diagnosticDump: protocol-raw-diagnostic-dump",
      "screenContent: protocol-raw-screen-content",
      "setCookie=protocol-raw-set-cookie",
      "sessionCookie protocol-raw-session-cookie",
      "cookieValue protocol-raw-cookie-value",
      "authHeaderValue protocol-raw-auth-header",
      "agent-shell.cookieValue protocol-raw-cookie-value",
      "agent-shell.authHeaderValue protocol-raw-auth-header",
      "agent-shell.tokenValue protocol-raw-token"
    ]) {
      const message = {
        ...createMessageBase("session-demo"),
        type: "audit-event",
        eventId: "audit-demo",
        actorPeerId: "host-1",
        action,
        outcome: "failed"
      } as const;

      for (const operation of [
        () => parseProtocolEnvelope(message),
        () => encodeProtocolEnvelope(message as Parameters<typeof encodeProtocolEnvelope>[0])
      ]) {
        try {
          operation();
          throw new Error("Expected secret-bearing audit-event action to be rejected");
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toContain(
            "Audit event action must not contain sensitive metadata"
          );
          expect((error as Error).message).not.toContain(action);
          expect((error as Error).message).not.toContain("raw-");
        }
      }
    }
  });

  it("accepts non-secret dotted audit-event action names", () => {
    for (const action of [
      "agent-shell.authorization.active",
      "relay.peer.join.denied",
      "relay.token.denied",
      "agent-shell.authorizationId.recorded"
    ]) {
      const message = {
        ...createMessageBase("session-demo"),
        type: "audit-event",
        eventId: "audit-demo",
        actorPeerId: "host-1",
        action,
        outcome: "failed"
      } as const;

      expect(parseProtocolEnvelope(message)).toMatchObject({ action });
      expect(encodeProtocolEnvelope(message as Parameters<typeof encodeProtocolEnvelope>[0])).toContain(
        `"action":"${action}"`
      );
    }
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

function authorizationReasonMessages(reason: string): unknown[] {
  const expiresAt = new Date(Date.now() + 60_000).toISOString();

  return [
    {
      ...createMessageBase("session-demo"),
      type: "host-consent-decision",
      hostPeerId: "host-1",
      viewerPeerId: "viewer-1",
      approved: false,
      grantedPermissions: [],
      reason
    },
    {
      ...createMessageBase("session-demo"),
      type: "session-authorization-request",
      viewerPeerId: "viewer-1",
      requestedPermissions: ["screen:view"],
      reason
    },
    {
      ...createMessageBase("session-demo"),
      type: "session-authorization-decision",
      authorizationId: "authz-demo",
      hostPeerId: "host-1",
      viewerPeerId: "viewer-1",
      decision: "denied",
      grantedPermissions: [],
      reason
    },
    {
      ...createMessageBase("session-demo"),
      type: "session-authorization-state",
      authorizationId: "authz-demo",
      actorPeerId: "host-1",
      status: "revoked",
      visibleToHost: true,
      permissions: [],
      expiresAt,
      reason
    },
    {
      ...createMessageBase("session-demo"),
      type: "permission-revoked",
      authorizationId: "authz-demo",
      actorPeerId: "host-1",
      revokedPermission: "input:keyboard",
      reason
    },
    {
      ...createMessageBase("session-demo"),
      type: "session-control",
      authorizationId: "authz-demo",
      actorPeerId: "host-1",
      action: "pause",
      reason
    }
  ];
}

function createLateSensitiveSignalPayloadProxy(): Record<string, unknown> {
  let ownKeysCalls = 0;

  return new Proxy(
    {},
    {
      getPrototypeOf: () => Object.prototype,
      ownKeys: () => {
        ownKeysCalls += 1;
        return ownKeysCalls > 6
          ? ["authorizationId", "kind", "screenContent"]
          : ["authorizationId", "kind"];
      },
      getOwnPropertyDescriptor: (_target, key) => {
        if (key === "authorizationId") {
          return {
            configurable: true,
            enumerable: true,
            value: "authz-demo"
          };
        }

        if (key === "kind") {
          return {
            configurable: true,
            enumerable: true,
            value: "offer"
          };
        }

        if (key === "screenContent") {
          return {
            configurable: true,
            enumerable: true,
            value: "raw-screen-content"
          };
        }

        return undefined;
      },
      get: (_target, key) => {
        if (key === "authorizationId") {
          return "authz-demo";
        }

        if (key === "kind") {
          return "offer";
        }

        if (key === "screenContent") {
          return "raw-screen-content";
        }

        return undefined;
      }
    }
  );
}

function createSignalPayloadWithOwnProto(
  protoValue: Record<string, unknown>,
  entries: Record<string, unknown>
): Record<string, unknown> {
  const value = Object.create(null) as Record<string, unknown>;
  for (const [key, entryValue] of Object.entries(entries)) {
    Object.defineProperty(value, key, {
      configurable: true,
      enumerable: true,
      value: entryValue,
      writable: true
    });
  }
  Object.defineProperty(value, "__proto__", {
    configurable: true,
    enumerable: true,
    value: protoValue,
    writable: true
  });

  return value;
}

function withPrototypeToJsonHooks(callback: () => void): void {
  const objectToJson = Object.getOwnPropertyDescriptor(Object.prototype, "toJSON");
  const arrayToJson = Object.getOwnPropertyDescriptor(Array.prototype, "toJSON");
  Object.defineProperty(Object.prototype, "toJSON", {
    configurable: true,
    value: () => ({ screenContent: "raw-screen-content" })
  });
  Object.defineProperty(Array.prototype, "toJSON", {
    configurable: true,
    value: () => ["raw-screen-content"]
  });

  try {
    callback();
  } finally {
    restorePropertyDescriptor(Object.prototype, "toJSON", objectToJson);
    restorePropertyDescriptor(Array.prototype, "toJSON", arrayToJson);
  }
}

function restorePropertyDescriptor(
  target: object,
  key: string,
  descriptor: PropertyDescriptor | undefined
): void {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
    return;
  }

  delete (target as Record<string, unknown>)[key];
}
