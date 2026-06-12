import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { ConsoleAuditSink, FileAuditSink, MemoryAuditSink } from "./index.js";

describe("MemoryAuditSink", () => {
  it("stores audit records in write order", () => {
    const sink = new MemoryAuditSink();

    sink.write({
      actor: { type: "relay", id: "relay-dev" },
      action: "first",
      outcome: "accepted"
    });
    sink.write({
      actor: { type: "relay", id: "relay-dev" },
      action: "second",
      outcome: "failed"
    });

    expect(sink.records().map((record) => record.action)).toEqual(["first", "second"]);
  });

  it("validates records before storing them", () => {
    const sink = new MemoryAuditSink();

    expect(() =>
      sink.write({
        actor: { type: "relay", id: "" },
        action: "invalid",
        outcome: "failed"
      })
    ).toThrow();
    expect(() =>
      sink.write({
        actor: { type: "relay", id: "relay-dev" },
        action: "invalid",
        outcome: "failed",
        sessionId: "session with spaces"
      })
    ).toThrow();
    expect(sink.records()).toHaveLength(0);
  });

  it("redacts sensitive values before storing them", () => {
    const sink = new MemoryAuditSink();

    const record = sink.write({
      actor: { type: "relay", id: "relay-dev" },
      action: "relay.peer.join.denied",
      outcome: "denied",
      detail: {
        token: "secret",
        pairingCode: "123-456",
        password: "secret",
        keystroke: "typed",
        screenData: "pixels"
      }
    });

    expect(record.detail).toEqual({
      token: "[REDACTED]",
      pairingCode: "[REDACTED]",
      password: "[REDACTED]",
      keystroke: "[REDACTED]",
      screenData: "[REDACTED]"
    });
  });
});

describe("ConsoleAuditSink", () => {
  it("writes one JSON line per record", () => {
    const lines: string[] = [];
    const sink = new ConsoleAuditSink((line) => lines.push(line));

    sink.write({
      actor: { type: "relay", id: "relay-dev" },
      action: "relay.peer.disconnect",
      outcome: "accepted",
      sessionId: "session-demo"
    });

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({
      action: "relay.peer.disconnect",
      sessionId: "session-demo"
    });
  });
});

describe("FileAuditSink", () => {
  it("rejects blank paths before writing records", () => {
    for (const path of ["", "   "]) {
      expect(() => new FileAuditSink(path)).toThrow("Audit log path must not be blank");
    }
  });

  it("writes JSONL records in write order and creates parent directories", () => {
    const root = mkdtempSync(join(tmpdir(), "winbridge-audit-"));
    const path = join(root, "nested", "audit.jsonl");
    const sink = new FileAuditSink(path);

    try {
      sink.write({
        actor: { type: "relay", id: "relay-dev" },
        action: "first",
        outcome: "accepted"
      });
      sink.write({
        actor: { type: "relay", id: "relay-dev" },
        action: "second",
        outcome: "failed"
      });

      const lines = readFileSync(path, "utf8").trim().split(/\r?\n/);
      expect(lines.map((line) => JSON.parse(line).action)).toEqual(["first", "second"]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("redacts sensitive values before writing JSONL records", () => {
    const root = mkdtempSync(join(tmpdir(), "winbridge-audit-"));
    const path = join(root, "audit.jsonl");
    const sink = new FileAuditSink(path);

    try {
      sink.write({
        actor: { type: "relay", id: "relay-dev" },
        action: "relay.token.denied",
        outcome: "denied",
        detail: {
          token: "secret-token",
          pairingCode: "123-456",
          credential: "secret-credential",
          keystroke: "typed",
          screenshot: "raw-screen"
        }
      });

      const content = readFileSync(path, "utf8");
      expect(content).not.toContain("secret-token");
      expect(content).not.toContain("123-456");
      expect(content).not.toContain("secret-credential");
      expect(content).not.toContain("typed");
      expect(content).not.toContain("raw-screen");
      expect(JSON.parse(content).detail).toMatchObject({
        token: "[REDACTED]",
        pairingCode: "[REDACTED]",
        credential: "[REDACTED]",
        keystroke: "[REDACTED]",
        screenshot: "[REDACTED]"
      });
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("redacts sensitive top-level reasons before writing JSONL records", () => {
    const root = mkdtempSync(join(tmpdir(), "winbridge-audit-"));
    const path = join(root, "audit.jsonl");
    const sink = new FileAuditSink(path);

    try {
      sink.write({
        actor: { type: "relay", id: "relay-dev" },
        action: "relay.message.rejected",
        outcome: "failed",
        reason: "Authorization: raw-token-secret",
        detail: {
          messageType: "signal"
        }
      });

      const content = readFileSync(path, "utf8");
      expect(content).not.toContain("raw-token-secret");
      expect(JSON.parse(content).reason).toBe("[REDACTED]");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("redacts expanded authentication keys before writing JSONL records", () => {
    const root = mkdtempSync(join(tmpdir(), "winbridge-audit-"));
    const path = join(root, "audit.jsonl");
    const sink = new FileAuditSink(path);

    try {
      sink.write({
        actor: { type: "relay", id: "relay-dev" },
        action: "relay.message.rejected",
        outcome: "failed",
        detail: {
          apiKey: "api-key-secret",
          authorization: "Bearer raw-token",
          authHeaderValue: "decorated-auth-header",
          rawAuthorizationHeader: "raw-authorization-header",
          proxyAuthorization: "proxy-authorization-secret",
          cookie: "sid=raw-cookie",
          privateKey: "raw-private-key",
          authorizationId: "authz-demo",
          nested: {
            authHeader: "Basic raw-secret"
          }
        }
      });

      const content = readFileSync(path, "utf8");
      expect(content).not.toContain("api-key-secret");
      expect(content).not.toContain("raw-token");
      expect(content).not.toContain("decorated-auth-header");
      expect(content).not.toContain("raw-authorization-header");
      expect(content).not.toContain("proxy-authorization-secret");
      expect(content).not.toContain("raw-cookie");
      expect(content).not.toContain("raw-private-key");
      expect(content).not.toContain("raw-secret");
      expect(JSON.parse(content).detail).toMatchObject({
        apiKey: "[REDACTED]",
        authorization: "[REDACTED]",
        authHeaderValue: "[REDACTED]",
        rawAuthorizationHeader: "[REDACTED]",
        proxyAuthorization: "[REDACTED]",
        cookie: "[REDACTED]",
        privateKey: "[REDACTED]",
        authorizationId: "authz-demo",
        nested: {
          authHeader: "[REDACTED]"
        }
      });
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("surfaces write failures", () => {
    const root = mkdtempSync(join(tmpdir(), "winbridge-audit-"));
    const path = join(root, "directory-target");
    const sink = new FileAuditSink(path);

    try {
      mkdirSync(path);
      expect(() =>
        sink.write({
          actor: { type: "relay", id: "relay-dev" },
          action: "will-fail",
          outcome: "failed"
        })
      ).toThrow();
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
