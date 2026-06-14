import { describe, expect, it } from "vitest";
import { createAuditRecord, redactAuditDetail, type AuditDetail, type AuditRecord } from "./audit.js";

function expectImmutableAuditRecordSnapshot(record: AuditRecord): void {
  expect(Object.isFrozen(record)).toBe(true);
  expect(Object.isFrozen(record.actor)).toBe(true);
  expect(Object.isFrozen(record.detail)).toBe(true);
}

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

  it("returns immutable audit record snapshots", () => {
    const record = createAuditRecord({
      actor: { type: "host", id: "host-1", deviceId: "device-host-1" },
      action: "agent-shell.authorization.active",
      outcome: "accepted",
      sessionId: "session-demo",
      target: {
        type: "authorization",
        id: "authz-demo"
      },
      detail: {
        authorizationId: "authz-demo",
        nested: {
          safe: "kept"
        },
        attempts: [{ remaining: 1 }]
      }
    });

    expectImmutableAuditRecordSnapshot(record);
    expect(Object.isFrozen(record.target)).toBe(true);
    expect(Object.isFrozen(record.detail.nested as object)).toBe(true);
    expect(Object.isFrozen(record.detail.attempts as object)).toBe(true);
    expect(Object.isFrozen((record.detail.attempts as Array<Record<string, unknown>>)[0])).toBe(true);
    expect(() => {
      (record as unknown as { action: string }).action = "tampered";
    }).toThrow(TypeError);
    expect(() => {
      record.actor.id = "viewer-1";
    }).toThrow(TypeError);
    expect(() => {
      record.target!.id = "other-authz";
    }).toThrow(TypeError);
    expect(() => {
      (record.detail.nested as Record<string, unknown>).safe = "tampered";
    }).toThrow(TypeError);
  });

  it("prevents restoring redacted audit reason and detail metadata", () => {
    const record = createAuditRecord({
      actor: { type: "relay", id: "relay-dev" },
      action: "relay.peer.join.denied",
      outcome: "denied",
      reason: "token raw-token",
      detail: {
        token: "raw-token",
        nested: {
          password: "raw-password",
          safe: "kept"
        }
      }
    });

    expectImmutableAuditRecordSnapshot(record);
    expect(record.reason).toBe("[REDACTED]");
    expect(record.detail).toMatchObject({
      token: "[REDACTED]",
      nested: {
        password: "[REDACTED]",
        safe: "kept"
      }
    });

    const nested = record.detail.nested as Record<string, unknown>;
    expect(Object.isFrozen(nested)).toBe(true);
    expect(() => {
      record.reason = "token raw-token";
    }).toThrow(TypeError);
    expect(() => {
      record.detail.token = "raw-token";
    }).toThrow(TypeError);
    expect(() => {
      nested.password = "raw-password";
    }).toThrow(TypeError);
    expect(JSON.stringify(record)).not.toContain("raw-token");
    expect(JSON.stringify(record)).not.toContain("raw-password");
  });

  it("serializes immutable audit records with the same redacted JSON shape", () => {
    const record = createAuditRecord({
      eventId: "audit-demo",
      timestamp: "2026-06-14T00:00:00.000Z",
      actor: { type: "host", id: "host-1", deviceId: "device-host-1" },
      action: "agent-shell.authorization.active",
      outcome: "accepted",
      sessionId: "session-demo",
      target: {
        type: "authorization",
        id: "authz-demo"
      },
      detail: {
        authorizationId: "authz-demo",
        token: "raw-token",
        nested: {
          safe: true
        }
      }
    });

    expect(JSON.parse(JSON.stringify(record))).toStrictEqual({
      eventId: "audit-demo",
      timestamp: "2026-06-14T00:00:00.000Z",
      actor: { type: "host", id: "host-1", deviceId: "device-host-1" },
      action: "agent-shell.authorization.active",
      outcome: "accepted",
      sessionId: "session-demo",
      target: {
        type: "authorization",
        id: "authz-demo"
      },
      detail: {
        authorizationId: "authz-demo",
        token: "[REDACTED]",
        nested: {
          safe: true
        }
      }
    });
  });

  it("allows device ids only for participant audit actors", () => {
    expect(
      createAuditRecord({
        actor: { type: "host", id: "host-1", deviceId: "dev_host_1" },
        action: "agent-shell.authorization.active",
        outcome: "accepted",
        sessionId: "session-demo"
      }).actor
    ).toEqual({ type: "host", id: "host-1", deviceId: "dev_host_1" });
    expect(
      createAuditRecord({
        actor: { type: "viewer", id: "viewer-1", deviceId: "dev_viewer_1" },
        action: "agent-shell.authorization.requested",
        outcome: "accepted",
        sessionId: "session-demo"
      }).actor
    ).toEqual({ type: "viewer", id: "viewer-1", deviceId: "dev_viewer_1" });

    for (const actorType of ["system", "relay"] as const) {
      try {
        createAuditRecord({
          actor: { type: actorType, id: `${actorType}-dev`, deviceId: `dev_${actorType}_private` },
          action: "relay.peer.join.accepted",
          outcome: "accepted"
        });
        throw new Error(`Expected ${actorType} actor deviceId to be rejected`);
      } catch (error) {
        expect(error, actorType).toBeInstanceOf(Error);
        expect((error as Error).message, actorType).toContain(
          "Infrastructure audit actors must not include deviceId"
        );
        expect((error as Error).message, actorType).not.toContain(`dev_${actorType}_private`);
      }
    }
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

  it("preserves own __proto__ audit detail properties as JSON data", () => {
    const detail = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(detail, "role", {
      configurable: true,
      enumerable: true,
      value: "viewer",
      writable: true
    });
    Object.defineProperty(detail, "__proto__", {
      configurable: true,
      enumerable: true,
      value: { safe: "kept" },
      writable: true
    });

    const record = createAuditRecord({
      actor: { type: "relay", id: "relay-dev" },
      action: "relay.peer.join.accepted",
      outcome: "accepted",
      detail: detail as AuditDetail
    });

    expect(Object.prototype.hasOwnProperty.call(record.detail, "__proto__")).toBe(true);
    expect(record.detail.__proto__).toEqual({ safe: "kept" });
    expect(JSON.stringify(record.detail)).toContain("\"__proto__\":{\"safe\":\"kept\"}");
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

  it("rejects unsafe audit detail keys without exposing raw key text", () => {
    const cases: Array<{
      name: string;
      detail: Record<string, unknown>;
      rawKey: string;
      message: string;
    }> = [
      {
        name: "control-character key",
        rawKey: "unsafe\nprivate-detail-key",
        detail: {
          "unsafe\nprivate-detail-key": "value"
        },
        message: "Audit detail keys must not contain ASCII control characters"
      },
      {
        name: "bidi-control nested key",
        rawKey: "unsafe\u202eprivate-detail-key",
        detail: {
          nested: {
            "unsafe\u202eprivate-detail-key": "value"
          }
        },
        message: "Audit detail keys must not contain Unicode bidi or zero-width formatting controls"
      },
      {
        name: "zero-width array object key",
        rawKey: "unsafe\ufeffprivate-detail-key",
        detail: {
          attempts: [
            {
              "unsafe\ufeffprivate-detail-key": "value"
            }
          ]
        },
        message: "Audit detail keys must not contain Unicode bidi or zero-width formatting controls"
      }
    ];

    for (const { detail, message, name, rawKey } of cases) {
      for (const operation of [
        () =>
          createAuditRecord({
            actor: { type: "relay", id: "relay-dev" },
            action: "relay.peer.join.accepted",
            outcome: "accepted",
            detail: detail as AuditDetail
          }),
        () => redactAuditDetail(detail)
      ]) {
        try {
          operation();
          throw new Error(`Expected unsafe audit detail key to be rejected for ${name}`);
        } catch (error) {
          expect(error, name).toBeInstanceOf(Error);
          expect((error as Error).message, name).toContain(message);
          expect((error as Error).message, name).not.toContain("private-detail-key");
          expect((error as Error).message, name).not.toContain(rawKey);
        }
      }
    }
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

  it("rejects unknown fixed audit record, actor, and target fields", () => {
    expect(() =>
      createAuditRecord({
        actor: { type: "relay", id: "relay-dev" },
        action: "relay.peer.join.accepted",
        outcome: "accepted",
        unknownFixedField: "must-fail"
      } as unknown as Parameters<typeof createAuditRecord>[0])
    ).toThrow();
    expect(() =>
      createAuditRecord({
        actor: { type: "relay", id: "relay-dev", unknownFixedField: "must-fail" },
        action: "relay.peer.join.accepted",
        outcome: "accepted"
      } as unknown as Parameters<typeof createAuditRecord>[0])
    ).toThrow();
    expect(() =>
      createAuditRecord({
        actor: { type: "relay", id: "relay-dev" },
        action: "relay.message.forwarded",
        outcome: "accepted",
        target: { type: "peer", id: "viewer-1", unknownFixedField: "must-fail" }
      } as unknown as Parameters<typeof createAuditRecord>[0])
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

  it("rejects untrimmed audit metadata fields", () => {
    expect(() =>
      createAuditRecord({
        actor: { type: "relay", id: "relay-dev" },
        action: " relay.message.rejected",
        outcome: "failed"
      })
    ).toThrow("Audit action must be trimmed");
    expect(() =>
      createAuditRecord({
        actor: { type: "relay", id: "relay-dev" },
        action: "relay.message.rejected",
        outcome: "failed",
        reason: "Invalid relay token "
      })
    ).toThrow("Audit reason must be trimmed");
    expect(() =>
      createAuditRecord({
        actor: { type: "relay", id: "relay-dev" },
        action: "relay.message.forwarded",
        outcome: "accepted",
        target: {
          type: " peer ",
          id: "viewer-1"
        }
      })
    ).toThrow("Audit target type must be trimmed");
  });

  it("rejects audit metadata fields with ASCII control characters", () => {
    expect(() =>
      createAuditRecord({
        actor: { type: "relay", id: "relay-dev" },
        action: "relay\nmessage.rejected",
        outcome: "failed"
      })
    ).toThrow("Audit action must not contain ASCII control characters");
    expect(() =>
      createAuditRecord({
        actor: { type: "relay", id: "relay-dev" },
        action: "relay.message.rejected",
        outcome: "failed",
        reason: "Invalid\nrelay message"
      })
    ).toThrow("Audit reason must not contain ASCII control characters");
    expect(() =>
      createAuditRecord({
        actor: { type: "relay", id: "relay-dev" },
        action: "relay.message.forwarded",
        outcome: "accepted",
        target: {
          type: "pe\ner",
          id: "viewer-1"
        }
      })
    ).toThrow("Audit target type must not contain ASCII control characters");
  });

  it("rejects audit metadata fields with Unicode bidi or zero-width controls", () => {
    expect(() =>
      createAuditRecord({
        actor: { type: "relay", id: "relay-dev" },
        action: "relay\u202emessage.rejected",
        outcome: "failed"
      })
    ).toThrow("Audit action must not contain Unicode bidi or zero-width formatting controls");
    expect(() =>
      createAuditRecord({
        actor: { type: "relay", id: "relay-dev" },
        action: "relay.message.rejected",
        outcome: "failed",
        reason: "Invalid\u200brelay message"
      })
    ).toThrow("Audit reason must not contain Unicode bidi or zero-width formatting controls");
    expect(() =>
      createAuditRecord({
        actor: { type: "relay", id: "relay-dev" },
        action: "relay.message.forwarded",
        outcome: "accepted",
        target: {
          type: "pe\ufeffer",
          id: "viewer-1"
        }
      })
    ).toThrow("Audit target type must not contain Unicode bidi or zero-width formatting controls");
  });

  it("rejects unsafe audit metadata without exposing raw private text", () => {
    const cases: Array<{
      name: string;
      buildRecord: (value: string) => Parameters<typeof createAuditRecord>[0];
      value: string;
    }> = [
      {
        name: "action",
        value: "audit-private-marker\n",
        buildRecord: (value) => ({
          actor: { type: "relay", id: "relay-dev" },
          action: value,
          outcome: "failed"
        })
      },
      {
        name: "reason",
        value: "audit-private-marker\u202e",
        buildRecord: (value) => ({
          actor: { type: "relay", id: "relay-dev" },
          action: "relay.message.rejected",
          outcome: "failed",
          reason: value
        })
      },
      {
        name: "target type",
        value: "audit-private-marker\ufeff",
        buildRecord: (value) => ({
          actor: { type: "relay", id: "relay-dev" },
          action: "relay.message.forwarded",
          outcome: "accepted",
          target: {
            type: value,
            id: "viewer-1"
          }
        })
      }
    ];

    for (const { buildRecord, name, value } of cases) {
      try {
        createAuditRecord(buildRecord(value));
        throw new Error(`Expected unsafe audit ${name} metadata to be rejected`);
      } catch (error) {
        expect(error, name).toBeInstanceOf(Error);
        expect((error as Error).message, name).not.toContain("audit-private-marker");
        expect((error as Error).message, name).not.toContain(value);
      }
    }
  });

  it("rejects secret-bearing audit actions without exposing raw action text", () => {
    for (const action of [
      "agent-shell.token raw-token-secret",
      "Authorization: Bearer raw-authorization-token",
      "diagnosticDump: raw-diagnostic-dump",
      "screenContent: raw-screen-content",
      "setCookie=raw-set-cookie",
      "sessionCookie raw-session-cookie",
      "cookieValue raw-cookie-value",
      "authHeaderValue raw-auth-header",
      "agent-shell.cookieValue raw-cookie-value",
      "agent-shell.authHeaderValue raw-auth-header",
      "agent-shell.tokenValue raw-token-secret",
      "agent-shell.passphrase raw-passphrase-secret"
    ]) {
      try {
        createAuditRecord({
          actor: { type: "relay", id: "relay-dev" },
          action,
          outcome: "failed"
        });
        throw new Error("Expected secret-bearing audit action to be rejected");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("Audit action must not contain sensitive metadata");
        expect((error as Error).message).not.toContain(action);
        expect((error as Error).message).not.toContain("raw-");
      }
    }
  });

  it("accepts non-secret dotted audit action names", () => {
    for (const action of [
      "relay.peer.join.denied",
      "agent-shell.authorization.active",
      "relay.token.denied",
      "agent-shell.authorizationId.recorded"
    ]) {
      expect(
        createAuditRecord({
          actor: { type: "relay", id: "relay-dev" },
          action,
          outcome: "failed"
        }).action
      ).toBe(action);
    }
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
      "accessKey: raw-access-key",
      "access key raw-access-key-with-space",
      "access_key=raw-access-key-underscore",
      "sshKey: raw-ssh-key",
      "ssh key raw-ssh-key-with-space",
      "passphrase: raw-passphrase",
      "pass phrase raw-passphrase-with-space",
      "private close token raw-close-token",
      "token raw-token-secret",
      "clipboard: raw-clipboard",
      "clipboardContent: raw-clipboard-text",
      "fileContent: raw-file-content",
      "fileBytes: raw-file-bytes",
      "fileTransfer: raw-file-transfer",
      "diagnostic: raw-diagnostic",
      "diagnostics: raw-diagnostics",
      "diagnosticDump: raw-diagnostic-dump",
      "keylog: raw-keylog-content",
      "rawKeylog=raw-keylog-marker",
      "keyloggerOutput raw-keylogger-output"
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
      "diagnostic denied",
      "keylog denied"
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
      passphrase: "secret-passphrase",
      nested: {
        keystroke: "abc",
        screenshot: "raw-image",
        screenData: "raw-screen",
        raw_passphrase: "raw-nested-passphrase"
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
      passphrase: "[REDACTED]",
      nested: {
        keystroke: "[REDACTED]",
        screenshot: "[REDACTED]",
        screenData: "[REDACTED]",
        raw_passphrase: "[REDACTED]"
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

  it("redacts keylogging audit detail fields recursively", () => {
    const redacted = redactAuditDetail({
      keylog: "raw-keylog",
      keylogger: "raw-keylogger",
      rawKeylog: "raw-keylog-marker",
      keyloggerOutput: "raw-keylogger-output",
      keylogSummaryCount: 2,
      safe: "kept",
      nested: {
        keylogData: "nested-keylog-data",
        safeNested: "kept"
      },
      attempts: [
        {
          keyLoggerTrace: "array-keylogger-trace",
          safeArray: "kept"
        }
      ]
    });

    expect(redacted).toEqual({
      keylog: "[REDACTED]",
      keylogger: "[REDACTED]",
      rawKeylog: "[REDACTED]",
      keyloggerOutput: "[REDACTED]",
      keylogSummaryCount: "[REDACTED]",
      safe: "kept",
      nested: {
        keylogData: "[REDACTED]",
        safeNested: "kept"
      },
      attempts: [
        {
          keyLoggerTrace: "[REDACTED]",
          safeArray: "kept"
        }
      ]
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
      accessKey: "raw-access-key",
      access_key: "raw-access-key-underscore",
      "access-key": "raw-access-key-dash",
      cookie: "sid=raw-cookie",
      setCookie: "sid=raw-set-cookie",
      sessionCookie: "raw-session-cookie",
      privateKey: "raw-private-key",
      sshKey: "raw-ssh-key",
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
          ssh_key: "nested-ssh-key",
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
      accessKey: "[REDACTED]",
      access_key: "[REDACTED]",
      "access-key": "[REDACTED]",
      cookie: "[REDACTED]",
      setCookie: "[REDACTED]",
      sessionCookie: "[REDACTED]",
      privateKey: "[REDACTED]",
      sshKey: "[REDACTED]",
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
          ssh_key: "[REDACTED]",
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

  it("redacts access-key and SSH-key audit details in created records", () => {
    const record = createAuditRecord({
      actor: { type: "relay", id: "relay-dev" },
      action: "relay.message.rejected",
      outcome: "failed",
      detail: {
        accessKey: "raw-access-key",
        authorizationId: "authz-demo",
        nested: {
          sshKey: "raw-ssh-key"
        },
        attempts: [
          {
            access_key: "array-access-key",
            authorizationId: "authz-array"
          }
        ]
      }
    });

    expect(record.detail).toEqual({
      accessKey: "[REDACTED]",
      authorizationId: "authz-demo",
      nested: {
        sshKey: "[REDACTED]"
      },
      attempts: [
        {
          access_key: "[REDACTED]",
          authorizationId: "authz-array"
        }
      ]
    });
    expect(JSON.stringify(record)).not.toContain("raw-access-key");
    expect(JSON.stringify(record)).not.toContain("raw-ssh-key");
    expect(JSON.stringify(record)).not.toContain("array-access-key");
  });

  it("redacts secret-bearing authorization id audit detail values", () => {
    const record = createAuditRecord({
      actor: { type: "relay", id: "relay-dev" },
      action: "relay.message.forwarded",
      outcome: "accepted",
      detail: {
        authorizationId: "token-raw-audit-authz-secret",
        safeAuthorizationId: "authz-safe",
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
            authorizationId: "passphrase-raw-audit-authz-secret"
          },
          {
            authorizationId: "authz-array"
          }
        ]
      }
    });

    expect(record.detail).toEqual({
      authorizationId: "[REDACTED]",
      safeAuthorizationId: "authz-safe",
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
          authorizationId: "[REDACTED]"
        },
        {
          authorizationId: "authz-array"
        }
      ]
    });
    expect(JSON.stringify(record)).not.toContain("token-raw-audit-authz-secret");
    expect(JSON.stringify(record)).not.toContain("cookie.raw.audit.authz.secret");
    expect(JSON.stringify(record)).not.toContain("ssh-key-raw-audit-authz-secret");
    expect(JSON.stringify(record)).not.toContain("passphrase-raw-audit-authz-secret");
    expect(JSON.stringify(record)).not.toContain("token-raw-object-authz-secret");
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
