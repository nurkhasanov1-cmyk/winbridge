import { describe, expect, it } from "vitest";
import { createAuditRecord, redactAuditDetail } from "./audit.js";

describe("audit records", () => {
  it("creates schema-valid structured audit records", () => {
    const record = createAuditRecord({
      actor: { type: "relay", id: "relay-dev" },
      action: "relay.peer.join.accepted",
      outcome: "accepted",
      sessionId: "session-demo",
      detail: { role: "viewer" }
    });

    expect(record.action).toBe("relay.peer.join.accepted");
    expect(record.detail).toEqual({ role: "viewer" });
  });

  it("rejects records without required actor metadata", () => {
    expect(() =>
      createAuditRecord({
        actor: { type: "relay", id: "" },
        action: "relay.peer.join.accepted",
        outcome: "accepted"
      })
    ).toThrow();
  });

  it("rejects blank audit metadata fields", () => {
    expect(() =>
      createAuditRecord({
        actor: { type: "relay", id: "relay-dev" },
        action: "   ",
        outcome: "failed"
      })
    ).toThrow("Audit action must not be blank");
    expect(() =>
      createAuditRecord({
        actor: { type: "relay", id: "relay-dev" },
        action: "relay.message.rejected",
        outcome: "failed",
        reason: "   "
      })
    ).toThrow("Audit reason must not be blank");
    expect(() =>
      createAuditRecord({
        actor: { type: "relay", id: "relay-dev" },
        action: "relay.message.forwarded",
        outcome: "accepted",
        target: {
          type: "   ",
          id: "viewer-1"
        }
      })
    ).toThrow("Audit target type must not be blank");
  });

  it("rejects audit records with malformed identifiers", () => {
    expect(() =>
      createAuditRecord({
        eventId: "audit with spaces",
        actor: { type: "relay", id: "relay-dev" },
        action: "relay.peer.join.accepted",
        outcome: "accepted"
      })
    ).toThrow();
    expect(() =>
      createAuditRecord({
        actor: { type: "relay", id: "relay dev" },
        action: "relay.peer.join.accepted",
        outcome: "accepted"
      })
    ).toThrow();
    expect(() =>
      createAuditRecord({
        actor: { type: "host", id: "host-1", deviceId: "dev/host/1" },
        action: "agent-shell.authorization.approved",
        outcome: "accepted",
        sessionId: "session-demo"
      })
    ).toThrow();
    expect(() =>
      createAuditRecord({
        actor: { type: "relay", id: "relay-dev" },
        action: "relay.peer.join.accepted",
        outcome: "accepted",
        sessionId: "session demo"
      })
    ).toThrow();
    expect(() =>
      createAuditRecord({
        actor: { type: "relay", id: "relay-dev" },
        action: "relay.peer.join.accepted",
        outcome: "accepted",
        target: { type: "peer", id: "viewer\n1" }
      })
    ).toThrow();
  });

  it("redacts sensitive top-level audit reasons", () => {
    for (const reason of [
      "Authorization: Bearer raw-token-secret",
      "Authorization: raw-token-secret",
      "Proxy-Authorization: raw-proxy-token",
      "private close token raw-close-token",
      "token raw-token-secret"
    ]) {
      const record = createAuditRecord({
        actor: { type: "relay", id: "relay-dev" },
        action: "relay.message.rejected",
        outcome: "failed",
        reason
      });

      expect(record.reason).toBe("[REDACTED]");
      expect(JSON.stringify(record)).not.toContain(reason);
    }
  });

  it("preserves safe bounded top-level audit reasons", () => {
    for (const reason of [
      "Pairing code mismatch",
      "Invalid relay token",
      "Relay token rate limit exceeded"
    ]) {
      const record = createAuditRecord({
        actor: { type: "relay", id: "relay-dev" },
        action: "relay.peer.join.denied",
        outcome: "denied",
        reason
      });

      expect(record.reason).toBe(reason);
    }
  });

  it("redacts sensitive audit detail fields", () => {
    const redacted = redactAuditDetail({
      token: "secret-token",
      pairingCode: "123-456",
      credential: "secret-credential",
      nested: {
        keystroke: "abc",
        screenshot: "raw-image",
        screenData: "raw-screen"
      },
      safe: "kept"
    });

    expect(redacted).toEqual({
      token: "[REDACTED]",
      pairingCode: "[REDACTED]",
      credential: "[REDACTED]",
      nested: {
        keystroke: "[REDACTED]",
        screenshot: "[REDACTED]",
        screenData: "[REDACTED]"
      },
      safe: "kept"
    });
  });

  it("redacts expanded authentication detail keys recursively", () => {
    const redacted = redactAuditDetail({
      apiKey: "api-key-secret",
      authorization: "Bearer raw-token",
      authHeader: "Basic raw-secret",
      authHeaderValue: "decorated-auth-header",
      rawAuthorizationHeader: "raw-authorization-header",
      proxyAuthorization: "proxy-authorization-secret",
      cookie: "sid=raw-cookie",
      setCookie: "sid=raw-set-cookie",
      sessionCookie: "raw-session-cookie",
      privateKey: "raw-private-key",
      authorizationId: "authz-demo",
      nested: {
        xApiKey: "nested-api-key",
        request: {
          authorization_header: "nested-authorization"
        }
      },
      list: [
        {
          cookieValue: "array-cookie"
        },
        {
          authorizationId: "authz-array"
        }
      ]
    });

    expect(redacted).toEqual({
      apiKey: "[REDACTED]",
      authorization: "[REDACTED]",
      authHeader: "[REDACTED]",
      authHeaderValue: "[REDACTED]",
      rawAuthorizationHeader: "[REDACTED]",
      proxyAuthorization: "[REDACTED]",
      cookie: "[REDACTED]",
      setCookie: "[REDACTED]",
      sessionCookie: "[REDACTED]",
      privateKey: "[REDACTED]",
      authorizationId: "authz-demo",
      nested: {
        xApiKey: "[REDACTED]",
        request: {
          authorization_header: "[REDACTED]"
        }
      },
      list: [
        {
          cookieValue: "[REDACTED]"
        },
        {
          authorizationId: "authz-array"
        }
      ]
    });
  });
});
