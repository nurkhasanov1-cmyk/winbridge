import { describe, expect, it } from "vitest";
import { AgentShellUsageError, parseArgs } from "./args.js";

describe("agent shell arguments", () => {
  const workflowTimerOptions = [
    ["authorization-ttl-ms", "authorizationTtlMs"],
    ["revoke-after-ms", "hostRevokeAfterMs"],
    ["pause-after-ms", "hostPauseAfterMs"],
    ["resume-after-ms", "hostResumeAfterMs"],
    ["terminate-after-ms", "hostTerminateAfterMs"]
  ] as const;

  it("uses fail-closed defaults when optional consent flags are omitted", () => {
    const args = parseArgs(["viewer"], {}, 42);

    expect(args).toMatchObject({
      role: "viewer",
      relayUrl: "ws://localhost:8787/",
      sessionId: "demo",
      pairingCode: "123-456",
      peerId: "viewer-42",
      displayName: "viewer 42",
      deviceId: "dev_viewer_42",
      requestedPermissions: [],
      hostDecision: "none",
      visibleToHost: false
    });
  });

  it("parses explicit visible session boolean values", () => {
    expect(parseArgs(["host", "--visible-session", "true"], {}, 42).visibleToHost).toBe(true);
    expect(parseArgs(["host", "--visible-session", "false"], {}, 42).visibleToHost).toBe(false);
  });

  it("parses absolute websocket relay urls", () => {
    expect(parseArgs(["viewer", "--relay", "ws://127.0.0.1:8787"], {}, 42).relayUrl).toBe(
      "ws://127.0.0.1:8787/"
    );
    expect(parseArgs(["viewer", "--relay", "wss://relay.example.test/session"], {}, 42).relayUrl).toBe(
      "wss://relay.example.test/session"
    );
  });

  it("rejects malformed relay url values", () => {
    for (const relayUrl of ["localhost:8787", "http://localhost:8787", "file:///tmp/relay", "not a url"]) {
      expect(() => parseArgs(["viewer", "--relay", relayUrl], {}, 42)).toThrow(
        AgentShellUsageError
      );
    }
  });

  it("rejects relay urls with token query values", () => {
    for (const relayUrl of [
      "ws://127.0.0.1:8787/?token=raw-token",
      "wss://relay.example.test/session?token=raw-token"
    ]) {
      expect(() => parseArgs(["viewer", "--relay", relayUrl], {}, 42)).toThrow(
        AgentShellUsageError
      );
    }
  });

  it("rejects malformed visible session values", () => {
    expect(() => parseArgs(["host", "--visible-session", "yes"], {}, 42)).toThrow(
      AgentShellUsageError
    );
  });

  it("rejects unknown and duplicate options", () => {
    expect(() => parseArgs(["viewer", "--visible-sesion", "true"], {}, 42)).toThrow(
      AgentShellUsageError
    );
    expect(() =>
      parseArgs(["viewer", "--request", "screen:view", "--request", "input:pointer"], {}, 42)
    ).toThrow(AgentShellUsageError);
  });

  it("rejects missing option values", () => {
    expect(() => parseArgs(["viewer", "--peer", "--visible-session"], {}, 42)).toThrow(
      AgentShellUsageError
    );
  });

  it("rejects invalid permission and pairing values", () => {
    expect(() => parseArgs(["viewer", "--request", "input:keylogger"], {}, 42)).toThrow(
      AgentShellUsageError
    );
    expect(() => parseArgs(["viewer", "--pairing", "secret"], {}, 42)).toThrow(
      AgentShellUsageError
    );
  });

  it("rejects duplicate requested permissions", () => {
    expect(() =>
      parseArgs(["viewer", "--request", "screen:view,input:pointer,screen:view"], {}, 42)
    ).toThrow(AgentShellUsageError);
  });

  it("rejects malformed protocol identifier values", () => {
    expect(() => parseArgs(["viewer", "--session", "demo session"], {}, 42)).toThrow(
      AgentShellUsageError
    );
    expect(() => parseArgs(["viewer", "--peer", "viewer/42"], {}, 42)).toThrow(
      AgentShellUsageError
    );
    expect(() => parseArgs(["viewer", "--device", "dev viewer 42"], {}, 42)).toThrow(
      AgentShellUsageError
    );
  });

  it("parses valid display names", () => {
    expect(parseArgs(["viewer"], {}, 42).displayName).toBe("viewer 42");
    expect(parseArgs(["viewer", "--name", "Viewer Support"], {}, 42).displayName).toBe(
      "Viewer Support"
    );
    expect(parseArgs(["viewer", "--name", "  Viewer Support  "], {}, 42).displayName).toBe(
      "  Viewer Support  "
    );
  });

  it("rejects malformed display names", () => {
    for (const displayName of ["", "   ", "x".repeat(121)]) {
      expect(() => parseArgs(["viewer", "--name", displayName], {}, 42)).toThrow(
        AgentShellUsageError
      );
    }
  });

  it("rejects malformed lifecycle reason values", () => {
    for (const option of ["revoke-reason", "pause-reason", "resume-reason", "terminate-reason"]) {
      expect(() => parseArgs(["host", `--${option}`, "   "], {}, 42)).toThrow(
        AgentShellUsageError
      );
      expect(() => parseArgs(["host", `--${option}`, "x".repeat(241)], {}, 42)).toThrow(
        AgentShellUsageError
      );
    }
  });

  it("parses bounded workflow timer delays", () => {
    for (const [option, property] of workflowTimerOptions) {
      expect(parseArgs(["host", `--${option}`, "0"], {}, 42)[property]).toBe(0);
      expect(parseArgs(["host", `--${option}`, "2147483647"], {}, 42)[property]).toBe(
        2147483647
      );
    }
  });

  it("rejects oversized workflow timer delays", () => {
    for (const [option] of workflowTimerOptions) {
      expect(() => parseArgs(["host", `--${option}`, "2147483648"], {}, 42)).toThrow(
        AgentShellUsageError
      );
    }
  });

  it("parses valid audit log paths", () => {
    expect(parseArgs(["host", "--audit-log", "logs/agent-audit.jsonl"], {}, 42).auditLogPath).toBe(
      "logs/agent-audit.jsonl"
    );
    expect(
      parseArgs(["host"], { WINBRIDGE_AGENT_AUDIT_LOG_PATH: "logs/env-audit.jsonl" }, 42)
        .auditLogPath
    ).toBe("logs/env-audit.jsonl");
  });

  it("rejects blank audit log paths", () => {
    for (const auditLogPath of ["", "   "]) {
      expect(() => parseArgs(["host", "--audit-log", auditLogPath], {}, 42)).toThrow(
        AgentShellUsageError
      );
      expect(() =>
        parseArgs(["host"], { WINBRIDGE_AGENT_AUDIT_LOG_PATH: auditLogPath }, 42)
      ).toThrow(AgentShellUsageError);
    }
  });

  it("parses optional relay tokens", () => {
    expect(parseArgs(["host"], {}, 42).token).toBeUndefined();
    expect(parseArgs(["host", "--token", "dev-token"], {}, 42).token).toBe("dev-token");
    expect(parseArgs(["host", "--token", "  dev-token  "], {}, 42).token).toBe(
      "  dev-token  "
    );
  });

  it("rejects blank relay tokens", () => {
    for (const token of ["", "   "]) {
      expect(() => parseArgs(["host", "--token", token], {}, 42)).toThrow(
        AgentShellUsageError
      );
    }
  });

  it("parses valid workflow options", () => {
    const args = parseArgs(
      [
        "host",
        "--request",
        "screen:view,input:pointer",
        "--host-decision",
        "approve",
        "--visible-session",
        "true",
        "--authorization-ttl-ms",
        "600000",
        "--revoke-permission",
        "input:pointer",
        "--revoke-reason",
        "Host revoked pointer",
        "--pause-reason",
        "Host paused",
        "--resume-reason",
        "Host resumed",
        "--terminate-reason",
        "Host terminated"
      ],
      { WINBRIDGE_AGENT_AUDIT_LOG_PATH: "logs/audit.jsonl" },
      42
    );

    expect(args).toMatchObject({
      auditLogPath: "logs/audit.jsonl",
      requestedPermissions: ["screen:view", "input:pointer"],
      hostDecision: "approve",
      visibleToHost: true,
      authorizationTtlMs: 600000,
      hostRevokePermission: "input:pointer",
      hostRevokeReason: "Host revoked pointer",
      hostPauseReason: "Host paused",
      hostResumeReason: "Host resumed",
      hostTerminateReason: "Host terminated"
    });
  });
});
