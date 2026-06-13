import { Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { scheduleViewerLocalDisconnect } from "./viewer-disconnect.js";
import type { AgentShellRuntime } from "./runtime.js";

describe("viewer local disconnect", () => {
  it("stops the local runtime after the configured delay without invoking controls or public sends", async () => {
    vi.useFakeTimers();
    try {
      const runtime = createRuntimeSpy();
      const output = createCapturingOutput();

      const handle = scheduleViewerLocalDisconnect(runtime, 25, { output });

      await vi.advanceTimersByTimeAsync(24);
      expect(runtime.stop).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();

      expect(runtime.stop).toHaveBeenCalledTimes(1);
      expect(runtime.getHostStatus).not.toHaveBeenCalled();
      expect(runtime.getViewerStatus).not.toHaveBeenCalled();
      expect(runtime.pause).not.toHaveBeenCalled();
      expect(runtime.resume).not.toHaveBeenCalled();
      expect(runtime.revokePermission).not.toHaveBeenCalled();
      expect(runtime.terminate).not.toHaveBeenCalled();
      expect(runtime.disconnect).not.toHaveBeenCalled();
      expect(runtime.send).not.toHaveBeenCalled();
      expect(output.text()).toBe("");

      handle.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops before closing the local runtime", async () => {
    vi.useFakeTimers();
    try {
      const runtime = createRuntimeSpy();
      const output = createCapturingOutput();

      const handle = scheduleViewerLocalDisconnect(runtime, 10, { output });
      handle.stop();
      await vi.advanceTimersByTimeAsync(10);

      expect(runtime.stop).not.toHaveBeenCalled();
      expect(output.text()).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("formats stop failures without raw exception text", async () => {
    vi.useFakeTimers();
    try {
      const rawErrorMessage = "viewer disconnect failed with raw-token at C:\\Users\\Nur\\secret";
      const runtime = createRuntimeSpy();
      vi.mocked(runtime.stop).mockRejectedValue(new Error(rawErrorMessage));
      const output = createCapturingOutput();

      scheduleViewerLocalDisconnect(runtime, 0, { output });
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      expect(output.text()).toContain(
        `[winbridge-agent] error messageBytes=${Buffer.byteLength(rawErrorMessage)}`
      );
      expect(output.text()).not.toContain(rawErrorMessage);
      expect(output.text()).not.toContain("raw-token");
      expect(output.text()).not.toContain("C:\\Users\\Nur");
    } finally {
      vi.useRealTimers();
    }
  });
});

function createRuntimeSpy(): AgentShellRuntime {
  return {
    start: vi.fn(),
    stop: vi.fn(async () => undefined),
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
