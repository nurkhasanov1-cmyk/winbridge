import { PassThrough, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
  formatHostControlHelp,
  formatHostControlStatus,
  parseHostControlCommand,
  startInteractiveHostControlPrompt
} from "./host-control-prompt.js";
import type { AgentShellRuntime } from "./runtime.js";

describe("interactive host control prompt", () => {
  it("parses exact host control commands", () => {
    expect(parseHostControlCommand("help")).toEqual({ action: "help" });
    expect(parseHostControlCommand("status")).toEqual({ action: "status" });
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
      " help",
      "help ",
      "Help",
      "help raw-token",
      " status",
      "status ",
      "Status",
      "status raw-token",
      " pause",
      "pause ",
      "Pause",
      "revoke",
      "revoke ",
      "revoke diagnostics:view",
      "revoke file-transfer",
      "revoke input:keylogger",
      "revoke screen:view raw-token",
      "terminate raw-token",
      "disconnect raw-token",
      "raw-token"
    ]) {
      expect(parseHostControlCommand(line)).toBeUndefined();
    }
  });

  it("dispatches accepted non-terminal commands through runtime controls", async () => {
    const runtime = createRuntimeSpy();
    const output = createCapturingOutput();
    const input = PassThrough.from(["pause\n", "resume\n", "revoke screen:view\n"]);

    startInteractiveHostControlPrompt(runtime, { input, output });
    await waitForText(output, (text) => countMatches(text, "host control accepted") === 3);

    expect(runtime.pause).toHaveBeenCalledTimes(1);
    expect(runtime.resume).toHaveBeenCalledTimes(1);
    expect(runtime.revokePermission).toHaveBeenCalledWith("screen:view");
    expect(runtime.terminate).not.toHaveBeenCalled();
    expect(runtime.disconnect).not.toHaveBeenCalled();
    expect(runtime.leave).not.toHaveBeenCalled();
    expect(runtime.send).not.toHaveBeenCalled();
    expect(output.text()).not.toContain("screen:view");
    expect(output.text()).not.toContain("123-456");
    expect(output.text()).not.toContain("raw-token");
  });

  it("prints host status without invoking controls or public sends", async () => {
    const runtime = createRuntimeSpy();
    vi.mocked(runtime.getHostStatus).mockReturnValue({
      state: "active",
      authorizationStatus: "active",
      authorizationId: "authz_status_1",
      visibleToHost: true,
      permissionCount: 1
    });
    const output = createCapturingOutput();

    startInteractiveHostControlPrompt(runtime, {
      input: PassThrough.from(["status\n"]),
      output
    });
    await waitForText(output, (text) => text.includes("[winbridge-agent] host status"));

    expect(runtime.getHostStatus).toHaveBeenCalledTimes(1);
    expect(runtime.pause).not.toHaveBeenCalled();
    expect(runtime.resume).not.toHaveBeenCalled();
    expect(runtime.revokePermission).not.toHaveBeenCalled();
    expect(runtime.terminate).not.toHaveBeenCalled();
    expect(runtime.disconnect).not.toHaveBeenCalled();
    expect(runtime.leave).not.toHaveBeenCalled();
    expect(runtime.send).not.toHaveBeenCalled();
    expect(output.text()).toContain("state=active");
    expect(output.text()).toContain("authorizationStatus=active");
    expect(output.text()).toContain("authorizationId=authz_status_1");
    expect(output.text()).toContain("visibleToHost=true");
    expect(output.text()).toContain("permissionCount=1");
    expect(output.text()).not.toContain("screen:view");
    expect(output.text()).not.toContain("Viewer Support");
    expect(output.text()).not.toContain("raw-token");
  });

  it("prints inactive cause metadata without invoking controls or public sends", async () => {
    const runtime = createRuntimeSpy();
    vi.mocked(runtime.getHostStatus).mockReturnValue({
      state: "inactive",
      authorizationStatus: "active",
      authorizationId: "authz_status_1",
      visibleToHost: false,
      permissionCount: 0,
      inactiveCause: "peer-disconnected"
    });
    const output = createCapturingOutput();

    startInteractiveHostControlPrompt(runtime, {
      input: PassThrough.from(["status\n"]),
      output
    });
    await waitForText(output, (text) => text.includes("inactiveCause=peer-disconnected"));

    expect(runtime.getHostStatus).toHaveBeenCalledTimes(1);
    expect(runtime.pause).not.toHaveBeenCalled();
    expect(runtime.resume).not.toHaveBeenCalled();
    expect(runtime.revokePermission).not.toHaveBeenCalled();
    expect(runtime.terminate).not.toHaveBeenCalled();
    expect(runtime.disconnect).not.toHaveBeenCalled();
    expect(runtime.leave).not.toHaveBeenCalled();
    expect(runtime.send).not.toHaveBeenCalled();
    expect(output.text()).toContain("state=inactive");
    expect(output.text()).toContain("visibleToHost=false");
    expect(output.text()).toContain("permissionCount=0");
    expect(output.text()).not.toContain("viewer-1");
    expect(output.text()).not.toContain("Viewer Support");
    expect(output.text()).not.toContain("Host closed session");
    expect(output.text()).not.toContain("raw-token");
  });

  it("prints host help without reading status, invoking controls, or public sends", async () => {
    const runtime = createRuntimeSpy();
    const output = createCapturingOutput();

    startInteractiveHostControlPrompt(runtime, {
      input: PassThrough.from(["help\n"]),
      output
    });
    await waitForText(output, (text) => text.includes("[winbridge-agent] host control help"));

    expect(runtime.getHostStatus).not.toHaveBeenCalled();
    expect(runtime.pause).not.toHaveBeenCalled();
    expect(runtime.resume).not.toHaveBeenCalled();
    expect(runtime.revokePermission).not.toHaveBeenCalled();
    expect(runtime.terminate).not.toHaveBeenCalled();
    expect(runtime.disconnect).not.toHaveBeenCalled();
    expect(runtime.leave).not.toHaveBeenCalled();
    expect(runtime.send).not.toHaveBeenCalled();
    expect(output.text()).toContain("commands=help,status,pause,resume,revoke screen:view,terminate,disconnect");
    expect(output.text()).not.toContain("123-456");
    expect(output.text()).not.toContain("Viewer Support");
    expect(output.text()).not.toContain("raw-token");
  });

  it("stops the prompt after successful host disconnect", async () => {
    const runtime = createRuntimeSpy();
    const output = createCapturingOutput();
    const input = new PassThrough();

    const handle = startInteractiveHostControlPrompt(runtime, { input, output });
    try {
      input.write("disconnect\n");
      await waitForText(output, (text) => text.includes("host control accepted action=disconnect"));

      input.write("status\n");
      await waitForSettledPromptInput();

      expect(runtime.disconnect).toHaveBeenCalledTimes(1);
      expect(runtime.getHostStatus).not.toHaveBeenCalled();
      expect(runtime.pause).not.toHaveBeenCalled();
      expect(runtime.resume).not.toHaveBeenCalled();
      expect(runtime.revokePermission).not.toHaveBeenCalled();
      expect(runtime.terminate).not.toHaveBeenCalled();
      expect(runtime.leave).not.toHaveBeenCalled();
      expect(runtime.send).not.toHaveBeenCalled();
      expect(output.text()).not.toContain("[winbridge-agent] host status");
      expect(output.text()).not.toContain("raw-token");
    } finally {
      handle.stop();
      input.end();
    }
  });

  it("stops the prompt after successful host terminate", async () => {
    const runtime = createRuntimeSpy();
    const output = createCapturingOutput();
    const input = new PassThrough();

    const handle = startInteractiveHostControlPrompt(runtime, { input, output });
    try {
      input.write("terminate\n");
      await waitForText(output, (text) => text.includes("host control accepted action=terminate"));

      input.write("status\n");
      await waitForSettledPromptInput();

      expect(runtime.terminate).toHaveBeenCalledTimes(1);
      expect(runtime.getHostStatus).not.toHaveBeenCalled();
      expect(runtime.pause).not.toHaveBeenCalled();
      expect(runtime.resume).not.toHaveBeenCalled();
      expect(runtime.revokePermission).not.toHaveBeenCalled();
      expect(runtime.disconnect).not.toHaveBeenCalled();
      expect(runtime.leave).not.toHaveBeenCalled();
      expect(runtime.send).not.toHaveBeenCalled();
      expect(output.text()).not.toContain("[winbridge-agent] host status");
      expect(output.text()).not.toContain("raw-token");
    } finally {
      handle.stop();
      input.end();
    }
  });

  it("keeps the prompt available after failed host terminate", async () => {
    const rawErrorMessage = "terminate failed with raw-token at C:\\Users\\Nur\\secret";
    const runtime = createRuntimeSpy();
    vi.mocked(runtime.terminate).mockImplementation(() => {
      throw new Error(rawErrorMessage);
    });
    vi.mocked(runtime.getHostStatus).mockReturnValue({
      state: "inactive",
      visibleToHost: false,
      permissionCount: 0,
      inactiveCause: "terminated"
    });
    const output = createCapturingOutput();
    const input = new PassThrough();

    const handle = startInteractiveHostControlPrompt(runtime, { input, output });
    try {
      input.write("terminate\n");
      await waitForText(output, (text) => text.includes("[winbridge-agent] error messageBytes="));
      input.write("status\n");
      await waitForText(output, (text) => text.includes("inactiveCause=terminated"));

      expect(runtime.terminate).toHaveBeenCalledTimes(1);
      expect(runtime.getHostStatus).toHaveBeenCalledTimes(1);
      expect(runtime.pause).not.toHaveBeenCalled();
      expect(runtime.resume).not.toHaveBeenCalled();
      expect(runtime.revokePermission).not.toHaveBeenCalled();
      expect(runtime.disconnect).not.toHaveBeenCalled();
      expect(runtime.leave).not.toHaveBeenCalled();
      expect(runtime.send).not.toHaveBeenCalled();
      expect(output.text()).toContain(`[winbridge-agent] error messageBytes=${Buffer.byteLength(rawErrorMessage)}`);
      expect(output.text()).not.toContain(rawErrorMessage);
      expect(output.text()).not.toContain("raw-token");
      expect(output.text()).not.toContain("C:\\Users\\Nur");
    } finally {
      handle.stop();
      input.end();
    }
  });

  it("keeps the prompt available after failed host disconnect", async () => {
    const rawErrorMessage = "disconnect failed with raw-token at C:\\Users\\Nur\\secret";
    const runtime = createRuntimeSpy();
    vi.mocked(runtime.disconnect).mockImplementation(() => {
      throw new Error(rawErrorMessage);
    });
    vi.mocked(runtime.getHostStatus).mockReturnValue({
      state: "inactive",
      visibleToHost: false,
      permissionCount: 0,
      inactiveCause: "local-disconnect"
    });
    const output = createCapturingOutput();
    const input = new PassThrough();

    const handle = startInteractiveHostControlPrompt(runtime, { input, output });
    try {
      input.write("disconnect\n");
      await waitForText(output, (text) => text.includes("[winbridge-agent] error messageBytes="));
      input.write("status\n");
      await waitForText(output, (text) => text.includes("inactiveCause=local-disconnect"));

      expect(runtime.disconnect).toHaveBeenCalledTimes(1);
      expect(runtime.getHostStatus).toHaveBeenCalledTimes(1);
      expect(runtime.pause).not.toHaveBeenCalled();
      expect(runtime.resume).not.toHaveBeenCalled();
      expect(runtime.revokePermission).not.toHaveBeenCalled();
      expect(runtime.terminate).not.toHaveBeenCalled();
      expect(runtime.leave).not.toHaveBeenCalled();
      expect(runtime.send).not.toHaveBeenCalled();
      expect(output.text()).toContain(`[winbridge-agent] error messageBytes=${Buffer.byteLength(rawErrorMessage)}`);
      expect(output.text()).not.toContain(rawErrorMessage);
      expect(output.text()).not.toContain("raw-token");
      expect(output.text()).not.toContain("C:\\Users\\Nur");
    } finally {
      handle.stop();
      input.end();
    }
  });

  it("formats inactive host status without undefined fields", () => {
    expect(
      formatHostControlStatus({
        state: "inactive",
        visibleToHost: false,
        permissionCount: 0
      })
    ).toBe("[winbridge-agent] host status state=inactive visibleToHost=false permissionCount=0\n");
  });

  it("formats inactive host status with bounded inactive cause", () => {
    expect(
      formatHostControlStatus({
        state: "inactive",
        authorizationStatus: "active",
        authorizationId: "authz_status_1",
        visibleToHost: false,
        permissionCount: 0,
        inactiveCause: "peer-disconnected"
      })
    ).toBe(
      "[winbridge-agent] host status state=inactive visibleToHost=false permissionCount=0 authorizationStatus=active authorizationId=authz_status_1 inactiveCause=peer-disconnected\n"
    );
  });

  it("formats host help as a bounded static command list", () => {
    expect(formatHostControlHelp()).toBe(
      "[winbridge-agent] host control help commands=help,status,pause,resume,revoke screen:view,terminate,disconnect\n"
    );
  });

  it("rejects malformed commands without invoking runtime controls or echoing input", async () => {
    const runtime = createRuntimeSpy();
    const output = createCapturingOutput();
    const input = PassThrough.from([
      " help\n",
      "Help\n",
      " pause\n",
      "revoke diagnostics:view\n",
      "revoke input:keylogger\n",
      "disconnect raw-token\n",
      "help raw-token\n",
      "raw-token\n"
    ]);

    startInteractiveHostControlPrompt(runtime, { input, output });
    await waitForText(output, (text) => countMatches(text, "host control rejected") === 8);

    expect(runtime.getHostStatus).not.toHaveBeenCalled();
    expect(runtime.pause).not.toHaveBeenCalled();
    expect(runtime.resume).not.toHaveBeenCalled();
    expect(runtime.revokePermission).not.toHaveBeenCalled();
    expect(runtime.terminate).not.toHaveBeenCalled();
    expect(runtime.disconnect).not.toHaveBeenCalled();
    expect(runtime.leave).not.toHaveBeenCalled();
    expect(output.text()).not.toContain("diagnostics:view");
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
    expect(runtime.leave).not.toHaveBeenCalled();
  });
});

function createRuntimeSpy(): AgentShellRuntime {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    leave: vi.fn(),
    getHostStatus: vi.fn(() => ({
      state: "inactive",
      visibleToHost: false,
      permissionCount: 0
    })),
    getViewerStatus: vi.fn(() => ({
      state: "inactive",
      visibleToHost: false,
      permissionCount: 0
    })),
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

async function waitForSettledPromptInput(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 25));
}
