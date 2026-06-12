import { describe, expect, it } from "vitest";
import { createAuditRecord, redactAuditDetail, type AuditDetail } from "./audit.js";

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

  it("accepts JSON-compatible audit detail values", () => {
    const record = createAuditRecord({
      actor: { type: "relay", id: "relay-dev" },
      action: "relay.peer.join.accepted",
      outcome: "accepted",
      detail: {
        role: "viewer",
        attempts: 2,
        paired: true,
        optional: null,
        nested: {
          values: ["screen:view", 1, false, null]
        }
      }
    });

    expect(record.detail).toEqual({
      role: "viewer",
      attempts: 2,
      paired: true,
      optional: null,
      nested: {
        values: ["screen:view", 1, false, null]
      }
    });
  });

  it("rejects non-JSON audit detail values", () => {
    const circularDetail: Record<string, unknown> = {};
    circularDetail.self = circularDetail;
    const sharedDetail = { shared: { safe: "kept" } };
    sharedDetail.shared = sharedDetail.shared;
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
    const nestedNonEnumerableDetail: Record<string, unknown> = { nested: { safe: "kept" } };
    Object.defineProperty(nestedNonEnumerableDetail.nested as object, "hidden", {
      value: "hidden",
      enumerable: false
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
      nestedNonEnumerableDetail,
      sparseArrayDetail,
      arrayExtraPropertyDetail,
      circularDetail
    ];

    for (const detail of invalidDetails) {
      expect(() =>
        createAuditRecord({
          actor: { type: "relay", id: "relay-dev" },
          action: "relay.peer.join.accepted",
          outcome: "accepted",
          detail: detail as AuditDetail
        })
      ).toThrow("JSON-compatible");
    }

    expect(
      createAuditRecord({
        actor: { type: "relay", id: "relay-dev" },
        action: "relay.peer.join.accepted",
        outcome: "accepted",
        detail: {
          first: sharedDetail.shared,
          second: sharedDetail.shared
        }
      }).detail
    ).toEqual({
      first: { safe: "kept" },
      second: { safe: "kept" }
    });
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
      "token raw-token-secret",
      "clipboard: raw-clipboard",
      "clipboardContent: raw-clipboard-text",
      "fileContent: raw-file-content",
      "fileBytes: raw-file-bytes",
      "fileTransfer: raw-file-transfer",
      "diagnostic: raw-diagnostic",
      "diagnostics: raw-diagnostics",
      "diagnosticDump: raw-diagnostic-dump"
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
      "Relay token rate limit exceeded",
      "clipboard denied",
      "file transfer denied",
      "diagnostic denied"
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
      clipboardText: "raw-clipboard",
      clipboard: "raw-clipboard-exact",
      fileContent: "raw-file",
      fileBytes: "raw-file-bytes",
      fileTransferContent: "raw-file-transfer-content",
      fileTransfer: "raw-file-transfer-exact",
      diagnostic: "raw-diagnostic-exact",
      diagnostics: "raw-diagnostics-exact",
      diagnosticDump: "raw-diagnostics",
      fileTransferId: "transfer-demo",
      diagnosticId: "diagnostic-demo",
      diagnosticStatus: "collected",
      fileName: "support.txt",
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
      clipboardText: "[REDACTED]",
      clipboard: "[REDACTED]",
      fileContent: "[REDACTED]",
      fileBytes: "[REDACTED]",
      fileTransferContent: "[REDACTED]",
      fileTransfer: "[REDACTED]",
      diagnostic: "[REDACTED]",
      diagnostics: "[REDACTED]",
      diagnosticDump: "[REDACTED]",
      fileTransferId: "transfer-demo",
      diagnosticId: "diagnostic-demo",
      diagnosticStatus: "collected",
      fileName: "support.txt",
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
      fileTransfer: {
        fileData: "raw-transfer-data"
      },
      fileTransferId: "transfer-demo",
      diagnosticId: "diagnostic-demo",
      diagnosticStatus: "ready",
      nested: {
        xApiKey: "nested-api-key",
        diagnostics: "raw-diagnostics",
        request: {
          authorization_header: "nested-authorization",
          clipboardContents: "nested-clipboard"
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
      fileTransfer: "[REDACTED]",
      fileTransferId: "transfer-demo",
      diagnosticId: "diagnostic-demo",
      diagnosticStatus: "ready",
      nested: {
        xApiKey: "[REDACTED]",
        diagnostics: "[REDACTED]",
        request: {
          authorization_header: "[REDACTED]",
          clipboardContents: "[REDACTED]"
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

  it("redacts display-name and private reason detail keys while preserving safe metadata", () => {
    const redacted = redactAuditDetail({
      displayName: "Raw Host Name",
      hostDisplayName: "Raw Host",
      viewerDisplayName: "Raw Viewer",
      deviceDisplayName: "Raw Device",
      reason: "private denial reason",
      reasonText: "private reason text",
      rawReason: "raw reason",
      denialReason: "denial reason",
      revokeReason: "revoke reason",
      pauseReason: "pause reason",
      resumeReason: "resume reason",
      terminationReason: "termination reason",
      reasonCode: "peer-closed",
      reasonConfigured: true,
      authorizationId: "authz-demo",
      nested: {
        displayName: "Nested Name",
        lifecycleReason: "nested lifecycle reason"
      },
      attempts: [
        {
          viewerDisplayName: "Array Viewer",
          decisionReason: "array decision reason"
        }
      ]
    });

    expect(redacted).toEqual({
      displayName: "[REDACTED]",
      hostDisplayName: "[REDACTED]",
      viewerDisplayName: "[REDACTED]",
      deviceDisplayName: "[REDACTED]",
      reason: "[REDACTED]",
      reasonText: "[REDACTED]",
      rawReason: "[REDACTED]",
      denialReason: "[REDACTED]",
      revokeReason: "[REDACTED]",
      pauseReason: "[REDACTED]",
      resumeReason: "[REDACTED]",
      terminationReason: "[REDACTED]",
      reasonCode: "peer-closed",
      reasonConfigured: true,
      authorizationId: "authz-demo",
      nested: {
        displayName: "[REDACTED]",
        lifecycleReason: "[REDACTED]"
      },
      attempts: [
        {
          viewerDisplayName: "[REDACTED]",
          decisionReason: "[REDACTED]"
        }
      ]
    });
  });
});
