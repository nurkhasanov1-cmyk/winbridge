import { describe, expect, it } from "vitest";
import {
  createRelayHeartbeatConfig,
  createRelayHeartbeatState,
  isHeartbeatTimedOut,
  markHeartbeatPing,
  markHeartbeatPong,
  normalizeRelayHeartbeatConfig
} from "./heartbeat.js";

describe("relay heartbeat", () => {
  it("uses enabled development defaults when environment is omitted", () => {
    expect(createRelayHeartbeatConfig({})).toEqual({
      intervalMs: 30_000,
      timeoutMs: 10_000
    });
  });

  it("can be disabled through development environment", () => {
    expect(
      createRelayHeartbeatConfig({
        WINBRIDGE_RELAY_HEARTBEAT_ENABLED: "false"
      })
    ).toBe(false);
  });

  it("validates injected heartbeat settings", () => {
    expect(() => normalizeRelayHeartbeatConfig({ intervalMs: 0, timeoutMs: 1 })).toThrow(
      "Heartbeat interval must be a positive integer"
    );
    expect(() => normalizeRelayHeartbeatConfig({ intervalMs: 1, timeoutMs: 0 })).toThrow(
      "Heartbeat timeout must be a positive integer"
    );
  });

  it("tracks ping, pong, and timeout state", () => {
    const initial = createRelayHeartbeatState(1_000);
    const pinged = markHeartbeatPing(initial, 2_000);

    expect(isHeartbeatTimedOut(pinged, 2_999, 1_000)).toBe(false);
    expect(isHeartbeatTimedOut(pinged, 3_000, 1_000)).toBe(true);

    const ponged = markHeartbeatPong(pinged, 2_500);
    expect(isHeartbeatTimedOut(ponged, 4_000, 1_000)).toBe(false);
    expect(ponged.lastPongAt).toBe(2_500);
  });
});
