import { Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { formatViewerStatus, scheduleViewerStatusPrint } from "./viewer-status.js";
import type { AgentShellRuntime } from "./runtime.js";

describe("viewer status print", () => {
  it("formats inactive viewer status without undefined fields", () => {
    expect(
      formatViewerStatus({
        state: "inactive",
        visibleToHost: false,
        permissionCount: 0
      })
    ).toBe("[winbridge-agent] viewer status state=inactive visibleToHost=false permissionCount=0\n");
  });

  it("formats active viewer status with bounded authorization metadata", () => {
    expect(
      formatViewerStatus({
        state: "active",
        authorizationStatus: "active",
        authorizationId: "authz_viewer_status_1",
        visibleToHost: true,
        permissionCount: 2
      })
    ).toBe(
      "[winbridge-agent] viewer status state=active visibleToHost=true permissionCount=2 authorizationStatus=active authorizationId=authz_viewer_status_1\n"
    );
  });

  it("formats trusted remote disconnect status with bounded reason code metadata", () => {
    const formatted = formatViewerStatus({
      state: "inactive",
      authorizationStatus: "active",
      authorizationId: "authz_viewer_status_1",
      visibleToHost: false,
      permissionCount: 0,
      remoteDisconnectReasonCode: "heartbeat-timeout"
    });

    expect(formatted).toBe(
      "[winbridge-agent] viewer status state=inactive visibleToHost=false permissionCount=0 authorizationStatus=active authorizationId=authz_viewer_status_1 remoteDisconnectReasonCode=heartbeat-timeout\n"
    );
    expect(formatted).not.toContain("host-1");
    expect(formatted).not.toContain("Host closed session");
    expect(formatted).not.toContain("raw-token");
  });

  it("prints viewer status after the configured delay without invoking controls or public sends", async () => {
    vi.useFakeTimers();
    try {
      const runtime = createRuntimeSpy();
      vi.mocked(runtime.getViewerStatus).mockReturnValue({
        state: "active",
        authorizationStatus: "active",
        authorizationId: "authz_viewer_status_1",
        visibleToHost: true,
        permissionCount: 1
      });
      const output = createCapturingOutput();

      const handle = scheduleViewerStatusPrint(runtime, 25, { output });

      await vi.advanceTimersByTimeAsync(24);
      expect(output.text()).toBe("");

      await vi.advanceTimersByTimeAsync(1);
      expect(runtime.getViewerStatus).toHaveBeenCalledTimes(1);
      expect(runtime.getHostStatus).not.toHaveBeenCalled();
      expect(runtime.leave).not.toHaveBeenCalled();
      expect(runtime.stop).not.toHaveBeenCalled();
      expect(runtime.pause).not.toHaveBeenCalled();
      expect(runtime.resume).not.toHaveBeenCalled();
      expect(runtime.revokePermission).not.toHaveBeenCalled();
      expect(runtime.terminate).not.toHaveBeenCalled();
      expect(runtime.disconnect).not.toHaveBeenCalled();
      expect(runtime.send).not.toHaveBeenCalled();
      expect(output.text()).toContain("[winbridge-agent] viewer status");
      expect(output.text()).toContain("state=active");
      expect(output.text()).toContain("visibleToHost=true");
      expect(output.text()).toContain("permissionCount=1");
      expect(output.text()).toContain("authorizationStatus=active");
      expect(output.text()).toContain("authorizationId=authz_viewer_status_1");
      expect(output.text()).not.toContain("screen:view");
      expect(output.text()).not.toContain("Viewer Support");
      expect(output.text()).not.toContain("raw-token");

      handle.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops before printing status", async () => {
    vi.useFakeTimers();
    try {
      const runtime = createRuntimeSpy();
      const output = createCapturingOutput();

      const handle = scheduleViewerStatusPrint(runtime, 10, { output });
      handle.stop();
      await vi.advanceTimersByTimeAsync(10);

      expect(runtime.getViewerStatus).not.toHaveBeenCalled();
      expect(output.text()).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("formats runtime failures without raw exception text", async () => {
    vi.useFakeTimers();
    try {
      const rawErrorMessage = "viewer status failed with raw-token at C:\\Users\\Nur\\secret";
      const runtime = createRuntimeSpy();
      vi.mocked(runtime.getViewerStatus).mockImplementation(() => {
        throw new Error(rawErrorMessage);
      });
      const output = createCapturingOutput();

      scheduleViewerStatusPrint(runtime, 0, { output });
      await vi.advanceTimersByTimeAsync(0);

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
