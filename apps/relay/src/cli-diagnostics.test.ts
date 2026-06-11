import { describe, expect, it } from "vitest";
import { formatRelayCliError } from "./cli-diagnostics.js";

describe("relay CLI diagnostics", () => {
  it("formats unexpected Error output without raw text or stack", () => {
    const rawMessage = "startup failed with raw-token at C:\\Users\\Nur\\secret";
    const error = new Error(rawMessage);
    error.stack = `Error: ${rawMessage}\n    at C:\\Users\\Nur\\secret\\relay.ts:1:1`;

    const output = formatRelayCliError(error);

    expect(output).toBe(`[winbridge-relay] error messageBytes=${Buffer.byteLength(rawMessage)}`);
    expect(output).not.toContain(rawMessage);
    expect(output).not.toContain("raw-token");
    expect(output).not.toContain("C:\\Users\\Nur");
    expect(output).not.toContain("relay.ts");
  });

  it("formats thrown string output without raw text", () => {
    const rawMessage = "shutdown failed with raw-token";
    const output = formatRelayCliError(rawMessage);

    expect(output).toBe(`[winbridge-relay] error messageBytes=${Buffer.byteLength(rawMessage)}`);
    expect(output).not.toContain(rawMessage);
    expect(output).not.toContain("raw-token");
  });
});
