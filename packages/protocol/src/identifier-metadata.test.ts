import { describe, expect, it } from "vitest";
import {
  createAuditRecord,
  hasSecretBearingProtocolIdentifierMetadata as auditModuleIdentifierClassifier
} from "./audit.js";
import { hasSecretBearingProtocolIdentifierMetadata } from "./identifier-metadata.js";
import { assertConsentBoundGrant } from "./session.js";

const secretBearingIdentifierSamples = [
  "token-raw-shared",
  "credential-raw-shared",
  "password-raw-shared",
  "passphrase-raw-shared",
  "secret-raw-shared",
  "pairing-code-raw-shared",
  "api-key-raw-shared",
  "access-key-raw-shared",
  "cookie-raw-shared",
  "private-key-raw-shared",
  "ssh-key-raw-shared",
  "authorization-raw-shared",
  "authorization-header-raw-shared",
  "auth-header-raw-shared",
  "proxy-authorization-raw-shared"
] as const;

function validGrant(
  overrides: Record<string, unknown> = {}
): Parameters<typeof assertConsentBoundGrant>[0] {
  return {
    sessionId: "session-demo",
    hostPeerId: "host-1",
    viewerPeerId: "viewer-1",
    permissions: ["screen:view"],
    requiresHostApproval: true,
    visibleSessionRequired: true,
    expiresAt: "2099-01-01T00:00:00.000Z",
    auditId: "audit-demo",
    ...overrides
  } as Parameters<typeof assertConsentBoundGrant>[0];
}

function expectBoundedIdentifierRejection(
  operation: () => void,
  label: string,
  unsafeValue: string,
  expectedMessage: string
): void {
  let thrown: unknown;

  try {
    operation();
  } catch (error) {
    thrown = error;
  }

  expect(thrown, `${label}:${unsafeValue}`).toBeInstanceOf(Error);
  expect((thrown as Error).message, `${label}:${unsafeValue}`).toContain(expectedMessage);
  expect((thrown as Error).message, `${label}:${unsafeValue}`).toContain("sensitive metadata");
  expect((thrown as Error).message, `${label}:${unsafeValue}`).not.toContain(unsafeValue);
  expect((thrown as Error).message, `${label}:${unsafeValue}`).not.toContain("raw-shared");
}

describe("secret-bearing protocol identifier metadata", () => {
  it("uses the same classifier through the audit module export", () => {
    expect(auditModuleIdentifierClassifier).toBe(hasSecretBearingProtocolIdentifierMetadata);
    expect(hasSecretBearingProtocolIdentifierMetadata("session-demo")).toBe(false);

    for (const unsafeValue of secretBearingIdentifierSamples) {
      expect(hasSecretBearingProtocolIdentifierMetadata(unsafeValue), unsafeValue).toBe(true);
    }
  });

  it("aligns audit and consent grant fixed identifier rejection", () => {
    const auditCases = [
      {
        name: "eventId",
        operation: (value: string) =>
          createAuditRecord({
            eventId: value,
            actor: { type: "relay", id: "relay-dev" },
            action: "relay.peer.join.accepted",
            outcome: "accepted"
          })
      },
      {
        name: "actor.id",
        operation: (value: string) =>
          createAuditRecord({
            actor: { type: "host", id: value },
            action: "agent-shell.authorization.active",
            outcome: "accepted",
            sessionId: "session-demo"
          })
      },
      {
        name: "sessionId",
        operation: (value: string) =>
          createAuditRecord({
            actor: { type: "relay", id: "relay-dev" },
            action: "relay.peer.join.accepted",
            outcome: "accepted",
            sessionId: value
          })
      },
      {
        name: "target.id",
        operation: (value: string) =>
          createAuditRecord({
            actor: { type: "relay", id: "relay-dev" },
            action: "relay.message.forwarded",
            outcome: "accepted",
            target: { type: "peer", id: value }
          })
      }
    ] as const;
    const grantCases = [
      {
        name: "grant.sessionId",
        operation: (value: string) => assertConsentBoundGrant(validGrant({ sessionId: value }))
      },
      {
        name: "grant.hostPeerId",
        operation: (value: string) => assertConsentBoundGrant(validGrant({ hostPeerId: value }))
      },
      {
        name: "grant.viewerPeerId",
        operation: (value: string) => assertConsentBoundGrant(validGrant({ viewerPeerId: value }))
      },
      {
        name: "grant.auditId",
        operation: (value: string) => assertConsentBoundGrant(validGrant({ auditId: value }))
      }
    ] as const;

    for (const unsafeValue of secretBearingIdentifierSamples) {
      for (const { name, operation } of auditCases) {
        expectBoundedIdentifierRejection(
          () => operation(unsafeValue),
          name,
          unsafeValue,
          "Audit identifier"
        );
      }

      for (const { name, operation } of grantCases) {
        expectBoundedIdentifierRejection(
          () => operation(unsafeValue),
          name,
          unsafeValue,
          "Session grant identifier"
        );
      }
    }
  });
});
