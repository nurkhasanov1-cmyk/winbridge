import { describe, expect, it } from "vitest";
import { AGENT_SHELL_USAGE, AgentShellUsageError } from "./args.js";
import { formatAgentShellCliError } from "./cli-diagnostics.js";

describe("agent shell CLI diagnostics", () => {
  it("formats unexpected Error output without raw text or stack", () => {
    const rawMessage = "startup failed with raw-token at C:\\Users\\Nur\\secret";
    const error = new Error(rawMessage);
    error.stack = `Error: ${rawMessage}\n    at C:\\Users\\Nur\\secret\\agent.ts:1:1`;

    const output = formatAgentShellCliError(error);

    expect(output).toBe(`[winbridge-agent] error messageBytes=${Buffer.byteLength(rawMessage)}`);
    expect(output).not.toContain(rawMessage);
    expect(output).not.toContain("raw-token");
    expect(output).not.toContain("C:\\Users\\Nur");
    expect(output).not.toContain("agent.ts");
  });

  it("formats thrown string output without raw text", () => {
    const rawMessage = "shutdown failed with raw-token";
    const output = formatAgentShellCliError(rawMessage);

    expect(output).toBe(`[winbridge-agent] error messageBytes=${Buffer.byteLength(rawMessage)}`);
    expect(output).not.toContain(rawMessage);
    expect(output).not.toContain("raw-token");
  });

  it("preserves static usage errors without user-provided values", () => {
    const output = formatAgentShellCliError(new AgentShellUsageError());

    expect(output).toBe(AGENT_SHELL_USAGE);
    expect(output).not.toContain("raw-user-token");
    expect(output).not.toContain("C:\\Users\\Nur\\secret");
  });
});
