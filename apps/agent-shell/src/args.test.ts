import { describe, expect, it } from "vitest";
import { AgentShellUsageError, parseArgs } from "./args.js";

describe("agent shell arguments", () => {
  const workflowTimerOptions = [
    ["revoke-after-ms", "hostRevokeAfterMs"],
    ["pause-after-ms", "hostPauseAfterMs"],
    ["resume-after-ms", "hostResumeAfterMs"],
    ["terminate-after-ms", "hostTerminateAfterMs"],
    ["disconnect-after-ms", "hostDisconnectAfterMs"]
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
      hostConsentPrompt: false,
      hostControlPrompt: false,
      hostSignalProbeAck: false,
      visibleToHost: false
    });
  });

  it("parses explicit visible session boolean values", () => {
    expect(parseArgs(["host", "--visible-session", "true"], {}, 42).visibleToHost).toBe(true);
    expect(parseArgs(["host", "--visible-session", "false"], {}, 42).visibleToHost).toBe(false);
  });

  it("parses interactive host consent prompt mode for host runtimes", () => {
    expect(parseArgs(["host", "--host-consent-prompt", "true"], {}, 42).hostConsentPrompt).toBe(true);
    expect(
      parseArgs(
        ["host", "--host-consent-prompt", "true", "--host-consent-timeout-ms", "5000"],
        {},
        42
      ).hostConsentTimeoutMs
    ).toBe(5000);
    expect(
      parseArgs(["host", "--host-consent-prompt", "true", "--host-decision", "none"], {}, 42)
        .hostConsentPrompt
    ).toBe(true);
    expect(parseArgs(["host", "--host-consent-prompt", "false"], {}, 42).hostConsentPrompt).toBe(
      false
    );
  });

  it("parses interactive host control prompt mode for host runtimes", () => {
    expect(parseArgs(["host", "--host-control-prompt", "true"], {}, 42).hostControlPrompt).toBe(true);
    expect(parseArgs(["host", "--host-control-prompt", "false"], {}, 42).hostControlPrompt).toBe(false);
  });

  it("parses host signal probe acknowledgement mode for host runtimes", () => {
    expect(parseArgs(["host", "--host-signal-probe-ack", "true"], {}, 42).hostSignalProbeAck).toBe(true);
    expect(parseArgs(["host", "--host-signal-probe-ack", "false"], {}, 42).hostSignalProbeAck).toBe(false);
  });

  it("parses explicit host grant scope for static and interactive approvals", () => {
    expect(
      parseArgs(["host", "--host-decision", "approve", "--grant", "screen:view"], {}, 42)
        .hostGrantPermissions
    ).toEqual(["screen:view"]);
    expect(
      parseArgs(
        ["host", "--host-consent-prompt", "true", "--grant", "screen:view,input:pointer"],
        {},
        42
      ).hostGrantPermissions
    ).toEqual(["screen:view", "input:pointer"]);
  });

  it("parses viewer signal probe mode for screen-view viewer requests", () => {
    expect(
      parseArgs(
        ["viewer", "--request", "screen:view", "--viewer-signal-probe-after-ms", "0"],
        {},
        42
      ).viewerSignalProbeAfterMs
    ).toBe(0);
    expect(
      parseArgs(
        ["viewer", "--request", "screen:view,input:pointer", "--viewer-signal-probe-after-ms", "1000"],
        {},
        42
      ).viewerSignalProbeAfterMs
    ).toBe(1000);
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
      "ws://127.0.0.1:8787/?Token=raw-token",
      "ws://127.0.0.1:8787/?TOKEN=raw-token",
      "wss://relay.example.test/session?token=raw-token"
    ]) {
      expect(() => parseArgs(["viewer", "--relay", relayUrl], {}, 42)).toThrow(
        AgentShellUsageError
      );
    }
  });

  it("rejects relay urls with embedded credentials", () => {
    for (const relayUrl of [
      "ws://user:password@127.0.0.1:8787/",
      "wss://user@relay.example.test/session",
      "ws://@127.0.0.1:8787/",
      "wss://:@relay.example.test/session"
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

  it("rejects malformed interactive host consent prompt values", () => {
    expect(() => parseArgs(["host", "--host-consent-prompt", "yes"], {}, 42)).toThrow(
      AgentShellUsageError
    );
  });

  it("rejects malformed interactive host control prompt values", () => {
    expect(() => parseArgs(["host", "--host-control-prompt", "yes"], {}, 42)).toThrow(
      AgentShellUsageError
    );
  });

  it("rejects malformed host signal probe acknowledgement values", () => {
    for (const value of ["yes", "1", "TRUE", "False", ""]) {
      expect(() => parseArgs(["host", "--host-signal-probe-ack", value], {}, 42)).toThrow(
        AgentShellUsageError
      );
    }
  });

  it("rejects malformed viewer signal probe delay values", () => {
    for (const delayMs of ["-1", "1.5", "Infinity", "01", "2147483648"]) {
      expect(() =>
        parseArgs(
          ["viewer", "--request", "screen:view", "--viewer-signal-probe-after-ms", delayMs],
          {},
          42
        )
      ).toThrow(AgentShellUsageError);
    }
  });

  it("rejects interactive host consent prompt for viewer or static decisions", () => {
    expect(() => parseArgs(["viewer", "--host-consent-prompt", "true"], {}, 42)).toThrow(
      AgentShellUsageError
    );
    expect(() =>
      parseArgs(["host", "--host-consent-prompt", "true", "--host-decision", "approve"], {}, 42)
    ).toThrow(AgentShellUsageError);
    expect(() =>
      parseArgs(["host", "--host-consent-prompt", "true", "--host-decision", "deny"], {}, 42)
    ).toThrow(AgentShellUsageError);
  });

  it("rejects interactive host control prompt for viewer or concurrent consent prompt", () => {
    expect(() => parseArgs(["viewer", "--host-control-prompt", "true"], {}, 42)).toThrow(
      AgentShellUsageError
    );
    expect(() => parseArgs(["viewer", "--host-control-prompt", "false"], {}, 42)).toThrow(
      AgentShellUsageError
    );
    expect(() =>
      parseArgs(
        ["host", "--host-control-prompt", "true", "--host-consent-prompt", "true"],
        {},
        42
      )
    ).toThrow(AgentShellUsageError);
  });

  it("rejects host signal probe acknowledgement for viewer runtimes", () => {
    expect(() => parseArgs(["viewer", "--host-signal-probe-ack", "true"], {}, 42)).toThrow(
      AgentShellUsageError
    );
    expect(() => parseArgs(["viewer", "--host-signal-probe-ack", "false"], {}, 42)).toThrow(
      AgentShellUsageError
    );
  });

  it("rejects viewer signal probe for host runtimes or requests without screen view", () => {
    expect(() => parseArgs(["host", "--viewer-signal-probe-after-ms", "0"], {}, 42)).toThrow(
      AgentShellUsageError
    );
    expect(() =>
      parseArgs(["viewer", "--viewer-signal-probe-after-ms", "0"], {}, 42)
    ).toThrow(AgentShellUsageError);
    expect(() =>
      parseArgs(
        ["viewer", "--request", "input:pointer", "--viewer-signal-probe-after-ms", "0"],
        {},
        42
      )
    ).toThrow(AgentShellUsageError);
  });

  it("rejects malformed host consent timeout values", () => {
    expect(() => parseArgs(["host", "--host-consent-timeout-ms", "5000"], {}, 42)).toThrow(
      AgentShellUsageError
    );

    for (const timeoutMs of ["0", "-1", "1.5", "Infinity", "2147483648"]) {
      expect(() =>
        parseArgs(
          ["host", "--host-consent-prompt", "true", "--host-consent-timeout-ms", timeoutMs],
          {},
          42
        )
      ).toThrow(AgentShellUsageError);
    }
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

  it("parses exact comma-separated requested permissions", () => {
    expect(parseArgs(["viewer", "--request", "screen:view,input:pointer"], {}, 42).requestedPermissions).toEqual([
      "screen:view",
      "input:pointer"
    ]);
  });

  it("rejects whitespace-padded requested permissions", () => {
    for (const request of [
      " screen:view",
      "screen:view ",
      "screen:view, input:pointer",
      "screen:view,input:pointer "
    ]) {
      expect(() => parseArgs(["viewer", "--request", request], {}, 42)).toThrow(
        AgentShellUsageError
      );
    }
  });

  it("rejects duplicate requested permissions", () => {
    expect(() =>
      parseArgs(["viewer", "--request", "screen:view,input:pointer,screen:view"], {}, 42)
    ).toThrow(AgentShellUsageError);
  });

  it("rejects malformed or ambiguous host grant scope configuration", () => {
    for (const raw of [
      ["viewer", "--grant", "screen:view"],
      ["host", "--grant", "screen:view"],
      ["host", "--host-decision", "none", "--grant", "screen:view"],
      ["host", "--host-decision", "deny", "--grant", "screen:view"],
      ["host", "--host-decision", "approve", "--grant", "input:keylogger"],
      ["host", "--host-decision", "approve", "--grant", "screen:view,screen:view"],
      ["host", "--host-decision", "approve", "--grant", " screen:view"]
    ]) {
      expect(() => parseArgs(raw, {}, 42)).toThrow(AgentShellUsageError);
    }
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
  });

  it("rejects malformed display names", () => {
    for (const displayName of [
      "",
      "   ",
      " Viewer Support",
      "Viewer Support ",
      "Viewer\nSupport",
      "Viewer\u202eSupport",
      "Viewer\u200bSupport",
      "Viewer\ufeffSupport",
      "x".repeat(121)
    ]) {
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
      expect(() => parseArgs(["host", `--${option}`, " Host reason"], {}, 42)).toThrow(
        AgentShellUsageError
      );
      expect(() => parseArgs(["host", `--${option}`, "Host reason "], {}, 42)).toThrow(
        AgentShellUsageError
      );
      expect(() => parseArgs(["host", `--${option}`, "Host\nreason"], {}, 42)).toThrow(
        AgentShellUsageError
      );
      expect(() => parseArgs(["host", `--${option}`, "Host\u202ereason"], {}, 42)).toThrow(
        AgentShellUsageError
      );
      expect(() => parseArgs(["host", `--${option}`, "Host\u200breason"], {}, 42)).toThrow(
        AgentShellUsageError
      );
      expect(() => parseArgs(["host", `--${option}`, "Host\ufeffreason"], {}, 42)).toThrow(
        AgentShellUsageError
      );
      expect(() => parseArgs(["host", `--${option}`, "x".repeat(241)], {}, 42)).toThrow(
        AgentShellUsageError
      );
    }
  });

  it("rejects unsafe lifecycle reason values without exposing raw reason text", () => {
    for (const reason of [
      "private-cli-reason-marker\n",
      "private-cli-reason-marker\u202e",
      "private-cli-reason-marker\u200b",
      "private-cli-reason-marker\ufeff"
    ]) {
      try {
        parseArgs(["host", "--terminate-reason", reason], {}, 42);
        throw new Error("Expected unsafe CLI lifecycle reason to be rejected");
      } catch (error) {
        expect(error).toBeInstanceOf(AgentShellUsageError);
        expect((error as Error).message).not.toContain("private-cli-reason-marker");
        expect((error as Error).message).not.toContain(reason);
      }
    }
  });

  it("parses bounded authorization ttl", () => {
    expect(parseArgs(["host", "--authorization-ttl-ms", "1"], {}, 42).authorizationTtlMs).toBe(1);
    expect(
      parseArgs(["host", "--authorization-ttl-ms", "2147483647"], {}, 42).authorizationTtlMs
    ).toBe(2147483647);
  });

  it("rejects zero authorization ttl", () => {
    expect(() => parseArgs(["host", "--authorization-ttl-ms", "0"], {}, 42)).toThrow(
      AgentShellUsageError
    );
  });

  it("parses bounded lifecycle timer delays", () => {
    for (const [option, property] of workflowTimerOptions) {
      expect(parseArgs(["host", `--${option}`, "0"], {}, 42)[property]).toBe(0);
      expect(parseArgs(["host", `--${option}`, "2147483647"], {}, 42)[property]).toBe(
        2147483647
      );
    }
  });

  it("rejects oversized workflow timer delays", () => {
    for (const [option] of [["authorization-ttl-ms"], ...workflowTimerOptions]) {
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

  it("rejects malformed audit log paths", () => {
    for (const auditLogPath of [
      "",
      "   ",
      " logs/agent-audit.jsonl",
      "logs/agent-audit.jsonl ",
      "logs/agent-audit\npath.jsonl",
      "logs/agent-audit\u202epath.jsonl",
      "logs/agent-audit\u200bpath.jsonl",
      "logs/agent-audit\ufeffpath.jsonl",
      "x".repeat(1025)
    ]) {
      expect(() => parseArgs(["host", "--audit-log", auditLogPath], {}, 42)).toThrow(
        AgentShellUsageError
      );
      expect(() =>
        parseArgs(["host"], { WINBRIDGE_AGENT_AUDIT_LOG_PATH: auditLogPath }, 42)
      ).toThrow(AgentShellUsageError);
    }
  });

  it("rejects invalid audit log paths without exposing raw path text", () => {
    for (const auditLogPath of [
      " logs/agent-audit-private-marker.jsonl ",
      "logs/agent-audit-private-marker\n.jsonl",
      "logs/agent-audit-private-marker\u202e.jsonl",
      "logs/agent-audit-private-marker\u200b.jsonl",
      "logs/agent-audit-private-marker\ufeff.jsonl",
      `logs/${"agent-audit-private-marker".repeat(43)}.jsonl`
    ]) {
      try {
        parseArgs(["host", "--audit-log", auditLogPath], {}, 42);
        throw new Error("Expected CLI audit log path to be rejected");
      } catch (error) {
        expect(error).toBeInstanceOf(AgentShellUsageError);
        expect((error as Error).message).not.toContain("agent-audit-private-marker");
        expect((error as Error).message).not.toContain(auditLogPath);
      }

      try {
        parseArgs(["host"], { WINBRIDGE_AGENT_AUDIT_LOG_PATH: auditLogPath }, 42);
        throw new Error("Expected environment audit log path to be rejected");
      } catch (error) {
        expect(error).toBeInstanceOf(AgentShellUsageError);
        expect((error as Error).message).not.toContain("agent-audit-private-marker");
        expect((error as Error).message).not.toContain(auditLogPath);
      }
    }
  });

  it("parses optional relay tokens", () => {
    expect(parseArgs(["host"], {}, 42).token).toBeUndefined();
    expect(parseArgs(["host", "--token", "dev-token"], {}, 42).token).toBe("dev-token");
    expect(parseArgs(["host", "--token", "x".repeat(1024)], {}, 42).token).toBe(
      "x".repeat(1024)
    );
  });

  it("rejects malformed relay tokens", () => {
    for (const token of [
      "",
      "   ",
      " dev-token",
      "dev-token ",
      "dev\ntoken",
      "dev\u202etoken",
      "dev\u200btoken",
      "dev\ufefftoken",
      "x".repeat(1025)
    ]) {
      expect(() => parseArgs(["host", "--token", token], {}, 42)).toThrow(
        AgentShellUsageError
      );
    }
  });

  it("rejects format-control relay tokens without exposing raw token text", () => {
    for (const token of ["agent-token\u202eprivate-marker", "agent-token\ufeffprivate-marker"]) {
      try {
        parseArgs(["host", "--token", token], {}, 42);
        throw new Error("Expected format-control relay token to be rejected");
      } catch (error) {
        expect(error).toBeInstanceOf(AgentShellUsageError);
        expect((error as Error).message).not.toContain("agent-token");
        expect((error as Error).message).not.toContain("private-marker");
        expect((error as Error).message).not.toContain(token);
      }
    }
  });

  it("rejects untrimmed relay tokens without exposing raw token text", () => {
    const token = " agent-token-private-marker ";

    try {
      parseArgs(["host", "--token", token], {}, 42);
      throw new Error("Expected untrimmed relay token to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentShellUsageError);
      expect((error as Error).message).not.toContain("agent-token-private-marker");
      expect((error as Error).message).not.toContain(token);
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
        "--grant",
        "screen:view",
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
        "Host terminated",
        "--disconnect-after-ms",
        "1500"
      ],
      { WINBRIDGE_AGENT_AUDIT_LOG_PATH: "logs/audit.jsonl" },
      42
    );

    expect(args).toMatchObject({
      auditLogPath: "logs/audit.jsonl",
        requestedPermissions: ["screen:view", "input:pointer"],
        hostGrantPermissions: ["screen:view"],
        hostDecision: "approve",
        hostConsentPrompt: false,
        visibleToHost: true,
      authorizationTtlMs: 600000,
      hostRevokePermission: "input:pointer",
      hostRevokeReason: "Host revoked pointer",
      hostPauseReason: "Host paused",
      hostResumeReason: "Host resumed",
      hostTerminateReason: "Host terminated",
      hostDisconnectAfterMs: 1500
    });
  });
});
