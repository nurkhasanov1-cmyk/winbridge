import { PassThrough, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
  parseHostControlCommand,
  startInteractiveHostControlPrompt
} from "./host-control-prompt.js";
import type { AgentShellRuntime } from "./runtime.js";

describe("interactive host control prompt", () => {
  it("parses exact host control commands", () => {
    expect(parseHostControlCommand("pause")).toEqual({ action: "pause" });
    expect(parseHostControlCommand("resume")).toEqual({ action: "resume" });
    expect(parseHostControlCommand("terminate")).toEqual({ action: "terminate" });
    expect(parseHostControlCommand("disconnect")).toEqual({ action: "disconnect" });
    expect(parseHostControlCommand("revoke screen:view")).toEqual({
      action: "revoke",
      permission: "screen:view"
    });
  });

  it("rejects malformed or unsafe command lines", () => {
    for (const line of [
      "",
      " pause",
      "pause ",
      "Pause",
      "revoke",
      "revoke ",
      "revoke input:keylogger",
      "revoke screen:view raw-token",
      "disconnect raw-token",
      "raw-token"
    ]) {
      expect(parseHostControlCommand(line)).toBeUndefined();
    }
  });

  it("dispatches accepted commands through runtime controls", async () => {
    const runtime = createRuntimeSpy();
    const output = createCapturingOutput();
    const input = PassThrough.from([
      "pause\n",
      "resume\n",
      "revoke screen:view\n",
      "terminate\n",
      "disconnect\n"
    ]);

    startInteractiveHostControlPrompt(runtime, { input, output });
    await waitForText(output, (text) => countMatches(text, "host control accepted") === 5);

    expect(runtime.pause).toHaveBeenCalledTimes(1);
    expect(runtime.resume).toHaveBeenCalledTimes(1);
    expect(runtime.revokePermission).toHaveBeenCalledWith("screen:view");
    expect(runtime.terminate).toHaveBeenCalledTimes(1);
    expect(runtime.disconnect).toHaveBeenCalledTimes(1);
    expect(runtime.send).not.toHaveBeenCalled();
    expect(output.text()).not.toContain("screen:view");
    expect(output.text()).not.toContain("123-456");
    expect(output.text()).not.toContain("raw-token");
  });

  it("rejects malformed commands without invoking runtime controls or echoing input", async () => {
    const runtime = createRuntimeSpy();
    const output = createCapturingOutput();
    const input = PassThrough.from([
      " pause\n",
      "revoke input:keylogger\n",
      "disconnect raw-token\n",
      "raw-token\n"
    ]);

    startInteractiveHostControlPrompt(runtime, { input, output });
    await waitForText(output, (text) => countMatches(text, "host control rejected") === 4);

    expect(runtime.pause).not.toHaveBeenCalled();
    expect(runtime.resume).not.toHaveBeenCalled();
    expect(runtime.revokePermission).not.toHaveBeenCalled();
    expect(runtime.terminate).not.toHaveBeenCalled();
    expect(runtime.disconnect).not.toHaveBeenCalled();
    expect(output.text()).not.toContain("input:keylogger");
    expect(output.text()).not.toContain("raw-token");
  });

  it("formats runtime failures without raw exception text", async () => {
    const rawErrorMessage = "pause failed with raw-token at C:\\Users\\Nur\\secret";
    const runtime = createRuntimeSpy();
    vi.mocked(runtime.pause).mockImplementation(() => {
      throw new Error(rawErrorMessage);
    });
    const output = createCapturingOutput();

    startInteractiveHostControlPrompt(runtime, {
      input: PassThrough.from(["pause\n"]),
      output
    });
    await waitForText(output, (text) => text.includes("[winbridge-agent] error messageBytes="));

    expect(output.text()).toContain(`[winbridge-agent] error messageBytes=${Buffer.byteLength(rawErrorMessage)}`);
    expect(output.text()).not.toContain(rawErrorMessage);
    expect(output.text()).not.toContain("raw-token");
    expect(output.text()).not.toContain("C:\\Users\\Nur");
  });

  it("stops without invoking controls when stdin closes", async () => {
    const runtime = createRuntimeSpy();
    const output = createCapturingOutput();

    startInteractiveHostControlPrompt(runtime, {
      input: PassThrough.from([]),
      output
    });
    await waitForText(output, (text) => text.includes("host control prompt stopped"));

    expect(runtime.pause).not.toHaveBeenCalled();
    expect(runtime.resume).not.toHaveBeenCalled();
    expect(runtime.revokePermission).not.toHaveBeenCalled();
    expect(runtime.terminate).not.toHaveBeenCalled();
    expect(runtime.disconnect).not.toHaveBeenCalled();
  });
});

function createRuntimeSpy(): AgentShellRuntime {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    disconnect: vi.fn(),
    pause: vi.fn(),
    revokePermission: vi.fn(),
    resume: vi.fn(),
    terminate: vi.fn(),
    send: vi.fn()
  };
}

function createCapturingOutput(): Writable & { text(): string } {
  const chunks: Buffer[] = [];
  const output = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    }
  }) as Writable & { text(): string };

  output.text = () => Buffer.concat(chunks).toString("utf8");

  return output;
}

async function waitForText(
  output: { text(): string },
  predicate: (text: string) => boolean
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate(output.text())) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  throw new Error(`Timed out waiting for output. Current output: ${output.text()}`);
}

function countMatches(text: string, pattern: string): number {
  return text.split(pattern).length - 1;
}
